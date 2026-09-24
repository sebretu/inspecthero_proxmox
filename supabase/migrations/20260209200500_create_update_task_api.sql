BEGIN;

CREATE OR REPLACE FUNCTION public.update_task_api(
  p_id uuid,
  p_changed_by uuid,
  p_patch jsonb
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user uuid := auth.uid();
  v_task public.tasks;
  v_patch RECORD;
  v_updated public.tasks;
  v_has_updates boolean;
BEGIN
  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_changed_by IS NOT NULL AND p_changed_by <> v_auth_user THEN
    RAISE EXCEPTION 'changed_by mismatch';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Patch must be a JSON object';
  END IF;

  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF NOT public.is_project_member(v_task.project_id) THEN
    RAISE EXCEPTION 'Not a project member';
  END IF;

  IF NOT (
    public.is_project_admin_or_mod(v_task.project_id)
    OR v_task.assigned_user_id = v_auth_user
    OR v_task.created_by = v_auth_user
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_has_updates := (
    (p_patch ? 'title') OR
    (p_patch ? 'description') OR
    (p_patch ? 'status') OR
    (p_patch ? 'priority') OR
    (p_patch ? 'due_date') OR
    (p_patch ? 'assigned_user_id') OR
    (p_patch ? 'assigned_company_id')
  );

  IF NOT v_has_updates THEN
    RAISE EXCEPTION 'No updatable fields provided';
  END IF;

  SELECT *
  INTO v_patch
  FROM jsonb_to_record(p_patch) AS x(
    title text,
    description text,
    status public.task_status,
    priority public.task_priority,
    due_date date,
    assigned_user_id uuid,
    assigned_company_id uuid
  );

  IF (p_patch ? 'assigned_user_id') AND v_patch.assigned_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.project_members pm
      WHERE pm.project_id = v_task.project_id
        AND pm.user_id = v_patch.assigned_user_id
    ) THEN
      RAISE EXCEPTION 'Assigned user must be a project member';
    END IF;
  END IF;

  IF (p_patch ? 'assigned_company_id') AND v_patch.assigned_company_id IS NOT NULL THEN
    IF v_patch.assigned_company_id <> public.current_company_id() THEN
      RAISE EXCEPTION 'Assigned company must match current company';
    END IF;
  END IF;

  UPDATE public.tasks t
  SET
    title = CASE WHEN p_patch ? 'title' THEN v_patch.title ELSE t.title END,
    description = CASE WHEN p_patch ? 'description' THEN v_patch.description ELSE t.description END,
    status = CASE WHEN p_patch ? 'status' THEN v_patch.status ELSE t.status END,
    priority = CASE WHEN p_patch ? 'priority' THEN v_patch.priority ELSE t.priority END,
    due_date = CASE WHEN p_patch ? 'due_date' THEN v_patch.due_date ELSE t.due_date END,
    assigned_user_id = CASE WHEN p_patch ? 'assigned_user_id' THEN v_patch.assigned_user_id ELSE t.assigned_user_id END,
    assigned_company_id = CASE WHEN p_patch ? 'assigned_company_id' THEN v_patch.assigned_company_id ELSE t.assigned_company_id END
  WHERE t.id = p_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_task_api(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_task_api(uuid, uuid, jsonb) TO authenticated, service_role;

COMMIT;
