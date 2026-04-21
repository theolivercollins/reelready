#!/usr/bin/env -S npx tsx
/**
 * build-router-table.ts
 *
 * Aggregates every rating Oliver has given across the three rating
 * surfaces — legacy Prompt Lab, Phase 2.8 listings Lab, prod
 * `scene_ratings` — and emits a draft router table + coverage report.
 *
 * Usage:
 *   npx tsx scripts/build-router-table.ts               (dry-run, prints to stdout)
 *   npx tsx scripts/build-router-table.ts --write       (writes draft + audit files)
 *
 * Writes (with --write):
 *   lib/providers/router-table.draft.ts                 — DRAFT ONLY, not wired
 *   docs/audits/router-coverage-2026-04-21.md           — human-readable coverage
 *
 * This script is read-only against the database. It answers the Phase B
 * question: "can we derive a real (room × movement) → SKU router table
 * from existing signal, without a fresh rating session?"
 *
 * Winner rule (from Phase B spec):
 *   bucket = (room_type, camera_movement)
 *   winner candidate = a SKU with >= 3 iterations in the bucket AND
 *                      >= 80% of those iterations rated >= 4*.
 *   Tiebreak: higher avg rating, then cheaper per-clip cost.
 *   No qualifier => bucket has no winner (logged as NO_WINNER or EMPTY).
 *
 * SKU-level signal exists ONLY on Phase 2.8 listing iterations
 * (`prompt_lab_listing_scene_iterations.model_used`). Legacy Lab
 * (`prompt_lab_iterations`) and production (`scene_ratings`) only
 * carry the `provider` string, so they contribute at the provider
 * level — shown alongside as a "structural signal" column in the
 * coverage report but cannot pick a specific Atlas SKU.
 */

import * as fs from "fs";
import * as path from "path";

// Minimal .env loader — matches scripts/backfill-scene-embeddings.ts.
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

import { getSupabase } from "../lib/db.js";
import { ATLAS_MODELS } from "../lib/providers/atlas.js";

// ── Canonical SKU set ──
//
// Atlas SKUs come from ATLAS_MODELS. Native Kling is its own SKU.
// `wan-2.7` is legacy (removed 2026-04-20 evening) — excluded from
// router-eligible SKUs but retained in coverage counts for audit.
const NATIVE_KLING_SKU = "kling-v2-native";
const RUNWAY_SKU = "runway-gen4-turbo";
const REMOVED_SKUS = new Set(["wan-2.7"]);

interface SkuMeta {
  provider: "atlas" | "kling" | "runway";
  modelKey?: string;            // atlas-only: which SKU to pass as modelOverride
  priceCentsPerClip: number;    // for tiebreak
}

const SKU_META: Record<string, SkuMeta> = {};
for (const [key, descriptor] of Object.entries(ATLAS_MODELS)) {
  SKU_META[key] = {
    provider: "atlas",
    modelKey: key,
    priceCentsPerClip: descriptor.priceCentsPerClip,
  };
}
// Native Kling: pre-paid credits → $0 effective cash cost.
SKU_META[NATIVE_KLING_SKU] = { provider: "kling", priceCentsPerClip: 0 };
// Runway: no SKU-granular signal in the DB today, but listed for
// completeness so runway-only buckets can surface as "runway wins
// at provider level but no SKU identifiable".
SKU_META[RUNWAY_SKU] = { provider: "runway", priceCentsPerClip: 100 };

// ── Args ──
const WRITE = process.argv.includes("--write");
const DRY_RUN = !WRITE; // default is dry-run

const MIN_ITERATIONS_PER_WINNER = 3;
const MIN_WIN_RATE = 0.80;
const OUTPUT_ROUTER_FILE = "lib/providers/router-table.draft.ts";
const OUTPUT_AUDIT_FILE = "docs/audits/router-coverage-2026-04-21.md";

// ── Types ──

interface RatedObservation {
  room_type: string;
  camera_movement: string;
  sku: string | null;         // null when only provider-level is known
  provider: string | null;    // 'kling' | 'runway' | 'atlas' | null
  rating: number;
  source: "phase2.8" | "legacy_lab" | "prod_scene_ratings";
}

interface SkuBucketStat {
  room_type: string;
  camera_movement: string;
  sku: string;
  n_iter: number;
  n_4plus: number;
  avg_rating: number;
  win_rate: number;
}

