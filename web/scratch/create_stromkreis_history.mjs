import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
});

async function run() {
    try {
        console.log("Creating public.stromkreis_history table...");
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS public.stromkreis_history (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                marker_id UUID NOT NULL REFERENCES public.stromkreise(id) ON DELETE CASCADE,
                action TEXT NOT NULL,
                sub_cable TEXT,
                old_value JSONB,
                new_value JSONB,
                changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
            );
        `);

        console.log("Creating index for public.stromkreis_history...");
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_stromkreis_history_marker ON public.stromkreis_history(marker_id, created_at DESC);
        `);

        console.log("Enabling RLS on public.stromkreis_history...");
        await pool.query(`
            ALTER TABLE public.stromkreis_history ENABLE ROW LEVEL SECURITY;
        `);

        console.log("Creating select policy for public.stromkreis_history...");
        await pool.query(`
            DROP POLICY IF EXISTS "stromkreis_history_select" ON public.stromkreis_history;
        `);
        await pool.query(`
            CREATE POLICY "stromkreis_history_select" ON public.stromkreis_history
            FOR SELECT TO authenticated USING (
                (changed_by = auth.uid()) OR public.is_admin() OR EXISTS (
                    SELECT 1 FROM public.stromkreise s
                    WHERE s.id = marker_id AND (
                        s.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid())
                    )
                )
            );
        `);

        console.log("Creating insert policy for public.stromkreis_history...");
        await pool.query(`
            DROP POLICY IF EXISTS "stromkreis_history_insert" ON public.stromkreis_history;
        `);
        await pool.query(`
            CREATE POLICY "stromkreis_history_insert" ON public.stromkreis_history
            FOR INSERT TO authenticated WITH CHECK (true);
        `);

        console.log("stromkreis_history table and policies created successfully!");
    } catch (e) {
        console.error('Error creating table/policies:', e);
    } finally {
        await pool.end();
    }
}
run();
