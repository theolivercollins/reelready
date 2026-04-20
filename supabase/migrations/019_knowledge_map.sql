-- Migration 019: Knowledge Map — per-cell learning-state aggregation over
-- pooled Lab iterations + production scene_ratings. Cells enumerated via
-- CROSS JOIN of the two active taxonomies so untested cells exist as rows
-- with sample_size=0.

BEGIN;

CREATE TABLE IF NOT EXISTS knowledge_map_room_types (
  room_type TEXT PRIMARY KEY
);
INSERT INTO knowledge_map_room_types (room_type) VALUES
  ('kitchen'), ('living_room'), ('master_bedroom'), ('bedroom'), ('bathroom'),
  ('exterior_front'), ('exterior_back'), ('pool'), ('aerial'), ('dining'),
  ('hallway'), ('garage'), ('foyer'), ('other')
ON CONFLICT (room_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS knowledge_map_camera_verbs (
  camera_movement TEXT PRIMARY KEY
);
INSERT INTO knowledge_map_camera_verbs (camera_movement) VALUES
  ('push_in'), ('pull_out'), ('orbit'), ('parallax'),
  ('dolly_left_to_right'), ('dolly_right_to_left'), ('reveal'),
  ('drone_push_in'), ('drone_pull_back'), ('top_down'),
  ('low_angle_glide'), ('feature_closeup')
ON CONFLICT (camera_movement) DO NOTHING;

ALTER TABLE prompt_lab_sessions
  ADD COLUMN IF NOT EXISTS cell_key TEXT;

CREATE INDEX IF NOT EXISTS idx_prompt_lab_sessions_cell_key
  ON prompt_lab_sessions (cell_key)
  WHERE cell_key IS NOT NULL;

CREATE OR REPLACE VIEW v_rated_pool AS
SELECT
  'lab'::TEXT                                AS source,
  i.id                                       AS id,
  (i.analysis_json ->> 'room_type')          AS room_type,
  (i.director_output_json ->> 'camera_movement') AS camera_movement,
  i.rating                                   AS rating,
  i.tags                                     AS tags,
  i.created_at                               AS rated_at
FROM prompt_lab_iterations i
WHERE i.rating IS NOT NULL
UNION ALL
SELECT
  'prod'::TEXT                               AS source,
  sr.id                                      AS id,
  sr.rated_room_type                         AS room_type,
  sr.rated_camera_movement                   AS camera_movement,
  sr.rating                                  AS rating,
  sr.tags                                    AS tags,
  sr.rated_snapshot_at                       AS rated_at
FROM scene_ratings sr
WHERE sr.rating IS NOT NULL
  AND sr.rated_room_type IS NOT NULL
  AND sr.rated_camera_movement IS NOT NULL;

CREATE OR REPLACE VIEW v_knowledge_map_cells AS
WITH cells AS (
  SELECT r.room_type, v.camera_movement,
         r.room_type || '-' || v.camera_movement AS cell_key
  FROM knowledge_map_room_types r
  CROSS JOIN knowledge_map_camera_verbs v
),
pool AS (
  SELECT * FROM v_rated_pool
),
agg AS (
  SELECT
    p.room_type, p.camera_movement,
    COUNT(*)                                             AS sample_size,
    AVG(p.rating)::NUMERIC(3,2)                          AS avg_rating,
    COUNT(*) FILTER (WHERE p.rating = 5)                 AS five_star_count,
    COUNT(*) FILTER (WHERE p.rating <= 2)                AS loser_count,
    MAX(p.rated_at)                                      AS last_rated_at
  FROM pool p
  GROUP BY p.room_type, p.camera_movement
),
fail_tag_hist AS (
  SELECT p.room_type, p.camera_movement,
         jsonb_object_agg(tag, cnt) AS fail_tags
  FROM (
    SELECT p.room_type, p.camera_movement, t AS tag, COUNT(*) AS cnt
    FROM pool p, LATERAL unnest(p.tags) t
    WHERE t LIKE 'fail:%'
    GROUP BY p.room_type, p.camera_movement, t
  ) p
  GROUP BY p.room_type, p.camera_movement
),
recipe_counts AS (
  SELECT room_type, camera_movement, COUNT(*) AS active_recipe_count
  FROM prompt_lab_recipes
  WHERE status = 'active'
  GROUP BY room_type, camera_movement
)
SELECT
  c.cell_key,
  c.room_type,
  c.camera_movement,
  COALESCE(a.sample_size, 0)                              AS sample_size,
  a.avg_rating,
  COALESCE(a.five_star_count, 0)                          AS five_star_count,
  COALESCE(a.loser_count, 0)                              AS loser_count,
  a.last_rated_at,
  COALESCE(f.fail_tags, '{}'::JSONB)                      AS fail_tags,
  COALESCE(rc.active_recipe_count, 0)                     AS active_recipe_count,
  CASE
    WHEN COALESCE(a.sample_size, 0) = 0                                        THEN 'untested'
    WHEN COALESCE(a.five_star_count, 0) >= 2                                   THEN 'golden'
    WHEN a.avg_rating <= 2.0
      OR a.loser_count::NUMERIC / GREATEST(a.sample_size, 1) >= 0.5           THEN 'weak'
    WHEN a.avg_rating >= 4.0                                                   THEN 'strong'
    ELSE 'okay'
  END                                                     AS state
FROM cells c
LEFT JOIN agg a         ON a.room_type = c.room_type AND a.camera_movement = c.camera_movement
LEFT JOIN fail_tag_hist f ON f.room_type = c.room_type AND f.camera_movement = c.camera_movement
LEFT JOIN recipe_counts rc ON rc.room_type = c.room_type AND rc.camera_movement = c.camera_movement;

COMMIT;
