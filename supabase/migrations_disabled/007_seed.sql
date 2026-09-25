-- =============================================================================
-- 007 SEED (DEV) - spójne UUID + przykładowe dane
-- =============================================================================
-- UWAGA: seed zakłada, że masz już:
-- - public.companies
-- - public.profiles (id = auth.users.id)
-- - public.projects
-- - public.buildings
-- - public.floors
-- - public.plans
-- - public.tasks (+ comments/photos jeśli chcesz)

-- ---------------------------------------------------------------------------
-- Stałe UUID
-- ---------------------------------------------------------------------------
do $$
begin
  -- tylko komentarz blokowy, żeby UUID było w jednym miejscu
end $$;

-- Company
-- 111... = company
-- Users (profiles):
-- 222... = admin, 333... = moderator, 444... = user
-- Project:
-- 555...
-- Building:
-- 666...
-- Floor:
-- 777...
-- Plan:
-- 888...
-- Task:
-- 999...

-- ---------------------------------------------------------------------------
-- 1) Firma (tenant)
-- ---------------------------------------------------------------------------
insert into public.companies (id, name, slug, is_active)
values ('11111111-1111-1111-1111-111111111111', 'Demo Company', 'demo-company', true)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 3) Projekt
-- (u Ciebie projects nie ma description, więc bez description)
-- ---------------------------------------------------------------------------
insert into public.projects (id, company_id, name, is_archived)
values ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Budowa: Demo', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4) Członkowie projektu (admin/mod/user)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5) Obiekt (building)
-- (u Ciebie buildings nie ma address? już robiłeś patch, ale seed ma być bez address na wszelki)
-- ---------------------------------------------------------------------------
insert into public.buildings (id, project_id, name)
values ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'Obiekt A')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6) Piętro
-- (typowo: level, name)
-- ---------------------------------------------------------------------------
insert into public.floors (id, building_id, name, level)
values ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 'Parter', 0)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7) Plan (1-str. PDF per piętro)
-- ---------------------------------------------------------------------------
insert into public.plans (
  id, project_id, floor_id, version, status, pdf_path, storage_bucket, storage_path, is_current
) values (

)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 8) Przykładowy task/marker na planie (x_norm/y_norm 0..1)
-- Jeśli w tasks masz inne pola wymagane, dopasujemy po \d public.tasks
-- ---------------------------------------------------------------------------
insert into public.tasks (
  id, project_id, plan_id, page_number, x_norm, y_norm,
  title, description, priority, status, due_date,
  assigned_user_id, created_by
) values (
  '99999999-9999-9999-9999-999999999999',
  '55555555-5555-5555-5555-555555555555',
  '88888888-8888-8888-8888-888888888888',
  1, 0.42, 0.33,
  'Pęknięcie ściany',
  'Sprawdź i napraw pęknięcie przy wejściu.',
  'HIGH',
  'OPEN',
  current_date + 7,
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222'
)
on conflict (id) do nothing;

