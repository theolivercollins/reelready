import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EmbeddingsDisabledError,
  IMAGE_EMBEDDING_DIM,
  IMAGE_EMBEDDING_MODEL,
  embedImage,
  isEnabled,
} from "./embeddings-image.js";

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

describe("embedImage — enabled-but-unwired path", () => {
  beforeEach(() => {
    process.env.ENABLE_IMAGE_EMBEDDINGS = "true";
  });

  it("throws the TODO-block error until P3 S1 binding lands", async () => {
    await expect(
      embedImage({ imageUrl: "https://x/y.jpg", surface: "lab" }),
    ).rejects.toThrow(/binding not yet implemented/);
  });
});
