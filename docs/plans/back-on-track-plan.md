# Back-on-Track Plan — Video Generation Mastery

Last updated: 2026-04-20

See also:
- [../HANDOFF.md](../HANDOFF.md) — right-now state + shipping log
- [../specs/2026-04-20-back-on-track-design.md](../specs/2026-04-20-back-on-track-design.md) — full design spec (authoritative)
- [../state/PROJECT-STATE.md](../state/PROJECT-STATE.md) — what's shipped
- [../audits/ML-AUDIT-2026-04-20.md](../audits/ML-AUDIT-2026-04-20.md) — Phase M.1 verdict
- [FUTURE-PLANS.md](./FUTURE-PLANS.md) — post-mastery backlog

## Summary

Ship a production pipeline that autonomously turns an agent's 10–60 photos into a client-ready cinematic MP4. Before that: the Lab has to be intuitive (Phase A), the learning loop has to be verified (Phase M), prompts have to be concise (Phase DQ), the Lab surface has to be one (Phase DM), cost tracking has to be honest (Phase CI), the winning SKU per (room × movement) bucket has to be known (Phase B), and the prod pipeline has to route + duration-adapt correctly (Phase C).

Everything downstream of mastery is deferred: Shotstack polish, email delivery, order-form persistence, voiceover, branding, music, autonomous iterator.

## Phase status

| Phase | Status | Summary |
|---|---|---|
| A — Lab UX spine | shipped | `NextActionBanner`, per-scene status chips, optimistic mutations |
| M.1 — Director-prompt trace audit | shipped | Learning loop works end-to-end with gaps ([audit](../audits/ML-AUDIT-2026-04-20.md)) |
| DQ — Director concise prompts | shipped | ≤120/≤250 char rules, stability prefix `kling-v3-*`-only, paired auto-route, default flipped to `kling-v2-6-pro`, `refine-prompt.ts` at render time |
| DM — Dev/Legacy merge | shipped | One Lab UI, native Kling added (pre-paid credits), Compare demoted, legacy UI retired (data preserved) |
| CI — Cost integrity (CI.1–CI.5) | shipped | Model-aware Claude pricing, OpenAI embedding tracking, Shotstack per-minute, failed-render policy, dashboard drill-down, `cost-reconcile.ts` |
| C — Production end-to-end | shipped | Router `ProviderDecision`, base64 → URL, duration-aware director, lazy failover |
| M.2 — ML consolidation | **rejected, re-dispatch decision pending** | SKU capture in `prompt_lab_recipes.model_used`, dead-code removal, prod scene embedding backfill |
| B — Model head-to-head | **blocked on M.2 + Oliver's rating hands** | One fresh listing, 6 SKUs per scene, rate, build `lib/providers/router-table.ts` |

## What "mastered" means (success criteria)

- **Phase A** — a listing with 10+ scenes feels one-click-at-a-time to work through. "What's next?" is always answered by the UI, not by the user hunting. *(Shipped)*
- **Phase M** — `scripts/trace-director-prompt.ts` produces a director prompt transcript on any listing / property and the transcript shows PAST WINNERS / LOSERS / RECIPE blocks populated (or proves them missing). *(M.1 shipped; M.2 pending)*
- **Phase B** — `lib/providers/router-table.ts` commits one winning SKU per (room × movement) bucket where "winning" = ≥80% of that SKU's iterations in the bucket rated 4★+ AND Oliver's qualitative "client-ready" sign-off.
- **Phase C** — pipeline produces a full property of clips routed per the table, duration-aware scene count (15s=4, 30s=6–8, 60s=12), no base64 payloads, lazy failover from native Kling to Atlas on credit depletion. *(Shipped — router-table.ts is the remaining dependency.)*

## What's next (the single next action)

1. **Decide: re-dispatch M.2 or skip it.** M.2 is the cleanest unlock for Phase B because SKU capture in `prompt_lab_recipes.model_used` is required to compare like-for-like across SKUs in the head-to-head rating. Without it, Phase B ratings can't be bucketed by SKU reliably.
2. After M.2: schedule Phase B with Oliver. Phase B is a rating session, not a coding session. Plan for 1–2 hours of rating once 40–60 iterations are generated.
3. Once `router-table.ts` exists: verify prod routes through it end-to-end on one real property. That closes the loop Phase C opened.

## Phase B plan (for when the time comes)

- Pick one fresh listing (10–12 photos spanning kitchen, living_room, master_bedroom, exterior_front, aerial minimum).
- Director produces the scene plan once.
- Per scene, render all 6 Kling SKUs (`v3-pro`, `v3-std`, `v2-6-pro`, `v2-1-pair` for paired, `v2-master`, `o3-pro`). Budget: ~$0.60 × 6 × 12 ≈ $45.
- Oliver rates each iteration 1–5★ + rating reasons.
- Build `router-table.ts`: for each (room × movement) bucket with ≥3 rated iterations and a ≥80% 4★+ winner, commit the winning SKU. Otherwise default to `kling-v2-6-pro`.
- Verify prod consumes the router table. Regenerate one property; confirm SKU selection matches the table.

## Phase M.2 detail (reference, from the spec)

- **M.2a** — Capture `model_used` on `prompt_lab_recipes` so recipes can be filtered by SKU during retrieval.
- **M.2b** — Remove retired legacy Lab UI files (`PromptLab.tsx`, `PromptLabRecipes.tsx`) — they're no longer imported; delete from disk. Tables + data preserved.
- **M.2c** — Backfill prod scene embeddings (17 of 24 missing per M.1 audit). Scripts already exist from Phase 2.8; run + verify.
- **M.2d** — SKU-level signal capture so Phase B ratings can be bucketed per SKU.

## Deferred (explicit non-goals until mastery ships)

- Shotstack assembly polish (reverse clips, beat sync, smart vertical cropping)
- Email / webhook delivery (Resend)
- Order form persistence (duration, orientation, voiceover toggles, custom request)
- Eleven Labs voiceover, voice clone
- Brokerage branding render (logo, colors)
- Music pipeline
- Feature shots as a first-class scene type
- Legacy Lab UI retirement beyond dead-code removal
- Autonomous Lab runner
- Client-side photo compression, realtime subscriptions, full production QC

All of the above are tracked in [FUTURE-PLANS.md](./FUTURE-PLANS.md) or as deferred sub-phases within the back-on-track design.
