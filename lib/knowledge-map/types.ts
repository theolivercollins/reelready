// Derived in SQL (see migration 019 v_knowledge_map_cells.state).
export type CellState = "untested" | "weak" | "okay" | "strong" | "golden";

export interface FailTagCount {
  tag: string;   // e.g. "fail:ghost-walls"
  count: number;
}

export interface CellSummary {
  cell_key: string;            // e.g. "kitchen-push_in"
  room_type: string;
  camera_movement: string;
  sample_size: number;
  avg_rating: number | null;   // null when sample_size = 0
  five_star_count: number;
  loser_count: number;
  last_rated_at: string | null;
  fail_tags: FailTagCount[];   // sorted desc by count, top 10
  active_recipe_count: number;
  state: CellState;
}

export interface CellDrillDownIteration {
  id: string;
  source: "lab" | "prod";
  iteration_number: number | null;
  rating: number | null;
  tags: string[];
  provider: string | null;
  clip_url: string | null;
  source_image_url: string | null;
  created_at: string;
  judge_composite: number | null;
}

export interface CellDrillDownRecipe {
  id: string;
  archetype: string;
  rating_at_promotion: number;
  times_applied: number;
  prompt_template: string;
  promoted_at: string;
}

export interface CellDrillDownOverride {
  id: string;
  prompt_name: string;
  body_hash: string;
  is_active: boolean;
  created_at: string;
}

export interface CellDrillDown extends CellSummary {
  iterations: CellDrillDownIteration[];  // up to 50, sorted desc by created_at
  recipes: CellDrillDownRecipe[];
  overrides: CellDrillDownOverride[];
  total_cost_cents: number;              // judge + generation cost scoped to this cell
}

export interface CostRollupRow {
  provider: string;
  stage: string;
  units_consumed: number | null;
  cost_cents: number;
  event_count: number;
}

export interface CostRollup {
  total_cents: number;
  by_provider_and_stage: CostRollupRow[];
  judge_total_cents: number;  // from lab_judge_scores.cost_cents sum
}
