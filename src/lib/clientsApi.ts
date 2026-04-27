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

export interface Client {
  id: string;
  name: string;
  sierra_public_base_url: string;
  sierra_admin_url?: string;
  sierra_admin_username?: string;
  sierra_region_id?: string;
  agent_name?: string;
  agent_team_line?: string | null;
  agent_phone?: string;
  agent_email?: string;
  agent_photo_url?: string | null;
  agent_schedule_url?: string;
  brand_primary_color?: string;
  created_at: string;
}

export interface CreateClientInput {
  name: string;
  sierra_public_base_url: string;
  sierra_admin_url: string;
  sierra_admin_username: string;
  sierra_admin_password: string;
  sierra_region_id: string;
  agent_name: string;
  agent_team_line?: string;
  agent_phone: string;
  agent_email: string;
  agent_photo_url?: string;
  agent_schedule_url: string;
  brand_primary_color?: string;
}

const MOCK_CLIENTS: Client[] = [
  {
    id: "mock-1",
    name: "Helgemo Team (mock)",
    sierra_public_base_url: "https://thehelgemoteam.com",
    created_at: "2026-04-27T00:00:00Z",
  },
];

export async function listClients(): Promise<Client[]> {
  try {
    return await authedFetch<Client[]>("/api/clients");
  } catch (err) {
    // Backend not ready yet — fall back to mock data
    const isNotFound = err instanceof Error && err.message.startsWith("404");
    if (isNotFound) return MOCK_CLIENTS;
    throw err;
  }
}

export async function createClient(input: CreateClientInput): Promise<Client> {
  return authedFetch<Client>("/api/clients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
