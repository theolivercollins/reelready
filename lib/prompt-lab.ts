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
import { selectProvider, resolveDecision, resolveDecisionAsync } from "./providers/router.js";
import type { ThompsonDecision } from "./providers/thompson-router.js";
import { pollUntilComplete, type IVideoProvider } from "./providers/provider.interface.js";
import { KlingProvider } from "./providers/kling.js";
import { RunwayProvider } from "./providers/runway.js";
import { AtlasProvider, type V1AtlasSku } from "./providers/atlas.js";
import { embedTextSafe, buildAnalysisText, toPgVector } from "./embeddings.js";
import { recordCostEvent } from "./db.js";
import type { RoomType, CameraMovement } from "./types.js";

// Stable zero-UUID used as a placeholder property_id for Lab renders that
// are not tied to a real property. Allows cost_events rows to be inserted
// without a real property row (property_id accepts any UUID, and Lab costs
// do NOT roll up into a real property total).
export const LAB_SYNTHETIC_PROPERTY_ID = "00000000-0000-0000-0000-000000000000";

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

// Resolve the effective DIRECTOR_SYSTEM for Lab calls — if an active
// lab_prompt_overrides row exists for prompt_name='director', use that body;
// otherwise fall back to the main DIRECTOR_SYSTEM. Production pipeline does
// NOT call this — it uses DIRECTOR_SYSTEM directly, so Lab overrides stay
// Lab-scoped.
async function resolveDirectorSystem(): Promise<{ body: string; hash: string }> {
  try {
    const { getSupabase } = await import("./client.js");
    const supabase = getSupabase();
    const { data } = await supabase
      .from("lab_prompt_overrides")
      .select("body, body_hash")
      .eq("prompt_name", "director")
      .eq("is_active", true)
      .maybeSingle();
    if (data?.body) return { body: data.body as string, hash: (data.body_hash as string) ?? hash32(data.body as string) };
  } catch { /* no-op */ }
  return { body: DIRECTOR_SYSTEM, hash: DIRECTOR_PROMPT_HASH };
}

// ---- Run photo analysis on a single image ----

