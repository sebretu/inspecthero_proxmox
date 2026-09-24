-- Add quality and embedding columns to symbol_crops
ALTER TABLE public.symbol_crops
ADD COLUMN IF NOT EXISTS quality_score numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS quality_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS brightness numeric,
ADD COLUMN IF NOT EXISTS edge_density numeric,
ADD COLUMN IF NOT EXISTS contains_lines boolean DEFAULT false;

-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column
ALTER TABLE public.symbol_crops
ADD COLUMN IF NOT EXISTS embedding vector(768);
