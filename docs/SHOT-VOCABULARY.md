# Shot Vocabulary — Rooms, Movements, Quotas

Last updated: **2026-04-13**
Status: Reference. Mirrors the live code. If this doc disagrees with
`lib/types.ts`, `lib/prompts/director.ts`, or `lib/providers/*`, the
code wins — update this doc to match.

This is the single source of truth for the controlled vocabularies the
pipeline uses for scene planning. All other docs cite this one for
enum values and per-value semantics.

---

## 1. `RoomType` enum

Source: `lib/types.ts:12-26`.

| Value | Axis | Description |
|---|---|---|
| `kitchen` | inside | Islands, counters, cabinetry, pendants, appliances. |
| `living_room` | inside | Primary occupancy space: seating, feature wall, fireplace, TV. |
| `master_bedroom` | inside | Primary bed suite. Headboard + nightstands. |
| `bedroom` | inside | Any secondary bedroom. |
| `bathroom` | inside | Vanities, tubs, shower enclosures. |
| `dining` | inside | Formal dining table + overhead lighting. |
| `hallway` | inside | Circulation: flooring, walls, sconces. |
| `foyer` | inside | Entry hall, staircase, statement fixture. |
| `garage` | inside | Finished or unfinished bay + door. |
| `exterior_front` | outside | Front facade, driveway, curb appeal. |
| `exterior_back` | outside | Rear facade, patio, yard, vegetation. |
| `pool` | outside + unique (always) | Pool deck, water feature, coping edge. |
| `aerial` | outside | Drone overhead of full property. |
| `other` | context-dependent | Catchall. Lanai currently lands here. |

**Known gap**: `lanai` is referenced in the director quota table
(`lib/prompts/director.ts:46`) but is not a valid enum value. Photos
of a covered lanai get labeled `other` at analysis and miss their
quota slot. Fix proposed in `docs/COVERAGE-MODEL.md §7`.

---

## 2. `CameraMovement` enum

Source: `lib/types.ts:30-37` + `lib/prompts/director.ts:59-104`.

The enum is stored in the DB and used for **routing and rhythm
enforcement only**. It is **never written into the prompt string**
sent to the video model — see `docs/PROJECT-STATE.md` "Gotchas"
section. The director instead writes a plain-language motion
sentence.

| Value | Plain-language meaning | Good for | Provider notes | Constraints |
|---|---|---|---|---|
| `orbital_slow` | Slow arc around a focal subject, 30–45°, subject stays centered. | Exteriors, aerial, pool, high-depth rooms. | Runway (exterior). Kling handles well for interior. | Use for openers and closers. |
| `dolly_left_to_right` | Camera glides left→right at constant distance from subject. Background shifts laterally. | Kitchens (counters), dining, linear subjects. | Kling, Runway. | Mirror `dolly_right_to_left` to avoid repetition. |
| `dolly_right_to_left` | Camera glides right→left at constant distance. | Living rooms, bedrooms. | Kling, Runway. | Same as above, mirror. |
| `slow_pan` | Fixed position; camera rotates head-like. | Low-depth rooms only. | Kling, Runway often misinterpret as push-in. | **Cap ≤1 per video.** Director forbids multiple. |
| `parallax` | Sideways translation with layered depth — foreground moves faster than background. No zoom, no rotation. | Pool, lanai, open-plan, balcony views. | Kling handles best; Runway tends to force push-in. | **Requires `depth_rating = high`.** |
| `push_in` | Forward toward subject, closing framing. Never crosses doorway or back wall. | Bedrooms, bathrooms, hallways, foyer. | Kling, Runway. Runway's default fallback. | Safe at any depth. |
| `pull_out` | Backward from subject, revealing more of the same room. Never crosses back wall. | Bathrooms, bedrooms, high-depth hero rooms. | Kling, Runway. | Safe fallback for tight spaces. |

**Mandatory rules** (`lib/prompts/director.ts:62-65`):
- Consecutive scenes must use different `camera_movement`.
- ≥5 distinct movements across the shot list.
- `slow_pan` ≤1 scene per video.

---

## 3. Room → preferred provider

Source: `lib/providers/router.ts:8-23`.

| Room type | Default provider |
|---|---|
| `kitchen` | kling |
| `living_room` | kling |
| `master_bedroom` | kling |
| `bedroom` | kling |
| `bathroom` | kling |
| `dining` | kling |
| `hallway` | kling |
| `foyer` | kling |
| `garage` | kling |
| `pool` | luma |
| `aerial` | runway |
| `exterior_front` | runway |
| `exterior_back` | runway |
| `other` | runway |

Fallback chain: `["runway", "kling", "luma"]` (`router.ts:26`). An
explicit `provider_preference` in the director's scene output
overrides routing.

**Pending (next session)**: `higgsfield` enters the table as the
preferred provider for interior scenes with two eligible photos of
the same room AND a camera movement in
`{parallax, slow_pan, dolly_left_to_right, dolly_right_to_left}`
(keyframe-bracket mode). See `docs/HIGGSFIELD-INTEGRATION.md`.

