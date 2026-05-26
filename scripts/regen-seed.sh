#!/usr/bin/env bash
set -euo pipefail

DB_CONT="supabase_db_building-task-manager"

docker exec -i "$DB_CONT" pg_dump -U postgres -d postgres \
  --data-only --inserts \
  --table=auth.users \
  --table=public.companies \
  --table=public.profiles \
  --table=public.projects \
  --table=public.project_members \
  --table=public.buildings \
  --table=public.floors \
  --table=public.plans \
  --table=public.tasks \
  --table=public.task_comments \
  --table=public.task_history \
  --table=public.task_photos \
  > supabase/seed_raw.sql

# usuń meta-komendy pg_dump (np. \restrict/\unrestrict), których supabase seed nie łyka
grep -vE '^[[:space:]]*\\' supabase/seed_raw.sql > supabase/seed.sql

echo "Wrote supabase/seed.sql"
