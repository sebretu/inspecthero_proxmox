-- =============================================================================
-- 003 STORAGE (buckets + policies) - SAFE
-- Buckets: plans, task-photos
-- =============================================================================

-- Create buckets (idempotent)
insert into storage.buckets (id, name, public)
values
  ('plans', 'plans', false),
  ('task-photos', 'task-photos', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- PLANS bucket policies
-- storage.objects.name == object key/path inside the bucket
-- We match it against public.plans.storage_path
-- ---------------------------------------------------------------------------

drop policy if exists "plans_read_members" on storage.objects;
create policy "plans_read_members"
on storage.objects for select
using (
  bucket_id = 'plans'
  and exists (
    select 1
    from public.plans p
    join public.floors f on f.id = p.floor_id
    join public.buildings b on b.id = f.building_id
    join public.projects pr on pr.id = b.project_id
    join public.project_members pm on pm.project_id = pr.id
    where p.storage_bucket = storage.objects.bucket_id
      and p.storage_path = storage.objects.name
      and pm.user_id = auth.uid()
  )
);

drop policy if exists "plans_write_admin_mod" on storage.objects;
create policy "plans_write_admin_mod"
on storage.objects for insert
with check (
  bucket_id = 'plans'
  and exists (
    select 1
    from public.plans p
    join public.floors f on f.id = p.floor_id
    join public.buildings b on b.id = f.building_id
    join public.projects pr on pr.id = b.project_id
    join public.project_members pm on pm.project_id = pr.id
    where p.storage_bucket = storage.objects.bucket_id
      and p.storage_path = storage.objects.name
      and pm.user_id = auth.uid()
      and pm.role in ('ADMIN','MODERATOR')
  )
);

drop policy if exists "plans_update_admin_mod" on storage.objects;
create policy "plans_update_admin_mod"
on storage.objects for update
using (
  bucket_id = 'plans'
  and exists (
    select 1
    from public.plans p
    join public.floors f on f.id = p.floor_id
    join public.buildings b on b.id = f.building_id
    join public.projects pr on pr.id = b.project_id
    join public.project_members pm on pm.project_id = pr.id
    where p.storage_bucket = storage.objects.bucket_id
      and p.storage_path = storage.objects.name
      and pm.user_id = auth.uid()
      and pm.role in ('ADMIN','MODERATOR')
  )
);

drop policy if exists "plans_delete_admin_mod" on storage.objects;
create policy "plans_delete_admin_mod"
on storage.objects for delete
using (
  bucket_id = 'plans'
  and exists (
    select 1
    from public.plans p
    join public.floors f on f.id = p.floor_id
    join public.buildings b on b.id = f.building_id
    join public.projects pr on pr.id = b.project_id
    join public.project_members pm on pm.project_id = pr.id
    where p.storage_bucket = storage.objects.bucket_id
      and p.storage_path = storage.objects.name
      and pm.user_id = auth.uid()
      and pm.role in ('ADMIN','MODERATOR')
  )
);

-- ---------------------------------------------------------------------------
-- TASK PHOTOS bucket policies
-- storage.objects.name == public.task_photos.storage_path
-- ---------------------------------------------------------------------------

drop policy if exists "task_photos_read" on storage.objects;
create policy "task_photos_read"
on storage.objects for select
using (
  bucket_id = 'task-photos'
  and exists (
    select 1
    from public.task_photos tp
    join public.tasks t on t.id = tp.task_id
    join public.project_members pm on pm.project_id = t.project_id
    join public.profiles prof on prof.id = pm.user_id
    where tp.storage_bucket = storage.objects.bucket_id
      and tp.storage_path = storage.objects.name
      and pm.user_id = auth.uid()
      and (
        pm.role in ('ADMIN','MODERATOR')
        or t.assigned_user_id = auth.uid()
        or t.created_by = auth.uid()
        or t.assigned_company_id = prof.company_id
      )
  )
);

drop policy if exists "task_photos_write" on storage.objects;
create policy "task_photos_write"
on storage.objects for insert
with check (
  bucket_id = 'task-photos'
  and exists (
    select 1
    from public.task_photos tp
    join public.tasks t on t.id = tp.task_id
    join public.project_members pm on pm.project_id = t.project_id
    where tp.storage_bucket = storage.objects.bucket_id
      and tp.storage_path = storage.objects.name
      and pm.user_id = auth.uid()
      and (
        pm.role in ('ADMIN','MODERATOR')
        or t.assigned_user_id = auth.uid()
        or t.created_by = auth.uid()
      )
  )
);
