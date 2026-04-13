export type PropertyStatus =
  | "queued"
  | "analyzing"
  | "scripting"
  | "generating"
  | "qc"
  | "assembling"
  | "complete"
  | "failed"
  | "needs_review";

export type RoomType =
  | "kitchen"
  | "living_room"
  | "master_bedroom"
  | "bedroom"
  | "bathroom"
  | "exterior_front"
  | "exterior_back"
  | "pool"
  | "aerial"
  | "dining"
  | "hallway"
  | "garage"
  | "foyer"
  | "other";

export type DepthRating = "high" | "medium" | "low";

// Canonical closed-set vocabulary of "unique" property features. The coverage
// enforcer (docs/COVERAGE-MODEL.md §4.3) matches these deterministically to
// guarantee at least one unique-feature clip per video. Free-form prose for
// the director lives on photo.key_features; this type is the enum for
// allocation / coverage / QC tooling.
export type UniqueTag =
  | "pool"
  | "spa"
  | "outdoor_kitchen"
  | "fire_pit"
  | "fire_feature"
  | "waterfront"
  | "water_view"
  | "city_view"
  | "golf_view"
  | "mountain_view"
  | "wine_cellar"
  | "wine_fridge"
  | "home_theater"
  | "gym"
  | "sauna"
  | "chandelier"
  | "statement_fixture"
  | "custom_staircase"
  | "fireplace_wall"
  | "floor_to_ceiling_window"
  | "vaulted_ceiling"
  | "coffered_ceiling"
  | "beamed_ceiling"
  | "gallery_wall"
  | "built_in_shelving"
  | "double_island"
  | "waterfall_counter"
  | "hero_kitchen_hood"
  | "soaking_tub"
  | "walk_in_shower"
  | "double_vanity_marble"
  | "walk_in_closet"
  | "finished_basement"
  | "three_car_garage"
  | "car_lift"
  | "boat_dock"
  | "tennis_court"
  | "pickleball_court"
  | "putting_green"
  | "detached_guest_house"
  | "rooftop_deck"
  | "balcony";

// Visible adjacent-room opening types, captured per photo so the director can
// inject an adjacent-room constraint block on exactly those scenes.
// See docs/WALKTHROUGH-ROADMAP.md R5 and docs/MULTI-IMAGE-CONTEXT-PLAN.md S1+S2.
export type OpeningType =
  | "doorway"
  | "archway"
  | "slider"
  | "pass_through"
  | "window_to_room";

export type CameraMovement =
  | "orbital_slow"
  | "dolly_left_to_right"
  | "dolly_right_to_left"
  | "slow_pan"
  | "parallax"
  | "push_in"
  | "pull_out";

export type SceneStatus =
  | "pending"
  | "generating"
  | "qc_pass"
  | "qc_soft_reject"
  | "qc_hard_reject"
  | "retry_1"
  | "retry_2"
  | "failed"
  | "needs_review";

export type VideoProvider = "runway" | "kling" | "luma" | "higgsfield";

export type LogStage =
  | "intake"
  | "analysis"
  | "scripting"
  | "generation"
  | "qc"
  | "assembly"
  | "delivery";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface Property {
  id: string;
  created_at: string;
  updated_at: string | null;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  listing_agent: string;
  brokerage: string | null;
  status: PropertyStatus;
  photo_count: number;
  selected_photo_count: number;
  total_cost_cents: number;
  processing_time_ms: number | null;
  horizontal_video_url: string | null;
  vertical_video_url: string | null;
  thumbnail_url: string | null;
  submitted_by: string | null;
}

export interface Photo {
  id: string;
  property_id: string;
  created_at: string;
  file_url: string;
  file_name: string | null;
  room_type: RoomType | null;
  quality_score: number | null;
  aesthetic_score: number | null;
  depth_rating: DepthRating | null;
  selected: boolean;
  discard_reason: string | null;
  key_features: string[] | null;
  unique_tags: UniqueTag[] | null;
  visible_openings: boolean | null;
  opening_types: OpeningType[] | null;
  opening_prominence: number | null;
}

export interface Scene {
  id: string;
  property_id: string;
  photo_id: string;
  scene_number: number;
  camera_movement: CameraMovement;
  prompt: string;
  duration_seconds: number;
  status: SceneStatus;
  provider: VideoProvider | null;
  generation_cost_cents: number | null;
  generation_time_ms: number | null;
  clip_url: string | null;
  attempt_count: number;
  qc_verdict: string | null;
  qc_issues: Record<string, unknown>[] | null;
  qc_confidence: number | null;
}

export interface PipelineLog {
  id: string;
  property_id: string;
  scene_id: string | null;
  created_at: string;
  stage: LogStage;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
}

export interface DailyStats {
  id: string;
  date: string;
  properties_completed: number;
  properties_failed: number;
  total_clips_generated: number;
  total_retries: number;
  total_cost_cents: number;
  avg_processing_time_ms: number | null;
  avg_cost_per_video_cents: number | null;
}
