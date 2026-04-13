// Scene Allocator — dynamic clip-budget allocator that runs as
// Pipeline Stage 3.6, between runPreflightQA and runGenerationWithQC.
//
// Spec: docs/SCENE-ALLOCATION-PLAN.md + docs/WALKTHROUGH-ROADMAP.md R1
//
// v1 scope (this file):
//   - Reads the scenes the director already produced, scores each
//     against a dynamic room-specific threshold, and marks eligibility.
//   - Enforces per-room min/max quotas against the director's output.
//     Rooms over quota have their lowest-scored scenes trimmed.
//     Rooms under their min get a fallback flag (no gap-fill scene
//     insertion in v1 — that's v2).
//   - Enforces the 60-second (= 12 × 5s) total duration cap by
//     trimming scenes lowest-QA-first from low-importance rooms.
//   - Persists per-scene allocation bookkeeping (allocation_reason,
//     source_photo_qa_score, dynamic_qa_threshold, trimmed,
//     trimmed_reason) and per-room allocation_decisions rows.
//   - Updates properties.allocation_summary (rollup) and
//     allocation_warnings.
//
// v2 (deferred, not this file):
//   - Insert brand-new scenes via a scoped second director call when
//     a room is short of its minimum.
//   - Redistribute bonus clips from surplus rooms with room-specific
//     alternate camera movements.
//   - Coverage enforcer gap-fill (R2).

import type { Photo, RoomType, Scene } from "./types.js";
import { getSupabase, log } from "./db.js";

// ─── Configuration ───────────────────────────────────────────────

// Per-room base thresholds. Reflective/glassy/high-detail rooms get
// higher bars because that's where Runway/Kling most often hallucinate.
const BASE_THRESHOLD: Record<RoomType, number> = {
  kitchen: 7.5,
  living_room: 8.0,
  master_bedroom: 6.5,
  bedroom: 6.0,
  bathroom: 7.5,
  exterior_front: 7.0,
  exterior_back: 7.0,
  aerial: 6.5,
  pool: 8.0,
  dining: 7.0,
  hallway: 7.5,
  foyer: 7.0,
  garage: 6.0,
  other: 7.0,
};

const THRESHOLD_MIN = 5.0;
const THRESHOLD_MAX = 8.5;

// Per-room quotas. Range = [min, max]. Only applied for rooms the
// director actually produced scenes for — rooms with zero director
// scenes get skipped (not gap-filled in v1).
const QUOTA: Record<RoomType, { min: number; max: number }> = {
  exterior_front: { min: 1, max: 3 },
  exterior_back: { min: 0, max: 2 },
  aerial: { min: 0, max: 2 },
  living_room: { min: 1, max: 2 },
  kitchen: { min: 1, max: 2 },
  dining: { min: 0, max: 1 },
  master_bedroom: { min: 1, max: 2 },
  bedroom: { min: 0, max: 2 },
  bathroom: { min: 0, max: 2 },
  pool: { min: 0, max: 2 },
  hallway: { min: 0, max: 2 },
  foyer: { min: 0, max: 2 },
  garage: { min: 0, max: 1 },
  other: { min: 0, max: 2 },
};

// Used for trim-order tiebreaking when the 60s cap is hit. Higher =
// more hero (trim last). Lower = more expendable (trim first).
const ROOM_IMPORTANCE: Record<RoomType, number> = {
  living_room: 10,
  kitchen: 10,
  master_bedroom: 8,
  exterior_front: 8,
  pool: 8,
  bathroom: 5,
  bedroom: 5,
  dining: 4,
  exterior_back: 3,
  aerial: 3,
  foyer: 2,
  hallway: 2,
  garage: 1,
  other: 1,
};

// 60s total duration cap / 5s per clip = 12 clips max.
const DURATION_CAP_SECONDS = 60;
const SCENE_DURATION_SECONDS = 5;
const MAX_SCENES_TOTAL = DURATION_CAP_SECONDS / SCENE_DURATION_SECONDS; // 12

// ─── Threshold math ──────────────────────────────────────────────

// Features that make a photo harder to generate — raises the eligibility bar.
const COMPLEXITY_FEATURE_TERMS = [
  "floor_to_ceiling_window",
  "floor-to-ceiling",
  "mirror_wall",
  "glass_railing",
  "chandelier",
  "open_concept",
  "reflective_floor",
];

/**
 * Per-photo stability proxy used by the allocator. v1 uses the photo's
 * aesthetic_score as a rough stand-in for the real pre-flight QA stability
 * score. When runPreflightQA is extended to persist per-scene stability
 * scores, swap this for the persisted value.
 */
