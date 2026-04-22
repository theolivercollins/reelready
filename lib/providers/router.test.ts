import { describe, it, expect } from "vitest";
import {
  V1_ATLAS_SKUS,
  V1_DEFAULT_SKU,
  resolveDecision,
} from "./router.js";

describe("router — V1 Atlas SKU decision", () => {
  it("exposes V1_DEFAULT_SKU = kling-v2-6-pro", () => {
    expect(V1_DEFAULT_SKU).toBe("kling-v2-6-pro");
  });

  it("V1_ATLAS_SKUS does not include kling-v3-pro (policy: single-image buckets exclude v3-pro)", () => {
    expect(V1_ATLAS_SKUS as readonly string[]).not.toContain("kling-v3-pro");
  });

  it("V1_ATLAS_SKUS does not include kling-v2-1-pair (paired-only SKU)", () => {
    expect(V1_ATLAS_SKUS as readonly string[]).not.toContain("kling-v2-1-pair");
  });

  it("resolveDecision returns atlas + V1_DEFAULT_SKU when skuOverride is null/undefined", () => {
    const decision = resolveDecision({
      roomType: "living_room",
      movement: "pan_right",
      skuOverride: null,
    });
    expect(decision.provider).toBe("atlas");
    expect(decision.modelKey).toBe(V1_DEFAULT_SKU);
  });

  it("resolveDecision honors a valid skuOverride", () => {
    const decision = resolveDecision({
      roomType: "kitchen",
      movement: "push_in",
      skuOverride: "kling-v2-master",
    });
    expect(decision.provider).toBe("atlas");
    expect(decision.modelKey).toBe("kling-v2-master");
  });

  it("resolveDecision falls back to V1_DEFAULT_SKU when skuOverride is not in V1_ATLAS_SKUS", () => {
    // Defensive: callers must validate before passing, but the router must not crash on an invalid SKU.
    const decision = resolveDecision({
      roomType: "kitchen",
      movement: "push_in",
      skuOverride: "kling-v3-pro" as unknown as (typeof V1_ATLAS_SKUS)[number],
    });
    expect(decision.provider).toBe("atlas");
    expect(decision.modelKey).toBe(V1_DEFAULT_SKU);
  });
});
