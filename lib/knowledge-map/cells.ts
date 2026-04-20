import { getSupabase } from "../client.js";
import type {
  CellSummary,
  FailTagCount,
  CellDrillDown,
  CellDrillDownIteration,
  CellDrillDownRecipe,
  CellDrillDownOverride,
} from "./types.js";

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

export async function getCellDrillDown(cellKey: string): Promise<CellDrillDown | null> {
  const supabase = getSupabase();
  const [roomType, cameraMovement] = cellKey.split("-", 2);
  if (!roomType || !cameraMovement) throw new Error(`Invalid cell_key: ${cellKey}`);

  // 1. Base summary row.
  const { data: summaryRow, error: summaryErr } = await supabase
    .from("v_knowledge_map_cells")
    .select("*")
    .eq("cell_key", cellKey)
    .maybeSingle();
  if (summaryErr) throw new Error(`fetch cell summary failed: ${summaryErr.message}`);
  if (!summaryRow) return null;
  const summary = rowToSummary(summaryRow);

  // 2. Iterations — pooled Lab + prod, newest first, up to 50. Fetch
  //    separately because v_rated_pool doesn't expose the clip/source
  //    image urls we need for the drill-down gallery.
  const { data: labRows, error: labErr } = await supabase
    .from("prompt_lab_iterations")
    .select(`
      id, iteration_number, rating, tags, provider, clip_url, created_at,
      analysis_json, director_output_json,
      prompt_lab_sessions(image_url)
    `)
    .not("rating", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (labErr) throw new Error(`fetch lab iterations failed: ${labErr.message}`);

  const labFiltered = (labRows ?? []).filter((r) => {
    const a = (r as { analysis_json?: { room_type?: string } }).analysis_json ?? {};
    const d = (r as { director_output_json?: { camera_movement?: string } }).director_output_json ?? {};
    return a.room_type === roomType && d.camera_movement === cameraMovement;
  });

  const { data: prodRows, error: prodErr } = await supabase
    .from("scene_ratings")
    .select("id, rating, tags, rated_provider, rated_clip_url, rated_snapshot_at")
    .eq("rated_room_type", roomType)
    .eq("rated_camera_movement", cameraMovement)
    .not("rating", "is", null)
    .order("rated_snapshot_at", { ascending: false })
    .limit(50);
  if (prodErr) throw new Error(`fetch prod ratings failed: ${prodErr.message}`);

  type LabRow = {
    id: string; iteration_number: number | null; rating: number; tags: string[] | null;
    provider: string | null; clip_url: string | null; created_at: string;
    prompt_lab_sessions: { image_url: string | null } | { image_url: string | null }[] | null;
  };
  type ProdRow = {
    id: string; rating: number; tags: string[] | null;
    rated_provider: string | null; rated_clip_url: string | null; rated_snapshot_at: string;
  };

  const labIters: CellDrillDownIteration[] = labFiltered.slice(0, 50).map((raw) => {
    const r = raw as unknown as LabRow;
    const session = Array.isArray(r.prompt_lab_sessions) ? r.prompt_lab_sessions[0] : r.prompt_lab_sessions;
    return {
      id: r.id,
      source: "lab",
      iteration_number: r.iteration_number,
      rating: r.rating,
      tags: r.tags ?? [],
      provider: r.provider,
      clip_url: r.clip_url,
      source_image_url: session?.image_url ?? null,
      created_at: r.created_at,
      judge_composite: null,
    };
  });

  const prodIters: CellDrillDownIteration[] = (prodRows ?? []).map((raw) => {
    const r = raw as ProdRow;
    return {
      id: r.id,
      source: "prod",
      iteration_number: null,
      rating: r.rating,
      tags: r.tags ?? [],
      provider: r.rated_provider,
      clip_url: r.rated_clip_url,
      source_image_url: null,
      created_at: r.rated_snapshot_at,
      judge_composite: null,
    };
  });

  // 3. Judge scores for Lab iterations (prod scenes aren't judge-scored yet).
  const labIds = labIters.map((i) => i.id);
  if (labIds.length > 0) {
    const { data: scoreRows } = await supabase
      .from("lab_judge_scores")
      .select("iteration_id, composite_1to5")
      .in("iteration_id", labIds);
    const scoreMap = new Map<string, number>();
    for (const s of scoreRows ?? []) {
      const r = s as { iteration_id: string; composite_1to5: number };
      scoreMap.set(r.iteration_id, Number(r.composite_1to5));
    }
    for (const i of labIters) {
      const v = scoreMap.get(i.id);
      if (v !== undefined) i.judge_composite = v;
    }
  }

  // 4. Active recipes in this cell.
  const { data: recipeRows, error: recipeErr } = await supabase
    .from("prompt_lab_recipes")
    .select("id, archetype, rating_at_promotion, times_applied, prompt_template, promoted_at")
    .eq("room_type", roomType)
    .eq("camera_movement", cameraMovement)
    .eq("status", "active")
    .order("promoted_at", { ascending: false });
  if (recipeErr) throw new Error(`fetch recipes failed: ${recipeErr.message}`);
  const recipes: CellDrillDownRecipe[] = (recipeRows ?? []).map((raw) => {
    const r = raw as {
      id: string; archetype: string; rating_at_promotion: number;
      times_applied: number; prompt_template: string; promoted_at: string;
    };
    return {
      id: r.id,
      archetype: r.archetype,
      rating_at_promotion: r.rating_at_promotion,
      times_applied: r.times_applied,
      prompt_template: r.prompt_template,
      promoted_at: r.promoted_at,
    };
  });

  // 5. Active overrides (Lab-scoped). The scope-to-cell is implicit via
  //    the override's prompt_name, which the rule miner uses conventions
  //    like director:kitchen:push_in. For MVP we return all active
  //    overrides and let the UI filter by prompt_name substring.
  const { data: overrideRows, error: overrideErr } = await supabase
    .from("lab_prompt_overrides")
    .select("id, prompt_name, body_hash, is_active, created_at")
    .eq("is_active", true);
  if (overrideErr) throw new Error(`fetch overrides failed: ${overrideErr.message}`);
  const overrides: CellDrillDownOverride[] = (overrideRows ?? [])
    .map((raw) => {
      const r = raw as { id: string; prompt_name: string; body_hash: string; is_active: boolean; created_at: string };
      return {
        id: r.id,
        prompt_name: r.prompt_name,
        body_hash: r.body_hash,
        is_active: r.is_active,
        created_at: r.created_at,
      };
    })
    // Match overrides whose prompt_name is either the exact cell_key, or
    // contains BOTH the room_type AND the camera_movement. Single-term
    // substring matches (e.g. just "orbit") would falsely attach
    // unrelated overrides to this cell's drill-down.
    .filter((o) =>
      o.prompt_name.includes(cellKey) ||
      (o.prompt_name.includes(roomType) && o.prompt_name.includes(cameraMovement))
    );

  // 6. Total cost — Lab judge cost for this cell's iterations +
  //    generation cost from cost_events scoped to property_ids that
  //    include the cell. For Phase 2 MVP, we sum just the judge cost
  //    (which is clearly cell-scoped) and expose it as total_cost_cents;
  //    full cost_events rollup with per-cell attribution is Phase 3.
  let total_cost_cents = 0;
  if (labIds.length > 0) {
    const { data: costRows } = await supabase
      .from("lab_judge_scores")
      .select("cost_cents")
      .in("iteration_id", labIds);
    for (const c of costRows ?? []) {
      total_cost_cents += Number((c as { cost_cents?: number }).cost_cents ?? 0);
    }
  }

  const combinedIters = [...labIters, ...prodIters]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);

  return {
    ...summary,
    iterations: combinedIters,
    recipes,
    overrides,
    total_cost_cents,
  };
}
