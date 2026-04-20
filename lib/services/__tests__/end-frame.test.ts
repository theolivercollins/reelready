import { describe, expect, it, vi } from "vitest";
import { resolveEndFrameUrl, __setCropFnForTests } from "../end-frame.js";

describe("resolveEndFrameUrl", () => {
  it("returns the paired photo URL when endPhotoUrl is provided", async () => {
    const url = await resolveEndFrameUrl({
      startPhotoUrl: "https://cdn.example.com/start.jpg",
      endPhotoUrl: "https://cdn.example.com/end.jpg",
    });
    expect(url).toBe("https://cdn.example.com/end.jpg");
  });

  it("falls back to the crop variant when only startPhotoUrl is given", async () => {
    const fakeCrop = vi.fn(async () => "https://cdn.example.com/start-crop.jpg");
    __setCropFnForTests(fakeCrop);
    const url = await resolveEndFrameUrl({
      startPhotoUrl: "https://cdn.example.com/start.jpg",
    });
    expect(url).toBe("https://cdn.example.com/start-crop.jpg");
    expect(fakeCrop).toHaveBeenCalledWith("https://cdn.example.com/start.jpg");
    __setCropFnForTests(null);
  });

  it("throws when startPhotoUrl is missing", async () => {
    await expect(resolveEndFrameUrl({ startPhotoUrl: "" })).rejects.toThrow(/startPhotoUrl/);
  });

  it("prefers endPhotoUrl over the crop fallback when both are available", async () => {
    const fakeCrop = vi.fn(async () => "https://cdn.example.com/start-crop.jpg");
    __setCropFnForTests(fakeCrop);
    const url = await resolveEndFrameUrl({
      startPhotoUrl: "https://cdn.example.com/start.jpg",
      endPhotoUrl: "https://cdn.example.com/paired.jpg",
    });
    expect(url).toBe("https://cdn.example.com/paired.jpg");
    expect(fakeCrop).not.toHaveBeenCalled();
    __setCropFnForTests(null);
  });
});
