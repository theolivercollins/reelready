// Prompt Lab core helpers — run PHOTO_ANALYSIS + DIRECTOR on a single uploaded
// image for iterative prompt refinement. See docs/PROMPT-LAB-PLAN.md.

import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "./client.js";
import {
  PHOTO_ANALYSIS_SYSTEM,
  buildAnalysisUserPrompt,
  type PhotoAnalysisResult,
} from "./prompts/photo-analysis.js";
import {
  DIRECTOR_SYSTEM,
  buildDirectorUserPrompt,
  type DirectorOutput,
  type DirectorSceneOutput,
} from "./prompts/director.js";
import { computeClaudeCost } from "./utils/claude-cost.js";
import { selectProvider } from "./providers/router.js";
import { pollUntilComplete, type IVideoProvider } from "./providers/provider.interface.js";
import { KlingProvider } from "./providers/kling.js";
import { RunwayProvider } from "./providers/runway.js";
import { embedTextSafe, buildAnalysisText, toPgVector } from "./embeddings.js";
import type { RoomType, CameraMovement } from "./types.js";

// ---- Types ----

export interface LabIterationRow {
  id: string;
  session_id: string;
  iteration_number: number;
  analysis_json: PhotoAnalysisResult | null;
  analysis_prompt_hash: string | null;
  director_output_json: DirectorSceneOutput | null;
  director_prompt_hash: string | null;
  clip_url: string | null;
  provider: string | null;
  cost_cents: number;
  rating: number | null;
  tags: string[] | null;
  user_comment: string | null;
  refinement_instruction: string | null;
  created_at: string;
}

export interface LabSessionRow {
  id: string;
  created_by: string;
  image_url: string;
  image_path: string;
  label: string | null;
  archetype: string | null;
  created_at: string;
}

// ---- Hash helper (FNV-1a, 32-bit, hex) — same family used in db.ts ----

function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export const ANALYSIS_PROMPT_HASH = hash32(PHOTO_ANALYSIS_SYSTEM);
export const DIRECTOR_PROMPT_HASH = hash32(DIRECTOR_SYSTEM);

// ---- Fetch image as base64 for Claude vision ----

async function fetchImageAsBase64(url: string): Promise<{
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());
  const mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" =
    contentType.includes("png") ? "image/png"
    : contentType.includes("webp") ? "image/webp"
    : contentType.includes("gif") ? "image/gif"
    : "image/jpeg";
  return { data: buffer.toString("base64"), mediaType };
}

// ---- Run photo analysis on a single image ----

export async function analyzeSingleImage(imageUrl: string): Promise<{
  analysis: PhotoAnalysisResult;
  costCents: number;
}> {
  const img = await fetchImageAsBase64(imageUrl);
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: PHOTO_ANALYSIS_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: img.mediaType, data: img.data },
          },
          { type: "text", text: buildAnalysisUserPrompt(1) },
        ],
      },
    ],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Photo analyzer returned no JSON array");
  const results: PhotoAnalysisResult[] = JSON.parse(jsonMatch[0]);
  if (!results[0]) throw new Error("Photo analyzer returned empty array");
  const usageCost = computeClaudeCost(response.usage as never);
  return { analysis: results[0], costCents: Math.round(usageCost.costCents) };
}

// ---- Retrieval: similar past iterations + matching recipes ----

export interface RetrievedExemplar {
  id: string;
  room_type: string;
  camera_movement: string;
  prompt: string;
  rating: number;
  tags: string[] | null;
  comment: string | null;
  refinement: string | null;
  provider: string | null;
  distance: number;
}

export interface RetrievedRecipe {
  id: string;
  archetype: string;
  room_type: string;
  camera_movement: string;
  provider: string | null;
  prompt_template: string;
  composition_signature: Record<string, unknown> | null;
  times_applied: number;
  distance: number;
}

export async function retrieveSimilarIterations(
  embedding: number[],
  opts: { minRating?: number; limit?: number } = {}
): Promise<RetrievedExemplar[]> {
  const { getSupabase } = await import("./client.js");
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("match_lab_iterations", {
    query_embedding: toPgVector(embedding),
    min_rating: opts.minRating ?? 4,
    match_count: opts.limit ?? 5,
  });
  if (error || !data) return [];
  return (data as Array<{
    id: string;
    analysis_json: { room_type?: string } | null;
    director_output_json: { camera_movement?: string; prompt?: string } | null;
    rating: number;
    tags: string[] | null;
    user_comment: string | null;
    refinement_instruction: string | null;
    provider: string | null;
    distance: number;
  }>).map((r) => ({
    id: r.id,
    room_type: r.analysis_json?.room_type ?? "other",
    camera_movement: r.director_output_json?.camera_movement ?? "unknown",
    prompt: r.director_output_json?.prompt ?? "",
    rating: r.rating,
    tags: r.tags,
    comment: r.user_comment,
    refinement: r.refinement_instruction,
    provider: r.provider,
    distance: r.distance,
  }));
}

