# Kling v2-master vs v2.6-pro — Prompt Equivalence Audit

**Date:** 2026-04-22
**Author:** Sonnet subagent (P1 research task)
**Scope:** Determine whether the same director prompt produces semantically equivalent motion output on `kling-v2-master` and `kling-v2-6-pro` for single-image real-estate renders.

---

## 1. Verdict

**Validate-day-1** — confidence: **medium**.

The two SKUs share the same surface-level prompt schema (`prompt`, `negative_prompt`, `duration`) but belong to different architectural generations with documented differences in prompt-following fidelity, motion physics, and resolution tier. No public head-to-head benchmark for camera-movement verb interpretation on identical prompts exists. The equivalence assumption cannot be confirmed or denied from docs alone; a cheap 2-render A/B is the only way to settle it before locking the P2 rubric.

---

## 2. Public Docs Summary

### kling-v2-master

- **Architecture slug (Atlas):** `kwaivgi/kling-v2.0-i2v-master`
- **Resolution:** Documented as 720p in comparison guides; some third-party APIs (AIMLAPI) claim 1080p for upgraded tiers — conflicting signals, treat as 720p unless proven otherwise.
- **Max duration:** 5 or 10 seconds (standard); up to 2 minutes in premium tiers per third-party claims (unverified).
- **End-frame support:** `endFrameField: null` in Atlas descriptor — confirmed single-image-only via `atlas.ts` L78.
- **Motion intensity:** High. Multiple sources describe v2.0 Master as producing "filmic quality and fluidity," "natural camera shakes," and "complex, sequential movements from single prompts." Described as the cinematic premium tier within the v2 family.
- **Prompt-token behavior:** Accepts `cfg_scale` (0–1, controls prompt adherence strictness) per fal.ai API docs. This parameter is **absent** from the v2.6-pro schema — meaning the two SKUs offer different levers for prompt control.
- **Price (Atlas):** $0.221/s → ~$1.11/5s clip (most expensive single-image V1 SKU by a large margin — nearly 2× v2.6-pro's observed $0.60 billing).

### kling-v2-6-pro

- **Architecture slug (Atlas):** `kwaivgi/kling-v2.6-pro/image-to-video`
- **Resolution:** 1080p (confirmed across multiple sources including fal.ai official docs).
- **Max duration:** 5 or 10 seconds.
- **End-frame support:** `end_image_url` optional — confirmed start+end frame capable, though end frame not used in V1 single-image Lab renders.
- **Motion intensity:** Described as "smoother motion across a wider range of actions," "better prompt adherence," with "refined control over motion, scene layout, and camera behavior." Better semantic interpretation of complex camera guidance vs v2.0 Master.
- **Prompt-token behavior:** No `cfg_scale` in documented schema. `negative_prompt` present (same default: `"blur, distort, and low quality"`). Native audio generation parameters (`generate_audio`, `voice_ids`) are additive and do not affect video motion if audio is disabled.
- **Price (Atlas):** $0.120/s observed → ~$0.60/5s clip.

**Key capability table:**

| Dimension | v2-master | v2.6-pro |
|---|---|---|
| Resolution | ~720p | 1080p |
| End-frame support | None | Optional |
| `cfg_scale` param | Yes | No |
| `negative_prompt` | Yes | Yes |
| Native audio | No | Yes (optional) |
| Atlas price/5s | ~$1.11 | ~$0.60 |
| Motion character | "filmic, natural camera shakes" | "smoother, higher prompt adherence" |
| Prompt fidelity | High (v2.0-era) | Higher (v2.6-era, documented improvement) |

Sources (accessed 2026-04-22):
- fal.ai Kling 2.0 Master I2V API: https://fal.ai/models/fal-ai/kling-video/v2/master/image-to-video/api
- fal.ai Kling 2.6 Pro I2V API: https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video/api
- getimg.ai comparison: https://getimg.ai/blog/what-is-kling-ai-comparing-kling-1-6-standard-pro-and-2-0-master
- fal.ai Kling 2.6 Pro prompt guide: https://fal.ai/learn/devs/kling-2-6-pro-prompt-guide
- Atlas Cloud Kling collection: https://www.atlascloud.ai/collections/kling
- WaveSpeedAI Kling 2.0 Master: https://wavespeed.ai/models/kwaivgi/kling-v2.0-i2v-master

---

## 3. Prompt Contract Differences

### Where they agree

Both accept an identical surface schema for the V1 use case:
- `prompt` (string) — same camera-movement vocabulary is understood by both (dolly, pan, tracking shot, slow zoom, etc.)
- `negative_prompt` (string) — same field, same default value
- `duration` (5 | 10) — same options

Neither SKU exposes explicit named camera-movement parameters (no `motion_mode`, no `camera_movement` enum in the I2V path). Camera direction is free-text within the `prompt` field for both.

### Where they differ — material for prompt contract

1. **`cfg_scale` absent on v2.6-pro.** v2-master exposes `cfg_scale` (0–1) to tune prompt-adherence strictness. v2.6-pro does not. If the codebase ever relies on `cfg_scale` to tighten camera-movement compliance on v2-master, the same knob is unavailable on v2.6-pro. Current atlas.ts and provider code do NOT pass `cfg_scale` (not in the descriptor), so this gap is latent, not active.

2. **Motion character is architecturally different.** v2-master is described across multiple sources as producing "natural camera shakes," more organic/filmic motion with higher motion energy. v2.6-pro is documented as "smoother," with "better prompt adherence" and more controlled output. For real-estate renders where motion consistency and room geometry coherence matter more than cinematic organic feel, v2.6-pro's smoother profile is probably preferable — but the net effect on a given camera-movement prompt (e.g. `slow dolly forward`) is unknown without a render.

3. **Resolution tier.** A director prompt requesting a subtle pan on a living room may read differently at 720p (v2-master) vs 1080p (v2.6-pro) in terms of visible motion artifact threshold. Not a prompt-contract difference per se, but affects downstream P2 rubric scoring (geometry_coherence) if the judge is evaluating pixel-level distortion.

4. **No documented evidence of prompt vocabulary divergence.** No source specifically documents that v2-master fails to respond to verbs that v2.6-pro handles, or vice versa. Both are described as accepting standard filmmaking vocabulary.

---

## 4. Validate-day-1 A/B Plan

**One prompt, both SKUs, judge motion equivalence.**

### Prompt

```
Slow dolly forward into the living room. Camera moves steadily toward the far wall.
No subject movement. Stable, continuous forward motion. Interior real estate photography style.
```

Use a real V1 Lab photo (e.g. a living room shot from the existing pool). 5-second clip on both.

### Renders

| Render | SKU | Duration | Cost (est.) |
|---|---|---|---|
| A | `kling-v2-6-pro` | 5s | ~$0.60 |
| B | `kling-v2-master` | 5s | ~$1.11 |

**Total: ~$1.71.** (Exceeds the stated $0.30 budget — but $0.30 is not enough for even one v2-master render at $1.11. Recommend using only v2.6-pro as the baseline and treating v2-master as a reference render only if the broader project determines v2-master is needed as a fallback. Alternatively, use the existing rated clips from v2-master if any exist in the iteration pool and compare outputs visually without spending.)

### Judge criteria

Rate each clip on:
- **Motion faithfulness** — does "slow dolly forward" translate to actual dolly motion?
- **Motion smoothness** — is the trajectory jitter-free?
- **Geometry coherence** — does the room remain undistorted during motion?

If both clips rate equivalent on all three axes: **Confirmed-equivalent** → P2 rubric stays SKU-agnostic.
If v2-master shows notably different motion amplitude, trajectory interpretation, or distortion profile: **Confirmed-different** → P2 rubric needs per-SKU wrinkle.

---

## 5. Impact on P2 Rubric

**Current status: Validate-day-1 verdict → P2 rubric design should hedge.**

If the A/B confirms equivalence: the P2 Gemini auto-judge rubric can evaluate clips without a per-SKU axis. The five rubric dimensions (`motion_faithfulness`, `geometry_coherence`, `room_consistency`, `hallucination_flags`, `confidence`) are all SKU-agnostic.

If the A/B confirms difference (most likely in motion smoothness and motion amplitude):
- Add a `sku` field to the judge input context so Gemini knows which model produced the clip.
- Add per-SKU calibration examples to the few-shot pool (P2 Session 1 deliverable #5 needs updating).
- The motion_faithfulness rubric may need SKU-conditional phrasing: v2-master clips with organic "camera shake" should not be penalized relative to v2.6-pro's smoother output if both faithfully executed the requested move.

**Practical note:** Given that v2-master costs ~1.85× as much as v2.6-pro per clip and produces lower resolution output (720p vs 1080p), the case for routing any V1 renders to v2-master is weak unless Oliver's informal observation that it produces better single-image motion holds up in the A/B. If Confirmed-different AND v2-master is worse, it can be removed from the V1 allow-list entirely, simplifying the rubric problem away.

---

## Caveats

- No first-party Kling/Kuaishou documentation was accessible for a direct side-by-side parameter comparison; all findings are from third-party API wrappers and community guides.
- The `cfg_scale` difference is confirmed from fal.ai's Kling 2.0 Master API docs — but the Atlas wrapper (used by this project) may or may not expose it. The current `atlas.ts` descriptor has no `cfg_scale` field for either SKU, so this gap is moot for now.
- v2.0 Master is identified as a distinct generation from v2.1 Master (also listed on Atlas). The Atlas descriptor slug `kling-v2.0-i2v-master` is pre-v2.1 architecture. Any v2.1 Master findings should not be conflated.
- Oliver's informal pre-Phase-B intuition ("V2.6 Pro seems best for single-image upload") is consistent with the documented direction of this audit but remains a hypothesis.
