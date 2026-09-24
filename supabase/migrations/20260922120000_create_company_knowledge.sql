-- Create company_knowledge table for RAG knowledge base
CREATE TABLE IF NOT EXISTS public.company_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'GENERAL',
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for full-text search and company isolation
CREATE INDEX IF NOT EXISTS idx_company_knowledge_company_id ON public.company_knowledge(company_id);
CREATE INDEX IF NOT EXISTS idx_company_knowledge_category ON public.company_knowledge(category);

-- Enable RLS
ALTER TABLE public.company_knowledge ENABLE ROW LEVEL SECURITY;

-- Policy for reading: company members or global entries (company_id is NULL)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'company_knowledge' AND policyname = 'company_knowledge_select_policy'
    ) THEN
        CREATE POLICY company_knowledge_select_policy ON public.company_knowledge
            FOR SELECT
            USING (
                company_id IS NULL OR 
                company_id IN (
                    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
                )
            );
    END IF;
END $$;
