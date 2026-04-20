import { describe, expect, it } from "vitest";
import { computeComposite, computeConfidence } from "../confidence.js";
import type { JudgeRubricScore } from "../types.js";

const rubric = (a: number, b: number, c: number, d: number): JudgeRubricScore => ({
  prompt_adherence: a,
  motion_quality: b,
  spatial_coherence: c,
  aesthetic_intent: d,
  rationale: "",
  fail_tag_suggestions: [],
});

describe("computeComposite", () => {
  it("averages all four axes when all 5s → 5.00", () => {
    expect(computeComposite(rubric(5, 5, 5, 5))).toBeCloseTo(5.0, 2);
  });

  it("averages mixed scores with default equal weights", () => {
    // (4+3+5+2)/4 = 3.50
    expect(computeComposite(rubric(4, 3, 5, 2))).toBeCloseTo(3.5, 2);
  });

  it("stays within [1, 5]", () => {
    expect(computeComposite(rubric(1, 1, 1, 1))).toBe(1);
    expect(computeComposite(rubric(5, 5, 5, 5))).toBe(5);
  });
});

describe("computeConfidence", () => {
  it("returns high confidence when axes agree and neighbors are dense", () => {
    // All axes at 5, 6 neighbors total
    const c = computeConfidence(rubric(5, 5, 5, 5), 6);
    expect(c).toBeGreaterThanOrEqual(0.9);
  });

  it("returns low confidence when axes disagree strongly", () => {
    // axes 1,5,1,5 — std dev is maximal
    const c = computeConfidence(rubric(1, 5, 1, 5), 6);
    expect(c).toBeLessThan(0.5);
  });

  it("returns low confidence when there are zero neighbors", () => {
    const c = computeConfidence(rubric(5, 5, 5, 5), 0);
    expect(c).toBeLessThanOrEqual(0.6);
  });

  it("always returns value in [0, 1]", () => {
    for (const n of [0, 1, 3, 6, 50]) {
      const c = computeConfidence(rubric(3, 3, 3, 3), n);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});
