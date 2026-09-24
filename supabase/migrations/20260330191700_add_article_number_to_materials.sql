-- Add article_number column to materials table
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS article_number TEXT;

-- Add index for faster searching by article number
CREATE INDEX IF NOT EXISTS idx_materials_article_number ON public.materials (article_number);

-- Add unique constraint for article_number (to allow upserts)
ALTER TABLE public.materials ADD CONSTRAINT materials_article_number_unique UNIQUE (article_number);
