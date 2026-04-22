import type { VercelRequest, VercelResponse } from "@vercel/node";

export const maxDuration = 60;

import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";
import { submitLabRender, ProviderCapacityError } from "../../../lib/prompt-lab.js";
import { resolveEndFrameUrl } from "../../../lib/services/end-frame.js";
import { V1_ATLAS_SKUS, type V1AtlasSku } from "../../../lib/providers/atlas.js";

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

  const { iteration_id, provider: providerOverride, sku: skuParam } = (req.body ?? {}) as {
    iteration_id?: string;
    provider?: "kling" | "runway" | null;
    sku?: string | null;
  };
  if (!iteration_id) return res.status(400).json({ error: "iteration_id required" });

  // Validate sku if provided — must be one of the V1 allow-list SKUs.
  let sku: V1AtlasSku | null = null;
  if (skuParam != null) {
    if (!(V1_ATLAS_SKUS as readonly string[]).includes(skuParam)) {
      return res.status(400).json({
        error: `sku="${skuParam}" is not a valid V1 Atlas SKU. Valid: ${V1_ATLAS_SKUS.join(", ")}`,
      });
    }
    sku = skuParam as V1AtlasSku;
  }

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

  // Phase 2.7: resolve the end-frame URL for Atlas start+end keyframe
  // interpolation. If the director paired another Lab session (via
  // director_output_json.end_photo_id), look up that session's
  // image_url. Otherwise resolveEndFrameUrl falls back to a sharp crop
  // of the start photo.
  const director = iteration.director_output_json as { end_photo_id?: string } | null;
  let endPhotoUrl: string | null = null;
  if (director?.end_photo_id) {
    const { data: endSession } = await supabase
      .from("prompt_lab_sessions")
      .select("image_url")
      .eq("id", director.end_photo_id)
      .maybeSingle();
    endPhotoUrl = endSession?.image_url ?? null;
  }

  const endImageUrl = await resolveEndFrameUrl({
    startPhotoUrl: imageUrl,
    endPhotoUrl,
  });

  // Persist onto the iteration so the dashboard can display the
  // resolved URL and audit the end-frame decision.
  await supabase
    .from("prompt_lab_iterations")
    .update({
      end_photo_id: director?.end_photo_id ?? null,
      end_image_url: endImageUrl,
    })
    .eq("id", iteration_id);

  try {
    const { jobId, provider, sku: resolvedSku } = await submitLabRender({
      imageUrl,
      scene: iteration.director_output_json,
      roomType: iteration.analysis_json?.room_type ?? "other",
      providerOverride: providerOverride === "kling" || providerOverride === "runway" ? providerOverride : null,
      endImageUrl,
      sku,
    });

    const { data: updated, error: uErr } = await supabase
      .from("prompt_lab_iterations")
      .update({
        provider,
        provider_task_id: jobId,
        render_submitted_at: new Date().toISOString(),
        render_error: null,
        model_used: resolvedSku,
        sku_source: "captured_at_render",
      })
      .eq("id", iteration_id)
      .select()
      .single();
    if (uErr) return res.status(500).json({ error: uErr.message });

    return res.status(200).json({ ...updated, sku: resolvedSku });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ProviderCapacityError) {
      // Queue instead of erroring — cron will submit when a slot opens.
      await supabase
        .from("prompt_lab_iterations")
        .update({
          provider: err.provider,
          render_queued_at: new Date().toISOString(),
          render_error: null,
        })
        .eq("id", iteration_id);
      return res.status(200).json({
        queued: true,
        provider: err.provider,
        in_flight: err.inFlight,
        limit: err.limit,
        message: `${err.provider} is full (${err.inFlight}/${err.limit}). Queued — will auto-submit when a slot opens.`,
      });
    }
    await supabase
      .from("prompt_lab_iterations")
      .update({ render_error: msg })
      .eq("id", iteration_id);
    return res.status(500).json({ error: "render submit failed", detail: msg });
  }
}
