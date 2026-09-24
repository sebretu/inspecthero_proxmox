-- Create symbol_predictions table
CREATE TABLE IF NOT EXISTS public.symbol_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    x_norm FLOAT NOT NULL,
    y_norm FLOAT NOT NULL,
    crop_path TEXT,
    predicted_symbol_type TEXT,
    predicted_circuit_code TEXT,
    confidence FLOAT,
    matched_crop_id UUID REFERENCES public.symbol_crops(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS symbol_predictions_plan_idx ON public.symbol_predictions(plan_id);
CREATE INDEX IF NOT EXISTS symbol_predictions_status_idx ON public.symbol_predictions(status);

-- Enable RLS
ALTER TABLE public.symbol_predictions ENABLE ROW LEVEL SECURITY;

-- Enable SELECT policy for authenticated users
DROP POLICY IF EXISTS "symbol_predictions_select_policy" ON public.symbol_predictions;
CREATE POLICY "symbol_predictions_select_policy" ON public.symbol_predictions
    FOR SELECT USING (auth.role() = 'authenticated');

-- Enable ALL policy for service role / admin
DROP POLICY IF EXISTS "symbol_predictions_admin_policy" ON public.symbol_predictions;
CREATE POLICY "symbol_predictions_admin_policy" ON public.symbol_predictions
    FOR ALL USING (
        exists (
            select 1 from public.profiles
            where id = auth.uid() and role in ('ADMIN', 'MODERATOR')
        )
    );

-- Create public function for similarity matching (pgvector)
CREATE OR REPLACE FUNCTION public.get_similar_symbols(
    query_embedding vector(768),
    match_limit int DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    symbol_type TEXT,
    clip_prompt JSONB,
    similarity numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
      sc.id,
      sc.symbol_type,
      sc.clip_prompt,
      (1 - (sc.embedding <=> query_embedding))::numeric AS similarity
    FROM public.symbol_crops sc
    -- 'approved' = manual ground truth markers (highest quality)
    -- 'passed'   = AI-generated crops that passed automated QC
    -- 'failed'   = rejected/negative learning crops (excluded from positive matching)
    WHERE sc.quality_status IN ('passed', 'approved')
      AND sc.embedding IS NOT NULL
      AND sc.symbol_type != 'rejected_negative'
    ORDER BY sc.embedding <=> query_embedding
    LIMIT match_limit;
END;
$$;
