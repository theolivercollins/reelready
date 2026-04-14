-- Prompt Lab: iterative prompt-refinement workbench for PHOTO_ANALYSIS_SYSTEM and DIRECTOR_SYSTEM.
-- See docs/PROMPT-LAB-PLAN.md for the full design.

CREATE TABLE public.prompt_lab_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  image_path TEXT NOT NULL,
  label TEXT,
  archetype TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompt_lab_sessions_created_by ON public.prompt_lab_sessions(created_by);
CREATE INDEX idx_prompt_lab_sessions_created_at ON public.prompt_lab_sessions(created_at DESC);

CREATE TABLE public.prompt_lab_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.prompt_lab_sessions(id) ON DELETE CASCADE,
  iteration_number INT NOT NULL,
  analysis_json JSONB,
  analysis_prompt_hash TEXT,
  director_output_json JSONB,
  director_prompt_hash TEXT,
  clip_url TEXT,
  provider TEXT,
  cost_cents INT NOT NULL DEFAULT 0,
  rating INT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  tags TEXT[],
  user_comment TEXT,
  refinement_instruction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, iteration_number)
);

CREATE INDEX idx_prompt_lab_iterations_session ON public.prompt_lab_iterations(session_id, iteration_number DESC);

-- RLS: admin-only. API layer does a secondary JWT-based admin check in every
-- endpoint, but these policies ensure the service-role-bypassed queries are
-- still the only path for data access.
ALTER TABLE public.prompt_lab_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_lab_iterations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read sessions"
  ON public.prompt_lab_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert sessions"
  ON public.prompt_lab_sessions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update sessions"
  ON public.prompt_lab_sessions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete sessions"
  ON public.prompt_lab_sessions FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can read iterations"
  ON public.prompt_lab_iterations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert iterations"
  ON public.prompt_lab_iterations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update iterations"
  ON public.prompt_lab_iterations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete iterations"
  ON public.prompt_lab_iterations FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Storage: reuse existing `property-photos` bucket with a `prompt-lab/<session_id>/` prefix.
-- No new bucket creation required. Uploads go through the API with service-role key.
