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
  const iterId = String(req.query.iterId ?? "");
  if (!iterId) return res.status(400).json({ error: "iterId required" });
  const body = (req.body ?? {}) as { rating?: number | null; tags?: string[] | null; comment?: string | null };
  const patch: Record<string, unknown> = {};
  if (body.rating === null || typeof body.rating === "number") patch.rating = body.rating;
  if (body.tags === null || Array.isArray(body.tags)) patch.tags = body.tags;
  if (body.comment === null || typeof body.comment === "string") patch.user_comment = body.comment;
  if (typeof body.rating === "number") patch.status = "rated";
  const supabase = getSupabase();
  const { data, error } = await supabase.from("prompt_lab_listing_scene_iterations")
    .update(patch).eq("id", iterId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ iteration: data });
}
