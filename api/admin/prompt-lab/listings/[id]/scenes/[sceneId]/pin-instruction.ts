import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../../../../../lib/auth.js";
import { getSupabase } from "../../../../../../../lib/client.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const sceneId = String(req.query.sceneId ?? "");
  if (!sceneId) return res.status(400).json({ error: "sceneId required" });
  const body = (req.body ?? {}) as { instruction?: string; refinement_notes?: string | null };
  const supabase = getSupabase();

  // Full replace (used for delete / clear): refinement_notes can be null or string.
  if ("refinement_notes" in body) {
    const next = body.refinement_notes ?? null;
    const { data, error } = await supabase.from("prompt_lab_listing_scenes")
      .update({ refinement_notes: next })
      .eq("id", sceneId)
      .select("id, refinement_notes")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ scene: data });
  }

  // Append one instruction.
  const instruction = (body.instruction ?? "").trim();
  if (!instruction) return res.status(400).json({ error: "instruction required" });

  const { data: scene, error: readErr } = await supabase
    .from("prompt_lab_listing_scenes")
    .select("refinement_notes")
    .eq("id", sceneId)
    .single();
  if (readErr || !scene) return res.status(404).json({ error: "scene not found" });

  const existing = scene.refinement_notes?.trim() ?? "";
  const next = existing ? `${existing}\n- ${instruction}` : `- ${instruction}`;

  const { data, error } = await supabase.from("prompt_lab_listing_scenes")
    .update({ refinement_notes: next })
    .eq("id", sceneId)
    .select("id, refinement_notes")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ scene: data });
}
