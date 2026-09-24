-- =============================================================================
-- SCHEMA ADDITION: Plan Versioning & Spatial Preservation
-- Additive schema for hardened, immutable plan versioning.
-- =============================================================================

-- 1. Additive fields for public.plans
ALTER TABLE public.plans
ADD COLUMN IF NOT EXISTS active_migration_id UUID NULL,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- 2. Represents an uploaded revision (Immutable)
CREATE TABLE IF NOT EXISTS public.plan_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    file_url VARCHAR(1024) NOT NULL,
    width_px INT,
    height_px INT,
    status VARCHAR(50) NOT NULL DEFAULT 'needs_alignment', -- 'active', 'archived', 'migration_failed', 'needs_alignment', 'review_pending'
    transformation_model JSONB, -- Future-proof: e.g. { "type": "affine", "matrix": [...] }
    activation_transaction_id UUID NULL,
    locations_checksum VARCHAR(256),
    migration_health_score FLOAT,
    migration_duration_ms INT,
    migration_lock_wait_time_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL,
    UNIQUE(plan_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_plan_versions_plan ON public.plan_versions(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_versions_status ON public.plan_versions(status);

-- 3. Additive mapping for an entity's physical location on a specific version
CREATE TABLE IF NOT EXISTS public.entity_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    plan_version_id UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE CASCADE,
    x_norm FLOAT NOT NULL CHECK (x_norm >= 0 AND x_norm <= 1),
    y_norm FLOAT NOT NULL CHECK (y_norm >= 0 AND y_norm <= 1),
    migrated_by VARCHAR(50) NOT NULL DEFAULT 'original', -- 'original', 'manual_anchor', 'user_adjusted'
    is_orphaned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_entity_locations_entity ON public.entity_locations(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_locations_plan_version ON public.entity_locations(plan_version_id);

-- 4. Immutable Audit Events for enterprise traceability
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resource_id UUID,
    resource_type VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON public.audit_events(resource_id, resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON public.audit_events(created_at DESC);