export function stabilityProxy(photo: Photo): number {
  if (photo.aesthetic_score !== null && photo.aesthetic_score !== undefined) {
    return photo.aesthetic_score;
  }
  if (photo.quality_score !== null && photo.quality_score !== undefined) {
    return photo.quality_score;
  }
  return 5.0;
}

/**
 * Dynamic threshold formula from docs/SCENE-ALLOCATION-PLAN.md §3.
 *   threshold = base(room_type)
 *             + complexity_bump(photo)
 *             - simplicity_discount(photo)
 * Clamped to [5.0, 8.5].
 */
export function dynamicThreshold(photo: Photo): number {
  const rt = (photo.room_type ?? "other") as RoomType;
  let t = BASE_THRESHOLD[rt] ?? BASE_THRESHOLD.other;

  // complexity_bump
  if (photo.depth_rating === "high") t += 0.5;

  let featureBump = 0;
  for (const term of COMPLEXITY_FEATURE_TERMS) {
    if (photo.key_features?.some((f) => f.toLowerCase().includes(term))) {
      featureBump += 0.3;
    }
  }
  t += Math.min(featureBump, 1.0);

  if ((photo.quality_score ?? 10) < 6) t += 0.3;

  // simplicity_discount
  if (photo.depth_rating === "low") t -= 0.5;
  if (
    (photo.aesthetic_score ?? 0) >= 9 &&
    (photo.quality_score ?? 0) >= 8
  ) {
    t -= 0.5;
  }

  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, t));
}

// ─── Allocator ───────────────────────────────────────────────────

interface AllocationDecisionRow {
  property_id: string;
  room_type: RoomType;
  photos_present: number;
  photos_eligible: number;
  range_min: number;
  range_max: number;
  clips_assigned_first_pass: number;
  clips_added_by_redistribution: number;
  clips_trimmed_by_cap: number;
  final_clip_count: number;
  fallback_used: boolean;
  avg_photo_qa_score: number | null;
  best_photo_qa_score: number | null;
  threshold_applied: number | null;
  notes: string | null;
}

interface AllocationSummary {
  total_scenes_before: number;
  total_scenes_after: number;
  total_scenes_trimmed: number;
  total_duration_seconds: number;
  cap_trim_applied: boolean;
  rooms_with_fallback: RoomType[];
  rooms_under_quota: RoomType[];
  rooms_over_quota: RoomType[];
  health: "green" | "yellow" | "red";
}

interface AllocatorInputs {
  propertyId: string;
  scenes: Scene[];
  photos: Photo[];
}

interface AllocatorOutput {
  decisions: AllocationDecisionRow[];
  summary: AllocationSummary;
  warnings: string[];
  sceneUpdates: Array<{
    id: string;
    allocation_reason: string | null;
    source_photo_qa_score: number | null;
    dynamic_qa_threshold: number | null;
    trimmed: boolean;
    trimmed_reason: string | null;
  }>;
}

