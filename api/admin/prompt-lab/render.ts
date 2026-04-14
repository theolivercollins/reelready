import type { VercelRequest, VercelResponse } from "@vercel/node";

export const maxDuration = 300;

import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";
import { renderLabClip } from "../../../lib/prompt-lab.js";

// POST /api/admin/prompt-lab/render
//   body: { iteration_id }
// Actually spends credits: calls Kling/Runway with the iteration's director
// prompt and stores the resulting clip_url on the iteration row.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { iteration_id, provider: providerOverride } = (req.body ?? {}) as {
    iteration_id?: string;
    provider?: "kling" | "runway" | null;
  };
  if (!iteration_id) return res.status(400).json({ error: "iteration_id required" });

  const supabase = getSupabase();
  const { data: iteration, error: iErr } = await supabase
    .from("prompt_lab_iterations")
    .select("*, prompt_lab_sessions(image_url)")
    .eq("id", iteration_id)
    .single();
  if (iErr || !iteration) return res.status(404).json({ error: "iteration not found" });
  if (!iteration.director_output_json) {
    return res.status(400).json({ error: "iteration has no director output to render" });
  }
  if (iteration.clip_url) {
    return res.status(200).json({ ...iteration, alreadyRendered: true });
  }

  const imageUrl = (iteration.prompt_lab_sessions as { image_url: string })?.image_url;
  if (!imageUrl) return res.status(400).json({ error: "session image url missing" });

  try {
    const result = await renderLabClip({
      imageUrl,
      scene: iteration.director_output_json,
      roomType: iteration.analysis_json?.room_type ?? "other",
      providerOverride: providerOverride === "kling" || providerOverride === "runway" ? providerOverride : null,
      sessionId: iteration.session_id,
      iterationId: iteration_id,
    });

    const { data: updated, error: uErr } = await supabase
      .from("prompt_lab_iterations")
      .update({
        clip_url: result.clipUrl,
        provider: result.provider,
        cost_cents: Math.round((iteration.cost_cents ?? 0) + result.costCents),
      })
      .eq("id", iteration_id)
      .select()
      .single();
    if (uErr) return res.status(500).json({ error: uErr.message });

    if (result.error) {
      return res.status(502).json({ ...updated, renderError: result.error });
    }
    return res.status(200).json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "render failed", detail: msg });
  }
}
