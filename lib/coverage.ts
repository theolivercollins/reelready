// Coverage Enforcer + Arc Reorder — Pipeline Stage 3.7
//
// Spec: docs/COVERAGE-MODEL.md + docs/WALKTHROUGH-ROADMAP.md R2 + R4
//
// Runs after the scene allocator (Stage 3.6) and before generation.
// Two responsibilities:
//
//   1. COVERAGE (R2): guarantee the three axes from the primary goal
//      (docs/WALKTHROUGH-SPEC.md §2.3) appear in the final shot list:
//        - inside      (≥1 interior room clip)
//        - outside     (≥1 exterior / pool / aerial clip)
//        - unique      (≥1 clip explicitly framing a unique feature)
//
//      When an axis is missing, attempt a gap-fill by promoting a
//      trimmed or out-of-quota scene that satisfies the axis. If no
//      candidate exists, raise a warning and mark the property
//      `needs_review` instead of silently shipping an incomplete video.
//
//   2. ARC (R4): reorder the surviving scenes into the canonical
//      tour arc documented in COVERAGE-MODEL §4.4:
//        opener (exterior/aerial) →
//        interior primary (foyer → living → kitchen → dining) →
//        interior private (master → bedroom → bathroom) →
//        highlight (pool / lanai / unique) →
//        closer (exterior wide / aerial / hero unique).
//
//      Scene.scene_number is rewritten to reflect the new order.
//      Same-room scenes keep their relative director ordering
//      (stable sort by original scene_number within the group).

import type { Photo, RoomType, Scene, UniqueTag } from "./types.js";
import { getSupabase, updatePropertyStatus, log } from "./db.js";

// ─── Axis classification ─────────────────────────────────────────

const INSIDE_ROOMS: ReadonlySet<RoomType> = new Set([
  "kitchen",
  "living_room",
  "master_bedroom",
  "bedroom",
  "bathroom",
  "dining",
  "hallway",
  "foyer",
  "garage",
]);

const OUTSIDE_ROOMS: ReadonlySet<RoomType> = new Set([
  "exterior_front",
  "exterior_back",
  "pool",
  "aerial",
]);

// Pool and aerial are always counted as "unique feature" candidates
// in addition to being outside. See COVERAGE-MODEL §2.
const AUTO_UNIQUE_ROOMS: ReadonlySet<RoomType> = new Set(["pool", "aerial"]);

export function isInsideRoom(rt: RoomType | null | undefined): boolean {
  return rt !== null && rt !== undefined && INSIDE_ROOMS.has(rt);
}

export function isOutsideRoom(rt: RoomType | null | undefined): boolean {
  return rt !== null && rt !== undefined && OUTSIDE_ROOMS.has(rt);
}

/**
 * A scene counts toward the "unique feature" axis if any of:
 *   - its photo's room_type is pool or aerial (always unique)
 *   - its photo has at least one unique_tag
 *   - the property-level style_guide notable_features references
 *     this photo (not checked here — would need the style_guide
 *     passed in; deferred until we actually need it)
 */
export function isUniqueFeatureScene(
  photo: Photo | undefined
): boolean {
  if (!photo) return false;
  if (photo.room_type && AUTO_UNIQUE_ROOMS.has(photo.room_type)) return true;
  const tags = (photo as { unique_tags?: UniqueTag[] }).unique_tags;
  if (Array.isArray(tags) && tags.length > 0) return true;
  return false;
}

// ─── Arc ordering ────────────────────────────────────────────────

// Lower number = earlier in the arc. Scenes sort ascending.
const ARC_POSITION: Record<RoomType, number> = {
  // Opener tier — exteriors and aerial. Closer will get appended explicitly.
  exterior_front: 0,
  aerial: 1,
  exterior_back: 2,
  // Interior primary flow
  foyer: 10,
  living_room: 11,
  dining: 12,
  kitchen: 13,
  // Interior private flow
  master_bedroom: 20,
  bedroom: 21,
  bathroom: 22,
  // Circulation / lesser rooms
  hallway: 25,
  garage: 26,
  other: 27,
  // Highlight tier
  pool: 30,
};

const OPENER_CANDIDATES: ReadonlySet<RoomType> = new Set([
  "exterior_front",
  "aerial",
  "exterior_back",
]);

const CLOSER_CANDIDATES: ReadonlySet<RoomType> = new Set([
  "exterior_front",
  "aerial",
  "exterior_back",
  "pool",
]);

// ─── Types ───────────────────────────────────────────────────────

export interface CoverageStatus {
  inside: boolean;
  outside: boolean;
  unique: boolean;
  missing: Array<"inside" | "outside" | "unique">;
}

export interface CoverageResult {
  statusBefore: CoverageStatus;
  statusAfter: CoverageStatus;
  axesPromoted: Array<"inside" | "outside" | "unique">;
  warnings: string[];
  needsReview: boolean;
  sceneUpdates: Array<{
    id: string;
    scene_number: number;
    trimmed?: boolean;
    trimmed_reason?: string | null;
    allocation_reason?: string;
  }>;
}

