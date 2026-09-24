CREATE TABLE IF NOT EXISTS public.stromkreis_snapshots (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
    plan_id uuid REFERENCES public.plans(id) ON DELETE CASCADE,
    name text NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.stromkreis_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stromkreis_snapshots_select" ON public.stromkreis_snapshots;
CREATE POLICY "stromkreis_snapshots_select" ON public.stromkreis_snapshots FOR SELECT TO authenticated USING (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

DROP POLICY IF EXISTS "stromkreis_snapshots_insert" ON public.stromkreis_snapshots;
CREATE POLICY "stromkreis_snapshots_insert" ON public.stromkreis_snapshots FOR INSERT TO authenticated WITH CHECK (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

DROP POLICY IF EXISTS "stromkreis_snapshots_delete" ON public.stromkreis_snapshots;
CREATE POLICY "stromkreis_snapshots_delete" ON public.stromkreis_snapshots FOR DELETE TO authenticated USING (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);
