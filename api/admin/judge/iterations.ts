import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";

// GET /api/admin/judge/iterations?filter=all|rated|unrated|fives|losers
//   ?limit=50 (default 50, max 200)
// Returns a list of iterations for the JudgeSmoke gallery:
//   [{
//     id, session_id, session_label, session_image_url,
//     rating, iteration_number, provider, clip_url,
//     room_type, camera_movement, created_at,
//     judge_score: number|null, judge_confidence: number|null
//   }]
// Joined with lab_judge_scores so the gallery can show which iterations
// have already been scored.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const filter = String(req.query.filter ?? "rated") as "all" | "rated" | "unrated" | "fives" | "losers";
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50) | 0, 1), 200);

  const supabase = getSupabase();

  let q = supabase
    .from("prompt_lab_iterations")
    .select(`
      id, session_id, iteration_number, rating, provider, clip_url,
      analysis_json, director_output_json, created_at,
      prompt_lab_sessions(label, image_url)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filter === "rated") q = q.not("rating", "is", null);
  else if (filter === "unrated") q = q.is("rating", null);
  else if (filter === "fives") q = q.eq("rating", 5);
  else if (filter === "losers") q = q.lte("rating", 2).not("rating", "is", null);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const rows = data ?? [];
  const ids = rows.map((r) => (r as { id: string }).id);

  // Pull existing judge scores in one round-trip so the gallery can
  // label already-scored iterations.
  const judgeById = new Map<string, { composite_1to5: number; confidence: number }>();
  if (ids.length > 0) {
    const { data: scores } = await supabase
      .from("lab_judge_scores")
      .select("iteration_id, composite_1to5, confidence")
      .in("iteration_id", ids);
    for (const s of scores ?? []) {
      const row = s as { iteration_id: string; composite_1to5: number; confidence: number };
      judgeById.set(row.iteration_id, { composite_1to5: row.composite_1to5, confidence: row.confidence });
    }
  }

  type Row = {
    id: string;
    session_id: string;
    iteration_number: number | null;
    rating: number | null;
    provider: string | null;
    clip_url: string | null;
    analysis_json: { room_type?: string } | null;
    director_output_json: { camera_movement?: string } | null;
    created_at: string;
    prompt_lab_sessions: { label: string | null; image_url: string | null } | { label: string | null; image_url: string | null }[] | null;
  };

  const items = rows.map((raw) => {
    const r = raw as Row;
    const sessionJoin = Array.isArray(r.prompt_lab_sessions) ? r.prompt_lab_sessions[0] : r.prompt_lab_sessions;
    const judge = judgeById.get(r.id) ?? null;
    return {
      id: r.id,
      session_id: r.session_id,
      session_label: sessionJoin?.label ?? null,
      session_image_url: sessionJoin?.image_url ?? null,
      iteration_number: r.iteration_number,
      rating: r.rating,
      provider: r.provider,
      clip_url: r.clip_url,
      room_type: r.analysis_json?.room_type ?? null,
      camera_movement: r.director_output_json?.camera_movement ?? null,
      created_at: r.created_at,
      judge_score: judge?.composite_1to5 ?? null,
      judge_confidence: judge?.confidence ?? null,
    };
  });

  return res.status(200).json({ iterations: items });
}
