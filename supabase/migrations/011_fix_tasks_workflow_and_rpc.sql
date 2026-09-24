-- =============================================================================
-- 008 FIX: tasks workflow trigger (AFTER) + RPC submit/approve/reject
-- =============================================================================

-- 1) task_history FK może zostać DEFERRABLE (opcjonalnie, ale bezpiecznie)
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema='public'
      and table_name='task_history'
      and constraint_name='task_history_task_id_fkey'
  ) then
    alter table public.task_history drop constraint task_history_task_id_fkey;
  end if;
exception when undefined_table then
  -- jeśli tabela nie istnieje, nic nie rób
  null;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='task_history'
  ) then
    alter table public.task_history
      add constraint task_history_task_id_fkey
      foreign key (task_id) references public.tasks(id) on delete cascade
      deferrable initially deferred;
  end if;
end $$;

-- 2) funkcja trigger: loguje CREATE i zmianę statusu do task_history
--    (dopasowane do Twojego task_history: action, new_value, changed_by)
create or replace function public.enforce_task_workflow_and_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status public.task_status;
  new_status public.task_status;
begin
  if (tg_op = 'INSERT') then
    -- ustaw defaulty jeśli aplikacja nie podała
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    if new.status is null then
      new.status := 'OPEN';
    end if;

    -- UWAGA: trigger jest AFTER, więc tu tylko log
    insert into public.task_history(task_id, action, new_value, changed_by)
    values (new.id, 'CREATED', to_jsonb(new), new.created_by);

    return new;
  end if;

  if (tg_op = 'UPDATE') then
    old_status := old.status;
    new_status := new.status;

    -- walidacja przejść statusów (jeśli status się zmienia)
    if new_status is distinct from old_status then
      if not (
        (old_status = 'OPEN' and new_status in ('IN_PROGRESS','DONE_WAITING_APPROVAL')) or
        (old_status = 'IN_PROGRESS' and new_status in ('DONE_WAITING_APPROVAL','OPEN')) or
        (old_status = 'DONE_WAITING_APPROVAL' and new_status in ('APPROVED','REJECTED')) or
        (old_status = 'REJECTED' and new_status in ('IN_PROGRESS','OPEN')) or
        (old_status = 'APPROVED' and new_status = 'APPROVED')
      ) then
        raise exception 'Invalid status transition: % -> %', old_status, new_status;
      end if;

      -- pola audit wg statusu
      if new_status = 'DONE_WAITING_APPROVAL' then
        if new.done_reported_by is null then new.done_reported_by := auth.uid(); end if;
        if new.done_reported_at is null then new.done_reported_at := now(); end if;
      end if;

      if new_status = 'APPROVED' then
        if new.approved_by is null then new.approved_by := auth.uid(); end if;
        if new.approved_at is null then new.approved_at := now(); end if;
        new.rejected_by := null;
        new.rejected_at := null;
        new.rejection_reason := null;
      end if;

      if new_status = 'REJECTED' then
        if new.rejected_by is null then new.rejected_by := auth.uid(); end if;
        if new.rejected_at is null then new.rejected_at := now(); end if;
        if new.rejection_reason is null or length(trim(new.rejection_reason)) = 0 then
          raise exception 'rejection_reason required';
        end if;
        new.approved_by := null;
        new.approved_at := null;
      end if;

      insert into public.task_history(task_id, action, new_value, changed_by)
      values (new.id, 'STATUS_CHANGED', jsonb_build_object('from', old_status, 'to', new_status, 'row', to_jsonb(new)), auth.uid());
    end if;

    return new;
  end if;

  return new;
end;
$$;

-- 3) podmień trigger na AFTER (to naprawia FK przy CREATE)
drop trigger if exists trg_tasks_workflow on public.tasks;

create trigger trg_tasks_workflow
after insert or update on public.tasks
for each row
execute function public.enforce_task_workflow_and_log();

-- 4) RPC: submit done / approve / reject
create or replace function public.submit_task_done(p_task_id uuid, p_done_note text default null)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then raise exception 'Task not found'; end if;

  if not (
    v_task.assigned_user_id = auth.uid()
    or v_task.created_by = auth.uid()
    or public.is_project_admin_or_mod(v_task.project_id)
  ) then
    raise exception 'Not allowed';
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
  if not found then raise exception 'Task not found'; end if;

  if not public.is_project_admin_or_mod(v_task.project_id) then
    raise exception 'Only admin/mod can approve';
  end if;

  if v_task.status <> 'DONE_WAITING_APPROVAL' then
    raise exception 'Task must be DONE_WAITING_APPROVAL';
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
    raise exception 'Reason required';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then raise exception 'Task not found'; end if;

  if not public.is_project_admin_or_mod(v_task.project_id) then
    raise exception 'Only admin/mod can reject';
  end if;

  if v_task.status <> 'DONE_WAITING_APPROVAL' then
    raise exception 'Task must be DONE_WAITING_APPROVAL';
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
