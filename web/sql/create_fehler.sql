-- Create fehler table
CREATE TABLE IF NOT EXISTS public.fehler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  x_norm DOUBLE PRECISION,
  y_norm DOUBLE PRECISION,
  assigned_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create fehler_photos table
CREATE TABLE IF NOT EXISTS public.fehler_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fehler_id UUID NOT NULL REFERENCES fehler(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.fehler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fehler_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for fehler
DROP POLICY IF EXISTS "Fehler viewable by everyone in project" ON public.fehler;
CREATE POLICY "Fehler viewable by everyone in project"
  ON public.fehler FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create fehler" ON public.fehler;
CREATE POLICY "Users can create fehler"
  ON public.fehler FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can update fehler" ON public.fehler;
CREATE POLICY "Admins can update fehler"
  ON public.fehler FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can delete fehler" ON public.fehler;
CREATE POLICY "Admins can delete fehler"
  ON public.fehler FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS Policies for fehler_photos
DROP POLICY IF EXISTS "Fehler photos viewable by everyone" ON public.fehler_photos;
CREATE POLICY "Fehler photos viewable by everyone"
  ON public.fehler_photos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can upload fehler photos" ON public.fehler_photos;
CREATE POLICY "Users can upload fehler photos"
  ON public.fehler_photos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete fehler photos" ON public.fehler_photos;
CREATE POLICY "Users can delete fehler photos"
  ON public.fehler_photos FOR DELETE USING (auth.uid() IS NOT NULL);
