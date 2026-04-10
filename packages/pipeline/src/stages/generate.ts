import type { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import {
  updateSceneStatus,
  log,
  addPropertyCost,
} from "@reelready/db";
import { getSupabase } from "@reelready/db";
import type { RoomType, VideoProvider } from "@reelready/db";
import type { GenerationJobData } from "../queue/setup.js";
import { qcQueue } from "../queue/setup.js";
import { selectProvider } from "../providers/router.js";
import { pollUntilComplete } from "../providers/provider.interface.js";
import { estimateGenerationCost } from "../utils/cost-tracker.js";

const TEMP_DIR = process.env.TEMP_DIR || "/tmp/reelready";

export async function processGeneration(
  job: Job<GenerationJobData>
): Promise<void> {
  const { propertyId, sceneId } = job.data;
  const supabase = getSupabase();

  // Fetch scene details
  const { data: scene, error } = await supabase
    .from("scenes")
    .select("*, photos(*)")
    .eq("id", sceneId)
    .single();

  if (error || !scene) {
    await log(propertyId, "generation", "error", `Scene ${sceneId} not found`);
    return;
  }

  const attemptCount = (scene.attempt_count ?? 0) + 1;
  const maxRetries = parseInt(process.env.MAX_RETRIES_PER_CLIP ?? "2", 10);

  await updateSceneStatus(sceneId, "generating", {
    attempt_count: attemptCount,
  });

  await log(
    propertyId,
    "generation",
    "info",
    `Generating scene ${scene.scene_number} (attempt ${attemptCount})`,
    { provider: scene.provider, movement: scene.camera_movement },
    sceneId
  );

  // Determine which providers to exclude (used on retries)
  const excludeProviders: VideoProvider[] = [];
  if (scene.status === "qc_hard_reject" && scene.provider) {
    excludeProviders.push(scene.provider as VideoProvider);
  }

  // Select provider
  const provider = selectProvider(
    scene.room_type as RoomType,
    scene.provider as VideoProvider | null,
    excludeProviders
  );

  try {
    // Download the source photo
    const photoUrl = scene.photos?.file_url ?? scene.photo_id;
    const photoResponse = await fetch(photoUrl);
    if (!photoResponse.ok) throw new Error("Failed to download source photo");
    const sourceImage = Buffer.from(await photoResponse.arrayBuffer());

    const startTime = Date.now();

    // Submit generation
    const genJob = await provider.generateClip({
      sourceImage,
      prompt: scene.prompt,
      durationSeconds: scene.duration_seconds,
      aspectRatio: "16:9",
    });

    await log(
      propertyId,
      "generation",
      "info",
      `Submitted to ${provider.name}, job: ${genJob.jobId}`,
      { provider: provider.name, jobId: genJob.jobId },
      sceneId
    );

    // Poll until complete
    const result = await pollUntilComplete(provider, genJob.jobId);

    const generationTimeMs = Date.now() - startTime;

    if (result.status === "failed") {
      throw new Error(result.error ?? "Generation failed");
    }

    // Download the generated clip
    const clipBuffer = await provider.downloadClip(result.videoUrl!);

    // Upload to storage
    const clipStoragePath = `${propertyId}/clips/scene_${scene.scene_number}_v${attemptCount}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from("property-videos")
      .upload(clipStoragePath, clipBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage
      .from("property-videos")
      .getPublicUrl(clipStoragePath);

    // Calculate cost
    const costCents =
      result.costCents ?? estimateGenerationCost(provider.name, scene.duration_seconds);

    await updateSceneStatus(sceneId, "generating", {
      clip_url: urlData.publicUrl,
      provider: provider.name,
      generation_cost_cents: costCents,
      generation_time_ms: generationTimeMs,
    });

    await addPropertyCost(propertyId, costCents);

    await log(
      propertyId,
      "generation",
      "info",
      `Scene ${scene.scene_number} generated in ${(generationTimeMs / 1000).toFixed(1)}s via ${provider.name} (${costCents}¢)`,
      { costCents, generationTimeMs, provider: provider.name },
      sceneId
    );

    // Enqueue QC
    await qcQueue.add(`qc-${scene.scene_number}`, { propertyId, sceneId });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (attemptCount >= maxRetries) {
      await updateSceneStatus(sceneId, "needs_review");
      await log(
        propertyId,
        "generation",
        "error",
        `Scene ${scene.scene_number} failed after ${attemptCount} attempts: ${errorMsg}`,
        undefined,
        sceneId
      );
    } else {
      await updateSceneStatus(sceneId, "pending", {
        attempt_count: attemptCount,
      });
      // Re-enqueue for retry
      await generationQueue.add(
        `generate-${scene.scene_number}-retry-${attemptCount}`,
        { propertyId, sceneId },
        { delay: 5000 * attemptCount } // backoff
      );
      await log(
        propertyId,
        "generation",
        "warn",
        `Scene ${scene.scene_number} failed, retrying: ${errorMsg}`,
        undefined,
        sceneId
      );
    }
  }
}
