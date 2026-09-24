-- Migration to drop foreign key constraint on photo_id in aufmass_versions.
-- This allows polymorphic photo references (e.g. both aufmass_photos and task_photos).

ALTER TABLE public.aufmass_versions 
DROP CONSTRAINT IF EXISTS aufmass_versions_photo_id_fkey;
