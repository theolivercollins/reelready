import { supabase } from "./supabase";

export interface LabSession {
  id: string;
  created_by: string;
  image_url: string;
  image_path: string;
  label: string | null;
  archetype: string | null;
  batch_label: string | null;
  created_at: string;
  iteration_count?: number;
  best_rating?: number | null;
  completed?: boolean;
  pending_render?: boolean;
  ready_for_approval?: boolean;
  has_feedback?: boolean;
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
  provider_task_id: string | null;
  render_error: string | null;
  render_submitted_at: string | null;
  cost_cents: number;
  rating: number | null;
  tags: string[] | null;
  user_comment: string | null;
  refinement_instruction: string | null;
  created_at: string;
  retrieval_metadata: {
    exemplars?: Array<{
      id: string;
      prompt: string;
      rating: number;
      distance: number;
      room_type?: string;
      camera_movement?: string;
    }>;
    recipe?: {
      id: string;
      archetype: string;
      prompt_template: string;
      distance: number;
    } | null;
  } | null;
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

export function createSession(body: { image_url: string; image_path: string; label?: string; archetype?: string; batch_label?: string }): Promise<LabSession> {
  return fetchJSON("/api/admin/prompt-lab/sessions", { method: "POST", body: JSON.stringify(body) });
}

export function getSession(sessionId: string): Promise<{ session: LabSession; iterations: LabIteration[] }> {
  return fetchJSON(`/api/admin/prompt-lab/${sessionId}`);
}

export function updateSession(sessionId: string, patch: { label?: string | null; archetype?: string | null; batch_label?: string | null }): Promise<LabSession> {
  return fetchJSON(`/api/admin/prompt-lab/${sessionId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteSession(sessionId: string): Promise<void> {
  return fetchJSON(`/api/admin/prompt-lab/${sessionId}`, { method: "DELETE" });
}

export function analyzeSession(sessionId: string): Promise<{ iteration: LabIteration; retrieval: unknown }> {
  return fetchJSON("/api/admin/prompt-lab/analyze", { method: "POST", body: JSON.stringify({ session_id: sessionId }) });
}

export function refineIteration(body: {
  iteration_id: string;
  rating?: number | null;
  tags?: string[] | null;
  comment?: string | null;
  chat_instruction: string;
}): Promise<{ iteration: LabIteration; retrieval: unknown }> {
  return fetchJSON("/api/admin/prompt-lab/refine", { method: "POST", body: JSON.stringify(body) });
}

export function rateIteration(body: {
  iteration_id: string;
  rating?: number | null;
  tags?: string[] | null;
  comment?: string | null;
}): Promise<{ iteration: LabIteration; auto_promoted: { id: string; archetype: string } | null }> {
  return fetchJSON("/api/admin/prompt-lab/rate", { method: "POST", body: JSON.stringify(body) });
}

export function renderIteration(
  iterationId: string,
  provider?: "kling" | "runway" | null
): Promise<LabIteration & { renderError?: string }> {
  return fetchJSON("/api/admin/prompt-lab/render", {
    method: "POST",
    body: JSON.stringify({ iteration_id: iterationId, provider: provider ?? null }),
  });
}
