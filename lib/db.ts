import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Property,
  PropertyStatus,
  Photo,
  Scene,
  SceneStatus,
  RoomType,
  DepthRating,
  VideoProvider,
  LogStage,
  LogLevel,
} from "./types.js";

export type {
  Property,
  PropertyStatus,
  Photo,
  Scene,
  SceneStatus,
  RoomType,
  DepthRating,
  VideoProvider,
  LogStage,
  LogLevel,
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    client = createClient(url, key);
  }
  return client;
}

// ── Properties ──

export async function createProperty(data: {
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  listing_agent: string;
  brokerage?: string;
}): Promise<Property> {
  const { data: row, error } = await getSupabase()
    .from("properties")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return row as Property;
}

export async function updatePropertyStatus(
  id: string,
  status: PropertyStatus,
  extra?: Partial<Property>
): Promise<void> {
  const { error } = await getSupabase()
    .from("properties")
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq("id", id);
  if (error) throw error;
}

export async function getProperty(id: string): Promise<Property> {
  const { data, error } = await getSupabase()
    .from("properties")
    .select()
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Property;
}

export async function addPropertyCost(id: string, costCents: number): Promise<void> {
  const prop = await getProperty(id);
  const { error } = await getSupabase()
    .from("properties")
    .update({
      total_cost_cents: prop.total_cost_cents + costCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

// ── Scene ratings (feedback loop) ──

export interface SceneRating {
  id: string;
  scene_id: string;
  property_id: string;
  rating: number;
  comment: string | null;
  tags: string[] | null;
  rated_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function upsertSceneRating(input: {
  scene_id: string;
  property_id: string;
  rating: number;
  comment?: string | null;
  tags?: string[] | null;
  rated_by?: string | null;
}): Promise<SceneRating> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("scene_ratings")
    .upsert(
      {
        scene_id: input.scene_id,
        property_id: input.property_id,
        rating: input.rating,
        comment: input.comment ?? null,
        tags: input.tags ?? null,
        rated_by: input.rated_by ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "scene_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data as SceneRating;
}

export async function getRatingsForProperty(propertyId: string): Promise<SceneRating[]> {
  const { data, error } = await getSupabase()
    .from("scene_ratings")
    .select()
    .eq("property_id", propertyId);
  if (error) throw error;
  return (data ?? []) as SceneRating[];
}

// Pull recent good + bad scene ratings across all properties for
// in-context director learning. Each returned row includes the joined
// scene fields the director needs to render an example line.
export interface RatedSceneExample {
  rating: number;
  comment: string | null;
  tags: string[] | null;
  scene: {
    room_type: string;
    camera_movement: string;
    prompt: string;
    provider: string | null;
  };
}

export async function fetchRatedExamples(params: {
  minRating?: number;
  maxRating?: number;
  limit?: number;
  sinceDays?: number;
}): Promise<RatedSceneExample[]> {
  const sinceDays = params.sinceDays ?? 30;
  const sinceIso = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const supabase = getSupabase();

  // Fetch ratings first, then look up scene + photo details in a second
  // query so we avoid fragile nested PostgREST joins across multiple
  // relationships. Keeps the code defensive against schema drift and
  // lets us tolerate scenes that were deleted since the rating was made.
  let ratingsQuery = supabase
    .from("scene_ratings")
    .select("rating, comment, tags, scene_id, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 20);
  if (params.minRating !== undefined) ratingsQuery = ratingsQuery.gte("rating", params.minRating);
  if (params.maxRating !== undefined) ratingsQuery = ratingsQuery.lte("rating", params.maxRating);
  const { data: ratingRows, error: ratingsErr } = await ratingsQuery;
  if (ratingsErr) throw ratingsErr;
  const ratings = (ratingRows ?? []) as Array<{
    rating: number;
    comment: string | null;
    tags: string[] | null;
    scene_id: string;
    created_at: string;
  }>;
  if (ratings.length === 0) return [];

  // Fetch the scene rows (prompt, camera_movement, provider, photo_id).
  const sceneIds = ratings.map(r => r.scene_id);
  const { data: sceneRows } = await supabase
    .from("scenes")
    .select("id, camera_movement, prompt, provider, photo_id")
    .in("id", sceneIds);
  const sceneMap = new Map((sceneRows ?? []).map((s: { id: string } & Record<string, unknown>) => [s.id, s]));

  // Fetch the photo room_types for those scenes.
  const photoIds = Array.from(new Set((sceneRows ?? []).map((s: { photo_id: string }) => s.photo_id).filter(Boolean)));
  const { data: photoRows } = photoIds.length
    ? await supabase.from("photos").select("id, room_type").in("id", photoIds)
    : { data: [] as Array<{ id: string; room_type: string }> };
  const photoMap = new Map((photoRows ?? []).map((p: { id: string; room_type: string }) => [p.id, p.room_type]));

  return ratings.flatMap(r => {
    const scene = sceneMap.get(r.scene_id) as undefined | {
      camera_movement: string;
      prompt: string;
      provider: string | null;
      photo_id: string;
    };
    if (!scene) return []; // scene deleted — skip
    return [{
      rating: r.rating,
      comment: r.comment,
      tags: r.tags,
      scene: {
        room_type: photoMap.get(scene.photo_id) ?? "other",
        camera_movement: scene.camera_movement,
        prompt: scene.prompt,
        provider: scene.provider,
      },
    }];
  });
}

// ── Prompt revisions (changelog) ──

export async function recordPromptRevisionIfChanged(
  promptName: string,
  body: string,
  note: string | null = null,
): Promise<void> {
  const bodyHash = hashString(body);
  const supabase = getSupabase();
  const { data: latest } = await supabase
    .from("prompt_revisions")
    .select("version, body_hash")
    .eq("prompt_name", promptName)
    .order("version", { ascending: false })
    .limit(1);
  const latestRow = latest?.[0] as { version: number; body_hash: string } | undefined;
  if (latestRow && latestRow.body_hash === bodyHash) return;
  const nextVersion = (latestRow?.version ?? 0) + 1;
  const { error } = await supabase.from("prompt_revisions").insert({
    prompt_name: promptName,
    version: nextVersion,
    body,
    note,
    body_hash: bodyHash,
  });
  if (error && !error.message?.includes("duplicate key")) throw error;
}

function hashString(s: string): string {
  // Simple FNV-1a 64-bit hash — good enough to detect prompt body changes.
  // Not cryptographic; we just need "did the text change since last run."
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16);
}

// Detailed cost event captured from a real API response (tokens, credits,
// provider units). Sum of cost_events.cost_cents for a property should
// exactly match properties.total_cost_cents.
export async function recordCostEvent(event: {
  propertyId: string;
  sceneId?: string | null;
  stage: "analysis" | "scripting" | "generation" | "qc" | "assembly";
  provider: "anthropic" | "runway" | "kling" | "luma";
  unitsConsumed?: number;
  unitType?: "tokens" | "credits" | "kling_units" | null;
  costCents: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabase();
  const { error: insertErr } = await supabase.from("cost_events").insert({
    property_id: event.propertyId,
    scene_id: event.sceneId ?? null,
    stage: event.stage,
    provider: event.provider,
    units_consumed: event.unitsConsumed ?? null,
    unit_type: event.unitType ?? null,
    cost_cents: Math.round(event.costCents),
    metadata: event.metadata ?? null,
  });
  if (insertErr) throw insertErr;
  if (event.costCents > 0) {
    await addPropertyCost(event.propertyId, Math.round(event.costCents));
  }
}

// ── Photos ──

export async function insertPhotos(
  photos: Array<{ property_id: string; file_url: string; file_name: string }>
): Promise<Photo[]> {
  const { data, error } = await getSupabase().from("photos").insert(photos).select();
  if (error) throw error;
  return data as Photo[];
}

export async function getPhotosForProperty(propertyId: string): Promise<Photo[]> {
  const { data, error } = await getSupabase()
    .from("photos")
    .select()
    .eq("property_id", propertyId)
    .order("created_at");
  if (error) throw error;
  return data as Photo[];
}

export async function updatePhotoAnalysis(
  id: string,
  analysis: {
    room_type: RoomType;
    quality_score: number;
    aesthetic_score: number;
    depth_rating: DepthRating;
    key_features: string[];
    composition?: string | null;
    selected: boolean;
    discard_reason: string | null;
    video_viable?: boolean | null;
    suggested_motion?: string | null;
    motion_rationale?: string | null;
  }
): Promise<void> {
  const { error } = await getSupabase().from("photos").update(analysis).eq("id", id);
  if (error) throw error;
}

export async function getSelectedPhotos(propertyId: string): Promise<Photo[]> {
  const { data, error } = await getSupabase()
    .from("photos")
    .select()
    .eq("property_id", propertyId)
    .eq("selected", true)
    .order("aesthetic_score", { ascending: false });
  if (error) throw error;
  return data as Photo[];
}

// ── Scenes ──

export async function insertScenes(
  scenes: Array<{
    property_id: string;
    photo_id: string;
    scene_number: number;
    camera_movement: string;
    prompt: string;
    duration_seconds: number;
    provider?: VideoProvider;
  }>
): Promise<Scene[]> {
  const { data, error } = await getSupabase().from("scenes").insert(scenes).select();
  if (error) throw error;
  return data as Scene[];
}

export async function getScenesForProperty(propertyId: string): Promise<Scene[]> {
  const { data, error } = await getSupabase()
    .from("scenes")
    .select()
    .eq("property_id", propertyId)
    .order("scene_number");
  if (error) throw error;
  return data as Scene[];
}

export async function updateScene(id: string, updates: Partial<Scene>): Promise<void> {
  const { error } = await getSupabase().from("scenes").update(updates).eq("id", id);
  if (error) throw error;
}

export async function updateSceneStatus(
  id: string,
  status: SceneStatus,
  extra?: Partial<Scene>
): Promise<void> {
  const { error } = await getSupabase()
    .from("scenes")
    .update({ status, ...extra })
    .eq("id", id);
  if (error) throw error;
}

// ── Pipeline Logs ──

export async function log(
  propertyId: string,
  stage: LogStage,
  level: LogLevel,
  message: string,
  metadata?: Record<string, unknown>,
  sceneId?: string
): Promise<void> {
  const { error } = await getSupabase().from("pipeline_logs").insert({
    property_id: propertyId,
    scene_id: sceneId ?? null,
    stage,
    level,
    message,
    metadata: metadata ?? null,
  });
  if (error) console.error("Failed to write log:", error);
}
