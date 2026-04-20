import type { RoomType, VideoProvider, CameraMovement } from "../db.js";
import type { IVideoProvider } from "./provider.interface.js";
import { AtlasProvider } from "./atlas.js";

// Phase 2.7 (2026-04-19): Atlas Cloud handles 100% of video generation.
// Legacy Kling / Runway / Luma provider classes stay on disk at
// `lib/providers/{kling,runway,luma}.ts` — unused but preserved. If a
// future experiment shows Atlas underperforms on a specific scene
// type, re-import the legacy provider and add a narrow early-return in
// `selectProvider` for that case. Do NOT reintroduce per-camera-movement
// or per-room-type routing; model selection (Kling v3.0 Pro vs Wan 2.7)
// now lives inside AtlasProvider via the ATLAS_VIDEO_MODEL env var.

export function selectProvider(
  _roomType: RoomType,
  _cameraMovement: CameraMovement | null,
  _preference: VideoProvider | null,
  _excludeProviders: VideoProvider[] = [],
): IVideoProvider {
  return new AtlasProvider();
}

// Used by the retry / resubmit endpoints + pipeline failover counter.
// Returns the list of video providers currently available for routing.
// With Phase 2.7 collapsed onto Atlas, the list is just ["atlas"] when
// the API key is configured, else empty. Callers that use
// `getEnabledProviders().length` for failover budget will correctly
// conclude there is no native-provider failover available — retries
// just try Atlas again (Atlas itself may route internally to Kling or
// Wan based on ATLAS_VIDEO_MODEL).
export function getEnabledProviders(): VideoProvider[] {
  return process.env.ATLASCLOUD_API_KEY ? ["atlas"] : [];
}
