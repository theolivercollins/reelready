import type { RoomType, VideoProvider, CameraMovement } from "../db.js";
import type { IVideoProvider } from "./provider.interface.js";
import { RunwayProvider } from "./runway.js";
import { KlingProvider } from "./kling.js";
import { LumaProvider } from "./luma.js";

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

const MOVEMENT_PROVIDER: Record<CameraMovement, VideoProvider> = {
  push_in: "runway",          // Runway's native strength
  pull_out: "runway",          // same
  dolly_left_to_right: "kling", // lateral — Kling handles this better
  dolly_right_to_left: "kling", // lateral — Kling handles this better
  slow_pan: "kling",            // rotation — Kling handles this better
  parallax: "kling",            // layered depth — Kling strength
  orbital_slow: "kling",        // Kling handles interior arcs; for exteriors we
                                // fall back by room type below
};

// Fallback routing when provider selected above is unavailable, or when
// orbital_slow is scheduled on a wide exterior/aerial shot (Runway handles
// those sweeping outdoor arcs well).
const EXTERIOR_ORBITAL_OVERRIDE: Partial<Record<RoomType, VideoProvider>> = {
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
  roomType: RoomType,
  cameraMovement: CameraMovement | null,
  preference: VideoProvider | null,
  excludeProviders: VideoProvider[] = [],
): IVideoProvider {
  const enabled = getEnabledProviders();
  const available = enabled.filter((p) => !excludeProviders.includes(p));

  if (available.length === 0) {
    throw new Error(
      "No video generation providers available. Configure at least one API key.",
    );
  }

  // 1. Explicit director preference wins if still available.
  if (preference && available.includes(preference)) {
    return getProviderInstance(preference);
  }

  // 2. Movement-first routing. If we have a camera_movement, use the
  // movement → provider map above.
  if (cameraMovement) {
    let provider = MOVEMENT_PROVIDER[cameraMovement];

    // Override: orbital_slow on wide exterior / aerial shots goes to
    // Runway, not Kling. Runway handles those sweeping outdoor arcs well.
    if (cameraMovement === "orbital_slow") {
      const override = EXTERIOR_ORBITAL_OVERRIDE[roomType];
      if (override) provider = override;
    }

    if (available.includes(provider)) {
      return getProviderInstance(provider);
    }
  }

  // 3. Absolute fallback — priority order over whatever is available.
  for (const fallback of FALLBACK_ORDER) {
    if (available.includes(fallback)) {
      return getProviderInstance(fallback);
    }
  }

  return getProviderInstance(available[0]);
}
