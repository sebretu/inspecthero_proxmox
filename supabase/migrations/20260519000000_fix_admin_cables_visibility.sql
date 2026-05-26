-- Helper functions to check user roles without causing infinite recursion in profiles RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'::user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_mod()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('ADMIN'::user_role, 'MODERATOR'::user_role, 'MOD'::user_role)
  );
$$;

-- Grant permissions on helpers
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_mod() TO authenticated;

-- ── PROFILES ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_company" ON public.profiles;
CREATE POLICY "profiles_select_company" ON public.profiles FOR SELECT
  TO authenticated
  USING (((company_id IS NOT NULL) AND (company_id = public.current_company_id())) OR public.is_admin());

-- ── COMPANIES ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "companies_select_own" ON public.companies;
CREATE POLICY "companies_select_own" ON public.companies FOR SELECT
  TO authenticated
  USING ((id = public.current_company_id()) OR public.is_admin());

-- ── CABLES ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cables_company_select" ON public.cables;
CREATE POLICY "cables_company_select" ON public.cables FOR SELECT
  TO authenticated
  USING ((company_id = public.current_company_id()) OR public.is_admin());

DROP POLICY IF EXISTS "cables_company_insert" ON public.cables;
CREATE POLICY "cables_company_insert" ON public.cables FOR INSERT
  TO authenticated
  WITH CHECK ((company_id = public.current_company_id()) OR public.is_admin());

DROP POLICY IF EXISTS "cables_company_update" ON public.cables;
CREATE POLICY "cables_company_update" ON public.cables FOR UPDATE
  TO authenticated
  USING ((company_id = public.current_company_id()) OR public.is_admin());

DROP POLICY IF EXISTS "cables_admin_delete" ON public.cables;
CREATE POLICY "cables_admin_delete" ON public.cables FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR ((company_id = public.current_company_id()) AND public.is_admin_or_mod())
  );

-- ── CABLE ROUTES ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cable_routes_company_select" ON public.cable_routes;
CREATE POLICY "cable_routes_company_select" ON public.cable_routes FOR SELECT
  TO authenticated
  USING ((company_id = public.current_company_id()) OR public.is_admin());

DROP POLICY IF EXISTS "cable_routes_company_insert" ON public.cable_routes;
CREATE POLICY "cable_routes_company_insert" ON public.cable_routes FOR INSERT
  TO authenticated
  WITH CHECK ((company_id = public.current_company_id()) OR public.is_admin());

DROP POLICY IF EXISTS "cable_routes_company_update" ON public.cable_routes;
CREATE POLICY "cable_routes_company_update" ON public.cable_routes FOR UPDATE
  TO authenticated
  USING ((company_id = public.current_company_id()) OR public.is_admin());

DROP POLICY IF EXISTS "cable_routes_admin_delete" ON public.cable_routes;
CREATE POLICY "cable_routes_admin_delete" ON public.cable_routes FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR ((company_id = public.current_company_id()) AND public.is_admin_or_mod())
  );

-- ── TROMMELS ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "trommels_company_select" ON public.trommels;
CREATE POLICY "trommels_company_select" ON public.trommels FOR SELECT
  TO authenticated
  USING ((company_id = public.current_company_id()) OR public.is_admin());

DROP POLICY IF EXISTS "trommels_company_insert" ON public.trommels;
CREATE POLICY "trommels_company_insert" ON public.trommels FOR INSERT
  TO authenticated
  WITH CHECK ((company_id = public.current_company_id()) OR public.is_admin());

DROP POLICY IF EXISTS "trommels_company_update" ON public.trommels;
CREATE POLICY "trommels_company_update" ON public.trommels FOR UPDATE
  TO authenticated
  USING ((company_id = public.current_company_id()) OR public.is_admin());

DROP POLICY IF EXISTS "trommels_admin_delete" ON public.trommels;
CREATE POLICY "trommels_admin_delete" ON public.trommels FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR ((company_id = public.current_company_id()) AND public.is_admin_or_mod())
  );

-- ── CABLE HISTORY ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cable_history_company_select" ON public.cable_history;
CREATE POLICY "cable_history_company_select" ON public.cable_history FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.cables c
      WHERE c.id = cable_history.cable_id AND c.company_id = public.current_company_id()
    )
  );

-- ── PROJECTS ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_insert_admin" ON public.projects;
CREATE POLICY "projects_insert_admin" ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK ((company_id = public.current_company_id()) OR public.is_admin());
