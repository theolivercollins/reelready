-- Lab learning loop: pgvector + embeddings on iterations, recipe library,
-- Lab-scoped prompt overrides, and rule-mining proposal audit log.
-- See docs/PROMPT-LAB-PLAN.md + ~/.claude/plans/bubbly-cooking-wigderson.md

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.prompt_lab_iterations
  ADD COLUMN embedding vector(1536),
  ADD COLUMN embedding_model TEXT,
  ADD COLUMN retrieval_metadata JSONB;

CREATE INDEX idx_prompt_lab_iterations_embedding
  ON public.prompt_lab_iterations USING hnsw (embedding vector_cosine_ops);

CREATE TABLE public.prompt_lab_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archetype TEXT NOT NULL,
  room_type TEXT NOT NULL,
  camera_movement TEXT NOT NULL,
  provider TEXT,
  composition_signature JSONB,
  prompt_template TEXT NOT NULL,
  source_iteration_id UUID REFERENCES public.prompt_lab_iterations(id) ON DELETE SET NULL,
  rating_at_promotion INT,
  promoted_by UUID NOT NULL REFERENCES auth.users(id),
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  times_applied INT NOT NULL DEFAULT 0,
  embedding vector(1536),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'pending'))
);
CREATE INDEX idx_recipes_embedding ON public.prompt_lab_recipes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_recipes_room_movement ON public.prompt_lab_recipes(room_type, camera_movement) WHERE status = 'active';

CREATE TABLE public.lab_prompt_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_name TEXT NOT NULL,
  body TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX idx_lab_prompt_overrides_active ON public.lab_prompt_overrides(prompt_name) WHERE is_active;

CREATE TABLE public.lab_prompt_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_name TEXT NOT NULL,
  base_body_hash TEXT NOT NULL,
  proposed_diff TEXT NOT NULL,
  proposed_body TEXT NOT NULL,
  evidence JSONB,
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.prompt_lab_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_prompt_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_prompt_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins all recipes" ON public.prompt_lab_recipes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins all overrides" ON public.lab_prompt_overrides FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins all proposals" ON public.lab_prompt_proposals FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'));
