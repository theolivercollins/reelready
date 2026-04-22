-- P1 — capture the Atlas SKU (e.g. "kling-v2-6-pro") on every Lab iteration.
-- Per the V1 foundation spec: ML loop needs SKU-granular signal from day one
-- so retrieval + router (P5) can converge on right-SKU-per-bucket without a
-- hand-curated rating grid.

ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS model_used text;

ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS sku_source text
    NOT NULL DEFAULT 'unknown'
    CHECK (sku_source IN ('captured_at_render', 'recovered', 'unknown'));

COMMENT ON COLUMN prompt_lab_iterations.model_used IS
  'The AtlasCloud model slug (e.g. "kling-v2-6-pro") that actually served this
   render. Populated by the render + rerender endpoints at submit time.
   Legacy rows written before P1 (2026-04-22) are null + sku_source=unknown;
   P4 backfill recovers a subset.';

COMMENT ON COLUMN prompt_lab_iterations.sku_source IS
  'Provenance of model_used: captured_at_render (written at submission),
   recovered (inferred later via P4 backfill heuristics), unknown (pre-P1).';

CREATE INDEX IF NOT EXISTS idx_prompt_lab_iterations_model_used
  ON prompt_lab_iterations (model_used)
  WHERE model_used IS NOT NULL;
