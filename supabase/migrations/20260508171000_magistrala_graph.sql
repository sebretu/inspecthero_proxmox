-- Add support for named nodes (points) in the magistrala graph
CREATE TABLE IF NOT EXISTS cable_bus_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    plan_id UUID REFERENCES plans(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, name)
);

-- Update cable_buses to link to these nodes
ALTER TABLE cable_buses ADD COLUMN IF NOT EXISTS node_a_id UUID REFERENCES cable_bus_nodes(id);
ALTER TABLE cable_buses ADD COLUMN IF NOT EXISTS node_b_id UUID REFERENCES cable_bus_nodes(id);

-- Add index for pathfinding
CREATE INDEX IF NOT EXISTS idx_bus_nodes ON cable_buses(node_a_id, node_b_id);
