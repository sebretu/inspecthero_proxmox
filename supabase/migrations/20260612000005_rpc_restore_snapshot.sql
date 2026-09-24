-- Migration: Create stored procedure for restoring plan coordinates from snapshot
-- File: /home/ubuntu/building-task-manager/supabase/migrations/20260612000005_rpc_restore_snapshot.sql

CREATE OR REPLACE FUNCTION restore_plan_coordinate_snapshot(
  p_plan_id uuid,
  p_snapshot jsonb,
  p_m00 double precision DEFAULT NULL,
  p_m01 double precision DEFAULT NULL,
  p_tx double precision DEFAULT NULL,
  p_m10 double precision DEFAULT NULL,
  p_m11 double precision DEFAULT NULL,
  p_ty double precision DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- 1. Tasks
  IF p_snapshot IS NOT NULL AND p_snapshot ? 'tasks' AND jsonb_typeof(p_snapshot->'tasks') = 'array' THEN
    WITH snap AS (
      SELECT id, x_norm, y_norm
      FROM jsonb_to_recordset(p_snapshot->'tasks') 
        AS x(id uuid, x_norm double precision, y_norm double precision)
    )
    UPDATE tasks t
    SET 
      x_norm = COALESCE(s.x_norm, 
                        CASE WHEN p_m00 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m00) + (t.y_norm * p_m01) + p_tx 
                             ELSE t.x_norm 
                        END),
      y_norm = COALESCE(s.y_norm, 
                        CASE WHEN p_m10 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m10) + (t.y_norm * p_m11) + p_ty 
                             ELSE t.y_norm 
                        END)
    FROM (
      SELECT t_inner.id, snap.x_norm, snap.y_norm
      FROM tasks t_inner
      LEFT JOIN snap ON t_inner.id = snap.id
      WHERE t_inner.plan_id = p_plan_id
    ) s
    WHERE t.id = s.id;
  ELSE
    IF p_m00 IS NOT NULL THEN
      UPDATE tasks t
      SET 
        x_norm = (x_norm * p_m00) + (y_norm * p_m01) + p_tx,
        y_norm = (x_norm * p_m10) + (y_norm * p_m11) + p_ty
      WHERE t.plan_id = p_plan_id AND t.x_norm IS NOT NULL;
    END IF;
  END IF;

  -- 2. BMA Devices
  IF p_snapshot IS NOT NULL AND p_snapshot ? 'bma_devices' AND jsonb_typeof(p_snapshot->'bma_devices') = 'array' THEN
    WITH snap AS (
      SELECT id, x, y
      FROM jsonb_to_recordset(p_snapshot->'bma_devices') 
        AS x(id uuid, x double precision, y double precision)
    )
    UPDATE bma_devices t
    SET 
      x = COALESCE(s.x, 
                   CASE WHEN p_m00 IS NOT NULL AND t.x IS NOT NULL 
                        THEN (t.x * p_m00) + (t.y * p_m01) + p_tx 
                        ELSE t.x 
                   END),
      y = COALESCE(s.y, 
                   CASE WHEN p_m10 IS NOT NULL AND t.x IS NOT NULL 
                        THEN (t.x * p_m10) + (t.y * p_m11) + p_ty 
                        ELSE t.y 
                   END)
    FROM (
      SELECT t_inner.id, snap.x, snap.y
      FROM bma_devices t_inner
      LEFT JOIN snap ON t_inner.id = snap.id
      WHERE t_inner.plan_id = p_plan_id
    ) s
    WHERE t.id = s.id;
  ELSE
    IF p_m00 IS NOT NULL THEN
      UPDATE bma_devices t
      SET 
        x = (x * p_m00) + (y * p_m01) + p_tx,
        y = (x * p_m10) + (y * p_m11) + p_ty
      WHERE t.plan_id = p_plan_id AND t.x IS NOT NULL;
    END IF;
  END IF;

  -- 3. Cable Bus Nodes
  IF p_snapshot IS NOT NULL AND p_snapshot ? 'cable_bus_nodes' AND jsonb_typeof(p_snapshot->'cable_bus_nodes') = 'array' THEN
    WITH snap AS (
      SELECT id, x, y
      FROM jsonb_to_recordset(p_snapshot->'cable_bus_nodes') 
        AS x(id uuid, x double precision, y double precision)
    )
    UPDATE cable_bus_nodes t
    SET 
      x = COALESCE(s.x, 
                   CASE WHEN p_m00 IS NOT NULL AND t.x IS NOT NULL 
                        THEN (t.x * p_m00) + (t.y * p_m01) + p_tx 
                        ELSE t.x 
                   END),
      y = COALESCE(s.y, 
                   CASE WHEN p_m10 IS NOT NULL AND t.x IS NOT NULL 
                        THEN (t.x * p_m10) + (t.y * p_m11) + p_ty 
                        ELSE t.y 
                   END)
    FROM (
      SELECT t_inner.id, snap.x, snap.y
      FROM cable_bus_nodes t_inner
      LEFT JOIN snap ON t_inner.id = snap.id
      WHERE t_inner.plan_id = p_plan_id
    ) s
    WHERE t.id = s.id;
  ELSE
    IF p_m00 IS NOT NULL THEN
      UPDATE cable_bus_nodes t
      SET 
        x = (x * p_m00) + (y * p_m01) + p_tx,
        y = (x * p_m10) + (y * p_m11) + p_ty
      WHERE t.plan_id = p_plan_id AND t.x IS NOT NULL;
    END IF;
  END IF;

  -- 4. Chargers
  IF p_snapshot IS NOT NULL AND p_snapshot ? 'chargers' AND jsonb_typeof(p_snapshot->'chargers') = 'array' THEN
    WITH snap AS (
      SELECT id, x_norm, y_norm
      FROM jsonb_to_recordset(p_snapshot->'chargers') 
        AS x(id uuid, x_norm double precision, y_norm double precision)
    )
    UPDATE chargers t
    SET 
      x_norm = COALESCE(s.x_norm, 
                        CASE WHEN p_m00 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m00) + (t.y_norm * p_m01) + p_tx 
                             ELSE t.x_norm 
                        END),
      y_norm = COALESCE(s.y_norm, 
                        CASE WHEN p_m10 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m10) + (t.y_norm * p_m11) + p_ty 
                             ELSE t.y_norm 
                        END)
    FROM (
      SELECT t_inner.id, snap.x_norm, snap.y_norm
      FROM chargers t_inner
      LEFT JOIN snap ON t_inner.id = snap.id
      WHERE t_inner.plan_id = p_plan_id
    ) s
    WHERE t.id = s.id;
  ELSE
    IF p_m00 IS NOT NULL THEN
      UPDATE chargers t
      SET 
        x_norm = (x_norm * p_m00) + (y_norm * p_m01) + p_tx,
        y_norm = (x_norm * p_m10) + (y_norm * p_m11) + p_ty
      WHERE t.plan_id = p_plan_id AND t.x_norm IS NOT NULL;
    END IF;
  END IF;

  -- 5. Fehler
  IF p_snapshot IS NOT NULL AND p_snapshot ? 'fehler' AND jsonb_typeof(p_snapshot->'fehler') = 'array' THEN
    WITH snap AS (
      SELECT id, x_norm, y_norm
      FROM jsonb_to_recordset(p_snapshot->'fehler') 
        AS x(id uuid, x_norm double precision, y_norm double precision)
    )
    UPDATE fehler t
    SET 
      x_norm = COALESCE(s.x_norm, 
                        CASE WHEN p_m00 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m00) + (t.y_norm * p_m01) + p_tx 
                             ELSE t.x_norm 
                        END),
      y_norm = COALESCE(s.y_norm, 
                        CASE WHEN p_m10 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m10) + (t.y_norm * p_m11) + p_ty 
                             ELSE t.y_norm 
                        END)
    FROM (
      SELECT t_inner.id, snap.x_norm, snap.y_norm
      FROM fehler t_inner
      LEFT JOIN snap ON t_inner.id = snap.id
      WHERE t_inner.plan_id = p_plan_id
    ) s
    WHERE t.id = s.id;
  ELSE
    IF p_m00 IS NOT NULL THEN
      UPDATE fehler t
      SET 
        x_norm = (x_norm * p_m00) + (y_norm * p_m01) + p_tx,
        y_norm = (x_norm * p_m10) + (y_norm * p_m11) + p_ty
      WHERE t.plan_id = p_plan_id AND t.x_norm IS NOT NULL;
    END IF;
  END IF;

  -- 6. Revisions
  IF p_snapshot IS NOT NULL AND p_snapshot ? 'revisions' AND jsonb_typeof(p_snapshot->'revisions') = 'array' THEN
    WITH snap AS (
      SELECT id, x_norm, y_norm
      FROM jsonb_to_recordset(p_snapshot->'revisions') 
        AS x(id uuid, x_norm double precision, y_norm double precision)
    )
    UPDATE revisions t
    SET 
      x_norm = COALESCE(s.x_norm, 
                        CASE WHEN p_m00 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m00) + (t.y_norm * p_m01) + p_tx 
                             ELSE t.x_norm 
                        END),
      y_norm = COALESCE(s.y_norm, 
                        CASE WHEN p_m10 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m10) + (t.y_norm * p_m11) + p_ty 
                             ELSE t.y_norm 
                        END)
    FROM (
      SELECT t_inner.id, snap.x_norm, snap.y_norm
      FROM revisions t_inner
      LEFT JOIN snap ON t_inner.id = snap.id
      WHERE t_inner.plan_id = p_plan_id
    ) s
    WHERE t.id = s.id;
  ELSE
    IF p_m00 IS NOT NULL THEN
      UPDATE revisions t
      SET 
        x_norm = (x_norm * p_m00) + (y_norm * p_m01) + p_tx,
        y_norm = (x_norm * p_m10) + (y_norm * p_m11) + p_ty
      WHERE t.plan_id = p_plan_id AND t.x_norm IS NOT NULL;
    END IF;
  END IF;

  -- 7. Aufmass Sessions
  IF p_snapshot IS NOT NULL AND p_snapshot ? 'aufmass_sessions' AND jsonb_typeof(p_snapshot->'aufmass_sessions') = 'array' THEN
    WITH snap AS (
      SELECT id, x_norm, y_norm
      FROM jsonb_to_recordset(p_snapshot->'aufmass_sessions') 
        AS x(id uuid, x_norm double precision, y_norm double precision)
    )
    UPDATE aufmass_sessions t
    SET 
      x_norm = COALESCE(s.x_norm, 
                        CASE WHEN p_m00 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m00) + (t.y_norm * p_m01) + p_tx 
                             ELSE t.x_norm 
                        END),
      y_norm = COALESCE(s.y_norm, 
                        CASE WHEN p_m10 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m10) + (t.y_norm * p_m11) + p_ty 
                             ELSE t.y_norm 
                        END)
    FROM (
      SELECT t_inner.id, snap.x_norm, snap.y_norm
      FROM aufmass_sessions t_inner
      LEFT JOIN snap ON t_inner.id = snap.id
      WHERE t_inner.plan_id = p_plan_id
    ) s
    WHERE t.id = s.id;
  ELSE
    IF p_m00 IS NOT NULL THEN
      UPDATE aufmass_sessions t
      SET 
        x_norm = (x_norm * p_m00) + (y_norm * p_m01) + p_tx,
        y_norm = (x_norm * p_m10) + (y_norm * p_m11) + p_ty
      WHERE t.plan_id = p_plan_id AND t.x_norm IS NOT NULL;
    END IF;
  END IF;

  -- 8. Stromkreise
  IF p_snapshot IS NOT NULL AND p_snapshot ? 'stromkreise' AND jsonb_typeof(p_snapshot->'stromkreise') = 'array' THEN
    WITH snap AS (
      SELECT id, x_norm, y_norm
      FROM jsonb_to_recordset(p_snapshot->'stromkreise') 
        AS x(id uuid, x_norm double precision, y_norm double precision)
    )
    UPDATE stromkreise t
    SET 
      x_norm = COALESCE(s.x_norm, 
                        CASE WHEN p_m00 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m00) + (t.y_norm * p_m01) + p_tx 
                             ELSE t.x_norm 
                        END),
      y_norm = COALESCE(s.y_norm, 
                        CASE WHEN p_m10 IS NOT NULL AND t.x_norm IS NOT NULL 
                             THEN (t.x_norm * p_m10) + (t.y_norm * p_m11) + p_ty 
                             ELSE t.y_norm 
                        END)
    FROM (
      SELECT t_inner.id, snap.x_norm, snap.y_norm
      FROM stromkreise t_inner
      LEFT JOIN snap ON t_inner.id = snap.id
      WHERE t_inner.plan_id = p_plan_id
    ) s
    WHERE t.id = s.id;
  ELSE
    IF p_m00 IS NOT NULL THEN
      UPDATE stromkreise t
      SET 
        x_norm = (x_norm * p_m00) + (y_norm * p_m01) + p_tx,
        y_norm = (x_norm * p_m10) + (y_norm * p_m11) + p_ty
      WHERE t.plan_id = p_plan_id AND t.x_norm IS NOT NULL;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
