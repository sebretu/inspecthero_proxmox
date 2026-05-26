ALTER TABLE public.aufmass_sessions
ADD COLUMN plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
ADD COLUMN x_norm NUMERIC(10, 4),
ADD COLUMN y_norm NUMERIC(10, 4),
ADD COLUMN session_type VARCHAR(50) DEFAULT 'aufmass' CHECK (session_type IN ('aufmass', 'zusatz'));

CREATE TABLE IF NOT EXISTS public.aufmass_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.aufmass_sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    caption TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.aufmass_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.aufmass_photos FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.aufmass_photos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable update for authenticated users" ON public.aufmass_photos FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable delete for authenticated users" ON public.aufmass_photos FOR DELETE USING (auth.uid() IS NOT NULL);
