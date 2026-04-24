import type { RoomType } from "../db.js";
import type { PhotoAnalysisResult } from "../prompts/photo-analysis.js";

// Production photo-selection algorithm. Picks up to TARGET_SCENE_COUNT photos
// for a listing video. Required room types first, bonus rooms, then fills
// remaining slots by aesthetic score with a per-room cap.
//
// The same algorithm is used by the prod pipeline (runAnalysis) and by the
// Prompt Lab batch-selection endpoint — keep it here so they can't drift.

export const TARGET_SCENE_COUNT = 12;
export const MAX_PER_ROOM_TYPE = 2;

export const REQUIRED_ROOM_TYPES: RoomType[] = [
  "exterior_front",
  "kitchen",
  "living_room",
  "master_bedroom",
  "bathroom",
];

const BONUS_ROOM_TYPES: RoomType[] = ["exterior_back", "aerial"];

export type SelectionStatus = "selected" | "not_selected" | "discarded";

export interface SelectionVerdict {
  status: SelectionStatus;
  /** 1-based position in the selected list; null for non-selected. */
  rank: number | null;
  /** Human-readable reason. Tells the operator WHY this photo was/wasn't picked. */
  reason: string;
}

export interface SelectionExplanation<T> {
  selected: T[];
  verdicts: Map<string, SelectionVerdict>;
  target: number;
  max_per_room: number;
  required_rooms: RoomType[];
}

type AnalysisSubset = Pick<
  PhotoAnalysisResult,
  "room_type" | "aesthetic_score" | "suggested_discard" | "discard_reason" | "video_viable" | "motion_rationale"
>;

/**
 * Pick up to TARGET_SCENE_COUNT photos for a listing. Callers just want the
 * selected subset. For the explained version (with per-photo verdicts) use
 * selectPhotosWithExplanation.
 */
export function selectPhotos<A extends AnalysisSubset>(
  results: Array<{ photo: { id: string }; analysis: A; provider?: string }>,
): Array<{ photo: { id: string }; analysis: A; provider?: string }> {
  const { selected } = selectPhotosWithExplanation(
    results.map((r) => ({ id: r.photo.id, original: r, analysis: r.analysis })),
  );
  return selected.map((x) => x.original);
}

/**
 * Pick up to TARGET_SCENE_COUNT photos AND attach a verdict to every input
 * explaining why it was selected / not-selected / discarded. The explainer
 * is instrumented inline rather than reverse-engineered after the fact so
 * the reasons reflect the actual decisions the algorithm made.
 */
export function selectPhotosWithExplanation<T extends { id: string; analysis: AnalysisSubset }>(
  results: T[],
): SelectionExplanation<T> {
  const verdicts = new Map<string, SelectionVerdict>();

  // Pass 1 — discard photos the analyzer flagged or marked non-viable.
  for (const r of results) {
    if (r.analysis.suggested_discard) {
      verdicts.set(r.id, {
        status: "discarded",
        rank: null,
        reason: r.analysis.discard_reason ?? "Analyzer flagged for discard",
      });
    } else if (r.analysis.video_viable === false) {
      verdicts.set(r.id, {
        status: "discarded",
        rank: null,
        reason: `Not usable as video starting frame — ${r.analysis.motion_rationale ?? "no clean motion path"}`,
      });
    }
  }

  const candidates = results.filter((r) => !verdicts.has(r.id));

  // Group candidates by room type, sort each group by aesthetic desc.
  const byRoom = new Map<RoomType, T[]>();
  for (const c of candidates) {
    const list = byRoom.get(c.analysis.room_type) ?? [];
    list.push(c);
    byRoom.set(c.analysis.room_type, list);
  }
  for (const group of byRoom.values()) {
    group.sort((a, b) => b.analysis.aesthetic_score - a.analysis.aesthetic_score);
  }

  const selected: T[] = [];

  // Pass 2 — pick the top photo from each required room type.
  for (const rt of REQUIRED_ROOM_TYPES) {
    const group = byRoom.get(rt);
    if (group?.[0] && !selected.some((s) => s.analysis.room_type === rt)) {
      const winner = group[0];
      selected.push(winner);
      verdicts.set(winner.id, {
        status: "selected",
        rank: selected.length,
        reason: `Required room — ${formatRoomType(rt)} (aesthetic ${winner.analysis.aesthetic_score.toFixed(1)}/10)`,
      });
    }
  }

  // Pass 3 — bonus rooms: exterior_back and aerial if present.
  for (const rt of BONUS_ROOM_TYPES) {
    const group = byRoom.get(rt);
    if (group?.[0] && !selected.some((s) => s.analysis.room_type === rt)) {
      const winner = group[0];
      selected.push(winner);
      verdicts.set(winner.id, {
        status: "selected",
        rank: selected.length,
        reason: `Bonus room — ${formatRoomType(rt)} (aesthetic ${winner.analysis.aesthetic_score.toFixed(1)}/10)`,
      });
    }
  }

  // Pass 4 — fill remaining slots by aesthetic score with a per-room cap.
  const remaining = candidates
    .filter((c) => !selected.includes(c))
    .sort((a, b) => b.analysis.aesthetic_score - a.analysis.aesthetic_score);

  for (const candidate of remaining) {
    if (selected.length >= TARGET_SCENE_COUNT) {
      verdicts.set(candidate.id, {
        status: "not_selected",
        rank: null,
        reason: `Scene cap of ${TARGET_SCENE_COUNT} already reached (aesthetic ${candidate.analysis.aesthetic_score.toFixed(1)}/10, ${formatRoomType(candidate.analysis.room_type)})`,
      });
      continue;
    }
    const count = selected.filter((s) => s.analysis.room_type === candidate.analysis.room_type).length;
    if (count >= MAX_PER_ROOM_TYPE) {
      const winners = selected.filter((s) => s.analysis.room_type === candidate.analysis.room_type);
      const winnerScores = winners.map((w) => w.analysis.aesthetic_score.toFixed(1)).join(", ");
      verdicts.set(candidate.id, {
        status: "not_selected",
        rank: null,
        reason: `${formatRoomType(candidate.analysis.room_type)} quota full (max ${MAX_PER_ROOM_TYPE}, already picked ${winnerScores}/10; this photo ${candidate.analysis.aesthetic_score.toFixed(1)}/10)`,
      });
      continue;
    }
    selected.push(candidate);
    verdicts.set(candidate.id, {
      status: "selected",
      rank: selected.length,
      reason: `Fill slot — aesthetic ${candidate.analysis.aesthetic_score.toFixed(1)}/10, ${formatRoomType(candidate.analysis.room_type)}`,
    });
  }

  // Final safety net: any candidate without a verdict (shouldn't happen) gets
  // a catch-all.
  for (const c of candidates) {
    if (!verdicts.has(c.id)) {
      verdicts.set(c.id, { status: "not_selected", rank: null, reason: "Not reached in fill pass" });
    }
  }

  return {
    selected,
    verdicts,
    target: TARGET_SCENE_COUNT,
    max_per_room: MAX_PER_ROOM_TYPE,
    required_rooms: REQUIRED_ROOM_TYPES,
  };
}

function formatRoomType(rt: string): string {
  return rt.replace(/_/g, " ");
}
