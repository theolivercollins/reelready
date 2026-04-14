import type { VercelRequest, VercelResponse } from "@vercel/node";

export const maxDuration = 120;

import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";
import {
  analyzeSingleImage,
  directSinglePhoto,
  getNextIterationNumber,
  retrieveSimilarIterations,
  retrieveMatchingRecipes,
  ANALYSIS_PROMPT_HASH,
  DIRECTOR_PROMPT_HASH,
} from "../../../lib/prompt-lab.js";
import { embedTextSafe, buildAnalysisText, toPgVector } from "../../../lib/embeddings.js";

// POST /api/admin/prompt-lab/analyze
//   body: { session_id }
// Runs PHOTO_ANALYSIS + DIRECTOR on the session's image and creates iteration #N.
// Retrieves similar past winners + matching recipes via vector similarity
// and injects them as few-shot examples into the director call.

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

    // Embed BEFORE directing so retrieval can condition the director.
    const embeddingText = buildAnalysisText({
      roomType: analysis.room_type,
      keyFeatures: analysis.key_features,
      composition: analysis.composition,
      suggestedMotion: analysis.suggested_motion,
    });
    const embedded = await embedTextSafe(embeddingText);

    const exemplars = embedded
      ? await retrieveSimilarIterations(embedded.vector, { minRating: 4, limit: 5 })
      : [];
    const recipes = embedded
      ? await retrieveMatchingRecipes(embedded.vector, analysis.room_type)
      : [];

    const { scene, costCents: dCost } = await directSinglePhoto(
      analysis,
      "lab-photo",
      exemplars,
      recipes
    );

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
        embedding: embedded ? toPgVector(embedded.vector) : null,
        embedding_model: embedded?.model ?? null,
        retrieval_metadata: {
          exemplars: exemplars.map((e) => ({ id: e.id, prompt: e.prompt, rating: e.rating, distance: e.distance, room_type: e.room_type, camera_movement: e.camera_movement })),
          recipe: recipes[0]
            ? {
                id: (recipes[0] as { id: string }).id,
                archetype: (recipes[0] as { archetype: string }).archetype,
                prompt_template: (recipes[0] as { prompt_template: string }).prompt_template,
                distance: (recipes[0] as { distance: number }).distance,
              }
            : null,
        },
      })
      .select()
      .single();
    if (iErr) return res.status(500).json({ error: iErr.message });

    // Bump recipe times_applied if one was used.
    if (recipes.length > 0) {
      await supabase
        .from("prompt_lab_recipes")
        .update({ times_applied: (recipes[0] as { times_applied: number }).times_applied + 1 })
        .eq("id", (recipes[0] as { id: string }).id);
    }

    return res.status(201).json({
      iteration,
      retrieval: {
        exemplar_count: exemplars.length,
        exemplars: exemplars.map((e) => ({ id: e.id, prompt: e.prompt, rating: e.rating, distance: e.distance })),
        recipe: recipes[0] ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "analyze failed", detail: msg });
  }
}
