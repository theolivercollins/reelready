# Shotstack Integration Plan & Session Handoff

**Last updated:** 2026-04-14
**Status:** **Phase 1 MVP shipped.** Sandbox renders verified. Ready to flip to production and run the first real end-to-end property. Post-MVP roadmap (Section 6) is the next work stream.

This document captures the full context, decisions, current state, and forward plan for wiring up automated video assembly in Listing Elevate. It is written so that anyone (including a fresh session) can pick this up cold and execute without needing to reconstruct the reasoning.

---

## 1. Project Context

**Listing Elevate** is a fully-autonomous real estate listing video pipeline. An agent uploads 10–60 property photos plus order metadata, and the system produces a finished cinematic mp4 in both 9:16 and 16:9, watermark-free, delivered via email. **Zero human-in-the-loop is a hard product requirement.**

- **Historical names (now considered legacy):** Real Estate Pipeline, Reel Ready / ReelReady, Real Ready, Keyframe, Keyframe Simplify.
- **Canonical name:** Listing Elevate (display), `listing-elevate` (kebab, for slugs / repo / package), `ListingElevate` (PascalCase for types/components).
- **Repo:** `theolivercollins/reelready` on GitHub (rename pending — see Section 4).
- **Local path:** `/Users/oliverhelgemo/real-estate-pipeline` (rename pending).
- **Current branch of interest:** `ui-redesign` (has uncommitted changes).

### Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React 18 + Tailwind + shadcn/ui |
| State | TanStack React Query |
| Backend | Vercel Serverless Functions (`@vercel/node`, Node 20+, ESM) |
| Database | Supabase (Postgres) — project `vrhmaeywqsohlztoouxu`, org "Recasi" |
| Storage | Supabase Storage (buckets: `property-photos`, `property-videos`) |
| LLM | Claude Sonnet (`claude-sonnet-4-6`) via `@anthropic-ai/sdk` |
| Video generation | Kling 2.0 (interiors), Runway Gen-4 Turbo (exteriors), Luma Ray2 (parallax/pools) |
| Hosting | Vercel (production URL `reelready-eight.vercel.app`, rename pending) |

### Pipeline (6 stages, currently runs inside a single 300s Vercel Function)

1. **Intake** — photos already uploaded to Supabase Storage by the frontend; `POST /api/properties` creates the row, `POST /api/pipeline/:propertyId` fires the pipeline.
2. **Analysis** — Claude vision classifies rooms, scores quality/aesthetic, selects 10–12 photos.
3. **Scripting** — Claude plans ordered scenes with camera movements, prompts, durations, provider preference.
4. **Generation** — All scenes generated in parallel via Kling/Runway/Luma.
5. **QC** — Currently **auto-passes** all clips (FFmpeg not available on Vercel for frame extraction — this is a deferred Phase 2 item).
6. **Assembly** — Currently **stub**: stores individual clip URLs and marks property complete. No stitching happens. The thumbnail is set to the first clip. **This is the gap this document addresses.**

### The assembly gap (critical to understand)

`lib/utils/ffmpeg.ts` already contains a complete, working assembly pipeline (~180 lines): clip normalization, xfade transitions, music with fade, `drawtext` overlays, 9:16 center-crop. **It cannot run on Vercel Functions** — Vercel has no ffmpeg binary, the 250 MB bundle cap, and a 300s wall clock that CPU-heavy rendering will struggle with. So `runAssembly()` in `lib/pipeline.ts` is a stub that skips the actual stitching.

This is the problem Shotstack solves: offload assembly to a cloud service that accepts a JSON timeline and returns a rendered mp4.

---

## 2. Order / Customer-Facing Options (what the product promises)

An agent fills out `src/pages/Upload.tsx` and picks:

