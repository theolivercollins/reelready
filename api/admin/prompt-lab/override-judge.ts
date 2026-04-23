import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabase } from "../../../lib/client.js";
import { requireAdmin } from "../../../lib/auth.js";
import { validateJudgeOutput } from "../../../lib/prompts/judge-rubric.js";

// POST /api/admin/prompt-lab/override-judge
//   body: { iteration_id, corrected_rating_json, correction_reason? }
//
// Admin-gated. Creates a judge_calibration_examples row when Oliver disagrees
// with the judge. The row is then consumed by loadCalibrationFewShot on
// subsequent judge calls for the same (room_type × camera_movement) bucket.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { iteration_id, corrected_rating_json, correction_reason } = (req.body ?? {}) as {
    iteration_id?: string;
    corrected_rating_json?: unknown;
    correction_reason?: string;
  };

  if (!iteration_id) return res.status(400).json({ error: "iteration_id required" });
  if (!corrected_rating_json) return res.status(400).json({ error: "corrected_rating_json required" });

  // Validate the corrected rubric before touching the DB.
  const validation = validateJudgeOutput(corrected_rating_json);
  if (!validation.ok) {
    return res.status(400).json({ error: `corrected_rating_json invalid: ${validation.error}` });
  }

  const supabase = getSupabase();

  // Load the iteration to get context fields.
  const { data: iter, error: iterErr } = await supabase
    .from("prompt_lab_iterations")
    .select("id, rating, judge_rating_json, analysis_json, director_output_json")
    .eq("id", iteration_id)
    .single();

  if (iterErr || !iter) {
    return res.status(404).json({ error: "iteration not found" });
  }

  const roomType =
    (iter.analysis_json as { room_type?: string } | null)?.room_type ?? "unknown";
  const cameraMovement =
    (iter.director_output_json as { camera_movement?: string } | null)?.camera_movement ?? "unknown";
  const humanRating = (iter.rating as number | null) ?? null;

  // Insert the calibration example row.
  const { data: inserted, error: insertErr } = await supabase
    .from("judge_calibration_examples")
    .insert({
      iteration_id,
      human_rating: humanRating,
      judge_rating_json: iter.judge_rating_json ?? null,
      oliver_correction_json: validation.result,
      correction_reason: correction_reason?.trim() || null,
      room_type: roomType,
      camera_movement: cameraMovement,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return res.status(500).json({ error: insertErr?.message ?? "insert failed" });
  }

  return res.status(200).json({ ok: true, calibration_example_id: inserted.id });
}
