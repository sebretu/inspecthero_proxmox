-- Fix unique constraint for cable_bus_nodes to support multi-floor infrastructure
-- We need to drop the constraint on (project_id, name) and add one on (project_id, plan_id, name)

ALTER TABLE cable_bus_nodes DROP CONSTRAINT IF EXISTS cable_bus_nodes_project_id_name_key;

-- Ensure there are no duplicates that would prevent adding the new constraint
-- (Optional, but safe if any exist)
-- DELETE FROM cable_bus_nodes a USING cable_bus_nodes b 
-- WHERE a.id < b.id AND a.project_id = b.project_id AND a.plan_id = b.plan_id AND a.name = b.name;

ALTER TABLE cable_bus_nodes ADD CONSTRAINT cable_bus_nodes_project_plan_name_unique UNIQUE (project_id, plan_id, name);
