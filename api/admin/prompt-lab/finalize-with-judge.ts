import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabase } from "../../../lib/client.js";
import { requireAdmin } from "../../../lib/auth.js";
import { judgeLabIteration, JudgeDisabledError } from "../../../lib/providers/gemini-judge.js";

// POST /api/admin/prompt-lab/finalize-with-judge
//   body: { iteration_id }
//
// Admin-gated endpoint. Loads iteration + session, fetches source photo
// bytes (non-fatal), calls judgeLabIteration, persists judge columns on
// success or judge_error on failure.
//
// Returns 503 when JUDGE_ENABLED is off (probe-friendly).
// Returns 500 with error message on other failures.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { iteration_id } = (req.body ?? {}) as { iteration_id?: string };
  if (!iteration_id) return res.status(400).json({ error: "iteration_id required" });

  const supabase = getSupabase();

  const { data: iter, error: iterErr } = await supabase
    .from("prompt_lab_iterations")
    .select(
      "id, director_output_json, clip_url, model_used, analysis_json, prompt_lab_sessions!inner(id, image_url, archetype)",
    )
    .eq("id", iteration_id)
    .single();
  if (iterErr || !iter) return res.status(404).json({ error: "iteration not found" });
  if (!iter.clip_url) {
    return res.status(400).json({ error: "iteration has no clip_url (not yet rendered)" });
  }

  const session = (iter.prompt_lab_sessions as unknown) as {
    id: string;
    image_url: string;
    archetype?: string | null;
  };

  const director = iter.director_output_json as { camera_movement?: string; prompt?: string } | null;

  // Fetch source photo bytes non-fatally.
  let photoBytes: Buffer | undefined;
  try {
    if (session.image_url) {
      const r = await fetch(session.image_url);
      if (r.ok) photoBytes = Buffer.from(await r.arrayBuffer());
    }
  } catch { /* non-fatal */ }

  try {
    const result = await judgeLabIteration({
      clipUrl: iter.clip_url,
      photoBytes,
      directorPrompt: director?.prompt ?? "",
      cameraMovement: director?.camera_movement ?? "unknown",
      roomType: (iter.analysis_json as { room_type?: string } | null)?.room_type ?? session.archetype ?? "unknown",
      iterationId: iter.id,
    });

    await supabase
      .from("prompt_lab_iterations")
      .update({
        judge_rating_json: result,
        judge_rating_overall: result.overall,
        judge_rated_at: new Date().toISOString(),
        judge_model: result.judge_model,
        judge_version: result.judge_version,
        judge_cost_cents: result.cost_cents,
        judge_error: null,
      })
      .eq("id", iter.id);

    return res.status(200).json({ ok: true, result });
  } catch (err) {
    if (err instanceof JudgeDisabledError) {
      return res.status(503).json({ error: "judge_disabled", message: err.message });
    }
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("prompt_lab_iterations")
      .update({
        judge_error: message,
        judge_rated_at: new Date().toISOString(),
      })
      .eq("id", iter.id);
    return res.status(500).json({ error: "judge_failed", message });
  }
}
