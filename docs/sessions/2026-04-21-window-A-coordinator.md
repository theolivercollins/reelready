# Window A — Coordinator session handoff (2026-04-21)

Last updated: 2026-04-21
Owner: Oliver
Coordinator home: `/Users/oliverhelgemo/real-estate-pipeline` (main branch)

## Purpose of this session

Oliver wanted to end the "messy development" state and run parallel Claude Code sessions against one goal: **make video generation perfect — no HITL, no hallucinations, no wasted money, right SKU per (room × movement)**.

This session designed the 4-session daily engagement pattern, discovered that substantial "lost" DA.1 work was actually uncommitted on `main`, reshaped Round 1 around landing it, and dispatched 3 worker windows.

## Oliver's 4 North-Star criteria for "perfect" (memorize, route every decision through these)

1. **No HITL** — pipeline self-selects SKU, self-retries, self-fails over
2. **No hallucinations** — director respects source photo + past ratings
3. **No wasted money** — correct SKU first try; failover only on credit/error
4. **Right SKU per (room × movement)** — driven by existing rating signal, not fresh rating grid

## What was decided

- Replace the "fresh rating grid" Phase B with audit-first: build `router-table.ts` from Oliver's existing hundreds of ratings (legacy Lab, Phase 2.8 listings Lab, prod `scene_ratings`).
- Run 4 concurrent Claude Code windows daily: Coordinator (A) + 3 workers (B/C/D) in dedicated git worktrees. 2 rounds × 3h per day.
- Each worker does **self-check every ~45 min** against Oliver's 4 criteria; pivots if not on the highest-leverage path.
- Render budget for Round 1: $15 for Window B (DA.1 tests); $0 for C and D. Every render logs to `docs/audits/test-render-log-2026-04-21.md`.

## Major discovery

`lib/providers/gemini-analyzer.ts` (394 lines, complete) + migration `030_photo_camera_state.sql` + substantial edits to `lib/pipeline.ts`, `lib/prompts/director.ts`, `lib/prompt-lab-listings.ts` were uncommitted on `main`. This is the "Gemini as eyes" work Oliver thought was lost. It's the concrete fix for the regression he's been hitting since the Dev Lab / Kling v3 switch (director hallucinating camera moves because it has no structured camera-state input). The work was stashed from `main` and moved into `.worktrees/wt-da1` so it can be landed cleanly by Window B.

## Current state

### Committed on main (commit `e478ed5`)
- `docs/specs/2026-04-21-daily-engagement-design.md` — the authoritative design
- `docs/briefs/2026-04-21-window-B-da1-land.md`
- `docs/briefs/2026-04-21-window-C-rating-ledger.md`
- `docs/briefs/2026-04-21-window-D-router-aggregation.md`
- `docs/audits/test-render-log-2026-04-21.md` — shared render log

### Worktrees live
| Worktree | Branch | Status |
|---|---|---|
| `.worktrees/wt-da1` | `session/da1-land-2026-04-21` | DA.1 WIP popped; Window B will finish + test + commit |
| `.worktrees/wt-ledger` | `session/ledger-2026-04-21` | Clean; Window C builds Rating Ledger |
| `.worktrees/wt-router` | `session/router-2026-04-21` | Clean; Window D writes aggregation script |

All three have `.env` symlinked to `/Users/oliverhelgemo/real-estate-pipeline/.env` (one source of truth).

### Old worktrees still on disk (pruning pending Oliver's go-ahead, after Round 1 starts)
- `.worktrees/back-on-track` (feature/back-on-track)
- `.worktrees/machine-learning-improvement` (feature/machine-learning-improvement)
- `.worktrees/new-shell` (feature/new-shell)
- `~/.warp/worktrees/real-estate-pipeline/mesquite-agave` (Warp-created)
- `~/real-estate-pipeline-finances` (stale clone)
- `~/real-estate-pipeline-ui` (stale clone)

## Memory updates made this session

New memory files:
- `project_daily_engagement_plan.md` — the 4-session daily pattern
- `project_legacy_lab_regression_hypothesis.md` — Oliver's "Legacy Lab was good, Dev Lab regressed" observation
- `project_gemini_vision_preprocessor_idea.md` — now partially-landed via DA.1

Updated:
- `MEMORY.md` — new entries indexed
- `project_back_on_track_plan.md` — flagged as mostly-shipped, Phase B reframed

## What the coordinator does next

Active tasks (TaskList):
- #5 pending — Monitor Round 1, consolidate branches, write Round 2 briefs
- #6 pending — Monitor Round 2, final consolidation, end-of-day memory + HANDOFF update
- #9 pending — Audit + clean up old worktrees (once Oliver green-lights)

Concrete next moves:
1. Wait for worker windows to start. Watch for `docs/sessions/2026-04-21-window-<B|C|D>-blocker.md` files.
2. At ~90 minutes into Round 1: quick progress check on each branch (`git log session/<branch>` from main), flag cross-cutting issues.
3. At end of Round 1 (~3h): review each branch's diff, merge clean work to `main`, write Round 2 briefs informed by findings.
4. Update `docs/HANDOFF.md` and relevant memory files before any push.
5. Never push or deploy without Oliver's explicit in-turn go-ahead.

## Session-specific preferences reinforced this conversation

- Oliver wants extreme efficiency. Minimal questions. Pick best path and proceed.
- Every render MUST be logged to the shared test-render log so Oliver can see what's running.
- Self-check discipline is non-negotiable — workers must question whether they're on the highest-leverage path.
- Never delete docs (archive with note). Never push/deploy without explicit permission.

## Cold-entry reading order for the replacement coordinator

1. This file
2. `docs/HANDOFF.md`
3. `docs/specs/2026-04-21-daily-engagement-design.md`
4. The three briefs in `docs/briefs/2026-04-21-*`
5. Memory file `project_daily_engagement_plan.md`
