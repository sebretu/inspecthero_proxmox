-- Add display_name column to materials table
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add index for faster searching by display name
CREATE INDEX IF NOT EXISTS idx_materials_display_name ON public.materials (display_name);
