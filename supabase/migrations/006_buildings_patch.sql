-- =============================================================================
-- 006 PATCH: align schema with seed (buildings.address)
-- =============================================================================

alter table public.buildings
  add column if not exists address text;

create index if not exists idx_buildings_project_id on public.buildings(project_id);
