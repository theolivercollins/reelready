import { supabase } from "./supabase";

export interface LabProposal {
  id: string;
  prompt_name: string;
  base_body_hash: string;
  proposed_diff: string;
  proposed_body: string;
  evidence: {
    buckets?: Array<{
      bucket: { room: string; camera_movement: string; provider: string };
      sample_size: number;
      avg_rating: number;
      winners: Array<{ iteration_id: string; prompt: string; rating: number }>;
      losers: Array<{ iteration_id: string; prompt: string; rating: number }>;
    }>;
    changes?: Array<{ change_id: string; intent: string; evidence_iteration_ids: string[]; evidence_summary: string }>;
    iterations_count?: number;
    days?: number;
  } | null;
  rationale: string | null;
  status: "pending" | "applied" | "rejected";
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
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

export function runMining(days: number = 60): Promise<LabProposal> {
  return fetchJSON("/api/admin/prompt-lab/mine", { method: "POST", body: JSON.stringify({ days }) });
}

export function listProposals(): Promise<{ proposals: LabProposal[] }> {
  return fetchJSON("/api/admin/prompt-lab/proposals");
}

export function reviewProposal(id: string, action: "apply" | "reject"): Promise<LabProposal> {
  return fetchJSON(`/api/admin/prompt-lab/proposals?id=${id}&action=${action}`, { method: "PATCH" });
}

export interface OverrideReadiness {
  override_id: string;
  prompt_name: string;
  body: string;
  body_hash: string;
  override_created_at: string;
  rated_count: number | null;
  avg_rating: number | null;
  winners: number | null;
  losers: number | null;
  rendered_count: number | null;
  ready_for_promotion: boolean;
}

export function listPromotableOverrides(): Promise<{ overrides: OverrideReadiness[] }> {
  return fetchJSON("/api/admin/prompt-lab/promote-to-prod");
}

export function promoteOverrideToProd(
  override_id: string,
  opts?: { note?: string; force?: boolean },
): Promise<{
  ok: boolean;
  prompt_name: string;
  version: number;
  revision_id: string;
  cohort_stats: OverrideReadiness | null;
  forced: boolean;
}> {
  return fetchJSON("/api/admin/prompt-lab/promote-to-prod", {
    method: "POST",
    body: JSON.stringify({ override_id, ...(opts ?? {}) }),
  });
}
