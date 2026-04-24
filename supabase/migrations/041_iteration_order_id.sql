-- 2026-04-24: give every Lab iteration (past and future) a human-readable
-- order id, like an order number.
--
-- Scheme (durable):
--   V1 = prompt_lab_iterations                 (single-photo Prompt Lab, the original)
--   V2 = prompt_lab_listing_scene_iterations   (multi-scene Listings Lab, discarded)
--   V3+ = reserved for future lab surfaces; add a new sequence + trigger when created.
--
-- Format: `V{n}-{seq:05}` — e.g. `V1-00001`, `V2-00042`.
-- The first row inserted into each version is seq=1. Sequences are monotone
-- and atomic (Postgres `nextval`), so concurrent inserts never collide.
--
-- Backfill orders existing rows by (created_at ASC, id ASC) so the oldest
-- historical iteration gets the lowest number.

BEGIN;

-- 1. Per-version sequences.
CREATE SEQUENCE IF NOT EXISTS v1_iteration_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS v2_iteration_seq START WITH 1;

-- 2. Columns (nullable for the backfill step).
ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS order_id text;
ALTER TABLE prompt_lab_listing_scene_iterations
  ADD COLUMN IF NOT EXISTS order_id text;

-- 3. Backfill V1.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM prompt_lab_iterations
)
UPDATE prompt_lab_iterations p
SET order_id = 'V1-' || LPAD(n.rn::text, 5, '0')
FROM numbered n
WHERE p.id = n.id
  AND p.order_id IS NULL;

-- Advance the sequence past the backfill so new inserts pick up at N+1.
SELECT setval('v1_iteration_seq', GREATEST(1, (SELECT COUNT(*) FROM prompt_lab_iterations)));

-- 4. Backfill V2.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM prompt_lab_listing_scene_iterations
)
UPDATE prompt_lab_listing_scene_iterations p
SET order_id = 'V2-' || LPAD(n.rn::text, 5, '0')
FROM numbered n
WHERE p.id = n.id
  AND p.order_id IS NULL;

SELECT setval('v2_iteration_seq', GREATEST(1, (SELECT COUNT(*) FROM prompt_lab_listing_scene_iterations)));

-- 5. Enforce: every row must have an order_id, and it must be unique per table.
ALTER TABLE prompt_lab_iterations
  ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE prompt_lab_iterations
  ADD CONSTRAINT prompt_lab_iterations_order_id_unique UNIQUE (order_id);

ALTER TABLE prompt_lab_listing_scene_iterations
  ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE prompt_lab_listing_scene_iterations
  ADD CONSTRAINT prompt_lab_listing_scene_iterations_order_id_unique UNIQUE (order_id);

-- 6. Triggers: assign the next order_id on insert if the caller didn't set one.
--    Keeping this in the DB (not app code) means no insert path can forget.
CREATE OR REPLACE FUNCTION assign_v1_iteration_order_id() RETURNS trigger AS $$
BEGIN
  IF NEW.order_id IS NULL THEN
    NEW.order_id := 'V1-' || LPAD(nextval('v1_iteration_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assign_v2_iteration_order_id() RETURNS trigger AS $$
BEGIN
  IF NEW.order_id IS NULL THEN
    NEW.order_id := 'V2-' || LPAD(nextval('v2_iteration_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prompt_lab_iterations_assign_order_id ON prompt_lab_iterations;
CREATE TRIGGER prompt_lab_iterations_assign_order_id
  BEFORE INSERT ON prompt_lab_iterations
  FOR EACH ROW EXECUTE FUNCTION assign_v1_iteration_order_id();

DROP TRIGGER IF EXISTS prompt_lab_listing_scene_iterations_assign_order_id ON prompt_lab_listing_scene_iterations;
CREATE TRIGGER prompt_lab_listing_scene_iterations_assign_order_id
  BEFORE INSERT ON prompt_lab_listing_scene_iterations
  FOR EACH ROW EXECUTE FUNCTION assign_v2_iteration_order_id();

-- 7. Index the order_id for fast lookup (UNIQUE already creates one, but
--    adding a comment so grep finds the contract in this file).
COMMENT ON COLUMN prompt_lab_iterations.order_id IS
  'Human-readable iteration order number (V1-00001, V1-00002, ...). Assigned by trigger on insert; backfilled 2026-04-24.';
COMMENT ON COLUMN prompt_lab_listing_scene_iterations.order_id IS
  'Human-readable iteration order number (V2-00001, V2-00002, ...). Assigned by trigger on insert; backfilled 2026-04-24.';

COMMIT;
