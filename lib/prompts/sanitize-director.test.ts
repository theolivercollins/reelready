import { describe, it, expect } from "vitest";
import { sanitizeDirectorPrompt } from "./sanitize-director.js";

describe("sanitizeDirectorPrompt — real prod leaks (2026-04-24)", () => {
  it("strips trailing 'and Y beyond' clause (iteration ccbc3ed9)", () => {
    const r = sanitizeDirectorPrompt(
      "slow cinematic straight push with extremely slight curve toward the rectangular pendant chandelier and waterway slider beyond",
      "push_in",
    );
    expect(r.cleaned).toBe(
      "slow cinematic straight push with extremely slight curve toward the rectangular pendant chandelier",
    );
    expect(r.edits).toContain('stripped trailing clause containing "beyond"');
  });

  it("removes trailing 'beyond' when there's no separator to strip to (iteration 71a6c278)", () => {
    const r = sanitizeDirectorPrompt(
      "slow cinematic parallax glide past the circular spa foreground toward the covered lanai beyond",
      "parallax",
    );
    expect(r.cleaned).toBe(
      "slow cinematic parallax glide past the circular spa foreground toward the covered lanai",
    );
    expect(r.edits).toContain('removed "beyond"');
  });

  it("strips trailing 'and canal beyond' clause on a parallax prompt", () => {
    const r = sanitizeDirectorPrompt(
      "smooth cinematic parallax glide past the raised planting bed toward the rectangular dock and canal beyond",
      "parallax",
    );
    expect(r.cleaned).toBe(
      "smooth cinematic parallax glide past the raised planting bed toward the rectangular dock",
    );
  });

  it("removes trailing 'beyond' on a reveal prompt (reveal allows 'past', not 'beyond')", () => {
    const r = sanitizeDirectorPrompt(
      "smooth cinematic reveal past the shower wall foreground to the rectangular double vanity beyond",
      "reveal",
    );
    expect(r.cleaned).toBe(
      "smooth cinematic reveal past the shower wall foreground to the rectangular double vanity",
    );
    // "past" in the reveal pattern must survive.
    expect(r.cleaned).toMatch(/\bpast\b/);
  });
});

describe("sanitizeDirectorPrompt — baseline cases", () => {
  it("is a no-op when no banned word is present", () => {
    const r = sanitizeDirectorPrompt(
      "slow cinematic push toward the waterfall granite island",
      "push_in",
    );
    expect(r.cleaned).toBe("slow cinematic push toward the waterfall granite island");
    expect(r.edits).toEqual([]);
  });

  it("strips 'through' even without a separator (Lab is single-image)", () => {
    const r = sanitizeDirectorPrompt(
      "steady cinematic low angle glide through the great room",
      "push_in",
    );
    expect(r.cleaned).toBe("steady cinematic low angle glide the great room");
    expect(r.edits).toContain('removed "through"');
  });

  it("preserves 'past' — it is idiomatic in reveal + parallax", () => {
    const reveal = sanitizeDirectorPrompt(
      "smooth cinematic reveal past the kitchen island corner to the fireplace alcove",
      "reveal",
    );
    expect(reveal.cleaned).toMatch(/\bpast\b/);
    expect(reveal.edits).toEqual([]);

    const parallax = sanitizeDirectorPrompt(
      "smooth cinematic parallax glide past the raised planting bed toward the rectangular dock",
      "parallax",
    );
    expect(parallax.cleaned).toMatch(/\bpast\b/);
    expect(parallax.edits).toEqual([]);
  });

  it("handles multiple banned words in one pass", () => {
    const r = sanitizeDirectorPrompt(
      "slow cinematic push through the pocket slider toward the pool and deck beyond",
      "push_in",
    );
    expect(r.cleaned).not.toMatch(/\bbeyond\b/);
    expect(r.cleaned).not.toMatch(/\bthrough\b/);
  });

  it("does not strip across a period (different clause)", () => {
    // Hypothetical multi-sentence (director shouldn't emit this but guard it).
    const r = sanitizeDirectorPrompt(
      "slow cinematic push toward kitchen. Something and stuff beyond",
      "push_in",
    );
    // The "and" before "stuff beyond" is in the second sentence, so stripping
    // from it would NOT eat into the first sentence. Current impl strips from
    // the "and" within the same clause — the second sentence becomes empty.
    expect(r.cleaned.startsWith("slow cinematic push toward kitchen.")).toBe(true);
  });
});
