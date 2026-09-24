-- Admin/mod reset task to OPEN (uses bypass var + logs RESET_TO_OPEN with real from/to)

create or replace function public.admin_reset_task_to_open(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_task public.tasks;
  v_before_status public.task_status;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  v_before_status := v_task.status;

  if not public.is_project_admin_or_mod(v_task.project_id) then
    raise exception 'Only admin/mod can reset';
  end if;

  -- bypass workflow trigger validation + history logging for this UPDATE
  perform set_config('app.bypass_task_workflow', '1', true);

  update public.tasks
  set
    status='OPEN',
    done_reported_by=null,
    done_reported_at=null,
    done_note=null,
    approved_by=null,
    approved_at=null,
    rejected_by=null,
    rejected_at=null,
    rejection_reason=null
  where id=p_task_id
  returning * into v_task;

  -- log reset event manually (because trigger bypass skips history)
  insert into public.task_history(task_id, action, new_value, changed_by)
  values (
    v_task.id,
    'RESET_TO_OPEN',
    jsonb_build_object('from', v_before_status::text, 'to', 'OPEN', 'row', to_jsonb(v_task)),
    auth.uid()
  );

  return v_task;
end;
$$;

revoke all on function public.admin_reset_task_to_open(uuid) from public, anon;
grant execute on function public.admin_reset_task_to_open(uuid) to authenticated, service_role;
