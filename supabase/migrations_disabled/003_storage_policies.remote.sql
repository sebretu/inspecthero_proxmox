-- =============================================================================
-- 003 STORAGE POLICIES (private buckets + signed URLs)
-- Buckets: plans, task-photos
-- =============================================================================

-- Enable RLS on storage objects (usually already enabled)
alter table storage.objects enable row level security;

-- Helper: get project_id from a "plans" object path
-- We store plan records in DB; storage path is just a string.
-- Recommended path conventions:
--  plans: "plans/{project_id}/{floor_id}/v{version}/plan.pdf" + "page.webp"
--  task-photos: "task-photos/{task_id}/{uuid}.jpg"

create or replace function public.project_id_from_plans_path(p_name text)
returns uuid as $$
  select nullif(split_part(p_name, '/', 2), '')::uuid;
$$ language sql immutable;

-- STORAGE: PLANS bucket
drop policy if exists plans_read on storage.objects;
create policy plans_read
on storage.objects for select
using (
  bucket_id = 'plans'
  and public.is_project_member(public.project_id_from_plans_path(name))
);

drop policy if exists plans_write on storage.objects;
create policy plans_write
on storage.objects for insert
with check (
  bucket_id = 'plans'
  and public.is_project_admin_or_mod(public.project_id_from_plans_path(name))
);

drop policy if exists plans_update on storage.objects;
create policy plans_update
on storage.objects for update
using (
  bucket_id = 'plans'
  and public.is_project_admin_or_mod(public.project_id_from_plans_path(name))
);

drop policy if exists plans_delete on storage.objects;
create policy plans_delete
on storage.objects for delete
using (
  bucket_id = 'plans'
  and public.is_project_admin_or_mod(public.project_id_from_plans_path(name))
);

-- STORAGE: TASK PHOTOS bucket (based on task_id in path)
create or replace function public.project_id_from_task_id(p_task_id uuid)
returns uuid as $$
  select project_id from public.tasks where id = p_task_id
$$ language sql security definer stable;

create or replace function public.task_id_from_photos_path(p_name text)
returns uuid as $$
  -- expected: "task-photos/{task_id}/{file}"
  select nullif(split_part(p_name, '/', 2), '')::uuid;
$$ language sql immutable;

drop policy if exists task_photos_read on storage.objects;
create policy task_photos_read
on storage.objects for select
using (
  bucket_id = 'task-photos'
  and public.is_project_member(public.project_id_from_task_id(public.task_id_from_photos_path(name)))
);

drop policy if exists task_photos_write on storage.objects;
create policy task_photos_write
on storage.objects for insert
with check (
  bucket_id = 'task-photos'
  and exists (
    select 1 from public.tasks t
    where t.id = public.task_id_from_photos_path(name)
      and public.is_project_member(t.project_id)
      and (
        public.is_project_admin_or_mod(t.project_id)
        or t.assigned_user_id = auth.uid()
        or t.created_by = auth.uid()
      )
  )
);

drop policy if exists task_photos_delete on storage.objects;
create policy task_photos_delete
on storage.objects for delete
using (
  bucket_id = 'task-photos'
  and exists (
    select 1 from public.tasks t
    where t.id = public.task_id_from_photos_path(name)
      and public.is_project_admin_or_mod(t.project_id)
  )
);
