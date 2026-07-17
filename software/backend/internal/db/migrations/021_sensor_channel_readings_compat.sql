-- Move readings toward the farm-first channel model without dropping legacy
-- sensor_id storage. Legacy reads continue to work while new farm hardware
-- readings can be tied directly to sensor_channels.

ALTER TABLE IF EXISTS sensor_readings
    ADD COLUMN IF NOT EXISTS sensor_channel_id UUID REFERENCES sensor_channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_channel_time
    ON sensor_readings(sensor_channel_id, time DESC)
    WHERE sensor_channel_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_readings_time_sensor_channel
    ON sensor_readings(time, sensor_channel_id)
    WHERE sensor_channel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sensor_readings_farm_meta_time
    ON sensor_readings ((meta->>'farm_id'), time DESC)
    WHERE meta ? 'farm_id';

CREATE INDEX IF NOT EXISTS idx_sensor_readings_field_meta_time
    ON sensor_readings ((meta->>'field_id'), time DESC)
    WHERE meta ? 'field_id';
