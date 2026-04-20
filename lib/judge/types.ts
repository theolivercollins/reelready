// Cell taxonomy = (room_type, camera_movement). Stable enums from lib/types.ts.
export interface CellKey {
  room_type: string;
  camera_movement: string;
}

export function cellKeyToString(k: CellKey): string {
  return `${k.room_type}-${k.camera_movement}`;
}

export const JUDGE_VERSION = "rubric-v1";
export const JUDGE_MODEL = "claude-sonnet-4-6";

// Four rubric axes, each 1..5. rationale is free text, fail_tag_suggestions
// are 'fail:*'-prefixed tokens Claude proposes when it scores low.
export interface JudgeRubricScore {
  prompt_adherence: number;
  motion_quality: number;
  spatial_coherence: number;
  aesthetic_intent: number;
  rationale: string;
  fail_tag_suggestions: string[];
}

export interface JudgeResult {
  iteration_id: string;
  rubric: JudgeRubricScore;
  composite_1to5: number;   // 1..5 with 2 decimals
  confidence: number;       // 0..1 with 2 decimals
  neighbors_used: number;
  cost_cents: number;
  model_id: string;
  judge_version: string;
}

export interface CalibrationRow {
  cell_key: string;
  room_type: string;
  camera_movement: string;
  sample_size: number;
  exact_match_rate: number;
  within_one_star_rate: number;
  mean_abs_error: number;
  judge_version: string;
  model_id: string;
}
