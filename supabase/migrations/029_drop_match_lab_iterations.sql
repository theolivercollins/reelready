-- M.2b: drop legacy match_lab_iterations RPC — replaced by
-- match_rated_examples (unified 3-branch retrieval, migration 014+028).
-- Confirmed 0 code callers before drop.
DROP FUNCTION IF EXISTS match_lab_iterations(vector, int, int);
