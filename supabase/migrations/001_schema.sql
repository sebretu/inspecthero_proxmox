-- =============================================================================
-- 001 SCHEMA: Building Task Manager (Budowa -> Obiekt -> Piętro -> Plan 1-str. PDF)
-- Stack: Supabase Postgres + Auth + Storage + RLS
-- =============================================================================

create extension if not exists pgcrypto;
-- create extension if not exists "uuid-ossp";

-- ENUMS
do $$ begin
  create type public.user_role as enum ('ADMIN','MODERATOR','USER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum ('OPEN','IN_PROGRESS','DONE_WAITING_APPROVAL','APPROVED','REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum ('LOW','MEDIUM','HIGH','CRITICAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.plan_status as enum ('PROCESSING','READY','FAILED');
exception when duplicate_object then null; end $$;

-- COMPANIES (tenants)
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_companies_active on public.companies(is_active) where is_active = true;

-- PROFILES (auth.users -> profiles)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  email text not null,
  full_name text not null,
  role public.user_role not null default 'USER',
  language text not null default 'pl',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, email)
);

create index if not exists idx_profiles_company on public.profiles(company_id);
create index if not exists idx_profiles_role on public.profiles(company_id, role);
create index if not exists idx_profiles_active on public.profiles(is_active) where is_active = true;

-- PROJECTS (budowy)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address text,
  is_archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_company on public.projects(company_id);
create index if not exists idx_projects_company_archived on public.projects(company_id, is_archived);

-- PROJECT MEMBERS
create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.user_role not null default 'USER',
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

create index if not exists idx_project_members_project on public.project_members(project_id);
create index if not exists idx_project_members_user on public.project_members(user_id);
create index if not exists idx_project_members_role on public.project_members(project_id, role);

-- BUILDINGS (obiekty)
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, name)
);

create index if not exists idx_buildings_project on public.buildings(project_id);

-- FLOORS (pietra)
create table if not exists public.floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,   -- "Parter"
  level int not null,   -- -2, -1, 0, 1...
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(building_id, level)
);

create index if not exists idx_floors_building on public.floors(building_id, level);

-- PLANS (1-strona PDF na piętro, wersje)
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  floor_id uuid not null references public.floors(id) on delete cascade,

  version int not null default 1,
  status public.plan_status not null default 'PROCESSING',

  -- Supabase Storage paths:
  pdf_path text not null,
  image_path text,

  image_width int,
  image_height int,

  is_current boolean not null default true,
  uploaded_by uuid references public.profiles(id) on delete set null,
  processing_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(floor_id, version)
);

create index if not exists idx_plans_project on public.plans(project_id);
create index if not exists idx_plans_floor_current on public.plans(floor_id, is_current) where is_current = true;
create index if not exists idx_plans_status on public.plans(status);

-- Ensure only one current plan per floor
create or replace function public.ensure_single_current_plan()
returns trigger as $$
begin
  if new.is_current then
    update public.plans
      set is_current = false, updated_at = now()
      where floor_id = new.floor_id
        and id <> new.id
        and is_current = true;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ensure_single_current_plan on public.plans;
create trigger trg_ensure_single_current_plan
after insert or update of is_current on public.plans
for each row execute function public.ensure_single_current_plan();

-- TASKS
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,

  x_norm numeric(10,8) not null check (x_norm >= 0 and x_norm <= 1),
  y_norm numeric(10,8) not null check (y_norm >= 0 and y_norm <= 1),

  title text not null,
  description text,
  priority public.task_priority not null default 'MEDIUM',
  status public.task_status not null default 'OPEN',
  due_date date,

  assigned_company_id uuid references public.companies(id) on delete set null,
  assigned_user_id uuid references public.profiles(id) on delete set null,

  created_by uuid not null references public.profiles(id) on delete restrict,

  -- workflow fields
  done_reported_by uuid references public.profiles(id) on delete set null,
  done_reported_at timestamptz,
  done_note text,

  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,

  rejected_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_plan on public.tasks(plan_id);
