import type { VercelRequest, VercelResponse } from "@vercel/node";
export const maxDuration = 60;

import { getSupabase } from "../../lib/client.js";

// Nightly cron: recompute sku_motion_affinity rules from the last 30 days of
// rated iterations, and log any template regressions (banned phrasing
// reappearing in recent director output) so we notice drift without anyone
// manually querying.
//
// Rule thresholds:
//   - Minimum 5 ratings per (motion × SKU) to participate.
//   - "prefer" = the highest-mean SKU that also has N ≥ 5.
//   - "avoid"  = SKUs with mean ≤ (best - 1.0) AND own mean < 3.5.
//   - confidence = "high_empirical"  when best SKU has N ≥ 10 AND gap ≥ 1.0
//                  "medium_empirical" when best SKU has N ≥ 5  AND gap ≥ 0.7
//                  otherwise motion is skipped (too noisy to derive a rule).
// Rules we already have but no longer have evidence for are left untouched —
// the cron only UPSERTs; it never deletes. The evidence JSON's last_refresh
// lets operators see how stale a rule is.

const WINDOW_DAYS = 30;
const MIN_N_PER_SKU = 5;
const HIGH_GAP = 1.0;
const MED_GAP = 0.7;
const AVOID_ABS_MEAN = 3.5;

interface StatRow {
  camera_movement: string;
  sku: string;
  n: number;
  mean_rating: number;
  fail_rate_pct: number;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabase();
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  // Pull rated iterations with model_used and camera_movement.
  const { data: rated, error } = await supabase
    .from("prompt_lab_iterations")
    .select("rating, model_used, director_output_json, id")
    .not("rating", "is", null)
    .not("model_used", "is", null)
    .gte("created_at", sinceIso);
  if (error) return res.status(500).json({ error: error.message });

  // Aggregate (motion, sku) -> {n, sumRating, fails}.
  const agg = new Map<string, Map<string, { n: number; sum: number; fails: number }>>();
  for (const row of rated ?? []) {
    const motion = (row.director_output_json as { camera_movement?: string } | null)?.camera_movement;
    const sku = row.model_used as string | null;
    const rating = typeof row.rating === "number" ? row.rating : null;
    if (!motion || !sku || rating === null) continue;
    const byMotion = agg.get(motion) ?? new Map();
    const cell = byMotion.get(sku) ?? { n: 0, sum: 0, fails: 0 };
    cell.n += 1;
    cell.sum += rating;
    if (rating <= 2) cell.fails += 1;
    byMotion.set(sku, cell);
    agg.set(motion, byMotion);
  }

  // Convert to a flat list of stats.
  const stats: StatRow[] = [];
  for (const [motion, bySku] of agg.entries()) {
    for (const [sku, cell] of bySku.entries()) {
      stats.push({
        camera_movement: motion,
        sku,
        n: cell.n,
        mean_rating: Number((cell.sum / cell.n).toFixed(2)),
        fail_rate_pct: Math.round((cell.fails / cell.n) * 100),
      });
    }
  }

  // Per motion: derive prefer / avoid / confidence.
  const upserts: Array<{
    camera_movement: string;
    prefer: string[];
    avoid: string[];
    reason: string;
    confidence: "high_empirical" | "medium_empirical";
    evidence: unknown;
  }> = [];
  let skippedLowN = 0;

