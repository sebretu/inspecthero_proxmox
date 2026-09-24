-- 014: log admin reset to task_history

create or replace function public.admin_reset_task_to_open(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_task public.tasks;
  v_old public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then raise exception 'Task not found'; end if;

  if not public.is_project_admin_or_mod(v_task.project_id) then
    raise exception 'Only admin/mod can reset';
  end if;

  -- keep old snapshot for history
  v_old := v_task;

  -- bypass workflow trigger validation + logging
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

  -- manual history log (because bypass skips trigger logging)
  insert into public.task_history(task_id, action, old_value, new_value, changed_by)
  values (
    v_task.id,
    'RESET_TO_OPEN',
    to_jsonb(v_old),
    jsonb_build_object('from', v_old.status, 'to', v_task.status, 'row', to_jsonb(v_task)),
    auth.uid()
  );

  return v_task;
end $function$;

revoke all on function public.admin_reset_task_to_open(uuid) from public, anon;
grant execute on function public.admin_reset_task_to_open(uuid) to authenticated, service_role;
