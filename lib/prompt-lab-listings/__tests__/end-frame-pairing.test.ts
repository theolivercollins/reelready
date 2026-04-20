import { describe, expect, it, vi } from "vitest";
import { resolveSceneEndFrame } from "../../prompt-lab-listings.js";

describe("resolveSceneEndFrame", () => {
  it("returns the paired photo's URL when end_photo_id is set", async () => {
    const photoLookup = vi.fn(async (id: string) =>
      id === "end-photo-id" ? "https://cdn.example.com/end.jpg" : null
    );
    const cropFn = vi.fn(async (url: string) => `${url}#crop`);
    const result = await resolveSceneEndFrame({
      startPhotoUrl: "https://cdn.example.com/start.jpg",
      endPhotoId: "end-photo-id",
      photoLookup,
      cropFn,
    });
    expect(result.endImageUrl).toBe("https://cdn.example.com/end.jpg");
    expect(result.pairingMode).toBe("paired");
    expect(cropFn).not.toHaveBeenCalled();
  });

  it("falls back to crop when end_photo_id is null", async () => {
    const photoLookup = vi.fn();
    const cropFn = vi.fn(async () => "https://cdn.example.com/start-crop.jpg");
    const result = await resolveSceneEndFrame({
      startPhotoUrl: "https://cdn.example.com/start.jpg",
      endPhotoId: null,
      photoLookup,
      cropFn,
    });
    expect(result.endImageUrl).toBe("https://cdn.example.com/start-crop.jpg");
    expect(result.pairingMode).toBe("crop_fallback");
    expect(photoLookup).not.toHaveBeenCalled();
  });

  it("falls back to crop when end_photo_id is set but lookup returns null (stale reference)", async () => {
    const photoLookup = vi.fn(async () => null);
    const cropFn = vi.fn(async () => "https://cdn.example.com/start-crop.jpg");
    const result = await resolveSceneEndFrame({
      startPhotoUrl: "https://cdn.example.com/start.jpg",
      endPhotoId: "missing-id",
      photoLookup,
      cropFn,
    });
    expect(result.endImageUrl).toBe("https://cdn.example.com/start-crop.jpg");
    expect(result.pairingMode).toBe("crop_fallback");
    expect(photoLookup).toHaveBeenCalledWith("missing-id");
  });

  it("throws when startPhotoUrl is missing", async () => {
    await expect(
      resolveSceneEndFrame({
        startPhotoUrl: "",
        endPhotoId: null,
        photoLookup: vi.fn(),
        cropFn: vi.fn(),
      }),
    ).rejects.toThrow(/startPhotoUrl/);
  });
});
