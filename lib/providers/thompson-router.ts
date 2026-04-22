/**
 * Thompson-sampling bandit for SKU routing (P5).
 *
 * Pure TypeScript: accepts `BucketArms` as input, returns a `ThompsonDecision`.
 * No DB, no network, no side effects. Wiring into `submitLabRender` is P5 S1
 * rollout work; this module is the math kernel.
 *
 * Design reference: `docs/specs/p5-thompson-router-design.md` (branch
 * `session/p5-thompson-design`), sections 2 (math), 3 (cold-start), 4
 * (sparsity fallback), 2.3 (dashboard stats).
 *
 * Prior: Beta(1, 1). Posterior after α successes (4★+) and β failures (≤3★):
 * Beta(α+1, β+1).
 *
 * Sampling: Beta(α, β) = X / (X + Y) where X ~ Gamma(α, 1), Y ~ Gamma(β, 1).
 * Gamma is drawn via Marsaglia-Tsang (2000) for shape ≥ 1; small shapes are
 * bumped via the standard α → α+1 then multiply by U^(1/α) trick.
 */

import type { V1AtlasSku } from "./atlas.js";

// ============================================================================
// Constants — tunable; these values come from Oliver's 2026-04-22 decisions.
// ============================================================================

/** Forced-exploration threshold per (arm). Under this many trials → uniform pick. */
export const COLD_START_N = 3;

/** Minimum bucket trials before Thompson runs. Below: static fallback to defaultSku. */
export const SPARSE_BUCKET_N = 3;

// ============================================================================
// Types
// ============================================================================

export interface BucketArm {
  sku: V1AtlasSku;
  alpha: number;
  beta: number;
  enabled: boolean;
  trial_count: number; // = alpha + beta (stored for query-time convenience)
}

export interface BucketArms {
  room_type: string;
  camera_movement: string;
  arms: BucketArm[];
}

export type DecisionReason =
  | "thompson_sampled"
  | "cold_start_forced"
  | "sparse_bucket_fallback"
  | "default_fallback";

export interface ThompsonDecision {
  sku: V1AtlasSku;
  reason: DecisionReason;
  /** Posterior sample that won, if reason=thompson_sampled. */
  sampled_theta?: number;
  /** Winning arm's state at decision time. null for fallback paths. */
  arm_state: BucketArm | null;
}

// ============================================================================
// RNG primitives — uses Math.random(). For reproducibility in P5 S2 A/B audits
// we may inject a seeded RNG here; for now, a module-level hook suffices.
// ============================================================================

let rng: () => number = Math.random;

/** Inject a deterministic RNG for tests. Pass `null` to restore Math.random. */
export function setRng(fn: (() => number) | null): void {
  rng = fn ?? Math.random;
}

/** Standard normal via Box-Muller. */
function sampleNormal(): number {
  let u1 = rng();
  let u2 = rng();
  // Avoid log(0).
  while (u1 === 0) u1 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Sample from Gamma(shape, 1) via Marsaglia-Tsang (2000).
 * For shape < 1, uses the α → α+1, multiply-by-U^(1/α) trick.
 */
export function sampleGamma(shape: number): number {
  if (shape <= 0) throw new Error(`Gamma shape must be positive, got ${shape}`);
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(rng(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let z = sampleNormal();
    let v = 1 + c * z;
    if (v <= 0) continue;
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * z * z * z * z) return d * v;
    if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Sample from Beta(alpha, beta). Always returns a value in (0, 1).
 * Uses Gamma composition; stable for all α, β > 0.
 */
export function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

// ============================================================================
// Dashboard statistics — closed-form; cheap.
// ============================================================================

/**
 * Posterior mean: (α+1) / (α+β+2). Laplace-smoothed; well-defined at n=0
 * (returns 0.5, the prior mean).
 */
export function expectedWinRate(alpha: number, beta: number): number {
  return (alpha + 1) / (alpha + beta + 2);
}

/**
 * 95% Jeffreys credible interval on θ. Uses Beta(α+0.5, β+0.5) quantiles.
 * Implemented via a numeric quantile (bisection on the regularized incomplete
 * beta — approximated here by a Cornish-Fisher-style Normal approximation on
 * the posterior). For small n the approximation is coarser than true Jeffreys;
 * flag left as a TODO for P5 S1 if dashboard precision becomes an issue.
 */
export function confidenceInterval(alpha: number, beta: number): [number, number] {
  // Posterior with Jeffreys prior:
  const a = alpha + 0.5;
  const b = beta + 0.5;
  const mean = a / (a + b);
  const varTheta = (a * b) / ((a + b) * (a + b) * (a + b + 1));
  const sd = Math.sqrt(varTheta);
  // Normal approximation with clipping to [0,1]. For a 95% interval:
  const z = 1.959963984540054;
  const low = Math.max(0, mean - z * sd);
  const high = Math.min(1, mean + z * sd);
  return [low, high];
}

// ============================================================================
// Cold-start + sparsity rules.
// ============================================================================

function enabledArms(bucket: BucketArms): BucketArm[] {
  return bucket.arms.filter((a) => a.enabled);
}

function totalTrials(arms: BucketArm[]): number {
  let t = 0;
  for (const a of arms) t += a.trial_count;
  return t;
}

function underTrialedArms(arms: BucketArm[]): BucketArm[] {
  return arms.filter((a) => a.trial_count < COLD_START_N);
}

// ============================================================================
// pickArm — the single public entry point. Composes cold-start → sparsity
// fallback → Thompson.
// ============================================================================

export function pickArm(
  bucket: BucketArms,
  defaultSku: V1AtlasSku,
): ThompsonDecision {
  const enabled = enabledArms(bucket);

  if (enabled.length === 0) {
    return {
      sku: defaultSku,
      reason: "default_fallback",
      arm_state: null,
    };
  }

  if (totalTrials(enabled) < SPARSE_BUCKET_N) {
    return {
      sku: defaultSku,
      reason: "sparse_bucket_fallback",
      arm_state: null,
    };
  }

  const cold = underTrialedArms(enabled);
  if (cold.length > 0) {
    const idx = Math.floor(rng() * cold.length);
    const pick = cold[idx];
    return {
      sku: pick.sku,
      reason: "cold_start_forced",
      arm_state: pick,
    };
  }

  // Thompson: sample each arm's posterior, argmax.
  let bestArm = enabled[0];
  let bestTheta = -1;
  for (const a of enabled) {
    const theta = sampleBeta(a.alpha + 1, a.beta + 1);
    if (theta > bestTheta) {
      bestTheta = theta;
      bestArm = a;
    }
  }

  return {
    sku: bestArm.sku,
    reason: "thompson_sampled",
    sampled_theta: bestTheta,
    arm_state: bestArm,
  };
}
