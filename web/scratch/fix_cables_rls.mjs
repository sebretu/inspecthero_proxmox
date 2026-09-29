import postgres from "postgres";

// ZAMIEŃ 'YOUR_POSTGRES_PASSWORD' na swoje hasło do bazy danych:
const sql = postgres("postgresql://postgres:YOUR_POSTGRES_PASSWORD@100.88.160.117:5432/postgres");

async function run() {
  console.log("Updating RLS policies for cables and cable_routes...");

  await sql`DROP POLICY IF EXISTS "cables_company_select" ON public.cables;`;
  await sql`CREATE POLICY "cables_company_select" ON public.cables FOR SELECT TO authenticated USING (
    (company_id = public.current_company_id()) OR public.is_admin() OR 
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
  );`;

  await sql`DROP POLICY IF EXISTS "cables_company_update" ON public.cables;`;
  await sql`CREATE POLICY "cables_company_update" ON public.cables FOR UPDATE TO authenticated USING (
    (company_id = public.current_company_id()) OR public.is_admin() OR 
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
  );`;

  await sql`DROP POLICY IF EXISTS "cable_routes_company_select" ON public.cable_routes;`;
  await sql`CREATE POLICY "cable_routes_company_select" ON public.cable_routes FOR SELECT TO authenticated USING (
    (company_id = public.current_company_id()) OR public.is_admin() OR 
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
  );`;

  await sql`DROP POLICY IF EXISTS "cable_routes_company_update" ON public.cable_routes;`;
  await sql`CREATE POLICY "cable_routes_company_update" ON public.cable_routes FOR UPDATE TO authenticated USING (
    (company_id = public.current_company_id()) OR public.is_admin() OR 
    (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
  );`;

  console.log("RLS policies updated successfully!");
  process.exit(0);
}

run().catch(console.error);