// Pure core. No DB calls. Makes this unit-testable and keeps the
// persistence layer separate from the algorithm.
export function allocateScenes(inputs: AllocatorInputs): AllocatorOutput {
  const photosById = new Map<string, Photo>();
  for (const p of inputs.photos) photosById.set(p.id, p);

  // 1. Annotate every scene with room, threshold, and stability score.
  interface Ann {
    scene: Scene;
    roomType: RoomType;
    stability: number;
    threshold: number;
    eligible: boolean;
    allocation_reason: string | null;
    trimmed: boolean;
    trimmed_reason: string | null;
  }

  const annotated: Ann[] = [];
  const orphanScenes: Scene[] = [];

  for (const scene of inputs.scenes) {
    const photo = photosById.get(scene.photo_id);
    if (!photo || !photo.room_type) {
      orphanScenes.push(scene);
      continue;
    }
    const stability = stabilityProxy(photo);
    const threshold = dynamicThreshold(photo);
    annotated.push({
      scene,
      roomType: photo.room_type as RoomType,
      stability,
      threshold,
      eligible: stability >= threshold,
      allocation_reason: null,
      trimmed: false,
      trimmed_reason: null,
    });
  }

  // 2. Group by room and sort desc by stability.
  const byRoom = new Map<RoomType, Ann[]>();
  for (const a of annotated) {
    const existing = byRoom.get(a.roomType) ?? [];
    existing.push(a);
    byRoom.set(a.roomType, existing);
  }
  for (const group of byRoom.values()) {
    group.sort((a, b) => b.stability - a.stability);
  }

  const warnings: string[] = [];
  const decisionsMap = new Map<RoomType, AllocationDecisionRow>();
  const roomsWithFallback: RoomType[] = [];
  const roomsUnderQuota: RoomType[] = [];
  const roomsOverQuota: RoomType[] = [];

  // 3. First-pass quota enforcement per room.
  for (const [roomType, scenes] of byRoom.entries()) {
    const quota = QUOTA[roomType] ?? { min: 0, max: 2 };
    const eligibleCount = scenes.filter((s) => s.eligible).length;

    // Trim anything above max (lowest-stability first).
    if (scenes.length > quota.max) {
      roomsOverQuota.push(roomType);
      // Sort ascending to trim the weakest first.
      const ascending = [...scenes].sort((a, b) => a.stability - b.stability);
      const toTrim = scenes.length - quota.max;
      for (let i = 0; i < toTrim; i++) {
        ascending[i].trimmed = true;
        ascending[i].trimmed_reason = `over_quota:${roomType}`;
      }
    }

    // Mark eligibility / reason on surviving scenes in this room.
    const surviving = scenes.filter((s) => !s.trimmed);
    for (const s of surviving) {
      if (s.eligible) {
        s.allocation_reason = "primary";
      } else {
        s.allocation_reason = "fallback_low_qa";
      }
    }

    // Rooms under their min — fallback is used for any non-eligible
    // surviving scene (stays in, just flagged).
    if (surviving.length < quota.min) {
      roomsUnderQuota.push(roomType);
      warnings.push(
        `Room "${roomType}" has ${surviving.length} clip(s), below min of ${quota.min}. ` +
        `No gap-fill in v1 allocator — surface this in the coverage enforcer once it ships.`
      );
    }

    // Any fallback usage flags the room.
    if (surviving.some((s) => s.allocation_reason === "fallback_low_qa")) {
      roomsWithFallback.push(roomType);
    }

    // Record the decision row.
    const qaScores = scenes.map((s) => s.stability);
    decisionsMap.set(roomType, {
      property_id: inputs.propertyId,
      room_type: roomType,
      photos_present: scenes.length,
      photos_eligible: eligibleCount,
      range_min: quota.min,
      range_max: quota.max,
      clips_assigned_first_pass: Math.min(scenes.length, quota.max),
      clips_added_by_redistribution: 0,
      clips_trimmed_by_cap: 0,
      final_clip_count: surviving.length,
      fallback_used: surviving.some(
        (s) => s.allocation_reason === "fallback_low_qa"
      ),
      avg_photo_qa_score:
        qaScores.length > 0
          ? qaScores.reduce((a, b) => a + b, 0) / qaScores.length
          : null,
      best_photo_qa_score:
        qaScores.length > 0 ? Math.max(...qaScores) : null,
      threshold_applied: scenes[0]?.threshold ?? null,
      notes: null,
    });
  }

  // 4. 60-second cap enforcement.
  let survivors = annotated.filter((s) => !s.trimmed);
  let capTrimApplied = false;

  if (survivors.length > MAX_SCENES_TOTAL) {
    capTrimApplied = true;
    // Sort survivors by (importance asc, stability asc) — trim the
    // least-hero, lowest-stability first. Respect per-room min as a
    // floor — never drop a room below its quota min.
    const countsByRoom = new Map<RoomType, number>();
    for (const s of survivors) {
      countsByRoom.set(s.roomType, (countsByRoom.get(s.roomType) ?? 0) + 1);
    }

    const sortedForTrim = [...survivors].sort((a, b) => {
      const impA = ROOM_IMPORTANCE[a.roomType] ?? 1;
      const impB = ROOM_IMPORTANCE[b.roomType] ?? 1;
      if (impA !== impB) return impA - impB;
      return a.stability - b.stability;
    });

    for (const candidate of sortedForTrim) {
      if (survivors.filter((s) => !s.trimmed).length <= MAX_SCENES_TOTAL) break;
      const quota = QUOTA[candidate.roomType] ?? { min: 0, max: 2 };
      const currentInRoom =
        (countsByRoom.get(candidate.roomType) ?? 0);
      if (currentInRoom <= quota.min) continue; // don't cut below min
      candidate.trimmed = true;
      candidate.trimmed_reason = "duration_cap_60s";
      countsByRoom.set(candidate.roomType, currentInRoom - 1);
      const dec = decisionsMap.get(candidate.roomType);
      if (dec) {
        dec.clips_trimmed_by_cap += 1;
        dec.final_clip_count -= 1;
      }
    }

    if (survivors.filter((s) => !s.trimmed).length > MAX_SCENES_TOTAL) {
      warnings.push(
        `Duration cap: even after quota-respecting trim, ${survivors.filter((s) => !s.trimmed).length} scenes remain (cap is ${MAX_SCENES_TOTAL}). Consider loosening a room's min quota.`
      );
    }
  }

  // Recalculate survivors after the cap pass.
  survivors = annotated.filter((s) => !s.trimmed);

  // 5. Orphan scenes (photo missing or untagged) — always trim.
  for (const o of orphanScenes) {
    warnings.push(`Scene ${o.scene_number} has no valid photo or room_type; trimmed.`);
  }

  // 6. Build final update list.
  const sceneUpdates: AllocatorOutput["sceneUpdates"] = [];
  for (const a of annotated) {
    sceneUpdates.push({
      id: a.scene.id,
      allocation_reason: a.allocation_reason,
      source_photo_qa_score: Number(a.stability.toFixed(1)),
      dynamic_qa_threshold: Number(a.threshold.toFixed(1)),
      trimmed: a.trimmed,
      trimmed_reason: a.trimmed_reason,
    });
  }
  for (const o of orphanScenes) {
    sceneUpdates.push({
      id: o.id,
      allocation_reason: null,
      source_photo_qa_score: null,
      dynamic_qa_threshold: null,
      trimmed: true,
      trimmed_reason: "orphan_photo_or_room",
    });
  }

  const totalAfter = survivors.length;
  const totalDuration = totalAfter * SCENE_DURATION_SECONDS;
  const totalTrimmed = annotated.filter((s) => s.trimmed).length + orphanScenes.length;

  let health: AllocationSummary["health"] = "green";
  if (roomsWithFallback.length > 0 || capTrimApplied) health = "yellow";
  if (roomsUnderQuota.length > 0 || totalAfter < 6) health = "red";

  const summary: AllocationSummary = {
    total_scenes_before: inputs.scenes.length,
    total_scenes_after: totalAfter,
    total_scenes_trimmed: totalTrimmed,
    total_duration_seconds: totalDuration,
    cap_trim_applied: capTrimApplied,
    rooms_with_fallback: roomsWithFallback,
    rooms_under_quota: roomsUnderQuota,
    rooms_over_quota: roomsOverQuota,
    health,
  };

  return {
    decisions: Array.from(decisionsMap.values()),
    summary,
    warnings,
    sceneUpdates,
  };
}

