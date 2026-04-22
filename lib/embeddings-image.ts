/**
 * P3 — image-embedding provider wrapper (SKELETON).
 *
 * Status: pre-cooked 2026-04-22 on branch session/p3-s1-implementation-draft.
 * NOT WIRED. Actual Gemini call is stubbed — P3 Session 1 (2026-04-25) fills
 * it in after verifying billing covers the endpoint and latency is usable.
 *
 * Design: `docs/audits/p3-image-embedding-provider-decision.md` on branch
 * session/p3-embedding-preflight (Oliver Q1–Q5 resolved 2026-04-22).
 *
 * Provider: Gemini `gemini-embedding-2` via @google/genai SDK (same dep as
 * lib/providers/gemini-analyzer.ts). outputDimensionality=768.
 *
 * Kill-switch: ENABLE_IMAGE_EMBEDDINGS env (default "false"). When disabled,
 * embedImage throws EmbeddingsDisabledError before any API call.
 */

import { recordCostEvent } from "./db.js";

export const IMAGE_EMBEDDING_MODEL = "gemini-embedding-2" as const;
export const IMAGE_EMBEDDING_DIM = 768 as const;

export interface ImageEmbedding {
  vector: number[]; // length 768
  model: typeof IMAGE_EMBEDDING_MODEL;
  dim: typeof IMAGE_EMBEDDING_DIM;
}

export interface EmbedImageInput {
  imageUrl: string;
  imageBytes?: Buffer;
  photoId?: string;
  sessionId?: string;
  surface: "lab" | "prod" | "backfill";
}

export class EmbeddingsDisabledError extends Error {
  constructor() {
    super("ENABLE_IMAGE_EMBEDDINGS !== 'true'; image embedding skipped. See docs/state/P3-IMPLEMENTATION-STATUS.md.");
    this.name = "EmbeddingsDisabledError";
  }
}

export function isEnabled(): boolean {
  return process.env.ENABLE_IMAGE_EMBEDDINGS === "true";
}

/**
 * Embed a single image via Gemini. Returns { vector, model, dim }.
 *
 * Cost: ~$0.00012 per image at 2026-04-22 Gemini pricing. Logs cost_event
 * with stage='analysis', provider='google', metadata.subtype='image_embedding',
 * metadata.surface (lab|prod|backfill), metadata.photo_id | session_id.
 *
 * IMPLEMENTATION DEFERRED to P3 S1: see TODO(p3-s1) block below. The
 * skeleton exists so backfill + test infrastructure can land before
 * binding-verification (per Oliver Q2: defer billing check to first call).
 */
export async function embedImage(input: EmbedImageInput): Promise<ImageEmbedding> {
  if (!isEnabled()) {
    throw new EmbeddingsDisabledError();
  }

  const startedAt = Date.now();

  try {
    // TODO(p3-s1): replace with actual @google/genai call.
    // Reference pattern: lib/providers/gemini-analyzer.ts
    //   const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    //   const resp = await genai.models.embedContent({
    //     model: IMAGE_EMBEDDING_MODEL,
    //     content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: bytesB64 }}] },
    //     config: { outputDimensionality: IMAGE_EMBEDDING_DIM },
    //   });
    //   return { vector: resp.embedding.values, model: IMAGE_EMBEDDING_MODEL, dim: IMAGE_EMBEDDING_DIM };
    //
    // If imageBytes not provided, fetch from imageUrl first. For backfill,
    // prefer downloading-once and passing bytes in (caller batches).
    throw new Error(
      "embedImage() binding not yet implemented (P3 S1 pending). " +
        "To wire: follow the TODO(p3-s1) block in lib/embeddings-image.ts.",
    );
  } catch (err) {
    const latency_ms = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    try {
      await recordCostEvent({
        propertyId: "00000000-0000-0000-0000-000000000000",
        sceneId: null,
        stage: "analysis",
        provider: "google",
        unitsConsumed: 1,
        unitType: "tokens",
        costCents: 0,
        metadata: {
          subtype: "image_embedding",
          surface: input.surface,
          photo_id: input.photoId ?? null,
          session_id: input.sessionId ?? null,
          model: IMAGE_EMBEDDING_MODEL,
          dim: IMAGE_EMBEDDING_DIM,
          latency_ms,
          error: message,
        },
      });
    } catch {
      // Never mask the original error with a cost-event failure.
    }
    throw err;
  }
}
