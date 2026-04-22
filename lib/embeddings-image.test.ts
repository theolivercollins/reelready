import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EmbeddingsDisabledError,
  IMAGE_EMBEDDING_DIM,
  IMAGE_EMBEDDING_MODEL,
  embedImage,
  isEnabled,
} from "./embeddings-image.js";

// ---------------------------------------------------------------------------
// Mock @google/genai so tests never hit the real API.
// ---------------------------------------------------------------------------
vi.mock("@google/genai", () => {
  const fakeVector = Array.from({ length: 768 }, (_, i) => i * 0.001);
  class GoogleGenAI {
    models = {
      embedContent: vi.fn().mockResolvedValue({
        embeddings: [{ values: fakeVector }],
      }),
    };
    constructor(_opts: unknown) {}
  }
  return { GoogleGenAI };
});

const ORIGINAL_ENV = process.env.ENABLE_IMAGE_EMBEDDINGS;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.ENABLE_IMAGE_EMBEDDINGS;
  } else {
    process.env.ENABLE_IMAGE_EMBEDDINGS = ORIGINAL_ENV;
  }
});

describe("embeddings-image — constants", () => {
  it("IMAGE_EMBEDDING_MODEL is gemini-embedding-2", () => {
    expect(IMAGE_EMBEDDING_MODEL).toBe("gemini-embedding-2");
  });

  it("IMAGE_EMBEDDING_DIM is 768", () => {
    expect(IMAGE_EMBEDDING_DIM).toBe(768);
  });
});

describe("embeddings-image — isEnabled kill-switch", () => {
  it("returns false when ENABLE_IMAGE_EMBEDDINGS unset", () => {
    delete process.env.ENABLE_IMAGE_EMBEDDINGS;
    expect(isEnabled()).toBe(false);
  });

  it("returns false when ENABLE_IMAGE_EMBEDDINGS = anything other than 'true'", () => {
    process.env.ENABLE_IMAGE_EMBEDDINGS = "1";
    expect(isEnabled()).toBe(false);
    process.env.ENABLE_IMAGE_EMBEDDINGS = "yes";
    expect(isEnabled()).toBe(false);
    process.env.ENABLE_IMAGE_EMBEDDINGS = "true ";
    expect(isEnabled()).toBe(false);
  });

  it("returns true only when ENABLE_IMAGE_EMBEDDINGS === 'true'", () => {
    process.env.ENABLE_IMAGE_EMBEDDINGS = "true";
    expect(isEnabled()).toBe(true);
  });
});

describe("embedImage — kill-switch path", () => {
  beforeEach(() => {
    delete process.env.ENABLE_IMAGE_EMBEDDINGS;
  });

  it("throws EmbeddingsDisabledError when kill-switch is off", async () => {
    await expect(
      embedImage({ imageUrl: "https://x/y.jpg", surface: "lab" }),
    ).rejects.toBeInstanceOf(EmbeddingsDisabledError);
  });
});

describe("embedImage — success path (Gemini binding)", () => {
  beforeEach(() => {
    process.env.ENABLE_IMAGE_EMBEDDINGS = "true";
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("returns vector of length 768, correct model and dim", async () => {
    // The mock intercepts the fetch so we need to mock global fetch too.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }) as any;

    const result = await embedImage({ imageUrl: "https://example.com/photo.jpg", surface: "lab" });

    expect(result.vector).toHaveLength(IMAGE_EMBEDDING_DIM);
    expect(result.model).toBe(IMAGE_EMBEDDING_MODEL);
    expect(result.dim).toBe(IMAGE_EMBEDDING_DIM);
  });
});
