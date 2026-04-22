# V1 Prompt Lab — UX Plan (deferred implementation)

Last updated: 2026-04-22
Status: deferred — implementation scheduled between P2 auto-judge (2026-04-24) and P3 retrieval upgrade (2026-04-25 start)
Source audit: `docs/audits/v1-lab-ux-friction-2026-04-22.md`

## Purpose

Turn V1 Prompt Lab into Oliver's smoothest daily-driver surface. Addresses the 11 quick/medium wins enumerated in the friction audit. This plan locks scope + priority + blocks so a future 1-session UX sprint (2026-04-24 evening or 2026-04-27 post-P3-S2) can execute without redesign.

## North Star mapping

- NS #1 (no HITL): reduced friction = more ratings per hour = faster feedback loop.
- NS #2 (no hallucinations): cold-spot indicator (QW-new) + retrieval panel (MW4) surface when the director is flying blind.
- NS #3 (no wasted money): per-iteration cost + per-session cost + pre-render cost confirmation (G4.*, MW1).

## ML-roadmap integration (do NOT ship early)

Some UX elements depend on downstream ML phases. Ship order matters.

| UX element | Blocks on | Lands in phase |
|---|---|---|
| Retrieval match-percentage panel (true P3 design) | P3 Session 2 hybrid retrieval + normalized scores | 2026-04-26 |
| Judge-rating chip on IterationCard (score + override) | P2 Session 2 calibration loop | 2026-04-24 |
| "Rate these first" leverage-scored panel | P6 active learning (needs P2 judge + P5 bucket stats) | 2026-05-02 |
| Bucket-progress scoreboard / bandit dashboard | P5 Thompson router `router_bucket_stats` | 2026-04-30 |
| Pairwise A/B compare modal | P6 Bradley-Terry backend | 2026-05-02 |

**Quick wins QW1–QW6 + medium wins MW2–MW5 are independent of ML phases** and can ship any time after P1 lands. MW4 (retrieval panel) is a preemptive scaffold that P3 Session 2 upgrades rather than rebuilds.

## Quick wins (1-session sprint, ≤ 4h total)

Ordered by leverage-per-hour. All land in one PR.

1. **QW1 — Flip "Unbatched" sort to last.** One-line comparator change at `PromptLab.tsx:363-369`. Highest daily-impact-per-line-of-code win in the audit.
2. **QW3 — Archive icon fix (Trash2 → Archive).** Eliminates delete-vs-archive anxiety. Pure icon swap at `PromptLab.tsx:437-440`.
3. **QW6 — "Save rating" button dims when refine text is entered.** Kills the double-save confusion at `PromptLab.tsx:1441-1450`. Add `(included in refine)` ghost label when `chat.trim().length > 0`.
4. **QW2 — Split `RATING_TAGS` into POSITIVE_TAGS / NEGATIVE_TAGS with section labels.** Cuts rating-time scan cost. `PromptLab.tsx:36-49, 1411-1428`.
5. **QW4 — "Analyzing…" state on SessionCard.** Uses existing "Rendering" amber-pill pattern. `PromptLab.tsx:699-730`. Closes the 15s-blind-spot gap.
6. **QW5 — Session cost chip on list cards.** Requires `total_cost_cents` on `LabSession` (server-side view or RPC); if not already present, add a migration-free SELECT sum. UI at `PromptLab.tsx:731-744`.

**Budget:** 3h. Single PR. Zero ML-phase dependency.

## Medium wins (size-2 sprint, ~1 day of work)

Land in priority order; break at whatever point the day runs out.

1. **MW3 — "Re-render" only on latest iteration.** Hides the re-render row on historical iterations or collapses it into on-demand expand. `PromptLab.tsx:1327-1349`. ~1h. Single biggest vertical-scroll reduction in the audit.
2. **MW4 — Expandable retrieval panel (pre-P3 scaffolding).** Replace tooltip-only chips with a `<details>` panel showing top-3 exemplars with rating + motion verb + prompt excerpt + distance-as-percent. `PromptLab.tsx:1124-1158`. ~2h. P3 Session 2 upgrades the score math; the UX shell is reusable.
3. **MW1 — Cost breakdown chips (header + per-iteration).** Extend `IterationCard` + session header to show `cost_cents` per iteration + break totals by scope (analysis / render / refine). Requires `scope` join on `cost_events`. ~2h. High-value once P2 adds judge cost.
4. **MW2 — Kill `prompt()`/`alert()` calls.** Replace batch-rename prompts + error alerts with inline UI. `PromptLab.tsx:329, 388, 323, 342, 354`. ~2-3h. Polish, but cumulatively meaningful.
5. **MW5 — Global search / filter bar.** Client-side filter on `sessions` by `label`, `archetype`, `batch_label`, tags. `PromptLab.tsx:277-608`. ~2-3h. Leverage grows with corpus size; defer until sessions > 50.

**Budget:** 1 session = 6-8h. Ship MW3 + MW4 first; they are the highest-impact daily-driver wins.

## Explicit non-goals for this plan

- **Upload flow friction F1.1–F1.5** — audit flagged these but they are less acute in daily use. Revisit if upload-path friction reports continue.
- **F3.7 side-by-side compare** — deferred to P6 pairwise UX.
- **F3.8 PromoteRecipeControl conditional visibility** — acceptable friction; the 4★ gate is intentional quality control.
- **F3.9 archetype slug cleanup** — cosmetic; flag for future polish but not daily-driver-critical.
- **G4.3 3-decimal-place cost formatting** — judgment call; leave alone until someone complains.
- **No production pipeline UI changes** — prod ships via email; no UI.

## Out of scope (owned by later phases)

- OS1 auto-judge rating chip — P2 Session 2 deliverable
- OS2 retrieval percentage-match — P3 Session 2 deliverable
- OS3 SKU selector — already ships in P1 (today)
- OS4 legacy iteration missing director — P4 backfill
- OS5 pairwise compare — P6
- OS6 bandit dashboard — P5
- OS7 "rate these first" — P6

## Sequencing recommendation

Schedule the quick-win sprint for the **2026-04-24 evening slot** (after P2 Session 2 lands the judge-chip UX). Bundle with the P2 judge-rating chip UI work so both land in the same PR and Oliver gets a visible friction-drop in one session.

Schedule the medium-win sprint for **2026-04-27 post-P3-Session-2**. MW4 builds on the retrieval surface P3 lands; other MWs are independent and fill remaining time.

## See also

- `docs/audits/v1-lab-ux-friction-2026-04-22.md` — source audit
- `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md` — program spec
- `docs/plans/2026-04-22-p1-v1-foundation-plan.md` — P1 execution plan (today)
