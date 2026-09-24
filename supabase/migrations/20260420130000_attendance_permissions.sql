-- =============================================================================
-- ATTENDANCE PERMISSIONS: Support MODERATOR/MOD roles in RLS
-- =============================================================================

-- 1. Update Employees RLS
drop policy if exists "employees_admin_all" on public.employees;
create policy "employees_admin_mod_all"
  on public.employees
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and (profiles.role = 'ADMIN' or profiles.role = 'MODERATOR' or profiles.role = 'MOD')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and (profiles.role = 'ADMIN' or profiles.role = 'MODERATOR' or profiles.role = 'MOD')
    )
  );

-- 2. Update Attendance RLS
drop policy if exists "attendance_select_own" on public.attendance;
drop policy if exists "attendance_admin_all" on public.attendance;

create policy "attendance_select_all_mods" on public.attendance for select using (
  user_id = auth.uid() or exists (
    select 1 from public.profiles 
    where id = auth.uid() 
    and (role = 'ADMIN' or role = 'MODERATOR' or role = 'MOD')
  )
);

create policy "attendance_manage_all_mods" on public.attendance for all using (
  exists (
    select 1 from public.profiles 
    where id = auth.uid() 
    and (role = 'ADMIN' or role = 'MODERATOR' or role = 'MOD')
  )
);

-- 3. Update Vacations RLS
drop policy if exists "vacations_select_own" on public.vacations;
drop policy if exists "vacations_admin_all" on public.vacations;

create policy "vacations_select_all_mods" on public.vacations for select using (
  user_id = auth.uid() or exists (
    select 1 from public.profiles 
    where id = auth.uid() 
    and (role = 'ADMIN' or role = 'MODERATOR' or role = 'MOD')
  )
);

create policy "vacations_manage_all_mods" on public.vacations for all using (
  exists (
    select 1 from public.profiles 
    where id = auth.uid() 
    and (role = 'ADMIN' or role = 'MODERATOR' or role = 'MOD')
  )
);
