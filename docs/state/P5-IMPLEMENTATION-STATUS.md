# P5 — Thompson SKU router — implementation status

Branch: `session/p5-s1-implementation-draft`
Status: **pre-cooked, awaiting P5 Session 1 (2026-04-30) for wiring + rollout**

## What's landed (this branch)

| File | Purpose |
|---|---|
| `supabase/migrations/038_thompson_router.sql` | Tables: `router_bucket_stats` (arm state), `router_shadow_log` (dry-run decision record). Additive-only. |
| `lib/providers/thompson-router.ts` | Pure-TS bandit math: `sampleGamma`, `sampleBeta`, `expectedWinRate`, `confidenceInterval`, `pickArm`. Marsaglia-Tsang gamma sampling, Box-Muller normal sampling. No DB, no network. |
| `lib/providers/thompson-router.test.ts` | 20 vitest tests: gamma + beta distribution shape, posterior mean, CI, cold-start forcing, sparsity fallback, Thompson convergence on a dominant arm, 200-iteration simulation showing convergence on a truly-better arm. All 20 passing. |
| `scripts/refresh-router-bucket-stats.ts` | Dry-run default; `--write` upserts into `router_bucket_stats` from `prompt_lab_iterations`. Reads room_type from sessions join, camera_movement from director_output_json, sku from `model_used`. |

## What's NOT wired (yet)

- `lib/providers/router.ts::resolveDecision` still picks SKU via `V1_DEFAULT_SKU` or explicit override. Thompson is NOT consulted during real routing.
- `router_shadow_log` inserts not wired anywhere. Dry-run A/B comparison logic lands at P5 S2.
- No cron. `pg_cron` scheduling is P5 S2.
- Dashboard `/dashboard/development/router-bandit` not built. P5 S2.

## Design decisions locked (from Oliver 2026-04-22, recorded in `docs/specs/p5-thompson-router-design.md`)

1. **Success threshold: 4★+.** α = count rating ≥ 4; β = count rating 1–3.
2. **Cold-start n = 3.** Each (room × movement × sku) arm forced to `trial_count ≥ 3` before Thompson exploitation.
3. **Sparsity fallback.** If bucket's total trials < 3, return `kling-v2-6-pro` (the V1 default).
4. **Judge-weight gate.** `JUDGE_ALPHA_WEIGHT` env var, default 0.0 at launch; 0.5 after P2 audit shows ≥80% human-judge agreement on ≥50 samples; revisit after 2 more weeks. Migration 038 reserves `judge_alpha` / `judge_beta` columns for this.
5. **Rollout gate (after A/B).** 2 weeks + 100 iter + mean ≥ static + 0.2★, AND no bucket regressed by >0.3★ vs static. Both must hold.
6. **Shadow log shape:** dedicated `router_shadow_log` table with FK to iteration_id. Decision JSONs + divergence_reason. NOT a column on `prompt_lab_iterations`.
7. **`room_type` as free text** (not an enum). Survives taxonomy drift.

## How to enable (P5 Session 1 actions)

1. Apply migration 038 to Supabase:
   ```bash
   npx supabase db push   # or via Studio SQL editor
   ```
2. Seed `router_bucket_stats`:
   ```bash
   npx tsx scripts/refresh-router-bucket-stats.ts           # dry-run first
   npx tsx scripts/refresh-router-bucket-stats.ts --write
   ```
3. Integrate `pickArm` into `lib/providers/router.ts::resolveDecision` behind `USE_THOMPSON_ROUTER` env flag (default `false` = existing static behavior; `true` = Thompson).
4. Wire `router_shadow_log` inserts into `submitLabRender`: on every render, log both the Thompson decision and the static decision.
5. Schedule `pg_cron` to run `refresh-router-bucket-stats --write` every 4 hours.
6. Build `/dashboard/development/router-bandit` dashboard page.

## Known carry-overs

- **Beta CI uses Normal approximation.** Exact Jeffreys quantile requires the regularized incomplete beta function, which isn't in the standard library. The Normal approximation is coarser for small `n` (< 10). P5 S2 can swap in an exact quantile solver if dashboard precision becomes user-visible. Flag: `// TODO(p5-s2): exact beta quantile for small-n CI`.
- **Gamma sampling uses `Math.random()`.** Not deterministic. `setRng(fn)` hook exists for tests + future P5 S2 seeded A/B audits.
- **Judge weight is a single global knob.** If we later want per-bucket or per-SKU weighting (e.g. judge more trusted in some buckets), we'll add a join table. Not needed for V1.

## See also

- `docs/specs/p5-thompson-router-design.md` (branch `session/p5-thompson-design`) — full design spec with Oliver's Q1–Q6 decisions inlined
- `docs/sessions/2026-04-21-park-router.md` — why the static rating grid approach was parked
- Memory: `project_p5_thompson_design.md` — pointer to branch + status
