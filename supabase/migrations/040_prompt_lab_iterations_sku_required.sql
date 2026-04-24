-- 2026-04-24: harden the SKU-capture guarantee added in migration 031.
--
-- Before this constraint, a write path could mark an iteration complete
-- (clip_url NOT NULL) without populating model_used, leaving the Rating
-- Ledger to fall back to the provider name. For Atlas rows — where the
-- "provider" is the aggregator, not a model — this leaked the literal
-- string "atlas" into the SKU slot (see commit history for the 2026-04-23
-- fetchLegacyLab fix). The DB layer now refuses to commit such a row.
--
-- Shape:
--   - Pre-render rows (clip_url NULL): allowed, model_used not yet known.
--   - Finished rows with SKU (model_used NOT NULL): allowed, the happy path.
--   - Legacy rows that predate P1 (sku_source='unknown'): grandfathered.
--
-- Pre-flight audit against current data (2026-04-24) confirmed zero rows
-- violate the predicate, so the constraint is added VALID.

ALTER TABLE prompt_lab_iterations
  ADD CONSTRAINT prompt_lab_iterations_sku_required_at_finalize
  CHECK (
    clip_url IS NULL
    OR model_used IS NOT NULL
    OR sku_source = 'unknown'
  );

COMMENT ON CONSTRAINT prompt_lab_iterations_sku_required_at_finalize
  ON prompt_lab_iterations IS
  'Guarantees no completed render lands without a model_used SKU unless it is
   an explicitly-grandfathered legacy row (sku_source=unknown). Prevents the
   provider-aggregator name from leaking into the SKU slot of downstream
   consumers (Rating Ledger, cost attribution, Thompson router).';
