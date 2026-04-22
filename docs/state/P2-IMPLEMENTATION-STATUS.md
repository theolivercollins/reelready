# P2 — Gemini auto-judge — implementation status

Branch: `session/p2-s1-implementation-draft`
Status: **pre-cooked, awaiting P2 Session 1 (2026-04-23) for Gemini API binding + enable**

## What's landed (this branch)

| File | Purpose | Wired? |
|---|---|---|
| `supabase/migrations/033_prompt_lab_iterations_judge.sql` | 7 judge columns on prompt_lab_iterations + judge_calibration_examples table | Not applied |
| `lib/prompts/judge-rubric.ts` | RUBRIC_VERSION, JUDGE_SYSTEM_PROMPT, HALLUCINATION_FLAGS enum, validateJudgeOutput | Yes (imported by gemini-judge.ts) |
| `lib/prompts/judge-rubric.test.ts` | 8 vitest tests on validator (schema + cross-axis hard rules) | Yes, should pass |
| `lib/providers/gemini-judge.ts` | `judgeLabIteration` signature + cost-event pathway + kill-switch | SKELETON — Gemini binding is TODO(p2-s1) |

## What's NOT wired (and why)

- **The Gemini call itself is stubbed.** `judgeLabIteration` currently throws a TODO error from inside the try/catch so the kill-switch + error-cost-event plumbing is exercised but no real API call fires. P2 Session 1's job: replace the TODO block with the real `@google/genai` call pattern (mirror `lib/providers/gemini-analyzer.ts`). Skeleton exists so the endpoint + tests can land independently of binding-verification.
- **No API endpoint.** `api/admin/prompt-lab/finalize-with-judge.ts` NOT created. P2 S1 adds it; pattern mirrors existing finalize handler.
- **No hook in `lib/prompt-lab.ts::finalizeLabRender`.** P2 S1 adds a fire-and-forget non-blocking call, gated by `JUDGE_ENABLED === 'true'`.
- **No judge UI chip in IterationCard.** P2 Session 2 (2026-04-24) handles that.

## Decisions locked (from Oliver 2026-04-22, per `session/p2-rubric-design`)

1. **Q1 — photo bytes, not analysis_json.** Judge sees actual source photo for hallucination-detection fidelity.
2. **Q2 — 6-frame sampling.** Tighten to full clip only if P2 S2 calibration audit shows <70% agreement.
3. **Q3 — filter banned-enum legacy prompts** from calibration pool; preserve filtered list in `docs/state/judge-excluded-legacy.md`.
4. **Q4 — v0 pool retirement trigger:** ≥5 V1 renders/SKU on top-10 buckets OR 2 weeks of V1 use, whichever first.
5. **Q5 — no prior-rating shown on rerenders.** Anchoring bias mitigation.
6. **Q6 — flags not axis.** `too_fast` / `too_slow` stay in `hallucination_flags`; promote to 6th axis only if they fire on >20% of iterations in any 7-day window.
7. **Q7 — strict same-bucket** few-shot. No cross-bucket borrow at launch.

## How to enable (P2 Session 1 actions)

1. Apply migration 033 to Supabase.
2. Replace the `TODO(p2-s1)` block in `lib/providers/gemini-judge.ts` with the real Gemini call.
3. Write `lib/providers/gemini-judge.test.ts` — mock `@google/genai`, assert rubric JSON round-trip + cost_event shape + error pathway returns null + kill-switch respected.
4. Create `api/admin/prompt-lab/finalize-with-judge.ts` endpoint.
5. Add fire-and-forget hook in `finalizeLabRender` behind `JUDGE_ENABLED==='true'`.
6. Seed the first 10 calibration examples into `judge_calibration_examples` from the rubric's v0 pool (docs/state/JUDGE-RUBRIC-V1.md on `session/p2-rubric-design`).
7. Flip `JUDGE_ENABLED=true` on one test render to verify end-to-end.

## See also

- `docs/state/JUDGE-RUBRIC-V1.md` (branch `session/p2-rubric-design`) — 663-line rubric design with calibration pool + Q1–Q7 decisions inlined
- `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md` §P2 — phase brief
- Memory: `project_p2_judge_rubric.md` — pointer to branch + status
