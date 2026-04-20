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
  const body = (req.body ?? {}) as { director_prompt?: string; use_end_frame?: boolean };
  const patch: Record<string, unknown> = {};
  if (typeof body.director_prompt === "string") patch.director_prompt = body.director_prompt;
  if (typeof body.use_end_frame === "boolean") patch.use_end_frame = body.use_end_frame;
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "director_prompt or use_end_frame required" });
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.from("prompt_lab_listing_scenes")
    .update(patch).eq("id", sceneId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ scene: data });
}