export async function analyzeSingleImage(imageUrl: string): Promise<{
  analysis: PhotoAnalysisResult;
  costCents: number;
}> {
  const client = new Anthropic();
  const ANALYZE_MODEL = "claude-sonnet-4-6";
  const response = await client.messages.create({
    model: ANALYZE_MODEL,
    max_tokens: 4096,
    system: PHOTO_ANALYSIS_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
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
  const usageCost = computeClaudeCost(response.usage as never, ANALYZE_MODEL);
  return { analysis: results[0], costCents: Math.round(usageCost.costCents) };
}

// ---- Retrieval: similar past iterations + matching recipes ----

export interface RetrievedExemplar {
  id: string;
  source: "lab" | "prod" | "listing";
  room_type: string;
  camera_movement: string;
  // M.2d: SKU-level model label. RPC returns this per-branch (listing
  // iters carry it natively; legacy lab + prod rows map provider → SKU,
  // e.g. "kling" → "kling-v2-native"). Falls back to `provider` in
  // rendering when null.
  model_used: string | null;
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
  // M.2d: SKU-level model stamped on recipe at promotion time (back-filled
  // via migration 028 for historical recipes). Canonicalizes "kling" →
  // "kling-v2-native" etc.
  model_used: string | null;
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
  const { data, error } = await supabase.rpc("match_rated_examples", {
    query_embedding: toPgVector(embedding),
    min_rating: opts.minRating ?? 4,
    match_count: opts.limit ?? 5,
  });
  if (error || !data) return [];
  return (data as Array<{
    source: "lab" | "prod" | "listing";
    example_id: string;
    rating: number;
    analysis_json: Record<string, unknown> | null;
    director_output_json: Record<string, unknown> | null;
    prompt: string | null;
    camera_movement: string | null;
    model_used: string | null;
    clip_url: string | null;
    tags: string[] | null;
    comment: string | null;
    refinement: string | null;
    distance: number;
  }>).map((r) => {
    const dir = (r.director_output_json ?? {}) as {
      camera_movement?: string;
      prompt?: string;
      provider?: string;
      provider_preference?: string;
      scene?: { camera_movement?: string; prompt?: string; provider?: string; provider_preference?: string };
    };
    const analysis = (r.analysis_json ?? {}) as { room_type?: string };
    return {
      id: r.example_id,
      source: r.source,
      room_type: analysis.room_type ?? "other",
      camera_movement:
        r.camera_movement ?? dir.scene?.camera_movement ?? dir.camera_movement ?? "unknown",
      model_used: r.model_used ?? null,
      prompt: r.prompt ?? dir.scene?.prompt ?? dir.prompt ?? "",
      rating: r.rating,
      tags: r.tags ?? null,
      comment: r.comment ?? null,
      refinement: r.refinement ?? null,
      provider:
        dir.provider_preference ??
        dir.provider ??
        dir.scene?.provider_preference ??
        dir.scene?.provider ??
        null,
      distance: r.distance,
    };
  });
}

export async function retrieveSimilarLosers(
  embedding: number[],
  opts: { maxRating?: number; limit?: number } = {}
): Promise<RetrievedExemplar[]> {
  const { getSupabase } = await import("./client.js");
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("match_loser_examples", {
    query_embedding: toPgVector(embedding),
    max_rating: opts.maxRating ?? 2,
    match_count: opts.limit ?? 3,
  });
  if (error || !data) return [];
  return (data as Array<{
    source: "lab" | "prod" | "listing";
    example_id: string;
    rating: number;
    analysis_json: Record<string, unknown>;
    director_output_json: Record<string, unknown>;
    prompt: string | null;
    camera_movement: string | null;
    model_used: string | null;
    clip_url: string | null;
    tags: string[] | null;
    comment: string | null;
    refinement: string | null;
    distance: number;
  }>).map((r) => {
    const dir = (r.director_output_json ?? {}) as {
      camera_movement?: string;
      prompt?: string;
      provider?: string;
      provider_preference?: string;
      scene?: { camera_movement?: string; prompt?: string; provider?: string; provider_preference?: string };
    };
    const analysis = (r.analysis_json ?? {}) as { room_type?: string };
    return {
      id: r.example_id,
      source: r.source,
      room_type: analysis.room_type ?? "other",
      camera_movement:
        r.camera_movement ?? dir.scene?.camera_movement ?? dir.camera_movement ?? "unknown",
      model_used: r.model_used ?? null,
      prompt: r.prompt ?? dir.scene?.prompt ?? dir.prompt ?? "",
      rating: r.rating,
      tags: r.tags ?? null,
      comment: r.comment ?? null,
      refinement: r.refinement ?? null,
      provider:
        dir.provider_preference ??
        dir.provider ??
        dir.scene?.provider_preference ??
        dir.scene?.provider ??
        null,
      distance: r.distance,
    };
  });
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

export function renderExemplarBlock(exemplars: RetrievedExemplar[]): string {
  if (exemplars.length === 0) return "";
  const lines = exemplars.map((e, idx) => {
    const parts = [
      `  ${idx + 1}. [${e.rating}★ · ${e.room_type} · ${e.camera_movement} · ${e.model_used ?? e.provider ?? "?"}]`,
      `     prompt: "${e.prompt}"`,
    ];
    if (e.tags?.length) parts.push(`     tags: ${e.tags.join(", ")}`);
    if (e.comment) parts.push(`     note: ${e.comment}`);
    if (e.refinement) parts.push(`     what worked: ${e.refinement}`);
    return parts.join("\n");
  });
  return `\n\n━━━ PAST WINNERS ON STRUCTURALLY SIMILAR PHOTOS ━━━\nThese are ${exemplars.length} prior Lab iterations on photos whose analysis embedded close to this one, rated 4+ by the admin. They are evidence of what has worked on similar compositions. Bias toward their patterns unless the current photo's specifics argue otherwise.\n\n${lines.join("\n\n")}\n━━━ END PAST WINNERS ━━━`;
}

export function renderLoserBlock(losers: RetrievedExemplar[]): string {
  if (losers.length === 0) return "";
  const lines = losers.map((e, idx) => {
    const parts = [
      `  ${idx + 1}. [${e.rating}★ · ${e.room_type} · ${e.camera_movement} · ${e.model_used ?? e.provider ?? "?"}]`,
      `     prompt: "${e.prompt}"`,
    ];
    if (e.tags?.length) parts.push(`     tags: ${e.tags.join(", ")}`);
    if (e.comment) parts.push(`     why it failed: ${e.comment}`);
    if (e.refinement) parts.push(`     admin asked to change: ${e.refinement}`);
    return parts.join("\n");
  });
  const worstRating = Math.max(...losers.map((l) => l.rating));
  return `\n\n━━━ PAST LOSERS ON STRUCTURALLY SIMILAR PHOTOS ━━━\nThese are ${losers.length} prior iterations on photos that embed close to this one, rated ${worstRating}★ or worse by the admin. Do NOT mirror these patterns. Steer away from their camera_movement choice, their framing, or whatever the tags/comments indicate went wrong. If your instinct leads you toward one of these patterns, pick a different verb or different framing.\n\n${lines.join("\n\n")}\n━━━ END PAST LOSERS ━━━`;
}

function renderPreviousAttemptsBlock(attempts: Array<{ camera_movement: string; prompt: string; rating?: number | null }>): string {
  if (attempts.length === 0) return "";
  const lines = attempts.map((a, idx) =>
    `  ${idx + 1}. [${a.camera_movement}${a.rating != null ? ` · ${a.rating}★` : ""}] "${a.prompt}"`,
  );
  return `\n\n━━━ ALREADY TRIED ON THIS PHOTO — DO NOT REPEAT ━━━\nThe following prompts were already generated for this exact photo in previous iterations. They were NOT rated 5★. You MUST produce a meaningfully different camera_movement + prompt combination. Do not rephrase — pick a different verb or a different compositional target.\n\n${lines.join("\n")}\n━━━ END ALREADY TRIED ━━━`;
}

export function renderRecipeBlock(recipes: RetrievedRecipe[]): string {
  if (recipes.length === 0) return "";
  const top = recipes[0];
  return `\n\n━━━ VALIDATED RECIPE MATCH ━━━\nArchetype "${top.archetype}" (room=${top.room_type}, movement=${top.camera_movement}, model=${top.model_used ?? top.provider ?? "auto"}, applied ${top.times_applied}× before, distance ${top.distance.toFixed(3)}).\n\nRecipe template:\n  ${top.prompt_template}\n\nIf this photo fits the archetype, adapt the template by substituting the actual named feature from this photo's key_features. Keep the verb and structure. Deviate only if a specific key_feature makes the template awkward.\n━━━ END RECIPE MATCH ━━━`;
}

// ---- Run director on a single-photo input ----

export async function directSinglePhoto(
  analysis: PhotoAnalysisResult,
  photoId: string = "lab-photo",
  exemplars: RetrievedExemplar[] = [],
  recipes: RetrievedRecipe[] = [],
  losers: RetrievedExemplar[] = [],
  previousAttempts: Array<{ camera_movement: string; prompt: string; rating?: number | null }> = []
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
  const userPrompt =
    basePrompt +
    renderExemplarBlock(exemplars) +
    renderLoserBlock(losers) +
    renderPreviousAttemptsBlock(previousAttempts) +
    renderRecipeBlock(recipes);
  const { body: directorSystem } = await resolveDirectorSystem();
  const DIRECT_MODEL = "claude-sonnet-4-6";
  const response = await client.messages.create({
    model: DIRECT_MODEL,
    max_tokens: 2048,
    system: directorSystem,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Director returned no JSON object");
  const parsed: DirectorOutput = JSON.parse(jsonMatch[0]);
  const scene = parsed.scenes?.[0];
  if (!scene) throw new Error("Director returned no scenes");
  const usageCost = computeClaudeCost(response.usage as never, DIRECT_MODEL);
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
  losers?: RetrievedExemplar[];
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
${renderLoserBlock(params.losers ?? [])}

Remember: the revised output must comply with the full DIRECTOR_SYSTEM rules (below for reference).

---
${(await resolveDirectorSystem()).body}`;

  const REFINE_MODEL = "claude-sonnet-4-6";
  const response = await client.messages.create({
    model: REFINE_MODEL,
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
  const usageCost = computeClaudeCost(response.usage as never, REFINE_MODEL);
  return { scene, rationale: parsed.rationale ?? "", costCents: Math.round(usageCost.costCents) };
}

// ---- Render submission (fire-and-forget) + cron finalization ----

function getProviderByName(name: "kling" | "runway"): IVideoProvider {
  return name === "kling" ? new KlingProvider() : new RunwayProvider();
}

// Kling trial plan caps concurrent jobs at 5. Leave 1 slot of slack so
// parallel submissions don't race past the limit. Override via env if the
// plan changes.
const KLING_CONCURRENCY_LIMIT = Number(process.env.KLING_CONCURRENCY_LIMIT ?? 4);

export class ProviderCapacityError extends Error {
  readonly provider: "kling" | "runway";
  readonly inFlight: number;
  readonly limit: number;
  constructor(provider: "kling" | "runway", inFlight: number, limit: number) {
    super(
      `${provider} is at capacity (${inFlight}/${limit} in flight). Try Runway or wait ~90s.`,
    );
    this.provider = provider;
    this.inFlight = inFlight;
    this.limit = limit;
  }
}

// Count Kling jobs submitted but not yet finalized across both Lab and prod.
async function countKlingInFlight(): Promise<number> {
  const { getSupabase } = await import("./client.js");
  const supabase = getSupabase();
  const [lab, prod] = await Promise.all([
    supabase
      .from("prompt_lab_iterations")
      .select("id", { count: "exact", head: true })
      .eq("provider", "kling")
      .not("provider_task_id", "is", null)
      .is("clip_url", null)
      .is("render_error", null),
    supabase
      .from("scenes")
      .select("id", { count: "exact", head: true })
      .eq("provider", "kling")
      .not("provider_task_id", "is", null)
      .is("clip_url", null),
  ]);
  return (lab.count ?? 0) + (prod.count ?? 0);
}

export async function submitLabRender(params: {
  imageUrl: string;
  scene: DirectorSceneOutput;
  roomType: RoomType;
  providerOverride?: "kling" | "runway" | null;
  endImageUrl?: string | null;
  sku?: V1AtlasSku | null;
}): Promise<{
  jobId: string;
  provider: string;
  sku: V1AtlasSku;
  thompson?: ThompsonDecision;
  staticSku: V1AtlasSku;
}> {
  let provider: IVideoProvider;
  let resolvedSku: V1AtlasSku;
  let thompson: ThompsonDecision | undefined;
  let staticSku: V1AtlasSku;

  if (params.providerOverride === "kling" || params.providerOverride === "runway") {
    // Escape hatch: explicit kling/runway override bypasses Atlas routing.
    provider = getProviderByName(params.providerOverride);

    // Capacity guard: if Kling is saturated, auto-fallback.
    if (provider.name === "kling") {
      const inFlight = await countKlingInFlight();
      if (inFlight >= KLING_CONCURRENCY_LIMIT) {
        if (params.providerOverride === "kling") {
          throw new ProviderCapacityError("kling", inFlight, KLING_CONCURRENCY_LIMIT);
        }
        provider = new RunwayProvider();
      }
    }
    // sku is not meaningful for non-Atlas providers; use default for type safety.
    resolvedSku = "kling-v2-6-pro";
    // thompson stays undefined for escape-hatch path
    staticSku = resolvedSku;
  } else if (params.endImageUrl) {
    // Paired scene: always use kling-v2-1-pair via Atlas.
    // Thompson does not run on paired scenes per P5 design.
    resolvedSku = "kling-v2-1-pair" as unknown as V1AtlasSku;
    provider = new AtlasProvider("kling-v2-1-pair");
    // thompson stays undefined; staticSku equals the paired SKU itself.
    staticSku = resolvedSku;
  } else {
    // Non-paired scene: resolve SKU via async router (Thompson-aware).
    const resolved = await resolveDecisionAsync({
      roomType: params.roomType,
      movement: params.scene.camera_movement,
      skuOverride: params.sku ?? null,
    });
    resolvedSku = resolved.decision.modelKey as V1AtlasSku;
    thompson = resolved.thompson;
    staticSku = resolved.staticSku;
    provider = new AtlasProvider(resolvedSku);
  }

  // Keep the Buffer path as a fallback for providers that don't accept URLs,
  // but pass the URL so Runway/Kling can skip base64 (which caps at 5MB).
  const img = await fetch(params.imageUrl);
  if (!img.ok) throw new Error(`Failed to fetch source image: ${img.status}`);
  const sourceImage = Buffer.from(await img.arrayBuffer());
  const job = await provider.generateClip({
    sourceImage,
    sourceImageUrl: params.imageUrl,
    prompt: params.scene.prompt,
    durationSeconds: params.scene.duration_seconds >= 7 ? 10 : 5,
    aspectRatio: "16:9",
    endImageUrl: params.endImageUrl ?? undefined,
  });
  return { jobId: job.jobId, provider: provider.name, sku: resolvedSku, thompson, staticSku };
}

export async function finalizeLabRender(params: {
  iterationId: string;
  sessionId: string;
  provider: "kling" | "runway" | "atlas";
  providerTaskId: string;
}): Promise<{ done: boolean; clipUrl?: string; costCents?: number; error?: string }> {
  // Atlas finalization uses AtlasProvider; legacy kling/runway use the
  // named-provider helper. AtlasProvider.checkStatus handles all Atlas SKUs.
  const providerImpl: IVideoProvider =
    params.provider === "atlas"
      ? new AtlasProvider()
      : getProviderByName(params.provider as "kling" | "runway");

  const result = await providerImpl.checkStatus(params.providerTaskId);
  if (result.status === "processing") return { done: false };
  if (result.status === "failed" || !result.videoUrl) {
    return { done: true, error: result.error ?? "render failed" };
  }

  // Persist the clip to Supabase Storage (provider CDNs expire).
  let persistedUrl = result.videoUrl;
  try {
    const buffer = await providerImpl.downloadClip(result.videoUrl);
    const { getSupabase } = await import("./client.js");
    const supabase = getSupabase();
    const path = `prompt-lab/${params.sessionId}/${params.iterationId}.mp4`;
    const { error: upErr } = await supabase.storage
      .from("property-videos")
      .upload(path, buffer, { contentType: "video/mp4", upsert: true });
    if (!upErr) {
      const { data: pub } = supabase.storage.from("property-videos").getPublicUrl(path);
      persistedUrl = pub.publicUrl;
    }
  } catch { /* fall back to provider URL */ }

  const computedCostCents = Math.round(result.costCents ?? 0);

  // Emit a cost_events row for every completed Lab render. Uses a synthetic
  // property_id (zero-UUID) for Lab sessions not tied to a real property.
  // Wrapped in try/catch so a cost-event failure never breaks clip finalization.
  try {
    const { getSupabase: getSupabaseForCost } = await import("./client.js");
    const supabaseCost = getSupabaseForCost();
    // Look up the iteration to get session.property_id and model_used.
    const { data: iteration } = await supabaseCost
      .from("prompt_lab_iterations")
      .select("model_used, session_id")
      .eq("id", params.iterationId)
      .maybeSingle();
    const { data: session } = await supabaseCost
      .from("prompt_lab_sessions")
      .select("property_id")
      .eq("id", params.sessionId)
      .maybeSingle();

    await recordCostEvent({
      propertyId: (session?.property_id as string | null | undefined) ?? LAB_SYNTHETIC_PROPERTY_ID,
      sceneId: null,
      stage: "generation",
      provider: "atlas",
      unitsConsumed: 1,
      unitType: "renders",
      costCents: computedCostCents,
      metadata: {
        sku: (iteration?.model_used as string | null) ?? "unknown",
        surface: "lab",
        iteration_id: params.iterationId,
        session_id: params.sessionId,
      },
    });
  } catch (costErr) {
    console.error("[finalizeLabRender] cost_events insert failed (non-fatal):", costErr);
  }

  // Fire-and-forget judge hook — non-blocking; doesn't delay clip delivery.
  if (process.env.JUDGE_ENABLED === "true") {
    (async () => {
      try {
        const { judgeLabIteration } = await import("./providers/gemini-judge.js");
        const { getSupabase: getSupabaseForJudge } = await import("./client.js");
        const supabaseJudge = getSupabaseForJudge();

        // Fetch the fields the judge needs (director output, analysis, session photo).
        const { data: iterRow } = await supabaseJudge
          .from("prompt_lab_iterations")
          .select("director_output_json, analysis_json")
          .eq("id", params.iterationId)
          .maybeSingle();
        const { data: sessionRow } = await supabaseJudge
          .from("prompt_lab_sessions")
          .select("image_url, archetype")
          .eq("id", params.sessionId)
          .maybeSingle();

        // Fetch photo bytes non-fatally.
        let photoBytes: Buffer | undefined;
        try {
          const photoUrl = (sessionRow as { image_url?: string | null } | null)?.image_url;
          if (photoUrl) {
            const r = await fetch(photoUrl);
            if (r.ok) photoBytes = Buffer.from(await r.arrayBuffer());
          }
        } catch { /* non-fatal */ }

        const director = (iterRow?.director_output_json as { camera_movement?: string; prompt?: string } | null);

        const judgeResult = await judgeLabIteration({
          clipUrl: persistedUrl,
          photoBytes,
          directorPrompt: director?.prompt ?? "",
          cameraMovement: director?.camera_movement ?? "unknown",
          roomType:
            (iterRow?.analysis_json as { room_type?: string } | null)?.room_type ??
            (sessionRow as { archetype?: string | null } | null)?.archetype ??
            "unknown",
          iterationId: params.iterationId,
        });

        await supabaseJudge
          .from("prompt_lab_iterations")
          .update({
            judge_rating_json: judgeResult,
            judge_rating_overall: judgeResult.overall,
            judge_rated_at: new Date().toISOString(),
            judge_model: judgeResult.judge_model,
            judge_version: judgeResult.judge_version,
            judge_cost_cents: judgeResult.cost_cents,
            judge_error: null,
          })
          .eq("id", params.iterationId);
      } catch (err) {
        console.error("[judge] hook failed (non-fatal):", err);
        try {
          const { getSupabase: getSupabaseForErr } = await import("./client.js");
          await getSupabaseForErr()
            .from("prompt_lab_iterations")
            .update({
              judge_error: err instanceof Error ? err.message : String(err),
              judge_rated_at: new Date().toISOString(),
            })
            .eq("id", params.iterationId);
        } catch { /* nested — swallow */ }
      }
    })();
  }

  return {
    done: true,
    clipUrl: persistedUrl,
    costCents: computedCostCents,
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
