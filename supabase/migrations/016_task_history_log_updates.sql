-- 016: log updates of task fields (non-status changes) into task_history as UPDATED_FIELDS
-- Does NOT log when bypass is enabled (app.bypass_task_workflow='1').

create or replace function public.log_task_updates()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  bypass boolean := coalesce(nullif(current_setting('app.bypass_task_workflow', true),''), '0') = '1';
  changed_cols text[];
begin
  if bypass then
    return new;
  end if;

  -- workflow trigger logs STATUS_CHANGED, so skip those
  if new.status is distinct from old.status then
    return new;
  end if;

  changed_cols := array_remove(array[
    case when new.title is distinct from old.title then 'title' end,
    case when new.description is distinct from old.description then 'description' end,
    case when new.priority is distinct from old.priority then 'priority' end,
    case when new.due_date is distinct from old.due_date then 'due_date' end,
    case when new.assigned_user_id is distinct from old.assigned_user_id then 'assigned_user_id' end,
    case when new.assigned_company_id is distinct from old.assigned_company_id then 'assigned_company_id' end,
    case when new.x_norm is distinct from old.x_norm then 'x_norm' end,
    case when new.y_norm is distinct from old.y_norm then 'y_norm' end,
    case when new.plan_id is distinct from old.plan_id then 'plan_id' end
  ], null);

  if changed_cols is null or array_length(changed_cols, 1) is null then
    return new;
  end if;

  insert into public.task_history(task_id, action, old_value, new_value, changed_by)
  values (
    new.id,
    'UPDATED_FIELDS',
    to_jsonb(old),
    jsonb_build_object('changed', changed_cols, 'row', to_jsonb(new)),
    auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists trg_tasks_updates_log on public.tasks;

create trigger trg_tasks_updates_log
after update on public.tasks
for each row
execute function public.log_task_updates();
