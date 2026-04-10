import { getSupabase } from "./client.js";
import type {
  Property,
  PropertyStatus,
  Photo,
  Scene,
  SceneStatus,
  PipelineLog,
  LogStage,
  LogLevel,
  RoomType,
  DepthRating,
  VideoProvider,
} from "./types.js";

// ── Properties ──

export async function createProperty(data: {
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  listing_agent: string;
  brokerage?: string;
  submitted_by?: string;
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

export async function addPropertyCost(
  id: string,
  costCents: number
): Promise<void> {
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

// ── Photos ──

export async function insertPhotos(
  photos: Array<{
    property_id: string;
    file_url: string;
    file_name: string;
  }>
): Promise<Photo[]> {
  const { data, error } = await getSupabase()
    .from("photos")
    .insert(photos)
    .select();
  if (error) throw error;
  return data as Photo[];
}

export async function getPhotosForProperty(
  propertyId: string
): Promise<Photo[]> {
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
    selected: boolean;
    discard_reason: string | null;
  }
): Promise<void> {
  const { error } = await getSupabase()
    .from("photos")
    .update(analysis)
    .eq("id", id);
  if (error) throw error;
}

export async function getSelectedPhotos(
  propertyId: string
): Promise<Photo[]> {
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
  const { data, error } = await getSupabase()
    .from("scenes")
    .insert(scenes)
    .select();
  if (error) throw error;
  return data as Scene[];
}

export async function getScenesForProperty(
  propertyId: string
): Promise<Scene[]> {
  const { data, error } = await getSupabase()
    .from("scenes")
    .select()
    .eq("property_id", propertyId)
    .order("scene_number");
  if (error) throw error;
  return data as Scene[];
}

export async function updateScene(
  id: string,
  updates: Partial<Scene>
): Promise<void> {
  const { error } = await getSupabase()
    .from("scenes")
    .update(updates)
    .eq("id", id);
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

export async function allScenesPassedQC(
  propertyId: string
): Promise<boolean> {
  const scenes = await getScenesForProperty(propertyId);
  return scenes.length > 0 && scenes.every((s) => s.status === "qc_pass");
}

export async function getScenesNeedingReview(
  propertyId: string
): Promise<Scene[]> {
  const { data, error } = await getSupabase()
    .from("scenes")
    .select()
    .eq("property_id", propertyId)
    .eq("status", "needs_review");
  if (error) throw error;
  return data as Scene[];
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

// ── Daily Stats ──

export async function upsertDailyStats(
  date: string,
  updates: Partial<Omit<import("./types.js").DailyStats, "id" | "date">>
): Promise<void> {
  const { error } = await getSupabase()
    .from("daily_stats")
    .upsert({ date, ...updates }, { onConflict: "date" });
  if (error) throw error;
}
