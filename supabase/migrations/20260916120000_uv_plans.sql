-- =============================================================================
-- Migration: 20260916120000_uv_plans.sql
-- Description: Add table for 'Stromkreise von UV-Plan' feature (Distribution board plans)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.uv_plans (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name text NOT NULL,
    pdf_filename text,
    circuits jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_uv_plans_project_id ON public.uv_plans(project_id);

ALTER TABLE public.uv_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uv_plans_select" ON public.uv_plans;
CREATE POLICY "uv_plans_select" ON public.uv_plans FOR SELECT TO authenticated USING (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

DROP POLICY IF EXISTS "uv_plans_insert" ON public.uv_plans;
CREATE POLICY "uv_plans_insert" ON public.uv_plans FOR INSERT TO authenticated WITH CHECK (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

DROP POLICY IF EXISTS "uv_plans_update" ON public.uv_plans;
CREATE POLICY "uv_plans_update" ON public.uv_plans FOR UPDATE TO authenticated USING (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

DROP POLICY IF EXISTS "uv_plans_delete" ON public.uv_plans;
CREATE POLICY "uv_plans_delete" ON public.uv_plans FOR DELETE TO authenticated USING (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);
