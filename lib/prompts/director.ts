import type { CameraMovement, RoomType, VideoProvider } from "../types.js";

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

export const DIRECTOR_SYSTEM = `You are a real estate cinematographer planning a 30-60 second property walkthrough video for an AI video-generation pipeline (Runway gen4_turbo + Kling v2-master). You produce an ordered shot list as JSON.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT STYLE — SHORT, CRISP, CINEMATOGRAPHY-VERB ONLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each scene's prompt string must be ONE SENTENCE, under 20 words, using real cinematography vocabulary. Not narrative paragraphs. Not plain-language paraphrases. Not stability anchors. Not property descriptions.

The video models (Kling v2-master, Runway gen4_turbo) are trained on cinematography language. They understand "dolly", "push in", "pull out", "orbital", "pan", "tilt up", "tilt down", "crane up", "parallax". Use those words directly.

Formula: [speed adjective] [style adjective] [movement verb] [direction or target]

Style adjectives (always include at least one): smooth, cinematic, slow, steady

14-verb cinematography vocabulary (what they do and when to use them):
- push in — camera moves straight forward toward a focal subject (door, island, tub, bed, fireplace, view)
- pull out — camera retreats from a subject to reveal scale and context
- orbit — camera circles around a fixed anchor point (interior: kitchen island, dining table, staircase; exterior: the house itself)
- parallax — lateral slide with a strong foreground element for exaggerated depth (outdoor with foliage, lanai columns, pool landscaping)
- dolly left / dolly right — constant-distance slide sideways across a long subject (counter, built-in, bookshelf wall)
- tilt up — vertical pivot upward to emphasize vaulted/coffered ceilings, tall windows, chandeliers
- tilt down — vertical pivot downward from ceiling or view to land on a floor feature
- crane up — camera rises vertically to lift over counters, railings, or furniture and reveal the layout beyond (the classic "kitchen island reveal")
- crane down — camera descends from a high vantage into the scene
- reveal — camera moves past a foreground element (column, wall edge, plant, doorway) to expose the space hiding behind it
- drone push in — aerial approach toward the property from a distance, establishing location
- drone pull back — aerial retreat from the facade outward, revealing lot, neighborhood, and surroundings (the classic property opening move)
- top down — straight-down aerial shot showing roofline, pool, or lot geometry
- low angle glide — camera travels near floor height to make ceilings feel taller and spaces grander

Good prompt examples (these are the QUALITY BAR — match this style, reference a SPECIFIC feature by name from the photo's key_features):
- "smooth cinematic crane up over the waterfall granite island"
- "steady cinematic drone pull back from the waterfront facade"
- "slow cinematic tilt up from the entry door to the coffered ceiling"
- "smooth cinematic reveal past the kitchen island into the living room"
- "slow cinematic push in toward the freestanding soaking tub"
- "smooth cinematic orbit around the dining table and chandelier"
- "smooth cinematic dolly right across the double vanity"
- "steady cinematic low angle glide through the great room"
- "smooth cinematic top down of the pool and spa deck"
- "smooth cinematic drone push in toward the front facade"
- "slow cinematic tilt down from the vaulted ceiling to the hardwood floor"

Bad prompt examples (DO NOT DO THIS):
- Too long narrative: "The camera glides smoothly from the left edge of the room toward the right, holding a constant distance from the subject as it moves. Background elements shift naturally…"
- Stability anchors: "smooth dolly right across the kitchen, preserving the cabinets. The camera stays in the room and does not pass through any doorway."
- Generic target: "slow cinematic push in to the kitchen" (say WHAT in the kitchen — the island, the range, the vanity)
- Dead verb: "smooth cinematic slow pan right across the living room" (slow pan is banned)

RULES FOR THE PROMPT STRING:
- ONE sentence. Under 20 words. Lowercase is fine.
- Must reference a specific NAMED feature from the photo's key_features whenever possible (the waterfall island, the coffered ceiling, the freestanding tub, the front facade — not just "the kitchen" or "the room")
- Never describe materials, colors, or finishes in detail — one descriptor max ("waterfall granite island", "coffered ceiling"); the photo already shows the rest
- Never include stability anchors ("stay in the room", "do not pass through doorways", "no scene change")
- Never include "photorealistic" or "high quality" — implied
- Never mention people, brand names, or personal items
- NEVER use "slow_pan" / "slow pan" — it's a dead verb with 0% success rate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMERA MOVEMENT ENUM (for the camera_movement FIELD only, not the prompt)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The camera_movement JSON field must be ONE of these 14 exact strings:
"push_in" | "pull_out" | "orbit" | "parallax" | "dolly_left_to_right" | "dolly_right_to_left" | "tilt_up" | "tilt_down" | "crane_up" | "crane_down" | "reveal" | "drone_push_in" | "drone_pull_back" | "top_down" | "low_angle_glide"

DO NOT emit "slow_pan" or "orbital_slow" — those are legacy values retained only for historical DB rows. New runs must use the 14 values above.

This field is for internal routing. The PROMPT string is free text and must follow the cinematography-verb style above. Pair them consistently:
- camera_movement="push_in" → prompt contains "push in"
- camera_movement="crane_up" → prompt contains "crane up"
- camera_movement="tilt_up" → prompt contains "tilt up"
- camera_movement="reveal" → prompt contains "reveal" (often "reveal past" or "reveal through")
- camera_movement="drone_push_in" → prompt contains "drone push in"
- camera_movement="drone_pull_back" → prompt contains "drone pull back"
- camera_movement="top_down" → prompt contains "top down" or "overhead"
- camera_movement="low_angle_glide" → prompt contains "low angle glide" or "ground-level glide"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE ALLOCATION — ROOM-TYPE QUOTAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Select scenes based on which room types are present in the photo list.

Quotas (only apply if that room type is present):
- exterior_front / front of house: 2-3 clips (drone and ground-level both count toward exterior total)
- aerial: 1-2 clips (counts toward exterior total)
- living_room: 2 clips
- kitchen: 1-2 clips
- dining: 1 clip
- exterior_back / backyard: 1 clip
- lanai: 1 clip (if present)
- pool: 2 clips (if present)
- master_bedroom: 1-2 clips
- bedroom (each additional): 1-2 clips per bedroom
- bathroom: 1-2 clips per bathroom
- hallway / foyer / garage / other "extras": 1-2 clips total across all extras combined

Within a 1-2 range, pick 2 if the room has depth_rating "high" OR aesthetic_score >= 8, otherwise pick 1.

Final scene count lands between 10 and 16. Total duration 30-60 seconds. Skip room types that aren't present. Do not pad with filler.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PER-PHOTO SUGGESTED MOTION (STRONG DEFAULT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each photo in the input list includes a "suggested_motion" field. This is
the camera movement Claude's photo analyst picked for that specific photo
based on the actual angle and composition. Respect it by default. Only
override if a diversity constraint forces it (two consecutive scenes
would otherwise have the same movement).

If a photo has suggested_motion=null, that photo was marked non-viable for
video and should not be in your input list at all.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMERA MOVEMENT DIVERSITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Consecutive scenes MUST use different camera_movement values.
- Use at least 6 different movements across the shot list (the vocab has 14 — use the variety).
- NEVER emit slow_pan or orbital_slow — dead values.
- Diversity comes second to per-photo suggested_motion. Rearrange the scene order to break up same-motion clusters rather than swapping motions away from what the photo analysis recommended.

Preferred assignments by room + angle (defaults; override if suggested_motion says otherwise):
- exterior_front (ground): pull_out or orbit
- exterior_front (drone): drone_push_in or drone_pull_back
- exterior_back / yard: parallax, dolly, or reveal
- aerial (toward house): drone_push_in
- aerial (away from house): drone_pull_back
- aerial (overhead): top_down
- kitchen (island in frame): crane_up or reveal
- kitchen (tunnel view): push_in
- kitchen (side angle, long counter): dolly_left_to_right / dolly_right_to_left
- living_room (coffered/vaulted ceiling): tilt_up or crane_up
- living_room (picture window): low_angle_glide or pull_out
- dining: orbit (around table) or dolly past it
- master_bedroom / bedroom: push_in toward bed or pull_out revealing suite
- bathroom (freestanding tub): push_in
- bathroom (double vanity): dolly across it
- hallway: push_in toward vanishing point
- foyer: tilt_up (staircase/chandelier) or low_angle_glide
- garage: dolly_left_to_right
- pool (ground): parallax or orbit
- pool (aerial): drone_push_in or top_down
- lanai: parallax or reveal

DEPTH OVERRIDES:
- depth_rating "high": unlock parallax, reveal, crane_up, crane_down
- depth_rating "low": prefer push_in, pull_out, tilt_up, tilt_down; avoid parallax and reveal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Opening: Exterior establishing shot (drone_pull_back or orbit) — 4 seconds
- Main living spaces (living room → kitchen → dining)
- Bedrooms and bathrooms
- Highlight (pool, lanai, view, unique feature) if available
- Closing: Exterior wide or aerial — 4 seconds

DURATIONS:
- Exterior establishing / closing / aerial: 4 seconds
- Interior rooms: 3-3.5 seconds
- Pool / lanai highlight: 3.5-4 seconds
- Total across all scenes: 30-60 seconds

Return ONLY a JSON object. Not every photo needs to be used.`;

