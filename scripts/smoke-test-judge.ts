// Phase 1 smoke test for the Claude rubric judge.
//
// Usage (pick ONE):
//
//   # Score a specific iteration:
//   npx tsx scripts/smoke-test-judge.ts score <iteration_id>
//
//   # Pick the most recent rated iteration and score it:
//   npx tsx scripts/smoke-test-judge.ts score
//
//   # Run calibration on ONE cell (e.g. kitchen-push_in) with small sample:
//   npx tsx scripts/smoke-test-judge.ts calibrate kitchen-push_in 10
//
//   # Read calibration status (all cells):
//   npx tsx scripts/smoke-test-judge.ts status
//
// Needs ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (or SUPABASE_ANON_KEY) in .env.

import * as fs from "fs";
import * as path from "path";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

import { getSupabase } from "../lib/client.js";
import { scoreIteration } from "../lib/judge/index.js";
import { runCalibration } from "../lib/judge/calibration.js";

async function pickLatestRatedIteration(): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("prompt_lab_iterations")
    .select("id, rating, created_at")
    .not("rating", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No rated iterations found — rate at least one in the Prompt Lab first.");
  console.log(`Picked iteration ${data.id} (★${data.rating}, ${data.created_at})`);
  return data.id;
}

async function cmdScore(iterationId?: string) {
  const id = iterationId ?? (await pickLatestRatedIteration());
  console.log(`Scoring iteration ${id}...`);
  const t0 = Date.now();
  const result = await scoreIteration(id);
  const elapsed = Date.now() - t0;
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nDone in ${elapsed}ms. Persisted to lab_judge_scores.`);
}

async function cmdCalibrate(cellKey: string, perCellCap = 10) {
  console.log(`Calibrating cell=${cellKey}, perCellCap=${perCellCap}...`);
  const t0 = Date.now();
  const rows = await runCalibration({
    perCellSampleCap: perCellCap,
    onlyCellKeys: [cellKey],
    reusePriorScores: true,
  });
  const elapsed = Date.now() - t0;
  if (rows.length === 0) {
    console.log("No cells had rated iterations — nothing to calibrate.");
    return;
  }
  for (const r of rows) {
    console.log(`\nCell: ${r.cell_key}`);
    console.log(`  sample_size: ${r.sample_size}`);
    console.log(`  exact_match_rate: ${r.exact_match_rate}`);
    console.log(`  within_one_star_rate: ${r.within_one_star_rate}  <-- the 80% bar`);
    console.log(`  mean_abs_error: ${r.mean_abs_error}`);
    console.log(`  mode: ${r.within_one_star_rate >= 0.8 ? "auto" : "advisory"}`);
  }
  console.log(`\nDone in ${elapsed}ms. Snapshot(s) written to lab_judge_calibrations.`);
}

async function cmdStatus() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("v_judge_calibration_status")
    .select("*")
    .order("cell_key");
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) {
    console.log("No calibration snapshots yet — run 'calibrate <cell>' first.");
    return;
  }
  let weightedSum = 0;
  let weightTotal = 0;
  console.log(`${rows.length} cell(s) calibrated:\n`);
  for (const r of rows) {
    const n = Number(r.sample_size ?? 0);
    const w = Number(r.within_one_star_rate ?? 0);
    weightedSum += n * w;
    weightTotal += n;
    console.log(`  ${r.cell_key.padEnd(32)} ${String(r.sample_size).padStart(3)} samples  within1★=${w}  mode=${r.mode}`);
  }
  const overall = weightTotal > 0 ? (weightedSum / weightTotal).toFixed(3) : "0";
  const autoCount = rows.filter((r: Record<string, unknown>) => r.mode === "auto").length;
  console.log(`\nOverall (sample-weighted) within-one-star: ${overall}`);
  console.log(`Cells in auto mode: ${autoCount} / ${rows.length}`);
}

async function main() {
  const [cmd, arg1, arg2] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(`Usage:
  npx tsx scripts/smoke-test-judge.ts score [iteration_id]
  npx tsx scripts/smoke-test-judge.ts calibrate <cell_key> [per_cell_cap=10]
  npx tsx scripts/smoke-test-judge.ts status
`);
    process.exit(0);
  }
  if (cmd === "score") return cmdScore(arg1);
  if (cmd === "calibrate") {
    if (!arg1) throw new Error("calibrate needs a cell_key, e.g. 'kitchen-push_in'");
    return cmdCalibrate(arg1, arg2 ? Number(arg2) : 10);
  }
  if (cmd === "status") return cmdStatus();
  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  console.error(err instanceof Error ? err.stack : "");
  process.exit(1);
});
