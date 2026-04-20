import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../../../lib/auth.js";
import { getSupabase } from "../../../../../lib/client.js";
import { AtlasProvider } from "../../../../../lib/providers/atlas.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const id = String(req.query.id ?? "");
  if (!id) return res.status(400).json({ error: "id required" });

  const body = (req.body ?? {}) as { scene_ids?: string[] | "all"; model_override?: string };
  const supabase = getSupabase();
  const { data: listing } = await supabase.from("prompt_lab_listings").select("model_name").eq("id", id).maybeSingle();
  if (!listing) return res.status(404).json({ error: "listing not found" });

  let sceneIds: string[];
  if (body.scene_ids === "all" || !body.scene_ids) {
    const { data } = await supabase.from("prompt_lab_listing_scenes").select("id").eq("listing_id", id);
    sceneIds = (data ?? []).map((s) => s.id);
  } else {
    sceneIds = body.scene_ids;
  }

  const provider = new AtlasProvider();
  const results: Array<{ scene_id: string; iteration_id: string; task_id: string }> = [];

  for (const sceneId of sceneIds) {
    const { data: scene } = await supabase.from("prompt_lab_listing_scenes")
      .select("id, photo_id, end_image_url, director_prompt, refinement_notes").eq("id", sceneId).maybeSingle();
    if (!scene) continue;
    const effectivePrompt = scene.refinement_notes
      ? `${scene.director_prompt}\n\nADDITIONAL USER DIRECTIVES FROM PRIOR ITERATIONS:\n${scene.refinement_notes}`
      : scene.director_prompt;
    const { data: photo } = await supabase.from("prompt_lab_listing_photos")
      .select("image_url").eq("id", scene.photo_id).maybeSingle();
    if (!photo) continue;
    const { data: existing } = await supabase.from("prompt_lab_listing_scene_iterations")
      .select("iteration_number").eq("scene_id", sceneId)
      .order("iteration_number", { ascending: false }).limit(1).maybeSingle();
    const iterationNumber = (existing?.iteration_number ?? 0) + 1;

    const { data: iter, error: iterErr } = await supabase.from("prompt_lab_listing_scene_iterations").insert({
      scene_id: sceneId,
      iteration_number: iterationNumber,
      director_prompt: effectivePrompt,
      model_used: body.model_override ?? listing.model_name,
      status: "submitting",
    }).select().single();
    if (iterErr || !iter) continue;

    try {
      const job = await provider.generateClip({
        sourceImage: Buffer.from(""),
        sourceImageUrl: photo.image_url,
        endImageUrl: scene.end_image_url ?? undefined,
        prompt: effectivePrompt,
        durationSeconds: 5,
        aspectRatio: "16:9",
        modelOverride: body.model_override,
      });
      await supabase.from("prompt_lab_listing_scene_iterations")
        .update({ provider_task_id: job.jobId, status: "rendering" }).eq("id", iter.id);
      results.push({ scene_id: sceneId, iteration_id: iter.id, task_id: job.jobId });
    } catch (err) {
      await supabase.from("prompt_lab_listing_scene_iterations")
        .update({ status: "failed", render_error: err instanceof Error ? err.message : String(err) })
        .eq("id", iter.id);
    }
  }

  await supabase.from("prompt_lab_listings").update({ status: "rendering" }).eq("id", id);
  return res.status(200).json({ submitted: results });
}
