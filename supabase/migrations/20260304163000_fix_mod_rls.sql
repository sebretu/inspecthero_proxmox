-- 20260304163000_fix_mod_rls.sql
-- 1. Update is_project_admin_or_mod to include 'MOD' (profile-level role that should reflect in project-level membership)
-- Note: project_members.role uses the same public.user_role enum.

CREATE OR REPLACE FUNCTION public.is_project_admin_or_mod(p_project_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('ADMIN', 'MODERATOR', 'MOD')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Sync project_members roles for existing users who were changed to 'MOD'
-- Find users whose profile role is 'MOD' but project_members role is still 'USER' or 'MODERATOR'
UPDATE public.project_members pm
SET role = 'MOD'
FROM public.profiles p
WHERE pm.user_id = p.id
  AND p.role = 'MOD'
  AND pm.role <> 'MOD';
