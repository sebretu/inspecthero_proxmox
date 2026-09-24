-- =============================================================================
-- Migration: 20260918120000_maengelanzeige_user_docs_and_export.sql
-- Description: Add user documentation, photo types (BEFORE/AFTER), and per-item export toggles
-- =============================================================================

ALTER TABLE public.maengelanzeige_items 
  ADD COLUMN IF NOT EXISTS user_documentation text,
  ADD COLUMN IF NOT EXISTS export_include_before_photos boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS export_include_after_photos boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS export_include_admin_doc boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS export_include_user_doc boolean DEFAULT true;

ALTER TABLE public.maengelanzeige_photos 
  ADD COLUMN IF NOT EXISTS photo_type text DEFAULT 'AFTER';
