// Fixed taxonomy for structured rating reasons. These are the signal
// that retrieval + autonomous iteration will key on — keep this list
// tight. Add entries only when a reason clearly won't fit an existing
// one. "other" is the escape hatch; rely on rating_comment for detail
// when using it.
//
// Positive reasons only make sense on 4-5★ ratings; negative on 1-3★.
// The UI enforces this grouping but the DB does not.

export const POSITIVE_RATING_REASONS = [
  "good_pacing",
  "clean_motion",
  "on_brand",
  "excellent_composition",
  "accurate_to_photo",
  "cinematic_energy",
] as const;

export const NEGATIVE_RATING_REASONS = [
  "camera_shake",
  "too_fast",
  "too_slow",
  "boring_motion",
  "hallucinated_geometry",
  "hallucinated_objects",
  "warped_text",
  "flicker",
  "jumpy",
  "overexposed",
  "underexposed",
  "color_cast",
  "bad_framing",
  "subject_drift",
  "end_frame_lurch",
] as const;

export const ALL_RATING_REASONS = [
  ...POSITIVE_RATING_REASONS,
  ...NEGATIVE_RATING_REASONS,
  "other",
] as const;

export type RatingReason = typeof ALL_RATING_REASONS[number];

export const RATING_REASON_LABELS: Record<RatingReason, string> = {
  good_pacing: "Good pacing",
  clean_motion: "Clean motion",
  on_brand: "On-brand",
  excellent_composition: "Excellent composition",
  accurate_to_photo: "Accurate to photo",
  cinematic_energy: "Cinematic energy",
  camera_shake: "Camera shake",
  too_fast: "Too fast",
  too_slow: "Too slow",
  boring_motion: "Boring motion",
  hallucinated_geometry: "Hallucinated geometry",
  hallucinated_objects: "Hallucinated objects",
  warped_text: "Warped text",
  flicker: "Flicker",
  jumpy: "Jumpy / stutter",
  overexposed: "Overexposed",
  underexposed: "Underexposed",
  color_cast: "Color cast",
  bad_framing: "Bad framing",
  subject_drift: "Subject drifts out of frame",
  end_frame_lurch: "End-frame lurch / interpolation artifact",
  other: "Other (see comment)",
};
