-- 015: RPC create_task (controlled insert)

create or replace function public.create_task(
  p_project_id uuid,
  p_plan_id uuid,
  p_x_norm numeric,
  p_y_norm numeric,
  p_title text,
  p_description text default null,
  p_priority public.task_priority default 'MEDIUM',
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
  v_plan_project uuid;
begin
  -- must be logged in
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- project membership required
  if not public.is_project_member(p_project_id) then
    raise exception 'Not a project member';
  end if;

  -- plan must belong to the same project
  select project_id into v_plan_project
  from public.plans
  where id = p_plan_id;

  if v_plan_project is null then
    raise exception 'Plan not found';
  end if;

  if v_plan_project <> p_project_id then
    raise exception 'Plan does not belong to project';
  end if;

  -- validate coords (0..1)
  if p_x_norm < 0 or p_x_norm > 1 then
    raise exception 'x_norm must be in [0..1]';
  end if;

  if p_y_norm < 0 or p_y_norm > 1 then
    raise exception 'y_norm must be in [0..1]';
  end if;

  -- validate title
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Title required';
  end if;

  -- if assigning to user -> must be project member
  if p_assigned_user_id is not null then
    if not exists (
      select 1
      from public.project_members pm
      where pm.project_id = p_project_id
        and pm.user_id = p_assigned_user_id
    ) then
      raise exception 'Assigned user must be a project member';
    end if;
  end if;

  -- if assigning to company -> must be same tenant/company as current session
  if p_assigned_company_id is not null then
    if p_assigned_company_id <> public.current_company_id() then
      raise exception 'Assigned company must be current company';
    end if;
  end if;

  insert into public.tasks(
    project_id,
    plan_id,
    x_norm,
    y_norm,
    title,
    description,
    priority,
    status,
    due_date,
    assigned_user_id,
    assigned_company_id,
    created_by
  ) values (
    p_project_id,
    p_plan_id,
    p_x_norm,
    p_y_norm,
    p_title,
    p_description,
    p_priority,
    'OPEN',
    p_due_date,
    p_assigned_user_id,
    p_assigned_company_id,
    auth.uid()
  )
  returning * into v_task;

  return v_task;
end
$function$;

revoke all on function public.create_task(uuid,uuid,numeric,numeric,text,text,public.task_priority,date,uuid,uuid) from public, anon;
grant execute on function public.create_task(uuid,uuid,numeric,numeric,text,text,public.task_priority,date,uuid,uuid) to authenticated, service_role;
