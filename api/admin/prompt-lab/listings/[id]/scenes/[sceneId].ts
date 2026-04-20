import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../../../../lib/auth.js";
import { getSupabase } from "../../../../../../lib/client.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const sceneId = String(req.query.sceneId ?? "");
  if (!sceneId) return res.status(400).json({ error: "sceneId required" });
  const body = (req.body ?? {}) as { director_prompt?: string };
  if (typeof body.director_prompt !== "string") {
    return res.status(400).json({ error: "director_prompt (string) required" });
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.from("prompt_lab_listing_scenes")
    .update({ director_prompt: body.director_prompt }).eq("id", sceneId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ scene: data });
}
