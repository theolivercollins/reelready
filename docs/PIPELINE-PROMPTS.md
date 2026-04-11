# Pipeline Prompts

The pipeline uses three LLM prompts, all sent to Claude Sonnet (`claude-sonnet-4-6-20250514`). Each prompt is defined in `lib/prompts/` as a system prompt constant plus a user prompt builder function.

---

## 1. Photo Analysis Prompt

**File:** `lib/prompts/photo-analysis.ts`

**Purpose:** Evaluate each property photo for its suitability as source material for AI video generation. The analysis determines which photos get selected and how they are animated.

**When it runs:** Stage 2 (Analysis). Photos are sent in batches of 8 images per API call to balance cost and context.

**What it evaluates:**

| Field | Scale | Description |
|---|---|---|
| quality_score | 1-10 | Technical quality: sharpness, exposure, white balance, noise, staging |
| aesthetic_score | 1-10 | Cinematic potential when animated: composition, depth, lighting, visual storytelling |
| depth_rating | high/medium/low | Amount of 3D depth for parallax potential |
| room_type | enum | Classification into one of 14 room types |
| key_features | string[] | 2-4 notable visible features |
| suggested_discard | boolean | Whether to exclude from video |
| discard_reason | string | Why (if discarding) |

**Discard criteria:**
- Too dark or overexposed
- Blurry or out of focus
- Extreme fisheye/wide-angle distortion
- Shows clutter, people, or construction
- Duplicate angle of a better photo
- Tight/cramped space that will distort when animated

**Rating philosophy:** The prompt instructs the LLM to rate conservatively -- an 8+ should be genuinely impressive. The aesthetic_score is explicitly about how good the *animated* result will look, not just the static photo. This biases selection toward photos with strong compositional lines and depth, which produce better AI video.

### System Prompt

```
You are a real estate photography analyst specializing in AI video generation.

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

IMPORTANT: Return a JSON array with one object per image, in the same order as the images provided.
```

### User Prompt (built by `buildAnalysisUserPrompt`)

```
Analyze the following {photoCount} property photos for AI video generation suitability. Return a JSON array of {photoCount} objects matching the schema:

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

Return ONLY the JSON array, no additional text.
```

The user message contains the images as base64-encoded `image` content blocks followed by this text prompt.

---

## 2. Director Prompt

**File:** `lib/prompts/director.ts`

**Purpose:** Plan the shot list for a 30-second property walkthrough video. Given the selected photos with their analysis metadata, the director decides scene order, camera movements, prompts for each video generation, and duration.

**When it runs:** Stage 3 (Scripting). A single LLM call with all selected photo metadata (no images -- just the structured data from Stage 2).

**Shot planning logic:**

The prompt encodes a specific cinematic structure:
1. Opening: Exterior establishing shot (orbital or slow dolly) -- 4 seconds
2. Transition into interior through front-facing areas
3. Flow through main living spaces (living room -> kitchen -> dining)
4. Bedrooms and bathrooms
5. Highlight shot (pool, view, unique feature) -- if available
6. Closing: Exterior wide or aerial -- 3-4 seconds

**Camera movement rules per room type:**

| Room Type | Movement | Reasoning |
|---|---|---|
| exterior_front / exterior_back | orbital_slow | Rotation shows the full facade |
| aerial | orbital_slow or slow_pan | Wide establishing context |
| kitchen | dolly_left_to_right | Follows the counter/island line |
| living_room | dolly_right_to_left or slow_pan | Emphasizes depth and openness |
| master_bedroom | dolly_right_to_left | Bed as anchor point |
| bedroom | slow_pan | Simple, clean movement |
| bathroom | slow_pan | Compact spaces need gentle movement |
| dining | dolly_left_to_right | Table as anchor |
| pool | parallax | Foreground foliage, background water |
| hallway / foyer | push_in | Creates depth, draws viewer forward |
| garage | slow_pan | Simple |

**Depth-based overrides:**
- `depth_rating: "high"` -> prefer parallax if room type allows it
- `depth_rating: "low"` -> ONLY use slow_pan (less 3D = more warping with complex movements)