| Field | Options | Persisted? |
|---|---|---|
| Package | `just_listed`, `just_pended`, `just_closed`, `life_cycle` (3-video bundle) | **No** — dropped |
| Duration | `15s`, `30s`, `60s` | **No** — dropped |
| Orientation | `vertical` (9:16), `horizontal` (16:9), `both` | **No** — dropped |
| Add voiceover | boolean (+$15) | **No** — dropped |
| Add voice clone | boolean (+$15) | **No** — dropped |
| Add custom request | boolean + free-text (+$15) | **No** — dropped |
| `daysOnMarket` (if pended/closed) | number | **No** — dropped |
| `soldPrice` (if closed) | currency | **No** — dropped |
| Address, price, beds, baths, listing_agent | required | **Yes** |
| Brokerage | optional | **Yes** (but stored empty by default) |
| Photos (10–60) | required | **Yes** (via photo rows) |

**Pricing:** 15s=$75, 30s=$125, 60s=$175 (standard). Life-cycle adds ~$15/tier. "Both" aspect ratios: +$10 (waived on life-cycle). Each add-on: +$15. Voice clone and voiceover are mutually exclusive.

### What's promised but not delivered right now (pre-Shotstack)

- **Duration** is priced but not enforced. The director plans ~12 scenes regardless of 15s/30s/60s choice. A "15-second" order can come back as 45s. **Active product-promise gap.**
- **Voiceover** is charged ($15) but there is zero code path.
- **Voice clone** same: charged, no delivery.
- **Custom request** same.
- **Brokerage logo + brand colors** are captured on the Account profile (`user_profiles.logo_url`, `colors.primary`, `colors.secondary`) but never rendered onto any video.
- **Music** is neither captured on the form nor in the pipeline. Videos today would be silent.
- **Orientation choice** is not respected — the pipeline intends to always produce both.

### What the DB already has

`properties` table has: address, price, bedrooms, bathrooms, listing_agent, brokerage, status, photo_count, selected_photo_count, total_cost_cents, processing_time_ms, horizontal_video_url, vertical_video_url, thumbnail_url.

`user_profiles` (keyed to auth.users) has: first_name, last_name, email, phone, brokerage, logo_url, colors (JSON `{primary, secondary}`), presets (JSON array).

**Everything else from the order form is captured in React state on the Upload page and then thrown away when `createProperty` is called.** Fixing this is a prerequisite for dynamic videos — see Section 6.

---

## 3. Research — Why Shotstack

A research pass evaluated all serious AI-era video assembly options against the requirements: fully headless, API-driven, stitches externally-generated clips (Kling, Runway), adds text + music + transitions, outputs watermark-free mp4, works from Node/TS, production-ready.

### Candidate comparison

| Tool | Model | Node DX | ~Cost @5k vids/mo | Watermark | Verdict |
|---|---|---|---|---|---|
| **Shotstack** | JSON timeline REST | Official SDK + REST | $900–$3000 | None (paid) | **Top pick** |
| **Remotion Lambda** | React-code-as-video | Native TS | $200–$900 | None | **Runner-up** (revisit at scale) |
| Creatomate | Template + direct JSON | SDK | $1000–$1500 | None | Viable; opaque credit math |
| JSON2Video | JSON timeline | REST | ~$500 | Paid only | Budget alternative; less mature |
| Self-hosted ffmpeg | `lib/utils/ffmpeg.ts` | Already written | $20–$200 infra | None | Requires dedicated worker (Fly/ECS); keep as fallback |
| Plainly | After Effects templates | REST | $$$ | None | Eliminated — requires AE workflow |
| Bannerbear | Templates | SDK | — | None | Eliminated — weaker video |
| HeyGen / Synthesia | Avatar | — | — | — | Eliminated — wrong category |

### Why Shotstack wins for Phase 1

