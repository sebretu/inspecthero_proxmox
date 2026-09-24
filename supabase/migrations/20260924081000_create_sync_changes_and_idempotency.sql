-- ==============================================================================
-- Migration: 20260924081000_create_sync_changes_and_idempotency.sql
-- Stage 3: Sync Change Log (sync_changes), Monotonic Server Cursor, and Idempotency
--
-- ABSOLUTE DATA SAFETY:
-- - Strict additive changes ONLY (CREATE TABLE IF NOT EXISTS, CREATE TRIGGER IF NOT EXISTS)
-- - Monotonic server-authoritative cursor for reliable pull replication
-- - Processed mutations table for push idempotency
-- ==============================================================================

-- 1. Create sync_changes table (Changelog for incremental pull)
CREATE TABLE IF NOT EXISTS public.sync_changes (
  cursor bigserial PRIMARY KEY,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  version bigint NOT NULL DEFAULT 1,
  company_id uuid NULL,
  project_id uuid NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- Performance indexes for tenant & project-scoped sync pulls
CREATE INDEX IF NOT EXISTS idx_sync_changes_company_cursor 
  ON public.sync_changes (company_id, cursor);

CREATE INDEX IF NOT EXISTS idx_sync_changes_project_cursor 
  ON public.sync_changes (project_id, cursor);

CREATE INDEX IF NOT EXISTS idx_sync_changes_table_record 
  ON public.sync_changes (table_name, record_id);

-- Enable RLS on sync_changes
ALTER TABLE public.sync_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_changes_select_policy" ON public.sync_changes
  FOR SELECT
  USING (
    company_id IS NULL OR 
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.project_members pm 
      WHERE pm.project_id = sync_changes.project_id AND pm.user_id = auth.uid()
    )
  );