interface ProviderBucketStat {
  room_type: string;
  camera_movement: string;
  provider: string;
  n_iter: number;
  n_4plus: number;
  avg_rating: number;
  win_rate: number;
}

interface RouterRow {
  room_type: string;
  camera_movement: string;
  sku: string;
  provider: "atlas" | "kling" | "runway";
  modelKey?: string;
  win_rate: number;
  iter_count: number;
  avg_rating: number;
}

// ── Fetch each surface ──

async function fetchPhase28(): Promise<RatedObservation[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("prompt_lab_listing_scene_iterations")
    .select("rating, model_used, scene_id, prompt_lab_listing_scenes(room_type, camera_movement)")
    .not("rating", "is", null)
    .not("model_used", "is", null);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    rating: number;
    model_used: string;
    scene_id: string;
    prompt_lab_listing_scenes: { room_type: string | null; camera_movement: string | null } | null;
  }>;
  return rows.flatMap((r) => {
    const scene = Array.isArray(r.prompt_lab_listing_scenes)
      ? (r.prompt_lab_listing_scenes as unknown as Array<{ room_type: string | null; camera_movement: string | null }>)[0]
      : r.prompt_lab_listing_scenes;
    const room = scene?.room_type;
    const movement = scene?.camera_movement;
    if (!room || !movement) return [];
    const meta = SKU_META[r.model_used];
    return [{
      room_type: room,
      camera_movement: movement,
      sku: r.model_used,
      provider: meta?.provider ?? null,
      rating: r.rating,
      source: "phase2.8" as const,
    }];
  });
}

async function fetchLegacyLab(): Promise<RatedObservation[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("prompt_lab_iterations")
    .select("rating, provider, analysis_json, director_output_json")
    .not("rating", "is", null);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    rating: number;
    provider: string | null;
    analysis_json: { room_type?: string | null } | null;
    director_output_json: { camera_movement?: string | null } | null;
  }>;
  return rows.flatMap((r) => {
    const room = r.analysis_json?.room_type;
    const movement = r.director_output_json?.camera_movement;
    if (!room || !movement) return [];
    return [{
      room_type: room,
      camera_movement: movement,
      sku: null,                  // legacy has no SKU column
      provider: r.provider ?? null,
      rating: r.rating,
      source: "legacy_lab" as const,
    }];
  });
}

async function fetchProdScenes(): Promise<RatedObservation[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("scene_ratings")
    .select("rating, rated_room_type, rated_camera_movement, rated_provider")
    .not("rating", "is", null);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    rating: number;
    rated_room_type: string | null;
    rated_camera_movement: string | null;
    rated_provider: string | null;
  }>;
  return rows.flatMap((r) => {
    if (!r.rated_room_type || !r.rated_camera_movement) return [];
    return [{
      room_type: r.rated_room_type,
      camera_movement: r.rated_camera_movement,
      sku: null,
      provider: r.rated_provider ?? null,
      rating: r.rating,
      source: "prod_scene_ratings" as const,
    }];
  });
}

// ── Aggregation ──

function bucketKey(room: string, movement: string, group: string): string {
  return `${room}|${movement}|${group}`;
}

function aggregateSku(obs: RatedObservation[]): Map<string, SkuBucketStat> {
  const agg = new Map<string, { room: string; movement: string; sku: string; ratings: number[] }>();
  for (const o of obs) {
    if (!o.sku) continue;
    const key = bucketKey(o.room_type, o.camera_movement, o.sku);
    const b = agg.get(key) ?? { room: o.room_type, movement: o.camera_movement, sku: o.sku, ratings: [] };
    b.ratings.push(o.rating);
    agg.set(key, b);
  }
  const out = new Map<string, SkuBucketStat>();
  for (const [key, b] of agg) {
    const n = b.ratings.length;
    const n4 = b.ratings.filter((r) => r >= 4).length;
    out.set(key, {
      room_type: b.room,
      camera_movement: b.movement,
      sku: b.sku,
      n_iter: n,
      n_4plus: n4,
      avg_rating: n ? b.ratings.reduce((a, r) => a + r, 0) / n : 0,
      win_rate: n ? n4 / n : 0,
    });
  }
  return out;
}

