-- Create symbol_crops table
CREATE TABLE IF NOT EXISTS public.symbol_crops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stromkreis_id UUID NOT NULL REFERENCES public.stromkreise(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    symbol_type TEXT NOT NULL,
    embedding_status TEXT DEFAULT 'pending',
    embedding_id TEXT,
    clip_prompt JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_symbol_crop UNIQUE (stromkreis_id)
);

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_symbol_crops_plan_id ON public.symbol_crops(plan_id);
CREATE INDEX IF NOT EXISTS idx_symbol_crops_type ON public.symbol_crops(symbol_type);
CREATE INDEX IF NOT EXISTS idx_symbol_crops_embedding_status ON public.symbol_crops(embedding_status);

-- Enable RLS
ALTER TABLE public.symbol_crops ENABLE ROW LEVEL SECURITY;

-- Enable SELECT policy for authenticated users
DROP POLICY IF EXISTS "symbol_crops_select_policy" ON public.symbol_crops;
CREATE POLICY "symbol_crops_select_policy" ON public.symbol_crops
    FOR SELECT USING (auth.role() = 'authenticated');

-- Enable ALL policy for admins
DROP POLICY IF EXISTS "symbol_crops_admin_all_policy" ON public.symbol_crops;
CREATE POLICY "symbol_crops_admin_all_policy" ON public.symbol_crops
    FOR ALL USING (
        exists (
            select 1 from public.profiles
            where id = auth.uid() and role in ('ADMIN', 'MODERATOR')
        )
    );

-- Create private bucket for symbol-crops (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('symbol-crops', 'symbol-crops', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Read Policy for authenticated users
DROP POLICY IF EXISTS "symbol_crops_storage_select_policy" ON storage.objects;
CREATE POLICY "symbol_crops_storage_select_policy" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'symbol-crops'
        and auth.role() = 'authenticated'
    );
