-- 20260511000001_fix_admin_tasks_rls.sql
-- Fixes RLS policies for tasks and history to ensure administrators can create tasks without violations.

-- 1. Fix is_project_member to include 'MODERATOR' and ensure global admin check is robust
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean AS $$
BEGIN
  -- 1. Global Admin/Mod check (company-wide access)
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.projects pr ON pr.id = p_project_id
    WHERE p.id = auth.uid()
      AND p.company_id = pr.company_id
      AND p.role IN ('ADMIN', 'MOD', 'MODERATOR')
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

-- 2. Fix is_project_admin_or_mod to include 'MODERATOR'
CREATE OR REPLACE FUNCTION public.is_project_admin_or_mod(p_project_id uuid)
RETURNS boolean AS $$
BEGIN
  -- 1. Global Admin/Mod check (company-wide admin access)
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.projects pr ON pr.id = p_project_id
    WHERE p.id = auth.uid()
      AND p.company_id = pr.company_id
      AND p.role IN ('ADMIN', 'MOD', 'MODERATOR')
  ) THEN
    RETURN true;
  END IF;

  -- 2. Explicit project membership check with admin/mod role
  RETURN EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('ADMIN', 'MODERATOR', 'MOD')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3. Ensure task_history has an INSERT policy for authenticated users
-- This prevents the "new row violates RLS" error if the trigger fails to bypass RLS.
DROP POLICY IF EXISTS task_history_insert on public.task_history;
CREATE POLICY task_history_insert
ON public.task_history FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id
      AND public.is_project_member(t.project_id)
  )
);

-- 4. Re-verify tasks_insert policy
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert
ON public.tasks FOR INSERT
WITH CHECK (
  public.is_project_member(project_id)
  AND (created_by = auth.uid() OR (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) IN ('ADMIN', 'MOD', 'MODERATOR'))
);

-- 5. Fix potential trigger issues with search_path and ownership
ALTER FUNCTION public.enforce_task_workflow_and_log() OWNER TO postgres;
ALTER FUNCTION public.is_project_member(uuid) OWNER TO postgres;
ALTER FUNCTION public.is_project_admin_or_mod(uuid) OWNER TO postgres;
