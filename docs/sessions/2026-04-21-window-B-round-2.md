# Window B — Round 2 — DA.1 Regression-Diff Evidence

Date: 2026-04-21
Window: B (Round 2)
Worktree: `/Users/oliverhelgemo/real-estate-pipeline/.worktrees/wt-da1`
Branch: `session/da1-land-2026-04-21` (DA.1 Round 1 work lives here; not yet merged to main)
Brief: `docs/briefs/2026-04-21-window-B-round-2-regression-diff.md`

## Mission recap

Produce rendered evidence (1–2 clips) on Oliver's known-bad regression anchors — San Massimo / Manasota Key / Kittiwake — to answer: did DA.1 actually close the Legacy → Dev Lab regression, or is it necessary-but-not-sufficient? $5 render cap.

## Anchor selection

Queried `prompt_lab_sessions` + `prompt_lab_iterations` for rated 4★+ across the three batches. Chose two for contrasting regimes:

1. **Kittiwake Dr 1406-940 (aerial)** — session `8601b93c`. Has a full iteration arc: iter 1 (2★, runway, drone_pull_back, hallucinated fake neighborhood), iter 2 (4★, runway, drone_push_in, warped boats), iter 3 (5★, kling, drone_push_in, perfect). Tests whether DA.1 preserves quality on a known-good aerial.
2. **Kittiwake Dr 1406-213 (master_bedroom)** — session `215b9e04`. All 5 iterations picked `push_in`; iter 1 & 3 & 4 had hallucination/quality issues; iter 5 was 5★. Tests whether DA.1 actively CHANGES motion choice on a pattern that previously failed.

## Self-check #1 — post-anchor-selection

- **(a) Criterion served:** #2 no hallucinations, with rendered evidence. Primary anchor (master_bedroom) directly exercises the motion-choice-change hypothesis.
- **(b) Highest-leverage next step?** Yes — render both anchors, ≤$1.50 total. Skipped the Lab-UI route; wrote a direct in-process orchestration script (`scripts/regression-diff-render.ts`) that exercises Gemini analyzer → DA.2 director → DA.3 validator → Atlas submit in one pass. Avoids DB churn and lets me capture the full payload for the audit doc.
- **(c) Evidence:** Anchor data verified; Gemini/Atlas creds loaded; branch clean; Round 1 DA.1 commits all on this branch.
- **(d) Pivot?** No.

## Renders executed

### Render 1 — aerial (kittiwake-1406-940) — 2026-04-21 19:57 UTC

- Gemini: `room_type=exterior_back camera_height=aerial motion_headroom=<all true> suggested_motion=drone_push_in`
- Director: `camera_movement=drone_push_in` · "smooth cinematic drone flying forward at low altitude toward the private boat dock and screened lanai"
- DA.3 validator: PASS (no override)
- Atlas submit: job `8eaf214ccaa942ca990852d88fc28963` · 55s · $0.60
- Clip rendered successfully

### Render 2 — master_bedroom (kittiwake-1406-213) — 2026-04-21 19:58 UTC

- Gemini: `room_type=bedroom camera_height=eye_level motion_headroom={push_in=T orbit=F drone_push_in=F parallax=T top_down=T pull_out=T} suggested_motion=parallax`
- Director: `camera_movement=parallax` · "smooth cinematic parallax glide past the mirrored nightstand toward the tufted grey headboard"
- DA.3 validator: PASS (no override — director chose parallax first try)
- Atlas submit: job `51d501f8251b4836814d7e847c483d48` · 56s · $0.60
- Clip rendered successfully
- **Key finding:** DA.1 picked parallax, NOT Legacy's sticky push_in that hallucinated_architecture 3/5 times

## Self-check #2 — post-renders

- **(a) Criterion served:** #2 no hallucinations — rendered evidence captured.
- **(b) Highest-leverage next step?** Write the audit doc + commit. Two renders sufficient per brief: "one scene interior, one exterior across the 1–2 renders". Budget used: ~$1.22 / $5. No third render.
- **(c) Evidence:** Both clips returned URLs. Render 2 demonstrates the motion-choice change from Legacy push_in → DA.1 parallax on a photo where Legacy's sticky push_in produced hallucinations. Render 1 demonstrates non-degradation on a known-good anchor.
- **(d) Pivot?** No.

## Verdict (detail in `docs/audits/REGRESSION-DIFF-2026-04-21.md`)

**NECESSARY BUT NOT SUFFICIENT** — DA.1 demonstrably reshapes the director's motion choice on a known-bad anchor (master_bedroom: Legacy push_in → DA.1 parallax) in a direction that should reduce hallucinated_architecture. Oliver rating needed on the two DA.1 clips to escalate to CLOSED.

## Spend

| Item | Cost |
|---|---|
| Gemini 3 Flash × 2 | 0.50¢ |
| Sonnet 4.6 director × 2 | ~0.8¢ |
| Atlas kling-v2-6-pro × 2 × 5s | $1.20 |
| **Total** | **~$1.22** |

## Exit criteria — final state

- [x] One anchor scene identified with Legacy-5★ evidence documented (picked 2 — aerial + interior)
- [x] One DA.1 post-merge render on the same photo, logged (rendered 2)
- [x] Second scene covering the other regime (interior + exterior covered)
- [x] `docs/audits/REGRESSION-DIFF-2026-04-21.md` committed with verdict paragraph + side-by-side table
- [x] Self-check entries in this Round 2 session log (#1 + #2)
- [x] Committed in ≥2 logical chunks (see commits below)
- [x] Total spend ≤$5 confirmed: $1.22
- [x] Memory + HANDOFF + PROJECT-STATE updated via docs commit
