import type { RoomType, VideoProvider, CameraMovement } from "../db.js";
import type { IVideoProvider } from "./provider.interface.js";
import { AtlasProvider } from "./atlas.js";
import { KlingProvider } from "./kling.js";
import { RunwayProvider } from "./runway.js";

// ─── PROVIDER DECISION SHAPE ─────────────────────────────────────────────────
//
// Phase C.1: ProviderDecision is the structured routing result used by
// pipeline.ts and the resubmit / retry endpoints. It carries enough
// information to instantiate the provider AND pass the correct model
// override (e.g. "kling-v2-1-pair" for paired scenes).
//
// provider:  which backend to call
// modelKey:  for "atlas" routes — which Atlas SKU (e.g. "kling-v2-1-pair").
//            When absent, AtlasProvider uses the ATLAS_VIDEO_MODEL env var.
// fallback:  next decision to try if the primary errors with shouldFailover=true.
//
// Callers that only need an IVideoProvider instance can call
// buildProviderFromDecision(decision) to get one.
//
// BACKWARD COMPAT: selectProvider() still returns IVideoProvider for callers
// (prompt-lab.ts, poll-scenes.ts) that were written before this shape existed.
// New pipeline code uses selectDecision() + selectProviderForScene() which
// return ProviderDecision.

export interface ProviderDecision {
  provider: VideoProvider;            // "kling" | "atlas" | "runway" | "luma"
  modelKey?: string;                   // atlas SKU key; undefined → use env default
  fallback?: ProviderDecision;
}

// ─── PRODUCTION ROUTING TABLE ────────────────────────────────────────────────
//
// Priority rules:
//
//   1. PAIRED SCENES: scenes with end_photo_id ALWAYS route to atlas +
//      kling-v2-1-pair via selectProviderForScene(). This rule is outside the
//      table — it short-circuits before movement is consulted.
//
//   2. NATIVE KLING FIRST for interior shots (pre-paid credits → $0 cash).
//      On 402 / insufficient-credit, failover to atlas kling-v2-master
//      (same v2-master semantics, billed via Atlas cash balance).
//
//   3. RUNWAY for exterior / drone / closeup shots (its strength; pending
//      Phase B validation).
//
// ⚠️  PENDING PHASE B VALIDATION — every row below reflects Oliver's
// pre-Phase-B intuition. Phase B produces lib/providers/router-table.ts
// with evidence-based (room × movement) rows; when that lands this table
// is replaced by a lookup into router-table.ts.

// Interior movements — native Kling v2 first, Atlas v2-master on credit fail.
// Pending Phase B validation.
const INTERIOR_MOVEMENTS: ReadonlySet<CameraMovement> = new Set([
  "push_in",
  "orbit",
  "parallax",
  "dolly_left_to_right",
  "dolly_right_to_left",
  "reveal",
  "low_angle_glide",
  "rack_focus",
]);

// Exterior / drone / closeup — Runway preferred (its strength per Oliver's
// intuition); Atlas generic as failover. Pending Phase B validation.
const RUNWAY_MOVEMENTS: ReadonlySet<CameraMovement> = new Set([
  "drone_push_in",
  "top_down",
  "feature_closeup",
]);

// Reused fallback decisions:

// Atlas kling-v2-master: equivalent semantics to native Kling v2-master,
// billed as cash via Atlas. Used as the credit-exhaustion failover for
// interior shots.
const ATLAS_V2_MASTER_FALLBACK: ProviderDecision = {
  provider: "atlas",
  modelKey: "kling-v2-master",
  fallback: undefined, // terminal
};

// Generic Atlas fallback for Runway failures (exteriors/drone). Uses whatever
// ATLAS_VIDEO_MODEL env var is set (currently kling-v2-6-pro).
const ATLAS_GENERIC_FALLBACK: ProviderDecision = {
  provider: "atlas",
  fallback: undefined, // terminal
};

// ─── INTERNAL DECISION FUNCTION ─────────────────────────────────────────────

/**
 * Core routing logic. Returns a ProviderDecision for an unpaired scene.
 * Does NOT handle the paired-scene rule — use selectProviderForScene() for that.
 */
