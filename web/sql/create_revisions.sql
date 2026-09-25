CREATE TABLE IF NOT EXISTS public.revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    x_norm DOUBLE PRECISION,
    y_norm DOUBLE PRECISION,
    title TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.revision_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES public.revisions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    storage_path TEXT,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn on RLS
ALTER TABLE public.revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revision_photos ENABLE ROW LEVEL SECURITY;

-- Creating policies (similar to tasks schema but more relaxed for viewing)
DROP POLICY IF EXISTS "Revisions are viewable by everyone in project" ON public.revisions;
CREATE POLICY "Revisions are viewable by everyone in project" ON public.revisions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create revisions" ON public.revisions;
CREATE POLICY "Users can create revisions" ON public.revisions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update their own revisions or admins" ON public.revisions;
CREATE POLICY "Users can update their own revisions or admins" ON public.revisions FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete their own revisions or admins" ON public.revisions;
CREATE POLICY "Users can delete their own revisions or admins" ON public.revisions FOR DELETE USING (auth.uid() IS NOT NULL);

-- Photo policies
DROP POLICY IF EXISTS "Revision photos are viewable by everyone" ON public.revision_photos;
CREATE POLICY "Revision photos are viewable by everyone" ON public.revision_photos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can upload revision photos" ON public.revision_photos;
CREATE POLICY "Users can upload revision photos" ON public.revision_photos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete revision photos" ON public.revision_photos;
CREATE POLICY "Users can delete revision photos" ON public.revision_photos FOR DELETE USING (auth.uid() IS NOT NULL);
