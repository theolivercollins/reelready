import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase, updateScene, log, recordCostEvent } from "../../../lib/db.js";
import { selectProvider, getEnabledProviders } from "../../../lib/providers/router.js";
import { classifyProviderError } from "../../../lib/providers/errors.js";
import type { CameraMovement, RoomType, VideoProvider } from "../../../lib/types.js";

export const maxDuration = 120;

// POST /api/scenes/:id/resubmit
// body: { prompt?, provider?, camera_movement?, duration_seconds? }
//
// Manual single-scene resubmission. Unlocks three previously-painful
// scenarios the docs flagged (`docs/PROJECT-STATE.md` Known bugs):
//
//   1. Stuck Kling scenes at `needs_review` from earlier properties
//      (the 6f508e16 case). Admin clicks "Resubmit" in the dashboard;
//      this endpoint clears the failed task_id, runs the failover
//      classifier, and submits to whatever provider is requested (or
//      the next available one if the current provider is burned).
//   2. Admin-edited prompts on a needs_review scene — the edit is
//      applied then the scene is submitted.
//   3. Provider forcing — admin can say "send this one to Runway" to
//      compare output quality.
//
// Implementation mirrors `lib/pipeline.ts#runGenerationSubmit` but is
// scoped to one scene so it can return synchronously in <30s. The cron
// poller at `/api/cron/poll-scenes` picks up the new task_id and
// downloads + finalizes once it completes.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const sceneId = req.query.id as string;
  const { prompt, provider: providerOverride, camera_movement, duration_seconds } = (req.body ?? {}) as {
    prompt?: string;
    provider?: VideoProvider;
    camera_movement?: CameraMovement;
    duration_seconds?: number;
  };

  const supabase = getSupabase();
  const { data: scene, error } = await supabase
    .from("scenes")
    .select("id, property_id, photo_id, scene_number, camera_movement, prompt, duration_seconds, attempt_count")
    .eq("id", sceneId)
    .single();
  if (error || !scene) return res.status(404).json({ error: "scene not found" });

  const { data: photo } = await supabase
    .from("photos")
    .select("file_url, room_type")
    .eq("id", scene.photo_id)
    .single();
  if (!photo) return res.status(404).json({ error: "source photo not found" });

  // Apply any admin overrides before submission.
  const patch: Record<string, unknown> = {};
  if (typeof prompt === "string" && prompt.trim().length > 0) patch.prompt = prompt.trim();
  if (camera_movement) patch.camera_movement = camera_movement;
  if (typeof duration_seconds === "number" && duration_seconds > 0) patch.duration_seconds = duration_seconds;
  if (Object.keys(patch).length > 0) await updateScene(sceneId, patch);

  const finalPrompt: string = (patch.prompt as string | undefined) ?? scene.prompt;
  const finalMovement = (patch.camera_movement as CameraMovement | undefined) ?? (scene.camera_movement as CameraMovement);
  const finalDuration = (patch.duration_seconds as number | undefined) ?? scene.duration_seconds;

  // Reset provider-side state so the cron doesn't race on the stale id.
  await supabase
    .from("scenes")
    .update({
      provider_task_id: null,
      clip_url: null,
      generation_cost_cents: null,
      generation_time_ms: null,
      qc_verdict: null,
      qc_confidence: null,
      status: "pending",
    })
    .eq("id", sceneId);

  const photoResponse = await fetch(photo.file_url);
  const sourceImage = Buffer.from(await photoResponse.arrayBuffer());
  const roomType = (photo.room_type as RoomType) ?? "other";

  const excluded: VideoProvider[] = [];
  const maxFailovers = Math.max(getEnabledProviders().length - 1, 1);
  let lastError: { message: string; kind: string; provider: string } | null = null;

  for (let attempt = 0; attempt <= maxFailovers; attempt++) {
    const provider = selectProvider(roomType, finalMovement ?? null, providerOverride ?? null, excluded);
    try {
      const genJob = await provider.generateClip({
        sourceImage,
        sourceImageUrl: photo.file_url,
        prompt: finalPrompt,
        durationSeconds: finalDuration,
        aspectRatio: "16:9",
      });

      const nextAttemptCount = (scene.attempt_count ?? 0) + 1;
      await supabase
        .from("scenes")
        .update({
          provider: provider.name,
          provider_task_id: genJob.jobId,
          submitted_at: new Date().toISOString(),
          status: "generating",
          attempt_count: nextAttemptCount,
        })
        .eq("id", sceneId);

      await log(scene.property_id, "generation", "info",
        `Scene ${scene.scene_number}: resubmitted to ${provider.name} (attempt ${nextAttemptCount}, admin=${auth.user.id})`,
        { jobId: genJob.jobId, attempt: nextAttemptCount, admin: auth.user.id }, sceneId);

      return res.status(200).json({
        ok: true,
        provider: provider.name,
        jobId: genJob.jobId,
        attempt: nextAttemptCount,
      });
    } catch (err) {
      const classified = classifyProviderError(err);
      lastError = { message: classified.message, kind: classified.kind, provider: provider.name };

      if (!classified.shouldFailover) {
        await log(scene.property_id, "generation", "warn",
          `Scene ${scene.scene_number}: ${provider.name} ${classified.kind} on resubmit: ${classified.message}`,
          { status: classified.status, kind: classified.kind }, sceneId);
        // For capacity/transient, leave status=pending so the cron can try.
        return res.status(503).json({
          ok: false,
          kind: classified.kind,
          provider: provider.name,
          message: classified.message,
          willRetryViaCron: true,
        });
      }

      excluded.push(provider.name as VideoProvider);
      await log(scene.property_id, "generation", "warn",
        `Scene ${scene.scene_number}: ${provider.name} permanent error on resubmit, failing over: ${classified.message}`,
        { status: classified.status, kind: classified.kind, excluded }, sceneId);
      // Silence unused-import warning on recordCostEvent (reserved for future
      // per-retry cost attribution; currently the cron records the cost once
      // the clip lands).
      void recordCostEvent;
    }
  }

  // All providers exhausted.
  await supabase
    .from("scenes")
    .update({ status: "needs_review" })
    .eq("id", sceneId);
  await log(scene.property_id, "generation", "error",
    `Scene ${scene.scene_number}: resubmit failed across ${excluded.length} provider(s): ${lastError?.message ?? "unknown"}`,
    { lastError, excluded }, sceneId);

  return res.status(502).json({
    ok: false,
    kind: lastError?.kind ?? "unknown",
    message: lastError?.message ?? "All providers failed",
    excluded,
  });
}
