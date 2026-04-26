-- Hardware QR pairing, discovered sensor persistence, and sensor configuration storage.

ALTER TABLE IF EXISTS controllers
    ADD COLUMN IF NOT EXISTS controller_uid TEXT,
    ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE controllers
SET controller_uid = hw_id
WHERE controller_uid IS NULL OR controller_uid = '';

ALTER TABLE IF EXISTS controllers
    ALTER COLUMN controller_uid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_controllers_controller_uid_upper
    ON controllers (UPPER(controller_uid));

CREATE INDEX IF NOT EXISTS idx_controllers_owner_user_id
    ON controllers(owner_user_id);

CREATE TABLE IF NOT EXISTS controller_pairing_tokens (
    id UUID PRIMARY KEY,
    controller_id UUID NOT NULL REFERENCES controllers(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_controller_pairing_tokens_controller_id
    ON controller_pairing_tokens(controller_id);

CREATE INDEX IF NOT EXISTS idx_controller_pairing_tokens_token_hash
    ON controller_pairing_tokens(token_hash);

CREATE TABLE IF NOT EXISTS controller_sensors (
    id UUID PRIMARY KEY,
    sensor_uid TEXT UNIQUE NOT NULL,
    controller_id UUID NOT NULL REFERENCES controllers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN (
        'load',
        'temperature_humidity',
        'ultrasonic',
        'gas',
        'weight',
        'temperature',
        'humidity'
    )),
    status TEXT NOT NULL DEFAULT 'live',
    configured BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_controller_sensors_controller_id
    ON controller_sensors(controller_id);

CREATE TABLE IF NOT EXISTS sensor_configurations (
    id UUID PRIMARY KEY,
    sensor_id UUID NOT NULL REFERENCES controller_sensors(id) ON DELETE CASCADE,
    controller_id UUID NOT NULL REFERENCES controllers(id) ON DELETE CASCADE,
    used_for TEXT,
    dashboard_view TEXT,
    config_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_sensor_configurations_sensor_id UNIQUE (sensor_id)
);

CREATE INDEX IF NOT EXISTS idx_sensor_configurations_controller_id
    ON sensor_configurations(controller_id);
