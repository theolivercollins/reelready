# Session 2026-04-20 — Back-on-Track: mastery sequencing + cost-integrity scramble

Last updated: 2026-04-20

See also:
- [../HANDOFF.md](../HANDOFF.md) — current state
- [../specs/2026-04-20-back-on-track-design.md](../specs/2026-04-20-back-on-track-design.md) — full roadmap spec
- [../audits/ML-AUDIT-2026-04-20.md](../audits/ML-AUDIT-2026-04-20.md) — Phase M.1 verdict from this session
- [../traces/](../traces/) — director-prompt traces produced this session
- [../state/PROJECT-STATE.md](../state/PROJECT-STATE.md) — authoritative state (updated same day)

## Starting state

Oliver entered the day with real frustration. Three things were colliding:

1. **Money was going out, quality wasn't going up.** A lot of spend (OpenAI + Anthropic + Atlas) had accumulated over the preceding two weeks building the multi-photo listings Lab (Phase 2.8), the Atlas + 6-SKU pivot, and the Shotstack integration MVP. The observed clip quality after all that work had not crossed the "client-ready" bar.
2. **The director was producing verbose, fluffy prompts.** The `CAMERA_STABILITY_PREFIX` ("LOCKED-OFF CAMERA…") was being prepended to every Atlas submission regardless of model. Scene Editor (Haiku 4.5) was rewriting user directives into verbose paragraphs. Everything read like marketing copy instead of director shorthand.
3. **Two prompt-lab surfaces existed.** Legacy single-photo Lab (`/dashboard/development/prompt-lab`) plus the new Phase 2.8 listings Lab (`/dashboard/development/lab`). Data and ratings were split; the user had to think about which surface to use.

The morning's ask: stop shipping features, step back, produce a sequenced plan that gets the video generation to "mastered" before any further polish. Output: the [`back-on-track-design`](../specs/2026-04-20-back-on-track-design.md) spec. Six phases (A, M, D, B, C, CI) scoped and approved by mid-morning.

## What shipped by phase

### Phase A — Lab UX "next-action spine"

The Lab's top bar became a colored `NextActionBanner`. Per-scene status chips got added to `ShotPlanTable` driven by two pure resolvers (`src/lib/labSceneStatus.ts`, `src/lib/labNextAction.ts`) with 17 unit tests. Rate + scene-archive mutations became optimistic with rollback-on-error. "Done" changed from emerald to slate (grey) so it no longer competed visually with the teal "rate" action. Commits: `7818cfd`, `9995657`, `d6c57a0`, `858577c`, `14bdfed`.

### Phase M.1 — Director-prompt trace audit

Oliver suspected the rating → embedding → retrieval → director-injection chain might be silently broken. A read-only subagent built `scripts/trace-director-prompt.ts` that reconstructs the exact director user message for any listing or property by running retrieval RPCs live. Two traces captured (one listing `dd552c89`, one property `6f508e16`), saved under `docs/traces/`. Full audit report at [`audits/ML-AUDIT-2026-04-20.md`](../audits/ML-AUDIT-2026-04-20.md).

**Verdict: WORKING WITH GAPS.** The chain IS wired end-to-end. 108 rated legacy Lab iterations feed retrieval. But two holes: (a) Lab→prod recipe promotion has NEVER been used — zero overrides ever promoted; (b) only 7 of 24 prod scenes have embeddings. Commits: `a763aca`, `1771ab6`, `3eced31`, `8cf3fd9`, `6b5da62`, `41e4290`.

### Phase DQ — Director concise prompts (director-quality)

The verbose-prompt diagnosis turned out to have multiple overlapping sources:

- `CAMERA_STABILITY_PREFIX` was being prepended to every model's submission (~180 chars of "LOCKED-OFF CAMERA…" fluff)
- Scene Editor system prompt let Haiku rewrite the user's one-line directive into a full paragraph
- The render path was doing raw `ADDITIONAL USER DIRECTIVES: …` concatenation instead of asking Sonnet to rewrite

