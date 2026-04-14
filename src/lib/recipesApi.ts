import { supabase } from "./supabase";

export interface LabRecipe {
  id: string;
  archetype: string;
  room_type: string;
  camera_movement: string;
  provider: string | null;
  composition_signature: Record<string, unknown> | null;
  prompt_template: string;
  source_iteration_id: string | null;
  rating_at_promotion: number | null;
  promoted_by: string;
  promoted_at: string;
  times_applied: number;
  status: "active" | "archived" | "pending";
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

export function listRecipes(): Promise<{ recipes: LabRecipe[] }> {
  return fetchJSON("/api/admin/prompt-lab/recipes");
}

export function promoteRecipe(body: { iteration_id: string; archetype: string; prompt_template?: string; composition_signature?: Record<string, unknown> }): Promise<LabRecipe> {
  return fetchJSON("/api/admin/prompt-lab/recipes", { method: "POST", body: JSON.stringify(body) });
}

export function updateRecipe(id: string, patch: Partial<Pick<LabRecipe, "archetype" | "prompt_template" | "status" | "composition_signature">>): Promise<LabRecipe> {
  return fetchJSON(`/api/admin/prompt-lab/recipes?id=${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteRecipe(id: string): Promise<void> {
  return fetchJSON(`/api/admin/prompt-lab/recipes?id=${id}`, { method: "DELETE" });
}
