-- Keep only the latest 7 days of persisted sensor readings.
DELETE FROM sensor_readings
WHERE time < NOW() - INTERVAL '7 days';

CREATE INDEX IF NOT EXISTS idx_sensor_readings_time_retention
ON sensor_readings(time);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')
       AND to_regclass('timescaledb_information.hypertables') IS NOT NULL THEN
        BEGIN
            EXECUTE $retention$
                SELECT add_retention_policy('sensor_readings', INTERVAL '7 days', if_not_exists => TRUE)
            $retention$;
        EXCEPTION
            WHEN duplicate_object THEN
                NULL;
            WHEN undefined_function THEN
                NULL;
            WHEN undefined_table THEN
                NULL;
        END;
    END IF;
END $$;
