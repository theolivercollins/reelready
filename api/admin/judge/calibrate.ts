import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { runCalibration } from "../../../lib/judge/calibration.js";

// POST /api/admin/judge/calibrate
//   body: {
//     per_cell_sample_cap?: number;   // default 30
//     cell_keys?: string[];           // optional filter e.g. ['kitchen-push_in']
//     reuse_prior_scores?: boolean;   // default true
//   }
// Runs the judge across human-rated Lab iterations, bucketed per cell,
// and writes a calibration snapshot per cell. Returns the rows written.
//
// This endpoint can be slow — sampling 30 iterations × N cells × Claude.
// Vercel default timeout applies; the caller should expect 30–300s
// depending on how many cells are sampled.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const body = (req.body ?? {}) as {
    per_cell_sample_cap?: number;
    cell_keys?: string[];
    reuse_prior_scores?: boolean;
  };

  try {
    const rows = await runCalibration({
      perCellSampleCap: body.per_cell_sample_cap,
      onlyCellKeys: body.cell_keys,
      reusePriorScores: body.reuse_prior_scores,
    });
    return res.status(200).json({
      calibrations: rows,
      summary: {
        cells: rows.length,
        above_80: rows.filter((r) => r.within_one_star_rate >= 0.80).length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
