import { getSupabase } from "../client.js";
import { scoreIteration } from "./index.js";
import {
  JUDGE_MODEL,
  JUDGE_VERSION,
  type CalibrationRow,
} from "./types.js";

export interface AgreementInput {
  human: number;     // 1..5
  composite: number; // 1..5 (can be fractional)
}

export interface AgreementResult {
  sample_size: number;
  exact_match_rate: number;
  within_one_star_rate: number;
  mean_abs_error: number;
}

// Pure math, easy to test. Used below by runCalibration after judging a
// holdout set — it groups pairs per cell and writes a snapshot per cell.
export function computeAgreement(pairs: AgreementInput[]): AgreementResult {
  if (pairs.length === 0) {
    return { sample_size: 0, exact_match_rate: 0, within_one_star_rate: 0, mean_abs_error: 0 };
  }
  let exact = 0;
  let within = 0;
  let absSum = 0;
  for (const p of pairs) {
    const rounded = Math.round(p.composite);
    if (rounded === p.human) exact += 1;
    if (Math.abs(p.composite - p.human) <= 1.0) within += 1;
    absSum += Math.abs(p.composite - p.human);
  }
  return {
    sample_size: pairs.length,
    exact_match_rate: round3(exact / pairs.length),
    within_one_star_rate: round3(within / pairs.length),
    mean_abs_error: round3(absSum / pairs.length),
  };
}

// Runs the judge across all human-rated iterations (Lab) matching an
// optional cell filter + sample cap, then writes one calibration row per
// cell. Idempotent in the sense that re-running just appends a fresh row;
// the v_judge_calibration_status view always reads the latest.
export async function runCalibration(opts: {
  perCellSampleCap?: number;    // default 30
  onlyCellKeys?: string[];      // e.g. ['kitchen-push_in'] — optional filter
  reusePriorScores?: boolean;   // default true — skip re-scoring if already scored
} = {}): Promise<CalibrationRow[]> {
  const perCellCap = opts.perCellSampleCap ?? 30;
  const reuse = opts.reusePriorScores ?? true;
  const supabase = getSupabase();

  // Pull all rated Lab iterations with room_type + camera_movement available.
  const { data: rows, error } = await supabase
    .from("prompt_lab_iterations")
    .select("id, rating, analysis_json, director_output_json")
    .not("rating", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`Load rated iterations failed: ${error.message}`);

  type Bucket = { cellKey: string; room: string; verb: string; items: { id: string; rating: number }[] };
  const buckets = new Map<string, Bucket>();
  for (const r of rows ?? []) {
    const analysis = r.analysis_json as { room_type?: string } | null;
    const director = r.director_output_json as { camera_movement?: string } | null;
    const room = analysis?.room_type;
    const verb = director?.camera_movement;
    if (!room || !verb || typeof r.rating !== "number") continue;
    const key = `${room}-${verb}`;
    if (opts.onlyCellKeys && !opts.onlyCellKeys.includes(key)) continue;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { cellKey: key, room, verb, items: [] };
      buckets.set(key, bucket);
    }
    if (bucket.items.length < perCellCap) {
      bucket.items.push({ id: r.id, rating: r.rating });
    }
  }

  const out: CalibrationRow[] = [];
  for (const bucket of buckets.values()) {
    const pairs: AgreementInput[] = [];
    for (const it of bucket.items) {
      let composite: number | null = null;
      if (reuse) {
        const { data: existing } = await supabase
          .from("lab_judge_scores")
          .select("composite_1to5, judge_version, model_id")
          .eq("iteration_id", it.id)
          .maybeSingle();
        if (existing && existing.judge_version === JUDGE_VERSION && existing.model_id === JUDGE_MODEL) {
          composite = Number(existing.composite_1to5);
        }
      }
      if (composite === null) {
        const result = await scoreIteration(it.id);
        composite = result.composite_1to5;
      }
      pairs.push({ human: it.rating, composite });
    }
    const agreement = computeAgreement(pairs);
    const row: CalibrationRow = {
      cell_key: bucket.cellKey,
      room_type: bucket.room,
      camera_movement: bucket.verb,
      sample_size: agreement.sample_size,
      exact_match_rate: agreement.exact_match_rate,
      within_one_star_rate: agreement.within_one_star_rate,
      mean_abs_error: agreement.mean_abs_error,
      judge_version: JUDGE_VERSION,
      model_id: JUDGE_MODEL,
    };
    const { error: insErr } = await supabase.from("lab_judge_calibrations").insert({
      ...row,
      window_end: new Date().toISOString(),
    });
    if (insErr) throw new Error(`Insert calibration row failed: ${insErr.message}`);
    out.push(row);
  }
  return out;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
