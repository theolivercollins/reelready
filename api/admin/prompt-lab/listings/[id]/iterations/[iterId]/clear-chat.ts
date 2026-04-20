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

  const supabase = getSupabase();
  const { error } = await supabase.from("prompt_lab_listing_scene_iterations")
    .update({ chat_messages: [] }).eq("id", iterId);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ chat_messages: [] });
}
