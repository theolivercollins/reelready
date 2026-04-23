import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabase } from "../../lib/client.js";
import { atlasClipCostCents } from "../../lib/providers/atlas.js";
import { pickProvider, isNativeKling } from "../../lib/providers/dispatch.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabase();
  const { data: rendering } = await supabase
    .from("prompt_lab_listing_scene_iterations")
    .select("id, scene_id, provider_task_id, model_used")
    .eq("status", "rendering")
    .not("provider_task_id", "is", null)
    .limit(25);

  if (!rendering || rendering.length === 0) return res.status(200).json({ polled: 0 });

  let finalized = 0;
  let failed = 0;

  for (const iter of rendering) {
    // DM.3: Pick provider per-iteration. Native Kling iterations
    // (model_used='kling-v2-native') poll through KlingProvider; all
    // other Atlas SKUs continue through AtlasProvider.
    const provider = pickProvider(iter.model_used);
    try {
      const status = await provider.checkStatus(iter.provider_task_id!);
      if (status.status === "processing") continue;
      if (status.status === "failed") {
        await supabase
          .from("prompt_lab_listing_scene_iterations")
          .update({ status: "failed", render_error: status.error ?? "unknown" })
          .eq("id", iter.id);

        // CI.4: Record cost even for failed renders — over-attribute rather
        // than under-attribute. Provider invoices may charge for the attempt.
        // Native Kling: 0¢ (pre-paid credits; Kling refunds on failure).
        const nativeKlingFailed = isNativeKling(iter.model_used);
        const failedCostCents = nativeKlingFailed ? 0 : atlasClipCostCents(iter.model_used);
        try {
          await supabase.from("cost_events").insert({
            property_id: null,
            scene_id: null,
            stage: "generation",
            provider: nativeKlingFailed ? "kling" : "atlas",
            units_consumed: 1,
            unit_type: "renders",
            cost_cents: failedCostCents,
            metadata: nativeKlingFailed
              ? {
                  scope: "lab_listing",
                  scene_id: iter.scene_id,
                  iteration_id: iter.id,
                  model: iter.model_used,
                  billing: "prepaid_credits_failed_refunded",
                  render_outcome: "failed",
                }
              : {
                  scope: "lab_listing",
                  scene_id: iter.scene_id,
                  iteration_id: iter.id,
                  model: iter.model_used,
                  render_outcome: "failed",
                },
          });
        } catch (costErr) {
          console.error("[poll-listing-iterations] failed cost_events insert:", costErr);
        }
        failed += 1;
        continue;
      }

      // Cost is computed from the iteration's actual model_used — NOT
      // from provider.checkStatus, which returns the AtlasProvider's
      // default-model price regardless of which SKU rendered. Atlas
      // bills per-second × clip duration; atlasClipCostCents wraps
      // the ATLAS_MODELS lookup + default 5s clip multiplier.
      // Native Kling: $0 (pre-paid credits — no per-clip cash cost).
      const nativeKling = isNativeKling(iter.model_used);
      const costCents = nativeKling ? 0 : atlasClipCostCents(iter.model_used);

      // Rehost the clip into Supabase Storage so URLs never expire.
      // Kling native returns signed URLs with ksTime expiry; Atlas CDN URLs
      // also rotate. Without rehosting, old iterations play as "just a
      // keyframe" once the provider URL dies.
      let persistedUrl = status.videoUrl!;
      try {
        const buffer = await provider.downloadClip(status.videoUrl!);
        const path = `lab-listing/${iter.scene_id}/${iter.id}.mp4`;
        const { error: upErr } = await supabase.storage
          .from("property-videos")
          .upload(path, buffer, { contentType: "video/mp4", upsert: true });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("property-videos").getPublicUrl(path);
          persistedUrl = pub.publicUrl;
        } else {
          console.error(`[poll-listing-iterations] rehost upload failed for ${iter.id}:`, upErr);
        }
      } catch (rehostErr) {
        console.error(`[poll-listing-iterations] rehost failed for ${iter.id}:`, rehostErr);
      }

      await supabase
        .from("prompt_lab_listing_scene_iterations")
        .update({
          status: "rendered",
          clip_url: persistedUrl,
          cost_cents: costCents,
        })
        .eq("id", iter.id);

      // Per the cost-tracking directive, every API call logs an event
      // even if cost is zero. Native Kling records provider='kling',
      // cost_cents=0, metadata.billing='prepaid_credits' so we retain
      // a per-render audit trail even when cash cost is 0.
      try {
        await supabase.from("cost_events").insert({
          property_id: null,
          scene_id: null,
          stage: "generation",
          provider: nativeKling ? "kling" : "atlas",
          units_consumed: 1,
          unit_type: "renders",
          cost_cents: costCents,
          metadata: nativeKling
            ? { scope: "lab_listing", scene_id: iter.scene_id, iteration_id: iter.id, model: iter.model_used, billing: "prepaid_credits" }
            : { scope: "lab_listing", scene_id: iter.scene_id, iteration_id: iter.id, model: iter.model_used },
        });
      } catch (costErr) {
        console.error("[poll-listing-iterations] cost_events insert failed:", costErr);
      }
      finalized += 1;
    } catch (err) {
      console.error(`[poll-listing-iterations] ${iter.id}:`, err);
    }
  }

  return res.status(200).json({ polled: rendering.length, finalized, failed });
}
