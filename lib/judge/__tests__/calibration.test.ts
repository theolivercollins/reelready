import { describe, expect, it } from "vitest";
import { computeAgreement } from "../calibration.js";

describe("computeAgreement", () => {
  it("exact-match rate counts composite rounding to the same integer as human", () => {
    const pairs = [
      { human: 5, composite: 4.9 }, // rounds to 5 → match
      { human: 3, composite: 3.2 }, // rounds to 3 → match
      { human: 4, composite: 5.0 }, // rounds to 5 → miss
      { human: 2, composite: 1.5 }, // rounds to 2 → match (banker's? we use Math.round)
    ];
    const a = computeAgreement(pairs);
    // matches: first, second, fourth = 3/4
    expect(a.exact_match_rate).toBeCloseTo(0.75, 2);
  });

  it("within_one_star_rate counts |composite - human| <= 1", () => {
    const pairs = [
      { human: 5, composite: 4.2 }, // diff 0.8 → within 1
      { human: 5, composite: 3.5 }, // diff 1.5 → NOT within 1
      { human: 2, composite: 1.1 }, // diff 0.9 → within 1
      { human: 3, composite: 3.0 }, // diff 0.0 → within 1
    ];
    const a = computeAgreement(pairs);
    expect(a.within_one_star_rate).toBeCloseTo(0.75, 2);
  });

  it("mean_abs_error averages |composite - human|", () => {
    const pairs = [
      { human: 5, composite: 4.0 }, // |1.0|
      { human: 3, composite: 3.0 }, // |0.0|
      { human: 2, composite: 4.0 }, // |2.0|
    ];
    const a = computeAgreement(pairs);
    expect(a.mean_abs_error).toBeCloseTo(1.0, 3);
  });

  it("returns zeros for empty input", () => {
    const a = computeAgreement([]);
    expect(a.sample_size).toBe(0);
    expect(a.exact_match_rate).toBe(0);
    expect(a.within_one_star_rate).toBe(0);
    expect(a.mean_abs_error).toBe(0);
  });
});
