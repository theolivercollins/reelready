import { supabase } from "@/lib/supabase";
import type {
  CellSummary,
  CellDrillDown,
  CostRollup,
} from "../../lib/knowledge-map/types.js";

async function authedFetch<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  const res = await fetch(path, { headers });
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

export async function fetchCells(): Promise<{
  cells: CellSummary[];
  summary: { total_cells: number; by_state: Record<string, number> };
}> {
  return authedFetch("/api/admin/knowledge-map/cells");
}

export async function fetchCellDrillDown(cellKey: string): Promise<{ cell: CellDrillDown }> {
  return authedFetch(`/api/admin/knowledge-map/cell/${encodeURIComponent(cellKey)}`);
}

export async function fetchCostRollup(days = 30): Promise<{ days: number } & CostRollup> {
  return authedFetch(`/api/admin/knowledge-map/cost?days=${days}`);
}

// Phase 1 judge status — reused for the calibration panel on the map page.
export interface CalibrationStatusSummary {
  total_cells_calibrated: number;
  cells_auto: number;
  cells_advisory: number;
  overall_within_one_star: number;
}

export async function fetchCalibrationStatus(): Promise<{
  cells: Array<{
    cell_key: string;
    mode: "auto" | "advisory";
    within_one_star_rate: number;
    sample_size: number;
  }>;
  summary: CalibrationStatusSummary;
}> {
  return authedFetch("/api/admin/judge/status");
}