function aggregateProvider(obs: RatedObservation[]): Map<string, ProviderBucketStat> {
  const agg = new Map<string, { room: string; movement: string; provider: string; ratings: number[] }>();
  for (const o of obs) {
    const provider = o.provider ?? "unknown";
    const key = bucketKey(o.room_type, o.camera_movement, provider);
    const b = agg.get(key) ?? { room: o.room_type, movement: o.camera_movement, provider, ratings: [] };
    b.ratings.push(o.rating);
    agg.set(key, b);
  }
  const out = new Map<string, ProviderBucketStat>();
  for (const [key, b] of agg) {
    const n = b.ratings.length;
    const n4 = b.ratings.filter((r) => r >= 4).length;
    out.set(key, {
      room_type: b.room,
      camera_movement: b.movement,
      provider: b.provider,
      n_iter: n,
      n_4plus: n4,
      avg_rating: n ? b.ratings.reduce((a, r) => a + r, 0) / n : 0,
      win_rate: n ? n4 / n : 0,
    });
  }
  return out;
}

// ── Winner rule ──

function pickWinner(candidates: SkuBucketStat[]): SkuBucketStat | null {
  const qualified = candidates.filter(
    (c) =>
      c.n_iter >= MIN_ITERATIONS_PER_WINNER &&
      c.win_rate >= MIN_WIN_RATE &&
      !REMOVED_SKUS.has(c.sku) &&
      SKU_META[c.sku] !== undefined,
  );
  if (qualified.length === 0) return null;
  qualified.sort((a, b) => {
    if (b.avg_rating !== a.avg_rating) return b.avg_rating - a.avg_rating;
    const priceA = SKU_META[a.sku]?.priceCentsPerClip ?? Number.MAX_SAFE_INTEGER;
    const priceB = SKU_META[b.sku]?.priceCentsPerClip ?? Number.MAX_SAFE_INTEGER;
    return priceA - priceB;
  });
  return qualified[0];
}

interface BucketVerdict {
  room_type: string;
  camera_movement: string;
  status: "WINNER" | "NO_WINNER" | "EMPTY";
  winner?: RouterRow;
  total_iter: number;
  total_4plus: number;
  sku_candidates: SkuBucketStat[];      // for audit
  provider_stats: ProviderBucketStat[]; // structural signal from all 3 surfaces
}

function buildVerdicts(
  skuStats: Map<string, SkuBucketStat>,
  providerStats: Map<string, ProviderBucketStat>,
): BucketVerdict[] {
  // Union of all (room × movement) keys seen anywhere.
  const bucketKeys = new Set<string>();
  for (const s of skuStats.values()) bucketKeys.add(`${s.room_type}|${s.camera_movement}`);
  for (const p of providerStats.values()) bucketKeys.add(`${p.room_type}|${p.camera_movement}`);

  const verdicts: BucketVerdict[] = [];
  for (const key of bucketKeys) {
    const [room, movement] = key.split("|");
    const skuCandidates = [...skuStats.values()].filter(
      (s) => s.room_type === room && s.camera_movement === movement,
    );
    const providerBuckets = [...providerStats.values()].filter(
      (p) => p.room_type === room && p.camera_movement === movement,
    );
    const totalIter = providerBuckets.reduce((a, p) => a + p.n_iter, 0);
    const total4plus = providerBuckets.reduce((a, p) => a + p.n_4plus, 0);

    const winner = pickWinner(skuCandidates);
    if (winner) {
      const meta = SKU_META[winner.sku];
      const row: RouterRow = {
        room_type: room,
        camera_movement: movement,
        sku: winner.sku,
        provider: meta.provider,
        modelKey: meta.modelKey,
        win_rate: winner.win_rate,
        iter_count: winner.n_iter,
        avg_rating: winner.avg_rating,
      };
      verdicts.push({
        room_type: room,
        camera_movement: movement,
        status: "WINNER",
        winner: row,
        total_iter: totalIter,
        total_4plus: total4plus,
        sku_candidates: skuCandidates,
        provider_stats: providerBuckets,
      });
    } else {
      verdicts.push({
        room_type: room,
        camera_movement: movement,
        status: totalIter === 0 ? "EMPTY" : "NO_WINNER",
        total_iter: totalIter,
        total_4plus: total4plus,
        sku_candidates: skuCandidates,
        provider_stats: providerBuckets,
      });
    }
  }
  verdicts.sort((a, b) => {
    if (a.room_type !== b.room_type) return a.room_type.localeCompare(b.room_type);
    return a.camera_movement.localeCompare(b.camera_movement);
  });
  return verdicts;
}

