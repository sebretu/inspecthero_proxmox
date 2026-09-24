-- =============================================================================
-- 008 TASKS WORKFLOW RPC + stricter trigger rules
-- =============================================================================

create or replace function public.is_task_admin_or_mod(p_task_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and public.is_project_admin_or_mod(t.project_id)
  );
$$;

create or replace function public.submit_task_done(p_task_id uuid, p_done_note text default null)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  select * into v_task
  from public.tasks
  where id = p_task_id;

  if not found then
    raise exception 'Task not found or no access';
  end if;

  if not (
    v_task.assigned_user_id = auth.uid()
    or v_task.created_by = auth.uid()
    or public.is_project_admin_or_mod(v_task.project_id)
  ) then
    raise exception 'Not allowed to submit done';
  end if;

  update public.tasks
  set
    status = 'DONE_WAITING_APPROVAL',
    done_reported_by = auth.uid(),
    done_reported_at = now(),
    done_note = p_done_note
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

create or replace function public.approve_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found or no access';
  end if;

  if not public.is_project_admin_or_mod(v_task.project_id) then
    raise exception 'Only admin/mod can approve';
  end if;

  if v_task.status <> 'DONE_WAITING_APPROVAL' then
    raise exception 'Task must be DONE_WAITING_APPROVAL to approve';
  end if;

  update public.tasks
  set
    status = 'APPROVED',
    approved_by = auth.uid(),
    approved_at = now(),
    rejected_by = null,
    rejected_at = null,
    rejection_reason = null
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

create or replace function public.reject_task(p_task_id uuid, p_reason text)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Rejection reason is required';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found or no access';
  end if;

  if not public.is_project_admin_or_mod(v_task.project_id) then
    raise exception 'Only admin/mod can reject';
  end if;

  if v_task.status <> 'DONE_WAITING_APPROVAL' then
    raise exception 'Task must be DONE_WAITING_APPROVAL to reject';
  end if;

  update public.tasks
  set
    status = 'REJECTED',
    rejected_by = auth.uid(),
    rejected_at = now(),
    rejection_reason = p_reason,
    approved_by = null,
    approved_at = null
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.submit_task_done(uuid, text) from public;
revoke all on function public.approve_task(uuid) from public;
revoke all on function public.reject_task(uuid, text) from public;

grant execute on function public.submit_task_done(uuid, text) to authenticated;
grant execute on function public.approve_task(uuid) to authenticated;
grant execute on function public.reject_task(uuid, text) to authenticated;

create or replace function public.enforce_task_workflow_and_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    if new.status is null then
      new.status := 'OPEN';
    end if;

    insert into public.task_history(task_id, actor_id, action, from_status, to_status, note)
    values (new.id, auth.uid(), 'CREATED', null, new.status, null);

    return new;
  end if;

  if (tg_op = 'UPDATE') then
    if new.status = old.status then
      return new;
    end if;

    if not (
      (old.status = 'OPEN' and new.status in ('IN_PROGRESS','DONE_WAITING_APPROVAL')) or
      (old.status = 'IN_PROGRESS' and new.status in ('DONE_WAITING_APPROVAL','OPEN')) or
      (old.status = 'DONE_WAITING_APPROVAL' and new.status in ('APPROVED','REJECTED')) or
      (old.status = 'REJECTED' and new.status in ('IN_PROGRESS','OPEN')) or
      (old.status = 'APPROVED' and new.status = 'APPROVED')
    ) then
      raise exception 'Invalid status transition: % -> %', old.status, new.status;
    end if;

    if new.status = 'DONE_WAITING_APPROVAL' then
      if new.done_reported_by is null then new.done_reported_by := auth.uid(); end if;
      if new.done_reported_at is null then new.done_reported_at := now(); end if;
    end if;

    if new.status = 'APPROVED' then
      if new.approved_by is null then new.approved_by := auth.uid(); end if;
      if new.approved_at is null then new.approved_at := now(); end if;
      new.rejected_by := null;
      new.rejected_at := null;
      new.rejection_reason := null;
    end if;

    if new.status = 'REJECTED' then
      if new.rejected_by is null then new.rejected_by := auth.uid(); end if;
      if new.rejected_at is null then new.rejected_at := now(); end if;
      if new.rejection_reason is null or length(trim(new.rejection_reason)) = 0 then
        raise exception 'rejection_reason required';
      end if;
      new.approved_by := null;
      new.approved_at := null;
    end if;

    insert into public.task_history(task_id, actor_id, action, from_status, to_status, note)
    values (new.id, auth.uid(), 'STATUS_CHANGED', old.status, new.status, null);

    return new;
  end if;

  return new;
end;
$$;