1. **Drop-in fit with the existing provider pattern.** The `IVideoProvider` shape (`POST job → poll → download URL`) used by `lib/providers/kling.ts` and `lib/providers/runway.ts` maps 1:1 to Shotstack's API. Implementation is ~150 lines.
2. **Production-hardened.** Case studies at Meta, BBC, Toyota. Best-in-class docs. Official Node SDK. Sandbox (Stage) environment for free testing. Webhooks on render completion.
3. **Watermark-free on any paid tier.** Only the sandbox watermarks.
4. **Cheap at current scale.** ~$140–$300/mo at 500 videos/mo. Cost only becomes painful above ~3000/mo, at which point Remotion Lambda becomes the migration target.
5. **Expressive enough for the actual requirements.** JSON timeline supports: video tracks, audio tracks with ducking, title assets, HTML assets with CSS, Luma mattes, transitions (fade, wipe, slide, zoom, carousel), keyframe animations on position/opacity/scale, multiple aspect ratios from one timeline.
6. **The JSON timeline is LLM-editable**, which unlocks the Phase 2 revision chatbot (see `FUTURE-PLANS.md`).

### Pricing caveat

Research was conducted with web access blocked in the sandbox, so the numbers above are from training-data knowledge (mid-2025). **Before committing to a paid plan, verify current 2026 pricing at shotstack.io/pricing.** Expect to render a few test videos on the Stage environment first (free) to confirm quality and Node DX, then sign up for whichever paid tier matches volume.

### Runner-up: Remotion Lambda

The right choice if/when any of these become true: you need creative control beyond what Shotstack's JSON can express; you're past ~3000 videos/mo and Shotstack billing crosses ~$1k/mo; you want to build templates as React components. Remotion trades vendor ease for per-dev license fees plus AWS Lambda ops work. **Keep as an escape hatch, not a starting point.**

---

## 4. What Has Happened So Far

### Completed — research and planning (2026-04-13)

1. **AI video editing research** — the comparison above is the output. A shorter version is captured in this doc's Section 3.
2. **Order / data-model discovery** — full audit of every field in `properties`, `user_profiles`, the Upload form, the presets system, and the current `assembleVideo` interface. Findings captured in Section 2 of this doc.
3. **`docs/FUTURE-PLANS.md` created** — contains the conversational revision chatbot plan plus other Phase 2 ideas (smart vertical cropping, beat sync, social posting, multi-language, white-label, analytics, voice clone marketplace, compliance overlays).
4. **This document created** — comprehensive handoff.

### Completed — Phase 1 MVP shipped (2026-04-13)

5. **Shotstack API keys acquired** — user provided Stage (sandbox) and Production keys. Stored locally in `.env` (gitignored). **Keys were pasted in chat and should be rotated at shotstack.io before production cutover** — see Section 9 risks.
6. **`lib/providers/shotstack.ts` created** (~270 lines). Contains:
   - `ShotstackProvider` class implementing `IVideoAssemblyProvider`
   - `buildShotstackTimeline()` pure function — unit-testable, no I/O
   - `pollAssemblyUntilComplete()` helper mirroring the existing `pollUntilComplete` pattern
   - `ClipTransition` union type and `transition` param on `AssembleVideoParams`
   - Environment-aware endpoint routing (Stage vs Production via `SHOTSTACK_ENV`)
   - Uses plain `fetch` — no SDK dependency added to the Vercel bundle
7. **`lib/pipeline.ts` `runAssembly()` rewritten**:
   - Pulls all `qc_pass` scenes, sorts by `scene_number` ASC, builds overlays from property data
   - Calls `ShotstackProvider.assemble()` twice (once per aspect ratio), polls each, stores URLs in `properties.horizontal_video_url` and `properties.vertical_video_url`
   - Wrapped in try/catch — on ANY Shotstack failure, falls back silently to the legacy clip-only delivery behavior and logs a warning. The pipeline never fails because of Shotstack.
   - Env-gated: if `SHOTSTACK_API_KEY` / `SHOTSTACK_API_KEY_STAGE` is not set, assembly is skipped entirely with a log line
   - Helper functions added: `formatPrice()`, `formatBaths()`
