-- 016: RPC update_task (no status changes here)

create or replace function public.update_task(
  p_task_id uuid,
  p_title text default null,
  p_description text default null,
  p_priority public.task_priority default null,
  p_due_date date default null,
  p_assigned_user_id uuid default null,
  p_assigned_company_id uuid default null
)
returns public.tasks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_task public.tasks;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id;

  if not found then
    raise exception 'Task not found';
  end if;

  -- must be project member and either admin/mod or creator
  if not public.is_project_member(v_task.project_id) then
    raise exception 'Not a project member';
  end if;

  if not (public.is_project_admin_or_mod(v_task.project_id) or v_task.created_by = auth.uid()) then
    raise exception 'Not allowed';
  end if;

  -- if assigning to user -> must be project member
  if p_assigned_user_id is not null then
    if not exists (
      select 1
      from public.project_members pm
      where pm.project_id = v_task.project_id
        and pm.user_id = p_assigned_user_id
    ) then
      raise exception 'Assigned user must be a project member';
    end if;
  end if;

  -- if assigning to company -> must be current company
  if p_assigned_company_id is not null then
    if p_assigned_company_id <> public.current_company_id() then
      raise exception 'Assigned company must be current company';
    end if;
  end if;

  update public.tasks
  set
    title = coalesce(p_title, title),
    description = coalesce(p_description, description),
    priority = coalesce(p_priority, priority),
    due_date = p_due_date,
    assigned_user_id = p_assigned_user_id,
    assigned_company_id = p_assigned_company_id
  where id = p_task_id
  returning * into v_task;

  return v_task;
end
$function$;

revoke all on function public.update_task(uuid,text,text,public.task_priority,date,uuid,uuid) from public, anon;
grant execute on function public.update_task(uuid,text,text,public.task_priority,date,uuid,uuid) to authenticated, service_role;