create index if not exists idx_tasks_project_status on public.tasks(project_id, status);
create index if not exists idx_tasks_assigned_user on public.tasks(assigned_user_id);
create index if not exists idx_tasks_assigned_company on public.tasks(assigned_company_id);
create index if not exists idx_tasks_due_date on public.tasks(project_id, due_date) where due_date is not null;

-- PHOTOS
create table if not exists public.task_photos (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  url text not null,
  caption text,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_photos_task on public.task_photos(task_id, created_at desc);

-- COMMENTS
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  content text not null,
  author_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_task_comments_task on public.task_comments(task_id, created_at desc);

-- HISTORY
create table if not exists public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_history_task on public.task_history(task_id, created_at desc);

-- UPDATED_AT helper
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  create trigger trg_companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_buildings_updated_at before update on public.buildings
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_floors_updated_at before update on public.floors
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_task_comments_updated_at before update on public.task_comments
  for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- Helper functions (RLS will use them in 002)
create or replace function public.current_company_id()
returns uuid as $$
  select company_id from public.profiles where id = auth.uid()
$$ language sql security definer stable;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  )
$$ language sql security definer stable;

create or replace function public.is_project_admin_or_mod(p_project_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.role in ('ADMIN','MODERATOR')
  )
$$ language sql security definer stable;

-- Workflow + history (server-side enforcement)
create or replace function public.enforce_task_workflow_and_log()
returns trigger as $$
declare
  v_is_admin_mod boolean;
  v_is_assignee boolean;
begin
  v_is_admin_mod := public.is_project_admin_or_mod(new.project_id);
  v_is_assignee := (new.assigned_user_id = auth.uid());

  if tg_op = 'INSERT' then
    insert into public.task_history(task_id, action, new_value, changed_by)
    values (new.id, 'CREATED', to_jsonb(new), new.created_by);
    return new;
  end if;

  if old.status is distinct from new.status then

    -- OPEN -> IN_PROGRESS
    if (old.status = 'OPEN' and new.status = 'IN_PROGRESS') then
      if not (v_is_admin_mod or v_is_assignee or old.created_by = auth.uid()) then
        raise exception 'Not allowed to start task';
      end if;

    -- IN_PROGRESS -> DONE_WAITING_APPROVAL
    elsif (old.status = 'IN_PROGRESS' and new.status = 'DONE_WAITING_APPROVAL') then
      if not (v_is_admin_mod or v_is_assignee) then
        raise exception 'Only assignee (or admin/mod) can report done';
      end if;
      new.done_reported_by := auth.uid();
      new.done_reported_at := now();

    -- DONE_WAITING_APPROVAL -> APPROVED
    elsif (old.status = 'DONE_WAITING_APPROVAL' and new.status = 'APPROVED') then
      if not v_is_admin_mod then
        raise exception 'Only admin/mod can approve';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := now();

    -- DONE_WAITING_APPROVAL -> REJECTED
    elsif (old.status = 'DONE_WAITING_APPROVAL' and new.status = 'REJECTED') then
      if not v_is_admin_mod then
        raise exception 'Only admin/mod can reject';
      end if;
      if new.rejection_reason is null or length(trim(new.rejection_reason)) = 0 then
        raise exception 'Rejection reason required';
      end if;
      new.rejected_by := auth.uid();
      new.rejected_at := now();

    -- REJECTED -> IN_PROGRESS
    elsif (old.status = 'REJECTED' and new.status = 'IN_PROGRESS') then
      if not (v_is_admin_mod or v_is_assignee) then
        raise exception 'Only assignee (or admin/mod) can resume after reject';
      end if;

    else
      raise exception 'Invalid transition: % -> %', old.status, new.status;
    end if;

    insert into public.task_history(task_id, action, old_value, new_value, changed_by)
    values (
      new.id,
      'STATUS_CHANGED',
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status),
      auth.uid()
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_tasks_workflow on public.tasks;
create trigger trg_tasks_workflow
before insert or update on public.tasks
for each row execute function public.enforce_task_workflow_and_log();