8. **`.env.example` updated** with `SHOTSTACK_ENV`, `SHOTSTACK_API_KEY_STAGE`, `SHOTSTACK_API_KEY` placeholders
9. **`scripts/test-shotstack.ts` created** — standalone smoke test using Shotstack's own public sample clips. Includes a minimal inline `.env` loader so it has zero dependencies beyond `tsx`. Can be re-run any time to validate config.
10. **Smoke test passed end-to-end** — two real renders against Stage sandbox:
    - 16:9 horizontal, ~14s render time, watermarked (Stage only)
    - 9:16 vertical, ~14s render time, watermarked (Stage only)
    - Both mp4s downloaded and inspected; clips stitched in order with fade overlays on address opener and agent/price closer
11. **Iterated on the template** during the session based on user feedback:
    - **Transitions:** initially used Shotstack's `fade` which fades through black and stacked `in`+`out` caused a double black-flash. Switched default to `none` (hard cuts) per user preference. Also fixed the clip-overlap math: clips now only overlap by 0.5s when there IS a transition to animate through; with `none`, clips are back-to-back so no frames are lost. The `transition` param accepts `carouselLeft`, `slideLeft`, `reveal`, `zoom`, etc. for future experimentation without code changes.
    - **Aspect-ratio-aware text sizing:** vertical (9:16) now uses `x-large` for titles and `large` for agent line; horizontal (16:9) stays at `large` and `medium`. Readability on phones improved.
12. **Documentation updates** — this file and in-session Claude memory updated to reflect MVP shipped state.

### Attempted but rolled back by an external process

A rename pass was executed against 11 files to replace legacy project names (`ReelReady`, `reelready`, `Real Estate Pipeline`) with the new canonical `Listing Elevate` / `listing-elevate`. **All 9 edits were reverted by something outside this session** — the files returned to their pre-edit state within minutes. The revert was detected via file-change notifications from the harness. Root cause is unknown — suspects include a Lovable auto-sync, another active editor, or an IDE hot-reload restoring stale buffers. **The user instructed to pause the rename work and not re-attempt it until the revert mechanism is identified.**

Also attempted: a hero-copy change in `src/pages/Index.tsx` replacing "Every property, in motion." with an animated "Take → Retain → Sell more listings." word-rotation. The user reverted that change immediately (not an external process — explicit "oops undo that"). File is back to original.

**Notably: none of the Shotstack MVP files (`lib/providers/shotstack.ts`, `lib/pipeline.ts`, `.env.example`, `.env`, `scripts/test-shotstack.ts`) have been reverted by the external process.** The revert may only affect files that match certain paths, or the process has stopped. Flagging but no longer actively blocking.

### Attempted but rolled back by an external process

A rename pass was executed against 11 files to replace legacy project names (`ReelReady`, `reelready`, `Real Estate Pipeline`) with the new canonical `Listing Elevate` / `listing-elevate`. **All 9 edits were reverted by something outside this session** — the files returned to their pre-edit state within minutes. The revert was detected via file-change notifications from the harness. Root cause is unknown — suspects include a Lovable auto-sync, another active editor, or an IDE hot-reload restoring stale buffers. **The user instructed to pause the rename work and not re-attempt it until the revert mechanism is identified.** See Section 5.

### Explicitly paused / not done

- **GitHub repo rename** (`theolivercollins/reelready` → `theolivercollins/listing-elevate`) — paused.
- **Local folder rename** (`/Users/oliverhelgemo/real-estate-pipeline` → `/Users/oliverhelgemo/listing-elevate`) — paused.
- **Vercel project rename** (so `listing-elevate.vercel.app` actually resolves) — paused.
- **File-level rename across 11 files** — paused until revert issue is resolved.
- **Committing the existing uncommitted work on `ui-redesign`** — not done. The user chose "option b": proceed without committing, rename the touched files manually later.

### Known open issues

- **File-revert mystery.** Unresolved. Flagged to the user, user said "don't worry about it for now." Any future work in this repo is at risk of the same revert until the mechanism is identified.
- **Uncommitted changes on `ui-redesign`**: 6 modified files (`.env.example`, `lib/db.ts`, `lib/pipeline.ts`, `lib/providers/kling.ts`, `lib/providers/provider.interface.ts`, `lib/providers/runway.ts`) and 1 new file (`lib/utils/claude-cost.ts`). State unknown — these may or may not overlap with Shotstack integration work.