// ─── Persistence wrapper ─────────────────────────────────────────

export async function runSceneAllocation(propertyId: string): Promise<void> {
  const supabase = getSupabase();

  const { data: scenesData, error: scenesErr } = await supabase
    .from("scenes")
    .select()
    .eq("property_id", propertyId)
    .order("scene_number");
  if (scenesErr) throw scenesErr;
  const scenes = (scenesData ?? []) as Scene[];

  if (scenes.length === 0) {
    await log(propertyId, "scripting", "warn", "Allocator: no scenes to allocate; skipping");
    return;
  }

  const { data: photosData, error: photosErr } = await supabase
    .from("photos")
    .select()
    .eq("property_id", propertyId);
  if (photosErr) throw photosErr;
  const photos = (photosData ?? []) as Photo[];

  const result = allocateScenes({ propertyId, scenes, photos });

  // 1. Update each scene row with its allocation bookkeeping.
  for (const u of result.sceneUpdates) {
    const { error } = await supabase
      .from("scenes")
      .update({
        allocation_reason: u.allocation_reason,
        source_photo_qa_score: u.source_photo_qa_score,
        dynamic_qa_threshold: u.dynamic_qa_threshold,
        trimmed: u.trimmed,
        trimmed_reason: u.trimmed_reason,
      })
      .eq("id", u.id);
    if (error) {
      await log(
        propertyId,
        "scripting",
        "error",
        `Allocator: failed to update scene ${u.id}: ${error.message}`
      );
    }
  }

  // 2. Clear any stale allocation_decisions rows for this property and
  //    write fresh ones.
  await supabase
    .from("allocation_decisions")
    .delete()
    .eq("property_id", propertyId);

  if (result.decisions.length > 0) {
    const { error: decErr } = await supabase
      .from("allocation_decisions")
      .insert(result.decisions);
    if (decErr) {
      await log(
        propertyId,
        "scripting",
        "error",
        `Allocator: failed to write decisions: ${decErr.message}`
      );
    }
  }

  // 3. Update property rollup.
  const { error: propErr } = await supabase
    .from("properties")
    .update({
      allocation_summary: result.summary,
      allocation_warnings: result.warnings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", propertyId);
  if (propErr) {
    await log(
      propertyId,
      "scripting",
      "error",
      `Allocator: failed to update property summary: ${propErr.message}`
    );
  }

  await log(
    propertyId,
    "scripting",
    "info",
    `Allocator: ${result.summary.total_scenes_before} → ${result.summary.total_scenes_after} scenes (${result.summary.total_scenes_trimmed} trimmed, ${result.summary.total_duration_seconds}s, health=${result.summary.health})`,
    result.summary as unknown as Record<string, unknown>
  );

  for (const w of result.warnings) {
    await log(propertyId, "scripting", "warn", `Allocator: ${w}`);
  }
}
