import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";
import {
  selectPhotosWithExplanation,
  type SelectionStatus,
} from "../../../lib/pipeline/selection.js";
import type { PhotoAnalysisResult } from "../../../lib/prompts/photo-analysis.js";

// POST /api/admin/prompt-lab/batch-selection
//   body: { batch_label: string | null }   ("Unbatched" for null batch)
//
// Replays the production selectPhotos() algorithm against every session in
// a Prompt Lab batch as if the whole batch were a real listing upload.
// Returns a per-session verdict (selected / not_selected / discarded) with
// reason so the operator can see which photos the pipeline WOULD pick, and
// which it would leave out + why.
//
// Pulls analysis from each session's earliest iteration's analysis_json
// (which is where analyzeSession persists the vision pass). Sessions that
// haven't been analyzed yet are listed separately in `unanalyzed`.

export interface BatchSelectionItem {
  session_id: string;
  image_url: string | null;
  label: string | null;
  room_type: string | null;
  aesthetic_score: number | null;
  video_viable: boolean | null;
  status: SelectionStatus;
  rank: number | null;
  reason: string;
}

export interface BatchSelectionResponse {
  batch_label: string | null;
  target: number;
  max_per_room: number;
  selected_count: number;
  discarded_count: number;
  not_selected_count: number;
  unanalyzed: Array<{ session_id: string; image_url: string | null; label: string | null }>;
  items: BatchSelectionItem[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { batch_label } = (req.body ?? {}) as { batch_label?: string | null };
  if (batch_label === undefined) {
    return res.status(400).json({ error: "batch_label is required (use null for Unbatched)" });
  }

  const supabase = getSupabase();

  // Pull every session in the batch. "Unbatched" means batch_label IS NULL
  // OR empty string — normalize by treating empty/whitespace as null.
  const sessionQuery = supabase
    .from("prompt_lab_sessions")
    .select("id, image_url, label, batch_label")
    .eq("archived", false);
  const { data: sessions, error: sErr } =
    batch_label == null
      ? await sessionQuery.or("batch_label.is.null,batch_label.eq.")
      : await sessionQuery.eq("batch_label", batch_label);
  if (sErr) return res.status(500).json({ error: sErr.message });

  if (!sessions || sessions.length === 0) {
    const empty: BatchSelectionResponse = {
      batch_label: batch_label ?? null,
      target: 0,
      max_per_room: 0,
      selected_count: 0,
      discarded_count: 0,
      not_selected_count: 0,
      unanalyzed: [],
      items: [],
    };
    return res.status(200).json(empty);
  }

  const sessionIds = sessions.map((s) => s.id as string);

  // Each session's earliest iteration carries the canonical analysis_json.
  // Pull iteration_number=1 first; fall back to oldest if #1 is missing.
  const { data: iterations, error: iErr } = await supabase
    .from("prompt_lab_iterations")
    .select("id, session_id, iteration_number, analysis_json, created_at")
    .in("session_id", sessionIds)
    .not("analysis_json", "is", null)
    .order("iteration_number", { ascending: true });
  if (iErr) return res.status(500).json({ error: iErr.message });

  const analysisBySession = new Map<string, PhotoAnalysisResult>();
  for (const it of iterations ?? []) {
    const sid = it.session_id as string;
    if (analysisBySession.has(sid)) continue;
    const a = it.analysis_json as PhotoAnalysisResult | null;
    if (!a || typeof a !== "object") continue;
    analysisBySession.set(sid, a);
  }

  const unanalyzed: Array<{ session_id: string; image_url: string | null; label: string | null }> = [];
  const analyzed: Array<{ id: string; session: (typeof sessions)[number]; analysis: PhotoAnalysisResult }> = [];
  for (const s of sessions) {
    const a = analysisBySession.get(s.id as string);
    if (!a) {
      unanalyzed.push({
        session_id: s.id as string,
        image_url: (s.image_url as string | null) ?? null,
        label: (s.label as string | null) ?? null,
      });
      continue;
    }
    analyzed.push({ id: s.id as string, session: s, analysis: a });
  }

  const explanation = selectPhotosWithExplanation(analyzed);

  const items: BatchSelectionItem[] = analyzed.map((a) => {
    const verdict = explanation.verdicts.get(a.id)!;
    return {
      session_id: a.id,
      image_url: (a.session.image_url as string | null) ?? null,
      label: (a.session.label as string | null) ?? null,
      room_type: a.analysis.room_type ?? null,
      aesthetic_score: typeof a.analysis.aesthetic_score === "number" ? a.analysis.aesthetic_score : null,
      video_viable: typeof a.analysis.video_viable === "boolean" ? a.analysis.video_viable : null,
      status: verdict.status,
      rank: verdict.rank,
      reason: verdict.reason,
    };
  });

  // Sort: selected by rank asc, then not_selected by aesthetic desc, then discarded last.
  items.sort((a, b) => {
    const order: Record<SelectionStatus, number> = { selected: 0, not_selected: 1, discarded: 2 };
    if (a.status !== b.status) return order[a.status] - order[b.status];
    if (a.status === "selected") return (a.rank ?? 0) - (b.rank ?? 0);
    return (b.aesthetic_score ?? 0) - (a.aesthetic_score ?? 0);
  });

  const response: BatchSelectionResponse = {
    batch_label: batch_label ?? null,
    target: explanation.target,
    max_per_room: explanation.max_per_room,
    selected_count: items.filter((i) => i.status === "selected").length,
    discarded_count: items.filter((i) => i.status === "discarded").length,
    not_selected_count: items.filter((i) => i.status === "not_selected").length,
    unanalyzed,
    items,
  };

  return res.status(200).json(response);
}
