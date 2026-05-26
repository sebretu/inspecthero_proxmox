-- Migration for Aufmaß & Zusatzplanung module
-- Creates necessary tables for sessions, versioning, materials, labor, and markers.

CREATE TABLE IF NOT EXISTS public.aufmass_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    photo_id UUID REFERENCES public.task_photos(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'reviewed', 'approved', 'exported', 'archived')),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- For autosave, undo/redo, and history tracking
CREATE TABLE IF NOT EXISTS public.aufmass_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.aufmass_sessions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    data JSONB NOT NULL, -- Stores Konva state / canvas data
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Structured data for ERP/Offer generation integration
CREATE TABLE IF NOT EXISTS public.aufmass_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.aufmass_sessions(id) ON DELETE CASCADE,
    article_number VARCHAR(100),
    item_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    unit VARCHAR(50) NOT NULL DEFAULT 'pcs',
    price NUMERIC(10, 2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.aufmass_labor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.aufmass_sessions(id) ON DELETE CASCADE,
    worker_count INTEGER NOT NULL DEFAULT 1,
    estimated_hours NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    total_calculated_hours NUMERIC(10, 2), -- Usually worker_count * estimated_hours
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Advanced Marker System
CREATE TABLE IF NOT EXISTS public.aufmass_markers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.aufmass_sessions(id) ON DELETE CASCADE,
    x NUMERIC(10, 4) NOT NULL,
    y NUMERIC(10, 4) NOT NULL,
    category VARCHAR(100),
    color VARCHAR(50),
    status VARCHAR(50),
    priority VARCHAR(50),
    icon VARCHAR(50),
    internal_notes TEXT,
    customer_visible_notes TEXT,
    linked_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    linked_map_x NUMERIC(10, 4),
    linked_map_y NUMERIC(10, 4),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_aufmass_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_aufmass_sessions_modtime
    BEFORE UPDATE ON public.aufmass_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_aufmass_updated_at_column();

CREATE TRIGGER update_aufmass_materials_modtime
    BEFORE UPDATE ON public.aufmass_materials
    FOR EACH ROW
    EXECUTE FUNCTION update_aufmass_updated_at_column();

CREATE TRIGGER update_aufmass_labor_modtime
    BEFORE UPDATE ON public.aufmass_labor
    FOR EACH ROW
    EXECUTE FUNCTION update_aufmass_updated_at_column();

CREATE TRIGGER update_aufmass_markers_modtime
    BEFORE UPDATE ON public.aufmass_markers
    FOR EACH ROW
    EXECUTE FUNCTION update_aufmass_updated_at_column();

-- Enable RLS
ALTER TABLE public.aufmass_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aufmass_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aufmass_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aufmass_labor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aufmass_markers ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies (Assuming users can see/edit if they are active profiles)
CREATE POLICY "Enable read access for all users" ON public.aufmass_sessions FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.aufmass_sessions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable update for authenticated users" ON public.aufmass_sessions FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable delete for authenticated users" ON public.aufmass_sessions FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read access for all users" ON public.aufmass_versions FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.aufmass_versions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable update for authenticated users" ON public.aufmass_versions FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable delete for authenticated users" ON public.aufmass_versions FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read access for all users" ON public.aufmass_materials FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.aufmass_materials FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable update for authenticated users" ON public.aufmass_materials FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable delete for authenticated users" ON public.aufmass_materials FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read access for all users" ON public.aufmass_labor FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.aufmass_labor FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable update for authenticated users" ON public.aufmass_labor FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable delete for authenticated users" ON public.aufmass_labor FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read access for all users" ON public.aufmass_markers FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.aufmass_markers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable update for authenticated users" ON public.aufmass_markers FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable delete for authenticated users" ON public.aufmass_markers FOR DELETE USING (auth.uid() IS NOT NULL);
