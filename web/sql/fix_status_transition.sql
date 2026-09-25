-- Fix: Remove status transition validation trigger
-- Run this in Supabase SQL Editor

-- Drop the trigger that validates status transitions
DROP TRIGGER IF EXISTS validate_task_status_transition ON public.tasks;
DROP TRIGGER IF EXISTS check_task_status_transition ON public.tasks;
DROP TRIGGER IF EXISTS enforce_task_status_transition ON public.tasks;

-- Drop the function(s) that check status transitions
DROP FUNCTION IF EXISTS check_task_status_transition() CASCADE;
DROP FUNCTION IF EXISTS validate_task_status_transition() CASCADE;
DROP FUNCTION IF EXISTS enforce_task_status_transition() CASCADE;

-- Verify - this should return 0 rows if triggers are gone
SELECT 
    trigger_name, 
    event_manipulation,
    event_object_table
FROM information_schema.triggers 
WHERE event_object_schema = 'public' 
  AND event_object_table = 'tasks'
  AND trigger_name LIKE '%status%';