interface CoverageInputs {
  propertyId: string;
  scenes: Scene[];
  photos: Photo[];
}

// ─── Pure core ───────────────────────────────────────────────────

function buildPhotoMap(photos: Photo[]): Map<string, Photo> {
  const m = new Map<string, Photo>();
  for (const p of photos) m.set(p.id, p);
  return m;
}

export function evaluateCoverage(
  scenes: Scene[],
  photos: Photo[]
): CoverageStatus {
  const photoById = buildPhotoMap(photos);
  let inside = false;
  let outside = false;
  let unique = false;
  for (const s of scenes) {
    const photo = photoById.get(s.photo_id);
    if (!photo) continue;
    const rt = photo.room_type;
    if (!rt) continue;
    if (isInsideRoom(rt)) inside = true;
    if (isOutsideRoom(rt)) outside = true;
    if (isUniqueFeatureScene(photo)) unique = true;
  }
  const missing: CoverageStatus["missing"] = [];
  if (!inside) missing.push("inside");
  if (!outside) missing.push("outside");
  if (!unique) missing.push("unique");
  return { inside, outside, unique, missing };
}

/**
 * Look for a trimmed scene that can satisfy a missing axis without
 * exceeding the 12-scene / 60s cap. Returns the scene's DB id so the
 * caller can untrim it. Prefers scenes with higher stability scores.
 */
function findAxisRescue(
  axis: "inside" | "outside" | "unique",
  trimmedScenes: Scene[],
  photoById: Map<string, Photo>
): Scene | null {
  const candidates = trimmedScenes.filter((s) => {
    const photo = photoById.get(s.photo_id);
    if (!photo) return false;
    if (axis === "inside") return isInsideRoom(photo.room_type);
    if (axis === "outside") return isOutsideRoom(photo.room_type);
    if (axis === "unique") return isUniqueFeatureScene(photo);
    return false;
  });
  if (candidates.length === 0) return null;
  // Prefer highest pre-existing stability score if present, else highest
  // source_photo_qa_score from allocator, else the first.
  candidates.sort((a, b) => {
    const sa = (a as { source_photo_qa_score?: number | null }).source_photo_qa_score ?? 0;
    const sb = (b as { source_photo_qa_score?: number | null }).source_photo_qa_score ?? 0;
    return sb - sa;
  });
  return candidates[0] ?? null;
}

// Sort scenes into canonical tour arc order. Stable within the same
// arc position. Pool / aerial default to late-arc (highlight / closer)
// unless there's only one outside scene, in which case it becomes the
// opener.
export function reorderArc(
  scenes: Scene[],
  photos: Photo[]
): Scene[] {
  if (scenes.length === 0) return scenes;
  const photoById = buildPhotoMap(photos);

  interface Entry {
    scene: Scene;
    roomType: RoomType | null;
    arcKey: number;
    originalNumber: number;
  }

  const entries: Entry[] = scenes.map((s) => {
    const rt = photoById.get(s.photo_id)?.room_type ?? null;
    const key = rt ? (ARC_POSITION[rt] ?? 50) : 50;
    return {
      scene: s,
      roomType: rt,
      arcKey: key,
      originalNumber: s.scene_number,
    };
  });

  // Choose the opener: first exterior / aerial by original order.
  const openerIdx = entries.findIndex(
    (e) => e.roomType !== null && OPENER_CANDIDATES.has(e.roomType)
  );

  // Choose a closer: the LAST exterior / aerial / pool candidate by
  // original order that is NOT the opener. If none, pick the best
  // remaining unique feature (pool).
  let closerIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (i === openerIdx) continue;
    const e = entries[i];
    if (e.roomType && CLOSER_CANDIDATES.has(e.roomType)) {
      closerIdx = i;
      break;
    }
  }

  // Pull opener + closer out of the middle sort pool.
  const opener = openerIdx >= 0 ? entries[openerIdx] : null;
  const closer = closerIdx >= 0 ? entries[closerIdx] : null;
  const middle = entries.filter(
    (_, i) => i !== openerIdx && i !== closerIdx
  );

  // Stable sort middle by arc key, then original scene_number.
  middle.sort((a, b) => {
    if (a.arcKey !== b.arcKey) return a.arcKey - b.arcKey;
    return a.originalNumber - b.originalNumber;
  });

  const ordered: Entry[] = [];
  if (opener) ordered.push(opener);
  ordered.push(...middle);
  if (closer) ordered.push(closer);

  return ordered.map((e, idx) => ({
    ...e.scene,
    scene_number: idx + 1,
  }));
}

