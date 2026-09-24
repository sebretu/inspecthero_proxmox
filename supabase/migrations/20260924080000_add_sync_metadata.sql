-- ==============================================================================
-- Migration: 20260924080000_add_sync_metadata.sql
-- Stage 2: Additive SQL Sync Metadata for Offline-First Mobile Synchronization
--
-- ABSOLUTE DATA SAFETY:
-- - Strict additive changes ONLY (ADD COLUMN IF NOT EXISTS)
-- - NO DROP, NO TRUNCATE, NO DELETE, NO ID REMAPPING
-- - Backward compatible with existing web application
-- ==============================================================================

-- 1. Projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_projects_sync ON public.projects (company_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_deleted ON public.projects (deleted_at) WHERE deleted_at IS NOT NULL;

-- 2. Buildings
ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_buildings_sync ON public.buildings (project_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_buildings_deleted ON public.buildings (deleted_at) WHERE deleted_at IS NOT NULL;

-- 3. Floors
ALTER TABLE public.floors
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_floors_sync ON public.floors (building_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_floors_deleted ON public.floors (deleted_at) WHERE deleted_at IS NOT NULL;

-- 4. Plans
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_plans_sync ON public.plans (floor_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plans_deleted ON public.plans (deleted_at) WHERE deleted_at IS NOT NULL;

-- 5. Tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_sync ON public.tasks (plan_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON public.tasks (deleted_at) WHERE deleted_at IS NOT NULL;

-- 6. Task Photos
ALTER TABLE public.task_photos
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_task_photos_sync ON public.task_photos (task_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_photos_deleted ON public.task_photos (deleted_at) WHERE deleted_at IS NOT NULL;

-- 7. Task Comments
ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_task_comments_sync ON public.task_comments (task_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_comments_deleted ON public.task_comments (deleted_at) WHERE deleted_at IS NOT NULL;

-- 8. Cables
ALTER TABLE public.cables
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_cables_sync ON public.cables (plan_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cables_deleted ON public.cables (deleted_at) WHERE deleted_at IS NOT NULL;

-- 9. Trommels
ALTER TABLE public.trommels
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_trommels_sync ON public.trommels (project_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trommels_deleted ON public.trommels (deleted_at) WHERE deleted_at IS NOT NULL;

-- 10. Cable Routes
ALTER TABLE public.cable_routes
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_cable_routes_sync ON public.cable_routes (plan_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cable_routes_deleted ON public.cable_routes (deleted_at) WHERE deleted_at IS NOT NULL;

-- 11. Cable Buses
ALTER TABLE public.cable_buses
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_cable_buses_sync ON public.cable_buses (project_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cable_buses_deleted ON public.cable_buses (deleted_at) WHERE deleted_at IS NOT NULL;

-- 12. BMA Devices
ALTER TABLE public.bma_devices
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_bma_devices_sync ON public.bma_devices (plan_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bma_devices_deleted ON public.bma_devices (deleted_at) WHERE deleted_at IS NOT NULL;

-- 13. Stromkreise
ALTER TABLE public.stromkreise
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_stromkreise_sync ON public.stromkreise (plan_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stromkreise_deleted ON public.stromkreise (deleted_at) WHERE deleted_at IS NOT NULL;

-- 14. Materials
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_materials_sync ON public.materials (company_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_materials_deleted ON public.materials (deleted_at) WHERE deleted_at IS NOT NULL;

-- 15. Orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_orders_sync ON public.orders (project_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_deleted ON public.orders (deleted_at) WHERE deleted_at IS NOT NULL;

-- 16. Order Items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_sync ON public.order_items (order_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_deleted ON public.order_items (deleted_at) WHERE deleted_at IS NOT NULL;

-- 17. Attendance
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_sync ON public.attendance (company_id, version) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_deleted ON public.attendance (deleted_at) WHERE deleted_at IS NOT NULL;
