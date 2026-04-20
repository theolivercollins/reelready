import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";

// GET /api/admin/judge/status
// Returns the latest calibration state per cell plus an aggregate summary.
// Used by the dashboard's calibration panel (Phase 2) and by the
// /api/admin/judge/score endpoint's callers to decide auto vs advisory mode.
//
// Response shape:
//   {
//     cells: Array<{
//       cell_key: string; room_type: string; camera_movement: string;
//       sample_size: number; exact_match_rate: number;
//       within_one_star_rate: number; mean_abs_error: number;
//       mode: 'auto' | 'advisory'; computed_at: string;
//     }>;
//     summary: {
//       total_cells_calibrated: number;
//       cells_auto: number;
//       cells_advisory: number;
//       overall_within_one_star: number; // sample-weighted mean
//     }
//   }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Preview-only bypass — see api/admin/judge/score.ts for notes.
  if (process.env.VERCEL_ENV !== "preview") {
    const auth = await requireAdmin(req, res);
    if (!auth) return;
  }

  const supabase = getSupabase();
  const { data: cells, error } = await supabase
    .from("v_judge_calibration_status")
    .select("*")
    .order("cell_key");
  if (error) return res.status(500).json({ error: error.message });

  const rows = cells ?? [];
  const totalCells = rows.length;
  const cellsAuto = rows.filter((r: Record<string, unknown>) => r.mode === "auto").length;
  const cellsAdvisory = totalCells - cellsAuto;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const r of rows) {
    const n = (r as { sample_size?: number }).sample_size ?? 0;
    const w = (r as { within_one_star_rate?: number }).within_one_star_rate ?? 0;
    weightedSum += n * w;
    weightTotal += n;
  }
  const overall = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 1000) / 1000 : 0;

  return res.status(200).json({
    cells: rows,
    summary: {
      total_cells_calibrated: totalCells,
      cells_auto: cellsAuto,
      cells_advisory: cellsAdvisory,
      overall_within_one_star: overall,
    },
  });
}
