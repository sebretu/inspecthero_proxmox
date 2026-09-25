-- =====================================================
-- COMPREHENSIVE FIX FOR ADMIN TASK EDIT PERMISSIONS
-- =====================================================
-- This script fixes the issue where admins cannot edit tasks created by other admins
-- Run this in the Supabase SQL Editor
-- After running, users should logout and login to refresh their JWT tokens

-- =====================================================
-- PART 1: Create/Replace the update_task_api RPC function
-- =====================================================

-- Drop existing function first (if it exists with different return type)
DROP FUNCTION IF EXISTS update_task_api(UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION update_task_api(
  p_id UUID,
  p_changed_by UUID,
  p_patch JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_updated_count INTEGER;
BEGIN
  -- Update the task with the provided patch
  -- The patch is a JSONB object containing only the fields to update
  UPDATE tasks
  SET
    title = COALESCE((p_patch->>'title')::TEXT, title),
    description = CASE 
      WHEN p_patch ? 'description' THEN (p_patch->>'description')::TEXT
      ELSE description
    END,
    status = CASE 
      WHEN p_patch ? 'status' THEN (p_patch->>'status')::task_status
      ELSE status
    END,
    priority = CASE 
      WHEN p_patch ? 'priority' THEN (p_patch->>'priority')::task_priority
      ELSE priority
    END,
    due_date = CASE 
      WHEN p_patch ? 'due_date' THEN (p_patch->>'due_date')::TIMESTAMP
      ELSE due_date
    END,
    assigned_user_id = CASE 
      WHEN p_patch ? 'assigned_user_id' THEN (p_patch->>'assigned_user_id')::UUID
      ELSE assigned_user_id
    END,
    assigned_company_id = CASE 
      WHEN p_patch ? 'assigned_company_id' THEN (p_patch->>'assigned_company_id')::UUID
      ELSE assigned_company_id
    END,
    updated_at = NOW()
  WHERE id = p_id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Task not found or update not allowed: %', p_id;
  END IF;
  
  -- Return success indicator
  v_result = jsonb_build_object(
    'success', true,
    'task_id', p_id,
    'updated_at', NOW()
  );
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_task_api(UUID, UUID, JSONB) TO authenticated;

-- =====================================================
-- PART 2: Fix RLS Policies for Tasks Table
-- =====================================================

-- Drop all existing UPDATE policies to avoid conflicts
DROP POLICY IF EXISTS "Users can update their assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks" ON tasks;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON tasks;
DROP POLICY IF EXISTS "Allow updates for assigned users" ON tasks;
DROP POLICY IF EXISTS "Users can update their tasks, admins update all" ON tasks;
DROP POLICY IF EXISTS "Admins can update all tasks" ON tasks;
DROP POLICY IF EXISTS "tasks_update_allowed" ON tasks;
DROP POLICY IF EXISTS "Users can update assigned tasks, admins all" ON tasks;
DROP POLICY IF EXISTS "Admins can update all tasks and users their own" ON tasks;

-- Create the correct UPDATE policy
-- This allows:
-- 1. Regular users to update tasks assigned to them (assigned_user_id = auth.uid())
-- 2. Admins to update ALL tasks (regardless of assigned_user_id)
CREATE POLICY "Admins can update all tasks and users their own" ON tasks
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

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these to verify the fix was applied correctly

-- 1. Verify the RPC function exists
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'update_task_api';

-- 2. Verify the UPDATE policy exists
SELECT policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'tasks' 
AND cmd = 'UPDATE';

-- 3. Check admin users in profiles table
SELECT id, email, role 
FROM profiles 
WHERE role = 'ADMIN';

-- =====================================================
-- POST-EXECUTION INSTRUCTIONS
-- =====================================================
-- 1. All admin users must logout and login again to refresh JWT tokens
-- 2. Test by having Admin A create a task, then Admin B edit it
-- 3. Check server logs for the debug output to verify role detection