---

## 5. Shotstack MVP — Next Executable Step

The MVP is deliberately narrow. Per explicit instruction from the user, the scope has been cut to the minimum that demonstrates value: **stitch clips together and add some text. No music. No voiceover. No ElevenLabs. No schema changes. No branding work.**

This is a proof that Shotstack works end-to-end in the pipeline. Everything else is deferred.

### MVP scope (one branch, one PR)

1. **Environment variable** — add `SHOTSTACK_API_KEY` (optionally `SHOTSTACK_API_KEY_STAGE` for sandbox) to `.env.example`. Consume in the provider via `process.env`.
2. **New provider file `lib/providers/shotstack.ts`** implementing:
   ```typescript
   export interface AssembleVideoParams {
     clips: Array<{ url: string; durationSeconds: number }>;
     overlays: {
       address: string;
       price: string;      // formatted, e.g. "$1,250,000"
       details: string;    // "4 BD | 3 BA"
       agent: string;
       brokerage?: string;
     };
     aspectRatio: "9:16" | "16:9";
   }

   export interface IVideoAssemblyProvider {
     name: "shotstack" | "ffmpeg";
     assemble(params: AssembleVideoParams): Promise<GenerationJob>;
     checkStatus(jobId: string): Promise<GenerationResult>;
   }

   export class ShotstackProvider implements IVideoAssemblyProvider { ... }
   ```
3. **Pure timeline builder** — `buildShotstackTimeline(params): ShotstackTimeline`. Unit-testable, no I/O. Responsibilities:
   - One video track with all clips concatenated, each clip's length set from `durationSeconds`.
   - One title asset for the opening overlay (`address`), 0–2s, white text with soft drop-shadow.
   - One title asset for the closing overlay (`price` + `details` + `agent` + `brokerage`), over the last 4s, same style.
   - Simple `fade` transition (0.4s) between clips.
   - Font: hardcode a single safe font (e.g. "Montserrat" or "Inter"). No brand colors in MVP.
   - `output.format = "mp4"`, `output.resolution = "1080"`, `output.aspectRatio` set from param.
4. **Pipeline wiring in `lib/pipeline.ts`**:
   - Replace the stub body of `runAssembly()` with: build params from existing scene/property data, call `ShotstackProvider.assemble()` twice (once for each aspect ratio the order needs), `pollUntilComplete()`, store returned URLs in `properties.horizontal_video_url` and `properties.vertical_video_url`.
   - Wrap in try/catch. On failure, log error and fall back to the current stub behavior (individual clips only, property marked complete). This prevents the full pipeline from failing if Shotstack has an outage.
5. **Sub-registry in `lib/providers/router.ts`** — add an `assembly` provider cache parallel to the generation provider cache. Env-gated on `SHOTSTACK_API_KEY`. `ffmpeg` stays available as a fallback provider for local/dev use.
6. **Log and cost tracking** — Shotstack returns render minutes in the webhook payload; log cost to `pipeline_logs` and `cost_events` per the existing pattern.
7. **End-to-end smoke test** — trigger a real pipeline run on a test property. Verify: both mp4s download, clips are stitched in the right order, text overlays are readable at both aspect ratios, duration is sane, no watermark.

### MVP non-goals (explicit)

- **No form-field persistence.** `selected_duration`, `selected_package`, etc. continue to be dropped. Videos will be whatever the director plans — duration is not enforced. This will be wrong for some orders but is acceptable for MVP.
- **No music.** Silent videos.
- **No voiceover, no ElevenLabs.**
- **No logo, no brand colors.** Static white text.
- **No revision chatbot.**
- **No QC implementation.** Clips still auto-pass.
- **No rename, no folder rename, no Vercel rename.**
- **No Supabase schema migration.**

### What's needed to start execution