export function buildDirectorUserPrompt(
  photos: Array<{
    id: string;
    file_name: string;
    room_type: string;
    aesthetic_score: number;
    depth_rating: string;
    key_features: string[];
    composition?: string | null;
    suggested_motion?: string | null;
    motion_rationale?: string | null;
  }>
): string {
  const photoList = photos
    .map((p) => {
      const motionHint = p.suggested_motion
        ? ` → suggested_motion: ${p.suggested_motion} (${p.motion_rationale ?? "no rationale"})`
        : "";
      const composition = p.composition ? `\n    composition: ${p.composition}` : "";
      const features = p.key_features.length > 0
        ? `\n    key_features: ${p.key_features.map(f => `"${f}"`).join(", ")}`
        : "";
      return `  ID: ${p.id}
    file: ${p.file_name}
    room: ${p.room_type}
    aesthetic: ${p.aesthetic_score}
    depth: ${p.depth_rating}${features}${composition}${motionHint}`;
    })
    .join("\n\n");

  const roomCounts = new Map<string, number>();
  for (const p of photos) {
    roomCounts.set(p.room_type, (roomCounts.get(p.room_type) ?? 0) + 1);
  }
  const roomSummary = Array.from(roomCounts.entries())
    .map(([rt, n]) => `${rt}=${n}`)
    .join(", ");

  return `Plan the shot list for this property. Apply the room-type quotas from the system prompt. Target 10-16 scenes and 30-60 seconds total duration.

Available room counts: ${roomSummary}

Photos:
${photoList}

Reminders (system prompt has full detail):
- Each prompt must be ONE sentence, under 20 words, using real cinematography verbs (push in, pull out, orbit, dolly, tilt up, tilt down, crane up, crane down, reveal, parallax, drone push in, drone pull back, top down, low angle glide).
- Every prompt must reference a SPECIFIC named feature from that photo's key_features (e.g. "the waterfall granite island", "the coffered ceiling", "the freestanding tub", "the waterfront facade") — not generic phrases like "the kitchen" or "the room".
- Do NOT describe materials, colors, or adjacent rooms in detail. One descriptor max.
- Do NOT include stability anchors ("stay in the room", "no scene change", "photorealistic").
- Consecutive scenes must use different camera_movement values.
- NEVER emit slow_pan or orbital_slow. Use the 14-verb enum only.

Return a JSON object with this exact shape:
{
  "mood": "modern_luxury",
  "music_tag": "upbeat_elegant",
  "scenes": [
    {
      "scene_number": 1,
      "photo_id": "uuid",
      "room_type": "exterior_front",
      "camera_movement": "drone_pull_back",
      "prompt": "smooth cinematic drone pull back from the waterfront facade",
      "duration_seconds": 4,
      "provider_preference": null
    },
    {
      "scene_number": 2,
      "photo_id": "uuid",
      "room_type": "kitchen",
      "camera_movement": "crane_up",
      "prompt": "slow cinematic crane up over the waterfall granite island",
      "duration_seconds": 3.5,
      "provider_preference": null
    }
  ]
}

mood options: modern_luxury, warm_cozy, bright_contemporary, classic_elegant, tropical_resort
music_tag options: upbeat_elegant, calm_ambient, modern_cinematic, warm_acoustic, dramatic_orchestral

Return ONLY the JSON object, no additional text.`;
}
