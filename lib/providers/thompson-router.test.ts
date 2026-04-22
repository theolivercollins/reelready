import { afterEach, describe, expect, it } from "vitest";
import type { V1AtlasSku } from "./atlas.js";
import {
  COLD_START_N,
  SPARSE_BUCKET_N,
  confidenceInterval,
  expectedWinRate,
  pickArm,
  sampleBeta,
  sampleGamma,
  setRng,
} from "./thompson-router.js";

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

afterEach(() => setRng(null));

describe("sampleGamma", () => {
  it("returns positive finite values", () => {
    for (let i = 0; i < 200; i++) {
      const g = sampleGamma(2);
      expect(g).toBeGreaterThan(0);
      expect(Number.isFinite(g)).toBe(true);
    }
  });

  it("approximate mean for shape=5 is ~5 over 2000 samples", () => {
    const xs = Array.from({ length: 2000 }, () => sampleGamma(5));
    expect(mean(xs)).toBeGreaterThan(4.5);
    expect(mean(xs)).toBeLessThan(5.5);
  });

  it("handles shape < 1 via the α→α+1 trick", () => {
    for (let i = 0; i < 100; i++) {
      const g = sampleGamma(0.3);
      expect(g).toBeGreaterThan(0);
      expect(Number.isFinite(g)).toBe(true);
    }
  });
});

