// SKU × motion affinity table.
//
// Rationale (2026-04-24): the Thompson router is still flagged off in prod,
// so the static router picks the user's SKU without any learned preference.
// We've now got enough rated iterations to see structural patterns — some
// SKUs just aren't suited for some camera moves. This file encodes that
// knowledge so the Prompt Lab UI can warn and the future router can use it
// as a prior.
//
// Confidence tiers:
//   "high_empirical"   — N ≥ 10 and gap vs best SKU for this motion ≥ 1.0
//                        stars (measurable, real). Current data 2026-04-24.
//   "medium_empirical" — N ≥ 5 and a notable gap; treat as a hint.
//   "qualitative"      — Oliver's domain knowledge, no data yet.
//
// How to add / change a rule:
//   1) Re-run the audit query in docs/ops/sku-affinity-refresh.sql.
//   2) Update the row below with fresh N, mean, last_verified.
//   3) Bump confidence if the effect has stabilized.
//
// How to USE this file:
//   - UI: surfaceAffinityForPick({ cameraMovement, sku }) returns a hint or
//     null. The Prompt Lab SKU selector calls this to decide whether to
//     show a warning + suggested alternative.
//   - Router priors: when USE_THOMPSON_ROUTER goes live, `preferredSkus`
//     seeds the prior for fresh buckets; `avoidedSkus` pushes their
//     posterior starting mean down. Implementation lives with the router.

import type { CameraMovement } from "../db.js";

export type AffinityConfidence = "high_empirical" | "medium_empirical" | "qualitative";

export interface AffinityRule {
  /** Camera movement this rule scopes to. */
  camera_movement: CameraMovement;
  /** SKUs the evidence says do BEST for this motion (descending preference). */
  prefer: string[];
  /** SKUs the evidence says to avoid for this motion. */
  avoid: string[];
  /** One-sentence human-readable WHY — shown in the UI warning. */
  reason: string;
  confidence: AffinityConfidence;
  /** Free-form evidence trail (N, mean rating, fail-rate, etc.). */
  evidence: string;
  /** ISO date the evidence was last refreshed. */
  last_verified: string;
}

/**
 * Current rule set. KEEP THIS SMALL — only add a row when there's real signal
 * behind it. Bad data here is worse than no data because it steers every
 * future suggestion.
 */
export const SKU_MOTION_AFFINITY: AffinityRule[] = [
  {
    camera_movement: "push_in",
    prefer: ["kling-v2-native"],
    avoid: ["kling-v2-6-pro", "kling-v2-master"],
    reason:
      "v2.6-pro and v2-master produce a 2D zoom (pixels enlarge) instead of a 3D camera push on straight push-in prompts. v2-native renders a real forward dolly.",
    confidence: "high_empirical",
    evidence:
      "2026-04-24 audit (30d window): v2-native 4.21/5 mean (N=14, 7% fail); v2-master 2.70 (N=10, 40% fail); v2-6-pro 2.60 (N=10, 50% fail). Judge motion_faithfulness does NOT catch the zoom-vs-push difference (judge agrees with humans only ~1/5 times), so this pattern is derived from Oliver's ratings.",
    last_verified: "2026-04-24",
  },
];

/**
 * Lookup table keyed by camera_movement for O(1) access from UI code.
 * Rebuilt at module load from SKU_MOTION_AFFINITY.
 */
const BY_MOTION: Map<CameraMovement, AffinityRule> = new Map(
  SKU_MOTION_AFFINITY.map((r) => [r.camera_movement, r]),
);

/**
 * Return the rule scoped to this camera_movement, or null if we have no
 * opinion yet.
 */
export function getAffinityRule(cameraMovement: string | null | undefined): AffinityRule | null {
  if (!cameraMovement) return null;
  return BY_MOTION.get(cameraMovement as CameraMovement) ?? null;
}

export type AffinityVerdict = "preferred" | "avoid" | "neutral";

export interface AffinityPickHint {
  verdict: AffinityVerdict;
  /** The best SKU we know of for this motion (or null if no preference). */
  suggested_sku: string | null;
  /** When avoid/preferred: a short explanation to show the operator. */
  message: string;
  confidence: AffinityConfidence;
  evidence: string;
}

/**
 * Given a (motion, sku) the user is about to commit to, return a hint
 * describing whether it matches the learned affinity. Returns null when we
 * have no opinion — callers should hide the warning chip entirely in that
 * case rather than show a neutral "all good" badge.
 *
 * `liveRules` lets the caller pass in fresh DB-backed rules (fetched from
 * /api/admin/sku-affinity) so the hint reflects the nightly refresh. When
 * omitted or empty, falls back to the static seed in this file.
 */
export function surfaceAffinityForPick(input: {
  cameraMovement: string | null | undefined;
  sku: string | null | undefined;
  liveRules?: AffinityRule[] | null;
}): AffinityPickHint | null {
  const rule = (input.liveRules && input.liveRules.length > 0
    ? input.liveRules.find((r) => r.camera_movement === input.cameraMovement) ?? null
    : null) ?? getAffinityRule(input.cameraMovement);
  if (!rule) return null;
  const sku = input.sku ?? "";
  if (!sku) return null;

  const preferred = rule.prefer[0] ?? null;

  if (rule.avoid.includes(sku)) {
    return {
      verdict: "avoid",
      suggested_sku: preferred,
      message: `${sku} is not recommended for ${rule.camera_movement}.${preferred ? ` Try ${preferred} instead.` : ""}`,
      confidence: rule.confidence,
      evidence: rule.evidence,
    };
  }
  if (rule.prefer.includes(sku)) {
    return {
      verdict: "preferred",
      suggested_sku: sku,
      message: `${sku} is the empirically strongest SKU for ${rule.camera_movement}.`,
      confidence: rule.confidence,
      evidence: rule.evidence,
    };
  }
  return {
    verdict: "neutral",
    suggested_sku: preferred,
    message: `${sku} is untested for ${rule.camera_movement} — the empirically strongest SKU is ${preferred ?? "(none known)"}.`,
    confidence: rule.confidence,
    evidence: rule.evidence,
  };
}
