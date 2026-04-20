import { describe, expect, it, vi } from "vitest";
import { resolveSceneEndFrame } from "../../prompt-lab-listings.js";

describe("resolveSceneEndFrame", () => {
  it("returns the paired photo's URL when end_photo_id is set", async () => {
    const photoLookup = vi.fn(async (id: string) =>
      id === "end-photo-id" ? "https://cdn.example.com/end.jpg" : null
    );
    const result = await resolveSceneEndFrame({
      startPhotoUrl: "https://cdn.example.com/start.jpg",
      endPhotoId: "end-photo-id",
      photoLookup,
    });
    expect(result.endImageUrl).toBe("https://cdn.example.com/end.jpg");
    expect(result.pairingMode).toBe("paired");
  });

  it("returns null endImageUrl when end_photo_id is null (no crop fallback)", async () => {
    const photoLookup = vi.fn();
    const result = await resolveSceneEndFrame({
      startPhotoUrl: "https://cdn.example.com/start.jpg",
      endPhotoId: null,
      photoLookup,
    });
    expect(result.endImageUrl).toBeNull();
    expect(result.pairingMode).toBe("none");
    expect(photoLookup).not.toHaveBeenCalled();
  });

  it("returns null endImageUrl when end_photo_id is set but lookup returns null (stale reference)", async () => {
    const photoLookup = vi.fn(async () => null);
    const result = await resolveSceneEndFrame({
      startPhotoUrl: "https://cdn.example.com/start.jpg",
      endPhotoId: "missing-id",
      photoLookup,
    });
    expect(result.endImageUrl).toBeNull();
    expect(result.pairingMode).toBe("none");
    expect(photoLookup).toHaveBeenCalledWith("missing-id");
  });

  it("throws when startPhotoUrl is missing", async () => {
    await expect(
      resolveSceneEndFrame({
        startPhotoUrl: "",
        endPhotoId: null,
        photoLookup: vi.fn(),
      }),
    ).rejects.toThrow(/startPhotoUrl/);
  });
});