---

## 4. Durations

Source: `lib/prompts/director.ts:195-205` + `lib/providers/kling.ts:76`.

**Per-scene targets:**
- Exterior establishing or closing: **4s**.
- Interior rooms: **3–3.5s**.
- Pool / lanai / highlight: **3.5–4s**.
- Aerial: **4s**.

**Provider snap rules:**
- Kling: `duration_seconds ≤ 5` → `"5"`; `> 5` → `"10"`.
- Runway: snap to `5` or `10`.
- Luma: flexible, not currently exercised.

**Video total:** 30–60 seconds, 10–16 scenes
(`lib/prompts/director.ts:36, 54`).

---

## 5. Room quotas (director-enforced, not allocator)

Source: `lib/prompts/director.ts:34-54`. These are **soft guidance to
the LLM**, not hard constraints in code. The dynamic allocator from
`docs/SCENE-ALLOCATION-PLAN.md` will replace this when shipped.

| Room type | Min | Max | Notes |
|---|---|---|---|
| `exterior_front` / front of house | 2 | 3 | Drone + ground-level count together. |
| `aerial` | 1 | 2 | Counts toward exterior total. |
| `living_room` | 2 | 2 | Hard pair. Hero room. |
| `kitchen` | 1 | 2 | Hero room. |
| `dining` | 0 | 1 | Extras bucket. |
| `exterior_back` | 1 | 1 | |
| `lanai` | 0 | 1 | If present — enum fix pending. |
| `pool` | 2 | 2 | If present. |
| `master_bedroom` | 1 | 2 | |
| `bedroom` (each additional) | 1 | 2 | Max 2 additional bedrooms counted. |
| `bathroom` (each) | 1 | 2 | Max 2 bathrooms counted. |
| hallway / foyer / garage / other | 0 | 2 | Combined total. |

**Picker rule** (`lib/prompts/director.ts:52`): within a `1–2` range,
choose **2** if `depth_rating = high` OR `aesthetic_score ≥ 8`;
otherwise **1**.

---

## 6. `key_features` vocabulary (open)

Source: `lib/prompts/photo-analysis.ts:40`. Free-form strings, 2–4
per photo. The prompt gives examples, not a closed list:

- `granite island`, `pendant lighting`
- `vaulted ceiling`, `natural light`
- `pool view`, `palm trees`
- `Mediterranean facade`, `arched entry door`

**Proposal**: keep `key_features` as free-form prose for the
director's prompt-writing purposes, and add a parallel closed
`unique_tags` enum used by the coverage enforcer. Full list in
`docs/COVERAGE-MODEL.md §4.3`.

---

## 7. Kling negative prompt

Source: `lib/providers/kling.ts:69-74`. Sent on every Kling call.

```
camera exit, leaving the room, passing through doorway,
passing through window, passing through sliding door,
new doorways, added rooms, new architecture, hallucinated walls,
invented furniture, fake sliding door, fake fence,
zoom out to reveal new space, scene change, teleport,
different location, time of day change,
warped walls, melting surfaces, bending counters,
distorted windows, deformed furniture,
people, text, watermark, logo, subtitles, captions,
blurry, low quality
```

Grouped intent:
- **Exit / boundary violation** — line 1–2.
- **Hallucination** — line 3–4 (new rooms, added architecture).
- **Scene tampering** — line 5–6 (teleport, time change).
- **Distortion** — line 7 (melting walls, bending counters).
- **Unwanted elements** — line 8 (people, text, logo).
- **Quality floor** — line 9.

Runway and Luma do not accept a negative prompt in the same format.
Runway relies on model defaults; Luma accepts a `prompt_negative`
field that is currently unset — candidate improvement, not shipped.

---

## 8. Fields on a scene row

Source: `lib/types.ts` (Scene type) + `scenes` table schema
(`docs/PROJECT-STATE.md §Database schema notes`).

| Field | Purpose |
|---|---|
| `scene_number` | 1-based order in the final video. |
| `photo_id` | Source photo (start frame). |
| `room_type` | From enum §1. Drives routing. |
| `camera_movement` | From enum §2. Drives rhythm and routing. |
| `duration_seconds` | Snapped to provider rules §4. |
| `prompt` | Full prompt string sent to the provider. Plain-language motion sentence. |
| `provider` | Chosen after routing. |
| `provider_task_id` | Persisted before polling (reliability). |
| `clip_url` | Final mp4 in Supabase Storage. |
| `qc_verdict` | `auto_pass` today (frame QC deferred). |
| `status` | `pending`, `generating`, `complete`, `needs_review`. |
| `submitted_at` | For cron backstop. |

Proposed additions (not yet migrated):
- `end_photo_id` — for Higgsfield keyframe mode.
- `allocation_reason` — from `docs/SCENE-ALLOCATION-PLAN.md §2`.
- `source_photo_qa_score`, `dynamic_qa_threshold`, `trimmed` — same doc.
- `coverage_axis` — if the scene was inserted by the coverage
  enforcer as a gap fill.