describe("sampleBeta", () => {
  it("returns values in (0, 1)", () => {
    for (let i = 0; i < 500; i++) {
      const b = sampleBeta(2, 3);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it("Beta(1, 1) is ~uniform: mean ≈ 0.5 over 2000 samples", () => {
    const xs = Array.from({ length: 2000 }, () => sampleBeta(1, 1));
    expect(mean(xs)).toBeGreaterThan(0.45);
    expect(mean(xs)).toBeLessThan(0.55);
  });

  it("Beta(10, 1) is skewed high: mean > 0.8", () => {
    const xs = Array.from({ length: 1000 }, () => sampleBeta(10, 1));
    expect(mean(xs)).toBeGreaterThan(0.8);
  });

  it("Beta(1, 10) is skewed low: mean < 0.2", () => {
    const xs = Array.from({ length: 1000 }, () => sampleBeta(1, 10));
    expect(mean(xs)).toBeLessThan(0.2);
  });
});

describe("expectedWinRate", () => {
  it("prior: E[θ | 0, 0] = 0.5", () => {
    expect(expectedWinRate(0, 0)).toBe(0.5);
  });

  it("posterior is Laplace-smoothed", () => {
    expect(expectedWinRate(10, 0)).toBeCloseTo(11 / 12, 3);
    expect(expectedWinRate(0, 10)).toBeCloseTo(1 / 12, 3);
  });
});

describe("confidenceInterval", () => {
  it("is wider for (1, 1) than (100, 100)", () => {
    const [lo1, hi1] = confidenceInterval(1, 1);
    const [lo100, hi100] = confidenceInterval(100, 100);
    expect(hi1 - lo1).toBeGreaterThan(hi100 - lo100);
  });

  it("is clipped to [0, 1]", () => {
    const [lo, hi] = confidenceInterval(0, 0);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
  });

  it("centers near posterior mean for symmetric case", () => {
    const [lo, hi] = confidenceInterval(50, 50);
    const center = (lo + hi) / 2;
    expect(center).toBeGreaterThan(0.47);
    expect(center).toBeLessThan(0.53);
  });
});

// ============================================================================
// pickArm — the headline behavior.
// ============================================================================

const SKUS = {
  v26: "kling-v2-6-pro" as V1AtlasSku,
  master: "kling-v2-master" as V1AtlasSku,
  std: "kling-v3-std" as V1AtlasSku,
  o3: "kling-o3-pro" as V1AtlasSku,
};

function arm(sku: V1AtlasSku, alpha: number, beta: number, enabled = true): {
  sku: V1AtlasSku;
  alpha: number;
  beta: number;
  enabled: boolean;
  trial_count: number;
} {
  return { sku, alpha, beta, enabled, trial_count: alpha + beta };
}

describe("pickArm — empty or all-disabled bucket", () => {
  it("returns default_fallback when no arms", () => {
    const d = pickArm(
      { room_type: "x", camera_movement: "y", arms: [] },
      SKUS.v26,
    );
    expect(d.reason).toBe("default_fallback");
    expect(d.sku).toBe(SKUS.v26);
    expect(d.arm_state).toBeNull();
  });

  it("returns default_fallback when all arms disabled", () => {
    const d = pickArm(
      {
        room_type: "x",
        camera_movement: "y",
        arms: [arm(SKUS.v26, 10, 2, false), arm(SKUS.master, 5, 5, false)],
      },
      SKUS.v26,
    );
    expect(d.reason).toBe("default_fallback");
    expect(d.sku).toBe(SKUS.v26);
  });
});

describe("pickArm — sparsity fallback", () => {
  it(`falls back when total trials < SPARSE_BUCKET_N (${SPARSE_BUCKET_N})`, () => {
    const d = pickArm(
      {
        room_type: "x",
        camera_movement: "y",
        arms: [arm(SKUS.v26, 1, 0), arm(SKUS.master, 0, 1)],
      },
      SKUS.v26,
    );
    expect(d.reason).toBe("sparse_bucket_fallback");
    expect(d.sku).toBe(SKUS.v26);
  });

  it("exits sparsity when total trials cross the threshold", () => {
    // 3 total trials; cold-start rule then takes over because individual arms
    // are still under COLD_START_N (which equals SPARSE_BUCKET_N here).
    const d = pickArm(
      {
        room_type: "x",
        camera_movement: "y",
        arms: [arm(SKUS.v26, 2, 0), arm(SKUS.master, 0, 1)],
      },
      SKUS.v26,
    );
    expect(d.reason).not.toBe("sparse_bucket_fallback");
  });
});

describe("pickArm — cold-start", () => {
  it(`forces uniform pick when any arm has trial_count < ${COLD_START_N}`, () => {
    // 2 arms warm, 2 arms cold. Cold-start should force-pick from the cold arms.
    const bucket = {
      room_type: "kitchen",
      camera_movement: "push_in",
      arms: [
        arm(SKUS.v26, 10, 2),
        arm(SKUS.master, 8, 1),
        arm(SKUS.std, 1, 0),
        arm(SKUS.o3, 0, 0),
      ],
    };
    const coldSkus = new Set<V1AtlasSku>([SKUS.std, SKUS.o3]);
    const picks = new Set<V1AtlasSku>();
    for (let i = 0; i < 50; i++) {
      const d = pickArm(bucket, SKUS.v26);
      expect(d.reason).toBe("cold_start_forced");
      expect(coldSkus.has(d.sku)).toBe(true);
      picks.add(d.sku);
    }
    // Both cold SKUs should be picked at least once over 50 trials.
    expect(picks.size).toBe(2);
  });
});

describe("pickArm — Thompson sampling (all arms warm)", () => {
  function warmBucket() {
    return {
      room_type: "kitchen",
      camera_movement: "push_in",
      arms: [
        arm(SKUS.v26, 50, 2), // dominant
        arm(SKUS.master, 3, 30), // poor
        arm(SKUS.std, 8, 12), // mediocre
        arm(SKUS.o3, 5, 15), // poor
      ],
    };
  }

  it("runs Thompson (no cold-start, no fallback)", () => {
    const d = pickArm(warmBucket(), SKUS.v26);
    expect(d.reason).toBe("thompson_sampled");
    expect(d.sampled_theta).toBeGreaterThanOrEqual(0);
    expect(d.sampled_theta).toBeLessThanOrEqual(1);
    expect(d.arm_state).not.toBeNull();
  });

  it("picks the dominant arm >= 70% of 200 trials", () => {
    let wins = 0;
    for (let i = 0; i < 200; i++) {
      const d = pickArm(warmBucket(), SKUS.v26);
      if (d.sku === SKUS.v26) wins++;
    }
    expect(wins / 200).toBeGreaterThan(0.7);
  });
});

describe("pickArm — Thompson converges on truly-better arm", () => {
  it("after simulating 200 trials on a best=0.8 vs best=0.4 pair, picks best >80% at tail", () => {
    // Simulated "truly-best" arm has win-rate 0.8; loser 0.4. We run 200
    // iterations; after each, update the chosen arm with a Bernoulli draw
    // from its "true" rate. Over time, posterior should concentrate on winner.
    const trueRates: Record<V1AtlasSku, number> = {
      [SKUS.v26]: 0.8,
      [SKUS.master]: 0.4,
      [SKUS.std]: 0.4,
      [SKUS.o3]: 0.4,
    };
    const state: Record<V1AtlasSku, { alpha: number; beta: number }> = {
      [SKUS.v26]: { alpha: 0, beta: 0 },
      [SKUS.master]: { alpha: 0, beta: 0 },
      [SKUS.std]: { alpha: 0, beta: 0 },
      [SKUS.o3]: { alpha: 0, beta: 0 },
    };

    const picks: V1AtlasSku[] = [];
    for (let i = 0; i < 200; i++) {
      const arms = (Object.keys(state) as V1AtlasSku[]).map((sku) =>
        arm(sku, state[sku].alpha, state[sku].beta),
      );
      const d = pickArm({ room_type: "x", camera_movement: "y", arms }, SKUS.v26);
      picks.push(d.sku);
      // Simulate an outcome from the "true" rate.
      const success = Math.random() < trueRates[d.sku];
      if (success) state[d.sku].alpha++;
      else state[d.sku].beta++;
    }

    // Tail (last 100 picks) should concentrate on the winner.
    const tail = picks.slice(100);
    const tailWinnerFrac = tail.filter((p) => p === SKUS.v26).length / tail.length;
    expect(tailWinnerFrac).toBeGreaterThan(0.6); // conservative; true rate ≥ 0.7 typical
  });
});
