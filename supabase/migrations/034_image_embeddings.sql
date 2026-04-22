-- P3 — image embedding columns for photos + prompt_lab_sessions.
-- Design: `docs/audits/p3-image-embedding-provider-decision.md` (branch
-- session/p3-embedding-preflight) — Gemini gemini-embedding-2 at 768 dims.
--
-- pgvector is already enabled (existing text-embedding columns use it). No
-- CREATE EXTENSION needed.
--
-- HNSW indexes use cosine distance (Gemini's embeddings are L2-normalized).
-- Partial (WHERE embedding IS NOT NULL) since backfill is incremental.
--
-- Pre-cooked 2026-04-22 on branch session/p3-s1-implementation-draft.
-- Not applied. Not wired into retrieval yet — that's P3 Session 2 (hybrid +
-- reranker). P3 Session 1 (2026-04-25) applies this migration, runs the
-- backfill script, and validates the first ~100 embeddings are populated.

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS image_embedding vector(768);

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS image_embedding_model text;

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS image_embedding_at timestamptz;

ALTER TABLE prompt_lab_sessions
  ADD COLUMN IF NOT EXISTS image_embedding vector(768);

ALTER TABLE prompt_lab_sessions
  ADD COLUMN IF NOT EXISTS image_embedding_model text;

ALTER TABLE prompt_lab_sessions
  ADD COLUMN IF NOT EXISTS image_embedding_at timestamptz;

COMMENT ON COLUMN photos.image_embedding IS
  'Gemini gemini-embedding-2 image embedding, 768-dim, L2-normalized.
   Populated by scripts/backfill-image-embeddings.ts or the per-photo hook
   in DA.1 prod analysis path (P4 hook, not yet wired). Cosine distance
   against this column gives structural photo similarity for retrieval.';

COMMENT ON COLUMN photos.image_embedding_model IS
  'Model identifier for image_embedding (e.g. "gemini-embedding-2" at dim=768).
   Lets us batch-invalidate on model upgrades without a migration.';

CREATE INDEX IF NOT EXISTS idx_photos_image_embedding_hnsw
  ON photos USING hnsw (image_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE image_embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prompt_lab_sessions_image_embedding_hnsw
  ON prompt_lab_sessions USING hnsw (image_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE image_embedding IS NOT NULL;
