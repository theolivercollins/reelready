# Scene Allocation Plan — Dynamic Clip Budgeting

Status: proposal, not yet implemented
Owner: Oliver
Related files: `lib/pipeline.ts`, `lib/prompts/director.ts`, `lib/db.ts`, `lib/types.ts`

## 1. Goal

Replace the director's static "use 2 clips if aesthetic_score>=8 else 1" rule with a dynamic allocator that:
1. Respects per-room clip ranges (floor / ceiling).
2. Gates each candidate photo through a dynamic, room-specific pre-flight QA threshold.
3. Guarantees at least one clip per present room type (fallback to safer camera motion).
4. Redistributes unfilled clip budget to rooms with surplus high-quality photos.
5. Caps total clip time at 60 seconds.
6. Persists every decision so the admin Superview can show Oliver exactly what the engine did and why.

This engine runs as a post-process on the director's raw scene list. The director stays in charge of creative choices (mood, camera movement pairing, prompt language, room ordering); the allocator re-shapes its output to fit the new quota rules, and re-invokes a small "gap-fill" director pass when it needs to add clips for rooms the director undershot.

## 2. Data Model Changes

### `scenes` table (add columns)
- `allocation_reason` text — one of `primary`, `fallback_low_qa`, `redistribution_bonus`, `same_photo_alt_movement`.
- `source_photo_qa_score` numeric(3,1) — the pre-flight stability score of the source photo at allocation time.
- `dynamic_qa_threshold` numeric(3,1) — the threshold that applied when this scene was chosen.
- `trimmed` boolean default false — set true if the scene was dropped by the 60s cap enforcement (kept as a tombstone row so the dashboard can explain the trim).

### `properties` table (add columns)
- `allocation_summary` jsonb — snapshot of the final decision (see below).
- `allocation_warnings` text[] — short human-readable strings like "Insufficient photos for kitchen (needed 2, had 1 eligible)".

### New table `allocation_decisions` (one row per room type per property)
Columns:
- `id`, `property_id`, `room_type`
- `photos_present` int
- `photos_eligible` int (met threshold)
- `range_min` int, `range_max` int
- `clips_assigned_first_pass` int
- `clips_added_by_redistribution` int
- `clips_trimmed_by_cap` int
- `final_clip_count` int
- `fallback_used` boolean
- `avg_photo_qa_score` numeric(3,1)
- `best_photo_qa_score` numeric(3,1)
- `threshold_applied` numeric(3,1)
- `notes` text

This table is the source of truth for the Superview allocation panel. The `properties.allocation_summary` jsonb is a denormalized rollup (for fast rendering) that mirrors these rows plus global fields (`total_duration_seconds`, `cap_trim_applied`, `total_deficit_clips`, `total_redistributed_clips`).

## 3. Dynamic Pass-Threshold Formula

Every photo carries a pre-flight stability score in `[0,10]`. A photo is "eligible" if `stability_score >= threshold(room_type, photo)`.

The threshold has three parts:

```
threshold = base(room_type)
          + complexity_bump(photo)
          - simplicity_discount(photo)
```

### Base per room type (floor 5.0, ceiling 8.5)

| room_type        | base |
|------------------|------|
| bedroom          | 6.0  |
| master_bedroom   | 6.5  |
| bathroom         | 7.5  |
| kitchen          | 7.5  |
| living_room      | 8.0  |
| dining           | 7.0  |
| exterior_front   | 7.0  |
| exterior_back    | 7.0  |
| aerial           | 6.5  |
| pool             | 8.0  |
| lanai            | 7.0  |
| hallway          | 7.5  |
| foyer            | 7.0  |
| garage           | 6.0  |
| other            | 7.0  |

Rationale: reflective/glassy/high-detail rooms (living rooms with large windows, glossy kitchens, pools, bathrooms with mirrors) get higher bars because they're where Runway/Kling most often hallucinate. Bedrooms and garages are the safest geometries.

### complexity_bump (0 to +1.5)
Derived at analysis time. Inputs:
- `depth_rating = high` → +0.5
- `key_features` contains any of `floor_to_ceiling_window`, `mirror_wall`, `glass_railing`, `chandelier`, `open_concept`, `reflective_floor` → +0.3 each, capped at +1.0
- `quality_score < 6` → +0.3 (noisy source raises the bar)

