import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  V1_ATLAS_SKUS,
  V1_DEFAULT_SKU,
  resolveDecision,
  resolveDecisionAsync,
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

describe("router — resolveDecisionAsync", () => {
  const savedFlag = process.env.USE_THOMPSON_ROUTER;

  beforeEach(() => {
    delete process.env.USE_THOMPSON_ROUTER;
  });

  afterEach(() => {
    if (savedFlag !== undefined) {
      process.env.USE_THOMPSON_ROUTER = savedFlag;
    } else {
      delete process.env.USE_THOMPSON_ROUTER;
    }
  });

  it("returns static decision + staticSku when flag is unset (no thompson field)", async () => {
    // USE_THOMPSON_ROUTER is not set — should behave identically to resolveDecision.
    const result = await resolveDecisionAsync({
      roomType: "living_room",
      movement: "push_in",
      skuOverride: null,
    });
    expect(result.decision.provider).toBe("atlas");
    expect(result.decision.modelKey).toBe(V1_DEFAULT_SKU);
    expect(result.staticSku).toBe(V1_DEFAULT_SKU);
    expect(result.thompson).toBeUndefined();
  });

  it("returns static decision + staticSku when flag is 'false'", async () => {
    process.env.USE_THOMPSON_ROUTER = "false";
    const result = await resolveDecisionAsync({
      roomType: "kitchen",
      movement: "orbit",
      skuOverride: "kling-v2-master",
    });
    expect(result.decision.modelKey).toBe("kling-v2-master");
    expect(result.staticSku).toBe("kling-v2-master");
    expect(result.thompson).toBeUndefined();
  });

  it("staticSku is always populated regardless of skuOverride", async () => {
    const result = await resolveDecisionAsync({
      roomType: "master_bedroom",
      movement: null,
      skuOverride: null,
    });
    expect(typeof result.staticSku).toBe("string");
    expect((V1_ATLAS_SKUS as readonly string[]).includes(result.staticSku)).toBe(true);
  });
});
