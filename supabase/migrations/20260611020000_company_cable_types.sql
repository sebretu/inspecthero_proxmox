CREATE TABLE IF NOT EXISTS company_cable_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, name)
);

ALTER TABLE company_cable_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage company cable types"
    ON company_cable_types FOR ALL
    USING (company_id = public.current_company_id())
    WITH CHECK (company_id = public.current_company_id());
