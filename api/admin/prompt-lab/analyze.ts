import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";
import {
  analyzeSingleImage,
  directSinglePhoto,
  getNextIterationNumber,
  ANALYSIS_PROMPT_HASH,
  DIRECTOR_PROMPT_HASH,
} from "../../../lib/prompt-lab.js";

// POST /api/admin/prompt-lab/analyze
//   body: { session_id }
// Runs PHOTO_ANALYSIS + DIRECTOR on the session's image and creates iteration #N.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { session_id } = (req.body ?? {}) as { session_id?: string };
  if (!session_id) return res.status(400).json({ error: "session_id required" });

  const supabase = getSupabase();
  const { data: session, error: sErr } = await supabase
    .from("prompt_lab_sessions")
    .select()
    .eq("id", session_id)
    .single();
  if (sErr || !session) return res.status(404).json({ error: "session not found" });

  try {
    const { analysis, costCents: aCost } = await analyzeSingleImage(session.image_url);
    const { scene, costCents: dCost } = await directSinglePhoto(analysis);

    const iterationNumber = await getNextIterationNumber(session_id);
    const { data: iteration, error: iErr } = await supabase
      .from("prompt_lab_iterations")
      .insert({
        session_id,
        iteration_number: iterationNumber,
        analysis_json: analysis,
        analysis_prompt_hash: ANALYSIS_PROMPT_HASH,
        director_output_json: scene,
        director_prompt_hash: DIRECTOR_PROMPT_HASH,
        cost_cents: Math.round(aCost + dCost),
      })
      .select()
      .single();
    if (iErr) return res.status(500).json({ error: iErr.message });

    return res.status(201).json(iteration);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "analyze failed", detail: msg });
  }
}
