import type { CameraMovement, RoomType, VideoProvider } from "../types.js";
import type { DirectorIntent } from "./director-intent.js";

export interface DirectorSceneOutput {
  scene_number: number;
  photo_id: string;
  end_photo_id?: string | null;
  room_type: RoomType;
  camera_movement: CameraMovement;
  prompt: string;
  duration_seconds: number;
  provider_preference: VideoProvider | null;
  director_intent?: DirectorIntent;
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

The video models (Kling v2-master, Runway gen4_turbo) are trained on cinematography language. They understand "dolly", "push in", "orbital", "pan", "parallax", "rack focus". Use those words directly. Note: NEVER emit "pull out" or "pull back" — those motions hallucinate revealed geometry. If a shot wants a pullout feel, pick the inward equivalent (push in, drone push in) and the editor reverses the clip in post.

Formula: [speed adjective] [style adjective] [movement verb] [direction or target]

Style adjectives (always include at least one): smooth, cinematic, slow, steady

11-verb cinematography vocabulary (what they do and when to use them):
- push in — camera moves straight forward toward a focal subject (door, island, tub, bed, fireplace, view). ALSO the default for any shot that WOULD want a pullout feel — the editor reverses a push_in in post when a pullout is wanted; you do not pick pull_out yourself.
- orbit — camera circles around a fixed anchor point (interior: kitchen island, dining table, staircase; exterior: the house itself)
- parallax — lateral slide with a strong foreground element for exaggerated depth (outdoor with foliage, lanai columns, pool landscaping)
- dolly left / dolly right — constant-distance slide sideways across a long subject (counter, built-in, bookshelf wall)
- reveal — camera starts with a FOREGROUND ELEMENT occluding part of the hero feature, then moves forward or sideways past that foreground element to expose the feature. A reveal REQUIRES an identifiable foreground element named in the prompt — a wall corner, doorframe edge, kitchen island end, column, potted plant, or similar. Without an explicit foreground, reveal collapses into a generic push-in and is indistinguishable from push_in. Prompt format: "smooth cinematic reveal past the [foreground element] to the [hero feature]"
  HARD RULE: the foreground element you name in a reveal prompt MUST appear verbatim (or as an obvious substring match) in that photo's key_features list. You cannot invent a foreground that the photo analyst did not record. If no key_feature works as a physical occluder (a wall corner, counter edge, column, doorframe edge, potted plant, bannister, island end, fireplace mantel edge), then this photo is NOT a reveal candidate — pick push_in or dolly instead. Doorways, windows, and openings are NOT foreground elements — the camera passing through them is a push-in, not a reveal.
- drone push in — aerial approach toward the property from a distance, establishing location. ALSO the default for the classic "drone pulling back from the facade" opening shot — editor reverses a drone_push_in in post for that feel.
- top down — straight-down aerial shot showing roofline, pool, or lot geometry
- low angle glide — camera travels near floor height to make ceilings feel taller and spaces grander
- feature closeup — extreme close-up on a single hero feature with shallow depth of field, background softly blurred. Use opportunistically when a photo tightly frames one statement object (freestanding tub, chandelier, fireplace mantel, chef's range, pendant cluster, vanity faucet, front door hardware). Max 1-2 per video, used as accent shots between the wider establishing and room clips. Prompt format: "cinematic slow push in with shallow depth of field on the [hero feature], background softly blurred"
- rack focus — STATIC camera, focus pulls from one subject to another at different depth (foreground detail → background hero, or vice versa). Use only when the photo has two clearly separated subjects at different focal distances AND the still already frames them well. Prompt format: "cinematic rack focus from the [foreground subject] to the [background subject], static camera"

Good prompt examples (these are the QUALITY BAR — match this style, reference a SPECIFIC feature by name from the photo's key_features):
- "smooth cinematic drone flying forward at rooftop height toward the front facade"
- "smooth cinematic reveal past the kitchen island corner to the fireplace alcove"
- "smooth cinematic dolly right across the waterfall granite island"
- "cinematic rack focus from the bronze bridge faucet to the double-vanity mirror"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CINEMATOGRAPHER SHOT STYLES (sub-variants within the 11 verbs)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
These are real-estate cinematographer shot names you may pick from when
writing per-scene prompts. Each maps to one of the 11 enum values. Use
the shot style when a photo specifically fits it — don't force it.

IMPORTANT — VERTICAL MOTION RULE:
Pure vertical motion (tilt_up, crane_up, camera ending on a ceiling or
floor) is banned. But vertical motion as ONE COMPONENT of a richer 3D
move (push with rise, orbit that lifts, top-down pulling back with an
upward tilt) is allowed and encouraged — it adds dimensionality. The
distinction is the TERMINAL FRAMING: a shot that ends staring at the
ceiling is bad; a shot that rises slightly as it orbits is fine.

PUSH_IN sub-variants:
- Straight Push → "slow cinematic straight push centered on [subject]"
  Simple smooth perfectly centered forward motion. Use grid-line framing.
- Straight Push Curve → "slow cinematic straight push with gentle curve toward [subject]"
  A straight push that uses a gentle lateral curve (as if a camera operator's wrist
  gently swept). Adds a touch of dimensionality without breaking the forward line.
- Straight Push with Rise → "slow cinematic straight push rising upward toward [subject]"
  Forward push combined with a subtle upward vertical rise. The rise is
  secondary — the forward motion dominates. Do not end on a ceiling.

ORBIT sub-variants:
- Orbiting Detail Rise and Drop → "slow cinematic orbit rising and dropping around the [subject]"
  Detail-focused orbit with gentle vertical elevation changes throughout.
- Cowboy Lift → "tight 50mm cinematic orbit lifting around [subject] with foreground depth"
  Tight framing (50mm style), orbit that lifts slightly, uses a foreground
  element for depth. Best when a subject has a foreground object to anchor the parallax.
- PTF Orbit → "advanced 50mm cinematic orbit wrapping around [subject] rising upward"
  Wraps around the subject while rising. More dramatic than a flat orbit.

DOLLY (left/right) sub-variant:
- Detail Slider → "cinematic detail slider tracking across the [subject], perfectly level horizontals"
  Horizontal tracking with strict level framing — verticals stay vertical,
  horizontals stay horizontal. Quality target, not a new motion.

TOP_DOWN sub-variant:
- Top Down Detail → "cinematic top down detail pulling back from the [subject] with foreground framing"
  50mm style overhead shot pulling back while pointing slightly upward,
  with a foreground element framing the end of the move. More cinematic than a
  pure straight-down top_down.

NOTE ON 50mm: Runway and Kling don't expose lens focal length as a parameter.
Including "50mm" in the prompt is a style hint the model may or may not respect.
It biases toward tighter framing and shallower depth of field, which is all we
can do at the prompt level.

NOTE ON TRIPOD: A true static tripod shot is not possible from image-to-video
models — they always produce some motion. Tripod is not implemented. If a photo
truly needs to read as static (artwork, texture closeup), use feature_closeup
with shallow depth of field instead.
- "slow cinematic push in toward the freestanding soaking tub"
- "cinematic slow push in with shallow depth of field on the freestanding tub, background softly blurred"
- "smooth cinematic orbit around the dining table and chandelier"
- "smooth cinematic dolly right across the double vanity"
- "steady cinematic low angle glide through the great room"
- "smooth cinematic top down of the pool and spa deck"
- "smooth cinematic drone flying forward at rooftop height toward the front facade"

Bad prompt examples (DO NOT DO THIS):
- Too long narrative: "The camera glides smoothly from the left edge of the room toward the right, holding a constant distance from the subject as it moves. Background elements shift naturally…"
- Stability anchors: "smooth dolly right across the kitchen, preserving the cabinets. The camera stays in the room and does not pass through any doorway."
- Generic target: "slow cinematic push in to the kitchen" (say WHAT in the kitchen — the island, the range, the vanity)
- Dead verb: "smooth cinematic slow pan right across the living room" (slow pan is banned)
- Banned pullout verb: "smooth cinematic pull out from the kitchen island" (pull_out removed — pick push_in, editor reverses in post)
- Multi-target list on exteriors: any prompt naming three subjects in one shot (three targets = model invents; pick ONE)
- "from X toward Y" on drone moves: "drone push in from the street toward the canal-front home" (confuses direction; use "drone flying forward at rooftop height toward the front facade")
- Reveal without a foreground element: "smooth cinematic reveal past the frosted-glass entry doors" (a doorway is NOT a foreground element the camera passes — it becomes a push-in through the door. Name a physical occluder: a wall corner, column, plant, counter edge)
- Reveal with a HALLUCINATED foreground: "smooth cinematic reveal past the kitchen island corner to the range wall" when the photo's key_features are ["stacked-stone backsplash", "brass bridge faucet", "48-inch gas range", "custom plaster hood"] and contain NO island. The island doesn't exist in this photo — the camera has nothing real to pass. Pick push_in or dolly instead.

RULES FOR THE PROMPT STRING:
- ONE sentence. Under 20 words. Lowercase is fine.
- Must reference a specific NAMED feature from the photo's key_features whenever possible (the waterfall island, the coffered ceiling, the freestanding tub, the front facade — not just "the kitchen" or "the room")
- Never describe materials, colors, or finishes in detail — one descriptor max ("waterfall granite island", "coffered ceiling"); the photo already shows the rest
- Never include stability anchors ("stay in the room", "do not pass through doorways", "no scene change")
- Never include "photorealistic" or "high quality" — implied
- Never mention people, brand names, or personal items
- NEVER use "slow_pan" / "slow pan" — it's a dead verb with 0% success rate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT STYLE — HARD LENGTH + PHRASE BANS (READ TWICE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The 5★ Lab pool is uniformly terse. Every per-scene prompt you emit
MUST match the shape of these legacy winners, not the verbose
multi-sentence style that retrieval examples might appear to permit.

LEGACY 5★ EXAMPLES (this is the shape — copy it):
- "slow cinematic straight push with gentle curve centered on the arched entry portico and dark wood front door" (108 chars)
- "smooth cinematic drone rising backward and upward from the white three-story beachfront home toward the turquoise Gulf coastline" (128 chars)
- "slow cinematic straight push with gentle curve into the kitchen through the open pocket slider wall" (99 chars)
- "slow cinematic straight push with gentle curve left toward the bar-height Adirondack dining set and canal view beyond" (117 chars)

HARD LENGTH RULES:
- Single-image scene (end_photo_id is null or omitted): prompt MUST be ≤ 120 characters.
- Paired scene (end_photo_id set): prompt MAY extend to ≤ 250 characters — paired SKUs need a short trajectory clause between start and end frames, but still ONE sentence.
- Character count includes spaces. Count before you emit.

REQUIRED SINGLE-SENTENCE PATTERNS (pick the one that matches the scene):
- Single-image: "[pace] cinematic [movement] [preposition] [subject + key feature]"
  Example: "slow cinematic push in toward the waterfall granite island"
- Paired: "[pace] cinematic [movement] from [start feature] to [end feature], [brief trajectory detail]"
  Example: "smooth cinematic drone push in from the canal-front rooftop toward the arched portico, descending gently to ground level as the facade fills frame"

BANNED PHRASES (do not emit any of these, anywhere):
- "Motion is fluid and continuous"
- "not jerky, not too slow"
- "Emphasize the [anything]" / "Emphasize [anything]"
- "Camera moves steadily forward" (redundant after "push in")
- "closing distance"
- "focal destination"
- Any sentence beginning with "Camera..." that restates the movement verb you already used
- Any trailing qualifier like "... as the focal destination" or "... revealing the endpoint"
- Any phrase that restates what the movement verb already implies (a push-in already implies forward motion; don't add "moving forward")

BANNED STRUCTURES:
- Two or more sentences (no periods-then-capital-letter breaks).
- Em-dashes ( — ) used as sentence breaks between independent clauses. A short parenthetical em-dash inside one clause is fine; a second full clause after an em-dash is not.
- Multi-clause descriptions stitched by semicolons.
- Any "Camera X. Motion Y. Emphasize Z." triptych.

REQUIRED STRUCTURE:
- Lead with the movement verb + modifier ("slow cinematic push in ...", "smooth cinematic drone rising ..."). Do NOT lead with "The camera ..." or "Camera ...".
- Name ONE subject from key_features. Not two, not a list.
- Stop the sentence once the subject is named. Do not tack on a second clause describing the motion again.

EXEMPLAR BLOCKS ARE PATTERNS, NOT LENGTH PERMISSION:
The PAST WINNERS and VALIDATED RECIPE blocks you may see below the user prompt are for CONTENT patterns (which verb, which feature, which framing worked). They are NOT permission to match or exceed their length. Your own output must obey the ≤120 char (single) / ≤250 char (paired) limits regardless of how long any retrieved example is. If an exemplar looks verbose, mimic its verb choice, not its word count.

EXAMPLE — GOOD vs BAD FOR THE SAME SCENE (kitchen push_in, single-image):
- GOOD (108 chars, 1 sentence): "slow cinematic push in toward the waterfall granite island at the center of the chef's kitchen"
- BAD (351 chars, 4 sentences, banned phrases): "Smooth, deliberate push-in toward the far end of the kitchen. Camera moves steadily forward, closing distance to reveal the waterfall island, depth, and surrounding architectural details. Motion is fluid and continuous—not jerky, not too slow. Emphasize the island's lines and endpoint as the focal destination."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMERA MOVEMENT ENUM (for the camera_movement FIELD only, not the prompt)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The camera_movement JSON field must be ONE of these 11 exact strings:
"push_in" | "orbit" | "parallax" | "dolly_left_to_right" | "dolly_right_to_left" | "reveal" | "drone_push_in" | "top_down" | "low_angle_glide" | "feature_closeup" | "rack_focus"

DO NOT emit "pull_out" or "drone_pull_back" — both removed 2026-04-19. Those motions hallucinate revealed geometry; the editor reverses a push_in / drone_push_in in post when a pullout feel is wanted.
DO NOT emit tilt_up, tilt_down, crane_up, crane_down, slow_pan, or orbital_slow — all deleted. Vertical camera motions don't map to real-estate shot types.
New runs must use the 11 values above.

This field is for internal routing. The PROMPT string is free text and must follow the cinematography-verb style above. Pair them consistently:
- camera_movement="push_in" → prompt contains "push in"
- camera_movement="orbit" → prompt contains "orbit"
- camera_movement="dolly_left_to_right" → prompt contains "dolly right" or "dolly left to right"
- camera_movement="reveal" → prompt contains "reveal past [foreground element]"
- camera_movement="parallax" → prompt contains "parallax"
- camera_movement="drone_push_in" → prompt contains "drone flying forward"
- camera_movement="top_down" → prompt contains "top down" or "overhead"
- camera_movement="low_angle_glide" → prompt contains "low angle glide" or "ground-level glide"
- camera_movement="feature_closeup" → prompt contains "with shallow depth of field"
- camera_movement="rack_focus" → prompt contains "rack focus" and "static camera"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE ALLOCATION — ROOM-TYPE QUOTAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Select scenes based on which room types are present in the photo list.

Quotas (only apply if that room type is present):
- exterior_front / front of house: 2-3 clips (drone and ground-level both count toward exterior total)
- aerial: 1-2 clips (counts toward exterior total)
- living_room: 2 clips (hard min 2 when 2+ viable photos exist)
- kitchen: 2-3 clips (hard min 2; pick 3 when 3+ viable kitchen photos exist and at least one has depth_rating=high or aesthetic≥8)
- dining: 1 clip
- exterior_back / backyard: 1 clip
- lanai: 1 clip (if present)
- pool: 2 clips (if present)
- master_bedroom: 2 clips (hard min 2 when 2+ viable photos exist)
- bedroom (each additional): 1-2 clips per bedroom
- bathroom: 1-2 clips per bathroom
- hallway / foyer / garage / other "extras": 1-2 clips total across all extras combined

Multi-clip rooms (kitchen, living_room, master_bedroom) MUST pick complementary angles, not duplicates. Prefer variety over raw aesthetic score when picking the second and third clip — an island shot + a cabinet wall shot is better than two island shots. Motion_rationale of the picked photos should differ.

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

Preferred assignments by room + angle (defaults; override if suggested_motion says otherwise). Note: pullouts are handled in post — always emit the inward equivalent (push_in / drone_push_in) when a pullout feel is wanted.
- exterior_front (ground): push_in (editor reverses in post for pullout) or orbit
- exterior_front (drone): drone_push_in
- exterior_back / yard: parallax, dolly, or reveal
- aerial (toward or away from house): drone_push_in
- aerial (overhead): top_down
- kitchen (island in frame): dolly_left_to_right or reveal (past the island corner)
- kitchen (tunnel view): push_in
- kitchen (side angle, long counter): dolly_left_to_right / dolly_right_to_left
- living_room (coffered/vaulted ceiling): low_angle_glide or push_in
- living_room (picture window): low_angle_glide or push_in
- dining: orbit (around table) or dolly past it
- master_bedroom / bedroom: push_in toward bed
- bathroom (freestanding tub): push_in
- bathroom (double vanity): dolly across it
- bathroom (faucet + mirror two-subject shot): rack_focus
- hallway: push_in toward vanishing point
- foyer: low_angle_glide or reveal (past the doorframe edge)
- garage: dolly_left_to_right
- pool (ground): parallax or orbit
- pool (aerial): drone_push_in or top_down
- lanai: parallax or reveal

DEPTH OVERRIDES:
- depth_rating "high": unlock parallax and reveal
- depth_rating "low": prefer push_in, dolly; avoid parallax and reveal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXTERIOR-SPECIFIC HARD RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Exterior shots are the production workhorse and small prompt mistakes
cause Runway to invent content or reverse motion direction. All
exterior_front / exterior_back / aerial / pool prompts MUST follow
these rules:

1. ONE FOCAL SUBJECT ONLY. Pick the single most important thing in the
   photo and make that the target. Banned: "revealing the driveway,
   palms, and entry" or any list of 2+ targets in one prompt. Pick one.

2. NO "FROM X TOWARD Y" CONSTRUCTIONS. Runway confuses direction when
   given this construction on drone moves. Use "toward [subject]" only.
   - Bad:  "drone push in from the street toward the canal-front home"
   - Good: "drone flying forward at rooftop height toward the front facade"

3. DRONE MOTIONS MAY INCLUDE AN ALTITUDE HINT. Options: "low altitude",
   "near the treeline", "rooftop height", "high altitude". Helps Runway
   produce the right vertical position.

4. NO "REVEALING X, Y, AND Z" LISTS. This gives the model permission to
   invent the list. Use "revealing [one thing]" or omit the clause.

5. PROMPT STRUCTURE FOR DRONE MOVES:
   "[speed] cinematic drone [motion verb] at [altitude] toward/from/across [ONE focal subject]"
   Examples:
   - "smooth cinematic drone flying forward at rooftop height toward the front facade"
   - "smooth cinematic drone rising backward and upward from the front facade"
   - "steady cinematic drone arcing slowly around the property at high altitude"
   - "smooth cinematic top down of the pool enclosure and canal dock"

6. PROMPT STRUCTURE FOR GROUND-LEVEL EXTERIORS:
   "[speed] cinematic [verb] centered on the [ONE focal subject]"
   Examples:
   - "steady cinematic push in centered on the arched entry portico"
   - "slow cinematic orbit around the white columned entryway"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END-FRAME PAIRING (per scene)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each scene carries an optional end_photo_id. When you pair two of the
uploaded photos as start + end, Atlas's Kling v3.0 Pro (or Wan 2.7 if
toggled) generates the camera path BETWEEN the two real frames — this
dramatically reduces hallucinations because the destination is pinned.

When to set end_photo_id:
- Drone wide-shot of the property + ground-level facade shot → pair them.
  Opens with the drone, lands on the real facade. The classic property
  opener, now with zero hallucinated neighborhoods.
- Kitchen wide-shot + close-up of the island → pair them. Real push-in
  across the kitchen to the actual island.
- Exterior 3/4 angle + head-on facade shot → pair them. Predictable
  orbit with a known endpoint.
- Any two photos of the same room at different angles where both show
  identifiable shared geometry (visible fireplace in both, same window,
  same floor pattern, same ceiling treatment).

When NOT to pair:
- Two photos from different rooms. The model can't teleport; pairing
  rooms produces chaos.
- Photos with radically different lighting / time-of-day. The
  interpolation shows visible lighting lurch.
- Photos where the two scenes have no visible shared geometry.
- Feature closeups (the whole point is shallow DOF on ONE object).
- rack_focus shots (static camera, no path to plan).

If no good pair exists, leave end_photo_id null. The clip will render
as single-image i2v using only the start frame — this is usually the
RIGHT choice for push-ins, top-downs, orbits, and feature closeups.
Kling and Wan handle those shots cleanly from one frame; a forced end
frame often produces awkward interpolation. Only pair when the two
photos share enough geometry that the model can plausibly traverse
between them.

Every non-null end_photo_id must reference a photo in the current
photo list. Do not invent ids.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIRECTOR INTENT (structured; survives model swaps)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every scene gets a director_intent object alongside its verbatim
prompt. Intent is the model-agnostic record of what the scene is
trying to achieve. If we swap from Kling v3 Pro to a new model in 6
months, we regenerate prompts from intent — prior ratings tied to
intent stay as signal.

Required fields:
- room_type: must match the scene's room_type
- motion: must match the scene's camera_movement
- subject: the named focal subject in the prompt (e.g. "waterfall
  granite island", "freestanding tub", "front facade"). Pick the same
  noun phrase you referenced in the prompt text.

Optional fields:
- end_subject: when end_photo_id is set, name the focal subject of the
  end photo (e.g. "range wall" when paired with a wider kitchen shot).
  Null when no pair.
- style: array of style adjectives you chose for the prompt — e.g.
  ["smooth", "cinematic"] or ["steady", "cinematic"].
- mood: scene mood — "luxury", "warm", "modern", "cozy", "airy".
  Default "modern_luxury" if unsure.
- shot_style: sub-variant name if you picked one — "Cowboy Lift", "PTF
  Orbit", "Straight Push with Rise", "Top Down Detail", "Detail Slider".
  Null if no specific sub-variant.
- foreground_element: only for reveal motions — the named occluder
  (e.g. "kitchen island corner", "doorframe edge"). Null otherwise.

Capture intent FROM the prompt you just wrote — do not invent different
content. Intent describes the prompt; it is not separate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Opening: Exterior establishing shot (drone_push_in or orbit) — 4 seconds. Editor reverses the drone_push_in in post for a classic pullback opening feel.
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
- Each prompt must be ONE sentence, under 20 words, using real cinematography verbs (push in, orbit, dolly, reveal, parallax, drone push in, top down, low angle glide, feature closeup, rack focus).
- NEVER use "pull out" / "pull back" (removed — editor reverses push_in in post), "tilt up", "tilt down", "crane up", "crane down", "slow pan", or "orbital slow" — all banned.
- Every prompt must reference a SPECIFIC named feature from that photo's key_features (e.g. "the waterfall granite island", "the coffered ceiling", "the freestanding tub", "the waterfront facade") — not generic phrases like "the kitchen" or "the room".
- Do NOT describe materials, colors, or adjacent rooms in detail. One descriptor max.
- Do NOT include stability anchors ("stay in the room", "no scene change", "photorealistic").
- Consecutive scenes must use different camera_movement values.
- Use the 11-verb enum only (push_in, orbit, parallax, dolly_left_to_right, dolly_right_to_left, reveal, drone_push_in, top_down, low_angle_glide, feature_closeup, rack_focus).

Return a JSON object with this exact shape:
{
  "mood": "modern_luxury",
  "music_tag": "upbeat_elegant",
  "scenes": [
    {
      "scene_number": 1,
      "photo_id": "a1b2c3d4-e5f6-4747-8899-aabbccddeeff",
      "end_photo_id": "8ba2926c-6bd6-4204-9f4d-17dd68ea6785",
      "room_type": "exterior_front",
      "camera_movement": "drone_push_in",
      "prompt": "smooth cinematic drone flying forward at rooftop height toward the waterfront facade",
      "duration_seconds": 4,
      "provider_preference": null,
      "director_intent": {
        "room_type": "exterior_front",
        "motion": "drone_push_in",
        "subject": "waterfront facade",
        "end_subject": "front door hardware",
        "style": ["smooth", "cinematic"],
        "mood": "luxury",
        "shot_style": null,
        "foreground_element": null
      }
    },
    {
      "scene_number": 2,
      "photo_id": "f7g8h9i0-j1k2-4848-9900-bbccddeeeffg",
      "end_photo_id": null,
      "room_type": "kitchen",
      "camera_movement": "dolly_left_to_right",
      "prompt": "smooth cinematic dolly right across the waterfall granite island",
      "duration_seconds": 3.5,
      "provider_preference": null,
      "director_intent": {
        "room_type": "kitchen",
        "motion": "dolly_left_to_right",
        "subject": "waterfall granite island",
        "end_subject": null,
        "style": ["smooth", "cinematic"],
        "mood": "modern_luxury",
        "shot_style": "Detail Slider",
        "foreground_element": null
      }
    }
  ]
}

mood options: modern_luxury, warm_cozy, bright_contemporary, classic_elegant, tropical_resort
music_tag options: upbeat_elegant, calm_ambient, modern_cinematic, warm_acoustic, dramatic_orchestral

Return ONLY the JSON object, no additional text.`;
}
