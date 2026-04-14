import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";

// GET    /api/admin/prompt-lab/:sessionId  — session detail + all iterations
// DELETE /api/admin/prompt-lab/:sessionId  — delete session + iterations + storage

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const sessionId = req.query.sessionId as string;
  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data: session, error: sErr } = await supabase
      .from("prompt_lab_sessions")
      .select()
      .eq("id", sessionId)
      .single();
    if (sErr || !session) return res.status(404).json({ error: "session not found" });

    const { data: iterations } = await supabase
      .from("prompt_lab_iterations")
      .select()
      .eq("session_id", sessionId)
      .order("iteration_number", { ascending: true });

    return res.status(200).json({ session, iterations: iterations ?? [] });
  }

  if (req.method === "PATCH") {
    const { label, archetype, batch_label } = (req.body ?? {}) as { label?: string | null; archetype?: string | null; batch_label?: string | null };
    const patch: Record<string, string | null> = {};
    if (label !== undefined) patch.label = label?.toString().trim() || null;
    if (archetype !== undefined) patch.archetype = archetype?.toString().trim() || null;
    if (batch_label !== undefined) patch.batch_label = batch_label?.toString().trim() || null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "no fields to update" });
    const { data, error } = await supabase
      .from("prompt_lab_sessions")
      .update(patch)
      .eq("id", sessionId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const { data: session } = await supabase
      .from("prompt_lab_sessions")
      .select("image_path")
      .eq("id", sessionId)
      .single();
    if (session?.image_path) {
      await supabase.storage.from("property-photos").remove([session.image_path]);
    }
    const { error } = await supabase.from("prompt_lab_sessions").delete().eq("id", sessionId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
