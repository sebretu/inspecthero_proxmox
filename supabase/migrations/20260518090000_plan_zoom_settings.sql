-- Add custom min_zoom and magnification to plans table
ALTER TABLE public.plans 
ADD COLUMN IF NOT EXISTS min_zoom integer,
ADD COLUMN IF NOT EXISTS magnification integer DEFAULT 0;

-- Notify postgrest about schema changes
NOTIFY pgrst, 'reload schema';
