-- Allow anonymous users to see cable routes for map visualization in public scan
DROP POLICY IF EXISTS "cable_routes_public_search" ON public.cable_routes;
CREATE POLICY "cable_routes_public_search" ON public.cable_routes
  FOR SELECT TO anon
  USING (true);
