# Future Plans

Last updated: 2026-04-14

See also:
- [back-on-track-plan.md](./back-on-track-plan.md) — active roadmap (current focus)
- [../state/PROJECT-STATE.md](../state/PROJECT-STATE.md) — what's shipped
- [../state/TODO.md](../state/TODO.md) — active backlog

Product roadmap for Listing Elevate — directional ideas that are deliberately out of current scope but worth building once the core pipeline is solid.

## Conversational Revision Chatbot

**The idea:** After a video is delivered, the agent can open a `/revise/:propertyId` page with the video player plus a chat input. They type natural-language revision requests — "make the address text bigger and move it to the top," "the music is too dramatic," "swap the kitchen clip to come before the living room," "my logo should be bottom-right." The system re-renders and returns a new video. Fully autonomous, no human editor touches the video.

**Why it's achievable:** Shotstack renders from a JSON timeline. That JSON is fully LLM-editable. Claude can receive the current timeline plus the user's revision request and output an updated timeline. Re-render via Shotstack. Done.

### Scope of what a revision bot can actually do

**Cheap, instant revisions (re-render only, ~60s, ~$0.10):**
- Text size, position, wording, color, font
- Logo placement, size, which version to use
- Music track swap, volume, fade timing
- Clip reordering
- Transition style and duration
- Opening / closing duration
- Accent color changes
- Narration rewrite (re-synth via TTS, then re-render)
- Add or remove overlays (CTA, phone number, website)
- Trim to a different total duration
- Generate additional aspect ratios from the same master

**Medium cost (regenerate one clip, ~90s + ~$0.30):**
- Replace a single scene with a new Kling or Runway generation
- Swap the source photo for a given scene
- Change camera movement on a specific shot

**Expensive (regenerate multiple clips, minutes + $2+):**
- Full re-script and re-generate ("make the whole video feel more luxurious")
- Change the overall mood / vibe

**Out of scope — would require a different renderer (Remotion, After Effects):**
- Custom particle effects
- 3D transforms or rotating models
- Novel animation primitives Shotstack does not expose
- Anything requiring pixel-level creative control

### Architecture sketch

1. After the first successful render, persist the full Shotstack JSON timeline on the `properties` row (new column `shotstack_timeline jsonb`).
2. New page `/revise/:propertyId` with video player and chat UI (shadcn `Card`, `Input`, `Button`).
3. New endpoint `POST /api/properties/:id/revise` that takes `{ message }`:
   - Loads the current timeline JSON from the property row.
   - Calls Claude with a tool-use prompt: tools include `edit_timeline(patch)`, `regenerate_clip(scene_number, new_prompt?)`, `swap_music(mood)`, `rewrite_narration(new_script)`.
   - Claude reasons about the request and calls one or more tools.
   - Tools execute: JSON patch, Kling/Runway regeneration, ElevenLabs re-synth, etc.
   - Updated timeline is re-submitted to Shotstack for a new render.
   - New `properties.horizontal_video_url` and `properties.vertical_video_url` (or a `revisions` table with history).
4. Revision history: new `revisions` table keyed to `property_id` with the timeline snapshot, user message, and video URL. Allows "go back a step."
5. Billing gate: free revisions per order (e.g., 3), then paid. Bake into pricing or charge per revision.

### Effort

Roughly 1–2 days on top of the base Shotstack integration, because the same providers (Shotstack, Kling, Runway, ElevenLabs) are already wired. The new surface is the page, the endpoint, the tool-use prompt, and the history storage.

### Why this is a differentiator

Every real estate video competitor requires the agent to either hire an editor or redo the whole order when they want a tweak. A natural-language revision bot means the agent never has to leave the chat to get exactly what they want. This is the feature that turns a vending-machine product into a defensible moat.

### Ship order

- Phase 1 (current scope): autonomous video generation from order to finished mp4, no human touch.
- Phase 2 (this document): add the revision chatbot. Do not start until Phase 1 is shipping reliable output.

---

## Other future ideas

### Smart vertical cropping
Current approach is center-crop from 16:9 to 9:16. Upgrade to subject-aware cropping using per-clip subject detection so the main architectural feature stays in frame.

### Beat-synced transitions
Analyze the selected music track for beat positions and align clip transitions to beats. Works with any music via audio analysis libraries (librosa, essentia, or a cloud beat-detection API).

### Scheduled social posting
After video delivery, optionally auto-publish to the agent's Instagram, TikTok, or YouTube Shorts on a schedule. Requires OAuth integrations with each platform.

### Multi-language narration
ElevenLabs supports many languages. Add a language picker to the form, generate the narration script in the target language via Claude, synth via ElevenLabs. Unlocks non-English markets.

### White-label for brokerages
Per-brokerage templates, branding, and billing. A brokerage admin can upload their own font, logo, brand colors, intro/outro, and all their agents inherit it automatically.

### Analytics on delivered videos
Track views, watch-through rate, CTA clicks on each delivered video via a tracking pixel or wrapped landing page. Gives agents proof of ROI.

### Premium Remotion template tier
If customers start asking for creative control Shotstack cannot express (particles, 3D, custom motion graphics), add a Remotion-based premium template tier. Shares the same upstream order data — no rework of the pipeline. Charge more for it.

### Music library with user picker
Replace the auto-selected-per-package music model with a searchable library (by mood, tempo, genre). Lets agents pick their own track. Requires a licensed music source (Epidemic Sound, Artlist, Soundstripe API).

### Voice clone marketplace
Once voice cloning is live, let agents share their voice with their team, or offer a library of professional voice actors.

### Brokerage compliance overlays
Some states require specific disclosures on real-estate marketing videos (license number, equal housing logo, MLS ID). Add a per-state template overlay system.
