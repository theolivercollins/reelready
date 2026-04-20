-- Migration 022: End-frame support for Atlas Cloud (Kling v3.0 Pro
-- default, Wan 2.7 toggle). Scenes and Lab iterations gain two optional
-- columns describing the end keyframe:
--   end_photo_id  — UUID reference to another photo when the director
--                   pairs two photos. Not enforced as FK because Lab
--                   iterations reference prompt_lab_sessions while prod
--                   scenes reference property_photos.
--   end_image_url — resolved URL passed to Atlas. Populated either from
--                   the paired photo or from a sharp-generated
--                   center-crop variant of the start photo.

BEGIN;

ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS end_photo_id UUID,
  ADD COLUMN IF NOT EXISTS end_image_url TEXT;

ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS end_photo_id UUID,
  ADD COLUMN IF NOT EXISTS end_image_url TEXT;

COMMIT;
