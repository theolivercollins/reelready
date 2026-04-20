import { describe, expect, it } from "vitest";
import { classifyCellState } from "../state.js";

describe("classifyCellState", () => {
  it("returns 'untested' when sample_size = 0", () => {
    expect(classifyCellState({ sample_size: 0, avg_rating: null, five_star_count: 0, loser_count: 0 })).toBe("untested");
  });

  it("returns 'golden' when five_star_count >= 2 regardless of other stats", () => {
    expect(classifyCellState({ sample_size: 10, avg_rating: 3.5, five_star_count: 2, loser_count: 0 })).toBe("golden");
    expect(classifyCellState({ sample_size: 3, avg_rating: 3.0, five_star_count: 3, loser_count: 0 })).toBe("golden");
  });

  it("returns 'weak' when avg_rating <= 2.0", () => {
    expect(classifyCellState({ sample_size: 5, avg_rating: 1.8, five_star_count: 0, loser_count: 3 })).toBe("weak");
  });

  it("returns 'weak' when losers are at least half the samples", () => {
    expect(classifyCellState({ sample_size: 10, avg_rating: 3.0, five_star_count: 0, loser_count: 5 })).toBe("weak");
  });

  it("returns 'strong' when avg_rating >= 4.0 with only one 5-star", () => {
    expect(classifyCellState({ sample_size: 5, avg_rating: 4.2, five_star_count: 1, loser_count: 0 })).toBe("strong");
  });

  it("returns 'okay' for middling averages", () => {
    expect(classifyCellState({ sample_size: 5, avg_rating: 3.2, five_star_count: 0, loser_count: 0 })).toBe("okay");
  });

  it("treats null avg_rating as okay when sample exists but rating is NaN — defensive", () => {
    expect(classifyCellState({ sample_size: 1, avg_rating: null, five_star_count: 0, loser_count: 0 })).toBe("okay");
  });
});