// ── Rendering ──

function renderRouterTableDraft(verdicts: BucketVerdict[]): string {
  const winners = verdicts.filter((v) => v.winner);
  const lines: string[] = [];
  lines.push("// DRAFT — GENERATED BY scripts/build-router-table.ts");
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push("//");
  lines.push("// NOT WIRED INTO lib/providers/router.ts. Round 2 decides whether");
  lines.push("// to promote this draft based on the coverage report alongside.");
  lines.push("//");
  lines.push("// Winner rule: >=3 iterations in (room_type, camera_movement) bucket");
  lines.push(`// AND >=${Math.round(MIN_WIN_RATE * 100)}% rated >=4*. Tiebreak: higher avg rating, then cheaper`);
  lines.push("// per-clip cost. SKU-level signal currently lives only on");
  lines.push("// prompt_lab_listing_scene_iterations (Phase 2.8). Legacy Lab and");
  lines.push("// prod scene_ratings contribute provider-level context only.");
  lines.push("");
  lines.push('import type { VideoProvider } from "../db.js";');
  lines.push("");
  lines.push("export interface RouterTableRow {");
  lines.push("  room_type: string;");
  lines.push("  camera_movement: string;");
  lines.push("  provider: VideoProvider;");
  lines.push("  sku: string;");
  lines.push("  modelKey?: string; // for atlas routes");
  lines.push("  win_rate: number;  // 0-1, fraction of iterations rated >=4*");
  lines.push("  iter_count: number;");
  lines.push("  avg_rating: number;");
  lines.push("}");
  lines.push("");
  lines.push("export const ROUTER_TABLE_DRAFT: ReadonlyArray<RouterTableRow> = [");
  for (const v of winners) {
    const w = v.winner!;
    const modelKeyStr = w.modelKey ? `, modelKey: ${JSON.stringify(w.modelKey)}` : "";
    lines.push(
      `  { room_type: ${JSON.stringify(w.room_type)}, camera_movement: ${JSON.stringify(w.camera_movement)}, ` +
        `provider: ${JSON.stringify(w.provider)}, sku: ${JSON.stringify(w.sku)}${modelKeyStr}, ` +
        `win_rate: ${w.win_rate.toFixed(2)}, iter_count: ${w.iter_count}, avg_rating: ${w.avg_rating.toFixed(2)} },`,
    );
  }
  if (winners.length === 0) {
    lines.push("  // (no buckets met the winner threshold with current signal)");
  }
  lines.push("];");
  lines.push("");
  lines.push("export function lookupRouterRow(");
  lines.push("  roomType: string,");
  lines.push("  cameraMovement: string,");
  lines.push("): RouterTableRow | undefined {");
  lines.push("  return ROUTER_TABLE_DRAFT.find(");
  lines.push("    (r) => r.room_type === roomType && r.camera_movement === cameraMovement,");
  lines.push("  );");
  lines.push("}");
  return lines.join("\n") + "\n";
}

