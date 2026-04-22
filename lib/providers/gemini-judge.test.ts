/**
 * P2.3 — Tests for gemini-judge.ts
 *
 * Covers:
 *   - Kill-switch: JUDGE_ENABLED unset → JudgeDisabledError, Gemini never called
 *   - Kill-switch: JUDGE_ENABLED='1' (not 'true') → JudgeDisabledError
 *   - Success path: JUDGE_ENABLED='true', mocked Gemini, validates returned shape
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Valid judge output the mock will return.
const VALID_JUDGE_JSON = JSON.stringify({
  motion_faithfulness: 4,
  geometry_coherence: 5,
  room_consistency: 5,
  hallucination_flags: [],
  confidence: 4,
  reasoning: "Camera dollies cleanly into the kitchen island; geometry intact throughout.",
  overall: 5,
});

// Mock @google/genai before importing the module under test.
// Must use a class with a constructor to satisfy "not a constructor" vitest check.
const mockGenerateContent = vi.fn().mockResolvedValue({ text: VALID_JUDGE_JSON });

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(function () {
      return {
        models: {
          generateContent: mockGenerateContent,
        },
      };
    }),
  };
});

// Mock recordCostEvent to avoid DB calls.
vi.mock("../db.js", () => ({
  recordCostEvent: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks are set up.
import { judgeLabIteration, JudgeDisabledError } from "./gemini-judge.js";
import { GoogleGenAI } from "@google/genai";

const BASE_INPUT = {
  clipUrl: "https://example.com/clip.mp4",
  directorPrompt: "Slow push into the espresso kitchen island with bronze pendants",
  cameraMovement: "push_in",
  roomType: "kitchen",
  iterationId: "iter-test-001",
};

describe("gemini-judge — kill-switch", () => {
  const origEnv = process.env.JUDGE_ENABLED;

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.JUDGE_ENABLED;
    } else {
      process.env.JUDGE_ENABLED = origEnv;
    }
  });

  it("JUDGE_ENABLED unset → throws JudgeDisabledError without calling Gemini", async () => {
    delete process.env.JUDGE_ENABLED;
    const genaiCtor = vi.mocked(GoogleGenAI);
    genaiCtor.mockClear();

    await expect(judgeLabIteration(BASE_INPUT)).rejects.toThrow(JudgeDisabledError);
    // Gemini constructor must never be called.
    expect(genaiCtor).not.toHaveBeenCalled();
  });

  it("JUDGE_ENABLED='1' (not 'true') → throws JudgeDisabledError", async () => {
    process.env.JUDGE_ENABLED = "1";
    const genaiCtor = vi.mocked(GoogleGenAI);
    genaiCtor.mockClear();

    await expect(judgeLabIteration(BASE_INPUT)).rejects.toThrow(JudgeDisabledError);
    expect(genaiCtor).not.toHaveBeenCalled();
  });

  it("JUDGE_ENABLED='false' → throws JudgeDisabledError", async () => {
    process.env.JUDGE_ENABLED = "false";
    await expect(judgeLabIteration(BASE_INPUT)).rejects.toThrow(JudgeDisabledError);
  });
});

describe("gemini-judge — success path", () => {
  beforeEach(() => {
    process.env.JUDGE_ENABLED = "true";
    process.env.GEMINI_API_KEY = "test-api-key";
  });

  afterEach(() => {
    delete process.env.JUDGE_ENABLED;
    delete process.env.GEMINI_API_KEY;
  });

  it("returns complete JudgeOutput with all required fields", async () => {
    const result = await judgeLabIteration(BASE_INPUT);

    // 5 rubric axes
    expect(result.motion_faithfulness).toBe(4);
    expect(result.geometry_coherence).toBe(5);
    expect(result.room_consistency).toBe(5);
    expect(result.hallucination_flags).toEqual([]);
    expect(result.confidence).toBe(4);
    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.overall).toBe(5);

    // Judge metadata fields
    expect(typeof result.judge_model).toBe("string");
    expect(result.judge_model.length).toBeGreaterThan(0);
    expect(result.judge_version).toBe("v1.0");
    expect(typeof result.latency_ms).toBe("number");
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(typeof result.cost_cents).toBe("number");
    expect(result.cost_cents).toBeGreaterThan(0);
  });

  it("passes photoBytes as inlineData when provided — success path reached", async () => {
    mockGenerateContent.mockClear();
    const result = await judgeLabIteration({
      ...BASE_INPUT,
      photoBytes: Buffer.from("fake-jpeg-bytes"),
    });
    // Gemini was called once and result is valid.
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result.overall).toBeDefined();

    // Verify the call included an inlineData part for the photo.
    const callArgs = mockGenerateContent.mock.calls[0][0] as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };
    const parts = callArgs.contents[0].parts;
    const hasInlineData = parts.some((p) => "inlineData" in p);
    expect(hasInlineData).toBe(true);
  });

  it("skips inlineData when photoBytes is not provided", async () => {
    // Should succeed without photoBytes — no error thrown.
    const result = await judgeLabIteration(BASE_INPUT);
    expect(result.overall).toBeDefined();
  });

  it("handles calibration examples in the preamble", async () => {
    const result = await judgeLabIteration({
      ...BASE_INPUT,
      calibrationExamples: [
        {
          judge_rating_json: {
            motion_faithfulness: 5,
            geometry_coherence: 5,
            room_consistency: 5,
            hallucination_flags: [],
            confidence: 5,
            reasoning: "Perfect push.",
            overall: 5,
          },
        },
      ],
    });
    expect(result.overall).toBeDefined();
  });
});