  for (const [motion, bySku] of agg.entries()) {
    const rows = [...bySku.entries()]
      .map(([sku, cell]) => ({ sku, n: cell.n, mean: cell.sum / cell.n, fails: cell.fails }))
      .filter((r) => r.n >= MIN_N_PER_SKU);
    if (rows.length === 0) {
      skippedLowN += 1;
      continue;
    }
    rows.sort((a, b) => b.mean - a.mean);
    const best = rows[0];
    const gap = best.mean - rows[rows.length - 1].mean;
    const highConf = best.n >= 10 && gap >= HIGH_GAP;
    const medConf = best.n >= 5 && gap >= MED_GAP;
    if (!highConf && !medConf) {
      skippedLowN += 1;
      continue;
    }
    const avoid = rows
      .filter((r) => r.sku !== best.sku && r.mean <= best.mean - HIGH_GAP && r.mean < AVOID_ABS_MEAN)
      .map((r) => r.sku);

    const perSkuEvidence: Record<string, { n: number; mean_rating: number; fail_rate_pct: number }> = {};
    for (const r of rows) {
      perSkuEvidence[r.sku] = {
        n: r.n,
        mean_rating: Number(r.mean.toFixed(2)),
        fail_rate_pct: Math.round((r.fails / r.n) * 100),
      };
    }

    const reasonParts = [
      `${best.sku} leads ${motion} (${best.mean.toFixed(2)}/5, N=${best.n}).`,
    ];
    if (avoid.length > 0) {
      const worstStr = avoid
        .map((sku) => {
          const cell = bySku.get(sku)!;
          return `${sku} ${(cell.sum / cell.n).toFixed(2)} (N=${cell.n})`;
        })
        .join(", ");
      reasonParts.push(`Avoid: ${worstStr}.`);
    }

    upserts.push({
      camera_movement: motion,
      prefer: [best.sku],
      avoid,
      reason: reasonParts.join(" "),
      confidence: highConf ? "high_empirical" : "medium_empirical",
      evidence: {
        window_days: WINDOW_DAYS,
        refreshed_at: new Date().toISOString(),
        per_sku: perSkuEvidence,
      },
    });
  }

  // UPSERT each motion. Never delete existing rules — they may be manually
  // curated for motions the cron has no data on yet.
  let motionsUpdated = 0;
  for (const row of upserts) {
    const { error: upErr } = await supabase.from("sku_motion_affinity").upsert({
      camera_movement: row.camera_movement,
      prefer: row.prefer,
      avoid: row.avoid,
      reason: row.reason,
      confidence: row.confidence,
      evidence: row.evidence,
      last_refreshed_at: new Date().toISOString(),
    });
    if (!upErr) motionsUpdated += 1;
  }

  // Template regression check — if "straight push" ever reappears in a NEW
  // push_in director output after today's template swap, log an alert.
  // Also check for lingering "beyond" / "through" in fresh prompts (the
  // sanitizer should strip them, so any hit is a genuine escape).
  const regressions: Array<{ pattern: string; count: number; example_iteration_id: string | null; example_prompt: string | null }> = [];
  // 4-hour window — long enough to catch fresh regressions from the most
  // recent runs, short enough to exclude pre-fix historical data that would
  // otherwise noise up the alert stream forever.
  const { data: freshPrompts } = await supabase
    .from("prompt_lab_iterations")
    .select("id, director_output_json, created_at")
    .gte("created_at", new Date(Date.now() - 4 * 3_600_000).toISOString())
    .not("director_output_json", "is", null);

  const checks: Array<{ pattern: string; re: RegExp; motion?: string }> = [
    { pattern: "straight push (push_in only)", re: /\bstraight push\b/i, motion: "push_in" },
    { pattern: "beyond", re: /\bbeyond\b/i },
    { pattern: "through (lab is single-image)", re: /\bthrough\b/i },
  ];

  for (const check of checks) {
    let count = 0;
    let example: { id: string; prompt: string } | null = null;
    for (const row of freshPrompts ?? []) {
      const doj = row.director_output_json as { prompt?: string; camera_movement?: string } | null;
      const prompt = doj?.prompt ?? "";
      const motion = doj?.camera_movement ?? "";
      if (check.motion && motion !== check.motion) continue;
      if (!check.re.test(prompt)) continue;
      count += 1;
      if (!example) example = { id: row.id as string, prompt };
    }
    if (count > 0) {
      regressions.push({
        pattern: check.pattern,
        count,
        example_iteration_id: example?.id ?? null,
        example_prompt: example?.prompt ? example.prompt.slice(0, 160) : null,
      });
    }
  }

  // Log the run.
  const { error: logErr } = await supabase.from("sku_motion_affinity_refresh_log").insert({
    window_days: WINDOW_DAYS,
    motions_updated: motionsUpdated,
    motions_skipped_low_n: skippedLowN,
    template_regressions: regressions,
    details: {
      total_rated_considered: rated?.length ?? 0,
      stats,
    },
  });
  if (logErr) console.warn("[refresh-sku-affinity] log insert failed:", logErr.message);

  return res.status(200).json({
    motions_updated: motionsUpdated,
    motions_skipped_low_n: skippedLowN,
    regressions,
    upserts: upserts.map((u) => ({
      motion: u.camera_movement,
      prefer: u.prefer,
      avoid: u.avoid,
      confidence: u.confidence,
    })),
  });
}
