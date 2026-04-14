import { supabase } from "./supabase";

export interface LabSession {
  id: string;
  created_by: string;
  image_url: string;
  image_path: string;
  label: string | null;
  archetype: string | null;
  created_at: string;
  iteration_count?: number;
  best_rating?: number | null;
}

export interface LabIteration {
  id: string;
  session_id: string;
  iteration_number: number;
  analysis_json: Record<string, unknown> | null;
  analysis_prompt_hash: string | null;
  director_output_json: {
    camera_movement: string;
    prompt: string;
    duration_seconds: number;
    room_type: string;
    [k: string]: unknown;
  } | null;
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

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function uploadLabImage(file: File): Promise<{ url: string; path: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `prompt-lab/${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("property-photos").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { data: pub } = supabase.storage.from("property-photos").getPublicUrl(path);
  return { url: pub.publicUrl, path };
}

export function listSessions(): Promise<{ sessions: LabSession[] }> {
  return fetchJSON("/api/admin/prompt-lab/sessions");
}

export function createSession(body: { image_url: string; image_path: string; label?: string; archetype?: string }): Promise<LabSession> {
  return fetchJSON("/api/admin/prompt-lab/sessions", { method: "POST", body: JSON.stringify(body) });
}

export function getSession(sessionId: string): Promise<{ session: LabSession; iterations: LabIteration[] }> {
  return fetchJSON(`/api/admin/prompt-lab/${sessionId}`);
}

export function deleteSession(sessionId: string): Promise<void> {
  return fetchJSON(`/api/admin/prompt-lab/${sessionId}`, { method: "DELETE" });
}

export function analyzeSession(sessionId: string): Promise<LabIteration> {
  return fetchJSON("/api/admin/prompt-lab/analyze", { method: "POST", body: JSON.stringify({ session_id: sessionId }) });
}

export function refineIteration(body: {
  iteration_id: string;
  rating?: number | null;
  tags?: string[] | null;
  comment?: string | null;
  chat_instruction: string;
}): Promise<LabIteration> {
  return fetchJSON("/api/admin/prompt-lab/refine", { method: "POST", body: JSON.stringify(body) });
}

export function renderIteration(iterationId: string): Promise<LabIteration & { renderError?: string }> {
  return fetchJSON("/api/admin/prompt-lab/render", { method: "POST", body: JSON.stringify({ iteration_id: iterationId }) });
}
