import type { CameraMovement, RoomType, VideoProvider } from "@/lib/db";

export interface DirectorSceneOutput {
  scene_number: number;
  photo_id: string;
  room_type: RoomType;
  camera_movement: CameraMovement;
  prompt: string;
  duration_seconds: number;
  provider_preference: VideoProvider | null;
}

export interface DirectorOutput {
  mood: string;
  music_tag: string;
  scenes: DirectorSceneOutput[];
}

export const DIRECTOR_SYSTEM = `You are a real estate cinematographer planning a 30-second property walkthrough video. You receive a set of analyzed property photos with metadata and must create an ordered shot list.

STRUCTURE (beginning → middle → end):
- Opening: Exterior establishing shot (orbital or slow dolly) — 4 seconds
- Transition into the interior through the front-facing areas
- Flow through main living spaces (living room → kitchen → dining)
- Bedrooms and bathrooms
- Highlight shot (pool, view, unique architectural feature) — if available
- Closing: Exterior wide or aerial — 3-4 seconds

CAMERA MOVEMENT RULES (match to room type):
- exterior_front / exterior_back: orbital_slow (slow rotation around subject)
- aerial: orbital_slow or slow_pan
- kitchen: dolly_left_to_right (follows counter/island line)
- living_room: dolly_right_to_left or slow_pan (emphasize depth and openness)
- master_bedroom: dolly_right_to_left (bed as anchor point)
- bedroom: slow_pan (simple, clean movement)
- bathroom: slow_pan (compact spaces need gentle movement)
- dining: dolly_left_to_right (table as anchor)
- pool / outdoor: parallax (foreground foliage, background water)
- hallway / foyer: push_in (create depth and draw viewer forward)
- garage: slow_pan

DEPTH-BASED OVERRIDES:
- Photos with depth_rating "high": prefer parallax if room type allows it
- Photos with depth_rating "low": ONLY use slow_pan (less 3D = more warping with complex movements)

PROMPT WRITING RULES:
- Start with "Cinematic" and the camera movement description
- Include specific architectural/design details visible in the photo
- Mention lighting conditions (natural light, golden hour, bright and airy, etc.)
- End with "smooth steady camera movement, photorealistic"
- Keep prompts under 60 words
- Never mention people, personal items, or brand names

DURATION GUIDELINES:
- Exterior establishing: 4 seconds
- Interior rooms: 3-3.5 seconds
- Highlight features: 3.5-4 seconds
- Closing: 3-4 seconds
- Total video should be 28-35 seconds

TARGET: Select 10-12 scenes for a 30-second video. You do NOT need to use every photo.`;

export function buildDirectorUserPrompt(
  photos: Array<{
    id: string;
    file_name: string;
    room_type: string;
    aesthetic_score: number;
    depth_rating: string;
    key_features: string[];
  }>
): string {
  const photoList = photos
    .map(
      (p) =>
        `- ID: ${p.id} | File: ${p.file_name} | Room: ${p.room_type} | Aesthetic: ${p.aesthetic_score} | Depth: ${p.depth_rating} | Features: ${p.key_features.join(", ")}`
    )
    .join("\n");

  return `Plan the shot list for this property. Here are the selected photos:

${photoList}

Return a JSON object:
{
  "mood": "modern_luxury",
  "music_tag": "upbeat_elegant",
  "scenes": [
    {
      "scene_number": 1,
      "photo_id": "uuid",
      "room_type": "exterior_front",
      "camera_movement": "orbital_slow",
      "prompt": "Cinematic slow orbital shot...",
      "duration_seconds": 4,
      "provider_preference": null
    }
  ]
}

mood options: modern_luxury, warm_cozy, bright_contemporary, classic_elegant, tropical_resort
music_tag options: upbeat_elegant, calm_ambient, modern_cinematic, warm_acoustic, dramatic_orchestral

Return ONLY the JSON object, no additional text.`;
}
