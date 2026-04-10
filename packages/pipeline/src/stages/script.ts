import type { Job } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import {
  getSelectedPhotos,
  insertScenes,
  updatePropertyStatus,
  log,
  addPropertyCost,
} from "@reelready/db";
import type { ScriptingJobData } from "../queue/setup.js";
import { generationQueue } from "../queue/setup.js";
import {
  DIRECTOR_SYSTEM,
  buildDirectorUserPrompt,
  type DirectorOutput,
} from "../prompts/director.js";
import { estimateScriptingCost } from "../utils/cost-tracker.js";

export async function processScripting(
  job: Job<ScriptingJobData>
): Promise<void> {
  const { propertyId } = job.data;

  await updatePropertyStatus(propertyId, "scripting");
  await log(propertyId, "scripting", "info", "Starting shot planning");

  const photos = await getSelectedPhotos(propertyId);

  if (photos.length === 0) {
    await updatePropertyStatus(propertyId, "failed");
    await log(propertyId, "scripting", "error", "No selected photos found");
    return;
  }

  const client = new Anthropic();

  const photoData = photos.map((p) => ({
    id: p.id,
    file_name: p.file_name ?? "unknown.jpg",
    room_type: p.room_type ?? "other",
    aesthetic_score: p.aesthetic_score ?? 5,
    depth_rating: p.depth_rating ?? "medium",
    key_features: p.key_features ?? [],
  }));

  const response = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 4096,
    system: DIRECTOR_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildDirectorUserPrompt(photoData),
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    await updatePropertyStatus(propertyId, "failed");
    await log(propertyId, "scripting", "error", "Failed to parse director output");
    return;
  }

  const output: DirectorOutput = JSON.parse(jsonMatch[0]);

  // Validate that all photo_ids reference real photos
  const validPhotoIds = new Set(photos.map((p) => p.id));
  const validScenes = output.scenes.filter((s) =>
    validPhotoIds.has(s.photo_id)
  );

  if (validScenes.length === 0) {
    await updatePropertyStatus(propertyId, "failed");
    await log(propertyId, "scripting", "error", "No valid scenes in director output");
    return;
  }

  // Insert scenes into DB
  const scenes = await insertScenes(
    validScenes.map((s) => ({
      property_id: propertyId,
      photo_id: s.photo_id,
      scene_number: s.scene_number,
      camera_movement: s.camera_movement,
      prompt: s.prompt,
      duration_seconds: s.duration_seconds,
      provider: s.provider_preference ?? undefined,
    }))
  );

  const cost = estimateScriptingCost();
  await addPropertyCost(propertyId, cost);

  await log(
    propertyId,
    "scripting",
    "info",
    `Shot plan complete: ${scenes.length} scenes, mood: ${output.mood}, music: ${output.music_tag}`,
    { mood: output.mood, musicTag: output.music_tag, sceneCount: scenes.length }
  );

  // Fan out: enqueue one generation job per scene (all run in parallel)
  await updatePropertyStatus(propertyId, "generating");

  for (const scene of scenes) {
    await generationQueue.add(
      `generate-${scene.scene_number}`,
      { propertyId, sceneId: scene.id },
      { priority: scene.scene_number } // process in order when concurrency is limited
    );
  }

  await log(
    propertyId,
    "scripting",
    "info",
    `Enqueued ${scenes.length} generation jobs`
  );
}
