-- Migration: Create stored procedure for optimized plan pin shifting
-- File: /home/ubuntu/building-task-manager/supabase/migrations/20260612000003_rpc_apply_transform.sql

CREATE OR REPLACE FUNCTION apply_transform_to_plan_pins(
  p_plan_id uuid,
  m00 double precision,
  m01 double precision,
  tx double precision,
  m10 double precision,
  m11 double precision,
  ty double precision
)
RETURNS void AS $$
BEGIN
  -- 1. Tasks
  UPDATE tasks
  SET 
    x_norm = (x_norm * m00) + (y_norm * m01) + tx,
    y_norm = (x_norm * m10) + (y_norm * m11) + ty
  WHERE plan_id = p_plan_id AND x_norm IS NOT NULL;

  -- 2. BMA Devices
  UPDATE bma_devices
  SET 
    x = (x * m00) + (y * m01) + tx,
    y = (x * m10) + (y * m11) + ty
  WHERE plan_id = p_plan_id AND x IS NOT NULL;

  -- 3. Cable Bus Nodes
  UPDATE cable_bus_nodes
  SET 
    x = (x * m00) + (y * m01) + tx,
    y = (x * m10) + (y * m11) + ty
  WHERE plan_id = p_plan_id AND x IS NOT NULL;

  -- 4. Chargers
  UPDATE chargers
  SET 
    x_norm = (x_norm * m00) + (y_norm * m01) + tx,
    y_norm = (x_norm * m10) + (y_norm * m11) + ty
  WHERE plan_id = p_plan_id AND x_norm IS NOT NULL;

  -- 5. Fehler
  UPDATE fehler
  SET 
    x_norm = (x_norm * m00) + (y_norm * m01) + tx,
    y_norm = (x_norm * m10) + (y_norm * m11) + ty
  WHERE plan_id = p_plan_id AND x_norm IS NOT NULL;

  -- 6. Revisions
  UPDATE revisions
  SET 
    x_norm = (x_norm * m00) + (y_norm * m01) + tx,
    y_norm = (x_norm * m10) + (y_norm * m11) + ty
  WHERE plan_id = p_plan_id AND x_norm IS NOT NULL;

  -- 7. Aufmass Sessions
  UPDATE aufmass_sessions
  SET 
    x_norm = (x_norm * m00) + (y_norm * m01) + tx,
    y_norm = (x_norm * m10) + (y_norm * m11) + ty
  WHERE plan_id = p_plan_id AND x_norm IS NOT NULL;

  -- 8. Stromkreise
  UPDATE stromkreise
  SET 
    x_norm = (x_norm * m00) + (y_norm * m01) + tx,
    y_norm = (x_norm * m10) + (y_norm * m11) + ty
  WHERE plan_id = p_plan_id AND x_norm IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
