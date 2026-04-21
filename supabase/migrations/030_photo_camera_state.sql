-- DA.1 — store Gemini's extended analysis on the prod photos table so the
-- director can read motion_headroom + camera state without a schema-less
-- workaround. The existing typed columns (room_type, aesthetic_score, etc.)
-- stay — Gemini fills them the same way Claude did. analysis_json carries
-- the full ExtendedPhotoAnalysis blob (including motion_headroom,
-- camera_height, camera_tilt, frame_coverage, motion_headroom_rationale)
-- so new fields don't require a migration every time we extend the shape.
-- analysis_provider records which model produced the row (google or
-- anthropic) — useful for reconciliation and for measuring Gemini vs
-- Claude hallucination rates in the rating data once we have more runs.

ALTER TABLE photos ADD COLUMN IF NOT EXISTS analysis_json jsonb;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS analysis_provider text;

COMMENT ON COLUMN photos.analysis_json IS
  'Full ExtendedPhotoAnalysis blob from the photo analyzer (DA.1+). Includes motion_headroom, camera_height, camera_tilt, frame_coverage. Typed columns like room_type still populated for query convenience.';
COMMENT ON COLUMN photos.analysis_provider IS
  'Which model produced this row: google (Gemini 3 Flash) or anthropic (Claude Sonnet 4.6 fallback). Null = pre-DA.1 legacy row.';
