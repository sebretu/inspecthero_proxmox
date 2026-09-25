-- Complete cleanup of all status-related constraints and triggers
-- Run this in Supabase SQL Editor

-- 1. Drop ALL triggers on tasks table (not just status-related)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT trigger_name FROM information_schema.triggers 
              WHERE event_object_schema = 'public' 
              AND event_object_table = 'tasks') 
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || r.trigger_name || ' ON public.tasks CASCADE';
        RAISE NOTICE 'Dropped trigger: %', r.trigger_name;
    END LOOP;
END $$;

-- 2. Drop ALL functions that might validate task status
DROP FUNCTION IF EXISTS check_task_status_transition() CASCADE;
DROP FUNCTION IF EXISTS validate_task_status_transition() CASCADE;
DROP FUNCTION IF EXISTS enforce_task_status_transition() CASCADE;
DROP FUNCTION IF EXISTS check_status_transition() CASCADE;
DROP FUNCTION IF EXISTS validate_status() CASCADE;

-- 3. Remove CHECK constraints on status column if any
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check CASCADE;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS check_status_transition CASCADE;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS enforce_status_transition CASCADE;

-- 4. Verify cleanup - these should return 0 rows
SELECT 
    'TRIGGERS' as type,
    trigger_name as name
FROM information_schema.triggers 
WHERE event_object_schema = 'public' 
  AND event_object_table = 'tasks'

UNION ALL

SELECT 
    'CHECK CONSTRAINTS' as type,
    constraint_name as name
FROM information_schema.constraint_column_usage
WHERE table_schema = 'public'
  AND table_name = 'tasks'
  AND constraint_name LIKE '%status%'
  OR constraint_name LIKE '%transition%';
