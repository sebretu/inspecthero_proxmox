-- BMA Automatyka Module Migration
-- This migration adds tables for devices, connections, and routes specific to the BMA module.

-- 1. BMA Devices
CREATE TABLE IF NOT EXISTS bma_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    plan_id UUID REFERENCES plans(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    type TEXT, -- e.g. '01/01', 'PA10 S1', 'BMA', 'BMZ', 'FIZ', 'HM', 'ÜG'
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. BMA Connections
CREATE TABLE IF NOT EXISTS bma_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT,
    type TEXT, -- 'loop', 'line', etc.
    color TEXT DEFAULT '#3b82f6',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. BMA Routes (Physical paths between devices)
CREATE TABLE IF NOT EXISTS bma_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    connection_id UUID REFERENCES bma_connections(id) ON DELETE CASCADE,
    source_device_id UUID REFERENCES bma_devices(id) ON DELETE CASCADE,
    target_device_id UUID REFERENCES bma_devices(id) ON DELETE CASCADE,
    waypoints JSONB DEFAULT '[]', -- Array of [x, y] coordinates
    length_meters DOUBLE PRECISION DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. BMA Settings (Regex config, etc.)
CREATE TABLE IF NOT EXISTS bma_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL UNIQUE,
    device_regex TEXT DEFAULT '(\d{2}/\d{2}|PA10\sS\d|BMA|BMZ|FIZ|HM|ÜG)',
    scale_px_per_meter DOUBLE PRECISION DEFAULT 100.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE bma_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE bma_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bma_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bma_settings ENABLE ROW LEVEL SECURITY;

-- Policies (based on project membership helper)
CREATE POLICY "Users can view BMA devices if member of project" ON bma_devices
    FOR SELECT USING (public.is_project_member(project_id));
CREATE POLICY "Users can manage BMA devices if admin/mod of project" ON bma_devices
    FOR ALL USING (public.is_project_admin_or_mod(project_id));

CREATE POLICY "Users can view BMA connections if member of project" ON bma_connections
    FOR SELECT USING (public.is_project_member(project_id));
CREATE POLICY "Users can manage BMA connections if admin/mod of project" ON bma_connections
    FOR ALL USING (public.is_project_admin_or_mod(project_id));

CREATE POLICY "Users can view BMA routes if member of project" ON bma_routes
    FOR SELECT USING (public.is_project_member(project_id));
CREATE POLICY "Users can manage BMA routes if admin/mod of project" ON bma_routes
    FOR ALL USING (public.is_project_admin_or_mod(project_id));

CREATE POLICY "Users can view BMA settings if member of project" ON bma_settings
    FOR SELECT USING (public.is_project_member(project_id));
CREATE POLICY "Users can manage BMA settings if admin/mod of project" ON bma_settings
    FOR ALL USING (public.is_project_admin_or_mod(project_id));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bma_devices_plan ON bma_devices(plan_id);
CREATE INDEX IF NOT EXISTS idx_bma_routes_conn ON bma_routes(connection_id);
CREATE INDEX IF NOT EXISTS idx_bma_routes_devices ON bma_routes(source_device_id, target_device_id);
