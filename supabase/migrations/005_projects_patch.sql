-- =============================================================================
-- 005 PATCH: align schema with seed (projects.description etc.)
-- =============================================================================

alter table public.projects
  add column if not exists description text;

-- jeśli seed używa created_by, a kolumny brak:
alter table public.projects
  add column if not exists created_by uuid;

-- opcjonalnie: FK na profiles(id) jeśli masz profiles jako user profile
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_created_by_fkey'
  ) then
    alter table public.projects
      add constraint projects_created_by_fkey
      foreign key (created_by) references public.profiles(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_projects_company_id on public.projects(company_id);
