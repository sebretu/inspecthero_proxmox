begin;

insert into public.tasks (
  id, project_id, plan_id,
  x_norm, y_norm,
  title, description,
  priority, status,
  due_date,
  assigned_user_id,
  created_by
) values (
  '99999999-9999-9999-9999-999999999999',
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
