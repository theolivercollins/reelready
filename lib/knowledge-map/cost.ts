import { getSupabase } from "../client.js";
import type { CostRollup, CostRollupRow } from "./types.js";

// Reads from cost_events (generation/analysis/etc.) + lab_judge_scores
// (judge calls). Lab-only for Phase 2 — full per-cell attribution is
// Phase 3 when the iterator writes richer metadata on cost_events.
export async function getCostRollup(opts: { sinceDaysBack?: number } = {}): Promise<CostRollup> {
  const supabase = getSupabase();
  const since = new Date();
  since.setDate(since.getDate() - (opts.sinceDaysBack ?? 30));
  const sinceIso = since.toISOString();

  const { data: eventRows, error: eventErr } = await supabase
    .from("cost_events")
    .select("provider, stage, units_consumed, cost_cents")
    .gte("created_at", sinceIso);
  if (eventErr) throw new Error(`cost_events fetch failed: ${eventErr.message}`);

  const groupKey = (r: { provider: string; stage: string }) => `${r.provider}::${r.stage}`;
  const grouped = new Map<string, CostRollupRow>();
  let totalCents = 0;
  for (const raw of eventRows ?? []) {
    const r = raw as { provider: string; stage: string; units_consumed: number | null; cost_cents: number };
    const key = groupKey(r);
    const existing = grouped.get(key);
    if (existing) {
      existing.cost_cents += Number(r.cost_cents ?? 0);
      existing.units_consumed = (existing.units_consumed ?? 0) + Number(r.units_consumed ?? 0);
      existing.event_count += 1;
    } else {
      grouped.set(key, {
        provider: r.provider,
        stage: r.stage,
        units_consumed: r.units_consumed ?? 0,
        cost_cents: Number(r.cost_cents ?? 0),
        event_count: 1,
      });
    }
    totalCents += Number(r.cost_cents ?? 0);
  }

  const { data: judgeRows, error: judgeErr } = await supabase
    .from("lab_judge_scores")
    .select("cost_cents")
    .gte("judged_at", sinceIso);
  if (judgeErr) throw new Error(`judge cost fetch failed: ${judgeErr.message}`);
  let judgeTotal = 0;
  for (const j of judgeRows ?? []) {
    judgeTotal += Number((j as { cost_cents?: number }).cost_cents ?? 0);
  }

  // Judge calls are not currently written to cost_events (Phase 1 stores
  // them only on lab_judge_scores.cost_cents). Sum is safe today. If
  // Phase 3 starts writing judge cost to cost_events, remove judgeTotal
  // from the total_cents sum here to avoid double-counting.
  return {
    total_cents: totalCents + judgeTotal,
    by_provider_and_stage: Array.from(grouped.values()).sort((a, b) => b.cost_cents - a.cost_cents),
    judge_total_cents: judgeTotal,
  };
}
