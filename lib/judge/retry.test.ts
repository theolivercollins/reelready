import { describe, it, expect, vi } from "vitest";
import { classifyJudgeError, withJudgeRetry } from "./retry.js";

describe("classifyJudgeError", () => {
  it("classifies the 400 Cannot-fetch-content error as transient", () => {
    const err = new Error(
      '{"error":{"code":400,"message":"Cannot fetch content from the provided URL.","status":"INVALID_ARGUMENT"}}',
    );
    expect(classifyJudgeError(err)).toBe("transient");
  });

  it("classifies 429 RESOURCE_EXHAUSTED as transient", () => {
    const err = new Error(
      '{"error":{"code":429,"message":"Resource has been exhausted","status":"RESOURCE_EXHAUSTED"}}',
    );
    expect(classifyJudgeError(err)).toBe("transient");
  });

  it("classifies 5xx as transient", () => {
    expect(classifyJudgeError(new Error("500 INTERNAL error"))).toBe("transient");
    expect(classifyJudgeError(new Error("503 UNAVAILABLE"))).toBe("transient");
  });

  it("classifies network/fetch failures as transient", () => {
    expect(classifyJudgeError(new Error("fetch failed"))).toBe("transient");
    expect(classifyJudgeError(new Error("ECONNRESET on upstream"))).toBe("transient");
  });

  it("classifies validation / schema errors as permanent", () => {
    expect(classifyJudgeError(new Error("Judge output validation failed: missing motion_faithfulness"))).toBe("permanent");
    expect(classifyJudgeError(new Error("Judge returned non-JSON: ..."))).toBe("permanent");
  });

  it("classifies missing API key as permanent", () => {
    expect(classifyJudgeError(new Error("GEMINI_API_KEY or GOOGLE_API_KEY required for judge"))).toBe("permanent");
  });
});

describe("withJudgeRetry", () => {
  it("returns on first success without sleeping", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withJudgeRetry(fn, [100, 200]);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Cannot fetch content from the provided URL"))
      .mockResolvedValue({ overall: 4 });
    const result = await withJudgeRetry(fn, [1, 1]);
    expect(result).toEqual({ overall: 4 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws the permanent error without retrying", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error("Judge output validation failed: bogus"));
    await expect(withJudgeRetry(fn, [1, 1, 1])).rejects.toThrow("validation");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries on persistent transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Cannot fetch content"));
    await expect(withJudgeRetry(fn, [1, 1, 1])).rejects.toThrow("Cannot fetch content");
    expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries
  });
});
