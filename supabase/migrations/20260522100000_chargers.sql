CREATE TABLE IF NOT EXISTS public.chargers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  x_norm numeric,
  y_norm numeric,
  mac text,
  pin text,
  qr_text text,
  photo_url text,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.chargers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for admins on chargers" 
ON public.chargers 
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

CREATE POLICY "Allow users to read chargers in their projects"
ON public.chargers
FOR SELECT USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

CREATE POLICY "Allow users to create chargers in their projects"
ON public.chargers
FOR INSERT WITH CHECK (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

CREATE POLICY "Allow users to update chargers in their projects"
ON public.chargers
FOR UPDATE USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

CREATE POLICY "Allow users to delete chargers in their projects"
ON public.chargers
FOR DELETE USING (
  project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- Bucket for charger photos
INSERT INTO storage.buckets (id, name, public) VALUES ('charger_photos', 'charger_photos', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Read Access Charger Photos" ON storage.objects
FOR SELECT USING (bucket_id = 'charger_photos');

CREATE POLICY "Authenticated Write Access Charger Photos" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'charger_photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated Delete Access Charger Photos" ON storage.objects
FOR DELETE USING (bucket_id = 'charger_photos' AND auth.role() = 'authenticated');
