-- Add second plan and points to cable_routes to span multiple plans
ALTER TABLE public.cable_routes
  ADD COLUMN IF NOT EXISTS plan_id_2   uuid references public.plans(id) on delete set null,
  ADD COLUMN IF NOT EXISTS point_c_x numeric(10,8),
  ADD COLUMN IF NOT EXISTS point_c_y numeric(10,8),
  ADD COLUMN IF NOT EXISTS point_d_x numeric(10,8),
  ADD COLUMN IF NOT EXISTS point_d_y numeric(10,8),
  ADD COLUMN IF NOT EXISTS waypoints_2 jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scale numeric(10,4),
  ADD COLUMN IF NOT EXISTS scale_2 numeric(10,4);
