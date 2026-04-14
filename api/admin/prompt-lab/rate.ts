import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";

// POST /api/admin/prompt-lab/rate
//   body: { iteration_id, rating?, tags?, comment? }
// Saves a rating on an existing iteration without generating a new one.

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
  const { data, error } = await supabase
    .from("prompt_lab_iterations")
    .update(patch)
    .eq("id", iteration_id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
}
