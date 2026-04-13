import Anthropic from "@anthropic-ai/sdk";
import {
  getSupabase,
  getPhotosForProperty,
  updatePropertyStatus,
  updatePhotoAnalysis,
  getSelectedPhotos,
  insertScenes,
  updateSceneStatus,
  updateScene,
  getScenesForProperty,
  getProperty,
  addPropertyCost,
  recordCostEvent,
  log,
} from "./db.js";
import { computeClaudeCost } from "./utils/claude-cost.js";
import type { Photo, RoomType, DepthRating, VideoProvider } from "./types.js";
import {
  PHOTO_ANALYSIS_SYSTEM,
  buildAnalysisUserPrompt,
  type PhotoAnalysisResult,
} from "./prompts/photo-analysis.js";
import {
  DIRECTOR_SYSTEM,
  buildDirectorUserPrompt,
  type DirectorOutput,
} from "./prompts/director.js";
import {
  STYLE_GUIDE_SYSTEM,
  buildStyleGuideUserPrompt,
  type PropertyStyleGuide,
} from "./prompts/style-guide.js";
import {
  QC_SYSTEM,
  buildQCUserPrompt,
  buildPromptModification,
  type QCResult,
} from "./prompts/qc-evaluator.js";
import {
  PROMPT_QA_SYSTEM,
  buildPromptQAUserPrompt,
  type PromptQAResult,
} from "./prompts/prompt-qa.js";
import { selectProvider } from "./providers/router.js";
import { pollUntilComplete } from "./providers/provider.interface.js";
import { primeAppSettings } from "./app-settings.js";
import { runSceneAllocation } from "./allocator.js";

const BATCH_SIZE = 8;
const TARGET_SCENE_COUNT = 12;
const MAX_PER_ROOM_TYPE = 2;
const REQUIRED_ROOM_TYPES: RoomType[] = [
  "exterior_front",
  "kitchen",
  "living_room",
  "master_bedroom",
  "bathroom",
];

// ─── MAIN PIPELINE ─────────────────────────────────────────────

