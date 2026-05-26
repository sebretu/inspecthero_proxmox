-- =============================================================================
-- ATTENDANCE EXPANSION: Employees table, Working Hours, and flexible references
-- =============================================================================

-- 1. Create employees table
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Modify attendance table
alter table public.attendance 
  add column if not exists employee_id uuid references public.employees(id) on delete cascade,
  add column if not exists start_time time,
  add column if not exists end_time time;

-- Allow nullable user_id to support employees without system accounts
alter table public.attendance alter column user_id drop not null;

-- Update uniqueness: either user_id+date or employee_id+date
-- We remove old constraint and add new ones
alter table public.attendance drop constraint if exists attendance_user_id_date_key;

-- We'll use conditional unique indexes instead of a single constraint to handle nulls properly
create unique index if not exists idx_attendance_user_date on public.attendance (user_id, date) where user_id is not null;
create unique index if not exists idx_attendance_employee_date on public.attendance (employee_id, date) where employee_id is not null;

-- 3. Modify vacations table
alter table public.vacations
  add column if not exists employee_id uuid references public.employees(id) on delete cascade;
alter table public.vacations alter column user_id drop not null;

-- 4. RLS for Employees
alter table public.employees enable row level security;

create policy "employees_admin_all"
  on public.employees
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'ADMIN'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'ADMIN'
    )
  );

-- 5. Updated RLS for Attendance/Vacations (ensure company_id check if possible, or keep simple role-based)
-- The existing policies already check for ADMIN role.

-- Helper function to calculate duration if needed (though we can do it in JS)
-- create or replace function calculate_working_hours(s time, e time) returns interval as $$
-- begin return e - s; end; $$ language plpgsql;
