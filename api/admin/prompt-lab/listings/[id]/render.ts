import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../../../lib/auth.js";
import { getSupabase } from "../../../../../lib/client.js";
import { AtlasProvider } from "../../../../../lib/providers/atlas.js";
import { sanitizeDirectorPrompt } from "../../../../../lib/sanitize-prompt.js";

// Kling v3 needs explicit stabilization language in the positive prompt
// — "smooth / steady / cinematic" alone is insufficient. This prefix
// pairs with the ATLAS_DEFAULT_NEGATIVE_PROMPT in the provider to force
// a locked camera feel across every v3 render.
// DQ.2: Applied only to kling-v3* models. v2.x and o3-pro produce stable
// motion without it — prepending 180 chars of fluff to those models adds
// noise without benefit.
const CAMERA_STABILITY_PREFIX =
  "LOCKED-OFF CAMERA on a gimbal-stabilized Steadicam rig. Smooth motorized dolly motion only. Zero camera shake, zero handheld jitter, tripod-stable framing. ";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const id = String(req.query.id ?? "");
  if (!id) return res.status(400).json({ error: "id required" });

  const body = (req.body ?? {}) as {
    scene_ids?: string[] | "all";
    model_override?: string;
    models?: string[];
    source_iteration_id?: string;
  };
  // When `models` is supplied, submit one iteration per model — the
  // "Generate with all models" flow. model_override is ignored in
  // that case; each model becomes its own iteration row.
  const modelsToRender: string[] = body.models && body.models.length > 0
    ? body.models
    : [body.model_override ?? ""].filter(Boolean);
  const supabase = getSupabase();
  const { data: listing } = await supabase.from("prompt_lab_listings").select("model_name").eq("id", id).maybeSingle();
  if (!listing) return res.status(404).json({ error: "listing not found" });

  let sceneIds: string[];
  let sourceIteration: { director_prompt: string } | null = null;
  if (body.source_iteration_id) {
    const { data: srcIter } = await supabase.from("prompt_lab_listing_scene_iterations")
      .select("id, scene_id, director_prompt").eq("id", body.source_iteration_id).maybeSingle();
    if (!srcIter) return res.status(404).json({ error: "source iteration not found" });
    sceneIds = [srcIter.scene_id];
    sourceIteration = { director_prompt: srcIter.director_prompt };
  } else if (body.scene_ids === "all" || !body.scene_ids) {
    const { data } = await supabase.from("prompt_lab_listing_scenes").select("id").eq("listing_id", id);
    sceneIds = (data ?? []).map((s) => s.id);
  } else {
    sceneIds = body.scene_ids;
  }

  const provider = new AtlasProvider();
  const results: Array<{ scene_id: string; iteration_id: string; task_id: string }> = [];

  for (const sceneId of sceneIds) {
    const { data: scene } = await supabase.from("prompt_lab_listing_scenes")
      .select("id, photo_id, end_image_url, director_prompt, refinement_notes, use_end_frame").eq("id", sceneId).maybeSingle();
    if (!scene) continue;
    const effectiveEndImage = scene.use_end_frame && scene.end_image_url ? scene.end_image_url : undefined;

    // DQ.3: Detect paired scenes. A scene is "paired" when use_end_frame
    // is true AND an end_image_url has been set. Paired scenes should
    // route to kling-v2-1-pair (the SKU purpose-built for start+end frame
    // rendering) UNLESS the caller explicitly supplied body.models[] —
    // that's the Compare-models flow where the user is intentionally
    // testing multiple models and we must respect their selections verbatim.
    const isPaired = !!(scene.use_end_frame && scene.end_image_url);

    // DQ.5: Refinement-notes rewrite pass. If the scene has accumulated
    // notes, rewrite the director_prompt to incorporate them and clear
    // the notes — instead of appending them as a separate block (which
    // produces 400–500 char prompts that confuse video models).
    // Skip entirely when regenerating from a source iteration (the source
    // prompt already reflects prior refinements, or the user wants it verbatim).
    let basePrompt = sanitizeDirectorPrompt(
      sourceIteration ? sourceIteration.director_prompt : scene.director_prompt
    );
    // Belt-and-braces: also sanitize refinement_notes in case the stability
    // prefix leaked into notes from an older chat session.
    const sanitizedNotes = scene.refinement_notes
      ? sanitizeDirectorPrompt(scene.refinement_notes)
      : null;
    if (!sourceIteration && sanitizedNotes && sanitizedNotes.trim().length > 0) {
      try {
        const { rewritePromptWithDirectives } = await import("../../../../../lib/refine-prompt.js");
        const { rewritten } = await rewritePromptWithDirectives({
          basePrompt,
          directives: sanitizedNotes!,
          isPaired,
        });
        basePrompt = rewritten;
        await supabase.from("prompt_lab_listing_scenes")
          .update({ director_prompt: rewritten, refinement_notes: null })
          .eq("id", sceneId);
      } catch (rewriteErr) {
        console.warn(`[render DQ.5] rewrite failed, falling back to concat:`, rewriteErr);
        basePrompt = sanitizedNotes
          ? `${basePrompt}\n\nADDITIONAL USER DIRECTIVES FROM PRIOR ITERATIONS:\n${sanitizedNotes}`
          : basePrompt;
      }
    }

    const { data: photo } = await supabase.from("prompt_lab_listing_photos")
      .select("image_url").eq("id", scene.photo_id).maybeSingle();
    if (!photo) continue;

    const modelsForScene = modelsToRender.length > 0 ? modelsToRender : [listing.model_name];
    for (const modelKey of modelsForScene) {
      // DQ.3: Auto-route paired scenes to kling-v2-1-pair — the SKU
      // purpose-built for start+end frame rendering. Only applies when
      // the caller did NOT supply body.models[] (the Compare-models flow);
      // in that flow the user has intentionally chosen specific models and
      // we must not override them.
      const resolvedModel = isPaired && (!body.models || body.models.length === 0)
        ? "kling-v2-1-pair"
        : modelKey;

      // DQ.2: Stability prefix only helps v3 (known shake issue).
      // v2.x and o3 produce stable motion natively — prepending 180 chars
      // of fluff to those models wastes prompt space without benefit.
      const needsStabilityPrefix = resolvedModel.startsWith("kling-v3");
      const effectivePrompt = needsStabilityPrefix && !basePrompt.includes("LOCKED-OFF CAMERA")
        ? `${CAMERA_STABILITY_PREFIX}${basePrompt}`
        : basePrompt;

      const { data: existing } = await supabase.from("prompt_lab_listing_scene_iterations")
        .select("iteration_number").eq("scene_id", sceneId)
        .order("iteration_number", { ascending: false }).limit(1).maybeSingle();
      const iterationNumber = (existing?.iteration_number ?? 0) + 1;

      const { data: iter, error: iterErr } = await supabase.from("prompt_lab_listing_scene_iterations").insert({
        scene_id: sceneId,
        iteration_number: iterationNumber,
        director_prompt: effectivePrompt,
        model_used: resolvedModel,
        status: "submitting",
      }).select().single();
      if (iterErr || !iter) continue;

      try {
        const job = await provider.generateClip({
          sourceImage: Buffer.from(""),
          sourceImageUrl: photo.image_url,
          endImageUrl: effectiveEndImage,
          prompt: effectivePrompt,
          durationSeconds: 5,
          aspectRatio: "16:9",
          modelOverride: resolvedModel,
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
  }

  await supabase.from("prompt_lab_listings").update({ status: "rendering" }).eq("id", id);
  return res.status(200).json({ submitted: results });
}