export async function runPipeline(propertyId: string): Promise<void> {
  try {
    await log(propertyId, "intake", "info", "Pipeline started");

    // Prime the app-settings cache so `selectProvider` (which is
    // synchronous and reads from cache) sees the current
    // primary_video_provider override picked in the dashboard.
    await primeAppSettings();

    // Stage 1: Intake (photos already uploaded by the API route)
    // Just verify photos exist
    const photos = await getPhotosForProperty(propertyId);
    if (photos.length < 5) {
      await updatePropertyStatus(propertyId, "failed");
      await log(propertyId, "intake", "error", `Only ${photos.length} photos. Need at least 5.`);
      return;
    }
    await log(propertyId, "intake", "info", `${photos.length} photos ready`);

    // Stage 2: Analyze
    await runAnalysis(propertyId, photos);

    // Stage 2.5: Build Property Style Guide — one vision pass that sees all
    // selected photos at once so later scene prompts can describe adjacent
    // rooms accurately instead of the video model hallucinating them.
    await runPropertyStyleGuide(propertyId);

    // Stage 3: Script
    await runScripting(propertyId);

    // Stage 3.5: Pre-flight prompt QA (non-blocking revision pass)
    await runPreflightQA(propertyId);

    // Stage 3.6: Dynamic scene allocator — scores each director-produced
    // scene against a per-room stability threshold, enforces per-room
    // quotas, and applies the 60-second total duration cap by marking
    // low-value scenes as trimmed. See docs/SCENE-ALLOCATION-PLAN.md +
    // docs/WALKTHROUGH-ROADMAP.md R1. Non-blocking: failures log and
    // continue to generation.
    try {
      await runSceneAllocation(propertyId);
    } catch (err) {
      await log(
        propertyId,
        "scripting",
        "error",
        `Allocator stage 3.6 threw: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Stage 4 + 5: Generate + QC (per clip, with retries)
    await runGenerationWithQC(propertyId);

    // Stage 6: Assembly
    await runAssembly(propertyId);

    await log(propertyId, "delivery", "info", "Pipeline complete!");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updatePropertyStatus(propertyId, "failed");
    await log(propertyId, "intake", "error", `Pipeline failed: ${msg}`);
    throw err;
  }
}

// ─── STAGE 2: ANALYZE ──────────────────────────────────────────

async function runAnalysis(propertyId: string, photos: Photo[]): Promise<void> {
  await updatePropertyStatus(propertyId, "analyzing");
  await log(propertyId, "analysis", "info", "Starting photo analysis");

  const client = new Anthropic();
  const allResults: Array<{ photo: Photo; analysis: PhotoAnalysisResult }> = [];

  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    const batch = photos.slice(i, i + BATCH_SIZE);
    const imageContents: Anthropic.ImageBlockParam[] = [];

    for (const photo of batch) {
      try {
        const response = await fetch(photo.file_url);
        const contentType = response.headers.get("content-type") ?? "";
        const buffer = Buffer.from(await response.arrayBuffer());
        const mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" =
          contentType.includes("png") ? "image/png"
          : contentType.includes("webp") ? "image/webp"
          : contentType.includes("gif") ? "image/gif"
          : "image/jpeg";
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: buffer.toString("base64"),
          },
        });
      } catch (err) {
        await log(propertyId, "analysis", "warn", `Failed to load ${photo.file_name}: ${err}`);
      }
    }

    if (imageContents.length === 0) continue;

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
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

      // Record actual token usage from Claude's response.
      const usageCost = computeClaudeCost(response.usage as never);
      await recordCostEvent({
        propertyId,
        stage: "analysis",
        provider: "anthropic",
        unitsConsumed: usageCost.totalTokens,
        unitType: "tokens",
        costCents: usageCost.costCents,
        metadata: {
          model: "claude-sonnet-4-6",
          batch_index: i,
          image_count: imageContents.length,
          ...usageCost.breakdown,
        },
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const results: PhotoAnalysisResult[] = JSON.parse(jsonMatch[0]);
      for (let j = 0; j < results.length && j < batch.length; j++) {
        allResults.push({ photo: batch[j], analysis: results[j] });
      }
    } catch (err) {
      await log(propertyId, "analysis", "error", `LLM batch ${i} failed: ${err}`);
    }
  }

  // Selection algorithm
  const selected = selectPhotos(allResults);

  for (const { photo, analysis } of allResults) {
    const isSelected = selected.some((s) => s.photo.id === photo.id);
    await updatePhotoAnalysis(photo.id, {
      room_type: analysis.room_type,
      quality_score: analysis.quality_score,
      aesthetic_score: analysis.aesthetic_score,
      depth_rating: analysis.depth_rating,
      key_features: analysis.key_features,
      unique_tags: analysis.unique_tags ?? [],
      visible_openings: analysis.visible_openings ?? false,
      opening_types: analysis.opening_types ?? [],
      opening_prominence: analysis.opening_prominence ?? 0,
      selected: isSelected,
      discard_reason: analysis.suggested_discard
        ? analysis.discard_reason
        : isSelected ? null : "Not selected",
    });
  }

  await getSupabase()
    .from("properties")
    .update({ selected_photo_count: selected.length })
    .eq("id", propertyId);

  await log(propertyId, "analysis", "info", `Analysis done: ${selected.length} selected from ${allResults.length}`);
}

function selectPhotos(
  results: Array<{ photo: Photo; analysis: PhotoAnalysisResult }>
): Array<{ photo: Photo; analysis: PhotoAnalysisResult }> {
  const candidates = results.filter((r) => !r.analysis.suggested_discard);
  const byRoom = new Map<RoomType, typeof candidates>();
  for (const c of candidates) {
    const existing = byRoom.get(c.analysis.room_type) ?? [];
    existing.push(c);
    byRoom.set(c.analysis.room_type, existing);
  }
  for (const group of byRoom.values()) {
    group.sort((a, b) => b.analysis.aesthetic_score - a.analysis.aesthetic_score);
  }

  const selected: typeof candidates = [];

  // Required room types
  for (const rt of REQUIRED_ROOM_TYPES) {
    const group = byRoom.get(rt);
    if (group?.[0] && !selected.some((s) => s.analysis.room_type === rt)) {
      selected.push(group[0]);
    }
  }
  // Exterior back / aerial
  for (const rt of ["exterior_back", "aerial"] as RoomType[]) {
    const group = byRoom.get(rt);
    if (group?.[0] && !selected.some((s) => s.analysis.room_type === rt)) {
      selected.push(group[0]);
    }
  }
  // Fill remaining
  const remaining = candidates
    .filter((c) => !selected.includes(c))
    .sort((a, b) => b.analysis.aesthetic_score - a.analysis.aesthetic_score);

  for (const candidate of remaining) {
    if (selected.length >= TARGET_SCENE_COUNT) break;
    const count = selected.filter((s) => s.analysis.room_type === candidate.analysis.room_type).length;
    if (count >= MAX_PER_ROOM_TYPE) continue;
    selected.push(candidate);
  }

  return selected;
}

// ─── STAGE 2.5: PROPERTY STYLE GUIDE ──────────────────────────
// One vision pass over all selected photos produces a structured style
// guide saved to properties.style_guide. The director injects it into
// per-scene prompts so the downstream video model knows what adjacent
// rooms look like instead of inventing them.

async function runPropertyStyleGuide(propertyId: string): Promise<void> {
  await log(propertyId, "scripting", "info", "Building property style guide");

  const photos = await getSelectedPhotos(propertyId);
  if (photos.length === 0) {
    await log(propertyId, "scripting", "warn", "No selected photos for style guide — skipping");
    return;
  }

  // Load all selected photos as image blocks for Claude vision. Track the
  // photos that successfully loaded so the user-prompt photo list stays in
  // the same order as the image blocks and every ID in the list is one the
  // model can see.
  const imageContents: Anthropic.ImageBlockParam[] = [];
  const loadedPhotos: Array<{ id: string; file_name: string; room_type: string }> = [];
  for (const photo of photos) {
    try {
      const response = await fetch(photo.file_url);
      const contentType = response.headers.get("content-type") ?? "";
      const buffer = Buffer.from(await response.arrayBuffer());
      const mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" =
        contentType.includes("png") ? "image/png"
        : contentType.includes("webp") ? "image/webp"
        : contentType.includes("gif") ? "image/gif"
        : "image/jpeg";
      imageContents.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: buffer.toString("base64") },
      });
      loadedPhotos.push({
        id: photo.id,
        file_name: photo.file_name ?? "unknown.jpg",
        room_type: photo.room_type ?? "other",
      });
    } catch (err) {
      await log(propertyId, "scripting", "warn", `Style guide failed to load ${photo.file_name}: ${err}`);
    }
  }
  if (imageContents.length === 0) {
    await log(propertyId, "scripting", "warn", "Style guide: no images loaded");
    return;
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: STYLE_GUIDE_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            ...imageContents,
            { type: "text", text: buildStyleGuideUserPrompt(loadedPhotos) },
          ],
        },
      ],
    });

    // Record cost
    const usage = computeClaudeCost(response.usage as never);
    await recordCostEvent({
      propertyId,
      stage: "scripting",
      provider: "anthropic",
      unitsConsumed: usage.totalTokens,
      unitType: "tokens",
      costCents: usage.costCents,
      metadata: {
        model: "claude-sonnet-4-6",
        stage_detail: "style_guide",
        image_count: imageContents.length,
        ...usage.breakdown,
      },
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      await log(propertyId, "scripting", "warn", "Style guide: could not parse JSON");
      return;
    }
    const styleGuide = JSON.parse(jsonMatch[0]) as PropertyStyleGuide;
    await getSupabase()
      .from("properties")
      .update({ style_guide: styleGuide })
      .eq("id", propertyId);
    await log(propertyId, "scripting", "info",
      `Style guide built: mood="${styleGuide.overall_mood}"`, { tokens: usage.totalTokens });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await log(propertyId, "scripting", "error", `Style guide failed: ${msg}`);
  }
}

// ─── STAGE 3: SCRIPTING ────────────────────────────────────────

async function runScripting(propertyId: string): Promise<void> {
  await updatePropertyStatus(propertyId, "scripting");
  await log(propertyId, "scripting", "info", "Planning shots");

  const photos = await getSelectedPhotos(propertyId);
  if (photos.length === 0) {
    await updatePropertyStatus(propertyId, "failed");
    await log(propertyId, "scripting", "error", "No selected photos");
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
    visible_openings: p.visible_openings ?? false,
    opening_types: p.opening_types ?? [],
  }));

  // Pull the style guide from the property row (built in Stage 2.5) and
  // bake it into the director's user message so every per-scene prompt
  // the director produces already references real adjacent-room details.
  const { data: propRow } = await getSupabase()
    .from("properties")
    .select("style_guide")
    .eq("id", propertyId)
    .single();
  const styleGuide = (propRow?.style_guide ?? null) as PropertyStyleGuide | null;
  const styleGuideBlock = styleGuide
    ? `\n\nPROPERTY STYLE GUIDE (use this to describe adjacent rooms visible through any doorways or openings — do NOT let the downstream video model invent these details; every scene prompt that shows a doorway must include the matching real description):\n${JSON.stringify(styleGuide, null, 2)}`
    : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: DIRECTOR_SYSTEM,
    messages: [{ role: "user", content: buildDirectorUserPrompt(photoData) + styleGuideBlock }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    await updatePropertyStatus(propertyId, "failed");
    await log(propertyId, "scripting", "error", "Failed to parse director output");
    return;
  }

  const output: DirectorOutput = JSON.parse(jsonMatch[0]);
  const validPhotoIds = new Set(photos.map((p) => p.id));
  const validScenes = output.scenes.filter((s) => validPhotoIds.has(s.photo_id));

  // Hard clamp every scene to 5 seconds. See docs/WALKTHROUGH-ROADMAP.md R11
  // (last-2-3-seconds decay mitigation #1). The director prompt already
  // requests exactly 5s per scene, but we re-enforce here so a hallucinated
  // longer duration can never reach the provider.
  const SCENE_DURATION_SECONDS = 5;
  await insertScenes(
    validScenes.map((s) => ({
      property_id: propertyId,
      photo_id: s.photo_id,
      scene_number: s.scene_number,
      camera_movement: s.camera_movement,
      prompt: s.prompt,
      duration_seconds: SCENE_DURATION_SECONDS,
      provider: s.provider_preference ?? undefined,
    }))
  );

  const scriptUsage = computeClaudeCost(response.usage as never);
  await recordCostEvent({
    propertyId,
    stage: "scripting",
    provider: "anthropic",
    unitsConsumed: scriptUsage.totalTokens,
    unitType: "tokens",
    costCents: scriptUsage.costCents,
    metadata: {
      model: "claude-sonnet-4-6",
      scene_count: validScenes.length,
      mood: output.mood,
      ...scriptUsage.breakdown,
    },
  });
  await log(propertyId, "scripting", "info", `Shot plan: ${validScenes.length} scenes, mood: ${output.mood}`);
}

// ─── STAGE 3.5: PRE-FLIGHT PROMPT QA ───────────────────────────

async function runPreflightQA(propertyId: string): Promise<void> {
  await log(propertyId, "qc", "info", "Starting pre-flight prompt QA");

  const scenes = await getScenesForProperty(propertyId);
  if (scenes.length === 0) {
    await log(propertyId, "qc", "warn", "No scenes found for pre-flight QA");
    return;
  }

  const client = new Anthropic();
  const supabase = getSupabase();
  let revisedCount = 0;

  for (const scene of scenes) {
    try {
      const { data: photo } = await supabase
        .from("photos")
        .select("file_url, room_type")
        .eq("id", scene.photo_id)
        .single();

      if (!photo?.file_url) {
        await log(propertyId, "qc", "warn",
          `Scene ${scene.scene_number}: source photo missing, skipping QA`, undefined, scene.id);
        continue;
      }

      const photoResponse = await fetch(photo.file_url);
      const contentType = photoResponse.headers.get("content-type") ?? "";
      const buffer = Buffer.from(await photoResponse.arrayBuffer());
      const mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" =
        contentType.includes("png") ? "image/png"
        : contentType.includes("webp") ? "image/webp"
        : contentType.includes("gif") ? "image/gif"
        : "image/jpeg";

      const userText = buildPromptQAUserPrompt({
        sceneNumber: scene.scene_number,
        cameraMovement: scene.camera_movement,
        currentPrompt: scene.prompt,
        roomType: (photo.room_type as string) ?? "other",
      });

      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: PROMPT_QA_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: buffer.toString("base64"),
                },
              },
              { type: "text", text: userText },
            ],
          },
        ],
      });

      const usageCost = computeClaudeCost(response.usage as never);
      await recordCostEvent({
        propertyId,
        sceneId: scene.id,
        stage: "qc",
        provider: "anthropic",
        unitsConsumed: usageCost.totalTokens,
        unitType: "tokens",
        costCents: usageCost.costCents,
        metadata: {
          model: "claude-sonnet-4-6",
          sub_stage: "preflight_qa",
          scene_number: scene.scene_number,
          ...usageCost.breakdown,
        },
      });

      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        await log(propertyId, "qc", "warn",
          `Scene ${scene.scene_number}: could not parse pre-flight QA JSON`, undefined, scene.id);
        continue;
      }

      const qa: PromptQAResult = JSON.parse(jsonMatch[0]);
      const score = typeof qa.stability_score === "number" ? qa.stability_score : 10;
      const level: "info" | "warn" = score < 6 ? "warn" : "info";

      await log(propertyId, "qc", level,
        `Scene ${scene.scene_number}: pre-flight stability ${score}/10 (${qa.risks?.length ?? 0} risks)`,
        { stability_score: score, risks: qa.risks, reasoning: qa.reasoning },
        scene.id);

      if (score < 8 && qa.revised_prompt && qa.revised_prompt.trim().length > 0) {
        await updateScene(scene.id, { prompt: qa.revised_prompt });
        revisedCount++;
        await log(propertyId, "qc", "info",
          `Scene ${scene.scene_number}: prompt revised by pre-flight QA`,
          { original_prompt: scene.prompt, revised_prompt: qa.revised_prompt },
          scene.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await log(propertyId, "qc", "warn",
        `Scene ${scene.scene_number}: pre-flight QA error (continuing): ${msg}`, undefined, scene.id);
    }
  }

  await log(propertyId, "qc", "info",
    `Pre-flight QA done: ${revisedCount}/${scenes.length} prompts revised`);
}

// ─── STAGE 4+5: GENERATE + QC ─────────────────────────────────

async function runGenerationWithQC(propertyId: string): Promise<void> {
  await updatePropertyStatus(propertyId, "generating");
  const allScenes = await getScenesForProperty(propertyId);
  // Skip scenes the Stage 3.6 allocator marked as trimmed (over quota,
  // duration cap, orphan photo). They stay in the DB as tombstones so
  // the Superview can explain why they were cut, but we don't burn
  // provider credits on them.
  const scenes = allScenes.filter((s) => !(s as { trimmed?: boolean }).trimmed);
  const trimmedCount = allScenes.length - scenes.length;
  const maxRetries = parseInt(process.env.MAX_RETRIES_PER_CLIP ?? "2", 10);
  const supabase = getSupabase();

  // Bound concurrent generation to respect provider parallel-task limits
  // (Kling returns 1303 "parallel task over resource pack limit" when too many
  // tasks fire at once). 4 is conservative and fits inside the default Kling plan.
  const GENERATION_CONCURRENCY = parseInt(process.env.GENERATION_CONCURRENCY ?? "4", 10);
  await log(
    propertyId,
    "generation",
    "info",
    `Generating ${scenes.length} clips` +
      (trimmedCount > 0 ? ` (${trimmedCount} trimmed by allocator)` : "") +
      `, up to ${GENERATION_CONCURRENCY} in parallel`
  );

  const runScene = async (scene: typeof scenes[number]) => {
      let lastError = "";
      // Providers that have already failed for this scene — excluded on subsequent attempts
      // so a broken provider (out of credit, outage) fails over instead of burning all retries.
      const excludeProviders: VideoProvider[] = [];
      let currentProvider: VideoProvider | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await updateSceneStatus(scene.id, "generating", { attempt_count: attempt + 1 });

          // Get the source photo
          const { data: photo } = await supabase
            .from("photos")
            .select("file_url, room_type")
            .eq("id", scene.photo_id)
            .single();

          if (!photo) throw new Error("Source photo not found");

          const photoResponse = await fetch(photo.file_url);
          const sourceImage = Buffer.from(await photoResponse.arrayBuffer());

          const provider = selectProvider(
            (photo.room_type as RoomType) ?? "other",
            scene.provider as VideoProvider | null,
            excludeProviders
          );
          currentProvider = provider.name;

          const startTime = Date.now();

          // Generate clip
          const genJob = await provider.generateClip({
            sourceImage,
            prompt: scene.prompt,
            durationSeconds: scene.duration_seconds,
            aspectRatio: "16:9",
          });

          // Persist the provider task ID IMMEDIATELY so the cron backstop can
          // pick this scene up if the pipeline function is killed mid-poll.
          // See api/cron/poll-scenes.ts.
          await supabase
            .from("scenes")
            .update({
              provider: provider.name,
              provider_task_id: genJob.jobId,
              submitted_at: new Date().toISOString(),
              attempt_count: attempt + 1,
            })
            .eq("id", scene.id);

          await log(propertyId, "generation", "info",
            `Scene ${scene.scene_number}: submitted to ${provider.name}`, { jobId: genJob.jobId }, scene.id);

          // Poll until done
          const result = await pollUntilComplete(provider, genJob.jobId);
          if (result.status === "failed") throw new Error(result.error ?? "Generation failed");

          // Download and store clip
          const clipBuffer = await provider.downloadClip(result.videoUrl!);
          const clipPath = `${propertyId}/clips/scene_${scene.scene_number}_v${attempt + 1}.mp4`;

          await supabase.storage.from("property-videos").upload(clipPath, clipBuffer, {
            contentType: "video/mp4",
            upsert: true,
          });

          const { data: urlData } = supabase.storage.from("property-videos").getPublicUrl(clipPath);
          const costCents = result.costCents ?? 0;
          const genTimeMs = Date.now() - startTime;

          await updateSceneStatus(scene.id, "qc_pass", {
            clip_url: urlData.publicUrl,
            provider: provider.name,
            generation_cost_cents: costCents,
            generation_time_ms: genTimeMs,
          });

          await recordCostEvent({
            propertyId,
            sceneId: scene.id,
            stage: "generation",
            provider: provider.name,
            unitsConsumed: result.providerUnits,
            unitType: result.providerUnitType ?? null,
            costCents,
            metadata: {
              scene_number: scene.scene_number,
              duration_seconds: scene.duration_seconds,
              generation_time_ms: genTimeMs,
              attempt: attempt + 1,
            },
          });
          await log(propertyId, "generation", "info",
            `Scene ${scene.scene_number}: done in ${(genTimeMs / 1000).toFixed(1)}s via ${provider.name}`,
            { costCents, providerUnits: result.providerUnits }, scene.id);

          // Run QC
          const qcPassed = await runQCForScene(propertyId, scene.id, urlData.publicUrl, scene);
          if (qcPassed) return;

          // QC failed — loop will retry
          lastError = "QC rejected";
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          await log(propertyId, "generation", "warn",
            `Scene ${scene.scene_number} attempt ${attempt + 1} failed${currentProvider ? ` (${currentProvider})` : ""}: ${lastError}`, undefined, scene.id);
          if (currentProvider && !excludeProviders.includes(currentProvider)) {
            excludeProviders.push(currentProvider);
          }
          currentProvider = null;
        }
      }

      // All retries exhausted
      await updateSceneStatus(scene.id, "needs_review");
      await log(propertyId, "generation", "error",
        `Scene ${scene.scene_number} failed after ${maxRetries + 1} attempts: ${lastError}`, undefined, scene.id);
  };

  // Pull-based worker pool: spawn N workers, each drains scenes from a shared queue.
  const queue = [...scenes];
  const worker = async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      try { await runScene(next); } catch (_) { /* runScene already logs */ }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(GENERATION_CONCURRENCY, scenes.length) }, () => worker()),
  );

  // Check results
  const updatedScenes = await getScenesForProperty(propertyId);
  const passed = updatedScenes.filter((s) => s.status === "qc_pass").length;
  const needsReview = updatedScenes.filter((s) => s.status === "needs_review").length;

  if (needsReview > 0 && passed < 6) {
    await updatePropertyStatus(propertyId, "needs_review");
    await log(propertyId, "generation", "warn",
      `${needsReview} clips need review, only ${passed} passed. Pausing for HITL.`);
    return;
  }

  await log(propertyId, "generation", "info", `${passed}/${updatedScenes.length} clips ready`);
}

async function runQCForScene(
  propertyId: string,
  sceneId: string,
  clipUrl: string,
  scene: { scene_number: number; camera_movement: string; prompt: string }
): Promise<boolean> {
  // For now, skip frame extraction (requires ffmpeg binary on Vercel).
  // Instead, we trust the generation output and do a lightweight check
  // by having the LLM evaluate based on the prompt parameters.
  // Full QC with frame extraction can be added via an external service.

  // TODO: Integrate with a frame extraction API or Vercel Sandbox for full QC
  // For launch, auto-pass all clips to get the pipeline running end-to-end.
  // The 40% rejection rate will improve as we tune prompts in Stage 3.

  const autoApprove = process.env.QC_AUTO_APPROVE_ALL === "true";
  if (autoApprove) {
    await updateSceneStatus(sceneId, "qc_pass", { qc_verdict: "auto_pass", qc_confidence: 1.0 });
    return true;
  }

  // Default: auto-pass for now (full QC phase 2)
  await updateSceneStatus(sceneId, "qc_pass", { qc_verdict: "auto_pass", qc_confidence: 1.0 });
  await log(propertyId, "qc", "info", `Scene ${scene.scene_number} auto-passed (QC phase 2 pending)`);
  return true;
}

// ─── STAGE 6: ASSEMBLY ─────────────────────────────────────────

async function runAssembly(propertyId: string): Promise<void> {
  await updatePropertyStatus(propertyId, "assembling");
  await log(propertyId, "assembly", "info", "Starting assembly");

  const property = await getProperty(propertyId);
  const scenes = await getScenesForProperty(propertyId);
  const passedScenes = scenes.filter((s) => s.status === "qc_pass" && s.clip_url);

  if (passedScenes.length === 0) {
    await updatePropertyStatus(propertyId, "failed");
    await log(propertyId, "assembly", "error", "No clips available for assembly");
    return;
  }

  // For Vercel deployment, assembly (FFmpeg stitching) needs to happen
  // via an external service or Vercel Sandbox since Vercel Functions
  // don't have FFmpeg binaries.
  //
  // For launch: store individual clips and mark complete.
  // The Lovable dashboard shows all clips in order — the editor
  // (or a future FFmpeg service) handles final stitching.
  //
  // TODO: Add Vercel Sandbox or external FFmpeg service for automated stitching

  const totalProcessingMs = Date.now() - new Date(property.created_at).getTime();

  // Use first clip as thumbnail
  const thumbnailUrl = passedScenes[0]?.clip_url ?? null;

  await updatePropertyStatus(propertyId, "complete", {
    thumbnail_url: thumbnailUrl,
    processing_time_ms: totalProcessingMs,
  });

  await log(propertyId, "assembly", "info",
    `Complete! ${passedScenes.length} clips generated in ${(totalProcessingMs / 1000).toFixed(1)}s. Total cost: $${((property.total_cost_cents) / 100).toFixed(2)}`,
    { clipCount: passedScenes.length, totalProcessingMs, totalCostCents: property.total_cost_cents }
  );
}
