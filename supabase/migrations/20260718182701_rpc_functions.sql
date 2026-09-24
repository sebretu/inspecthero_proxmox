-- Create database maintenance RPC function
CREATE OR REPLACE FUNCTION public.maintain_vector_idx()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cnt int;
  reindexed boolean := false;
BEGIN
  -- 1. Get count of symbol crops with embeddings
  SELECT count(*)::int INTO cnt FROM public.symbol_crops WHERE embedding IS NOT NULL;
  
  -- 2. Run analyze to update statistics
  ANALYZE public.symbol_crops;
  
  -- 3. Reindex if exceeds 100,000 crops
  IF cnt > 100000 THEN
    REINDEX INDEX public.symbol_crop_embedding_idx;
    reindexed := true;
  END IF;
  
  RETURN jsonb_build_object('count', cnt, 'reindexed', reindexed, 'success', true);
END;
$$;

-- Create plan similarity search RPC function
CREATE OR REPLACE FUNCTION public.get_similar_plans(
    query_embedding vector(768),
    current_plan_version_id uuid,
    match_limit int DEFAULT 3
)
RETURNS TABLE (
    plan_version_id UUID,
    similarity numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
      pe.plan_version_id, 
      (1 - (pe.embedding <=> query_embedding))::numeric AS similarity
    FROM public.plan_embeddings pe
    WHERE pe.plan_version_id <> current_plan_version_id
    ORDER BY pe.embedding <=> query_embedding
    LIMIT match_limit;
END;
$$;
