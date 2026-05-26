-- =============================================================================
-- 002 RLS: Policies for multi-tenant + roles + project membership
-- =============================================================================

-- Enable RLS
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.buildings enable row level security;
alter table public.floors enable row level security;
alter table public.plans enable row level security;
alter table public.tasks enable row level security;
alter table public.task_photos enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_history enable row level security;

-- Helper: does a plan belong to a project user is member of?
create or replace function public.plan_project_id(p_plan_id uuid)
returns uuid as $$
  select project_id from public.plans where id = p_plan_id
$$ language sql security definer stable;

-- COMPANIES: user sees only own company
drop policy if exists companies_select_own on public.companies;
create policy companies_select_own
on public.companies for select
using (id = public.current_company_id());

-- PROFILES: user sees only profiles in own company
drop policy if exists profiles_select_company on public.profiles;
create policy profiles_select_company
on public.profiles for select
using (company_id = public.current_company_id());

-- user can update own profile
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

-- PROJECTS: user can see projects where is member
drop policy if exists projects_select_member on public.projects;
create policy projects_select_member
on public.projects for select
using (public.is_project_member(id));

-- create project: only ADMIN global (profiles.role) within company
-- (if chcesz zamiast global role -> tylko project_members, zmienimy później)
drop policy if exists projects_insert_admin on public.projects;
create policy projects_insert_admin
on public.projects for insert
with check (company_id = public.current_company_id());

-- update project: admin/mod within project
drop policy if exists projects_update_admin_mod on public.projects;
create policy projects_update_admin_mod
on public.projects for update
using (public.is_project_admin_or_mod(id))
with check (public.is_project_admin_or_mod(id));

-- PROJECT MEMBERS: members can view other members in same project
drop policy if exists pm_select_member on public.project_members;
create policy pm_select_member
on public.project_members for select
using (public.is_project_member(project_id));

-- manage members: only admin/mod in that project
drop policy if exists pm_insert_admin_mod on public.project_members;
create policy pm_insert_admin_mod
on public.project_members for insert
with check (public.is_project_admin_or_mod(project_id));

drop policy if exists pm_update_admin_mod on public.project_members;
create policy pm_update_admin_mod
on public.project_members for update
using (public.is_project_admin_or_mod(project_id))
with check (public.is_project_admin_or_mod(project_id));

drop policy if exists pm_delete_admin_mod on public.project_members;
create policy pm_delete_admin_mod
on public.project_members for delete
using (public.is_project_admin_or_mod(project_id));

-- BUILDINGS: visible if project is visible
drop policy if exists buildings_select on public.buildings;
create policy buildings_select
on public.buildings for select
using (public.is_project_member(project_id));

drop policy if exists buildings_mutate on public.buildings;
create policy buildings_mutate
on public.buildings for all
using (public.is_project_admin_or_mod(project_id))
with check (public.is_project_admin_or_mod(project_id));

-- FLOORS: visible if building's project visible
create or replace function public.floor_project_id(p_floor_id uuid)
returns uuid as $$
  select b.project_id
  from public.floors f
  join public.buildings b on b.id = f.building_id
  where f.id = p_floor_id
$$ language sql security definer stable;

drop policy if exists floors_select on public.floors;
create policy floors_select
on public.floors for select
using (public.is_project_member(public.floor_project_id(id)));

drop policy if exists floors_mutate on public.floors;
create policy floors_mutate
on public.floors for all
using (public.is_project_admin_or_mod(public.floor_project_id(id)))
with check (public.is_project_admin_or_mod(public.floor_project_id(id)));

-- PLANS: visible if project visible
drop policy if exists plans_select on public.plans;
create policy plans_select
on public.plans for select
using (public.is_project_member(project_id));

drop policy if exists plans_mutate on public.plans;
create policy plans_mutate
on public.plans for insert
with check (public.is_project_admin_or_mod(project_id));

drop policy if exists plans_update_admin_mod on public.plans;
create policy plans_update_admin_mod
on public.plans for update
using (public.is_project_admin_or_mod(project_id))
with check (public.is_project_admin_or_mod(project_id));

-- TASKS: read rules:
-- admin/mod -> all tasks in project
-- user -> tasks assigned to them OR assigned to their company OR created_by them
drop policy if exists tasks_select on public.tasks;
create policy tasks_select
on public.tasks for select
using (
  public.is_project_member(project_id)
  and (
    public.is_project_admin_or_mod(project_id)
    or assigned_user_id = auth.uid()
    or assigned_company_id = public.current_company_id()
    or created_by = auth.uid()
  )
);

-- TASKS: insert for members
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert
on public.tasks for insert
with check (
  public.is_project_member(project_id)
  and created_by = auth.uid()
);