### simplicity_discount (0 to -1.0)
- `depth_rating = low` → -0.5
- `aesthetic_score >= 9` AND `quality_score >= 8` → -0.5 (stunning clean photo, give it a shot)

Result is clamped to `[5.0, 8.5]`.

### Worked examples
- **Plain bedroom**, depth=low, aesthetic=7, quality=7, no special features: `6.0 - 0.5 = 5.5`. Easy bar.
- **Glassy living room**, depth=high, aesthetic=8, features=[floor_to_ceiling_window, open_concept]: `8.0 + 0.5 + 0.6 = 9.1 → clamp 8.5`. Very high bar — only rock-solid prompts pass.
- **Hero kitchen**, depth=medium, aesthetic=9, quality=9, features=[chandelier]: `7.5 + 0.3 - 0.5 = 7.3`. Moderate bar.
- **Drone exterior**, depth=medium, quality=8, aesthetic=8: `6.5`. Low bar — aerials usually stabilize well.

## 4. Room Quota Table (refined)

| room_type        | min | max | notes                                                          |
|------------------|-----|-----|----------------------------------------------------------------|
| exterior_front   | 2   | 3   | Drone/aerial counts toward this pool; see aerial row.          |
| aerial           | 0   | 2   | Counted inside exterior bucket; total exterior (front+aerial) capped at 4. |
| exterior_back    | 1   | 2   |                                                                |
| living_room      | 2   | 2   | Hard pair. Hero room.                                          |
| kitchen          | 2   | 3   | Hero room.                                                     |
| dining           | 0   | 1   | Under the extras bucket if preferred.                          |
| master_bedroom   | 1   | 2   |                                                                |
| bedroom (each)   | 1   | 2   | Max 2 additional bedrooms counted; beyond that, bucketed.      |
| bathroom (each)  | 1   | 2   | Max 2 bathrooms counted.                                       |
| pool             | 2   | 2   | If present.                                                    |
| lanai            | 1   | 1   | If present.                                                    |
| hallway/foyer/garage/extras | 0 | 2 | Combined, not per-room.                                |

Absolute total clip count: **10 – 16**, total duration: **≤ 60 s**.

## 5. Allocation Algorithm (pseudocode)

