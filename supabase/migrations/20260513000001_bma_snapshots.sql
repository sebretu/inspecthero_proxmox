-- Create BMA Snapshots table
CREATE TABLE IF NOT EXISTS public.bma_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- RLS Policies
ALTER TABLE public.bma_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage BMA snapshots if admin of project"
    ON public.bma_snapshots
    USING (
        is_project_admin_or_mod(project_id) OR 
        (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'))
    )
    WITH CHECK (
        is_project_admin_or_mod(project_id) OR 
        (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'))
    );

CREATE POLICY "Users can view BMA snapshots if member of project"
    ON public.bma_snapshots
    FOR SELECT
    USING (
        is_project_member(project_id) OR 
        (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'))
    );
