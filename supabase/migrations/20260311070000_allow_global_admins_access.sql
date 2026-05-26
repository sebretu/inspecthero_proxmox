-- 20260311070000_allow_global_admins_access.sql
-- Update core authorization functions to grant access to users with global ADMIN or MOD roles within their company.

CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean AS $$
BEGIN
  -- 1. Global Admin/Mod check (company-wide access)
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.projects pr ON pr.id = p_project_id
    WHERE p.id = auth.uid()
      AND p.company_id = pr.company_id
      AND p.role IN ('ADMIN', 'MOD')
  ) THEN
    RETURN true;
  END IF;

  -- 2. Explicit project membership check
  RETURN EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_project_admin_or_mod(p_project_id uuid)
RETURNS boolean AS $$
BEGIN
  -- 1. Global Admin/Mod check (company-wide admin access)
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.projects pr ON pr.id = p_project_id
    WHERE p.id = auth.uid()
      AND p.company_id = pr.company_id
      AND p.role IN ('ADMIN', 'MOD')
  ) THEN
    RETURN true;
  END IF;

  -- 2. Explicit project membership check with admin/mod role
  RETURN EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('ADMIN', 'MODERATOR', 'MOD')
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
