-- P5 — Thompson-sampling SKU router: bucket stats + shadow log.
-- Design: docs/specs/p5-thompson-router-design.md (branch session/p5-thompson-design).
-- Additive-only schema; no existing behavior changes. Neither table is wired
-- into the runtime router yet — that happens in P5 Session 1 (scheduled
-- 2026-04-30) when USE_THOMPSON_ROUTER env flag defaults to false (dry-run).
--
-- 2026-04-22 — pre-cooked for P5 S1 execution.

CREATE TABLE IF NOT EXISTS router_bucket_stats (
  id          bigserial PRIMARY KEY,
  room_type   text      NOT NULL,
  camera_movement text  NOT NULL,
  sku         text      NOT NULL,
  alpha       integer   NOT NULL DEFAULT 0,
  beta        integer   NOT NULL DEFAULT 0,
  judge_alpha integer   NOT NULL DEFAULT 0,
  judge_beta  integer   NOT NULL DEFAULT 0,
  enabled     boolean   NOT NULL DEFAULT true,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_type, camera_movement, sku)
);

CREATE INDEX IF NOT EXISTS idx_router_bucket_stats_bucket
  ON router_bucket_stats (room_type, camera_movement);

CREATE INDEX IF NOT EXISTS idx_router_bucket_stats_enabled
  ON router_bucket_stats (enabled) WHERE enabled = true;

COMMENT ON TABLE router_bucket_stats IS
  'Beta-Bernoulli bandit arms for Thompson-sampling router (P5). One row per
   (room_type, camera_movement, sku). alpha=count 4★+, beta=count ≤3★.
   judge_alpha/judge_beta gated by JUDGE_ALPHA_WEIGHT env (default 0.0 — see
   p5 spec §6). Refreshed by scripts/refresh-router-bucket-stats.ts on a 4h
   cron. Taxonomy-drift safe: room_type is free text, not enum.';

COMMENT ON COLUMN router_bucket_stats.alpha IS
  'Count of human-rated 4★+ iterations for this arm. Posterior Beta(α+1, β+1).';

COMMENT ON COLUMN router_bucket_stats.judge_alpha IS
  'Count of judge-rated overall≥4 iterations. Weighted into the bandit via
   JUDGE_ALPHA_WEIGHT env flag (0.0 at P5 launch; 0.5 post-P2 audit).';

CREATE TABLE IF NOT EXISTS router_shadow_log (
  id                     bigserial PRIMARY KEY,
  iteration_id           uuid      NOT NULL REFERENCES prompt_lab_iterations(id) ON DELETE CASCADE,
  thompson_decision_json jsonb     NOT NULL,
  static_decision_json   jsonb     NOT NULL,
  divergence_reason      text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_router_shadow_log_iteration
  ON router_shadow_log (iteration_id);

CREATE INDEX IF NOT EXISTS idx_router_shadow_log_divergent
  ON router_shadow_log (created_at DESC)
  WHERE divergence_reason IS NOT NULL;

COMMENT ON TABLE router_shadow_log IS
  'Per-iteration Thompson-vs-static decision record. During P5 Session 2
   dry-run, static router ACTUALLY routes and Thompson is sampled alongside
   for A/B comparison. divergence_reason is null when both pick the same
   SKU; else a short explanation of why Thompson diverged (e.g.
   "cold_start_forced", "thompson_sampled(theta=0.73)").';
