-- DEV ONLY: allow anon to read tasks (remove before prod)

drop policy if exists dev_tasks_select_all on public.tasks;

create policy dev_tasks_select_all
on public.tasks
for select
to anon
using (true);
