import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { buildAtlasRequestBody, parseAtlasSubmitResponse, ATLAS_MODELS } from "../atlas.js";
import type { GenerateClipParams } from "../provider.interface.js";

const baseParams: GenerateClipParams = {
  sourceImage: Buffer.from(""),
  sourceImageUrl: "https://cdn.example.com/start.jpg",
  prompt: "slow cinematic push in",
  durationSeconds: 5,
  aspectRatio: "16:9",
};

describe("buildAtlasRequestBody", () => {
  it("maps GenerateClipParams to the Kling v3.0 Pro body with end_image", () => {
    const body = buildAtlasRequestBody(
      { ...baseParams, endImageUrl: "https://cdn.example.com/end.jpg" },
      ATLAS_MODELS["kling-v3-pro"],
    );
    expect(body.model).toBe("kwaivgi/kling-v3.0-pro/image-to-video");
    expect(body.image).toBe("https://cdn.example.com/start.jpg");
    expect(body.end_image).toBe("https://cdn.example.com/end.jpg");
    expect(body.prompt).toBe("slow cinematic push in");
    expect(body.duration).toBe(5);
    // Wan-only field must not be present on Kling submissions.
    expect((body as unknown as Record<string, unknown>).last_image).toBeUndefined();
  });

  it("maps GenerateClipParams to the Wan 2.7 body with last_image", () => {
    const body = buildAtlasRequestBody(
      { ...baseParams, endImageUrl: "https://cdn.example.com/end.jpg" },
      ATLAS_MODELS["wan-2.7"],
    );
    expect(body.model).toBe("alibaba/wan-2.7/image-to-video");
    expect(body.image).toBe("https://cdn.example.com/start.jpg");
    expect(body.last_image).toBe("https://cdn.example.com/end.jpg");
    // Kling-only field must not leak onto Wan submissions.
    expect((body as unknown as Record<string, unknown>).end_image).toBeUndefined();
  });

  it("omits the end-frame field when endImageUrl is missing", () => {
    const body = buildAtlasRequestBody(
      { ...baseParams, endImageUrl: undefined },
      ATLAS_MODELS["kling-v3-pro"],
    );
    expect((body as unknown as Record<string, unknown>).end_image).toBeUndefined();
  });

  it("throws when sourceImageUrl is missing — Atlas requires a hosted URL", () => {
    expect(() =>
      buildAtlasRequestBody(
        { ...baseParams, sourceImageUrl: undefined },
        ATLAS_MODELS["kling-v3-pro"],
      ),
    ).toThrow(/sourceImageUrl/);
  });

  it("clamps duration to the model's supported set", () => {
    const klingShort = buildAtlasRequestBody(
      { ...baseParams, durationSeconds: 3 },
      ATLAS_MODELS["kling-v3-pro"],
    );
    expect(klingShort.duration).toBe(5); // Kling v3.0 Pro only allows 5 or 10
    const klingLong = buildAtlasRequestBody(
      { ...baseParams, durationSeconds: 12 },
      ATLAS_MODELS["kling-v3-pro"],
    );
    expect(klingLong.duration).toBe(10);
    // Wan allows arbitrary duration 2..15
    const wanShort = buildAtlasRequestBody(
      { ...baseParams, durationSeconds: 3 },
      ATLAS_MODELS["wan-2.7"],
    );
    expect(wanShort.duration).toBe(3);
    const wanLong = buildAtlasRequestBody(
      { ...baseParams, durationSeconds: 20 },
      ATLAS_MODELS["wan-2.7"],
    );
    expect(wanLong.duration).toBe(15);
  });
});

describe("parseAtlasSubmitResponse", () => {
  it("extracts the prediction id from a successful submit response", () => {
    const resp = {
      code: 200,
      message: "",
      data: {
        id: "8ba2926c6bd642049f4d17dd68ea6785",
        model: "kwaivgi/kling-v3.0-pro/image-to-video",
        outputs: null,
        urls: { get: "https://api.atlascloud.ai/api/v1/model/prediction/8ba2926c6bd642049f4d17dd68ea6785" },
        status: "processing",
      },
    };
    expect(parseAtlasSubmitResponse(resp)).toBe("8ba2926c6bd642049f4d17dd68ea6785");
  });

  it("throws when the response lacks data.id", () => {
    expect(() => parseAtlasSubmitResponse({ code: 200, data: {} })).toThrow(/id/i);
  });

  it("throws when code is not 200", () => {
    expect(() =>
      parseAtlasSubmitResponse({ code: 402, msg: "insufficient balance", data: null }),
    ).toThrow(/402|balance/i);
  });
});