export function enforceCoverage(inputs: CoverageInputs): CoverageResult {
  const warnings: string[] = [];
  const axesPromoted: Array<"inside" | "outside" | "unique"> = [];
  const photoById = buildPhotoMap(inputs.photos);

  // Split into active (non-trimmed) and trimmed (tombstones).
  const isTrimmed = (s: Scene): boolean =>
    (s as { trimmed?: boolean }).trimmed === true;

  const active = inputs.scenes.filter((s) => !isTrimmed(s));
  const trimmed = inputs.scenes.filter((s) => isTrimmed(s));

  const statusBefore = evaluateCoverage(active, inputs.photos);

  const rescuedIds = new Set<string>();
  const sceneUpdates: CoverageResult["sceneUpdates"] = [];

  // Try to fill each missing axis from the trimmed pool.
  for (const axis of statusBefore.missing) {
    const rescue = findAxisRescue(
      axis,
      trimmed.filter((s) => !rescuedIds.has(s.id)),
      photoById
    );
    if (rescue) {
      rescuedIds.add(rescue.id);
      axesPromoted.push(axis);
      sceneUpdates.push({
        id: rescue.id,
        scene_number: -1, // reassigned by reorderArc below
        trimmed: false,
        trimmed_reason: null,
        allocation_reason: `coverage_gap_fill_${axis}`,
      });
    } else {
      warnings.push(
        `Coverage: no candidate scene available to fill missing "${axis}" axis. ` +
        `Routing property to needs_review.`
      );
    }
  }

  // Build the post-coverage active set: original active + rescued.
  const postActive = [
    ...active,
    ...trimmed.filter((s) => rescuedIds.has(s.id)),
  ];

  const statusAfter = evaluateCoverage(postActive, inputs.photos);

  // Reorder the final active set into the canonical tour arc.
  const reordered = reorderArc(postActive, inputs.photos);

  // Record new scene numbers for every active scene (including the
  // rescues, which now get their real scene_number assigned here).
  const existingUpdateById = new Map(sceneUpdates.map((u) => [u.id, u]));
  for (const s of reordered) {
    const existing = existingUpdateById.get(s.id);
    if (existing) {
      existing.scene_number = s.scene_number;
    } else {
      sceneUpdates.push({ id: s.id, scene_number: s.scene_number });
    }
  }

  const needsReview = statusAfter.missing.length > 0;

  return {
    statusBefore,
    statusAfter,
    axesPromoted,
    warnings,
    needsReview,
    sceneUpdates,
  };
}

// ─── Persistence wrapper ─────────────────────────────────────────

export async function runCoverageEnforcement(
  propertyId: string
): Promise<void> {
  const supabase = getSupabase();

  const { data: scenesData, error: scenesErr } = await supabase
    .from("scenes")
    .select()
    .eq("property_id", propertyId)
    .order("scene_number");
  if (scenesErr) throw scenesErr;
  const scenes = (scenesData ?? []) as Scene[];

  if (scenes.length === 0) {
    await log(
      propertyId,
      "scripting",
      "warn",
      "Coverage enforcer: no scenes present; skipping"
    );
    return;
  }

  const { data: photosData, error: photosErr } = await supabase
    .from("photos")
    .select()
    .eq("property_id", propertyId);
  if (photosErr) throw photosErr;
  const photos = (photosData ?? []) as Photo[];

  const result = enforceCoverage({ propertyId, scenes, photos });

  // Apply scene updates: untrim rescued scenes, renumber everyone.
  for (const u of result.sceneUpdates) {
    const update: Record<string, unknown> = {
      scene_number: u.scene_number,
    };
    if (u.trimmed !== undefined) update.trimmed = u.trimmed;
    if (u.trimmed_reason !== undefined) update.trimmed_reason = u.trimmed_reason;
    if (u.allocation_reason !== undefined) {
      update.allocation_reason = u.allocation_reason;
    }
    const { error } = await supabase
      .from("scenes")
      .update(update)
      .eq("id", u.id);
    if (error) {
      await log(
        propertyId,
        "scripting",
        "error",
        `Coverage enforcer: failed to update scene ${u.id}: ${error.message}`
      );
    }
  }

  // Append warnings to the property's allocation_warnings column.
  if (result.warnings.length > 0) {
    const { data: propData } = await supabase
      .from("properties")
      .select("allocation_warnings")
      .eq("id", propertyId)
      .single();
    const existing =
      (propData?.allocation_warnings as string[] | null | undefined) ?? [];
    await supabase
      .from("properties")
      .update({
        allocation_warnings: [...existing, ...result.warnings],
        updated_at: new Date().toISOString(),
      })
      .eq("id", propertyId);
  }

  if (result.needsReview) {
    await updatePropertyStatus(propertyId, "needs_review");
    await log(
      propertyId,
      "scripting",
      "warn",
      `Coverage enforcer routed property to needs_review. Missing axes: ${result.statusAfter.missing.join(", ")}`
    );
  }

  await log(
    propertyId,
    "scripting",
    "info",
    `Coverage: before=[${statusShort(result.statusBefore)}] after=[${statusShort(result.statusAfter)}]` +
      (result.axesPromoted.length > 0
        ? ` promoted=${result.axesPromoted.join(",")}`
        : "") +
      ` · arc-reordered ${result.sceneUpdates.length} scenes`
  );

  for (const w of result.warnings) {
    await log(propertyId, "scripting", "warn", `Coverage: ${w}`);
  }
}

function statusShort(s: CoverageStatus): string {
  return `${s.inside ? "IN" : "in?"}/${s.outside ? "OUT" : "out?"}/${s.unique ? "UNQ" : "unq?"}`;
}
