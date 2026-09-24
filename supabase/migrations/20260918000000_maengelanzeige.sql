-- =============================================================================
-- Migration: 20260918000000_maengelanzeige.sql
-- Description: Mängelanzeige module (PDF import, point detection, AI relevance, documentation, photos, reporting)
-- =============================================================================

-- Ensure storage buckets exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('maengelanzeige', 'maengelanzeige', true),
    ('maengelanzeige-photos', 'maengelanzeige-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing public policies for storage if any
DROP POLICY IF EXISTS "Public access to maengelanzeige" ON storage.objects;
CREATE POLICY "Public access to maengelanzeige" ON storage.objects FOR SELECT USING (bucket_id IN ('maengelanzeige', 'maengelanzeige-photos'));

DROP POLICY IF EXISTS "Authenticated users can upload to maengelanzeige" ON storage.objects;
CREATE POLICY "Authenticated users can upload to maengelanzeige" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('maengelanzeige', 'maengelanzeige-photos'));

DROP POLICY IF EXISTS "Authenticated users can update maengelanzeige objects" ON storage.objects;
CREATE POLICY "Authenticated users can update maengelanzeige objects" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('maengelanzeige', 'maengelanzeige-photos'));

DROP POLICY IF EXISTS "Authenticated users can delete maengelanzeige objects" ON storage.objects;
CREATE POLICY "Authenticated users can delete maengelanzeige objects" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('maengelanzeige', 'maengelanzeige-photos'));

-- 1. Table: maengelanzeige_documents
CREATE TABLE IF NOT EXISTS public.maengelanzeige_documents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    title text NOT NULL,
    file_name text NOT NULL,
    storage_bucket text NOT NULL DEFAULT 'maengelanzeige',
    storage_path text NOT NULL,
    total_pages integer DEFAULT 1,
    status text DEFAULT 'ACTIVE',
    uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maengelanzeige_docs_project_id ON public.maengelanzeige_documents(project_id);

-- 2. Table: maengelanzeige_items
CREATE TABLE IF NOT EXISTS public.maengelanzeige_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES public.maengelanzeige_documents(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    item_number text NOT NULL,
    page_number integer NOT NULL DEFAULT 1,
    original_text text NOT NULL,
    ai_relevance text DEFAULT 'POSSIBLY_RELEVANT', -- 'RELEVANT', 'POSSIBLY_RELEVANT', 'NOT_RELEVANT'
    ai_relevance_reason text,
    is_selected boolean DEFAULT false,
    our_documentation text,
    status text DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'DONE', 'NOT_RELEVANT'
    assigned_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maengelanzeige_items_doc_id ON public.maengelanzeige_items(document_id);
CREATE INDEX IF NOT EXISTS idx_maengelanzeige_items_project_id ON public.maengelanzeige_items(project_id);

-- 3. Table: maengelanzeige_photos
CREATE TABLE IF NOT EXISTS public.maengelanzeige_photos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id uuid NOT NULL REFERENCES public.maengelanzeige_items(id) ON DELETE CASCADE,
    storage_bucket text NOT NULL DEFAULT 'maengelanzeige-photos',
    storage_path text NOT NULL,
    url text NOT NULL,
    caption text,
    ai_suggested_caption text,
    uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maengelanzeige_photos_item_id ON public.maengelanzeige_photos(item_id);

-- Enable RLS
ALTER TABLE public.maengelanzeige_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maengelanzeige_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maengelanzeige_photos ENABLE ROW LEVEL SECURITY;

-- Policies for maengelanzeige_documents
DROP POLICY IF EXISTS "maengelanzeige_docs_select" ON public.maengelanzeige_documents;
CREATE POLICY "maengelanzeige_docs_select" ON public.maengelanzeige_documents FOR SELECT TO authenticated USING (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

DROP POLICY IF EXISTS "maengelanzeige_docs_insert" ON public.maengelanzeige_documents;
CREATE POLICY "maengelanzeige_docs_insert" ON public.maengelanzeige_documents FOR INSERT TO authenticated WITH CHECK (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

DROP POLICY IF EXISTS "maengelanzeige_docs_update" ON public.maengelanzeige_documents;
CREATE POLICY "maengelanzeige_docs_update" ON public.maengelanzeige_documents FOR UPDATE TO authenticated USING (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

DROP POLICY IF EXISTS "maengelanzeige_docs_delete" ON public.maengelanzeige_documents;
CREATE POLICY "maengelanzeige_docs_delete" ON public.maengelanzeige_documents FOR DELETE TO authenticated USING (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

-- Policies for maengelanzeige_items
DROP POLICY IF EXISTS "maengelanzeige_items_select" ON public.maengelanzeige_items;
CREATE POLICY "maengelanzeige_items_select" ON public.maengelanzeige_items FOR SELECT TO authenticated USING (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

DROP POLICY IF EXISTS "maengelanzeige_items_insert" ON public.maengelanzeige_items;
CREATE POLICY "maengelanzeige_items_insert" ON public.maengelanzeige_items FOR INSERT TO authenticated WITH CHECK (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

DROP POLICY IF EXISTS "maengelanzeige_items_update" ON public.maengelanzeige_items;
CREATE POLICY "maengelanzeige_items_update" ON public.maengelanzeige_items FOR UPDATE TO authenticated USING (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

DROP POLICY IF EXISTS "maengelanzeige_items_delete" ON public.maengelanzeige_items;
CREATE POLICY "maengelanzeige_items_delete" ON public.maengelanzeige_items FOR DELETE TO authenticated USING (
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()
);

-- Policies for maengelanzeige_photos
DROP POLICY IF EXISTS "maengelanzeige_photos_select" ON public.maengelanzeige_photos;
CREATE POLICY "maengelanzeige_photos_select" ON public.maengelanzeige_photos FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.maengelanzeige_items i WHERE i.id = item_id AND ((i.project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()))
);

DROP POLICY IF EXISTS "maengelanzeige_photos_insert" ON public.maengelanzeige_photos;
CREATE POLICY "maengelanzeige_photos_insert" ON public.maengelanzeige_photos FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.maengelanzeige_items i WHERE i.id = item_id AND ((i.project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()))
);

DROP POLICY IF EXISTS "maengelanzeige_photos_update" ON public.maengelanzeige_photos;
CREATE POLICY "maengelanzeige_photos_update" ON public.maengelanzeige_photos FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.maengelanzeige_items i WHERE i.id = item_id AND ((i.project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()))
);

DROP POLICY IF EXISTS "maengelanzeige_photos_delete" ON public.maengelanzeige_photos;
CREATE POLICY "maengelanzeige_photos_delete" ON public.maengelanzeige_photos FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.maengelanzeige_items i WHERE i.id = item_id AND ((i.project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())) OR public.is_admin()))
);
