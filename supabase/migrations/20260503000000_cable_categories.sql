CREATE TABLE IF NOT EXISTS cable_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
    point_a_x DOUBLE PRECISION,
    point_a_y DOUBLE PRECISION,
    point_a_label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE cables ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES cable_categories(id) ON DELETE SET NULL;