```text
INPUT:
  photos:            list of analyzed photos (with room_type, scores, features)
  preflight_scores:  map photo_id → stability_score (0..10) from Stage 3.5
  quota_table:       static table from §4
  director_scenes:   the director's initial scene list (prompts, camera movements)

# ── Step 1. Group + tag eligibility ──────────────────────────────
for each photo p in photos:
    p.threshold = dynamic_threshold(p)          # §3 formula
    p.eligible  = preflight_scores[p.id] >= p.threshold
groups = group_by(photos, room_type)

# ── Step 2. First-pass assignment ────────────────────────────────
assignments = {}         # room_type → list of chosen photos
surplus     = {}         # room_type → list of eligible-but-unchosen photos (sorted desc by QA)
deficit     = {}         # room_type → int (unfilled slots)

for room in rooms_present(groups):
    q = quota_table[room]
    eligible_sorted = sort_desc(filter(groups[room], p=>p.eligible), key=qa_score)

    take = min(len(eligible_sorted), q.max)
    assignments[room] = eligible_sorted[0:take]
    surplus[room]     = eligible_sorted[take:]       # leftover eligible photos

    if take < q.min:
        deficit[room] = q.min - take                 # unfilled slots to redistribute / fallback

# ── Step 3. Hard-min fallback for rooms with zero eligible ──────
for room in rooms_present(groups):
    if len(assignments[room]) == 0:
        best = max(groups[room], key=qa_score)       # highest-scoring photo regardless of threshold
        assignments[room] = [best]
        mark_fallback(room, best)
        force_camera_movement(best, "push_in")       # safer default
        deficit[room] = max(0, quota_table[room].min - 1)

# ── Step 4. Redistribute unfilled slots to rooms with surplus ───
deficit_pool = sum(deficit.values())
redistribution_queue = []
for room, extras in surplus.items():
    if len(extras) > 0 and len(assignments[room]) < quota_table[room].max:
        redistribution_queue.append({
            room:  room,
            best_surplus_qa:    extras[0].qa_score,
            importance_rank:    ROOM_IMPORTANCE[room],   # static tiebreak
            slots_available:    quota_table[room].max - len(assignments[room]),
            photos:             extras,
        })

sort redistribution_queue by (best_surplus_qa desc, importance_rank desc)

while deficit_pool > 0 and redistribution_queue not empty:
    entry = redistribution_queue[0]
    if entry.slots_available == 0:
        pop(entry); continue
    assignments[entry.room].append(entry.photos.pop(0))
    entry.slots_available -= 1
    deficit_pool -= 1
    resort_on_next_iteration_if_same_room_still_qualifies()

# unfilled rooms get a warning
for room, d in deficit.items():
    if d > 0 and not fallback_used(room):
        warnings.append(f"Insufficient photos for {room}")

# ── Step 5. Enforce 60-second cap ───────────────────────────────
total_duration = sum(scene.duration for scene in flatten(assignments))
if total_duration > 60:
    trim_order = rooms sorted by importance ASC, then by avg_qa ASC
    for room in trim_order:
        while total_duration > 60 and len(assignments[room]) > quota_table[room].min:
            dropped = assignments[room].pop()   # pop lowest-qa clip first
            mark_trimmed(dropped)
            total_duration -= dropped.duration
        if total_duration <= 60: break

# ── Step 6. Same-photo reuse with alt movement ──────────────────
# If a room has range.min > 1 and only 1 unique photo available (even after
# redistribution failed), duplicate it with a different camera_movement.
for room, clips in assignments.items():
    unique_photos = distinct(clips, key=photo_id)
    if len(clips) > 1 and len(unique_photos) == 1:
        first = clips[0]
        for i in 1..len(clips)-1:
            clips[i] = rebuild_scene(
                photo=first.photo,
                camera_movement = alt_movement_for(room, first.camera_movement, i),
                allocation_reason="same_photo_alt_movement",
            )

# ── Step 7. Persist ─────────────────────────────────────────────
for room in rooms_touched:
    write_allocation_decision_row(room, …)
write_allocation_summary(property, …)
write_scenes(flatten(assignments))   # replaces director output
```

`ROOM_IMPORTANCE` (higher = more hero): `living_room=10, kitchen=10, master_bedroom=8, exterior_front=8, pool=8, bathroom=5, bedroom=5, dining=4, lanai=4, exterior_back=3, aerial=3, foyer=2, hallway=2, garage=1, other=1`.

`alt_movement_for` picks from a small safe map per room so the second clip is visibly different without breaking stability (e.g. kitchen: `dolly_left_to_right` then `push_in`; living_room: `parallax` then `pull_out`).

## 6. Dashboard Display (admin Superview)

Add an "Allocation" card to the property detail page. Content comes directly from `allocation_decisions` and `properties.allocation_summary`:

- **Header row**: "Final shot list: N scenes / Ms total" plus a green/yellow/red chip:
  - green = all rooms at or above min, no fallbacks, no trims
  - yellow = redistribution or fallback happened but video is whole
  - red = any room missing its min AND no redistribution covered it, or 60s cap trimmed >1 clip
- **Per-room table**: room | photos present | eligible | threshold | assigned | range | status icon. Status icons: ✓ primary, ↑ bonus (redistribution), ◐ fallback, ✂ trimmed.
- **Warnings list**: each string from `allocation_warnings`, e.g. "Insufficient photos for kitchen — used 1 of 2; added bonus clip to living room".
- **Redistribution trace**: one-line entries showing source-of-deficit → destination-room.
- **Trim trace** (only if 60s cap fired): which scenes were dropped and why.

All of this is read-only reporting. No new admin actions needed in v1.

## 7. Edge Cases — three walked-through shapes

