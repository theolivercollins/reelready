import type { IVideoProvider } from "./provider.interface.js";
import { AtlasProvider } from "./atlas.js";
import { KlingProvider } from "./kling.js";

/** Returns the provider to use for a given model key.
 *  `kling-v2-native` → KlingProvider (pre-paid credits)
 *  Everything else → AtlasProvider
 */
export function pickProvider(modelKey: string): IVideoProvider {
  if (modelKey === "kling-v2-native") {
    return new KlingProvider();
  }
  return new AtlasProvider();
}

/** Returns true if the model is routed through native Kling (not Atlas). */
export function isNativeKling(modelKey: string): boolean {
  return modelKey === "kling-v2-native";
}
