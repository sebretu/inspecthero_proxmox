-- Seed uruchamiany RĘCZNIE po tym, jak utworzysz userów w Auth (po emailach)
-- Wymaga: auth.users istnieje + schema już wgrane.

begin;

-- 1) Tenant
insert into public.companies (name, slug, is_active)
values ('Demo Company', 'demo-company', true)
on conflict (slug) do update set name = excluded.name
returning id;

-- weź company_id (po slugu)
with c as (
  select id as company_id from public.companies where slug='demo-company'
),
u as (
  select
    (select id from auth.users where email='admin@demo.local') as admin_id,
    (select id from auth.users where email='mod@demo.local')   as mod_id,
    (select id from auth.users where email='user@demo.local')  as user_id
)
-- 2) Profiles (id = auth.users.id)
insert into public.profiles (id, company_id, email, full_name, role, language, is_active)
select u.admin_id, c.company_id, 'admin@demo.local', 'Admin Demo', 'ADMIN', 'pl', true from c,u
where u.admin_id is not null
on conflict (id) do update set
  company_id=excluded.company_id, email=excluded.email, full_name=excluded.full_name, role=excluded.role, is_active=excluded.is_active;

with c as (
  select id as company_id from public.companies where slug='demo-company'
),
u as (
  select
    (select id from auth.users where email='mod@demo.local')   as mod_id,
    (select id from auth.users where email='user@demo.local')  as user_id
)
insert into public.profiles (id, company_id, email, full_name, role, language, is_active)
select u.mod_id, c.company_id, 'mod@demo.local', 'Moderator Demo', 'MODERATOR', 'pl', true from c,u
where u.mod_id is not null
on conflict (id) do update set
  company_id=excluded.company_id, email=excluded.email, full_name=excluded.full_name, role=excluded.role, is_active=excluded.is_active;

with c as (
  select id as company_id from public.companies where slug='demo-company'
),
u as (
  select (select id from auth.users where email='user@demo.local') as user_id
)
insert into public.profiles (id, company_id, email, full_name, role, language, is_active)
select u.user_id, c.company_id, 'user@demo.local', 'User Demo', 'USER', 'pl', true from c,u
where u.user_id is not null
on conflict (id) do update set
  company_id=excluded.company_id, email=excluded.email, full_name=excluded.full_name, role=excluded.role, is_active=excluded.is_active;

-- 3) Projekt
with c as (
  select id as company_id from public.companies where slug='demo-company'
),
u as (
  select (select id from auth.users where email='admin@demo.local') as admin_id
)
insert into public.projects (company_id, name, created_by, is_archived)
select c.company_id, 'Budowa: Demo', u.admin_id, false
from c,u
where u.admin_id is not null
on conflict do nothing;

-- pobierz project_id po nazwie (DEV)
-- (jeśli chcesz twarde UUID, dopisz sobie stałe id i on conflict (id))
with pr as (
  select id as project_id from public.projects
  where name='Budowa: Demo'
  order by created_at desc
  limit 1
),
u as (
  select
    (select id from auth.users where email='admin@demo.local') as admin_id,
    (select id from auth.users where email='mod@demo.local')   as mod_id,
    (select id from auth.users where email='user@demo.local')  as user_id
)
insert into public.project_members (project_id, user_id, role)
select pr.project_id, u.admin_id, 'ADMIN' from pr,u where u.admin_id is not null
on conflict do nothing;

with pr as (
  select id as project_id from public.projects
  where name='Budowa: Demo'
  order by created_at desc
  limit 1
),
u as (
  select
    (select id from auth.users where email='mod@demo.local') as mod_id,
    (select id from auth.users where email='user@demo.local') as user_id
)
insert into public.project_members (project_id, user_id, role)
select pr.project_id, u.mod_id, 'MODERATOR' from pr,u where u.mod_id is not null
on conflict do nothing;

with pr as (
  select id as project_id from public.projects
  where name='Budowa: Demo'
  order by created_at desc
  limit 1
),
u as (
  select (select id from auth.users where email='user@demo.local') as user_id
)
insert into public.project_members (project_id, user_id, role)
select pr.project_id, u.user_id, 'USER' from pr,u where u.user_id is not null
on conflict do nothing;

-- 4) Building + Floor
with pr as (
  select id as project_id from public.projects
  where name='Budowa: Demo'
  order by created_at desc
  limit 1
)
insert into public.buildings (project_id, name)
select pr.project_id, 'Obiekt A' from pr
on conflict do nothing;

with b as (
  select id as building_id from public.buildings
  where name='Obiekt A'
  order by created_at desc
  limit 1
)
insert into public.floors (building_id, name, level)
select b.building_id, 'Parter', 0 from b
on conflict do nothing;

-- 5) Plan (uwaga: u Ciebie w plans są wymagane pdf_path + project_id + floor_id)
with pr as (
  select id as project_id from public.projects
  where name='Budowa: Demo'
  order by created_at desc
  limit 1
),
f as (
  select f.id as floor_id
  from public.floors f
  join public.buildings b on b.id=f.building_id
  where f.name='Parter' and b.name='Obiekt A'
  order by f.created_at desc
  limit 1
),
u as (
  select (select id from auth.users where email='admin@demo.local') as admin_id
)
insert into public.plans (project_id, floor_id, version, pdf_path, storage_bucket, storage_path, is_current, uploaded_by)
select
  pr.project_id,
  f.floor_id,
  1,
  'parter_v1.pdf',
  'plans',
  'projects/'||pr.project_id||'/floors/'||f.floor_id||'/v1.pdf',
  true,
  u.admin_id
from pr,f,u
where u.admin_id is not null
on conflict do nothing;

commit;
