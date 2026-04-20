import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "./client.js";
import { computeClaudeCost } from "./utils/claude-cost.js";
import {
  analyzeSingleImage,
  retrieveMatchingRecipes,
  retrieveSimilarIterations,
  retrieveSimilarLosers,
  renderRecipeBlock,
  renderExemplarBlock,
  renderLoserBlock,
  type RetrievedRecipe,
  type RetrievedExemplar,
} from "./prompt-lab.js";
import { parseDirectorIntent, type DirectorIntent } from "./prompts/director-intent.js";
import { DIRECTOR_SYSTEM, buildDirectorUserPrompt } from "./prompts/director.js";
import { buildAnalysisText, embedTextSafe, fromPgVector, toPgVector } from "./embeddings.js";

export interface PairResolution {
  endImageUrl: string | null;
  pairingMode: "paired" | "none";
}

export interface ResolveSceneEndFrameInput {
  startPhotoUrl: string;
  endPhotoId: string | null;
  photoLookup: (id: string) => Promise<string | null>;
}

export async function resolveSceneEndFrame(input: ResolveSceneEndFrameInput): Promise<PairResolution> {
  if (!input.startPhotoUrl) throw new Error("resolveSceneEndFrame: startPhotoUrl is required");
  if (input.endPhotoId) {
    const url = await input.photoLookup(input.endPhotoId);
    if (url) return { endImageUrl: url, pairingMode: "paired" };
  }
  return { endImageUrl: null, pairingMode: "none" };
}

export async function createListingWithPhotos(input: {
  createdBy: string;
  name: string;
  modelName: string;
  photos: Array<{ imageUrl: string; imagePath: string }>;
  notes?: string | null;
}): Promise<string> {
  const supabase = getSupabase();
  const { data: listing, error } = await supabase
    .from("prompt_lab_listings")
    .insert({
      name: input.name,
      created_by: input.createdBy,
      model_name: input.modelName,
      notes: input.notes ?? null,
      status: "analyzing",
    })
    .select("id")
    .single();
  if (error || !listing) throw new Error(`Create listing failed: ${error?.message ?? "no row"}`);

  const rows = input.photos.map((p, i) => ({
    listing_id: listing.id,
    photo_index: i,
    image_url: p.imageUrl,
    image_path: p.imagePath,
  }));
  const { error: insertErr } = await supabase.from("prompt_lab_listing_photos").insert(rows);
  if (insertErr) throw new Error(`Insert photos failed: ${insertErr.message}`);

  return listing.id;
}

export async function analyzeListingPhotos(listingId: string): Promise<void> {
  const supabase = getSupabase();
  const { data: photos } = await supabase
    .from("prompt_lab_listing_photos")
    .select("*")
    .eq("listing_id", listingId)
    .is("analysis_json", null);
  if (!photos || photos.length === 0) {
    await supabase.from("prompt_lab_listings").update({ status: "directing" }).eq("id", listingId);
    return;
  }

  await Promise.all(
    photos.map(async (p) => {
      const { analysis } = await analyzeSingleImage(p.image_url);
      const embedded = await embedTextSafe(
        buildAnalysisText({
          roomType: analysis.room_type,
          keyFeatures: analysis.key_features ?? [],
          composition: analysis.composition,
          suggestedMotion: analysis.suggested_motion,
          cameraMovement: null,
        }),
      );
      await supabase
        .from("prompt_lab_listing_photos")
        .update({
          analysis_json: analysis,
          embedding: embedded ? toPgVector(embedded.vector) : null,
        })
        .eq("id", p.id);
      if (embedded) {
        try {
          await supabase.from("cost_events").insert({
            property_id: null,
            scene_id: null,
            stage: "embedding",
            provider: "openai",
            units_consumed: embedded.usage.totalTokens,
            unit_type: "tokens",
            cost_cents: Math.round(embedded.usage.costCents),
            metadata: {
              scope: "lab_listing_photo_embedding",
              model: embedded.model,
              tokens: embedded.usage.totalTokens,
              listing_id: listingId,
              photo_id: p.id,
            },
          });
        } catch (costErr) {
          console.error("[embeddings] cost_events insert failed:", costErr);
        }
      }
    }),
  );

  await supabase.from("prompt_lab_listings").update({ status: "directing" }).eq("id", listingId);
}

