import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
});

async function run() {
    try {
        console.log("Updating RLS policies for cables and cable_routes...");

        await pool.query(`DROP POLICY IF EXISTS "cables_company_select" ON public.cables;`);
        await pool.query(`CREATE POLICY "cables_company_select" ON public.cables FOR SELECT TO authenticated USING (
          (company_id = public.current_company_id()) OR public.is_admin() OR 
          (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
        );`);

        await pool.query(`DROP POLICY IF EXISTS "cables_company_update" ON public.cables;`);
        await pool.query(`CREATE POLICY "cables_company_update" ON public.cables FOR UPDATE TO authenticated USING (
          (company_id = public.current_company_id()) OR public.is_admin() OR 
          (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
        );`);

        await pool.query(`DROP POLICY IF EXISTS "cable_routes_company_select" ON public.cable_routes;`);
        await pool.query(`CREATE POLICY "cable_routes_company_select" ON public.cable_routes FOR SELECT TO authenticated USING (
          (company_id = public.current_company_id()) OR public.is_admin() OR 
          (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
        );`);

        await pool.query(`DROP POLICY IF EXISTS "cable_routes_company_update" ON public.cable_routes;`);
        await pool.query(`CREATE POLICY "cable_routes_company_update" ON public.cable_routes FOR UPDATE TO authenticated USING (
          (company_id = public.current_company_id()) OR public.is_admin() OR 
          (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
        );`);

        console.log("RLS policies updated successfully!");
    } catch (e) {
        console.error('Error applying policies:', e);
    } finally {
        await pool.end();
    }
}
run();