Fixes:
- `DIRECTOR_SYSTEM` rewritten with a PROMPT STYLE section: ≤120 chars single-image, ≤250 paired, single-sentence. Banned phrases enumerated ("Motion is fluid", "Emphasize X", em-dash trajectories). Legacy 5★ examples included as CONTENT patterns — with a guardrail: "exemplars are CONTENT patterns not LENGTH permission."
- `CAMERA_STABILITY_PREFIX` gated to `kling-v3-*` only. v2.x + o3 stopped receiving it. Atlas `negative_prompt` still carries shake mitigation for every request.
- Paired scenes (`use_end_frame && end_image_url`) auto-route to `kling-v2-1-pair` unless caller explicitly lists models (Compare flow).
- Default model for new listings flipped from `kling-v3-pro` → `kling-v2-6-pro` (better motion, lower cost).
- New `lib/refine-prompt.ts` — uses Sonnet 4.6 to rewrite `scene.director_prompt` incorporating `refinement_notes` at render time, replacing the raw concat.

Commits: `734afa9`, `1e8893f`, `6fceb2c`.

### Phase DM — Dev / Legacy merge + native Kling revival

The legacy Prompt Lab surface was deprecated but still alive. Kept it alive to preserve 108 rated iterations' data; retired the UI. `/dashboard/development/prompt-lab/*` now redirects to `/dashboard/development/lab`. `PromptLab.tsx` + `PromptLabRecipes.tsx` kept on disk for reference but not imported. Legacy tables (`prompt_lab_sessions`, `prompt_lab_iterations`, `prompt_lab_recipes`) untouched — they still feed unified retrieval via `v_rated_pool`.

**Native Kling revival:** Oliver had pre-paid credits on the direct Kling account that were going to waste under the Atlas-only routing. Added `kling-v2-native` as the first model in the picker. `lib/providers/dispatch.ts::pickProvider(modelKey)` routes native vs Atlas. On 402/credit-exhaustion, auto-failover to Atlas `kling-v2-master`. Cost events logged with `provider='kling', billing='prepaid_credits'` so the dashboard shows what was burned vs billed.

Also in DM: `lib/sanitize-prompt.ts` strips any `LOCKED-OFF CAMERA…` variants from persisted prompts on write AND at render time (cleans up the historical pollution). Scene Editor system prompt (Haiku 4.5) now carries the same PROMPT STYLE rules as DQ.1.

UI polish: "Compare models" demoted to `More ▾` dropdown. Primary Render button shows SKU + cost inline (e.g. `Render v2.6 Pro $0.60`). "Render all" shows true multi-SKU total. Submit has a `window.confirm()` with the dollar total.

Commits: `d9e6f1f`, `8a06b66`.

### Phase CI — Cost integrity (the scramble)

The cost-tracking realization was the most painful moment of the day. Oliver pulled up his real Atlas invoice: **$33**. Dashboard showed: **$4.80**. Off by ~7×.

Investigation surfaced two compounding Atlas bugs:
1. `checkStatus` returned the default model's price regardless of SKU — so every iteration was being priced at `v3-pro` rates even if it rendered on `v2-6-pro`.
2. `priceCentsPerClip` had been set to the per-second rate — so a 5-second clip on `v2-6-pro` was logging $0.12 instead of $0.60.

Both fixed in commit `124adfc`. 12 historical rows backfilled. Listing `dd552c89` re-totaled from $4.80 → $30.20, matching invoice within rounding.

The broader CI sweep (CI.1–CI.5) landed same day:

- **CI.1** — `computeClaudeCost(usage, model)` with rate tables for Opus 4.x / Sonnet 4.x / Haiku 4.5. All 5 call sites updated. Haiku 4.5 stopped being billed at Sonnet rates.
- **CI.2** — `embedText` returns `{ totalTokens, costCents }`. 5 OpenAI embedding call sites log `cost_events` with `provider='openai', unit_type='tokens', stage='embedding'`.
- **CI.3** — Shotstack changed from flat `$0.10/render` to `ceil(minutes) × SHOTSTACK_CENTS_PER_MINUTE` (default 20¢/min). Uses API-returned duration; falls back to summed clip durations.
- **CI.4** — Failed-render cost policy. Atlas failed renders log full SKU cost with `metadata.render_outcome='failed'` (over-attribute; reconcile vs invoice). Native Kling failed renders log $0 with `metadata.billing='prepaid_credits_failed_refunded'` because Kling actually refunds.
- **CI.5** — Cost dashboard drill-down by provider / scope / SKU.

New tool: `scripts/cost-reconcile.ts` dumps `cost_events` + iteration costs by provider/SKU for a date range. Intended weekly run against invoices.

Commits: `464f25d`, `2079822`, `3c392cf`, `0b020f3`, `124adfc`.

