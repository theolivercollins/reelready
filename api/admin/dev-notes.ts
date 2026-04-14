import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../lib/auth.js";
import { getSupabase } from "../../lib/client.js";

// GET    /api/admin/dev-notes           — list all notes, newest first
// POST   /api/admin/dev-notes           — create a new note
//          body: { session_date?, objective?, accomplishments? }
// PATCH  /api/admin/dev-notes?id=<id>   — update an existing note
// DELETE /api/admin/dev-notes?id=<id>

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("dev_session_notes")
      .select()
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ notes: data ?? [] });
  }

  if (req.method === "POST") {
    const { session_date, objective, accomplishments } = (req.body ?? {}) as {
      session_date?: string;
      objective?: string;
      accomplishments?: string;
    };
    const { data, error } = await supabase
      .from("dev_session_notes")
      .insert({
        created_by: auth.user.id,
        session_date: session_date || new Date().toISOString().slice(0, 10),
        objective: objective?.trim() || null,
        accomplishments: accomplishments?.trim() || null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  const id = req.query.id as string | undefined;

  if (req.method === "PATCH") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { session_date, objective, accomplishments } = (req.body ?? {}) as {
      session_date?: string;
      objective?: string | null;
      accomplishments?: string | null;
    };
    const patch: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (session_date !== undefined) patch.session_date = session_date;
    if (objective !== undefined) patch.objective = objective?.toString().trim() || null;
    if (accomplishments !== undefined) patch.accomplishments = accomplishments?.toString().trim() || null;
    const { data, error } = await supabase
      .from("dev_session_notes")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await supabase.from("dev_session_notes").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
