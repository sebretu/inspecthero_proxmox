-- 1. symbol_clusters table
CREATE TABLE IF NOT EXISTS public.symbol_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centroid vector(768) NOT NULL,
    size INTEGER DEFAULT 0,
    majority_symbol_type TEXT,
    model_version TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add cluster_id to symbol_crops
ALTER TABLE public.symbol_crops ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES public.symbol_clusters(id) ON DELETE SET NULL;

-- 2. plan_embeddings table (version-level plan embeddings)
CREATE TABLE IF NOT EXISTS public.plan_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_version_id UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE CASCADE,
    embedding vector(768) NOT NULL,
    model_version TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. embedding_jobs table (db-driven queue)
CREATE TABLE IF NOT EXISTS public.embedding_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crop_id UUID NOT NULL REFERENCES public.symbol_crops(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status ON public.embedding_jobs(status);

-- 4. symbol_feedback table (extended columns)
CREATE TABLE IF NOT EXISTS public.symbol_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID NOT NULL,
    accepted BOOLEAN NOT NULL,
    corrected_symbol TEXT,
    corrected_position JSONB, -- {x_norm, y_norm}
    corrected_rotation FLOAT,
    review_time INTEGER, -- in seconds
    reviewer TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. dataset_versions table (extended columns)
CREATE TABLE IF NOT EXISTS public.dataset_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT NOT NULL UNIQUE,
    git_commit TEXT,
    embedding_model TEXT,
    symbol_count INTEGER DEFAULT 0,
    plan_count INTEGER DEFAULT 0,
    export_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. pgvector index on symbol_crops
CREATE INDEX IF NOT EXISTS symbol_crop_embedding_idx
ON public.symbol_crops
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 10);
