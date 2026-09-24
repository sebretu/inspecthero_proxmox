CREATE OR REPLACE FUNCTION public.enable_plan_versioning(p_plan_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_plan RECORD;
    v_existing_version RECORD;
    v_new_version_id UUID;
    v_result JSONB;
BEGIN
    -- Lock the plan row to prevent concurrent upgrades
    SELECT * INTO v_plan 
    FROM public.plans 
    WHERE id = p_plan_id AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan not found or deleted';
    END IF;

    -- Check if it already has versions
    SELECT * INTO v_existing_version 
    FROM public.plan_versions 
    WHERE plan_id = p_plan_id AND deleted_at IS NULL
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Plan is already versioned';
    END IF;

    -- Create V1 using existing legacy paths
    INSERT INTO public.plan_versions (
        plan_id, version_number, file_url, width_px, height_px, status
    ) VALUES (
        p_plan_id, 1, v_plan.pdf_path, v_plan.image_width, v_plan.image_height, 'active'
    ) RETURNING id INTO v_new_version_id;

    -- Copy existing task coordinates to entity_locations
    INSERT INTO public.entity_locations (
        entity_id, plan_version_id, x_norm, y_norm, migrated_by
    )
    SELECT id, v_new_version_id, x_norm, y_norm, 'original'
    FROM public.tasks
    WHERE plan_id = p_plan_id;

    -- Audit event
    INSERT INTO public.audit_events (
        event_type, user_id, resource_id, resource_type, metadata
    ) VALUES (
        'versioning_enabled', p_user_id, p_plan_id, 'plan', jsonb_build_object('version_id', v_new_version_id)
    );

    v_result := jsonb_build_object('version_id', v_new_version_id, 'success', true);
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
