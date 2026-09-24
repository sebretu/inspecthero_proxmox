-- =============================================================================
-- ATTENDANCE, VACATIONS, AND PUBLIC HOLIDAYS
-- =============================================================================

-- PUBLIC HOLIDAYS
create table if not exists public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  region text not null default 'NRW',
  created_at timestamptz not null default now(),
  unique(date, region)
);

-- ATTENDANCE
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  status text not null check (status in ('PRESENT', 'ABSENT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);

-- VACATIONS
create table if not exists public.vacations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'APPROVED' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- RLS
alter table public.public_holidays enable row level security;
alter table public.attendance enable row level security;
alter table public.vacations enable row level security;

-- Policies (Admins can do everything, Users can see their own)
-- Public Holidays: everyone can see
create policy holidays_select_all on public.public_holidays for select using (true);
create policy holidays_admin_all on public.public_holidays for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);

-- Attendance
create policy attendance_select_own on public.attendance for select using (
  user_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);
create policy attendance_admin_all on public.attendance for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);

-- Vacations
create policy vacations_select_own on public.vacations for select using (
  user_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);
create policy vacations_admin_all on public.vacations for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);

-- Triggers for updated_at
create trigger trg_attendance_updated_at before update on public.attendance
for each row execute function public.set_updated_at();

create trigger trg_vacations_updated_at before update on public.vacations
for each row execute function public.set_updated_at();

-- SEED HOLIDAYS (NRW 2026)
insert into public.public_holidays (date, name, region) values
('2026-01-01', 'Neujahr', 'NRW'),
('2026-04-03', 'Karfreitag', 'NRW'),
('2026-04-06', 'Ostermontag', 'NRW'),
('2026-05-01', 'Tag der Arbeit', 'NRW'),
('2026-05-14', 'Christi Himmelfahrt', 'NRW'),
('2026-05-25', 'Pfingstmontag', 'NRW'),
('2026-06-04', 'Fronleichnam', 'NRW'),
('2026-11-01', 'Allerheiligen', 'NRW'),
('2026-12-25', '1. Weihnachtstag', 'NRW'),
('2026-12-26', '2. Weihnachtstag', 'NRW')
on conflict (date, region) do nothing;