-- TASKS: update
-- admin/mod: can update
-- user: can update if assigned or creator
drop policy if exists tasks_update on public.tasks;
create policy tasks_update
on public.tasks for update
using (
  public.is_project_member(project_id)
  and (
    public.is_project_admin_or_mod(project_id)
    or assigned_user_id = auth.uid()
    or created_by = auth.uid()
  )
)
with check (
  public.is_project_member(project_id)
  and (
    public.is_project_admin_or_mod(project_id)
    or assigned_user_id = auth.uid()
    or created_by = auth.uid()
  )
);

-- PHOTOS: user can see photos if can see task
drop policy if exists task_photos_select on public.task_photos;
create policy task_photos_select
on public.task_photos for select
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_id
      and public.is_project_member(t.project_id)
      and (
        public.is_project_admin_or_mod(t.project_id)
        or t.assigned_user_id = auth.uid()
        or t.assigned_company_id = public.current_company_id()
        or t.created_by = auth.uid()
      )
  )
);

-- PHOTOS: insert if user has access to task (assignee/creator/admin-mod)
drop policy if exists task_photos_insert on public.task_photos;
create policy task_photos_insert
on public.task_photos for insert
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.tasks t
    where t.id = task_id
      and public.is_project_member(t.project_id)
      and (
        public.is_project_admin_or_mod(t.project_id)
        or t.assigned_user_id = auth.uid()
        or t.created_by = auth.uid()
      )
  )
);

-- PHOTOS: delete if admin or (assigned user/creator AND not uploaded by admin)
drop policy if exists task_photos_delete on public.task_photos;
create policy task_photos_delete
on public.task_photos for delete
using (
  -- must be a member of the project
  exists (
    select 1 from public.tasks t
    where t.id = task_id
      and public.is_project_member(t.project_id)
  )
  and (
    -- If current user is ADMIN, can delete anything
    (select p.role from public.profiles p where p.id = auth.uid()) = 'ADMIN'
    or
    -- Not an admin, but trying to delete?
    (
      -- Must not be uploaded by an admin
      not exists (
        select 1 from public.profiles p
        where p.id = uploaded_by
          and p.role = 'ADMIN'
      )
      -- AND must have basic task management rights (assignee or creator)
      and exists (
        select 1 from public.tasks t
        where t.id = task_id
          and (t.assigned_user_id = auth.uid() or t.created_by = auth.uid())
      )
    )
  )
);

-- COMMENTS: same as photos
drop policy if exists task_comments_select on public.task_comments;
create policy task_comments_select
on public.task_comments for select
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_id
      and public.is_project_member(t.project_id)
      and (
        public.is_project_admin_or_mod(t.project_id)
        or t.assigned_user_id = auth.uid()
        or t.assigned_company_id = public.current_company_id()
        or t.created_by = auth.uid()
      )
  )
);

drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert
on public.task_comments for insert
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.tasks t
    where t.id = task_id
      and public.is_project_member(t.project_id)
  )
);

drop policy if exists task_comments_update_self on public.task_comments;
create policy task_comments_update_self
on public.task_comments for update
using (author_id = auth.uid())
with check (author_id = auth.uid());

-- HISTORY: visible if project member (task belongs to project)
drop policy if exists task_history_select on public.task_history;
create policy task_history_select
on public.task_history for select
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_id
      and public.is_project_member(t.project_id)
  )
);

-- FEHLER PHOTOS: same logic
drop policy if exists fehler_photos_select on public.fehler_photos;
create policy fehler_photos_select
on public.fehler_photos for select
using (
  exists (
    select 1 from public.fehler f
    where f.id = fehler_id
      and public.is_project_member(f.project_id)
  )
);

drop policy if exists fehler_photos_insert on public.fehler_photos;
create policy fehler_photos_insert
on public.fehler_photos for insert
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.fehler f
    where f.id = fehler_id
      and public.is_project_member(f.project_id)
  )
);

drop policy if exists fehler_photos_delete on public.fehler_photos;
create policy fehler_photos_delete
on public.fehler_photos for delete
using (
  exists (
    select 1 from public.fehler f
    where f.id = fehler_id
      and public.is_project_member(f.project_id)
  )
  and (
    -- If current user is ADMIN, can delete anything
    (select p.role from public.profiles p where p.id = auth.uid()) = 'ADMIN'
    or
    -- Not an admin, but trying to delete?
    (
      -- Must not be uploaded by an admin
      not exists (
        select 1 from public.profiles p
        where p.id = uploaded_by
          and p.role = 'ADMIN'
      )
      -- AND must be the creator of the fehler or assignee (logic mirrors task photos)
      and exists (
        select 1 from public.fehler f
        where f.id = fehler_id
          and (f.assigned_user_id = auth.uid() or f.created_by = auth.uid())
      )
    )
  )
);
