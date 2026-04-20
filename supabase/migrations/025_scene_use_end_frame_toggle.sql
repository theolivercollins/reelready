-- Per-scene toggle: should this scene render with an end keyframe?
-- Previously every scene got an end_image_url (real pair OR a center-crop
-- fallback of the start). The crop fallback produces awkward
-- interpolation for push-ins, top-downs, and feature closeups — single-
-- frame i2v is usually better for those. Expose the choice explicitly.
--
-- Default true so paired scenes keep working. Backfill false for every
-- existing scene where end_photo_id IS NULL (those only have the crop
-- fallback, which is what we want to stop using).

ALTER TABLE prompt_lab_listing_scenes
  ADD COLUMN IF NOT EXISTS use_end_frame BOOLEAN NOT NULL DEFAULT true;

UPDATE prompt_lab_listing_scenes
SET use_end_frame = false
WHERE end_photo_id IS NULL;
