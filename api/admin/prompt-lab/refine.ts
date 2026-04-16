import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";
import {
  refineDirectorPrompt,
  retrieveSimilarIterations,
  retrieveSimilarLosers,
  getNextIterationNumber,
  DIRECTOR_PROMPT_HASH,
} from "../../../lib/prompt-lab.js";

// POST /api/admin/prompt-lab/refine
//   body: { iteration_id, rating?, tags?, comment?, chat_instruction }
// Saves feedback on the current iteration, then creates a new iteration with a
// refined director prompt produced by Claude.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { iteration_id, rating, tags, comment, chat_instruction } = (req.body ?? {}) as {
    iteration_id?: string;
    rating?: number | null;
    tags?: string[] | null;
    comment?: string | null;
    chat_instruction?: string;
  };
  if (!iteration_id || !chat_instruction?.trim()) {
    return res.status(400).json({ error: "iteration_id and chat_instruction required" });
  }

  const supabase = getSupabase();
  const { data: prev, error: pErr } = await supabase
    .from("prompt_lab_iterations")
    .select()
    .eq("id", iteration_id)
    .single();
  if (pErr || !prev) return res.status(404).json({ error: "iteration not found" });
  if (!prev.analysis_json || !prev.director_output_json) {
    return res.status(400).json({ error: "previous iteration missing analysis or director output" });
  }

  // Save feedback onto the previous iteration.
  await supabase
    .from("prompt_lab_iterations")
    .update({
      rating: typeof rating === "number" ? rating : prev.rating,
      tags: Array.isArray(tags) ? tags : prev.tags,
      user_comment: typeof comment === "string" ? comment : prev.user_comment,
      refinement_instruction: chat_instruction,
    })
    .eq("id", iteration_id);

  // Parent embedding carries forward — retrieve similar winners + losers if present.
  let exemplars: Awaited<ReturnType<typeof retrieveSimilarIterations>> = [];
  let losers: Awaited<ReturnType<typeof retrieveSimilarLosers>> = [];
  let parentVec: number[] | null = null;
  if (Array.isArray(prev.embedding) && prev.embedding.length) {
    parentVec = prev.embedding as number[];
  } else if (typeof prev.embedding === "string" && prev.embedding.startsWith("[")) {
    try {
      parentVec = JSON.parse(prev.embedding) as number[];
    } catch { /* no-op */ }
  }
  if (parentVec) {
    [exemplars, losers] = await Promise.all([
      retrieveSimilarIterations(parentVec, { minRating: 4, limit: 5 }),
      retrieveSimilarLosers(parentVec, { maxRating: 2, limit: 3 }),
    ]);
  }

  try {
    const { scene, rationale, costCents } = await refineDirectorPrompt({
      analysis: prev.analysis_json,
      previousScene: prev.director_output_json,
      rating: typeof rating === "number" ? rating : null,
      tags: Array.isArray(tags) ? tags : null,
      comment: typeof comment === "string" ? comment : null,
      chatInstruction: chat_instruction,
      exemplars,
      losers,
    });

    const iterationNumber = await getNextIterationNumber(prev.session_id);
    const { data: newIteration, error: nErr } = await supabase
      .from("prompt_lab_iterations")
      .insert({
        session_id: prev.session_id,
        iteration_number: iterationNumber,
        analysis_json: prev.analysis_json,
        analysis_prompt_hash: prev.analysis_prompt_hash,
        director_output_json: scene,
        director_prompt_hash: DIRECTOR_PROMPT_HASH,
        cost_cents: Math.round(costCents),
        user_comment: rationale ? `[refiner rationale] ${rationale}` : null,
        embedding: prev.embedding ?? null,
        embedding_model: prev.embedding_model ?? null,
        retrieval_metadata: {
          exemplars: exemplars.map((e) => ({ id: e.id, prompt: e.prompt, rating: e.rating, distance: e.distance, room_type: e.room_type, camera_movement: e.camera_movement })),
          losers: losers.map((e) => ({ id: e.id, prompt: e.prompt, rating: e.rating, distance: e.distance, room_type: e.room_type, camera_movement: e.camera_movement })),
        },
      })
      .select()
      .single();
    if (nErr) return res.status(500).json({ error: nErr.message });

    return res.status(201).json({
      iteration: newIteration,
      retrieval: {
        exemplar_count: exemplars.length,
        loser_count: losers.length,
        exemplars: exemplars.map((e) => ({ id: e.id, prompt: e.prompt, rating: e.rating, distance: e.distance })),
        losers: losers.map((e) => ({ id: e.id, prompt: e.prompt, rating: e.rating, distance: e.distance })),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "refine failed", detail: msg });
  }
}
