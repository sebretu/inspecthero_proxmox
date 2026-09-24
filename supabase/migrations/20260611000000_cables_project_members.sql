-- Update cables and cable_routes visibility to allow project members to see them

-- CABLES
DROP POLICY IF EXISTS "cables_company_select" ON public.cables;
CREATE POLICY "cables_company_select" ON public.cables FOR SELECT
  TO authenticated
  USING (
    (company_id = public.current_company_id()) 
    OR public.is_admin()
    OR (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "cables_company_update" ON public.cables;
CREATE POLICY "cables_company_update" ON public.cables FOR UPDATE
  TO authenticated
  USING (
    (company_id = public.current_company_id()) 
    OR public.is_admin()
    OR (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
  );

-- CABLE ROUTES
DROP POLICY IF EXISTS "cable_routes_company_select" ON public.cable_routes;
CREATE POLICY "cable_routes_company_select" ON public.cable_routes FOR SELECT
  TO authenticated
  USING (
    (company_id = public.current_company_id()) 
    OR public.is_admin()
    OR (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "cable_routes_company_update" ON public.cable_routes;
CREATE POLICY "cable_routes_company_update" ON public.cable_routes FOR UPDATE
  TO authenticated
  USING (
    (company_id = public.current_company_id()) 
    OR public.is_admin()
    OR (project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid()))
  );
