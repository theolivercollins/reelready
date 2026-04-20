-- Migration 020: Vocabulary expansion + pullout removal.
--
-- Rooms: +10 (office, laundry, closet, basement, deck, powder_room,
--             stairs, media_room, gym, mudroom)
-- Verbs: -2 (pull_out, drone_pull_back) + 1 (rack_focus)
--
-- Pullouts leave the AI's generation vocabulary entirely — the editor
-- reverses an inward clip in post when a pullout feel is wanted (see
-- Phase 2.6 for the reverse_in_assembly wiring).
--
-- Historical data tagged with pull_out / drone_pull_back remains in
-- prompt_lab_iterations / scene_ratings / recipes, but those rows will
-- no longer appear on the knowledge-map grid — the grid CROSS-JOINs
-- against the seed tables we edit below.

BEGIN;

INSERT INTO knowledge_map_room_types (room_type) VALUES
  ('office'), ('laundry'), ('closet'), ('basement'), ('deck'),
  ('powder_room'), ('stairs'), ('media_room'), ('gym'), ('mudroom')
ON CONFLICT (room_type) DO NOTHING;

DELETE FROM knowledge_map_camera_verbs
  WHERE camera_movement IN ('pull_out', 'drone_pull_back');

INSERT INTO knowledge_map_camera_verbs (camera_movement) VALUES
  ('rack_focus')
ON CONFLICT (camera_movement) DO NOTHING;

COMMIT;
