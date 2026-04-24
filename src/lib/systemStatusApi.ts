import { supabase } from "@/lib/supabase";

export interface SystemStatusEvent {
  id: number;
  created_at: string;
  stage: string;
  provider: string;
  units_consumed: number | null;
  unit_type: string | null;
  cost_cents: number | null;
  metadata: Record<string, unknown> | null;
}

export interface SystemStatusProviderRow {
  provider: string;
  stage: string;
  count_24h: number;
  cost_cents_24h: number;
  cost_cents_7d: number;
  mean_cost_cents: number;
  last_at: string | null;
}

export interface SystemStatusRegression {
  pattern: string;
  count: number;
  example_iteration_id: string | null;
  example_prompt: string | null;
}

export interface SystemStatusFeedbackRow {
  iteration_id: string;
  order_id: string | null;
  created_at: string;
  rating: number | null;
  tags: string[];
  user_comment: string | null;
  refinement_instruction: string | null;
  session_id: string | null;
  model_used: string | null;
}

export interface SystemStatusFlag {
  name: string;
  value: boolean;
  reason: string | null;
  set_at: string;
}

export interface SystemStatusResponse {
  generated_at: string;
  events: SystemStatusEvent[];
  provider_summary: SystemStatusProviderRow[];
  queues: {
    judge_pending: number;
    judge_errors_24h: number;
    renders_pending: number;
    renders_orphan_over_30m: number;
  };
  recent_regressions: SystemStatusRegression[];
  budget: {
    today_cents: number;
    last_7d_cents: number;
    last_30d_cents: number;
  };
  feedback_log: SystemStatusFeedbackRow[];
  system_flags: SystemStatusFlag[];
}

export async function setSystemFlag(name: string, value: boolean, reason?: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  const res = await fetch("/api/admin/system-flags", {
    method: "POST",
    headers,
    body: JSON.stringify({ name, value, reason }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export async function fetchSystemStatus(): Promise<SystemStatusResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  const res = await fetch("/api/admin/system-status", { headers });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body as SystemStatusResponse;
}

export interface SkuAffinityRule {
  camera_movement: string;
  prefer: string[];
  avoid: string[];
  reason: string;
  confidence: "high_empirical" | "medium_empirical" | "qualitative" | "pending";
  evidence: Record<string, unknown>;
  last_refreshed_at: string;
}

export interface SkuAffinityResponse {
  rules: SkuAffinityRule[];
  recent_runs: Array<{
    id: number;
    ran_at: string;
    window_days: number;
    motions_updated: number;
    motions_skipped_low_n: number;
    template_regressions: SystemStatusRegression[];
  }>;
}

export async function fetchSkuAffinity(): Promise<SkuAffinityResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  const res = await fetch("/api/admin/sku-affinity", { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