**Prompt writing rules for each scene:**
- Start with "Cinematic" and the camera movement description
- Include specific architectural/design details visible in the photo
- Mention lighting conditions
- End with "smooth steady camera movement, photorealistic"
- Keep under 60 words
- Never mention people, personal items, or brand names

**Duration guidelines:**
- Exterior establishing: 4 seconds
- Interior rooms: 3-3.5 seconds
- Highlight features: 3.5-4 seconds
- Closing: 3-4 seconds
- Total: 28-35 seconds

### System Prompt

```
You are a real estate cinematographer planning a 30-second property walkthrough video. You receive a set of analyzed property photos with metadata and must create an ordered shot list.

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

TARGET: Select 10-12 scenes for a 30-second video. You do NOT need to use every photo.
```

### User Prompt (built by `buildDirectorUserPrompt`)

```
Plan the shot list for this property. Here are the selected photos:

- ID: uuid | File: kitchen_1.jpg | Room: kitchen | Aesthetic: 8.0 | Depth: high | Features: granite island, pendant lighting
- ID: uuid | File: exterior_front.jpg | Room: exterior_front | Aesthetic: 9.0 | Depth: high | Features: palm trees, Mediterranean facade
...

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

Return ONLY the JSON object, no additional text.
```

### Output Interface

```typescript
interface DirectorOutput {
  mood: string;               // Overall video mood
  music_tag: string;          // Music track category
  scenes: DirectorSceneOutput[];
}

interface DirectorSceneOutput {
  scene_number: number;
  photo_id: string;
  room_type: RoomType;
  camera_movement: CameraMovement;
  prompt: string;
  duration_seconds: number;
  provider_preference: VideoProvider | null;
}
```

---

## 3. QC Evaluator Prompt

**File:** `lib/prompts/qc-evaluator.ts`

**Purpose:** Evaluate AI-generated video clips for production quality. Analyzes 5 extracted frames to determine whether a clip is good enough to ship.

**When it runs:** Stage 5 (QC), after each clip is generated. Currently not active -- all clips are auto-passed. Designed to run when frame extraction is available.

**Evaluation criteria (in priority order):**

1. **Architectural Integrity** (most important)
   - Walls, doors, windows must remain straight and stable
   - Counters, cabinets, furniture should not warp or bend
   - Ceiling lines must stay level
   - Any "melting" or "breathing" of solid structures is a hard reject

2. **Motion Quality**
   - Camera movement should be smooth and consistent
   - No sudden jumps, stutters, or direction changes
   - Movement should match what was requested

3. **Lighting Consistency**
   - Lighting should remain stable throughout
   - No sudden brightness changes or color shifts
   - No flickering or strobing

4. **Visual Artifacts**
   - No smearing, ghosting, texture loss
   - No objects appearing/disappearing
   - No face distortion on artwork in the scene
   - No black or corrupted frames

**Verdict rules:**

| Verdict | Criteria | Action |
|---|---|---|
| hard_reject | Major warping/melting, corruption, wrong movement, severe flickering | Retry with different seed or provider |
| soft_reject | Minor warping, excessive blur, slight lighting issues, minor artifacts | Retry with modified prompt |
| pass | Architecture intact, smooth movement, consistent lighting, no artifacts | Ship it |

**Confidence scoring:**
- 0.0-0.5: Very uncertain, borderline
- 0.5-0.75: Somewhat confident
- 0.75-0.9: Confident
- 0.9-1.0: Very confident

### System Prompt

