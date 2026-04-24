-- 2026-04-24: make the SKU × motion affinity table a live, self-refreshing
-- data structure instead of a hand-edited TS file. The nightly cron
-- /api/cron/refresh-sku-affinity recomputes rules from last-30d rated
-- iterations and UPSERTs here. The client fetches from /api/admin/sku-affinity
-- and falls back to the static seed if the DB is empty.

BEGIN;

CREATE TABLE IF NOT EXISTS sku_motion_affinity (
  camera_movement text PRIMARY KEY,
  prefer text[] NOT NULL DEFAULT '{}',
  avoid text[] NOT NULL DEFAULT '{}',
  reason text NOT NULL,
  confidence text NOT NULL
    CHECK (confidence IN ('high_empirical','medium_empirical','qualitative','pending')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_refreshed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sku_motion_affinity IS
  'Which SKUs to prefer / avoid per camera_movement. Refreshed nightly from prompt_lab_iterations ratings; hand-seeded for motions without enough data yet.';

-- Refresh log: one row per cron run. Also the home for regression alerts
-- (e.g. "straight push" reappearing in director output) so operators can
-- see WHEN the system last looked at the data and what it found.
CREATE TABLE IF NOT EXISTS sku_motion_affinity_refresh_log (
  id bigserial PRIMARY KEY,
  ran_at timestamptz NOT NULL DEFAULT now(),
  window_days int NOT NULL,
  motions_updated int NOT NULL DEFAULT 0,
  motions_skipped_low_n int NOT NULL DEFAULT 0,
  template_regressions jsonb NOT NULL DEFAULT '[]'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE sku_motion_affinity_refresh_log IS
  'Audit trail for the sku_motion_affinity refresh cron. template_regressions is a JSON array of {pattern, count, example_iteration_id} rows for any banned phrasings that slipped back into the director output.';

-- Seed the single rule we have from the 2026-04-24 manual audit. The cron
-- will overwrite this with fresh numbers on its first run.
INSERT INTO sku_motion_affinity (
  camera_movement, prefer, avoid, reason, confidence, evidence, last_refreshed_at
) VALUES (
  'push_in',
  ARRAY['kling-v2-native'],
  ARRAY['kling-v2-6-pro', 'kling-v2-master'],
  'v2.6-pro and v2-master render straight push-ins as 2D zooms; v2-native produces a real forward dolly.',
  'high_empirical',
  jsonb_build_object(
    'window_days', 30,
    'seeded_at', '2026-04-24',
    'per_sku', jsonb_build_object(
      'kling-v2-native', jsonb_build_object('n', 14, 'mean_rating', 4.21, 'fail_rate_pct', 7),
      'kling-v2-master', jsonb_build_object('n', 10, 'mean_rating', 2.70, 'fail_rate_pct', 40),
      'kling-v2-6-pro',  jsonb_build_object('n', 10, 'mean_rating', 2.60, 'fail_rate_pct', 50)
    )
  ),
  now()
)
ON CONFLICT (camera_movement) DO NOTHING;

COMMIT;