### Phase C — Production end-to-end

The final push of the day. Production pipeline (`lib/pipeline.ts`) was still sending base64 image payloads to providers in 4 places, still routing via hardcoded Runway/Kling branches, and had no duration awareness (always 60s). Shipped:

- Router now returns a `ProviderDecision` type the pipeline consumes, so Lab's routing logic and prod's are unified.
- All 4 base64 → URL sites converted (photos are now always passed as public Supabase Storage URLs).
- Director got duration-aware — reads `properties.selected_duration` optimistically with `maybeSingle()`, defaults to 60s if absent. Scene count adjusts: 15s=4, 30s=6–8, 60s=12.
- Lazy failover from native Kling to Atlas on credit depletion is active in prod too, not just Lab.

Commit: `9283260`.

Note: `properties.selected_duration` column doesn't exist yet in the prod schema. The read is defensive. Order-form persistence (Phase deferred) will add it.

## Cost tracking realizations

The $33 vs $4.80 discovery was the biggest wake-up. Three takeaways, now committed to memory:

1. **Never trust a default price.** `checkStatus` returning the default SKU's price when the caller passed a different SKU was silent for weeks. Every cost-logging path needs the actual SKU in scope.
2. **Per-clip vs per-second is a footgun.** Mistaking one for the other looks identical in code (`priceCentsPerClip: 12` could be either) and only shows up when you reconcile against invoices.
3. **Reconcile weekly.** `scripts/cost-reconcile.ts` exists now — it's a first-class ops routine, not optional.

Memory note added: `feedback_cost_tracking_first_class.md`.

## The DM / Prompt Lab merge + native Kling

The DM merge preserved rated data while removing user-facing duplication. One Lab UI, two pools of ratings flowing into the same retrieval. The native Kling revival was an Oliver ops call — the pre-paid credits represented real dollars sitting idle on the Kling direct account. Routing via `lib/providers/dispatch.ts` means the switch is one function, not scattered conditionals.

## Director prompt fluff diagnosis + fix (the aesthetic layer)

Worth recording: the fix was not "write better rules" — it was "find every place that adds words to the prompt and gate them." Three sources: stability prefix, Scene Editor rewrite, render-time concat. Each had an independent fix. The guardrail "exemplars are CONTENT patterns not LENGTH permission" was added after an early iteration where Sonnet saw the 5★ examples and produced longer prompts matching their verbosity — exactly the opposite of what was wanted.

## What didn't ship

- **Phase M.2** was dispatched and rejected. Scope was: SKU capture in `prompt_lab_recipes.model_used`, dead-code removal on the retired legacy Lab files, prod embedding backfill (17 of 24 scenes). Needs re-dispatch or explicit skip decision.
- **Phase B** (model head-to-head) is blocked on M.2 + Oliver's rating hands. Plan: one fresh listing, 6 SKUs per scene, rate the grid, produce `lib/providers/router-table.ts` mapping (room × movement) → winning SKU.
- Everything downstream of "video generation mastered" is deferred: Shotstack assembly polish, email/webhook delivery (Resend), order form persistence, voiceover (Eleven Labs), brokerage branding, music pipeline, autonomous Lab runner.

## Open questions / followups

- **Is native Kling actually cheaper than Atlas `kling-v2-master` for the shots v2-master wins on?** Pre-paid credits make the ROI fuzzy until the pre-paid bucket runs out. Worth a mini-audit after the first $50 on Atlas v2-master post-failover.
- **Prod scene embedding backfill** — 17 missing. Scripts exist from Phase 2.8; just need to run + verify.
- **Atlas SKU pricing for models other than `v2.6-pro`** may still be miscalibrated. Next invoice cycle is the test. `scripts/cost-reconcile.ts` is the tool.
- **Legacy Lab dead-code removal** — files still on disk but not imported. Part of M.2. Low risk, not urgent.
- **`selected_duration` column** — add in the order-form persistence work. Until then the pipeline reads defensively.

## Cost snapshot

Rough end-of-day spend for the session's work itself (not production renders):
- Claude Sonnet/Haiku across director + scene editor + trace audit: ~$3–5 (rough)
- OpenAI embeddings for the backfill dry-runs: < $0.50
- Atlas renders during DQ/DM validation: ~$2–4 on `v2-6-pro` test scenes

The bigger money story was reconciling the previously-under-logged $33 against the corrected dashboard, not new spend.
