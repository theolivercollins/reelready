#!/usr/bin/env -S npx tsx
// One-off: backfill prompt_lab_recipes for any 4★+ iteration that lacks
// a recipe row. Replicates autoPromoteIfWinning() per-row so the recipe
// pool reflects all winners in the ledger.

import * as fs from "fs";
import * as path from "path";
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

import { getSupabase } from "../../lib/client.js";
import { autoPromoteIfWinning } from "../../lib/prompt-lab.js";

const PROMOTED_BY = "29a51ea1-0339-47e3-9666-dd8985c00b0d"; // Oliver, observed user_id

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const supabase = getSupabase();

  const { data: rows, error } = await supabase
    .from("prompt_lab_iterations")
    .select("id, rating, provider, analysis_json, director_output_json, embedding, created_at")
    .gte("rating", 4)
    .not("analysis_json", "is", null)
    .not("director_output_json", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const all = rows ?? [];
  const { data: existing } = await supabase
    .from("prompt_lab_recipes")
    .select("source_iteration_id");
  const existingIds = new Set(((existing ?? []) as { source_iteration_id: string | null }[]).map((r) => r.source_iteration_id).filter(Boolean));
  const candidates = all.filter((r) => !existingIds.has(r.id));
  console.log(`[backfill] winners total=${all.length}, already have recipe=${all.length - candidates.length}, to promote=${candidates.length}`);
  if (dryRun) {
    for (const c of candidates) console.log(`  - ${c.id} ${c.rating}★ ${c.analysis_json?.room_type ?? "?"} / ${c.director_output_json?.camera_movement ?? "?"} / ${c.provider ?? "?"}`);
    console.log("[backfill] DRY RUN — no inserts");
    return;
  }

  let promoted = 0, skipped = 0, failed = 0;
  for (const c of candidates) {
    try {
      const result = await autoPromoteIfWinning({
        iterationRow: {
          id: c.id,
          analysis_json: c.analysis_json,
          director_output_json: c.director_output_json,
          embedding: c.embedding,
          provider: c.provider,
        },
        rating: c.rating,
        promotedBy: PROMOTED_BY,
      });
      if (result) {
        promoted++;
        console.log(`  + promoted ${c.id} → ${result.archetype} (${result.tier})`);
      } else {
        skipped++;
        console.log(`  - skipped ${c.id} (auto-promote returned null)`);
      }
    } catch (e) {
      failed++;
      console.error(`  ! failed ${c.id}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`[backfill] done — promoted=${promoted} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
