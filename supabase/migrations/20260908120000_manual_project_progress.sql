-- =============================================================================
-- MIGRATION: 20260908120000_manual_project_progress.sql
-- Description: Manual Project Progress (Hierarchical Categories, Work Items, Weighted Progress, Audit Trail, RLS)
-- =============================================================================

-- 1. ENUMS
do $$ begin
  create type public.progress_node_type as enum ('CATEGORY', 'WORK_ITEM');
exception when duplicate_object then null; end $$;

-- 2. TABLE: project_progress_nodes
create table if not exists public.project_progress_nodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid references public.project_progress_nodes(id) on delete cascade,
  
  node_type public.progress_node_type not null default 'WORK_ITEM',
  name text not null,
  description text,
  
  -- Waga (procent 0.00 - 100.00 względem rodzica / projektu)
  weight numeric(5,2) not null default 0.00 check (weight >= 0 and weight <= 100),
  
  -- Wykonanie (procent 0.00 - 100.00)
  progress numeric(5,2) not null default 0.00 check (progress >= 0 and progress <= 100),
  
  sort_order integer not null default 0,
  
  -- Śledzenie ukończenia
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  
  -- Audyt rekordu
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. INDEXES
create index if not exists idx_progress_nodes_project on public.project_progress_nodes(project_id);
create index if not exists idx_progress_nodes_company on public.project_progress_nodes(company_id);
create index if not exists idx_progress_nodes_parent on public.project_progress_nodes(parent_id);
create index if not exists idx_progress_nodes_sort on public.project_progress_nodes(project_id, parent_id, sort_order);

-- 4. TRIGGER FOR updated_at & auto-completion status
create or replace function public.set_progress_node_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  if new.progress >= 100.00 and (old.progress is null or old.progress < 100.00) then
    new.completed_at = now();
    new.completed_by = auth.uid();
  elsif new.progress < 100.00 and (old.progress is not null and old.progress >= 100.00) then
    new.completed_at = null;
    new.completed_by = null;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_progress_node_updated on public.project_progress_nodes;
create trigger trg_progress_node_updated
  before update on public.project_progress_nodes
  for each row execute function public.set_progress_node_updated_at();

-- 5. AUDIT LOG TABLE: project_progress_history
create table if not exists public.project_progress_history (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.project_progress_nodes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null, -- 'CREATE', 'UPDATE_WEIGHT', 'UPDATE_PROGRESS', 'TOGGLE_COMPLETE', 'UPDATE_INFO', 'DELETE'
  old_weight numeric(5,2),
  new_weight numeric(5,2),
  old_progress numeric(5,2),
  new_progress numeric(5,2),
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_progress_history_node on public.project_progress_history(node_id);
create index if not exists idx_progress_history_project on public.project_progress_history(project_id);

-- 6. ENABLE RLS
alter table public.project_progress_nodes enable row level security;
alter table public.project_progress_history enable row level security;

-- 7. RLS POLICIES FOR project_progress_nodes

-- SELECT: All project members can view nodes
drop policy if exists progress_nodes_select on public.project_progress_nodes;
create policy progress_nodes_select
on public.project_progress_nodes for select
using (public.is_project_member(project_id));

-- INSERT: Project admin or moderator
drop policy if exists progress_nodes_insert on public.project_progress_nodes;
create policy progress_nodes_insert
on public.project_progress_nodes for insert
with check (
  public.is_project_admin_or_mod(project_id)
  and company_id = public.current_company_id()
);

-- UPDATE: Admin/Mod can update any field; Project members can update progress
drop policy if exists progress_nodes_update on public.project_progress_nodes;
create policy progress_nodes_update
on public.project_progress_nodes for update
using (public.is_project_member(project_id))
with check (
  public.is_project_admin_or_mod(project_id) 
  or (public.is_project_member(project_id) and company_id = public.current_company_id())
);

-- DELETE: Project admin or moderator
drop policy if exists progress_nodes_delete on public.project_progress_nodes;
create policy progress_nodes_delete
on public.project_progress_nodes for delete
using (public.is_project_admin_or_mod(project_id));

-- 8. RLS POLICIES FOR project_progress_history

-- SELECT: Project members can view audit history
drop policy if exists progress_history_select on public.project_progress_history;
create policy progress_history_select
on public.project_progress_history for select
using (public.is_project_member(project_id));

-- INSERT: Handled via server/service or authorized members
drop policy if exists progress_history_insert on public.project_progress_history;
create policy progress_history_insert
on public.project_progress_history for insert
with check (
  public.is_project_member(project_id)
  and company_id = public.current_company_id()
);
