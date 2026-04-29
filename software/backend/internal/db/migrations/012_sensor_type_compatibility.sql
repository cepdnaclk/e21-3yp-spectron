-- Expand hardware/system sensor type constraints so existing databases
-- accept the sensor families already supported by the backend.

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    IF to_regclass('controller_sensors') IS NOT NULL THEN
        SELECT conname
        INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'controller_sensors'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE 'CHECK ((type %'
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE controller_sensors DROP CONSTRAINT %I', constraint_name);
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'controller_sensors'::regclass
              AND conname = 'controller_sensors_type_check'
        ) THEN
            ALTER TABLE controller_sensors
                ADD CONSTRAINT controller_sensors_type_check CHECK (type IN (
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
                ));
        END IF;
    END IF;
END $$;

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    IF to_regclass('system_sensors') IS NOT NULL THEN
        SELECT conname
        INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'system_sensors'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE 'CHECK ((type %'
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE system_sensors DROP CONSTRAINT %I', constraint_name);
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'system_sensors'::regclass
              AND conname = 'system_sensors_type_check'
        ) THEN
            ALTER TABLE system_sensors
                ADD CONSTRAINT system_sensors_type_check CHECK (type IN (
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
                ));
        END IF;
    END IF;
END $$;
