import { supabase } from "@/lib/supabase";

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = init?.body ? { "Content-Type": "application/json" } : {};
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body as T;
}

export interface LabListing {
  id: string;
  name: string;
  created_at: string;
  model_name: string;
  status: string;
  archived: boolean;
  notes: string | null;
  total_cost_cents: number;
}

export interface LabListingPhoto {
  id: string;
  listing_id: string;
  photo_index: number;
  image_url: string;
  analysis_json: Record<string, unknown> | null;
  created_at: string;
}

export interface LabListingScene {
  id: string;
  listing_id: string;
  scene_number: number;
  photo_id: string;
  end_photo_id: string | null;
  end_image_url: string | null;
  room_type: string;
  camera_movement: string;
  director_prompt: string;
  director_intent: Record<string, unknown>;
  refinement_notes: string | null;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: string;
  pinned?: boolean;
}

export interface LabListingIteration {
  id: string;
  scene_id: string;
  iteration_number: number;
  director_prompt: string;
  model_used: string;
  provider_task_id: string | null;
  clip_url: string | null;
  rating: number | null;
  tags: string[] | null;
  user_comment: string | null;
  cost_cents: number;
  status: string;
  render_error: string | null;
  chat_messages: ChatMessage[];
  created_at: string;
}

export async function listListings(): Promise<{ listings: LabListing[] }> {
  return authedFetch("/api/admin/prompt-lab/listings");
}

export async function getListing(id: string): Promise<{
  listing: LabListing;
  photos: LabListingPhoto[];
  scenes: LabListingScene[];
  iterations: LabListingIteration[];
}> {
  return authedFetch(`/api/admin/prompt-lab/listings/${id}`);
}

export async function createListing(input: {
  name: string;
  model_name: string;
  notes?: string | null;
  photos: Array<{ image_url: string; image_path: string }>;
}): Promise<{ listing_id: string }> {
  return authedFetch("/api/admin/prompt-lab/listings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function patchListing(id: string, input: {
  name?: string;
  notes?: string | null;
  archived?: boolean;
}): Promise<{ listing: LabListing }> {
  return authedFetch(`/api/admin/prompt-lab/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function directListing(id: string): Promise<{ ok: true }> {
  return authedFetch(`/api/admin/prompt-lab/listings/${id}/direct`, { method: "POST", body: JSON.stringify({}) });
}

export async function renderListing(id: string, input: {
  scene_ids?: string[] | "all";
  model_override?: string;
}): Promise<{ submitted: Array<{ scene_id: string; iteration_id: string; task_id: string }> }> {
  return authedFetch(`/api/admin/prompt-lab/listings/${id}/render`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function rateIteration(listingId: string, iterId: string, input: {
  rating?: number | null;
  tags?: string[] | null;
  comment?: string | null;
}): Promise<{ iteration: LabListingIteration }> {
  return authedFetch(`/api/admin/prompt-lab/listings/${listingId}/iterations/${iterId}/rate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function refineScenePrompt(listingId: string, sceneId: string, directorPrompt: string): Promise<{ scene: LabListingScene }> {
  return authedFetch(`/api/admin/prompt-lab/listings/${listingId}/scenes/${sceneId}`, {
    method: "PATCH",
    body: JSON.stringify({ director_prompt: directorPrompt }),
  });
}

export async function chatIteration(listingId: string, iterId: string, message: string): Promise<{
  chat_messages: ChatMessage[];
  saved_instructions: string[];
}> {
  return authedFetch(`/api/admin/prompt-lab/listings/${listingId}/iterations/${iterId}/chat`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function pinSceneInstruction(listingId: string, sceneId: string, instruction: string): Promise<{
  scene: { id: string; refinement_notes: string | null };
}> {
  return authedFetch(`/api/admin/prompt-lab/listings/${listingId}/scenes/${sceneId}/pin-instruction`, {
    method: "POST",
    body: JSON.stringify({ instruction }),
  });
}

export async function setSceneRefinementNotes(listingId: string, sceneId: string, notes: string | null): Promise<{
  scene: { id: string; refinement_notes: string | null };
}> {
  return authedFetch(`/api/admin/prompt-lab/listings/${listingId}/scenes/${sceneId}/pin-instruction`, {
    method: "POST",
    body: JSON.stringify({ refinement_notes: notes }),
  });
}
