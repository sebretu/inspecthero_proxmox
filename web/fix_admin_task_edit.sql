-- Fix Admin Task Edit Permissions - FINAL VERSION
-- Problem: Previous policy used uid() instead of auth.uid()
-- This script fixes it to use the correct function

-- Step 1: Drop all existing UPDATE policies
DROP POLICY IF EXISTS "Users can update their assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks" ON tasks;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON tasks;
DROP POLICY IF EXISTS "Allow updates for assigned users" ON tasks;
DROP POLICY IF EXISTS "Users can update their tasks, admins update all" ON tasks;
DROP POLICY IF EXISTS "Admins can update all tasks" ON tasks;

-- Step 2: Create new UPDATE policy with CORRECT auth.uid() function
-- This allows:
-- 1. Regular users to update tasks assigned to them (assigned_user_id = auth.uid())
-- 2. Admins to update ALL tasks (regardless of assigned_user_id)
CREATE POLICY "Users can update assigned tasks, admins all" ON tasks
FOR UPDATE
USING (
  -- Users can update their assigned tasks
  assigned_user_id = auth.uid() 
  OR 
  -- Admins can update any task
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'ADMIN'
  )
);

-- Note: Run this in the Supabase SQL Editor
-- After running, users must logout and login again to get fresh JWT tokens
