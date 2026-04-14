import { supabase } from "./supabase";

export interface DevNote {
  id: string;
  created_by: string;
  session_date: string;
  objective: string | null;
  accomplishments: string | null;
  created_at: string;
  updated_at: string;
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

export function listDevNotes(): Promise<{ notes: DevNote[] }> {
  return fetchJSON("/api/admin/dev-notes");
}

export function createDevNote(body: { session_date?: string; objective?: string; accomplishments?: string }): Promise<DevNote> {
  return fetchJSON("/api/admin/dev-notes", { method: "POST", body: JSON.stringify(body) });
}

export function updateDevNote(id: string, patch: { session_date?: string; objective?: string | null; accomplishments?: string | null }): Promise<DevNote> {
  return fetchJSON(`/api/admin/dev-notes?id=${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteDevNote(id: string): Promise<void> {
  return fetchJSON(`/api/admin/dev-notes?id=${id}`, { method: "DELETE" });
}