1. **`SHOTSTACK_API_KEY`** (both Stage sandbox and Production keys from shotstack.io). Stage is free and lets testing happen without burning credits.
2. **Resolution of the file-revert issue** — or explicit user acknowledgment that they accept the risk of edits being reverted mid-work. The user has said to proceed despite this risk.

### Estimated effort

- Provider + timeline builder: 2–3 hours
- Pipeline wiring + error handling + both aspect ratios: 1–2 hours
- End-to-end test + debugging: 1–2 hours
- **Total: ~half a day of focused execution**, assuming the Shotstack key works and the file-revert issue doesn't interfere.

---

## 6. Post-MVP Roadmap (Ordered by Dependency)

This is the sequence once the MVP renders correctly. Each step is separable and can be scoped on its own. Total effort to reach the full promised product is roughly 2–3 weeks of focused work.

### Step 1 — Persist form fields (prerequisite for everything dynamic)

- Add columns to `properties`: `selected_package`, `selected_duration`, `selected_orientation`, `days_on_market`, `sold_price`, `add_voiceover`, `add_voice_clone`, `add_custom_request`, `custom_request_text`, `music_mood`.
- Update `createProperty()` in `lib/db.ts` and the form submit in `src/pages/Upload.tsx` to persist them.
- Update TypeScript types.
- **Effort:** ~1 hour of plumbing.
- **Unblocks:** everything dynamic in the video template.

### Step 2 — Join user_profile in assembly

- At assembly time, resolve the agent's full name, brokerage, `logo_url`, and brand colors from `user_profiles` (joined via the submitter's `auth.users` id).
- Feed these into the Shotstack timeline builder.
- Update `ShotstackProvider` to accept `logoUrl`, `brandColors` in its params.
- Update the timeline to place the logo in a corner and use brand colors for the overlay text.
- **Effort:** ~1–2 hours.
- **Unblocks:** branded videos, real agent identity.

### Step 3 — Duration enforcement

- Update `lib/prompts/director.ts` so the scene planner targets a total duration (15s/30s/60s) instead of a fixed scene count.
- Add a safety net: trim in Shotstack if total clip length exceeds target by more than 1s.
- Verify final video length is within ±1s of the requested duration.
- **Effort:** ~2 hours (real prompt engineering).
- **Unblocks:** the 15s/30s/60s product promise, pricing integrity.

### Step 4 — Package-specific templates

- Four package types need different opening/closing treatments:
  - **Just Listed:** animated "JUST LISTED" badge opening, emphasis on wow-factor clips.
  - **Just Pended:** "UNDER CONTRACT" badge, `daysOnMarket` on screen.
  - **Just Closed:** "SOLD" badge, `soldPrice` + `daysOnMarket` on screen.
  - **Life Cycle:** three videos generated in sequence (just_listed, just_pended, just_closed) from one order.
- Timeline builder branches on `selected_package`.
- **Effort:** ~3–4 hours.

### Step 5 — Music library (auto-selected per package for v1)

- Curate 5–8 royalty-free tracks (Pixabay Music, Mixkit, or YouTube Audio Library — all free and safe). Upload to Supabase Storage in a `music/` folder.
- Tag each with a mood (`luxury`, `upbeat`, `cinematic`, `warm`).
- At assembly time, pick a track based on `selected_package` + optionally the director's `music_tag` output.
- Add audio track to the Shotstack timeline with fade-in (0.5s), fade-out (2s), volume ducked to ~0.3 for background.
- **Effort:** ~3–4 hours.
- **Future:** user picker in the form (deferred to Phase 2).

### Step 6 — Voiceover via ElevenLabs

- Integrate ElevenLabs TTS API (`@elevenlabs/elevenlabs-js` or REST).
- New prompt file `lib/prompts/narration.ts` — Claude writes a narration script from property data + package type. Target duration matches selected video duration.
- ElevenLabs synthesizes the script in a default professional voice; upload the mp3 to Supabase Storage.
- Add audio track to Shotstack timeline, duck the music track while narration plays.
- Add `voiceover_script` and `voiceover_url` columns to `properties` for caching.
- **Effort:** ~4–6 hours.

