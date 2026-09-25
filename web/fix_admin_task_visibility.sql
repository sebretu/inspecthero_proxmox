-- Fix Admin Task Visibility
-- This script updates the RLS policy for the 'tasks' table to allow admins to see all tasks

-- Step 1: Drop the existing SELECT policy (if it exists)
DROP POLICY IF EXISTS "Users can read their assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view tasks" ON tasks;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON tasks;

-- Step 2: Create new SELECT policy that allows:
-- - Regular users to see tasks assigned to them
-- - Admins to see ALL tasks
CREATE POLICY "Users can read their tasks, admins see all" ON tasks
FOR SELECT 
USING (
  -- Regular users can see tasks assigned to them
  assigned_user_id = auth.uid() 
  OR 
  -- Admins can see all tasks (role is enum type, compare directly)
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'ADMIN'
  )
);

-- Optional: If you also want to fix other operations (INSERT, UPDATE, DELETE), 
-- you may need to update those policies as well.

-- Note: Make sure to run this in the Supabase SQL Editor
-- Dashboard > SQL Editor > New Query > Paste this script > Run
