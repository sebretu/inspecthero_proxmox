-- Migration for Cable Automation Module
-- Create table for cable buses (magistrale)
CREATE TABLE IF NOT EXISTS cable_buses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cable_type TEXT,
  spare_percent INT DEFAULT 10,
  route_points JSONB, -- Stores the geometry of the bus
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Link cables to buses
ALTER TABLE cables ADD COLUMN IF NOT EXISTS bus_id UUID REFERENCES cable_buses(id) ON DELETE SET NULL;

-- Enable RLS for the new table
ALTER TABLE cable_buses ENABLE ROW LEVEL SECURITY;

-- Simple policy for authenticated users (can be refined based on roles)
CREATE POLICY "Users can view buses for their projects" ON cable_buses
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage buses for their projects" ON cable_buses
  FOR ALL USING (auth.role() = 'authenticated');
