import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";
import { embedTextSafe, buildAnalysisText, toPgVector } from "../../../lib/embeddings.js";

// POST /api/admin/prompt-lab/rate
//   body: { iteration_id, rating?, tags?, comment? }
// Saves a rating on an existing iteration. If rating=5 AND no active recipe
// within 0.2 cosine distance + same room_type exists, auto-promotes to a
// recipe using a generated archetype name (room_camera_YYMMDD-abc).

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { iteration_id, rating, tags, comment } = (req.body ?? {}) as {
    iteration_id?: string;
    rating?: number | null;
    tags?: string[] | null;
    comment?: string | null;
  };
  if (!iteration_id) return res.status(400).json({ error: "iteration_id required" });

  const patch: Record<string, unknown> = {};
  if (rating === null || typeof rating === "number") patch.rating = rating;
  if (tags === null || Array.isArray(tags)) patch.tags = tags;
  if (comment === null || typeof comment === "string") patch.user_comment = comment;

  const supabase = getSupabase();
  const { data: updated, error } = await supabase
    .from("prompt_lab_iterations")
    .update(patch)
    .eq("id", iteration_id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Auto-promote on rating >= 4. 5★ = primary recipe, 4★ = backup recipe.
  // Both feed retrieval; the director sees the distinction via the archetype
  // prefix ("backup_" on 4★) and the rating_at_promotion field.
  let auto_promoted: { id: string; archetype: string; tier: "primary" | "backup" } | null = null;
  if (typeof rating === "number" && rating >= 4 && updated.analysis_json && updated.director_output_json) {
    const analysis = updated.analysis_json as { room_type: string; key_features?: string[]; composition?: string | null; suggested_motion?: string | null };
    const director = updated.director_output_json as { camera_movement: string; prompt: string };
    const tier = rating === 5 ? "primary" : "backup";

    let vec: number[] | null = null;
    if (Array.isArray(updated.embedding)) vec = updated.embedding as number[];
    else if (typeof updated.embedding === "string" && updated.embedding.startsWith("[")) {
      try { vec = JSON.parse(updated.embedding) as number[]; } catch { /* no-op */ }
    }
    if (!vec) {
      const embedded = await embedTextSafe(
        buildAnalysisText({
          roomType: analysis.room_type,
          keyFeatures: analysis.key_features ?? [],
          composition: analysis.composition,
          suggestedMotion: analysis.suggested_motion,
          cameraMovement: director.camera_movement,
        })
      );
      if (embedded) vec = embedded.vector;
    }

    const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const slug = Math.random().toString(36).slice(2, 6);
    const prefix = tier === "backup" ? "backup_" : "";
    const archetype = `${prefix}${analysis.room_type}_${director.camera_movement}_${stamp}_${slug}`;
    const { data: recipe } = await supabase
      .from("prompt_lab_recipes")
      .insert({
        archetype,
        room_type: analysis.room_type,
        camera_movement: director.camera_movement,
        provider: updated.provider,
        prompt_template: director.prompt,
        source_iteration_id: iteration_id,
        rating_at_promotion: rating,
        promoted_by: auth.user.id,
        embedding: vec ? toPgVector(vec) : null,
      })
      .select("id, archetype")
      .single();
    if (recipe) auto_promoted = { id: recipe.id, archetype: recipe.archetype, tier };
  }

  return res.status(200).json({ iteration: updated, auto_promoted });
}
