-- ==============================================================================
-- Migration: 20260925090000_backfill_sync_changes.sql
-- Backfill existing domain entities into sync_changes for initial mobile pull
-- ==============================================================================

-- 1. Projects
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'projects', id, 'INSERT', COALESCE(version, 1), company_id, id, COALESCE(created_at, now())
FROM public.projects
WHERE deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 2. Buildings
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'buildings', b.id, 'INSERT', COALESCE(b.version, 1), p.company_id, b.project_id, COALESCE(b.created_at, now())
FROM public.buildings b
LEFT JOIN public.projects p ON p.id = b.project_id
WHERE b.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 3. Floors
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'floors', f.id, 'INSERT', COALESCE(f.version, 1), p.company_id, b.project_id, COALESCE(f.created_at, now())
FROM public.floors f
LEFT JOIN public.buildings b ON b.id = f.building_id
LEFT JOIN public.projects p ON p.id = b.project_id
WHERE f.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 4. Plans
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'plans', pl.id, 'INSERT', COALESCE(pl.version, 1), p.company_id, b.project_id, COALESCE(pl.created_at, now())
FROM public.plans pl
LEFT JOIN public.floors f ON f.id = pl.floor_id
LEFT JOIN public.buildings b ON b.id = f.building_id
LEFT JOIN public.projects p ON p.id = b.project_id
WHERE pl.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 5. Tasks
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'tasks', t.id, 'INSERT', COALESCE(t.version, 1), p.company_id, b.project_id, COALESCE(t.created_at, now())
FROM public.tasks t
LEFT JOIN public.plans pl ON pl.id = t.plan_id
LEFT JOIN public.floors f ON f.id = pl.floor_id
LEFT JOIN public.buildings b ON b.id = f.building_id
LEFT JOIN public.projects p ON p.id = b.project_id
WHERE t.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 6. Task Photos
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'task_photos', tp.id, 'INSERT', COALESCE(tp.version, 1), p.company_id, b.project_id, COALESCE(tp.created_at, now())
FROM public.task_photos tp
LEFT JOIN public.tasks t ON t.id = tp.task_id
LEFT JOIN public.plans pl ON pl.id = t.plan_id
LEFT JOIN public.floors f ON f.id = pl.floor_id
LEFT JOIN public.buildings b ON b.id = f.building_id
LEFT JOIN public.projects p ON p.id = b.project_id
WHERE tp.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 7. Task Comments
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'task_comments', tc.id, 'INSERT', COALESCE(tc.version, 1), p.company_id, b.project_id, COALESCE(tc.created_at, now())
FROM public.task_comments tc
LEFT JOIN public.tasks t ON t.id = tc.task_id
LEFT JOIN public.plans pl ON pl.id = t.plan_id
LEFT JOIN public.floors f ON f.id = pl.floor_id
LEFT JOIN public.buildings b ON b.id = f.building_id
LEFT JOIN public.projects p ON p.id = b.project_id
WHERE tc.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 8. Cables
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'cables', c.id, 'INSERT', COALESCE(c.version, 1), p.company_id, b.project_id, COALESCE(c.created_at, now())
FROM public.cables c
LEFT JOIN public.plans pl ON pl.id = c.plan_id
LEFT JOIN public.floors f ON f.id = pl.floor_id
LEFT JOIN public.buildings b ON b.id = f.building_id
LEFT JOIN public.projects p ON p.id = b.project_id
WHERE c.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 9. Trommels
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'trommels', tr.id, 'INSERT', COALESCE(tr.version, 1), p.company_id, tr.project_id, COALESCE(tr.created_at, now())
FROM public.trommels tr
LEFT JOIN public.projects p ON p.id = tr.project_id
WHERE tr.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 10. Cable Routes
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'cable_routes', cr.id, 'INSERT', COALESCE(cr.version, 1), p.company_id, b.project_id, COALESCE(cr.created_at, now())
FROM public.cable_routes cr
LEFT JOIN public.plans pl ON pl.id = cr.plan_id
LEFT JOIN public.floors f ON f.id = pl.floor_id
LEFT JOIN public.buildings b ON b.id = f.building_id
LEFT JOIN public.projects p ON p.id = b.project_id
WHERE cr.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 11. Cable Buses
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'cable_buses', cb.id, 'INSERT', COALESCE(cb.version, 1), p.company_id, b.project_id, COALESCE(cb.created_at, now())
FROM public.cable_buses cb
LEFT JOIN public.plans pl ON pl.id = cb.plan_id
LEFT JOIN public.floors f ON f.id = pl.floor_id
LEFT JOIN public.buildings b ON b.id = f.building_id
LEFT JOIN public.projects p ON p.id = b.project_id
WHERE cb.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 12. BMA Devices
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'bma_devices', bma.id, 'INSERT', COALESCE(bma.version, 1), p.company_id, b.project_id, COALESCE(bma.created_at, now())
FROM public.bma_devices bma
LEFT JOIN public.plans pl ON pl.id = bma.plan_id
LEFT JOIN public.floors f ON f.id = pl.floor_id
LEFT JOIN public.buildings b ON b.id = f.building_id
LEFT JOIN public.projects p ON p.id = b.project_id
WHERE bma.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 13. Stromkreise
INSERT INTO public.sync_changes (table_name, record_id, operation, version, company_id, project_id, changed_at)
SELECT 'stromkreise', sk.id, 'INSERT', COALESCE(sk.version, 1), p.company_id, b.project_id, COALESCE(sk.created_at, now())
FROM public.stromkreise sk
LEFT JOIN public.plans pl ON pl.id = sk.plan_id
LEFT JOIN public.floors f ON f.id = pl.floor_id
LEFT JOIN public.buildings b ON b.id = f.building_id
LEFT JOIN public.projects p ON p.id = b.project_id
WHERE sk.deleted_at IS NULL
ON CONFLICT DO NOTHING;
