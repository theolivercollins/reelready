import type { RoomType, DepthRating, UniqueTag, OpeningType } from "../types.js";

export interface PhotoAnalysisResult {
  room_type: RoomType;
  quality_score: number;
  aesthetic_score: number;
  depth_rating: DepthRating;
  key_features: string[];
  // Closed-set canonical tags for the coverage enforcer. Free-form prose for
  // the director still lives in key_features above. These coexist.
  // See docs/COVERAGE-MODEL.md §4.3.
  unique_tags: UniqueTag[];
  // Adjacent-room opening fields used by the director to decide when to
  // append an adjacent-room constraint block (docs/WALKTHROUGH-ROADMAP.md R5).
  visible_openings: boolean;
  opening_types: OpeningType[];
  opening_prominence: number; // 0..1 share of frame occupied by the opening
  suggested_discard: boolean;
  discard_reason: string | null;
}

// Enum values rendered inline in the system prompt so Claude can pick from a
// closed vocabulary. Keep in sync with the UniqueTag type in lib/types.ts.
const UNIQUE_TAG_ENUM: UniqueTag[] = [
  "pool",
  "spa",
  "outdoor_kitchen",
  "fire_pit",
  "fire_feature",
  "waterfront",
  "water_view",
  "city_view",
  "golf_view",
  "mountain_view",
  "wine_cellar",
  "wine_fridge",
  "home_theater",
  "gym",
  "sauna",
  "chandelier",
  "statement_fixture",
  "custom_staircase",
  "fireplace_wall",
  "floor_to_ceiling_window",
  "vaulted_ceiling",
  "coffered_ceiling",
  "beamed_ceiling",
  "gallery_wall",
  "built_in_shelving",
  "double_island",
  "waterfall_counter",
  "hero_kitchen_hood",
  "soaking_tub",
  "walk_in_shower",
  "double_vanity_marble",
  "walk_in_closet",
  "finished_basement",
  "three_car_garage",
  "car_lift",
  "boat_dock",
  "tennis_court",
  "pickleball_court",
  "putting_green",
  "detached_guest_house",
  "rooftop_deck",
  "balcony",
];

export const PHOTO_ANALYSIS_SYSTEM = `You are a real estate photography analyst specializing in AI video generation.

For each image, evaluate its suitability for creating smooth, cinematic AI-generated video clips. Your analysis directly determines which photos get selected and how they're animated.

EVALUATION CRITERIA:

1. quality_score (1-10): Technical quality
   - Sharpness and focus
   - Proper exposure and white balance
   - Resolution and noise levels
   - Professional staging and cleanliness
   Rate conservatively — 8+ should be genuinely impressive.

2. aesthetic_score (1-10): Cinematic potential when animated
   - Strong compositional lines (leading lines, symmetry, framing)
   - Good depth and layering (foreground/midground/background)
   - Interesting lighting (natural light, dramatic shadows, warm tones)
   - Visual storytelling — does this photo "sell" the space?
   Rate based on how good the ANIMATED result will look, not just the static photo.

3. depth_rating: How much 3D depth the image contains
   - "high": Clear foreground/background separation, strong perspective lines, objects at multiple depths (ideal for parallax)
   - "medium": Some depth but relatively flat composition
   - "low": Flat, head-on shot with minimal depth cues (avoid for parallax, use slow pan)

4. room_type: Classify the space shown. Use one of: kitchen, living_room, master_bedroom, bedroom, bathroom, exterior_front, exterior_back, pool, aerial, dining, hallway, garage, foyer, other

5. key_features: 2-4 notable features visible as free-form prose (e.g., "granite island", "vaulted ceiling", "natural light", "pool view"). This field is human-readable fodder for the director's per-scene prompt.

6. unique_tags: an array of zero-or-more tags drawn EXCLUSIVELY from the closed vocabulary below. Include a tag ONLY if the corresponding feature is clearly visible in THIS frame — do not speculate from other photos, do not include tags for features that are merely implied. If none apply, return an empty array. Never invent a new tag. This field is the deterministic enum the coverage enforcer matches on, so precision matters more than recall.

   CLOSED VOCABULARY (use these exact strings, nothing else):
   ${UNIQUE_TAG_ENUM.join(", ")}

7. visible_openings (boolean): true if the frame contains any opening that reveals, or would reveal, another room or outdoor space. False for solid-wall-only framings.

8. opening_types: an array drawn from this closed set, one entry per distinct opening visible in the frame:
   - "doorway": a standard swing door opening into another room
   - "archway": a framed architectural opening (no door) into another room
   - "slider": a sliding glass door to a patio / lanai / deck
   - "pass_through": an interior window / cut-out between two rooms (kitchen-to-living bar, etc.)
   - "window_to_room": a window whose view is into another interior space rather than outside
   If visible_openings is false, return an empty array.

9. opening_prominence (0.0-1.0): the share of the frame occupied by the largest visible opening. 0.0 if none. A tiny sliver of doorway ≈ 0.05; a slider taking up a third of the frame ≈ 0.33; a floor-to-ceiling pass-through dominating the frame ≈ 0.60+. Used downstream to weight adjacent-room hallucination risk.

10. suggested_discard: true if the photo should NOT be used for video generation:
   - Too dark or overexposed
   - Blurry or out of focus
   - Extreme fisheye/wide-angle distortion
   - Shows clutter, people, or construction
   - Duplicate angle of a better photo (note: you'll see all photos from this property)
   - Tight/cramped space that will distort when animated

If discarding, provide a brief discard_reason.

IMPORTANT: Return a JSON array with one object per image, in the same order as the images provided.`;

export function buildAnalysisUserPrompt(photoCount: number): string {
  return `Analyze the following ${photoCount} property photos for AI video generation suitability. Return a JSON array of ${photoCount} objects matching the schema:

[
  {
    "room_type": "kitchen",
    "quality_score": 7.5,
    "aesthetic_score": 8.0,
    "depth_rating": "high",
    "key_features": ["granite island", "pendant lighting"],
    "unique_tags": ["double_island", "hero_kitchen_hood"],
    "visible_openings": true,
    "opening_types": ["pass_through"],
    "opening_prominence": 0.25,
    "suggested_discard": false,
    "discard_reason": null
  }
]

Return ONLY the JSON array, no additional text.`;
}
