-- Add map coordinates + plan reference to cable_routes
ALTER TABLE public.cable_routes
  ADD COLUMN IF NOT EXISTS plan_id   uuid references public.plans(id) on delete set null,
  ADD COLUMN IF NOT EXISTS point_a_x numeric(10,8),
  ADD COLUMN IF NOT EXISTS point_a_y numeric(10,8),
  ADD COLUMN IF NOT EXISTS point_b_x numeric(10,8),
  ADD COLUMN IF NOT EXISTS point_b_y numeric(10,8);

-- Add cable type to cables
ALTER TABLE public.cables
  ADD COLUMN IF NOT EXISTS cable_type text;

-- Index for plan-based route lookups
CREATE INDEX IF NOT EXISTS idx_cable_routes_plan ON public.cable_routes(plan_id);
