-- AgriAssist farm-first domain foundation.
--
-- This migration adds the customer farm model used by the final AgriAssist
-- product while leaving the current controller/system tables intact for a
-- staged migration.

CREATE TABLE IF NOT EXISTS farms (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    area DOUBLE PRECISION,
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ,
    CONSTRAINT farms_name_not_blank CHECK (length(trim(name)) > 0),
    CONSTRAINT farms_area_non_negative CHECK (area IS NULL OR area >= 0)
);

CREATE INDEX IF NOT EXISTS idx_farms_created_by_user_id
    ON farms(created_by_user_id);

CREATE TABLE IF NOT EXISTS farm_access (
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'viewer')),
    invited_by_user_id UUID REFERENCES users(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY (farm_id, user_id),
    CONSTRAINT farm_access_revoked_after_added CHECK (revoked_at IS NULL OR revoked_at >= added_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_farm_access_one_active_owner
    ON farm_access(farm_id)
    WHERE role = 'owner' AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_farm_access_user_active
    ON farm_access(user_id, farm_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_farm_access_farm_role_active
    ON farm_access(farm_id, role)
    WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION prevent_admin_farm_access()
RETURNS trigger AS $$
DECLARE
    target_account_type TEXT;
    inviter_account_type TEXT;
BEGIN
    SELECT account_type INTO target_account_type
    FROM users
    WHERE id = NEW.user_id;

    IF target_account_type = 'ADMIN' THEN
        RAISE EXCEPTION 'SPECTRON admin accounts cannot be added to farm access';
    END IF;

    IF NEW.invited_by_user_id IS NOT NULL THEN
        SELECT account_type INTO inviter_account_type
        FROM users
        WHERE id = NEW.invited_by_user_id;

        IF inviter_account_type = 'ADMIN' THEN
            RAISE EXCEPTION 'SPECTRON admin accounts cannot invite farm collaborators';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS farm_access_reject_admins ON farm_access;
CREATE TRIGGER farm_access_reject_admins
BEFORE INSERT OR UPDATE ON farm_access
FOR EACH ROW EXECUTE FUNCTION prevent_admin_farm_access();

CREATE TABLE IF NOT EXISTS farm_access_invitations (
    id UUID PRIMARY KEY,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role = 'viewer'),
    token_hash TEXT NOT NULL UNIQUE,
    invited_by_user_id UUID NOT NULL REFERENCES users(id),
    accepted_by_user_id UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT farm_access_invitations_email_not_blank CHECK (length(trim(email)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_farm_access_invitations_farm
    ON farm_access_invitations(farm_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_farm_access_invitations_email
    ON farm_access_invitations(lower(email));

CREATE TABLE IF NOT EXISTS fields (
    id UUID PRIMARY KEY,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    area DOUBLE PRECISION,
    boundary_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ,
    CONSTRAINT fields_name_not_blank CHECK (length(trim(name)) > 0),
    CONSTRAINT fields_area_non_negative CHECK (area IS NULL OR area >= 0)
);

CREATE INDEX IF NOT EXISTS idx_fields_farm_id
    ON fields(farm_id);

CREATE TABLE IF NOT EXISTS crops (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT crops_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS varieties (
    id UUID PRIMARY KEY,
    crop_id UUID NOT NULL REFERENCES crops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (crop_id, name),
    CONSTRAINT varieties_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS growth_stages (
    id UUID PRIMARY KEY,
    crop_id UUID NOT NULL REFERENCES crops(id) ON DELETE CASCADE,
    stage_name TEXT NOT NULL,
    days_after_plant_min INTEGER,
    days_after_plant_max INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    visual_hint TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (crop_id, stage_name),
    CONSTRAINT growth_stages_name_not_blank CHECK (length(trim(stage_name)) > 0),
    CONSTRAINT growth_stages_days_valid CHECK (
        days_after_plant_min IS NULL
        OR days_after_plant_max IS NULL
        OR days_after_plant_max >= days_after_plant_min
    )
);

CREATE INDEX IF NOT EXISTS idx_growth_stages_crop_order
    ON growth_stages(crop_id, display_order);

CREATE TABLE IF NOT EXISTS crop_instances (
    id UUID PRIMARY KEY,
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    crop_id UUID NOT NULL REFERENCES crops(id),
    variety_id UUID REFERENCES varieties(id),
    planting_date DATE,
    planting_date_precision TEXT NOT NULL DEFAULT 'exact'
        CHECK (planting_date_precision IN ('exact', 'approximate', 'unknown')),
    expected_harvest_date DATE,
    current_stage_id UUID REFERENCES growth_stages(id),
    stage_source TEXT NOT NULL DEFAULT 'automatic'
        CHECK (stage_source IN ('automatic', 'owner_confirmed', 'agronomist_confirmed', 'support_corrected')),
    stage_confidence DOUBLE PRECISION,
    stage_estimated_at TIMESTAMPTZ,
    stage_confirmed_at TIMESTAMPTZ,
    stage_confirmed_by_user_id UUID REFERENCES users(id),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT crop_instances_stage_confidence_valid CHECK (
        stage_confidence IS NULL OR (stage_confidence >= 0 AND stage_confidence <= 1)
    )
);

CREATE INDEX IF NOT EXISTS idx_crop_instances_field_active
    ON crop_instances(field_id, active);

CREATE INDEX IF NOT EXISTS idx_crop_instances_crop
    ON crop_instances(crop_id);

CREATE TABLE IF NOT EXISTS gateways (
    id UUID PRIMARY KEY,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    legacy_controller_id UUID UNIQUE REFERENCES controllers(id) ON DELETE SET NULL,
    serial_number TEXT UNIQUE NOT NULL,
    model TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'offline'
        CHECK (status IN ('pending_setup', 'online', 'offline', 'error', 'retired')),
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT gateways_serial_number_not_blank CHECK (length(trim(serial_number)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_gateways_farm_id
    ON gateways(farm_id);

CREATE TABLE IF NOT EXISTS sensor_bases (
    id UUID PRIMARY KEY,
    gateway_id UUID NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
    serial_number TEXT UNIQUE NOT NULL,
    label TEXT,
    status TEXT NOT NULL DEFAULT 'waiting_setup'
        CHECK (status IN ('waiting_setup', 'live', 'offline', 'retired', 'error')),
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sensor_bases_serial_number_not_blank CHECK (length(trim(serial_number)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_sensor_bases_gateway_id
    ON sensor_bases(gateway_id);

CREATE TABLE IF NOT EXISTS sensor_base_assignments (
    id UUID PRIMARY KEY,
    base_id UUID NOT NULL REFERENCES sensor_bases(id) ON DELETE CASCADE,
    field_id UUID REFERENCES fields(id) ON DELETE SET NULL,
    monitoring_zone TEXT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    unassigned_at TIMESTAMPTZ,
    assigned_by_user_id UUID REFERENCES users(id),
    CONSTRAINT sensor_base_assignments_target_required CHECK (
        field_id IS NOT NULL OR length(trim(COALESCE(monitoring_zone, ''))) > 0
    ),
    CONSTRAINT sensor_base_assignments_dates_valid CHECK (
        unassigned_at IS NULL OR unassigned_at >= assigned_at
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_base_assignments_one_active
    ON sensor_base_assignments(base_id)
    WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sensor_base_assignments_field_time
    ON sensor_base_assignments(field_id, assigned_at, unassigned_at);

CREATE TABLE IF NOT EXISTS sensor_modules (
    id UUID PRIMARY KEY,
    base_id UUID NOT NULL REFERENCES sensor_bases(id) ON DELETE CASCADE,
    slot_number INTEGER NOT NULL,
    model TEXT,
    status TEXT NOT NULL DEFAULT 'live'
        CHECK (status IN ('live', 'offline', 'retired', 'error')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (base_id, slot_number),
    CONSTRAINT sensor_modules_slot_number_positive CHECK (slot_number > 0)
);

CREATE TABLE IF NOT EXISTS sensor_channels (
    id UUID PRIMARY KEY,
    module_id UUID NOT NULL REFERENCES sensor_modules(id) ON DELETE CASCADE,
    channel_key TEXT NOT NULL,
    measurement_type TEXT NOT NULL,
    unit TEXT,
    calibration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (module_id, channel_key),
    CONSTRAINT sensor_channels_channel_key_not_blank CHECK (length(trim(channel_key)) > 0),
    CONSTRAINT sensor_channels_measurement_type_not_blank CHECK (length(trim(measurement_type)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_sensor_channels_measurement_type
    ON sensor_channels(measurement_type);

ALTER TABLE IF EXISTS alerts
    ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS field_id UUID REFERENCES fields(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS gateway_id UUID REFERENCES gateways(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sensor_base_id UUID REFERENCES sensor_bases(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS crop_instance_id UUID REFERENCES crop_instances(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_ref TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_alerts_farm_created_at
    ON alerts(farm_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_field_created_at
    ON alerts(field_id, created_at DESC);

CREATE TABLE IF NOT EXISTS alert_recipients (
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (alert_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_recipients_user_unread
    ON alert_recipients(user_id, created_at DESC)
    WHERE read_at IS NULL AND dismissed_at IS NULL;

CREATE TABLE IF NOT EXISTS gateway_connectivity_status (
    gateway_id UUID PRIMARY KEY REFERENCES gateways(id) ON DELETE CASCADE,
    active_transport TEXT NOT NULL DEFAULT 'offline'
        CHECK (active_transport IN ('wifi', 'cellular', 'offline')),
    wifi_ssid_masked TEXT,
    wifi_ssid_hash TEXT,
    wifi_signal_dbm INTEGER,
    cellular_signal TEXT,
    last_cloud_success_at TIMESTAMPTZ,
    queued_records INTEGER NOT NULL DEFAULT 0,
    queue_capacity_percent DOUBLE PRECISION,
    fallback_reason TEXT,
    firmware_version TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT gateway_connectivity_status_queue_non_negative CHECK (queued_records >= 0),
    CONSTRAINT gateway_connectivity_status_capacity_valid CHECK (
        queue_capacity_percent IS NULL
        OR (queue_capacity_percent >= 0 AND queue_capacity_percent <= 100)
    )
);

CREATE TABLE IF NOT EXISTS connectivity_events (
    id UUID PRIMARY KEY,
    gateway_id UUID NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    from_transport TEXT,
    to_transport TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT connectivity_events_event_type_not_blank CHECK (length(trim(event_type)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_connectivity_events_gateway_created_at
    ON connectivity_events(gateway_id, created_at DESC);

CREATE TABLE IF NOT EXISTS provisioning_audit (
    id UUID PRIMARY KEY,
    gateway_id UUID NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
    initiated_by_user_id UUID REFERENCES users(id),
    method TEXT NOT NULL CHECK (method IN ('ble', 'softap')),
    result TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT provisioning_audit_result_not_blank CHECK (length(trim(result)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_provisioning_audit_gateway_created_at
    ON provisioning_audit(gateway_id, created_at DESC);
