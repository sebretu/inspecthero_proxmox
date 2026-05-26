-- =============================================================================
-- Fehler Workflow Migration
-- Adds: status, photo_type, updated_at, fehler_history, realtime
-- =============================================================================

-- 1. Add status enum (mirror task_status)
do $$ begin
  create type public.fehler_status as enum ('OPEN','IN_PROGRESS','DONE_WAITING_APPROVAL','APPROVED','REJECTED');
exception when duplicate_object then null; end $$;

-- 2. Add photo_type enum for fehler photos
do $$ begin
  create type public.fehler_photo_type as enum ('BEFORE','AFTER');
exception when duplicate_object then null; end $$;

-- 3. Patch fehler table
alter table public.fehler
  add column if not exists status public.fehler_status not null default 'OPEN',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists done_reported_by uuid references public.profiles(id) on delete set null,
  add column if not exists done_reported_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

-- 4. Patch fehler_photos: add photo_type
alter table public.fehler_photos
  add column if not exists photo_type public.fehler_photo_type not null default 'BEFORE';

-- 5. Create fehler_history table
create table if not exists public.fehler_history (
  id uuid primary key default gen_random_uuid(),
  fehler_id uuid not null references public.fehler(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  action text not null,
  summary text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_fehler_history_fehler on public.fehler_history(fehler_id, created_at desc);

-- 6. updated_at trigger for fehler
do $$ begin
  create trigger trg_fehler_updated_at before update on public.fehler
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- 7. Enable Realtime on fehler so frontend can subscribe to assignment changes
alter publication supabase_realtime add table public.fehler;
