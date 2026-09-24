-- =============================================================================
-- CABLES MODULE — Full schema
-- Tables: trommels, cable_routes, cables, cable_history
-- Follows the same conventions as the tasks module.
-- =============================================================================

-- ENUM: cable status
do $$ begin
  create type public.cable_status as enum ('pending', 'in_progress', 'done');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TROMMELS (cable drum / spool registry)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.trommels (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  name        text not null,
  total_length numeric(12, 2),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_trommels_company   on public.trommels(company_id);
create index if not exists idx_trommels_project   on public.trommels(project_id);

do $$ begin
  create trigger trg_trommels_updated_at before update on public.trommels
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CABLE ROUTES (standalone route system, independent of tasks / plan markers)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.cable_routes (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  project_id     uuid references public.projects(id) on delete cascade,
  name           text,                        -- optional friendly name for the route
  point_a_label  text not null,               -- e.g. "Rozdzielnia główna"
  point_b_label  text not null,               -- e.g. "Piętro 3 - Obwód 12"
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_cable_routes_company  on public.cable_routes(company_id);
create index if not exists idx_cable_routes_project  on public.cable_routes(project_id);

do $$ begin
  create trigger trg_cable_routes_updated_at before update on public.cable_routes
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CABLES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.cables (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,

  name        text not null,
  length      numeric(12, 2),                  -- nullable: meters
  status      public.cable_status not null default 'pending',

  route_id    uuid references public.cable_routes(id) on delete set null,
  trommel_id  uuid references public.trommels(id) on delete set null,

  created_by  uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_cables_company   on public.cables(company_id);
create index if not exists idx_cables_project   on public.cables(project_id);
create index if not exists idx_cables_status    on public.cables(project_id, status);
create index if not exists idx_cables_route     on public.cables(route_id);
create index if not exists idx_cables_trommel   on public.cables(trommel_id);
create index if not exists idx_cables_created   on public.cables(created_at desc);

do $$ begin
  create trigger trg_cables_updated_at before update on public.cables
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- CABLE HISTORY (audit log)
-- Mirrors task_history — logged manually from backend, not via trigger.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.cable_history (
  id        uuid primary key default gen_random_uuid(),
  cable_id  uuid not null references public.cables(id) on delete cascade,
  action    text not null,          -- 'created' | 'updated' | 'status_changed' | 'deleted'
  old_value jsonb,
  new_value jsonb,
  user_id   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cable_history_cable on public.cable_history(cable_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICIES
-- Company-scoped: users can only see data belonging to their company.
-- Same pattern as tasks, projects, etc.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS
alter table public.trommels      enable row level security;
alter table public.cable_routes  enable row level security;
alter table public.cables        enable row level security;
alter table public.cable_history enable row level security;

-- ── TROMMELS ────────────────────────────────────────────────────────────────
drop policy if exists "trommels_company_select" on public.trommels;
create policy "trommels_company_select" on public.trommels
  for select using (company_id = public.current_company_id());

drop policy if exists "trommels_company_insert" on public.trommels;
create policy "trommels_company_insert" on public.trommels
  for insert with check (company_id = public.current_company_id());

drop policy if exists "trommels_company_update" on public.trommels;
create policy "trommels_company_update" on public.trommels
  for update using (company_id = public.current_company_id());

drop policy if exists "trommels_admin_delete" on public.trommels;
create policy "trommels_admin_delete" on public.trommels
  for delete using (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'ADMIN'
    )
  );

-- ── CABLE ROUTES ─────────────────────────────────────────────────────────────
drop policy if exists "cable_routes_company_select" on public.cable_routes;
create policy "cable_routes_company_select" on public.cable_routes
  for select using (company_id = public.current_company_id());

drop policy if exists "cable_routes_company_insert" on public.cable_routes;
create policy "cable_routes_company_insert" on public.cable_routes
  for insert with check (company_id = public.current_company_id());

drop policy if exists "cable_routes_company_update" on public.cable_routes;
create policy "cable_routes_company_update" on public.cable_routes
  for update using (company_id = public.current_company_id());

drop policy if exists "cable_routes_admin_delete" on public.cable_routes;
create policy "cable_routes_admin_delete" on public.cable_routes
  for delete using (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('ADMIN', 'MODERATOR')
    )
  );

-- ── CABLES ───────────────────────────────────────────────────────────────────
drop policy if exists "cables_company_select" on public.cables;
create policy "cables_company_select" on public.cables
  for select using (company_id = public.current_company_id());

drop policy if exists "cables_company_insert" on public.cables;
create policy "cables_company_insert" on public.cables
  for insert with check (company_id = public.current_company_id());

drop policy if exists "cables_company_update" on public.cables;
create policy "cables_company_update" on public.cables
  for update using (company_id = public.current_company_id());

drop policy if exists "cables_admin_delete" on public.cables;
create policy "cables_admin_delete" on public.cables
  for delete using (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('ADMIN', 'MODERATOR')
    )
  );

-- ── CABLE HISTORY ─────────────────────────────────────────────────────────────
drop policy if exists "cable_history_company_select" on public.cable_history;
create policy "cable_history_company_select" on public.cable_history
  for select using (
    exists (
      select 1 from public.cables c
      where c.id = cable_id and c.company_id = public.current_company_id()
    )
  );

drop policy if exists "cable_history_service_insert" on public.cable_history;
create policy "cable_history_service_insert" on public.cable_history
  for insert with check (true);  -- backend uses admin client for inserts

-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME
-- Enable Realtime for cables and cable_history so the frontend can subscribe.
-- (The tables are added to the supabase_realtime publication)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'cables'
  ) then
    alter publication supabase_realtime add table public.cables;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'cable_history'
  ) then
    alter publication supabase_realtime add table public.cable_history;
  end if;
end $$;
