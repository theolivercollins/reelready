import { describe, expect, it } from "vitest";
import { parseRubricResponse, buildRubricSystemPrompt, buildRubricUserMessage } from "../rubric.js";

describe("parseRubricResponse", () => {
  it("extracts structured JSON from a fenced response", () => {
    const raw = [
      "Here is my assessment:",
      "```json",
      "{",
      '  "prompt_adherence": 4,',
      '  "motion_quality": 5,',
      '  "spatial_coherence": 3,',
      '  "aesthetic_intent": 4,',
      '  "rationale": "Camera move is smooth but kitchen island clips through a wall briefly.",',
      '  "fail_tag_suggestions": ["fail:ghost-walls"]',
      "}",
      "```",
    ].join("\n");
    const parsed = parseRubricResponse(raw);
    expect(parsed.prompt_adherence).toBe(4);
    expect(parsed.motion_quality).toBe(5);
    expect(parsed.spatial_coherence).toBe(3);
    expect(parsed.aesthetic_intent).toBe(4);
    expect(parsed.fail_tag_suggestions).toEqual(["fail:ghost-walls"]);
  });

  it("extracts JSON from an unfenced response", () => {
    const raw = '{"prompt_adherence":5,"motion_quality":5,"spatial_coherence":5,"aesthetic_intent":5,"rationale":"Pristine.","fail_tag_suggestions":[]}';
    const parsed = parseRubricResponse(raw);
    expect(parsed.prompt_adherence).toBe(5);
    expect(parsed.fail_tag_suggestions).toEqual([]);
  });

  it("clamps out-of-range axis values to 1..5", () => {
    const raw = '{"prompt_adherence":7,"motion_quality":0,"spatial_coherence":3,"aesthetic_intent":-2,"rationale":"x","fail_tag_suggestions":[]}';
    const parsed = parseRubricResponse(raw);
    expect(parsed.prompt_adherence).toBe(5);
    expect(parsed.motion_quality).toBe(1);
    expect(parsed.aesthetic_intent).toBe(1);
  });

  it("throws when JSON is unparseable", () => {
    expect(() => parseRubricResponse("no JSON here")).toThrow(/no JSON/i);
  });

  it("throws when required fields are missing", () => {
    expect(() => parseRubricResponse('{"prompt_adherence":4}')).toThrow(/missing/i);
  });
});

describe("buildRubricSystemPrompt", () => {
  it("returns a non-empty string mentioning all four axes", () => {
    const s = buildRubricSystemPrompt();
    expect(s).toMatch(/prompt_adherence/);
    expect(s).toMatch(/motion_quality/);
    expect(s).toMatch(/spatial_coherence/);
    expect(s).toMatch(/aesthetic_intent/);
  });
});

describe("buildRubricUserMessage", () => {
  it("includes prompt, analysis summary, and neighbor count", () => {
    const msg = buildRubricUserMessage({
      prompt: "Slow push_in reveals kitchen island",
      analysisSummary: "Kitchen with marble island, pendant lights",
      cellKey: "kitchen-push_in",
      winnerNeighbors: [
        { prompt: "Push in toward island", rating: 5, tags: ["marble"], comment: null },
      ],
      loserNeighbors: [],
    });
    expect(msg).toMatch(/Slow push_in reveals kitchen island/);
    expect(msg).toMatch(/marble island/);
    expect(msg).toMatch(/kitchen-push_in/);
    expect(msg).toMatch(/Push in toward island/);
  });
});
