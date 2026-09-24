-- Migration: Add coordinate snapshot to plan_versions
-- File: /home/ubuntu/building-task-manager/supabase/migrations/20260612000004_add_version_snapshot.sql

ALTER TABLE public.plan_versions 
ADD COLUMN IF NOT EXISTS coordinate_snapshot JSONB NULL;
