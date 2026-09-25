-- Force cleanup of status transition logic by searching for the error message
-- Run this in Supabase SQL Editor

-- 1. Find and drop the function that contains the specific error message
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT routine_name, routine_schema 
        FROM information_schema.routines 
        WHERE routine_definition ILIKE '%Invalid status transition%'
    ) 
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.routine_schema || '.' || r.routine_name || ' CASCADE';
        RAISE NOTICE 'Dropped function containing error message: %.%', r.routine_schema, r.routine_name;
    END LOOP;
END $$;

-- 2. Drop any trigger that calls the deleted functions (CASCADE should handle it, but to be safe)
-- Manually drop known suspects again
DROP TRIGGER IF EXISTS validate_task_status_transition ON public.tasks;
DROP TRIGGER IF EXISTS check_task_status_transition ON public.tasks;
DROP TRIGGER IF EXISTS enforce_task_status_transition ON public.tasks;
DROP TRIGGER IF EXISTS trg_check_status ON public.tasks;
DROP TRIGGER IF EXISTS check_status_change ON public.tasks;

-- 3. Drop known functions again in case the search missed them
DROP FUNCTION IF EXISTS check_task_status_transition() CASCADE;
DROP FUNCTION IF EXISTS validate_task_status_transition() CASCADE;
DROP FUNCTION IF EXISTS enforce_task_status_transition() CASCADE;
DROP FUNCTION IF EXISTS check_status_change() CASCADE;

-- 4. Check for CHECK constraints on the tasks table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT constraint_name 
        FROM information_schema.table_constraints
        WHERE table_schema = 'public' 
          AND table_name = 'tasks' 
          AND constraint_type = 'CHECK'
          AND constraint_name ILIKE '%status%'
    )
    LOOP
        EXECUTE 'ALTER TABLE public.tasks DROP CONSTRAINT ' || r.constraint_name;
        RAISE NOTICE 'Dropped check constraint: %', r.constraint_name;
    END LOOP;
END $$;

-- 5. List remaining triggers (for debugging if it still fails)
SELECT 
    event_object_table as table,
    trigger_name,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'tasks';
