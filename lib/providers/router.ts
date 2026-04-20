import type { RoomType, VideoProvider, CameraMovement } from "../db.js";
import type { IVideoProvider } from "./provider.interface.js";
import { AtlasProvider } from "./atlas.js";
// Legacy imports kept for future re-routing. Currently unreferenced —
// Atlas handles every scene as of Phase 2.7 (2026-04-19). If a future
// experiment shows Atlas Kling underperforms on a specific scene type
// (e.g., orbital exteriors), uncomment below and add a narrow early-
// return in the router function for that case.
// import { RunwayProvider } from "./runway.js";
// import { KlingProvider } from "./kling.js";
// import { LumaProvider } from "./luma.js";

// Router strategy — movement first, room type as tiebreaker.
//
// Runway gen4_turbo has a known tendency to default every motion to a
// push-in regardless of the text prompt. So Runway only gets scenes
// whose motion is already push_in or pull_out (its native strength),
// plus wide exterior/aerial orbitals where Runway handles sweeping
// cinematography reasonably well.
//
// Kling v2-master handles lateral motion (dolly L/R, slow pan, parallax)
// and interior orbital arcs significantly better, so everything with
// a lateral or orbital motion flavor routes to Kling.
//
// Luma Ray2 is configured but not actively wired into the routing
// decisions — it can be added back here if / when we want a third tier.

// Movement → provider mapping for the 14-verb vocabulary.
// Runway's strength: push/pull/orbit/drone/top_down (straight forward,
// backward, and sweeping aerial arcs). Runway defaults every motion
// to push-in-style, so lateral/vertical/reveal moves must go to Kling.
// Kling's strength: tilt, crane, reveal, parallax, dolly, interior orbit.
const MOVEMENT_PROVIDER: Record<CameraMovement, VideoProvider> = {
  // Runway — forward/backward + drone + overhead
  push_in: "runway",
  pull_out: "runway",
  orbit: "kling",              // interior default; exterior override below
  drone_push_in: "runway",
  drone_pull_back: "runway",
  top_down: "runway",
  // Kling — lateral, vertical, reveal, depth
  dolly_left_to_right: "kling",
  dolly_right_to_left: "kling",
  parallax: "kling",
  tilt_up: "kling",
  tilt_down: "kling",
  crane_up: "kling",
  crane_down: "kling",
  reveal: "kling",
  low_angle_glide: "kling",
  // feature_closeup — shallow-DOF push-in style. Runway's push-in
  // bias actually works well here; it doesn't need Kling's vertical
  // or lateral specialties.
  feature_closeup: "runway",
  // Legacy mapping — old scene rows may still carry these values
  orbital_slow: "kling",
  slow_pan: "kling",
};

// Exterior/aerial orbit override: Runway handles sweeping outdoor arcs
// around the full house better than Kling.
const EXTERIOR_ORBIT_OVERRIDE: Partial<Record<RoomType, VideoProvider>> = {
  exterior_front: "runway",
  exterior_back: "runway",
  aerial: "runway",
};

// Priority order for absolute fallback (neither movement-preferred nor
// room-type-override provider is available).
const FALLBACK_ORDER: VideoProvider[] = ["kling", "runway", "luma"];

const providerCache = new Map<VideoProvider, IVideoProvider>();

function getProviderInstance(name: VideoProvider): IVideoProvider {
  let instance = providerCache.get(name);
  if (!instance) {
    switch (name) {
      case "runway":
        instance = new RunwayProvider();
        break;
      case "kling":
        instance = new KlingProvider();
        break;
      case "luma":
        instance = new LumaProvider();
        break;
    }
    providerCache.set(name, instance);
  }
  return instance;
}

export function getEnabledProviders(): VideoProvider[] {
  const enabled: VideoProvider[] = [];
  if (process.env.RUNWAY_API_KEY) enabled.push("runway");
  if (process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY) enabled.push("kling");
  if (process.env.LUMA_API_KEY) enabled.push("luma");
  return enabled;
}

export function selectProvider(
  _roomType: RoomType,
  _cameraMovement: CameraMovement | null,
  _preference: VideoProvider | null,
  _excludeProviders: VideoProvider[] = [],
): IVideoProvider {
  // Atlas handles 100% of video generation as of Phase 2.7 (2026-04-19).
  // Model selection (Kling v3.0 Pro vs Wan 2.7) is handled inside
  // AtlasProvider via ATLAS_VIDEO_MODEL environment variable.
  return new AtlasProvider();
}