function resolveDecision(
  _roomType: RoomType,
  movement: CameraMovement | null,
  preference: VideoProvider | null,
  excluded: VideoProvider[],
): ProviderDecision {
  // Scene-level preference honours admin overrides and Lab provider picks
  // without routing through the table.
  if (preference && !excluded.includes(preference)) {
    return {
      provider: preference,
      fallback: excluded.length === 0 ? ATLAS_V2_MASTER_FALLBACK : undefined,
    };
  }

  const runwayExcluded = excluded.includes("runway");
  const klingExcluded = excluded.includes("kling");

  if (movement && RUNWAY_MOVEMENTS.has(movement)) {
    // Exterior / drone / closeup: Runway first (pending Phase B validation).
    if (!runwayExcluded) {
      return { provider: "runway", fallback: ATLAS_GENERIC_FALLBACK };
    }
    return ATLAS_GENERIC_FALLBACK;
  }

  if (movement && INTERIOR_MOVEMENTS.has(movement)) {
    // Interior: native Kling first — pre-paid credits, $0 cash cost.
    // On 402 / credit-exhaustion, failover to Atlas kling-v2-master.
    // Pending Phase B validation.
    if (!klingExcluded) {
      return { provider: "kling", fallback: ATLAS_V2_MASTER_FALLBACK };
    }
    return ATLAS_V2_MASTER_FALLBACK;
  }

  // Unknown / null / legacy movement — default to Atlas env SKU.
  return { provider: "atlas", fallback: undefined };
}

// ─── PROVIDER INSTANTIATION ─────────────────────────────────────────────────
//
// Converts a ProviderDecision into an IVideoProvider instance.
// modelKey is NOT injected into the provider constructor — instead it is
// forwarded via GenerateClipParams.modelOverride at call time. AtlasProvider
// already handles modelOverride via its resolveModel() method.

export function buildProviderFromDecision(decision: ProviderDecision): IVideoProvider {
  switch (decision.provider) {
    case "atlas":
      return new AtlasProvider();
    case "kling":
      return new KlingProvider();
    case "runway":
      return new RunwayProvider();
    default:
      // luma / higgsfield / unknown — fall back to Atlas (always available).
      return new AtlasProvider();
  }
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

/**
 * selectDecision — returns a ProviderDecision for an unpaired scene.
 * Used by pipeline.ts, resubmit.ts, and retry.ts after Phase C.1.
 * For paired scenes use selectProviderForScene().
 */
export function selectDecision(
  roomType: RoomType,
  movement: CameraMovement | null,
  preference: VideoProvider | null,
  excluded: VideoProvider[] = [],
): ProviderDecision {
  return resolveDecision(roomType, movement, preference, excluded);
}

/**
 * selectProviderForScene — routing entry point for runGenerationSubmit.
 *
 * Handles the paired-scene rule FIRST:
 * - Paired scenes (end_photo_id set) ALWAYS route to atlas + kling-v2-1-pair,
 *   the purpose-built start+end-frame SKU. This mirrors DQ.3 in the Lab.
 * - Unpaired scenes fall through to the movement-based routing table.
 *
 * @param scene.endPhotoId  end_photo_id from the scene row
 * @param scene.movement    CameraMovement for the scene
 * @param scene.roomType    RoomType for the scene
 * @param scene.preference  VideoProvider preference from the scene row
 * @param excluded          Providers already tried in this submission attempt
 */
export function selectProviderForScene(
  scene: {
    endPhotoId: string | null | undefined;
    movement: CameraMovement | null;
    roomType: RoomType;
    preference: VideoProvider | null;
  },
  excluded: VideoProvider[] = [],
): ProviderDecision {
  // RULE DQ.3: Paired scenes ALWAYS use atlas + kling-v2-1-pair.
  // If atlas itself is excluded, fall through to the movement table
  // as best-effort (better to try something than nothing).
  if (scene.endPhotoId && !excluded.includes("atlas")) {
    return {
      provider: "atlas",
      modelKey: "kling-v2-1-pair",
      fallback: undefined, // terminal — no fallback preserves paired semantics
    };
  }

  return resolveDecision(scene.roomType, scene.movement, scene.preference, excluded);
}

/**
 * selectProvider — BACKWARD-COMPATIBLE wrapper that returns an IVideoProvider
 * instance directly. Kept for callers that were written before Phase C.1
 * introduced ProviderDecision (prompt-lab.ts, poll-scenes.ts).
 *
 * New code should use selectDecision() or selectProviderForScene() + buildProviderFromDecision()
 * to access the modelKey and fallback chain.
 */
export function selectProvider(
  roomType: RoomType,
  movement: CameraMovement | null,
  preference: VideoProvider | null,
  excluded: VideoProvider[] = [],
): IVideoProvider {
  const decision = resolveDecision(roomType, movement, preference, excluded);
  return buildProviderFromDecision(decision);
}

// ─── ENABLED PROVIDERS ───────────────────────────────────────────────────────
//
// Returns providers with credentials configured in the environment.
// The pipeline uses this to size the maxFailovers budget.

export function getEnabledProviders(): VideoProvider[] {
  const enabled: VideoProvider[] = [];
  if (process.env.ATLASCLOUD_API_KEY) enabled.push("atlas");
  if (process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY) enabled.push("kling");
  if (process.env.RUNWAY_API_KEY) enabled.push("runway");
  return enabled;
}
