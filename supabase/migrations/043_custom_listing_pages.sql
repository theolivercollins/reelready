-- 043_custom_listing_pages.sql
-- Custom listing landing pages: per-client config + per-listing pages published to Sierra Interactive.

BEGIN;

-- Clients = each Sierra Interactive site we publish landing pages to.
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,

  -- Sierra public site
  sierra_public_base_url TEXT NOT NULL, -- e.g. https://www.thehelgemoteam.com
  sierra_region_id TEXT NOT NULL,       -- e.g. "240" — appears in /property-search/detail/<region>/<MLS>

  -- Sierra admin (used by the Apify Playwright bot to auto-publish)
  sierra_admin_url TEXT NOT NULL,       -- e.g. https://client2.sierrainteractivedev.com
  sierra_admin_username TEXT NOT NULL,
  sierra_admin_password_encrypted TEXT NOT NULL, -- AES-256-GCM, see lib/clients-crypto.ts

  -- Agent card content (shown on every landing page for this client)
  agent_name TEXT NOT NULL,
  agent_team TEXT,
  agent_phone TEXT NOT NULL,
  agent_email TEXT NOT NULL,
  agent_photo_url TEXT,
  agent_schedule_url TEXT,

  -- Brand
  brand_color_primary TEXT NOT NULL DEFAULT '#171717',

  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clients_created_by_idx ON clients(created_by);

-- Landing pages = per-listing pages published (or about to be) to a client's Sierra site.
CREATE TABLE IF NOT EXISTS landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  mls TEXT NOT NULL,
  address TEXT NOT NULL,
  slug TEXT NOT NULL,                   -- e.g. "193-santa-fe-st-port-charlotte"
  video_url TEXT NOT NULL,

  -- Snapshot of what we scraped at publish time (so we can re-render without re-scraping)
  scraped_data JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'publishing', 'published', 'failed')),
  publish_error TEXT,
  sierra_page_url TEXT,                 -- e.g. https://thehelgemoteam.com/walkthrough/193-santa-fe-st/
  qr_url TEXT,                          -- public PNG URL of the QR code
  published_at TIMESTAMPTZ,

  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(client_id, slug)
);

CREATE INDEX IF NOT EXISTS landing_pages_client_idx ON landing_pages(client_id);
CREATE INDEX IF NOT EXISTS landing_pages_created_by_idx ON landing_pages(created_by);
CREATE INDEX IF NOT EXISTS landing_pages_status_idx ON landing_pages(status);

-- RLS: row-level security scoped to the user who created the row, plus admins can see all.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_select_own ON clients FOR SELECT
  USING (auth.uid() = created_by OR EXISTS (
    SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));
CREATE POLICY clients_insert_own ON clients FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY clients_update_own ON clients FOR UPDATE
  USING (auth.uid() = created_by);
CREATE POLICY clients_delete_own ON clients FOR DELETE
  USING (auth.uid() = created_by);

CREATE POLICY landing_pages_select_own ON landing_pages FOR SELECT
  USING (auth.uid() = created_by OR EXISTS (
    SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));
CREATE POLICY landing_pages_insert_own ON landing_pages FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY landing_pages_update_own ON landing_pages FOR UPDATE
  USING (auth.uid() = created_by);
CREATE POLICY landing_pages_delete_own ON landing_pages FOR DELETE
  USING (auth.uid() = created_by);

COMMIT;
