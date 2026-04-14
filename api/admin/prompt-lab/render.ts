import type { VercelRequest, VercelResponse } from "@vercel/node";

export const maxDuration = 60;

import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";
import { submitLabRender } from "../../../lib/prompt-lab.js";

// POST /api/admin/prompt-lab/render
//   body: { iteration_id, provider? }
// Submits a clip generation job to the provider and records the task_id.
// Does NOT poll — the cron at /api/cron/poll-lab-renders finalizes.
// Returns immediately so client can navigate away safely.

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
  if (iteration.provider_task_id) {
    return res.status(200).json({ ...iteration, alreadySubmitted: true });
  }

  const imageUrl = (iteration.prompt_lab_sessions as { image_url: string })?.image_url;
  if (!imageUrl) return res.status(400).json({ error: "session image url missing" });

  try {
    const { jobId, provider } = await submitLabRender({
      imageUrl,
      scene: iteration.director_output_json,
      roomType: iteration.analysis_json?.room_type ?? "other",
      providerOverride: providerOverride === "kling" || providerOverride === "runway" ? providerOverride : null,
    });

    const { data: updated, error: uErr } = await supabase
      .from("prompt_lab_iterations")
      .update({
        provider,
        provider_task_id: jobId,
        render_submitted_at: new Date().toISOString(),
        render_error: null,
      })
      .eq("id", iteration_id)
      .select()
      .single();
    if (uErr) return res.status(500).json({ error: uErr.message });

    return res.status(200).json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("prompt_lab_iterations")
      .update({ render_error: msg })
      .eq("id", iteration_id);
    return res.status(500).json({ error: "render submit failed", detail: msg });
  }
}