export async function directListingScenes(listingId: string): Promise<void> {
  const supabase = getSupabase();
  const { data: listing } = await supabase
    .from("prompt_lab_listings")
    .select("id")
    .eq("id", listingId)
    .single();
  if (!listing) throw new Error(`Listing ${listingId} not found`);

  const { data: photos } = await supabase
    .from("prompt_lab_listing_photos")
    .select("id, photo_index, image_url, analysis_json, embedding")
    .eq("listing_id", listingId)
    .order("photo_index");
  if (!photos || photos.length === 0) throw new Error(`Listing ${listingId} has no photos`);

  // Map each photo's analysis_json into the shape buildDirectorUserPrompt
  // expects. The production director is trained on this exact layout —
  // room / aesthetic / depth / key_features / composition / motion hint
  // per photo, not raw JSON dumps. Mismatched user-prompt format was
  // making the director return non-JSON or malformed output on Lab
  // listings, dropping the listing into status='failed'.
  type DirectorUserPhoto = Parameters<typeof buildDirectorUserPrompt>[0][number];
  const photoData: DirectorUserPhoto[] = photos.map((p) => {
    const a = (p.analysis_json ?? {}) as {
      room_type?: string;
      aesthetic_score?: number;
      depth_rating?: string;
      key_features?: string[];
      composition?: string | null;
      suggested_motion?: string | null;
      motion_rationale?: string | null;
    };
    return {
      id: p.id,
      file_name: `photo_${p.photo_index}`,
      room_type: a.room_type ?? "other",
      aesthetic_score: typeof a.aesthetic_score === "number" ? a.aesthetic_score : 5,
      depth_rating: a.depth_rating ?? "medium",
      key_features: Array.isArray(a.key_features) ? a.key_features : [],
      composition: a.composition ?? null,
      suggested_motion: a.suggested_motion ?? null,
      motion_rationale: a.motion_rationale ?? null,
    };
  });

  // Retrieve promoted recipes + past winners + past losers per photo,
  // dedupe across photos, and inject as in-context examples. Restores
  // the legacy recipe-driven director behavior that Lab sessions have
  // always used. End-frame pairing is unaffected — the director still
  // returns end_photo_id per scene and that flows through the same
  // resolver below.
  const recipeDedupe = new Map<string, RetrievedRecipe>();
  const exemplarDedupe = new Map<string, RetrievedExemplar>();
  const loserDedupe = new Map<string, RetrievedExemplar>();
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const pdata = photoData[i];
    const vec = fromPgVector(p.embedding as string | null);
    if (!vec) continue;
    try {
      const [recipes, winners, losers] = await Promise.all([
        retrieveMatchingRecipes(vec, pdata.room_type, { limit: 1 }),
        retrieveSimilarIterations(vec, { minRating: 4, limit: 3 }),
        retrieveSimilarLosers(vec, { maxRating: 2, limit: 2 }),
      ]);
      for (const r of recipes) if (!recipeDedupe.has(r.archetype)) recipeDedupe.set(r.archetype, r);
      for (const w of winners) if (!exemplarDedupe.has(w.id)) exemplarDedupe.set(w.id, w);
      for (const l of losers) if (!loserDedupe.has(l.id)) loserDedupe.set(l.id, l);
    } catch (err) {
      // Retrieval is best-effort — a failing RPC must not block the
      // director. The rulebook alone still produces valid output.
      console.warn(`[directListingScenes] retrieval for photo ${p.id}:`, err);
    }
  }
  const recipes = [...recipeDedupe.values()].slice(0, 5);
  const exemplars = [...exemplarDedupe.values()].slice(0, 5);
  const losers = [...loserDedupe.values()].slice(0, 3);

  const userPrompt =
    buildDirectorUserPrompt(photoData) +
    renderRecipeBlock(recipes) +
    renderExemplarBlock(exemplars) +
    renderLoserBlock(losers);

  const LISTING_DIRECTOR_MODEL = "claude-sonnet-4-6";
  const client = new Anthropic();
  const response = await client.messages.create({
    model: LISTING_DIRECTOR_MODEL,
    max_tokens: 8192,
    system: DIRECTOR_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Record token cost for listing director (Sonnet 4.6).
  try {
    const supabaseForCost = getSupabase();
    const cost = computeClaudeCost(response.usage as never, LISTING_DIRECTOR_MODEL);
    await supabaseForCost.from("cost_events").insert({
      property_id: null,
      scene_id: null,
      stage: "director",
      provider: "anthropic",
      units_consumed: cost.totalTokens,
      unit_type: "tokens",
      cost_cents: Math.round(cost.costCents),
      metadata: { scope: "lab_listing_director", listing_id: listingId, model: LISTING_DIRECTOR_MODEL },
    });
  } catch (costErr) {
    console.error("[directListingScenes] cost_events insert failed:", costErr);
  }

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Director emitted no JSON. First 200 chars: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(jsonMatch[0]) as {
    scenes: Array<{
      scene_number: number;
      photo_id: string;
      end_photo_id?: string | null;
      room_type: string;
      camera_movement: string;
      prompt: string;
      director_intent: unknown;
    }>;
  };

  const photoUrlById = new Map(photos.map((p) => [p.id, p.image_url]));
  for (const scene of parsed.scenes) {
    const startUrl = photoUrlById.get(scene.photo_id);
    if (!startUrl) continue;
    const resolution = await resolveSceneEndFrame({
      startPhotoUrl: startUrl,
      endPhotoId: scene.end_photo_id ?? null,
      photoLookup: async (id) => photoUrlById.get(id) ?? null,
    });
    let intent: DirectorIntent;
    try {
      intent = parseDirectorIntent(scene.director_intent);
    } catch {
      // If director omitted intent, synthesize a minimal one from the
      // other scene fields so persistence doesn't fail.
      intent = parseDirectorIntent({
        room_type: scene.room_type,
        motion: scene.camera_movement,
        subject: scene.prompt.slice(0, 80),
      });
    }

    await supabase.from("prompt_lab_listing_scenes").insert({
      listing_id: listingId,
      scene_number: scene.scene_number,
      photo_id: scene.photo_id,
      end_photo_id: scene.end_photo_id ?? null,
      end_image_url: resolution.endImageUrl,
      room_type: scene.room_type,
      camera_movement: scene.camera_movement,
      director_prompt: scene.prompt,
      director_intent: intent,
    });
  }

  await supabase.from("prompt_lab_listings").update({ status: "ready_to_render" }).eq("id", listingId);
}
