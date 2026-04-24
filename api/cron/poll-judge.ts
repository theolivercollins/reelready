import type { VercelRequest, VercelResponse } from "@vercel/node";

// Budget: Gemini 2.5 Flash judge is ~21s per call. 5 × 21 = 105s < 120s cap
// with slack for DB writes + photo fetches. Adjust if latency drifts.
export const maxDuration = 120;

import { getSupabase } from "../../lib/client.js";
import { judgeLabIteration, loadCalibrationFewShot, JudgeDisabledError } from "../../lib/providers/gemini-judge.js";
import { withJudgeRetry, classifyJudgeError } from "../../lib/judge/retry.js";

// Per-run cap. Anything over this waits for the next minute tick.
const MAX_PER_RUN = 5;

// Runs every minute per vercel.json crons. Picks up iterations that have a
// clip_url but haven't been judged yet (judge_rated_at IS NULL) and runs the
// Gemini judge against them serially — inside the request lifetime, never as
// a detached IIFE. Any clip that 404s or errors permanently gets its
// judge_error + judge_rated_at written so it doesn't requeue forever;
// transient failures (Gemini "Cannot fetch content", 429, 5xx, network) are
// retried in-process up to 3 times before being marked.

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (process.env.JUDGE_ENABLED !== "true") {
    return res.status(200).json({ skipped: true, reason: "JUDGE_ENABLED !== true" });
  }

  const supabase = getSupabase();

  const { data: pending, error: selectErr } = await supabase
    .from("prompt_lab_iterations")
    .select(
      "id, session_id, clip_url, director_output_json, analysis_json, prompt_lab_sessions!inner(id, image_url, archetype)",
    )
    .not("clip_url", "is", null)
    .is("judge_rated_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (selectErr) {
    return res.status(500).json({ error: selectErr.message });
  }
  if (!pending || pending.length === 0) {
    return res.status(200).json({ processed: 0, results: [] });
  }

  const results: Array<{ id: string; status: "ok" | "error" | "disabled"; err?: string; latency_ms?: number }> = [];

  for (const row of pending) {
    const t0 = Date.now();
    const iterationId = row.id as string;
    try {
      const session = (row.prompt_lab_sessions as unknown) as {
        id: string;
        image_url: string | null;
        archetype?: string | null;
      };
      const director = row.director_output_json as { camera_movement?: string; prompt?: string } | null;
      const analysis = row.analysis_json as { room_type?: string } | null;

      // Fetch photo bytes non-fatally. Gemini does better with the source
      // image inline than with URL refs because the judge needs to compare
      // the clip's first frame to this exact photo.
      let photoBytes: Buffer | undefined;
      try {
        if (session?.image_url) {
          const r = await fetch(session.image_url);
          if (r.ok) photoBytes = Buffer.from(await r.arrayBuffer());
        }
      } catch {
        /* non-fatal */
      }

      const roomType = analysis?.room_type ?? session?.archetype ?? "unknown";
      const cameraMovement = director?.camera_movement ?? "unknown";

      const calibrationExamples = await loadCalibrationFewShot(roomType, cameraMovement, 10);

      const judgeResult = await withJudgeRetry(() =>
        judgeLabIteration({
          clipUrl: row.clip_url as string,
          photoBytes,
          directorPrompt: director?.prompt ?? "",
          cameraMovement,
          roomType,
          iterationId,
          calibrationExamples,
        }),
      );

      await supabase
        .from("prompt_lab_iterations")
        .update({
          judge_rating_json: judgeResult,
          judge_rating_overall: judgeResult.overall,
          judge_rated_at: new Date().toISOString(),
          judge_model: judgeResult.judge_model,
          judge_version: judgeResult.judge_version,
          judge_cost_cents: judgeResult.cost_cents,
          judge_error: null,
        })
        .eq("id", iterationId);

      results.push({ id: iterationId, status: "ok", latency_ms: Date.now() - t0 });
    } catch (err) {
      if (err instanceof JudgeDisabledError) {
        results.push({ id: iterationId, status: "disabled", err: err.message });
        continue;
      }

      const message = err instanceof Error ? err.message : String(err);
      const klass = classifyJudgeError(err);

      // Audit C C3: ONLY write judge_error + judge_rated_at on failure. Do NOT
      // touch judge_rating_json / judge_rating_overall / judge_model — a prior
      // successful rating (e.g. from the Override panel) must survive.
      //
      // On TRANSIENT errors that exhausted their retry budget, we still mark
      // the row as attempted so it doesn't spin forever; the Override button
      // lets Oliver re-judge manually if desired.
      try {
        await supabase
          .from("prompt_lab_iterations")
          .update({
            judge_error: `${klass}: ${message}`,
            judge_rated_at: new Date().toISOString(),
          })
          .eq("id", iterationId);
      } catch {
        /* nested — swallow */
      }

      results.push({ id: iterationId, status: "error", err: message, latency_ms: Date.now() - t0 });
    }
  }

  return res.status(200).json({
    processed: pending.length,
    ok_count: results.filter((r) => r.status === "ok").length,
    error_count: results.filter((r) => r.status === "error").length,
    results,
  });
}
