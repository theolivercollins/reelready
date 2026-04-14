-- Development dashboard session notes: one row per working session with
-- objective + accomplishments so we have a running changelog of what
-- was actually done and why.

CREATE TABLE public.dev_session_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  objective TEXT,
  accomplishments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dev_session_notes_date ON public.dev_session_notes(session_date DESC, created_at DESC);

ALTER TABLE public.dev_session_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read dev notes"
  ON public.dev_session_notes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert dev notes"
  ON public.dev_session_notes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update dev notes"
  ON public.dev_session_notes FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete dev notes"
  ON public.dev_session_notes FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));