```
You are a quality control evaluator for AI-generated real estate video clips. You analyze frames extracted from a short video clip and determine whether the clip meets production quality standards.

EVALUATION CRITERIA:

1. Architectural Integrity (most important)
   - Walls, doors, windows must remain straight and stable
   - Counters, cabinets, and furniture should not warp or bend
   - Ceiling lines should stay level
   - Any "melting" or "breathing" of solid structures is a hard reject

2. Motion Quality
   - Camera movement should be smooth and consistent
   - No sudden jumps, stutters, or direction changes
   - Movement should match what was requested (if a dolly was requested, it should move linearly)

3. Lighting Consistency
   - Lighting should remain stable throughout the clip
   - No sudden brightness changes or color shifts between frames
   - No flickering or strobing effects

4. Visual Artifacts
   - No obvious AI artifacts (smearing, ghosting, texture loss)
   - No objects appearing or disappearing mid-clip
   - No face distortion on any photos/artwork visible in the scene
   - No black frames, corrupted frames, or partial renders

VERDICT RULES:

HARD REJECT (verdict: "hard_reject") — auto-retry with different seed/provider:
- Major architectural warping or melting
- Visible corruption or black frames
- Completely wrong camera movement
- Severe flickering or strobing

SOFT REJECT (verdict: "soft_reject") — retry with modified prompt:
- Minor warping that's noticeable but not severe
- Excessive motion blur beyond cinematic DOF
- Slight lighting inconsistency
- Minor artifacts that don't ruin the clip but are distracting

PASS (verdict: "pass"):
- Architecture maintains structural integrity across all frames
- Camera movement is smooth and matches the requested type
- Consistent lighting throughout
- No distracting artifacts
- Clip looks professional and cinematic

CONFIDENCE:
- 0.0–0.5: Very uncertain, borderline cases
- 0.5–0.75: Somewhat confident
- 0.75–0.9: Confident
- 0.9–1.0: Very confident in the verdict

Return a single JSON object with your assessment.
```

### User Prompt (built by `buildQCUserPrompt`)

```
Evaluate this AI-generated real estate video clip. These are 5 evenly-spaced frames extracted from a {requestedMovement} shot.

Original prompt: "{scenePrompt}"

Analyze the frames for:
1. Architectural integrity — do structures remain solid and straight?
2. Motion quality — does the implied camera movement look smooth?
3. Lighting consistency — is lighting stable across frames?
4. Visual artifacts — any obvious AI generation issues?

Return a JSON object:
{
  "verdict": "pass" | "soft_reject" | "hard_reject",
  "confidence": 0.0-1.0,
  "issues": ["list of specific issues found, empty if pass"],
  "motion_quality": "smooth" | "jittery" | "static" | "erratic",
  "architectural_integrity": "intact" | "minor_warping" | "major_warping" | "melted",
  "lighting_consistency": "stable" | "minor_shift" | "major_shift" | "flickering"
}

Return ONLY the JSON object, no additional text.
```

### Prompt Modification on Soft Reject

When a clip receives a `soft_reject`, the `buildPromptModification` function (`lib/prompts/qc-evaluator.ts`) appends corrective instructions to the original prompt before retrying:

| Issue Detected | Corrective Instruction Added |
|---|---|
| Warping / distortion | "Maintain rigid architectural lines, keep walls and surfaces perfectly straight and stable" |
| Lighting / flicker | "Maintain consistent even lighting throughout, no brightness changes" |
| Blur | "Keep sharp focus throughout, minimal motion blur" |
| Artifacts / ghosting | "Clean photorealistic rendering with no visual artifacts" |
| Other | "High quality, stable, photorealistic output" |

The function deduplicates fixes and appends them to the original prompt as `IMPORTANT:` instructions. For example:

```
Original: "Cinematic dolly shot through modern kitchen..."
Modified: "Cinematic dolly shot through modern kitchen... IMPORTANT: Maintain rigid architectural lines, keep walls and surfaces perfectly straight and stable. Maintain consistent even lighting throughout, no brightness changes."
```

### Output Interface

```typescript
interface QCResult {
  verdict: "pass" | "soft_reject" | "hard_reject";
  confidence: number;
  issues: string[];
  motion_quality: "smooth" | "jittery" | "static" | "erratic";
  architectural_integrity: "intact" | "minor_warping" | "major_warping" | "melted";
  lighting_consistency: "stable" | "minor_shift" | "major_shift" | "flickering";
}
```
