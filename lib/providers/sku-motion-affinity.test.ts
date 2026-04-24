import { describe, it, expect } from "vitest";
import {
  getAffinityRule,
  surfaceAffinityForPick,
  SKU_MOTION_AFFINITY,
} from "./sku-motion-affinity.js";

describe("SKU-motion affinity table", () => {
  it("has a seeded rule for push_in based on the 2026-04-24 audit", () => {
    const rule = getAffinityRule("push_in");
    expect(rule).not.toBeNull();
    expect(rule!.prefer).toContain("kling-v2-native");
    expect(rule!.avoid).toContain("kling-v2-6-pro");
    expect(rule!.avoid).toContain("kling-v2-master");
    expect(rule!.confidence).toBe("high_empirical");
  });

  it("returns null for motions with no opinion yet", () => {
    expect(getAffinityRule("orbit")).toBeNull();
    expect(getAffinityRule("rack_focus")).toBeNull();
    expect(getAffinityRule(null)).toBeNull();
  });

  it("is not empty — missing seed data would mean no warnings anywhere", () => {
    expect(SKU_MOTION_AFFINITY.length).toBeGreaterThan(0);
  });
});

describe("surfaceAffinityForPick", () => {
  it("returns an 'avoid' hint with the preferred SKU as suggestion", () => {
    const hint = surfaceAffinityForPick({ cameraMovement: "push_in", sku: "kling-v2-6-pro" });
    expect(hint).not.toBeNull();
    expect(hint!.verdict).toBe("avoid");
    expect(hint!.suggested_sku).toBe("kling-v2-native");
    expect(hint!.message).toMatch(/not recommended/);
    expect(hint!.message).toMatch(/try kling-v2-native/i);
  });

  it("returns a 'preferred' hint when the user picks the known-best SKU", () => {
    const hint = surfaceAffinityForPick({ cameraMovement: "push_in", sku: "kling-v2-native" });
    expect(hint).not.toBeNull();
    expect(hint!.verdict).toBe("preferred");
    expect(hint!.suggested_sku).toBe("kling-v2-native");
    expect(hint!.message).toMatch(/empirically strongest/i);
  });

  it("returns 'neutral' for an untested-in-this-motion SKU", () => {
    const hint = surfaceAffinityForPick({ cameraMovement: "push_in", sku: "kling-v3-pro" });
    expect(hint).not.toBeNull();
    expect(hint!.verdict).toBe("neutral");
    expect(hint!.suggested_sku).toBe("kling-v2-native");
    expect(hint!.message).toMatch(/untested/);
  });

  it("returns null when we have no rule for the movement (don't show a chip)", () => {
    expect(surfaceAffinityForPick({ cameraMovement: "orbit", sku: "kling-v2-6-pro" })).toBeNull();
  });

  it("returns null when sku or motion is missing", () => {
    expect(surfaceAffinityForPick({ cameraMovement: "push_in", sku: null })).toBeNull();
    expect(surfaceAffinityForPick({ cameraMovement: null, sku: "kling-v2-6-pro" })).toBeNull();
  });
});