export async function retrieveMatchingRecipes(
  embedding: number[],
  roomType: string | null,
  opts: { distanceThreshold?: number; limit?: number } = {}
): Promise<RetrievedRecipe[]> {
  const { getSupabase } = await import("./client.js");
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("match_lab_recipes", {
    query_embedding: toPgVector(embedding),
    room_type_filter: roomType,
    distance_threshold: opts.distanceThreshold ?? 0.35,
    match_count: opts.limit ?? 3,
  });
  if (error || !data) return [];
  return data as RetrievedRecipe[];
}

function renderExemplarBlock(exemplars: RetrievedExemplar[]): string {
  if (exemplars.length === 0) return "";
  const lines = exemplars.map((e, idx) => {
    const parts = [
      `  ${idx + 1}. [${e.rating}★ · ${e.room_type} · ${e.camera_movement} · ${e.provider ?? "?"}]`,
      `     prompt: "${e.prompt}"`,
    ];
    if (e.tags?.length) parts.push(`     tags: ${e.tags.join(", ")}`);
    if (e.comment) parts.push(`     note: ${e.comment}`);
    if (e.refinement) parts.push(`     what worked: ${e.refinement}`);
    return parts.join("\n");
  });
  return `\n\n━━━ PAST WINNERS ON STRUCTURALLY SIMILAR PHOTOS ━━━\nThese are ${exemplars.length} prior Lab iterations on photos whose analysis embedded close to this one, rated 4+ by the admin. They are evidence of what has worked on similar compositions. Bias toward their patterns unless the current photo's specifics argue otherwise.\n\n${lines.join("\n\n")}\n━━━ END PAST WINNERS ━━━`;
}

function renderRecipeBlock(recipes: RetrievedRecipe[]): string {
  if (recipes.length === 0) return "";
  const top = recipes[0];
  return `\n\n━━━ VALIDATED RECIPE MATCH ━━━\nArchetype "${top.archetype}" (room=${top.room_type}, movement=${top.camera_movement}, provider=${top.provider ?? "auto"}, applied ${top.times_applied}× before, distance ${top.distance.toFixed(3)}).\n\nRecipe template:\n  ${top.prompt_template}\n\nIf this photo fits the archetype, adapt the template by substituting the actual named feature from this photo's key_features. Keep the verb and structure. Deviate only if a specific key_feature makes the template awkward.\n━━━ END RECIPE MATCH ━━━`;
}

// ---- Run director on a single-photo input ----

export async function directSinglePhoto(
  analysis: PhotoAnalysisResult,
  photoId: string = "lab-photo",
  exemplars: RetrievedExemplar[] = [],
  recipes: RetrievedRecipe[] = []
): Promise<{ scene: DirectorSceneOutput; costCents: number }> {
  const client = new Anthropic();
  const basePrompt = buildDirectorUserPrompt([
    {
      id: photoId,
      file_name: "lab-image",
      room_type: analysis.room_type,
      aesthetic_score: analysis.aesthetic_score,
      depth_rating: analysis.depth_rating,
      key_features: analysis.key_features,
      composition: analysis.composition,
      suggested_motion: analysis.suggested_motion,
      motion_rationale: analysis.motion_rationale,
    },
  ]);
  const userPrompt = basePrompt + renderExemplarBlock(exemplars) + renderRecipeBlock(recipes);
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: DIRECTOR_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Director returned no JSON object");
  const parsed: DirectorOutput = JSON.parse(jsonMatch[0]);
  const scene = parsed.scenes?.[0];
  if (!scene) throw new Error("Director returned no scenes");
  const usageCost = computeClaudeCost(response.usage as never);
  return { scene, costCents: Math.round(usageCost.costCents) };
}

// ---- Refine director prompt with user feedback ----

