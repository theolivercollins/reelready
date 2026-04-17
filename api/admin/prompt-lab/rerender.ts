import type { VercelRequest, VercelResponse } from "@vercel/node";

export const maxDuration = 60;

import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";
import {
  submitLabRender,
  ProviderCapacityError,
  getNextIterationNumber,
  ANALYSIS_PROMPT_HASH,
  DIRECTOR_PROMPT_HASH,
} from "../../../lib/prompt-lab.js";

// POST /api/admin/prompt-lab/rerender
//   body: { source_iteration_id, provider }
// Clones analysis + director from source iteration into a new iteration,
// then submits to the specified provider. Each provider attempt gets its
// own iteration → its own rating → recipe captures the winning provider.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { source_iteration_id, provider } = (req.body ?? {}) as {
    source_iteration_id?: string;
    provider?: "kling" | "runway";
  };
  if (!source_iteration_id || !provider) {
    return res.status(400).json({ error: "source_iteration_id and provider required" });
  }

  const supabase = getSupabase();
  const { data: source, error: sErr } = await supabase
    .from("prompt_lab_iterations")
    .select("*, prompt_lab_sessions(image_url)")
    .eq("id", source_iteration_id)
    .single();
  if (sErr || !source) return res.status(404).json({ error: "source iteration not found" });
  if (!source.director_output_json) {
    return res.status(400).json({ error: "source iteration has no director output" });
  }

  const imageUrl = (source.prompt_lab_sessions as { image_url: string })?.image_url;
  if (!imageUrl) return res.status(400).json({ error: "session image url missing" });

  const iterationNumber = await getNextIterationNumber(source.session_id);

  const { data: newIteration, error: iErr } = await supabase
    .from("prompt_lab_iterations")
    .insert({
      session_id: source.session_id,
      iteration_number: iterationNumber,
      analysis_json: source.analysis_json,
      analysis_prompt_hash: source.analysis_prompt_hash ?? ANALYSIS_PROMPT_HASH,
      director_output_json: source.director_output_json,
      director_prompt_hash: source.director_prompt_hash ?? DIRECTOR_PROMPT_HASH,
      cost_cents: 0,
      embedding: source.embedding ?? null,
      embedding_model: source.embedding_model ?? null,
      retrieval_metadata: source.retrieval_metadata ?? null,
      user_comment: `[rerender] Same prompt, trying ${provider} (source: iteration ${source.iteration_number})`,
    })
    .select()
    .single();
  if (iErr) return res.status(500).json({ error: iErr.message });

  try {
    const scene = source.director_output_json as any;
    const roomType = (source.analysis_json as any)?.room_type ?? "other";
    const { jobId, provider: usedProvider } = await submitLabRender({
      imageUrl,
      scene,
      roomType,
      providerOverride: provider,
    });

    await supabase
      .from("prompt_lab_iterations")
      .update({
        provider: usedProvider,
        provider_task_id: jobId,
        render_submitted_at: new Date().toISOString(),
        render_error: null,
      })
      .eq("id", newIteration.id);

    return res.status(201).json({
      iteration: { ...newIteration, provider: usedProvider, provider_task_id: jobId },
      source_iteration_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ProviderCapacityError) {
      await supabase
        .from("prompt_lab_iterations")
        .update({
          provider: (err as ProviderCapacityError).provider,
          render_queued_at: new Date().toISOString(),
          render_error: null,
        })
        .eq("id", newIteration.id);
      return res.status(200).json({
        iteration: newIteration,
        queued: true,
        provider,
        message: `${provider} is full. Queued — will auto-submit when a slot opens.`,
      });
    }
    await supabase
      .from("prompt_lab_iterations")
      .update({ render_error: msg })
      .eq("id", newIteration.id);
    return res.status(500).json({ error: "rerender submit failed", detail: msg });
  }
}
