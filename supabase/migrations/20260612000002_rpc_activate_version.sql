CREATE OR REPLACE FUNCTION public.activate_plan_version(
    p_plan_id UUID, 
    p_version_id UUID, 
    p_user_id UUID,
    p_locations JSONB -- Array of { entity_id, x_norm, y_norm }
)
RETURNS JSONB AS $$
DECLARE
    v_plan RECORD;
    v_version RECORD;
    v_loc JSONB;
BEGIN
    -- 1. Lock Plan
    SELECT * INTO v_plan 
    FROM public.plans 
    WHERE id = p_plan_id AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan not found';
    END IF;

    -- 2. Validate Version
    SELECT * INTO v_version 
    FROM public.plan_versions 
    WHERE id = p_version_id AND plan_id = p_plan_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan version not found';
    END IF;

    IF v_version.status = 'active' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already active');
    END IF;

    -- 3. Archive all current active versions
    UPDATE public.plan_versions
    SET status = 'archived'
    WHERE plan_id = p_plan_id AND status = 'active';

    -- 4. Insert computed entity locations for the new version
    FOR v_loc IN SELECT * FROM jsonb_array_elements(p_locations)
    LOOP
        INSERT INTO public.entity_locations (
            entity_id, plan_version_id, x_norm, y_norm, migrated_by
        ) VALUES (
            (v_loc->>'entity_id')::UUID, 
            p_version_id, 
            (v_loc->>'x_norm')::FLOAT, 
            (v_loc->>'y_norm')::FLOAT, 
            'original'
        );
    END LOOP;

    -- 5. Mark new version as active
    UPDATE public.plan_versions
    SET status = 'active'
    WHERE id = p_version_id;

    -- 6. Update main plan fields (legacy compatibility and lock release)
    UPDATE public.plans
    SET 
        active_migration_id = NULL,
        version = v_version.version_number,
        pdf_path = v_version.file_url,
        image_width = v_version.width_px,
        image_height = v_version.height_px,
        updated_at = NOW()
    WHERE id = p_plan_id;

    -- 7. Audit Event
    INSERT INTO public.audit_events (
        event_type, user_id, resource_id, resource_type, metadata
    ) VALUES (
        'version_activated', p_user_id, p_plan_id, 'plan', 
        jsonb_build_object('version_id', p_version_id, 'version_number', v_version.version_number)
    );

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
