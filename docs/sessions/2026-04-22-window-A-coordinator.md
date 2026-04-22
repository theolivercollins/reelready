# Window A — Coordinator session handoff (2026-04-22)

Last updated: 2026-04-22 (end-of-session)
Owner: Oliver
Coordinator home: `/Users/oliverhelgemo/real-estate-pipeline` (main branch)

## Session outcome

Single-session day. No worker windows dispatched. This session **designed a multi-day V1-primary-tool + ML-roadmap program** but did not begin implementation. Design spec is written. Implementation plan has not yet been generated.

## Where to resume

**Immediate next action:** Oliver reviews the spec, then the coordinator (next session) invokes `superpowers:writing-plans` to produce the P1 implementation plan, then executes P1.

**Canonical doc to read first on resume:** `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md`. It is the authoritative multi-day plan for the foreseeable future. Supersedes the active parts of `docs/plans/back-on-track-plan.md` for V1/ML work.

## What was decided this session

### Terminology (final)

- **V1** = current stack (Kling v2 family, default `kling-v2-6-pro`, single-image, production-connected). Legacy Prompt Lab renamed to just "Prompt Lab".
- **V2** = paused future (Kling 3 family, paired-image / start+end frame, forward-looking motion vocab). Hidden from nav, preserved on disk, fully reversible.
- V1/V2 is the **internal terminology** in code + docs. Nav just says "Prompt Lab".

### North-Star alignment

The 4 North Stars (no HITL / no hallucinations / no wasted money / right SKU per bucket) stand. Every phase in the spec is mapped to one or more.

### Multi-day program shape

P1 today (not executed) → P2 auto-judge → P3 retrieval upgrade → P4 scale hardening → P5 Thompson SKU router → P6 active learning + pairwise → P7 promote-to-prod flywheel. Details per phase live in the spec.

### Key pushbacks Oliver accepted

- Do **not** collapse retrieval to "just past winners" (preserves losers channel → serves North Star #2).
- Do **not** pack Tier A/B/C ML work into today. P1 ships first; ML upgrades in subsequent phases.

### Key pushbacks Oliver overrode me on (correctly)

- Tier B (auto-judge) IS going to be implemented — not "maybe someday" but scheduled in P2.

### Scale concern baked in

Per Oliver's explicit ask: architectural principle that every embedding/rating/recipe carries property_id + photo_id + room_type + camera_movement + SKU. Retrieval always scoped; MMR diversity re-ranking in P4; hallucination-risk propagation in P4; cold-start prior for new properties. This is non-optional; it's a program-wide invariant.

## What exists on disk after this session

- `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md` — the authoritative design (this session's primary output).
- Migration numbers 031–039 reserved/allocated across P1–P6. Each phase's implementation plan re-confirms at execution.

## What was NOT done (explicit)

- **Spec is not yet committed to git.** Awaiting Oliver's review per the superpowers brainstorming gate.
- `superpowers:writing-plans` not yet invoked.
- No code changed. No migrations applied. No renders submitted.
- Yesterday's dangling state still dangling: `docs/audits/test-render-log-2026-04-21.md` modified; `docs/sessions/2026-04-21-window-B-round-2.md` + `docs/sessions/2026-04-21-window-B.md` untracked.
- Yesterday's unmerged branches still unmerged: `session/ledger-2026-04-21`, `session/router-2026-04-21`. Both stay parked per the spec (P1 disposition).
- Atlas wallet status not verified this session. Oliver said he topped it up; P1 Session 1 Open block verifies defensively before first render.

## On resume — coordinator's concrete first moves

1. Read this file.
2. Read the spec: `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md`.
3. Confirm with Oliver: does the spec match what he wants? Any revisions before we write the implementation plan?
4. If approved → invoke `superpowers:writing-plans` to produce `docs/plans/2026-04-22-p1-v1-foundation-plan.md` (P1 only — each phase gets its own plan at execution time).
5. Begin P1 execution per the plan. First subtasks:
   - Verify Atlas wallet has balance (quick ping).
   - Consolidate yesterday's dangling state (commit render-log + 2 session notes).
   - Selective merge of v3-strip commit from `session/router-2026-04-21`; park both branches with "park note" session docs.
   - Commit the spec itself (not yet committed — waiting for Oliver's review).
6. Dispatch subagents per the P1 session subagent-mix table in the spec.

## Brainstorming-skill state (for the superpowers flow)

We are **between "Write design doc" and "User reviews spec"** in the brainstorming flow. Spec self-review was in progress when the session ended (migration-number renumbering 036→031 through 044→039 was applied; no other inline fixes). Next session should:

1. Ask Oliver if he wants any spec changes → make them.
2. Commit the spec.
3. Invoke `superpowers:writing-plans`.

Do NOT re-open brainstorming from scratch. The design is effectively approved; we just haven't closed the review loop.

## Yesterday's state still pending (carried over to next session)

| Item | Disposition per spec |
|---|---|
| `session/ledger-2026-04-21` (Window C R2 bucket-progress) | Park — feeds V2 surface; kept alive |
| `session/router-2026-04-21` (Window D R2 partial grid + v3-strip) | Selectively merge v3-strip commit only; park rest |
| Uncommitted render log + 2 untracked Window B session notes on main | Commit as yesterday's closeout (step 1 of P1) |
| Brief `2026-04-21-window-B-round-3-vocab-cleanup.md` | Mark DEFERRED (paired-image zone) |
| Brief `2026-04-21-window-E-og-prompt-lab-data-capture.md` | Re-scoped; absorbed into Phase P4 |
| Atlas wallet | Oliver says topped up; verify defensively before first P1 render |

## Memory updates made this session

New memory file:
- `project_v1_ml_roadmap.md` — multi-day V1/ML program, points at the spec.

MEMORY.md updated with the new entry. `project_back_on_track_plan.md` gets a one-line successor-pointer update next session when we commit.

## Oliver's preferences reinforced this conversation

- **Fight back when suggestions don't serve the North Stars.** Oliver explicitly requested not-passive behavior. Applied: pushed back on three-channel collapse, pushed back on packing ML into today's scope.
- Plain language, minimal questions, pick best path — standing.
- Opus for design/audit, Sonnet for implementation, Haiku for trivial — applied throughout spec.
- No push/deploy without explicit in-turn permission — spec is unpushed, uncommitted; waiting on review.

## If something unexpected at cold entry

- If the spec file is missing → check git `git log --all -- "docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md"` — it may have been committed on a branch.
- If Oliver has revised the spec in between sessions, treat his version as canonical and diff against what this handoff describes.
- If the superpowers brainstorming skill re-invokes — tell it brainstorming is complete, design is written, user-review is the current gate.