### Step 7 — Voice clone (ElevenLabs voice cloning)

- Account settings page: agent uploads a 30+ second voice sample.
- Call `POST /v1/voices/add` on ElevenLabs → returns `voice_id`.
- Store `elevenlabs_voice_id` on `user_profiles`.
- At synthesis time, use the agent's `voice_id` if `add_voice_clone` was selected on the order; fall back to the default voice otherwise.
- **Effort:** ~3–4 hours on top of Step 6.

### Step 8 — Custom request handling

- If `add_custom_request` is true, pass `custom_request_text` to Claude's narration script generation as an additional instruction.
- **Effort:** ~30 minutes.

### Step 9 — Orientation respect

- If the order specifies only `vertical` or only `horizontal`, render only that aspect ratio (currently MVP would render both).
- Update the pipeline to conditionally call `assemble()` once or twice based on `selected_orientation`.
- **Effort:** ~30 minutes.

### Step 10 — Email delivery

- Pick an email provider (Resend recommended — simple DX).
- On pipeline completion, send the agent an email with the download link(s).
- Add `notification_email` to `user_profiles` or use `auth.users.email`.
- **Effort:** ~2–3 hours.

### Step 11 — End-to-end production validation

- Run 10 real properties through the full pipeline.
- Check duration accuracy, clip quality, text readability, music appropriateness, voiceover timing, brand correctness, email delivery.
- Tune the director and narration prompts based on actual output.
- **Effort:** ~1 full day.

### Step 12 — Revision chatbot (Phase 2 feature from `FUTURE-PLANS.md`)

- `/revise/:propertyId` page, chat UI, `POST /api/properties/:id/revise` endpoint, Claude tool-use with `edit_timeline`, `regenerate_clip`, `swap_music`, `rewrite_narration` tools, `revisions` table for history.
- **Effort:** ~1–2 days.
- **Why it waits:** don't start until Step 11 validates the base product. The chatbot is worthless if the initial videos aren't good.

---

## 7. What I Need From the User Before Execution Resumes

**Minimum to start the MVP (Section 5):**

1. **`SHOTSTACK_API_KEY`** — Stage (sandbox) and Production, from shotstack.io.
2. **Confirmation on the file-revert issue** — either identify what's reverting files and stop it, or explicitly accept the risk.

**Additional items to start Post-MVP Step 6 (voiceover):**

3. **`ELEVENLABS_API_KEY`** — from elevenlabs.io.

**Additional items to start Post-MVP Step 5 (music):**

4. **Music source decision** — royalty-free library (Pixabay/Mixkit/YouTube Audio Library, free, I default to this), subscription service (Epidemic Sound, Artlist, Soundstripe — requires API creds), or BYO uploads (user drops mp3s in a folder).

**Additional items to start Post-MVP Step 10 (email):**

5. **Email provider choice** — Resend recommended (simple API, generous free tier, good DX).

**One-time decisions that can wait until each is needed:**

- Branding direction for the video template. Default: "match `docs/REDESIGN-BRIEF.md` — Rivian × Apple, cinematic, deep blues."
- Voice clone MVP flow: agent uploads sample from Account page → we call ElevenLabs → store `voice_id` on profile. Default: yes.
- Hard don'ts (files to never touch, tables to never migrate, etc.).

**Things explicitly paused and NOT to resume without instruction:**

- GitHub repo rename.
- Local folder rename.
- Vercel project rename.
- Full file-level rename pass across 11 files.
- Committing the existing uncommitted changes on `ui-redesign`.
- Supabase schema migrations (waiting for Step 1 trigger).

---

## 8. File References

Critical files to read before executing:

