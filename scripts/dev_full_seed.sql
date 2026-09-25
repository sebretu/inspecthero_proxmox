begin;

-- 0) wyczyść dane (bez ruszania auth.*)
truncate table
  public.task_history,
  public.task_comments,
  public.task_photos,
  public.tasks,
  public.plans,
  public.floors,
  public.buildings,
  public.project_members,
  public.projects,
  public.profiles,
  public.companies
restart identity cascade;

-- 1) Firma
insert into public.companies (id, name, slug, is_active)
values ('11111111-1111-1111-1111-111111111111', 'Demo Company', 'demo-company', true);

-- 2) AUTH users + identities (DEV lokalnie)
do $$
declare
  inst uuid;
begin
  select id into inst from auth.instances limit 1;

  -- ADMIN
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('22222222-2222-2222-2222-222222222222', inst, 'authenticated', 'authenticated',
     'admin@demo.local', crypt('Password123!', gen_salt('bf')), now(),
     jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
     '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into auth.identities
    (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values
    (gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
     'email', 'admin@demo.local',
     jsonb_build_object('sub','22222222-2222-2222-2222-222222222222','email','admin@demo.local'),
     now(), now())
  on conflict do nothing;

  -- MOD
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('33333333-3333-3333-3333-333333333333', inst, 'authenticated', 'authenticated',
     'mod@demo.local', crypt('Password123!', gen_salt('bf')), now(),
     jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
     '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into auth.identities
    (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values
    (gen_random_uuid(), '33333333-3333-3333-3333-333333333333',
     'email', 'mod@demo.local',
     jsonb_build_object('sub','33333333-3333-3333-3333-333333333333','email','mod@demo.local'),
     now(), now())
  on conflict do nothing;

  -- USER
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('44444444-4444-4444-4444-444444444444', inst, 'authenticated', 'authenticated',
     'user@demo.local', crypt('Password123!', gen_salt('bf')), now(),
     jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
     '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into auth.identities
    (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values
    (gen_random_uuid(), '44444444-4444-4444-4444-444444444444',
     'email', 'user@demo.local',
     jsonb_build_object('sub','44444444-4444-4444-4444-444444444444','email','user@demo.local'),
     now(), now())
  on conflict do nothing;
end $$;

-- 3) Profiles (id == auth.users.id)
insert into public.profiles (id, company_id, email, full_name, role, language, is_active)
values
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','admin@demo.local','Admin Demo','ADMIN','pl',true),
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','mod@demo.local','Moderator Demo','MODERATOR','pl',true),
  ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','user@demo.local','User Demo','USER','pl',true);

-- 4) Projekt
insert into public.projects (id, company_id, name, created_by, is_archived)
values ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','Budowa: Demo','22222222-2222-2222-2222-222222222222',false);

-- 5) Członkowie projektu
insert into public.project_members (project_id, user_id, role)
values
  ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','ADMIN'),
  ('55555555-5555-5555-5555-555555555555','33333333-3333-3333-3333-333333333333','MODERATOR'),
  ('55555555-5555-5555-5555-555555555555','44444444-4444-4444-4444-444444444444','USER');

-- 6) Obiekt
insert into public.buildings (id, project_id, name)
values ('66666666-6666-6666-6666-666666666666','55555555-5555-5555-5555-555555555555','Obiekt A');

-- 7) Piętro
insert into public.floors (id, building_id, name, level)
values ('77777777-7777-7777-7777-777777777777','66666666-6666-6666-6666-666666666666','Parter',0);

-- 8) Plan
insert into public.plans
  (id, project_id, floor_id, version, status, pdf_path, storage_bucket, storage_path, is_current, uploaded_by)
values
  ('88888888-8888-8888-8888-888888888888',
   '55555555-5555-5555-5555-555555555555',
   '77777777-7777-7777-7777-777777777777',
   1, 'READY',
   'parter_v1.pdf',
   'plans',
   'projects/55555555-5555-5555-5555-555555555555/floors/77777777-7777-7777-7777-777777777777/v1.pdf',
   true,
   '22222222-2222-2222-2222-222222222222'
  );


-- 9) Taski (DEV)
insert into public.tasks
  (id, project_id, plan_id, x_norm, y_norm, title, description, priority, status, due_date, assigned_user_id, created_by)
values
  ('29999999-9999-9999-9999-999999999999',
   '55555555-5555-5555-5555-555555555555',
   '88888888-8888-8888-8888-888888888888',
   0.42, 0.33,
   'Pęknięcie ściany',
   'Sprawdź i napraw pęknięcie przy wejściu.',
   'HIGH',
   'OPEN',
   current_date + 7,
   '44444444-4444-4444-4444-444444444444',
   '22222222-2222-2222-2222-222222222222'
  );

commit;
