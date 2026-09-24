-- =============================================================================
-- 003a STORAGE COLUMNS (idempotent)
-- Adds storage_bucket + storage_path columns used by storage RLS policies.
-- =============================================================================

alter table public.plans
  add column if not exists storage_bucket text not null default 'plans',
  add column if not exists storage_path text;

alter table public.task_photos
  add column if not exists storage_bucket text not null default 'task-photos',
  add column if not exists storage_path text;

-- Helpful indexes
create index if not exists idx_plans_storage_path
  on public.plans (storage_bucket, storage_path)
  where storage_path is not null;

create index if not exists idx_task_photos_storage_path
  on public.task_photos (storage_bucket, storage_path)
  where storage_path is not null;
