-- Create the update_task_api RPC function
-- This function updates a task and logs the change to task_history
-- It's called from the API to ensure proper audit logging

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
    status = COALESCE((p_patch->>'status')::TEXT, status),
    priority = COALESCE((p_patch->>'priority')::TEXT, priority),
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

-- Note: Run this in the Supabase SQL Editor
-- The task_history logging is now handled by the API layer, not in this function
