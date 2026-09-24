-- =============================================================================
-- Migration: 20260919120000_photo_documentations.sql
-- Description: Photo Documentation (Dokumentation) with callout markers & detail photos
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.photo_documentations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    title text NOT NULL,
    description text,
    location text,
    author_name text,
    company_name text,
    main_image_url text NOT NULL,
    main_image_path text,
    main_image_width integer,
    main_image_height integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.photo_doc_points (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    documentation_id uuid NOT NULL REFERENCES public.photo_documentations(id) ON DELETE CASCADE,
    point_number integer NOT NULL DEFAULT 1,
    title text NOT NULL DEFAULT '',
    description text,
    x_norm double precision NOT NULL,
    y_norm double precision NOT NULL,
    callout_x_norm double precision,
    callout_y_norm double precision,
    color text DEFAULT '#00C8FF',
    photos jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photo_documentations_project ON public.photo_documentations(project_id);
CREATE INDEX IF NOT EXISTS idx_photo_doc_points_doc ON public.photo_doc_points(documentation_id, point_number ASC);

ALTER TABLE public.photo_documentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_doc_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photo_documentations_all" ON public.photo_documentations;
CREATE POLICY "photo_documentations_all" ON public.photo_documentations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "photo_doc_points_all" ON public.photo_doc_points;
CREATE POLICY "photo_doc_points_all" ON public.photo_doc_points FOR ALL USING (true) WITH CHECK (true);
