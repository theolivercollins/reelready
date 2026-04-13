-- Global application settings — one row per settings key.
-- Used by the admin dashboard Settings page to override pipeline
-- behavior without a deploy (primary video provider, eventually
-- other knobs like concurrency, cost caps, etc.).
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS but only allow admins to read/write. Server-side code
-- uses the service role key and bypasses RLS, so admin endpoints keep
-- working regardless.
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read app settings"
  ON public.app_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can write app settings"
  ON public.app_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  );

-- Seed: primary_video_provider defaults to "auto" (per-room routing
-- stays on). Valid values: "auto" | "runway" | "kling" | "luma" | "higgsfield"
INSERT INTO public.app_settings (key, value)
VALUES ('primary_video_provider', '"auto"'::jsonb)
ON CONFLICT (key) DO NOTHING;
