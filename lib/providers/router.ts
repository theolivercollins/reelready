import type { RoomType, VideoProvider } from "../db.js";
import type { IVideoProvider } from "./provider.interface.js";
import { RunwayProvider } from "./runway.js";
import { KlingProvider } from "./kling.js";
import { LumaProvider } from "./luma.js";
import { HiggsfieldProvider } from "./higgsfield.js";
import { getAppSettingSync } from "../app-settings.js";

// Default routing: which provider handles which room types best
const ROOM_TYPE_ROUTING: Record<RoomType, VideoProvider> = {
  exterior_front: "runway",
  exterior_back: "runway",
  aerial: "runway",
  kitchen: "kling",
  living_room: "kling",
  master_bedroom: "kling",
  bedroom: "kling",
  bathroom: "kling",
  dining: "kling",
  pool: "luma",
  hallway: "kling",
  foyer: "kling",
  garage: "kling",
  other: "runway",
};

// Priority order for fallback
const FALLBACK_ORDER: VideoProvider[] = ["runway", "kling", "luma", "higgsfield"];

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
      case "higgsfield":
        instance = new HiggsfieldProvider();
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
  if (process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_API_SECRET) enabled.push("higgsfield");
  return enabled;
}

export function selectProvider(
  roomType: RoomType,
  preference: VideoProvider | null,
  excludeProviders: VideoProvider[] = []
): IVideoProvider {
  const enabled = getEnabledProviders();
  const available = enabled.filter((p) => !excludeProviders.includes(p));

  if (available.length === 0) {
    throw new Error(
      "No video generation providers available. Configure at least one API key."
    );
  }

  // 1. Use explicit scene-level preference if available (director set it)
  if (preference && available.includes(preference)) {
    return getProviderInstance(preference);
  }

  // 2. Honor the dashboard's primary video provider setting.
  //    When set to "auto", fall through to per-room routing.
  //    When set to a concrete provider, use it for every scene UNLESS
  //    it has been excluded by the retry loop — in which case we
  //    continue to the per-room routing and fallback chain.
  //    Reads from the short-TTL app-settings cache; primePipelineSettings()
  //    should be called at the top of runPipeline so the cache is warm.
  const primary = getAppSettingSync("primary_video_provider");
  if (primary !== "auto" && available.includes(primary)) {
    return getProviderInstance(primary);
  }

  // 3. Use room-type routing if that provider is available
  const routed = ROOM_TYPE_ROUTING[roomType];
  if (available.includes(routed)) {
    return getProviderInstance(routed);
  }

  // 4. Fall back to priority order
  for (const fallback of FALLBACK_ORDER) {
    if (available.includes(fallback)) {
      return getProviderInstance(fallback);
    }
  }

  return getProviderInstance(available[0]);
}
