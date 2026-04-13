# Walkthrough Spec — Primary Goal

Last updated: **2026-04-13**
Status: Canonical. This is the product goal every other doc ladders up to.

---

## 1. The goal (verbatim)

> A "human-like" or equivalent cinematic property walkthrough, featuring
> inside, outside, and unique features of the property with no human in
> the loop.

Every pipeline change, provider decision, prompt edit, and dashboard
feature is judged against this sentence. If a change doesn't move us
closer to it, it's the wrong change.

---

## 2. What each phrase means in practice

### "Human-like or equivalent cinematic"

The output has to read as if a real videographer walked the property
with a stabilized camera. Concretely:

- Smooth, deliberate camera motion — no random jitter, no zoom-snaps.
- Coherent framing that respects real architecture (walls stay where
  they are, doorways stay closed, adjacent rooms don't change
  between clips).
- A narrative arc an agent would actually cut: establish → interior
  tour → hero features → close.
- No visible AI tells: no melting counters, no hallucinated cabinetry,
  no warped people, no "camera escaped through the sliding door into
  an imagined backyard" fails.
- No visible human or human-shaped artifacts in any frame.

"Or equivalent" allows us to ship a style that isn't literally a
camera-on-a-gimbal look as long as a real estate agent would watch it
and say "yeah, I'd send this to a client."

### "Property walkthrough"

A single assembled experience covering a **property**, not a slideshow
of disconnected clips. For v1, we ship individual clips as the
deliverable (stitching is deferred — see `docs/TODO.md`), but the shot
list itself must still read as a coherent walkthrough in sequence.

### "Inside, outside, and unique features"

Three non-negotiable coverage axes. Every shipped video must include
**all three**:

1. **Inside** — at least one interior room clip.
2. **Outside** — at least one exterior clip (front-of-house, back,
   or aerial all count).
3. **Unique features** — at least one clip focused on what makes *this*
   property distinctive (pool, view, chandelier, wine cellar, vaulted
   ceiling, home theater, etc.).

If any axis is missing from the photos uploaded, the pipeline should
either synthesize from what it has or route the property to
`needs_review`. It should never silently ship a video that's missing an
axis. See `docs/COVERAGE-MODEL.md` for the detection and enforcement
rules.

### "No human in the loop"

From the moment an agent clicks submit to the moment clips are
playable, zero admin actions are required. This includes:

- No manual photo review or re-tagging.
- No manual scene approval.
- No manual prompt tuning.
- No manual retries.
- No "admin please verify" gates except for genuine out-of-band
  failures (provider down, no photos at all, etc.).

Human-in-the-loop points that exist today are bugs to be closed, not
features. The full list is in `docs/AUTONOMY-CHECKLIST.md`.

---

## 3. Acceptance test (how we know we hit the goal)

A run is "goal-passing" if and only if **every one of these** is true:

**Coverage**
- [ ] ≥1 exterior clip in the final shot list.
- [ ] ≥1 interior clip in the final shot list.
- [ ] ≥1 clip explicitly framing a unique feature flagged in
      `style_guide.notable_features` or `photo.key_features`.
- [ ] The three axes are distributed across the arc, not clustered.

**Arc**
- [ ] Opening clip is an exterior or aerial establishing shot.
- [ ] Closing clip is an exterior wide, aerial, or a designated "hero"
      unique-feature shot.
- [ ] Interior clips flow in a reader-comprehensible order
      (entry → living → kitchen → bedrooms → baths → outdoor).
- [ ] No two consecutive clips share the same camera movement.
- [ ] ≥5 distinct camera movements across the shot list.

**Quality (cinematic bar)**
- [ ] Zero clips show camera exit through a doorway, window, or slider.
- [ ] Zero clips contain a hallucinated adjacent room that contradicts
      the property style guide.
- [ ] Zero clips contain a person, watermark, caption, or text.
- [ ] Zero clips contain geometric warping (melting walls, bending
      counters, distorted windows).
- [ ] Every clip's on-screen motion matches the director's intended
      camera movement (push-in looks like push-in, parallax looks
      like parallax — see `docs/SHOT-VOCABULARY.md`).
- [ ] Total video runtime ≤ 60 seconds, clip count 10–16.

**Autonomy**
- [ ] Property reached `complete` status without any admin actions.
- [ ] Zero scenes entered `needs_review`.
- [ ] Zero scenes were manually retried or manually prompted.

A run that fails **any** box is a learning run, not a shipped run.
Every failed box maps to a specific engineering gap in
`docs/WALKTHROUGH-ROADMAP.md`.

---

## 4. Non-goals (explicit, so we don't drift)

- **Full FFmpeg stitching / soundtrack / captions.** Deferred until
  individual clips reliably pass the cinematic bar. Shipping a
  beautifully-edited reel made of melting kitchens isn't the goal.
- **Voiceover narration.** Out of scope for v1.
- **Agent branding overlays / broker logos.** Phase 2.
- **Multi-property showreels.** One property per run.
- **Live-video ingest.** Photos only, for now.
- **Agent-selectable "style" presets.** One house style for now:
  "cinematic real estate listing."
- **Frame-perfect QC via ffmpeg extraction.** Deferred until infra
  supports it; interim QC is the Claude pre-flight pass on prompts
  plus the `key_features` / style guide contradiction check.
- **Manual prompt override UI for agents.** Never. This would put a
  human in the loop on the wrong side of the submit button.

---

## 5. How this doc is used

1. **Before any code change** to the pipeline, confirm which
   acceptance-test box it moves. If it moves zero boxes, write down
   why it's still worth doing (or don't do it).
2. **Before any roadmap commit** in `docs/WALKTHROUGH-ROADMAP.md`,
   map the work back to one or more boxes in §3.
3. **After every real test run**, walk the 60-second video against
   §3 manually until the QC evaluator can do it automatically. Record
   pass/fail per box in the property's Superview timeline.
4. **If Oliver changes the primary goal**, update §1 first, then
   cascade §2/§3/§4 changes and refresh all other docs that reference
   this one.

---

## 6. Related docs

- `docs/COVERAGE-MODEL.md` — inside/outside/unique-features detection
  and enforcement rules.
- `docs/AUTONOMY-CHECKLIST.md` — every human-in-the-loop point today
  and how we close it.
- `docs/WALKTHROUGH-ROADMAP.md` — prioritized work to achieve §3's
  acceptance test, tied to existing planning docs.
- `docs/SHOT-VOCABULARY.md` — authoritative room/camera enum reference.
- `docs/SCENE-ALLOCATION-PLAN.md` — quota engine for room budgets.
- `docs/MULTI-IMAGE-CONTEXT-PLAN.md` — anti-hallucination strategy.
- `docs/HIGGSFIELD-INTEGRATION.md` — keyframe-bracket provider work.
- `docs/PROJECT-STATE.md` — session handoff / live state of the repo.
