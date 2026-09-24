-- Add diameter to trommels
ALTER TABLE public.trommels ADD COLUMN IF NOT EXISTS diameter numeric(12, 2);