- `lib/providers/provider.interface.ts` — existing `IVideoProvider` shape; new `IVideoAssemblyProvider` should mirror it.
- `lib/providers/router.ts` — provider cache and env-gating pattern.
- `lib/providers/kling.ts` — reference implementation for async-job + polling.
- `lib/providers/runway.ts` — second reference implementation.
- `lib/providers/luma.ts` — note the legitimate `keyframes` API field (do not rename during any future purge).
- `lib/pipeline.ts` — `runAssembly()` at ~line 634 is the stub being replaced.
- `lib/utils/ffmpeg.ts` — existing working assembly, keep as fallback provider.
- `lib/db.ts` — `createProperty()` is where persisted form fields land; also where the join to `user_profiles` will live.
- `src/pages/Upload.tsx` — the form and all the currently-dropped fields.
- `src/lib/presets.ts` — preset shape; note `STORAGE_KEY = "keyframe_presets"` is intentionally not renamed (localStorage migration risk).
- `src/pages/account/Profile.tsx` — where `logo_url` and brand colors are captured.
- `docs/FUTURE-PLANS.md` — Phase 2 roadmap (conversational revision chatbot and other ideas).
- `docs/REDESIGN-BRIEF.md` — brand direction (Rivian × Apple, cinematic deep blues).
- `docs/ARCHITECTURE.md` — pipeline architecture overview.
- `docs/KNOWLEDGE-BASE.md` — deep project context.
- `docs/TODO.md` — existing near-term to-do list (parallel to this plan).

---

## 9. Risks and Open Questions

### Risks

- **File-revert mystery** — ongoing. Any work in this repo may be silently reverted by an unknown process. Mitigation: save plans (like this doc) to version-controlled locations AND to Claude memory as a backup; commit work in small chunks as soon as it's validated.
- **Shotstack 2026 pricing drift** — numbers in Section 3 are from mid-2025. Verify before paying.
- **Kling/Runway quality variance** — Shotstack produces deterministic output but the input clips are AI-generated and ~10–20% may need HITL review. The automated QC to catch this is a deferred Phase 2 item.
- **300s Vercel function limit** — the full pipeline currently runs in one function. Adding Shotstack render polling (~60s) and ElevenLabs synthesis (~20s) adds budget pressure. May need to split into multiple functions or move to a worker at some point. Not an immediate problem.
- **Vercel bundle size** — adding new dependencies (`shotstack-sdk`, `@elevenlabs/elevenlabs-js`) to already-loaded Vercel functions. Prefer plain `fetch` over SDKs where reasonable.

### Open questions

- Do we want to fall through to the ffmpeg fallback provider for local development, or skip assembly entirely when `SHOTSTACK_API_KEY` is not set? Recommend: skip entirely and log a warning.
- Should `revisions` (Phase 2) be a separate table, or a JSON array column on `properties`? Recommend: separate table for queryability.
- When duration enforcement is added, should the trim happen in the director (fewer scenes / shorter scenes) or in Shotstack (trim the assembled output)? Recommend: both — director targets the duration, Shotstack enforces the cap.
- Should the voiceover script be visible to the agent for review before rendering, or auto-ship? Recommend: auto-ship for the autonomous vending-machine product; make it visible only in the revision chatbot.

---

## 10. TL;DR for a Fresh Session Picking This Up

1. **What's built:** nothing new in the codebase yet. Research done, discovery done, plan written. `docs/FUTURE-PLANS.md` and this file exist.
2. **What to build first:** the Shotstack MVP in Section 5 — stitch clips + text overlays only. Everything else is deferred.
3. **What you need to start:** Shotstack API key. That's it.
4. **What's paused and stay-paused until told otherwise:** rename pass, GitHub repo rename, local folder rename, Vercel project rename, Supabase migrations.
5. **Known hazard:** file edits in this repo have been reverted by an unknown external process once in this session. Work may disappear. Save plans to memory as a backup.
6. **Critical files:** `lib/providers/{kling,runway}.ts` (reference patterns), `lib/pipeline.ts:runAssembly` (replacement target), `lib/utils/ffmpeg.ts` (keep as fallback).
7. **Roadmap after MVP:** persist form fields → join profile → enforce duration → package templates → music → voiceover → voice clone → email delivery → end-to-end validation → revision chatbot. Sections 6 for details.