**Shape A: Condo, 9 photos.** 2 front_exterior (both eligible), 2 living_room (1 eligible, 1 below threshold due to glass), 2 kitchen (both eligible), 1 master_bedroom (eligible), 1 bathroom (eligible, fallback not needed), 1 balcony → treated as `other`. Result: exterior 2, living 2 (one via fallback push_in on the non-eligible photo since living_room.min=2), kitchen 2, master 1, bath 1, other 1 → 9 clips, ~36s. Warning: "Living room fallback used for scene 3."

**Shape B: 5-bed estate, 32 photos, 0 front_exterior.** No front of house ⇒ skip that row entirely, no warning (rule: only present rooms count). Exterior bucket filled from aerial + exterior_back only. Director still needs an opener, so aerial.min bumps to 1 automatically when exterior_front is absent AND aerial photos exist. If aerial is also absent, emit warning "No exterior establishing shot available" and open on living_room. Plenty of surplus — likely hits the 16-scene ceiling and the 60s cap; trim removes extras-bucket clips first.

**Shape C: 6 photos total — 3 kitchen, 3 bathroom, nothing else.** Very thin. Kitchen 3, bathroom 2, total 5 clips ~20s. Far under the 10-scene floor. Do not pad with fake rooms. Set `properties.status = needs_review` and emit "Property has only 2 room types — manual review required before generation." The allocator should still produce a valid 5-scene plan as a draft so Oliver can decide to ship short or reject.

## 8. Integration Points

The pipeline today is `intake → analysis → scripting → preflight_qa → generation`. The new allocator must run **after** preflight_qa (it needs the stability scores) but its output must be fed back into the scene row set before generation starts.

Two options:

1. **Replace the director**: allocator builds scenes directly from photo metadata, then calls a smaller "prompt writer" Claude pass per scene.
2. **Post-process the director**: director produces a candidate scene per eligible photo (over-generating), allocator prunes / reshapes / re-invokes the director for specific gap-fill scenes.

**Recommendation: option 2 (post-process).** Reasons:
- The director prompt already encodes room-by-room prompt templates, motion mapping, and stability anchors — re-building that logic inside the allocator would duplicate a lot of carefully tuned text.
- Option 2 keeps the director as the single source of creative truth; the allocator's job is strictly budgeting.
- Gap-fill works well: when allocator needs a second clip for a room with only one eligible photo, it asks the director for "one more scene for this photo, using movement X" — a very scoped call.

Concretely: add `runSceneAllocation(propertyId)` as **Stage 3.6**, running between `runPreflightQA` and `runGenerationWithQC`. It reads the current scenes + preflight QA scores (now persisted on scenes per §2), runs the algorithm, writes replacement scenes (soft-deleting or tombstoning any pruned ones via `trimmed=true`), writes `allocation_decisions` rows, and updates `properties.allocation_summary`.

The director prompt in `lib/prompts/director.ts` should be trimmed: remove the hardcoded "use 2 if aesthetic_score>=8" rule and the fixed quotas, leaving only creative guidance. Quotas move entirely into the allocator.

## 9. Open Questions for Oliver

1. **Extras bucket semantics.** Should dining always be inside extras, or promoted to its own 0–1 row when present with a strong photo? Current plan keeps it in extras; confirm.
2. **Aerial without exterior_front.** Is an aerial-only opener acceptable for a property that has no front-of-house photo, or should we force the intake to reject?
3. **Same-photo reuse cap.** Is reusing the same photo twice okay, three times (if a room has min=3 and only one photo) — never? Current plan: max 2 uses of the same photo, across the whole video.
4. **60-second trim tiebreak.** When trimming, should we always drop the lowest-QA clip first, or drop whichever clip is 10s before touching any 5s clip? Current plan: lowest-QA first regardless of duration.
5. **needs_review trigger.** Shape C above auto-sets `needs_review`. What are the exact minimums — <3 room types, <8 scenes, both? Need a rule.
6. **Threshold calibration.** The base numbers in §3 are a first guess. Do we want to log `stability_score` vs `threshold` for the next 20 properties and re-fit before shipping, or trust the table from day one?
7. **Redistribution ceiling.** Should a room be allowed to exceed its own `range.max` when it's receiving bonus clips, or is max a hard ceiling? Current plan: hard ceiling.
8. **Warning visibility.** Do insufficient-photo warnings also need to surface to the end user (agent) or is admin-only sufficient for v1?
