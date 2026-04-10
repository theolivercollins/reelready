import type { Job } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
import {
  getPhotosForProperty,
  updatePhotoAnalysis,
  updatePropertyStatus,
  log,
  addPropertyCost,
} from "@reelready/db";
import type { RoomType, DepthRating, Photo } from "@reelready/db";
import { getSupabase } from "@reelready/db";
import type { AnalysisJobData } from "../queue/setup.js";
import { scriptingQueue } from "../queue/setup.js";
import {
  PHOTO_ANALYSIS_SYSTEM,
  buildAnalysisUserPrompt,
  type PhotoAnalysisResult,
} from "../prompts/photo-analysis.js";
import { imageToBase64, getMediaType } from "../utils/image-processing.js";
import { estimateAnalysisCost } from "../utils/cost-tracker.js";

const BATCH_SIZE = 8;
const MIN_PHOTOS_FOR_VIDEO = 6;
const TARGET_SCENE_COUNT = 12;
const MAX_PER_ROOM_TYPE = 2;

// Minimum room types that must be represented
const REQUIRED_ROOM_TYPES: RoomType[] = [
  "exterior_front",
  "kitchen",
  "living_room",
  "master_bedroom",
  "bathroom",
];

export async function processAnalysis(
  job: Job<AnalysisJobData>
): Promise<void> {
  const { propertyId } = job.data;

  await updatePropertyStatus(propertyId, "analyzing");
  await log(propertyId, "analysis", "info", "Starting photo analysis");

  const photos = await getPhotosForProperty(propertyId);
  const client = new Anthropic();
  const allResults: Array<{ photo: Photo; analysis: PhotoAnalysisResult }> = [];

  // Process photos in batches to manage API costs
  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    const batch = photos.slice(i, i + BATCH_SIZE);

    // Download and encode images for the batch
    const imageContents: Anthropic.ImageBlockParam[] = [];
    for (const photo of batch) {
      try {
        const response = await fetch(photo.file_url);
        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = await imageToBase64(buffer);
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: getMediaType(photo.file_name ?? "photo.jpg"),
            data: base64,
          },
        });
      } catch (err) {
        await log(
          propertyId,
          "analysis",
          "warn",
          `Failed to load photo ${photo.file_name}: ${err}`,
          undefined,
        );
      }
    }

    if (imageContents.length === 0) continue;

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6-20250514",
        max_tokens: 4096,
        system: PHOTO_ANALYSIS_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              ...imageContents,
              { type: "text", text: buildAnalysisUserPrompt(imageContents.length) },
            ],
          },
        ],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        await log(propertyId, "analysis", "warn", `Failed to parse analysis response for batch ${i}`);
        continue;
      }

      const results: PhotoAnalysisResult[] = JSON.parse(jsonMatch[0]);

      for (let j = 0; j < results.length && j < batch.length; j++) {
        allResults.push({ photo: batch[j], analysis: results[j] });
      }
    } catch (err) {
      await log(propertyId, "analysis", "error", `LLM analysis failed for batch ${i}: ${err}`);
    }
  }

  if (allResults.length < MIN_PHOTOS_FOR_VIDEO) {
    await updatePropertyStatus(propertyId, "failed");
    await log(
      propertyId,
      "analysis",
      "error",
      `Only ${allResults.length} photos analyzed. Need at least ${MIN_PHOTOS_FOR_VIDEO}.`
    );
    return;
  }

  // Run selection algorithm
  const selected = selectPhotos(allResults);

  // Update all photos in DB
  for (const { photo, analysis } of allResults) {
    const isSelected = selected.some((s) => s.photo.id === photo.id);
    await updatePhotoAnalysis(photo.id, {
      room_type: analysis.room_type,
      quality_score: analysis.quality_score,
      aesthetic_score: analysis.aesthetic_score,
      depth_rating: analysis.depth_rating,
      key_features: analysis.key_features,
      selected: isSelected,
      discard_reason: analysis.suggested_discard
        ? analysis.discard_reason
        : isSelected
          ? null
          : "Not selected — lower aesthetic score or duplicate room type",
    });
  }

  // Update property
  await getSupabase()
    .from("properties")
    .update({ selected_photo_count: selected.length })
    .eq("id", propertyId);

  const cost = estimateAnalysisCost(photos.length);
  await addPropertyCost(propertyId, cost);

  await log(
    propertyId,
    "analysis",
    "info",
    `Analysis complete: ${allResults.length} analyzed, ${selected.length} selected (cost: ${cost}¢)`,
    { selectedCount: selected.length, discardedCount: allResults.length - selected.length }
  );

  // Enqueue scripting
  await scriptingQueue.add("script", { propertyId });
}

function selectPhotos(
  results: Array<{ photo: Photo; analysis: PhotoAnalysisResult }>
): Array<{ photo: Photo; analysis: PhotoAnalysisResult }> {
  // Filter out discards
  const candidates = results.filter((r) => !r.analysis.suggested_discard);

  // Group by room type
  const byRoom = new Map<RoomType, typeof candidates>();
  for (const c of candidates) {
    const existing = byRoom.get(c.analysis.room_type) ?? [];
    existing.push(c);
    byRoom.set(c.analysis.room_type, existing);
  }

  // Sort each group by aesthetic score descending
  for (const group of byRoom.values()) {
    group.sort((a, b) => b.analysis.aesthetic_score - a.analysis.aesthetic_score);
  }

  const selected: typeof candidates = [];

  // 1. Ensure required room types have representation
  for (const roomType of REQUIRED_ROOM_TYPES) {
    const group = byRoom.get(roomType);
    if (group && group.length > 0 && !selected.some((s) => s.analysis.room_type === roomType)) {
      selected.push(group[0]);
    }
  }

  // 2. Add exterior_back or aerial if available
  for (const rt of ["exterior_back", "aerial"] as RoomType[]) {
    const group = byRoom.get(rt);
    if (group && group.length > 0 && !selected.some((s) => s.analysis.room_type === rt)) {
      selected.push(group[0]);
    }
  }

  // 3. Fill remaining slots with highest aesthetic scores
  const remaining = candidates
    .filter((c) => !selected.includes(c))
    .sort((a, b) => {
      // Prefer high depth rating
      const depthOrder = { high: 0, medium: 1, low: 2 };
      const depthDiff =
        depthOrder[a.analysis.depth_rating] - depthOrder[b.analysis.depth_rating];
      if (depthDiff !== 0) return depthDiff;
      return b.analysis.aesthetic_score - a.analysis.aesthetic_score;
    });

  for (const candidate of remaining) {
    if (selected.length >= TARGET_SCENE_COUNT) break;

    // Enforce max per room type
    const countForType = selected.filter(
      (s) => s.analysis.room_type === candidate.analysis.room_type
    ).length;
    if (countForType >= MAX_PER_ROOM_TYPE) continue;

    selected.push(candidate);
  }

  return selected;
}
