const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });

  try {
    console.log("Connecting to PostgreSQL...");
    await client.connect();
    console.log("Connected successfully!");

    const sql = `
      -- 1. Create prototype_categories table
      CREATE TABLE IF NOT EXISTS public.prototype_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      -- Insert default categories if not existing
      INSERT INTO public.prototype_categories (slug, name)
      VALUES 
        ('socket', 'Socket'),
        ('edv', 'EDV'),
        ('light', 'Light'),
        ('cee', 'CEE'),
        ('special', 'Special'),
        ('sym_socket', 'Sym Socket'),
        ('sym_cee16', 'Sym CEE16'),
        ('sym_cee32', 'Sym CEE32'),
        ('text', 'Text')
      ON CONFLICT (slug) DO NOTHING;

      -- 2. Create prototype_symbols table
      CREATE TABLE IF NOT EXISTS public.prototype_symbols (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category TEXT NOT NULL,
        filename TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        embedding vector(768),
        embedding_version TEXT DEFAULT 'v1',
        embedding_status TEXT DEFAULT 'generated',
        image_size INT,
        dimensions TEXT,
        resolution TEXT,
        version INT DEFAULT 1,
        parent_id UUID REFERENCES public.prototype_symbols(id) ON DELETE SET NULL,
        active BOOLEAN DEFAULT true,
        notes TEXT,
        checksum TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      -- Create indexes for fast lookup
      CREATE INDEX IF NOT EXISTS prototype_symbols_category_idx ON public.prototype_symbols(category);
      CREATE INDEX IF NOT EXISTS prototype_symbols_active_idx ON public.prototype_symbols(active);

      -- 3. Enable RLS and create open policy for public/authenticated/service role
      ALTER TABLE public.prototype_symbols ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "prototype_symbols_policy" ON public.prototype_symbols;
      CREATE POLICY "prototype_symbols_policy" ON public.prototype_symbols FOR ALL USING (true);

      ALTER TABLE public.prototype_categories ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "prototype_categories_policy" ON public.prototype_categories;
      CREATE POLICY "prototype_categories_policy" ON public.prototype_categories FOR ALL USING (true);

      -- 4. Create vector similarity RPC for prototype_symbols
      CREATE OR REPLACE FUNCTION public.get_similar_prototype_symbols(
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
            ps.id,
            ps.category AS symbol_type,
            jsonb_build_object('filename', ps.filename, 'version', ps.version, 'notes', ps.notes) AS clip_prompt,
            (1 - (ps.embedding <=> query_embedding))::numeric AS similarity
          FROM public.prototype_symbols ps
          WHERE ps.active = true
            AND ps.embedding IS NOT NULL
          ORDER BY ps.embedding <=> query_embedding
          LIMIT match_limit;
      END;
      $$;

      -- 5. Update main get_similar_symbols RPC function to query prototype_symbols first
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
      DECLARE
          proto_count INT;
      BEGIN
          SELECT count(*) INTO proto_count FROM public.prototype_symbols WHERE active = true AND embedding IS NOT NULL;

          IF proto_count > 0 THEN
              RETURN QUERY
              SELECT
                ps.id,
                ps.category AS symbol_type,
                jsonb_build_object('filename', ps.filename, 'version', ps.version, 'notes', ps.notes) AS clip_prompt,
                (1 - (ps.embedding <=> query_embedding))::numeric AS similarity
              FROM public.prototype_symbols ps
              WHERE ps.active = true
                AND ps.embedding IS NOT NULL
              ORDER BY ps.embedding <=> query_embedding
              LIMIT match_limit;
          ELSE
              RETURN QUERY
              SELECT
                sc.id,
                sc.symbol_type,
                sc.clip_prompt,
                (1 - (sc.embedding <=> query_embedding))::numeric AS similarity
              FROM public.symbol_crops sc
              WHERE sc.quality_status IN ('passed', 'approved')
                AND sc.embedding IS NOT NULL
                AND sc.symbol_type != 'rejected_negative'
              ORDER BY sc.embedding <=> query_embedding
              LIMIT match_limit;
          END IF;
      END;
      $$;

      NOTIFY pgrst, 'reload schema';
    `;

    console.log("Executing SQL schema creation...");
    await client.query(sql);
    console.log("Prototype schema successfully created!");

    console.log("Verifying tables...");
    const ver1 = await client.query("SELECT count(*) FROM public.prototype_categories;");
    console.log("Categories count:", ver1.rows[0].count);

    const ver2 = await client.query("SELECT count(*) FROM public.prototype_symbols;");
    console.log("Prototypes count:", ver2.rows[0].count);

  } catch (e) {
    console.error("Database operation failed:", e);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

run();
