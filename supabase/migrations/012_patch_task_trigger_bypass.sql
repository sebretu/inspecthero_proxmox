-- Allow admin/system bypass via session var: app.bypass_task_workflow = '1'

create or replace function public.enforce_task_workflow_and_log()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  old_status public.task_status;
  new_status public.task_status;
  bypass boolean := coalesce(nullif(current_setting('app.bypass_task_workflow', true),''), '0') = '1';
begin
  -- If bypass enabled, skip validation + history logging
  if bypass then
    return new;
  end if;

  if (tg_op = 'INSERT') then
    -- set defaults if app did not provide
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    if new.status is null then
      new.status := 'OPEN';
    end if;

    insert into public.task_history(task_id, action, new_value, changed_by)
    values (new.id, 'CREATED', to_jsonb(new), new.created_by);

    return new;
  end if;

  if (tg_op = 'UPDATE') then
    old_status := old.status;
    new_status := new.status;

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
      values (
        new.id,
        'STATUS_CHANGED',
        jsonb_build_object('from', old_status, 'to', new_status, 'row', to_jsonb(new)),
        auth.uid()
      );
    end if;

    return new;
  end if;

  return new;
end;
$function$;
