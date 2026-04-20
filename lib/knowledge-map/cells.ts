import { getSupabase } from "../client.js";
import type { CellSummary, FailTagCount } from "./types.js";

// Returns all 168 cells from v_knowledge_map_cells. Fail-tag histogram
// is flattened from JSONB into a sorted array (top 10 by count).
export async function listCells(): Promise<CellSummary[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("v_knowledge_map_cells")
    .select("*")
    .order("room_type")
    .order("camera_movement");
  if (error) throw new Error(`list cells failed: ${error.message}`);
  return (data ?? []).map(rowToSummary);
}

function rowToSummary(r: Record<string, unknown>): CellSummary {
  const rawTags = (r.fail_tags ?? {}) as Record<string, number>;
  const fail_tags: FailTagCount[] = Object.entries(rawTags)
    .map(([tag, count]) => ({ tag, count: Number(count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return {
    cell_key: String(r.cell_key),
    room_type: String(r.room_type),
    camera_movement: String(r.camera_movement),
    sample_size: Number(r.sample_size ?? 0),
    avg_rating: r.avg_rating === null || r.avg_rating === undefined ? null : Number(r.avg_rating),
    five_star_count: Number(r.five_star_count ?? 0),
    loser_count: Number(r.loser_count ?? 0),
    last_rated_at: r.last_rated_at === null || r.last_rated_at === undefined ? null : String(r.last_rated_at),
    fail_tags,
    active_recipe_count: Number(r.active_recipe_count ?? 0),
    state: String(r.state) as CellSummary["state"],
  };
}
