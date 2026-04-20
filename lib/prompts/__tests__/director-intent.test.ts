import { describe, expect, it } from "vitest";
import { parseDirectorIntent, DEFAULT_STYLE, DEFAULT_MOOD } from "../director-intent.js";

describe("parseDirectorIntent", () => {
  it("extracts the full shape when the director emits a complete intent object", () => {
    const raw = {
      room_type: "kitchen",
      motion: "push_in",
      subject: "waterfall granite island",
      end_subject: null,
      style: ["smooth", "cinematic"],
      mood: "luxury",
      shot_style: null,
      foreground_element: null,
    };
    expect(parseDirectorIntent(raw)).toEqual(raw);
  });

  it("fills in safe defaults when intent is partially missing", () => {
    const raw = {
      room_type: "kitchen",
      motion: "push_in",
      subject: "range wall",
    };
    const parsed = parseDirectorIntent(raw);
    expect(parsed.style).toEqual(DEFAULT_STYLE);
    expect(parsed.mood).toBe(DEFAULT_MOOD);
    expect(parsed.end_subject).toBeNull();
    expect(parsed.shot_style).toBeNull();
    expect(parsed.foreground_element).toBeNull();
  });

  it("coerces non-array style into a single-element array", () => {
    const parsed = parseDirectorIntent({
      room_type: "bedroom",
      motion: "push_in",
      subject: "upholstered bed",
      style: "smooth",
    });
    expect(parsed.style).toEqual(["smooth"]);
  });

  it("throws when required fields are absent", () => {
    expect(() => parseDirectorIntent({ motion: "push_in", subject: "x" })).toThrow(/room_type/);
    expect(() => parseDirectorIntent({ room_type: "kitchen", subject: "x" })).toThrow(/motion/);
    expect(() => parseDirectorIntent({ room_type: "kitchen", motion: "push_in" })).toThrow(/subject/);
  });
});
