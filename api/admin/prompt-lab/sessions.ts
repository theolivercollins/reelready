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

    // Also grab iteration counts + best rating per session in one pass,
    // plus which sessions have had an iteration promoted to a recipe.
    const ids = (data ?? []).map((s) => s.id);
    const summaries: Record<string, {
      iteration_count: number;
      best_rating: number | null;
      completed: boolean;
      pending_render: boolean;
      ready_for_approval: boolean;
      has_feedback: boolean;
    }> = {};
    if (ids.length > 0) {
      const { data: its } = await supabase
        .from("prompt_lab_iterations")
        .select("id, session_id, rating, tags, user_comment, refinement_instruction, clip_url, provider_task_id, render_error")
        .in("session_id", ids);
      const iterationIdToSession = new Map<string, string>();
      for (const it of its ?? []) {
        iterationIdToSession.set(it.id, it.session_id);
        const row = (summaries[it.session_id] ??= {
          iteration_count: 0,
          best_rating: null,
          completed: false,
          pending_render: false,
          ready_for_approval: false,
          has_feedback: false,
        });
        row.iteration_count += 1;
        if (typeof it.rating === "number") {
          row.best_rating = Math.max(row.best_rating ?? 0, it.rating);
        }
        if (it.provider_task_id && !it.clip_url && !it.render_error) row.pending_render = true;
        if (it.clip_url && it.rating == null) row.ready_for_approval = true;
        // "Has feedback" = admin has rated, tagged, commented, or refined at
        // least one iteration. Auto-generated analysis doesn't count.
        const feedback = typeof it.rating === "number"
          || (Array.isArray(it.tags) && it.tags.length > 0)
          || (typeof it.user_comment === "string" && it.user_comment.trim().length > 0 && !it.user_comment.startsWith("[refiner rationale]"))
          || (typeof it.refinement_instruction === "string" && it.refinement_instruction.trim().length > 0);
        if (feedback) row.has_feedback = true;
      }

      const iterationIds = Array.from(iterationIdToSession.keys());
      if (iterationIds.length > 0) {
        const { data: recipes } = await supabase
          .from("prompt_lab_recipes")
          .select("source_iteration_id")
          .eq("status", "active")
          .in("source_iteration_id", iterationIds);
        for (const r of recipes ?? []) {
          const sid = iterationIdToSession.get(r.source_iteration_id as string);
          if (sid && summaries[sid]) summaries[sid].completed = true;
        }
      }
    }
    return res.status(200).json({
      sessions: (data ?? []).map((s) => ({
        ...s,
        ...(summaries[s.id] ?? {
          iteration_count: 0,
          best_rating: null,
          completed: false,
          pending_render: false,
          ready_for_approval: false,
          has_feedback: false,
        }),
      })),
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
