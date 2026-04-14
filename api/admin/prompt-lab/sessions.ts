import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";

// GET  /api/admin/prompt-lab/sessions        — list sessions
// POST /api/admin/prompt-lab/sessions        — create session from already-uploaded image
//        body: { image_url, image_path, label?, archetype? }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("prompt_lab_sessions")
      .select("id, created_by, image_url, image_path, label, archetype, batch_label, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });

    // Also grab iteration counts + best rating per session in one pass.
    const ids = (data ?? []).map((s) => s.id);
    let summaries: Record<string, { iteration_count: number; best_rating: number | null }> = {};
    if (ids.length > 0) {
      const { data: its } = await supabase
        .from("prompt_lab_iterations")
        .select("session_id, rating")
        .in("session_id", ids);
      for (const it of its ?? []) {
        const row = (summaries[it.session_id] ??= { iteration_count: 0, best_rating: null });
        row.iteration_count += 1;
        if (typeof it.rating === "number") {
          row.best_rating = Math.max(row.best_rating ?? 0, it.rating);
        }
      }
    }
    return res.status(200).json({
      sessions: (data ?? []).map((s) => ({ ...s, ...(summaries[s.id] ?? { iteration_count: 0, best_rating: null }) })),
    });
  }

  if (req.method === "POST") {
    const { image_url, image_path, label, archetype, batch_label } = (req.body ?? {}) as {
      image_url?: string;
      image_path?: string;
      label?: string;
      archetype?: string;
      batch_label?: string;
    };
    if (!image_url || !image_path) {
      return res.status(400).json({ error: "image_url and image_path required" });
    }
    const { data, error } = await supabase
      .from("prompt_lab_sessions")
      .insert({
        created_by: auth.user.id,
        image_url,
        image_path,
        label: label ?? null,
        archetype: archetype ?? null,
        batch_label: batch_label?.trim() || null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
