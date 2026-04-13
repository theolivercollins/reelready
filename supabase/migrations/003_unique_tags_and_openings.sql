-- R3 (canonical unique_tags vocabulary) + R5 (visible-openings detection).
-- Adds four new columns to photos:
--   unique_tags         — closed-vocabulary tags the coverage enforcer
--                         matches on to guarantee a unique-feature clip per
--                         video. See docs/COVERAGE-MODEL.md §4.3 and
--                         lib/types.ts `UniqueTag`.
--   visible_openings    — true when the photo's frame contains a doorway,
--                         archway, slider, pass-through, or interior window
--                         into another room. Powers the director's
--                         adjacent-room constraint block injection
--                         (docs/WALKTHROUGH-ROADMAP.md R5).
--   opening_types       — which specific opening(s) are visible.
--   opening_prominence  — 0.0–1.0 share of frame occupied by the largest
--                         visible opening, used as a downstream hallucination
--                         risk weight.
--
-- properties.style_guide is already jsonb; the R3 schema changes to
-- PropertyStyleGuide (notable_features objects + top-level unique_tags)
-- serialize into the existing column with no schema change.

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS unique_tags        text[]        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visible_openings   boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opening_types      text[]        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS opening_prominence numeric(3,2)  NOT NULL DEFAULT 0;

-- GIN index on unique_tags so the coverage enforcer can filter the photo
-- set by canonical tag without scanning every row.
CREATE INDEX IF NOT EXISTS photos_unique_tags_idx
  ON public.photos USING GIN (unique_tags);

-- Partial index on visible_openings so the director's pre-scripting query
-- ("which selected photos need the constraint block?") stays cheap.
CREATE INDEX IF NOT EXISTS photos_visible_openings_idx
  ON public.photos (property_id)
  WHERE visible_openings = true;
