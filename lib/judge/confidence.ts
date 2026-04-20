import type { JudgeRubricScore } from "./types.js";

// Equal-weighted mean of the four rubric axes, each in [1,5].
// Returned value is in [1,5] with 2 decimals.
export function computeComposite(r: JudgeRubricScore): number {
  const sum = r.prompt_adherence + r.motion_quality + r.spatial_coherence + r.aesthetic_intent;
  const mean = sum / 4;
  return round2(clamp(mean, 1, 5));
}

// Confidence combines:
//   (a) internal axis agreement — 1 - normalized std deviation
//   (b) neighbor density — saturates around 6 neighbors
// Blend: 0.6*(axis_agreement) + 0.4*(density).
export function computeConfidence(r: JudgeRubricScore, neighborsUsed: number): number {
  const scores = [r.prompt_adherence, r.motion_quality, r.spatial_coherence, r.aesthetic_intent];
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);
  // Max stddev for a 1..5 axis across 4 scores is sqrt(4) = 2 (when values are 1,1,5,5).
  const axisAgreement = clamp(1 - stddev / 2, 0, 1);

  // Saturate density at ~6 neighbors.
  const density = clamp(neighborsUsed / 6, 0, 1);

  const blended = 0.6 * axisAgreement + 0.4 * density;
  return round2(clamp(blended, 0, 1));
}

function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