-- 2. Create processed_mutations table (Idempotency storage for push mutations)
CREATE TABLE IF NOT EXISTS public.processed_mutations (
  mutation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  company_id uuid NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  operation text NOT NULL,
  base_version bigint NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_mutations_user 
  ON public.processed_mutations (user_id, processed_at DESC);

ALTER TABLE public.processed_mutations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "processed_mutations_policy" ON public.processed_mutations
  FOR ALL
  USING (
    user_id = auth.uid() OR
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- 3. Generic change capture trigger function
CREATE OR REPLACE FUNCTION public.fn_capture_sync_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table text;
  v_op text;
  v_record_id uuid;
  v_version bigint;
  v_company_id uuid := NULL;
  v_project_id uuid := NULL;
BEGIN
  v_table := TG_TABLE_NAME;

  IF TG_OP = 'DELETE' THEN
    v_op := 'DELETE';
    v_record_id := OLD.id;
    v_version := COALESCE(OLD.version, 1) + 1;
  ELSE
    -- Check if record is transitioning to deleted (tombstone)
    IF NEW.deleted_at IS NOT NULL AND (OLD IS NULL OR OLD.deleted_at IS NULL) THEN
      v_op := 'DELETE';
    ELSIF TG_OP = 'INSERT' THEN
      v_op := 'INSERT';
    ELSE
      v_op := 'UPDATE';
    END IF;

    v_record_id := NEW.id;
    v_version := COALESCE(NEW.version, 1);
  END IF;

  -- Resolve company_id and project_id based on domain table
  CASE v_table
    WHEN 'projects' THEN
      IF TG_OP = 'DELETE' THEN
        v_project_id := OLD.id;
        v_company_id := OLD.company_id;
      ELSE
        v_project_id := NEW.id;
        v_company_id := NEW.company_id;
      END IF;

    WHEN 'buildings' THEN
      IF TG_OP = 'DELETE' THEN
        v_project_id := OLD.project_id;
      ELSE
        v_project_id := NEW.project_id;
      END IF;
      SELECT company_id INTO v_company_id FROM public.projects WHERE id = v_project_id;

    WHEN 'floors' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT b.project_id, p.company_id INTO v_project_id, v_company_id 
        FROM public.buildings b JOIN public.projects p ON p.id = b.project_id WHERE b.id = OLD.building_id;
      ELSE
        SELECT b.project_id, p.company_id INTO v_project_id, v_company_id 
        FROM public.buildings b JOIN public.projects p ON p.id = b.project_id WHERE b.id = NEW.building_id;
      END IF;

    WHEN 'plans' THEN
      IF TG_OP = 'DELETE' THEN
        v_project_id := OLD.project_id;
      ELSE
        v_project_id := NEW.project_id;
      END IF;
      SELECT company_id INTO v_company_id FROM public.projects WHERE id = v_project_id;

    WHEN 'tasks' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT pl.project_id, p.company_id INTO v_project_id, v_company_id
        FROM public.plans pl JOIN public.projects p ON p.id = pl.project_id WHERE pl.id = OLD.plan_id;
      ELSE
        SELECT pl.project_id, p.company_id INTO v_project_id, v_company_id
        FROM public.plans pl JOIN public.projects p ON p.id = pl.project_id WHERE pl.id = NEW.plan_id;
      END IF;

    WHEN 'task_photos', 'task_comments' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT pl.project_id, p.company_id INTO v_project_id, v_company_id
        FROM public.tasks t JOIN public.plans pl ON pl.id = t.plan_id JOIN public.projects p ON p.id = pl.project_id 
        WHERE t.id = OLD.task_id;
      ELSE
        SELECT pl.project_id, p.company_id INTO v_project_id, v_company_id
        FROM public.tasks t JOIN public.plans pl ON pl.id = t.plan_id JOIN public.projects p ON p.id = pl.project_id 
        WHERE t.id = NEW.task_id;
      END IF;

    WHEN 'cables', 'cable_routes', 'bma_devices', 'stromkreise' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT pl.project_id, p.company_id INTO v_project_id, v_company_id
        FROM public.plans pl JOIN public.projects p ON p.id = pl.project_id WHERE pl.id = OLD.plan_id;
      ELSE
        SELECT pl.project_id, p.company_id INTO v_project_id, v_company_id
        FROM public.plans pl JOIN public.projects p ON p.id = pl.project_id WHERE pl.id = NEW.plan_id;
      END IF;

    WHEN 'trommels', 'cable_buses', 'orders' THEN
      IF TG_OP = 'DELETE' THEN
        v_project_id := OLD.project_id;
        v_company_id := OLD.company_id;
      ELSE
        v_project_id := NEW.project_id;
        v_company_id := NEW.company_id;
      END IF;

    WHEN 'materials', 'attendance' THEN
      IF TG_OP = 'DELETE' THEN
        v_company_id := OLD.company_id;
      ELSE
        v_company_id := NEW.company_id;
      END IF;

    ELSE
      -- Default fallback
      NULL;
  END CASE;

  -- Insert into sync_changes log
  INSERT INTO public.sync_changes (
    table_name,
    record_id,
    operation,
    version,
    company_id,
    project_id,
    changed_at
  ) VALUES (
    v_table,
    v_record_id,
    v_op,
    v_version,
    v_company_id,
    v_project_id,
    now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 4. Attach change capture triggers to sync-enabled domain tables
DROP TRIGGER IF EXISTS trg_sync_capture_projects ON public.projects;
CREATE TRIGGER trg_sync_capture_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_buildings ON public.buildings;
CREATE TRIGGER trg_sync_capture_buildings
  AFTER INSERT OR UPDATE OR DELETE ON public.buildings
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_floors ON public.floors;
CREATE TRIGGER trg_sync_capture_floors
  AFTER INSERT OR UPDATE OR DELETE ON public.floors
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_plans ON public.plans;
CREATE TRIGGER trg_sync_capture_plans
  AFTER INSERT OR UPDATE OR DELETE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_tasks ON public.tasks;
CREATE TRIGGER trg_sync_capture_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_task_photos ON public.task_photos;
CREATE TRIGGER trg_sync_capture_task_photos
  AFTER INSERT OR UPDATE OR DELETE ON public.task_photos
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_task_comments ON public.task_comments;
CREATE TRIGGER trg_sync_capture_task_comments
  AFTER INSERT OR UPDATE OR DELETE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_cables ON public.cables;
CREATE TRIGGER trg_sync_capture_cables
  AFTER INSERT OR UPDATE OR DELETE ON public.cables
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_trommels ON public.trommels;
CREATE TRIGGER trg_sync_capture_trommels
  AFTER INSERT OR UPDATE OR DELETE ON public.trommels
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_cable_routes ON public.cable_routes;
CREATE TRIGGER trg_sync_capture_cable_routes
  AFTER INSERT OR UPDATE OR DELETE ON public.cable_routes
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_cable_buses ON public.cable_buses;
CREATE TRIGGER trg_sync_capture_cable_buses
  AFTER INSERT OR UPDATE OR DELETE ON public.cable_buses
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_bma_devices ON public.bma_devices;
CREATE TRIGGER trg_sync_capture_bma_devices
  AFTER INSERT OR UPDATE OR DELETE ON public.bma_devices
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_stromkreise ON public.stromkreise;
CREATE TRIGGER trg_sync_capture_stromkreise
  AFTER INSERT OR UPDATE OR DELETE ON public.stromkreise
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_materials ON public.materials;
CREATE TRIGGER trg_sync_capture_materials
  AFTER INSERT OR UPDATE OR DELETE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_orders ON public.orders;
CREATE TRIGGER trg_sync_capture_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_order_items ON public.order_items;
CREATE TRIGGER trg_sync_capture_order_items
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();

DROP TRIGGER IF EXISTS trg_sync_capture_attendance ON public.attendance;
CREATE TRIGGER trg_sync_capture_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.fn_capture_sync_change();
