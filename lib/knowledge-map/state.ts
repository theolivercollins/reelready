import type { CellState } from "./types.js";

export interface CellStateInputs {
  sample_size: number;
  avg_rating: number | null;
  five_star_count: number;
  loser_count: number;
}

// Mirror of the CASE expression in v_knowledge_map_cells (migration 019).
// Having the same logic in TS + SQL lets the frontend preview state for
// hypothetical numbers without a round-trip.
export function classifyCellState(x: CellStateInputs): CellState {
  if (x.sample_size <= 0) return "untested";
  if (x.five_star_count >= 2) return "golden";
  // Single `weak` check with || mirrors the SQL CASE in migration 019
  // (both predicates under one WHEN clause). Keeping them combined here
  // makes divergence between TS and SQL harder to introduce.
  if (
    (x.avg_rating !== null && x.avg_rating <= 2.0) ||
    (x.sample_size > 0 && x.loser_count / x.sample_size >= 0.5)
  ) {
    return "weak";
  }
  if (x.avg_rating !== null && x.avg_rating >= 4.0) return "strong";
  return "okay";
}
