-- =============================================================================
-- Migration: Add is_favorite to materials
-- Description: Adds a boolean flag so users can mark frequently used materials.
-- =============================================================================

ALTER TABLE public.materials ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT false;

-- Create an index to speed up filtering on favorites, especially for Task search
CREATE INDEX IF NOT EXISTS idx_materials_is_favorite ON public.materials(is_favorite) WHERE is_favorite = true;