function renderCoverageReport(
  verdicts: BucketVerdict[],
  totals: { phase28: number; legacy: number; prod: number },
): string {
  const winners = verdicts.filter((v) => v.status === "WINNER");
  const noWinner = verdicts.filter((v) => v.status === "NO_WINNER");
  const empty = verdicts.filter((v) => v.status === "EMPTY");

  // SKU-granular audit stats
  let skuIdentifiable = 0;
  let providerOnly = 0;
  for (const v of verdicts) {
    skuIdentifiable += v.sku_candidates.reduce((a, s) => a + s.n_iter, 0);
    providerOnly += v.total_iter - v.sku_candidates.reduce((a, s) => a + s.n_iter, 0);
  }

  const lines: string[] = [];
  lines.push("# Router Coverage Audit — 2026-04-21");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}  `);
  lines.push("Source: `scripts/build-router-table.ts --write`");
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  const interpretation = buildInterpretation(winners.length, noWinner.length, empty.length, skuIdentifiable, providerOnly);
  lines.push(interpretation);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total (room x movement) buckets observed: **${verdicts.length}**`);
  lines.push(`- **WINNER** (>=3 iter, >=${Math.round(MIN_WIN_RATE * 100)}% 4* on a single SKU): **${winners.length}**`);
  lines.push(`- **NO_WINNER** (has data, no qualifier): **${noWinner.length}**`);
  lines.push(`- **EMPTY**: **${empty.length}**`);
  lines.push("");
  lines.push("### Rating signal by surface");
  lines.push("");
  lines.push("| Surface | Rated rows | SKU-granular? |");
  lines.push("|---|---:|---|");
  lines.push(`| Phase 2.8 listings Lab (\`prompt_lab_listing_scene_iterations\`) | ${totals.phase28} | yes (\`model_used\`) |`);
  lines.push(`| Legacy Lab (\`prompt_lab_iterations\`) | ${totals.legacy} | no (provider only) |`);
  lines.push(`| Production (\`scene_ratings\`) | ${totals.prod} | no (provider only) |`);
  lines.push(`| **Totals** | **${totals.phase28 + totals.legacy + totals.prod}** | ${skuIdentifiable} of ${skuIdentifiable + providerOnly} (${skuIdentifiable + providerOnly === 0 ? "—" : Math.round((skuIdentifiable / (skuIdentifiable + providerOnly)) * 100) + "%"}) |`);
  lines.push("");
  lines.push("## Winners (router table draft rows)");
  lines.push("");
  if (winners.length === 0) {
    lines.push("_No buckets passed the winner threshold with current signal._");
  } else {
    lines.push("| room | movement | winning SKU | provider | win_rate | iter | avg |");
    lines.push("|---|---|---|---|---:|---:|---:|");
    for (const v of winners) {
      const w = v.winner!;
      lines.push(
        `| ${v.room_type} | ${v.camera_movement} | \`${w.sku}\` | ${w.provider} | ${(w.win_rate * 100).toFixed(0)}% | ${w.iter_count} | ${w.avg_rating.toFixed(2)} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Full bucket coverage (grouped by room)");
  lines.push("");
  const byRoom = new Map<string, BucketVerdict[]>();
  for (const v of verdicts) {
    const list = byRoom.get(v.room_type) ?? [];
    list.push(v);
    byRoom.set(v.room_type, list);
  }
  const rooms = [...byRoom.keys()].sort();
  for (const room of rooms) {
    lines.push(`### ${room}`);
    lines.push("");
    lines.push("| movement | status | top SKU (iter, 4*/iter) | all SKUs in bucket | provider-level signal |");
    lines.push("|---|---|---|---|---|");
    for (const v of byRoom.get(room)!) {
      const topSku = [...v.sku_candidates].sort((a, b) => b.n_iter - a.n_iter)[0];
      const topSkuStr = topSku
        ? `\`${topSku.sku}\` (${topSku.n_iter} iter, ${topSku.n_4plus}/${topSku.n_iter})`
        : "—";
      const skuListStr = v.sku_candidates.length === 0
        ? "—"
        : v.sku_candidates
            .map((s) => `${s.sku}:${s.n_iter}/${s.n_4plus}`)
            .join(", ");
      const providerStr = v.provider_stats.length === 0
        ? "—"
        : v.provider_stats
            .map((p) => `${p.provider}:${p.n_iter}/${p.n_4plus}`)
            .join(", ");
      lines.push(`| ${v.camera_movement} | ${v.status} | ${topSkuStr} | ${skuListStr} | ${providerStr} |`);
    }
    lines.push("");
  }
  lines.push("## Notes");
  lines.push("");
  lines.push(`- \`wan-2.7\` was removed from the Atlas registry 2026-04-20 evening and is excluded from router eligibility even if it appears in the historical data.`);
  lines.push("- SKU-level winner selection only draws from Phase 2.8 iterations because legacy Lab + prod scene_ratings only store `provider`, not `model_used`.");
  lines.push("- Provider-level columns are kept in the report so Round 2 can see structural signal (e.g. \"legacy Lab says push_in × kitchen heavily favors kling\") even when no SKU qualifies.");
  lines.push("- This script is read-only and writes no new rating data. It is the automated alternative to the manual Phase B rating grid.");
  return lines.join("\n") + "\n";
}

function buildInterpretation(
  winners: number,
  noWinner: number,
  empty: number,
  skuIdentifiable: number,
  providerOnly: number,
): string {
  const totalBuckets = winners + noWinner + empty;
  const totalRated = skuIdentifiable + providerOnly;
  const skuPct = totalRated ? Math.round((skuIdentifiable / totalRated) * 100) : 0;

  if (winners === 0) {
    return [
      `**Verdict: existing signal is NOT sufficient to build a real router table.** Of ${totalBuckets} (room x movement) buckets observed, **zero** have a SKU with at least ${MIN_ITERATIONS_PER_WINNER} iterations AND a >=${Math.round(MIN_WIN_RATE * 100)}% 4*+ win rate. The underlying cause is a data-shape problem, not a rating-volume problem:`,
      "",
      `- **${skuPct}%** of rated iterations are SKU-identifiable (Phase 2.8 listings Lab). The remaining **${100 - skuPct}%** (legacy Lab + prod) only carry \`provider\` ('kling' / 'runway'), which can't pick between six Kling SKUs.`,
      "- Phase 2.8 ratings are spread thinly across up to 7 SKUs per bucket, so no single SKU accumulates the 3-iteration floor before averaging out across the grid.",
      "",
      `A fresh rating session is unavoidable for buckets that actually matter (the quota-high rooms: kitchen, living_room, master_bedroom, exterior_front, aerial). Round 2's wiring step can still use this draft as the shape of the table once the signal exists. Meanwhile, \`lib/providers/router.ts\` should continue using its current intuition-based routing (documented as "pending Phase B validation").`,
    ].join("\n");
  }
  return [
    `**Verdict: existing signal covers ${winners} of ${totalBuckets} buckets.** ${noWinner} have data but no qualifying SKU yet; ${empty} are empty. Of all rated rows, ${skuPct}% are SKU-granular (Phase 2.8 Lab); the rest contribute at provider level only.`,
    "",
    `Round 2 can wire the draft for the ${winners} covered buckets and fall through to the current router for the rest, OR Oliver can run a targeted rating session for the ${noWinner} "has data, no winner" buckets (likely the cheaper path than another full grid).`,
  ].join("\n");
}

// ── Main ──

async function main() {
  console.log(`build-router-table.ts — ${DRY_RUN ? "DRY RUN" : "WRITE"} mode`);
  console.log("");
  console.log("Fetching rated iterations from all 3 surfaces...");

  const [phase28, legacy, prod] = await Promise.all([
    fetchPhase28(),
    fetchLegacyLab(),
    fetchProdScenes(),
  ]);
  const all = [...phase28, ...legacy, ...prod];
  console.log(`  Phase 2.8 Lab: ${phase28.length} rated rows (SKU-granular)`);
  console.log(`  Legacy Lab:    ${legacy.length} rated rows (provider-only)`);
  console.log(`  Production:    ${prod.length} rated rows (provider-only)`);
  console.log(`  TOTAL:         ${all.length}`);
  console.log("");

  const skuStats = aggregateSku(phase28); // SKU aggregation is Phase 2.8 only
  const providerStats = aggregateProvider(all); // provider signal pooled across all

  const verdicts = buildVerdicts(skuStats, providerStats);
  const winners = verdicts.filter((v) => v.status === "WINNER");
  const noWinner = verdicts.filter((v) => v.status === "NO_WINNER");
  const empty = verdicts.filter((v) => v.status === "EMPTY");

  console.log(`Buckets: ${verdicts.length} total | ${winners.length} WINNER | ${noWinner.length} NO_WINNER | ${empty.length} EMPTY`);
  console.log("");

  const draftTs = renderRouterTableDraft(verdicts);
  const coverageMd = renderCoverageReport(verdicts, {
    phase28: phase28.length,
    legacy: legacy.length,
    prod: prod.length,
  });

  if (DRY_RUN) {
    console.log("─".repeat(72));
    console.log(`DRY RUN — would write ${OUTPUT_ROUTER_FILE}:`);
    console.log("─".repeat(72));
    console.log(draftTs);
    console.log("─".repeat(72));
    console.log(`DRY RUN — would write ${OUTPUT_AUDIT_FILE}:`);
    console.log("─".repeat(72));
    console.log(coverageMd);
    console.log("─".repeat(72));
    console.log("Re-run with --write to persist.");
    return;
  }

  const routerPath = path.join(process.cwd(), OUTPUT_ROUTER_FILE);
  const auditPath = path.join(process.cwd(), OUTPUT_AUDIT_FILE);
  fs.mkdirSync(path.dirname(routerPath), { recursive: true });
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(routerPath, draftTs, "utf8");
  fs.writeFileSync(auditPath, coverageMd, "utf8");
  console.log(`Wrote ${OUTPUT_ROUTER_FILE}`);
  console.log(`Wrote ${OUTPUT_AUDIT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
