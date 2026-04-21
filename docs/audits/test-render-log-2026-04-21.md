# Test-render log — 2026-04-21

Last updated: 2026-04-21

See also:
- [../specs/2026-04-21-daily-engagement-design.md](../specs/2026-04-21-daily-engagement-design.md) — why this log exists

**Rule:** every test render initiated by any Round 1 window (B, C, D) appends one row below. No off-log renders. Oliver reads this file to confirm nothing is running he doesn't know about.

## Columns

| Field | Meaning |
|---|---|
| timestamp | Local time the render started |
| window | B / C / D |
| scene_id or photo_id | What was rendered |
| prompt_before | Director prompt on previous run (or N/A for first render) |
| prompt_after | Director prompt on this run |
| SKU | Model actually invoked |
| cost_cents | Recorded cost for this render |
| clip_url or task_id | Output reference |
| observation | One-sentence read on whether this render argues for or against the current hypothesis |

## Ledger

| timestamp | window | scene/photo | prompt_before | prompt_after | SKU | cost | clip/task | observation |
|---|---|---|---|---|---|---|---|---|
| _(first row goes here)_ | | | | | | | | |

## Budget reminder

Round 1 combined render cap: **$20**. Each window tracks its own running total in the session log. Coordinator checks this file at consolidation time and flags any breach.
