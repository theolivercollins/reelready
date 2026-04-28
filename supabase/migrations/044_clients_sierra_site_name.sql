-- 044: add Sierra "Site Name" field to clients.
-- The Sierra admin login form requires three fields, not two: Site Name + Username + Password.
-- We were missing this on initial onboarding; the Apify Playwright actor was failing to log in.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS sierra_site_name TEXT;
