import type { RoomType, DepthRating } from "@reelready/db";

export interface PhotoAnalysisResult {
  room_type: RoomType;
  quality_score: number;
  aesthetic_score: number;
  depth_rating: DepthRating;
  key_features: string[];
  suggested_discard: boolean;
  discard_reason: string | null;
}

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

5. key_features: 2-4 notable features visible (e.g., "granite island", "vaulted ceiling", "natural light", "pool view")

6. suggested_discard: true if the photo should NOT be used for video generation:
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
    "suggested_discard": false,
    "discard_reason": null
  }
]

Return ONLY the JSON array, no additional text.`;
}
