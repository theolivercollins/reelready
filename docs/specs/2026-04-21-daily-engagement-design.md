# Daily Engagement Design — 4-Session Parallel Model

Last updated: 2026-04-21

See also:
- [../HANDOFF.md](../HANDOFF.md) — current state + shipping log
- [../briefs/](../briefs/) — per-window Round 1 briefs
- [../audits/test-render-log-2026-04-21.md](../audits/test-render-log-2026-04-21.md) — shared log for every test render across all windows
- [../plans/back-on-track-plan.md](../plans/back-on-track-plan.md) — higher-level roadmap this plan serves
- [../specs/2026-04-20-back-on-track-design.md](./2026-04-20-back-on-track-design.md) — full mastery spec

**Date:** 2026-04-21
**Status:** Approved for Round 1 execution
**Owner:** Oliver; Coordinator = Claude in `/Users/oliverhelgemo/real-estate-pipeline` main worktree

## North Star — Oliver's 4 criteria for "perfect" video generation (launch A)

1. **No HITL** — pipeline self-selects SKU, self-retries, self-fails over
2. **No hallucinations** — director respects source photo + past ratings
3. **No wasted money** — correct SKU first try; failover only on credit/error
4. **Right SKU per (room × movement)** — driven by existing rating signal, not a fresh rating grid

Every piece of work produced under this plan MUST map to one of the four. If it doesn't, don't do it.

## Operating model — 4 concurrent Claude Code windows

| Window | Role | Worktree | Branch |
|---|---|---|---|
| **A — Coordinator** | Writes briefs, reviews branches, consolidates to `main`, updates memory + HANDOFF | `/Users/oliverhelgemo/real-estate-pipeline` | `main` |
| **B — DA.1 Land** (today) | Finish + test + commit the Gemini-eyes DA.1 work already drafted on disk | `.worktrees/wt-da1` | `session/da1-land-2026-04-21` |
| **C — Rating Ledger UI** | Build `/dashboard/rating-ledger` so Oliver can see every rating linked to image + clip + SKU + retrieval status | `.worktrees/wt-ledger` | `session/ledger-2026-04-21` |
| **D — Router aggregation** | Build `scripts/build-router-table.ts` that reads existing rated data and emits a draft `lib/providers/router-table.ts` + coverage-gap report | `.worktrees/wt-router` | `session/router-2026-04-21` |

**Isolation:** each worker stays inside its worktree. Never edit files outside its worktree path. Never push to origin.

## Daily rhythm (repeatable every working day)

1. **Coordinator open (30m)** — read yesterday's consolidation + memory, pick today's priorities, write briefs, spin worktrees.
2. **Round 1 (3h concurrent)** — B/C/D execute; A monitors + unblocks.
3. **Coordinator consolidate (30m)** — review each branch, merge clean work to `main`, kick back gaps, write Round 2 briefs informed by Round 1 findings.
4. **Round 2 (3h concurrent)** — B/C/D execute next briefs.
5. **Coordinator wrap (45m)** — final consolidate, update memory + `HANDOFF.md` "Right now", write tomorrow's first three actions, commit.

## Self-check discipline (MANDATORY for every worker session)

Each worker window MUST:
1. Keep a live session log at `docs/sessions/2026-04-21-window-<B|C|D>.md`.
2. Every ~45 minutes AND at every major milestone (plan change, dependency unblocked, test pass/fail, stuck >15m), append a **Self-check** entry answering:
   - (a) Which of Oliver's 4 North-Star criteria is this step serving?
   - (b) Is this the highest-leverage next step, or would a different approach close the gap faster?
   - (c) What's my evidence the work is actually working (test output, screenshot, query result)?
   - (d) If (b) says pivot — stop, commit WIP, document the pivot reason.
3. If stuck >30 minutes on the same problem: stop, commit WIP with a clear `WIP — stuck on X` message, and write a subagent dispatch brief asking for help.

## Docs-subagent (runs in each window before every commit)

Each worker dispatches a Sonnet subagent with this prompt:
> "Update `docs/HANDOFF.md` (add one line to Recent shipping log, update Right now if next-action changed). Update `docs/state/PROJECT-STATE.md` if phase or feature state changed. Update the relevant memory file in `~/.claude/projects/-Users-oliverhelgemo/memory/` if cold-entry info changed. Before committing: run `git status`, confirm only files inside this worktree are modified, then commit with a clean message."

## Shared render log

Every test render in any window appends a row to `docs/audits/test-render-log-2026-04-21.md` with: timestamp, window, scene_id, prompt_before (or N/A), prompt_after, SKU, cost_cents, clip_url (or task_id), observation. **Zero off-log renders.**

## Governance

- No git push, no Vercel deploy without explicit in-turn permission.
- Local commits fine. Commit in small chunks.
- End-of-day coordinator consolidation merges worktree branches into `main` with a diff summary for Oliver's approval.
- Never delete docs — archive to `docs/archive/` with a note.

## Round 1 exit bar

- **B:** DA.1 Gemini analyzer live in the pipeline on its branch, end-to-end tested on one real photo, motion_headroom observed in one director prompt, committed.
- **C:** `/dashboard/rating-ledger` opens, shows one row from Oliver's recent ratings with image + clip + SKU + stars + reasons.
- **D:** `scripts/build-router-table.ts` runs, emits a draft table + coverage report showing which (room × movement) buckets have ≥3 iterations with a ≥80% 4★+ winner.

## Round 2 (provisional, finalized during Round 1 consolidation)

- **B:** ML flow audit (is every rating linked and retrievable?) + legacy-vs-dev-Lab regression diff — now done on the POST-DA.1 codebase so findings reflect the intended end state.
- **C:** Polish Ledger — add retrieval-status badges from B's audit data, add (room × movement × SKU) coverage heatmap from D's output.
- **D:** Wire `router-table.ts` into `lib/providers/router.ts`; test auto-SKU selection on one verification property.

## Open questions

- Regression-diff anchor listings: "San Massimo", "Manasota Key", "Kittiwake" — Legacy Prompt Lab. Window B Round 2 resolves in the audit.
- Old worktree cleanup: `back-on-track`, `machine-learning-improvement`, `new-shell`, `mesquite-agave` — pruned after Round 1 starts (separate coordinator task).
