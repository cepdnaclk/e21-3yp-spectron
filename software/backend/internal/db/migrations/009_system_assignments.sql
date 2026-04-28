-- Logical monitoring systems with replaceable controllers and sensors.

CREATE TABLE IF NOT EXISTS systems (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    purpose TEXT,
    location TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'standby', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_systems_account_id
    ON systems(account_id);

CREATE TABLE IF NOT EXISTS system_controller_assignments (
    id UUID PRIMARY KEY,
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    controller_id UUID NOT NULL REFERENCES controllers(id) ON DELETE CASCADE,
    assigned_by_user_id UUID REFERENCES users(id),
    released_by_user_id UUID REFERENCES users(id),
    notes TEXT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    unassigned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_controller_assignments_system_id
    ON system_controller_assignments(system_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_controller_assignments_controller_id
    ON system_controller_assignments(controller_id, assigned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_controller_assignments_active_controller
    ON system_controller_assignments(controller_id)
    WHERE unassigned_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_controller_assignments_active_system
    ON system_controller_assignments(system_id)
    WHERE unassigned_at IS NULL;

CREATE TABLE IF NOT EXISTS system_sensors (
    id UUID PRIMARY KEY,
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    slot_key TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN (
        'load',
        'temperature_humidity',
        'ultrasonic',
        'gas',
        'weight',
        'temperature',
        'humidity',
        'pressure',
        'bme280',
        'bmp280',
        'vl53l0x',
        'distance'
    )),
    status TEXT NOT NULL DEFAULT 'pending_discovery' CHECK (status IN (
        'pending_discovery',
        'live',
        'offline',
        'retired',
        'damaged'
    )),
    configured BOOLEAN NOT NULL DEFAULT false,
    current_controller_id UUID REFERENCES controllers(id) ON DELETE SET NULL,
    current_sensor_uid TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_sensors_system_slot_key
    ON system_sensors(system_id, slot_key);

CREATE INDEX IF NOT EXISTS idx_system_sensors_current_controller_id
    ON system_sensors(current_controller_id);

CREATE TABLE IF NOT EXISTS system_sensor_assignments (
    id UUID PRIMARY KEY,
    system_sensor_id UUID NOT NULL REFERENCES system_sensors(id) ON DELETE CASCADE,
    controller_id UUID REFERENCES controllers(id) ON DELETE SET NULL,
    controller_sensor_id UUID REFERENCES controller_sensors(id) ON DELETE SET NULL,
    legacy_sensor_id UUID REFERENCES sensors(id) ON DELETE SET NULL,
    sensor_uid TEXT NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    unassigned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_sensor_assignments_system_sensor_id
    ON system_sensor_assignments(system_sensor_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_sensor_assignments_controller_id
    ON system_sensor_assignments(controller_id, assigned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_sensor_assignments_active_system_sensor
    ON system_sensor_assignments(system_sensor_id)
    WHERE unassigned_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_sensor_assignments_active_controller_sensor
    ON system_sensor_assignments(controller_sensor_id)
    WHERE controller_sensor_id IS NOT NULL AND unassigned_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_sensor_assignments_active_legacy_sensor
    ON system_sensor_assignments(legacy_sensor_id)
    WHERE legacy_sensor_id IS NOT NULL AND unassigned_at IS NULL;

CREATE TABLE IF NOT EXISTS system_sensor_configurations (
    id UUID PRIMARY KEY,
    system_sensor_id UUID NOT NULL REFERENCES system_sensors(id) ON DELETE CASCADE,
    used_for TEXT,
    dashboard_view TEXT,
    config_json JSONB NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_sensor_configurations_system_sensor_id
    ON system_sensor_configurations(system_sensor_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_sensor_configurations_active
    ON system_sensor_configurations(system_sensor_id)
    WHERE active = true;

ALTER TABLE IF EXISTS sensors
    ADD COLUMN IF NOT EXISTS system_sensor_id UUID REFERENCES system_sensors(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS controller_sensors
    ADD COLUMN IF NOT EXISTS system_sensor_id UUID REFERENCES system_sensors(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS sensor_readings
    ADD COLUMN IF NOT EXISTS system_sensor_id UUID REFERENCES system_sensors(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS alerts
    ADD COLUMN IF NOT EXISTS system_id UUID REFERENCES systems(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS system_sensor_id UUID REFERENCES system_sensors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sensors_system_sensor_id
    ON sensors(system_sensor_id);

CREATE INDEX IF NOT EXISTS idx_controller_sensors_system_sensor_id
    ON controller_sensors(system_sensor_id);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_system_sensor_id_time
    ON sensor_readings(system_sensor_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_system_id
    ON alerts(system_id);

CREATE INDEX IF NOT EXISTS idx_alerts_system_sensor_id
    ON alerts(system_sensor_id);

WITH owned_controllers AS (
    SELECT
        c.id AS controller_id,
        c.account_id,
        COALESCE(NULLIF(c.name, ''), COALESCE(c.controller_uid, c.hw_id), 'Monitoring System') AS system_name,
        c.purpose,
        c.location,
        c.created_at,
        c.updated_at,
        (
            substr(md5('system:' || c.id::text), 1, 8) || '-' ||
            substr(md5('system:' || c.id::text), 9, 4) || '-' ||
            substr(md5('system:' || c.id::text), 13, 4) || '-' ||
            substr(md5('system:' || c.id::text), 17, 4) || '-' ||
            substr(md5('system:' || c.id::text), 21, 12)
        )::uuid AS system_id
    FROM controllers c
    WHERE c.owner_user_id IS NOT NULL
),
inserted_systems AS (
    INSERT INTO systems (
        id,
        account_id,
        name,
        purpose,
        location,
        status,
        created_at,
        updated_at
    )
    SELECT
        oc.system_id,
        oc.account_id,
        oc.system_name,
        oc.purpose,
        oc.location,
        'active',
        oc.created_at,
        GREATEST(oc.updated_at, oc.created_at)
    FROM owned_controllers oc
    WHERE NOT EXISTS (
        SELECT 1
        FROM systems s
        WHERE s.id = oc.system_id
    )
    RETURNING id
)
INSERT INTO system_controller_assignments (
    id,
    system_id,
    controller_id,
    assigned_by_user_id,
    assigned_at
)
SELECT
    (
        substr(md5('system-controller-assignment:' || oc.controller_id::text), 1, 8) || '-' ||
        substr(md5('system-controller-assignment:' || oc.controller_id::text), 9, 4) || '-' ||
        substr(md5('system-controller-assignment:' || oc.controller_id::text), 13, 4) || '-' ||
        substr(md5('system-controller-assignment:' || oc.controller_id::text), 17, 4) || '-' ||
        substr(md5('system-controller-assignment:' || oc.controller_id::text), 21, 12)
    )::uuid,
    oc.system_id,
    oc.controller_id,
    c.owner_user_id,
    c.updated_at
FROM owned_controllers oc
JOIN controllers c ON c.id = oc.controller_id
WHERE NOT EXISTS (
    SELECT 1
    FROM system_controller_assignments sca
    WHERE sca.controller_id = oc.controller_id
      AND sca.unassigned_at IS NULL
)
ON CONFLICT (id) DO NOTHING;

WITH active_systems AS (
    SELECT
        sca.system_id,
        sca.controller_id,
        sca.assigned_at
    FROM system_controller_assignments sca
    WHERE sca.unassigned_at IS NULL
),
candidate_sensors AS (
    SELECT
        ast.system_id,
        ast.controller_id,
        cs.id AS controller_sensor_id,
        cs.sensor_uid,
        cs.name,
        cs.type,
        cs.status,
        cs.configured,
        cs.created_at,
        cs.updated_at,
        CASE
            WHEN position('-sensor-' IN lower(cs.sensor_uid)) > 0 THEN split_part(lower(cs.sensor_uid), '-sensor-', 2)
            ELSE regexp_replace(lower(cs.type), '[^a-z0-9]+', '-', 'g') || '-01'
        END AS slot_key
    FROM active_systems ast
    JOIN controller_sensors cs ON cs.controller_id = ast.controller_id
),
upserted_system_sensors AS (
    INSERT INTO system_sensors (
        id,
        system_id,
        slot_key,
        name,
        type,
        status,
        configured,
        current_controller_id,
        current_sensor_uid,
        created_at,
        updated_at,
        last_seen
    )
    SELECT
        (
            substr(md5('system-sensor:' || cs.system_id::text || ':' || cs.slot_key), 1, 8) || '-' ||
            substr(md5('system-sensor:' || cs.system_id::text || ':' || cs.slot_key), 9, 4) || '-' ||
            substr(md5('system-sensor:' || cs.system_id::text || ':' || cs.slot_key), 13, 4) || '-' ||
            substr(md5('system-sensor:' || cs.system_id::text || ':' || cs.slot_key), 17, 4) || '-' ||
            substr(md5('system-sensor:' || cs.system_id::text || ':' || cs.slot_key), 21, 12)
        )::uuid,
        cs.system_id,
        cs.slot_key,
        cs.name,
        cs.type,
        CASE WHEN lower(cs.status) IN ('live', 'offline', 'retired', 'damaged') THEN lower(cs.status) ELSE 'live' END,
        cs.configured,
        cs.controller_id,
        cs.sensor_uid,
        cs.created_at,
        cs.updated_at,
        NULL
    FROM candidate_sensors cs
    ON CONFLICT (system_id, slot_key) DO UPDATE
    SET name = EXCLUDED.name,
        type = EXCLUDED.type,
        status = EXCLUDED.status,
        configured = system_sensors.configured OR EXCLUDED.configured,
        current_controller_id = EXCLUDED.current_controller_id,
        current_sensor_uid = EXCLUDED.current_sensor_uid,
        updated_at = GREATEST(system_sensors.updated_at, EXCLUDED.updated_at)
    RETURNING id, system_id, slot_key
),
controller_sensor_matches AS (
    SELECT
        cs.id AS controller_sensor_id,
        ss.id AS system_sensor_id
    FROM active_systems ast
    JOIN controller_sensors cs ON cs.controller_id = ast.controller_id
    JOIN system_sensors ss ON ss.system_id = ast.system_id
    WHERE ss.slot_key = CASE
        WHEN position('-sensor-' IN lower(cs.sensor_uid)) > 0 THEN split_part(lower(cs.sensor_uid), '-sensor-', 2)
        ELSE regexp_replace(lower(cs.type), '[^a-z0-9]+', '-', 'g') || '-01'
    END
)
UPDATE controller_sensors cs
SET system_sensor_id = csm.system_sensor_id
FROM controller_sensor_matches csm
WHERE cs.id = csm.controller_sensor_id
  AND cs.system_sensor_id IS DISTINCT FROM csm.system_sensor_id;

WITH active_systems AS (
    SELECT
        sca.system_id,
        sca.controller_id
    FROM system_controller_assignments sca
    WHERE sca.unassigned_at IS NULL
),
legacy_candidates AS (
    SELECT
        ast.system_id,
        s.controller_id,
        s.id AS legacy_sensor_id,
        s.hw_id,
        COALESCE(NULLIF(s.name, ''), s.hw_id, 'Sensor') AS sensor_name,
        s.type,
        CASE
            WHEN position('-sensor-' IN lower(s.hw_id)) > 0 THEN split_part(lower(s.hw_id), '-sensor-', 2)
            ELSE regexp_replace(lower(s.type), '[^a-z0-9]+', '-', 'g') || '-01'
        END AS slot_key
    FROM active_systems ast
    JOIN sensors s ON s.controller_id = ast.controller_id
),
upserted_legacy_system_sensors AS (
    INSERT INTO system_sensors (
        id,
        system_id,
        slot_key,
        name,
        type,
        status,
        configured,
        current_controller_id,
        current_sensor_uid,
        created_at,
        updated_at,
        last_seen
    )
    SELECT
        (
            substr(md5('system-sensor:' || lc.system_id::text || ':' || lc.slot_key), 1, 8) || '-' ||
            substr(md5('system-sensor:' || lc.system_id::text || ':' || lc.slot_key), 9, 4) || '-' ||
            substr(md5('system-sensor:' || lc.system_id::text || ':' || lc.slot_key), 13, 4) || '-' ||
            substr(md5('system-sensor:' || lc.system_id::text || ':' || lc.slot_key), 17, 4) || '-' ||
            substr(md5('system-sensor:' || lc.system_id::text || ':' || lc.slot_key), 21, 12)
        )::uuid,
        lc.system_id,
        lc.slot_key,
        lc.sensor_name,
        lc.type,
        'live',
        false,
        lc.controller_id,
        lc.hw_id,
        NOW(),
        NOW(),
        NULL
    FROM legacy_candidates lc
    ON CONFLICT (system_id, slot_key) DO UPDATE
    SET current_controller_id = COALESCE(system_sensors.current_controller_id, EXCLUDED.current_controller_id),
        current_sensor_uid = COALESCE(system_sensors.current_sensor_uid, EXCLUDED.current_sensor_uid),
        updated_at = NOW()
    RETURNING id, system_id, slot_key
),
legacy_sensor_matches AS (
    SELECT
        s.id AS legacy_sensor_id,
        ss.id AS system_sensor_id
    FROM active_systems ast
    JOIN sensors s ON s.controller_id = ast.controller_id
    JOIN system_sensors ss ON ss.system_id = ast.system_id
    WHERE ss.slot_key = CASE
        WHEN position('-sensor-' IN lower(s.hw_id)) > 0 THEN split_part(lower(s.hw_id), '-sensor-', 2)
        ELSE regexp_replace(lower(s.type), '[^a-z0-9]+', '-', 'g') || '-01'
    END
)
UPDATE sensors s
SET system_sensor_id = lsm.system_sensor_id
FROM legacy_sensor_matches lsm
WHERE s.id = lsm.legacy_sensor_id
  AND s.system_sensor_id IS DISTINCT FROM lsm.system_sensor_id;

INSERT INTO system_sensor_assignments (
    id,
    system_sensor_id,
    controller_id,
    controller_sensor_id,
    legacy_sensor_id,
    sensor_uid,
    assigned_at
)
SELECT
    (
        substr(md5('system-sensor-assignment:' || cs.id::text), 1, 8) || '-' ||
        substr(md5('system-sensor-assignment:' || cs.id::text), 9, 4) || '-' ||
        substr(md5('system-sensor-assignment:' || cs.id::text), 13, 4) || '-' ||
        substr(md5('system-sensor-assignment:' || cs.id::text), 17, 4) || '-' ||
        substr(md5('system-sensor-assignment:' || cs.id::text), 21, 12)
    )::uuid,
    cs.system_sensor_id,
    cs.controller_id,
    cs.id,
    s.id,
    cs.sensor_uid,
    COALESCE(cs.updated_at, NOW())
FROM controller_sensors cs
LEFT JOIN sensors s
  ON s.controller_id = cs.controller_id
 AND s.hw_id = cs.sensor_uid
WHERE cs.system_sensor_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM system_sensor_assignments ssa
      WHERE ssa.controller_sensor_id = cs.id
        AND ssa.unassigned_at IS NULL
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_sensor_assignments (
    id,
    system_sensor_id,
    controller_id,
    legacy_sensor_id,
    sensor_uid,
    assigned_at
)
SELECT
    (
        substr(md5('system-sensor-assignment-legacy:' || s.id::text), 1, 8) || '-' ||
        substr(md5('system-sensor-assignment-legacy:' || s.id::text), 9, 4) || '-' ||
        substr(md5('system-sensor-assignment-legacy:' || s.id::text), 13, 4) || '-' ||
        substr(md5('system-sensor-assignment-legacy:' || s.id::text), 17, 4) || '-' ||
        substr(md5('system-sensor-assignment-legacy:' || s.id::text), 21, 12)
    )::uuid,
    s.system_sensor_id,
    s.controller_id,
    s.id,
    s.hw_id,
    COALESCE(s.last_seen, NOW())
FROM sensors s
WHERE s.system_sensor_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM system_sensor_assignments ssa
      WHERE ssa.legacy_sensor_id = s.id
        AND ssa.unassigned_at IS NULL
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_sensor_configurations (
    id,
    system_sensor_id,
    used_for,
    dashboard_view,
    config_json,
    active,
    created_at,
    updated_at
)
SELECT
    (
        substr(md5('system-sensor-config-hardware:' || ss.id::text), 1, 8) || '-' ||
        substr(md5('system-sensor-config-hardware:' || ss.id::text), 9, 4) || '-' ||
        substr(md5('system-sensor-config-hardware:' || ss.id::text), 13, 4) || '-' ||
        substr(md5('system-sensor-config-hardware:' || ss.id::text), 17, 4) || '-' ||
        substr(md5('system-sensor-config-hardware:' || ss.id::text), 21, 12)
    )::uuid,
    ss.id,
    sc.used_for,
    sc.dashboard_view,
    sc.config_json,
    true,
    sc.created_at,
    sc.updated_at
FROM system_sensors ss
JOIN controller_sensors cs ON cs.system_sensor_id = ss.id
JOIN sensor_configurations sc ON sc.sensor_id = cs.id
WHERE NOT EXISTS (
    SELECT 1
    FROM system_sensor_configurations existing
    WHERE existing.system_sensor_id = ss.id
      AND existing.active = true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_sensor_configurations (
    id,
    system_sensor_id,
    used_for,
    dashboard_view,
    config_json,
    active,
    created_at,
    updated_at
)
SELECT
    (
        substr(md5('system-sensor-config-legacy:' || ss.id::text), 1, 8) || '-' ||
        substr(md5('system-sensor-config-legacy:' || ss.id::text), 9, 4) || '-' ||
        substr(md5('system-sensor-config-legacy:' || ss.id::text), 13, 4) || '-' ||
        substr(md5('system-sensor-config-legacy:' || ss.id::text), 17, 4) || '-' ||
        substr(md5('system-sensor-config-legacy:' || ss.id::text), 21, 12)
    )::uuid,
    ss.id,
    s.purpose,
    NULL,
    sc.config_json,
    true,
    sc.created_at,
    sc.created_at
FROM system_sensors ss
JOIN sensors s ON s.system_sensor_id = ss.id
JOIN sensor_configs sc ON sc.sensor_id = s.id AND sc.active = true
WHERE NOT EXISTS (
    SELECT 1
    FROM system_sensor_configurations existing
    WHERE existing.system_sensor_id = ss.id
      AND existing.active = true
)
ON CONFLICT (id) DO NOTHING;

UPDATE system_sensors ss
SET configured = true,
    updated_at = NOW()
WHERE EXISTS (
    SELECT 1
    FROM system_sensor_configurations ssc
    WHERE ssc.system_sensor_id = ss.id
      AND ssc.active = true
)
  AND configured = false;

UPDATE sensor_readings sr
SET system_sensor_id = s.system_sensor_id
FROM sensors s
WHERE sr.sensor_id = s.id
  AND sr.system_sensor_id IS NULL
  AND s.system_sensor_id IS NOT NULL;

UPDATE alerts a
SET system_id = ss.system_id,
    system_sensor_id = ss.id
FROM sensors sensor
LEFT JOIN system_sensors ss ON ss.id = sensor.system_sensor_id
LEFT JOIN systems s ON s.id = ss.system_id
WHERE a.sensor_id = sensor.id
  AND (a.system_id IS NULL OR a.system_sensor_id IS NULL);