const REFINE_SYSTEM = `You are a real estate cinematographer refining a single AI-video scene prompt based on user feedback. The user will give you:
1. The photo's analysis (room, key features, composition, depth)
2. The PREVIOUS director output (camera_movement + prompt)
3. Optional structured rating + tags
4. A free-text instruction describing what to change

Your job: produce a REVISED director scene object that addresses the feedback while following ALL the rules in the main DIRECTOR_SYSTEM prompt (cinematography-verb style, under 20 words, names specific features, valid camera_movement enum, no banned verbs, etc).

The main DIRECTOR_SYSTEM rules are authoritative. Your revision must comply with them.

Return ONLY a JSON object with the shape:
{
  "camera_movement": "<one of the 11 enum values>",
  "prompt": "<revised prompt string>",
  "duration_seconds": <3-5>,
  "rationale": "<one sentence explaining what you changed and why>"
}

No preamble, no markdown, no code fences.`;

export async function refineDirectorPrompt(params: {
  analysis: PhotoAnalysisResult;
  previousScene: DirectorSceneOutput;
  rating: number | null;
  tags: string[] | null;
  comment: string | null;
  chatInstruction: string;
  exemplars?: RetrievedExemplar[];
}): Promise<{ scene: DirectorSceneOutput; rationale: string; costCents: number }> {
  const client = new Anthropic();
  const userMessage = `PHOTO ANALYSIS:
${JSON.stringify(params.analysis, null, 2)}

PREVIOUS DIRECTOR OUTPUT:
camera_movement: ${params.previousScene.camera_movement}
prompt: ${params.previousScene.prompt}

USER FEEDBACK:
${params.rating !== null ? `rating: ${params.rating}/5` : "rating: not provided"}
${params.tags?.length ? `tags: ${params.tags.join(", ")}` : ""}
${params.comment ? `comment: ${params.comment}` : ""}

REFINEMENT INSTRUCTION:
${params.chatInstruction}
${renderExemplarBlock(params.exemplars ?? [])}

Remember: the revised output must comply with the full DIRECTOR_SYSTEM rules (below for reference).

---
${DIRECTOR_SYSTEM}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: REFINE_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Refiner returned no JSON object");
  const parsed = JSON.parse(jsonMatch[0]) as {
    camera_movement: CameraMovement;
    prompt: string;
    duration_seconds: number;
    rationale: string;
  };
  const scene: DirectorSceneOutput = {
    scene_number: params.previousScene.scene_number,
    photo_id: params.previousScene.photo_id,
    room_type: params.previousScene.room_type,
    camera_movement: parsed.camera_movement,
    prompt: parsed.prompt,
    duration_seconds: parsed.duration_seconds ?? 4,
    provider_preference: null,
  };
  const usageCost = computeClaudeCost(response.usage as never);
  return { scene, rationale: parsed.rationale ?? "", costCents: Math.round(usageCost.costCents) };
}

// ---- Actually render a clip via Kling/Runway ----

export async function renderLabClip(params: {
  imageUrl: string;
  scene: DirectorSceneOutput;
  roomType: RoomType;
  providerOverride?: "kling" | "runway" | null;
}): Promise<{
  clipUrl: string | null;
  provider: string;
  costCents: number;
  error: string | null;
}> {
  let provider: IVideoProvider;
  if (params.providerOverride === "kling") provider = new KlingProvider();
  else if (params.providerOverride === "runway") provider = new RunwayProvider();
  else provider = selectProvider(params.roomType, params.scene.camera_movement, null, []);
  const img = await fetch(params.imageUrl);
  if (!img.ok) throw new Error(`Failed to fetch source image: ${img.status}`);
  const sourceImage = Buffer.from(await img.arrayBuffer());

  const job = await provider.generateClip({
    sourceImage,
    prompt: params.scene.prompt,
    durationSeconds: params.scene.duration_seconds >= 7 ? 10 : 5,
    aspectRatio: "16:9",
  });
  const result = await pollUntilComplete(provider, job.jobId, 180_000, 5_000);
  if (result.status !== "complete" || !result.videoUrl) {
    return {
      clipUrl: null,
      provider: provider.name,
      costCents: Math.round(result.costCents ?? 0),
      error: result.error ?? "render failed",
    };
  }
  return {
    clipUrl: result.videoUrl,
    provider: provider.name,
    costCents: Math.round(result.costCents ?? 0),
    error: null,
  };
}

// ---- Session + iteration DB helpers ----

export async function getNextIterationNumber(sessionId: string): Promise<number> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("prompt_lab_iterations")
    .select("iteration_number")
    .eq("session_id", sessionId)
    .order("iteration_number", { ascending: false })
    .limit(1);
  const last = data?.[0]?.iteration_number ?? 0;
  return last + 1;
}
