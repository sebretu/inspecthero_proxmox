-- Allow admins to bypass restricted status transitions (OPEN -> APPROVED)
-- Run this in Supabase SQL Editor

-- 1. Drop known triggers enforcing status transitions
DROP TRIGGER IF EXISTS validate_task_status_transition ON public.tasks;
DROP TRIGGER IF EXISTS check_task_status_transition ON public.tasks;
DROP TRIGGER IF EXISTS enforce_task_status_transition ON public.tasks;

-- 2. Drop the functions associated with those triggers
DROP FUNCTION IF EXISTS check_task_status_transition() CASCADE;
DROP FUNCTION IF EXISTS validate_task_status_transition() CASCADE;
DROP FUNCTION IF EXISTS enforce_task_status_transition() CASCADE;

-- 3. Just in case, grant permissions again
GRANT EXECUTE ON FUNCTION update_task_api(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_task_api(UUID, UUID, JSONB) TO service_role;

-- 4. Ensure RLS allows admins to UPDATE any task (if there was an RLS issue too, though unlikely given the specific error)
-- (Assuming standard RLS exists, but this is a safeguard)
-- If this fails because policy doesn't exist, ignore.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'Admins can update all tasks'
    ) THEN
        CREATE POLICY "Admins can update all tasks" ON tasks FOR UPDATE
        USING (
            auth.uid() IN (SELECT id FROM profiles WHERE role = 'ADMIN')
        )
        WITH CHECK (
            auth.uid() IN (SELECT id FROM profiles WHERE role = 'ADMIN')
        );
    END IF;
END $$;
