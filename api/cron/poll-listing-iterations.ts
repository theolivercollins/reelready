import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabase } from "../../lib/client.js";
import { AtlasProvider } from "../../lib/providers/atlas.js";
import { recordCostEvent } from "../../lib/db.js";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabase();
  const { data: rendering } = await supabase
    .from("prompt_lab_listing_scene_iterations")
    .select("id, scene_id, provider_task_id, model_used")
    .eq("status", "rendering")
    .not("provider_task_id", "is", null)
    .limit(25);

  if (!rendering || rendering.length === 0) return res.status(200).json({ polled: 0 });

  const provider = new AtlasProvider();
  let finalized = 0;
  let failed = 0;

  for (const iter of rendering) {
    try {
      const status = await provider.checkStatus(iter.provider_task_id!);
      if (status.status === "processing") continue;
      if (status.status === "failed") {
        await supabase
          .from("prompt_lab_listing_scene_iterations")
          .update({ status: "failed", render_error: status.error ?? "unknown" })
          .eq("id", iter.id);
        failed += 1;
        continue;
      }
      await supabase
        .from("prompt_lab_listing_scene_iterations")
        .update({
          status: "rendered",
          clip_url: status.videoUrl,
          cost_cents: status.costCents ?? 0,
        })
        .eq("id", iter.id);

      if (status.costCents && status.costCents > 0) {
        try {
          await recordCostEvent({
            propertyId: null as unknown as string,
            sceneId: null,
            stage: "generation",
            provider: "atlas",
            unitsConsumed: 1,
            unitType: "renders",
            costCents: status.costCents,
            metadata: { scope: "lab_listing", scene_id: iter.scene_id, iteration_id: iter.id, model: iter.model_used },
          });
        } catch (costErr) {
          console.error("[poll-listing-iterations] cost_events record failed:", costErr);
        }
      }
      finalized += 1;
    } catch (err) {
      console.error(`[poll-listing-iterations] ${iter.id}:`, err);
    }
  }

  return res.status(200).json({ polled: rendering.length, finalized, failed });
}
