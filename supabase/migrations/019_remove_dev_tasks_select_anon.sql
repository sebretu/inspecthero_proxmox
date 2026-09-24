-- remove DEV anon read policy for tasks

drop policy if exists dev_tasks_select_all on public.tasks;
