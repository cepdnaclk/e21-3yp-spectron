DO $$
BEGIN
    IF to_regclass('public.system_sensors') IS NOT NULL THEN
        ALTER TABLE system_sensors DROP CONSTRAINT IF EXISTS system_sensors_type_check;
        ALTER TABLE system_sensors ADD CONSTRAINT system_sensors_type_check CHECK (type IN (
          'load','temperature_humidity','ultrasonic','gas','weight','temperature','humidity','pressure','bme280','bmp280','vl53l0x','distance',
          'soil_moisture','light','rainfall','ph','conductivity'
        ));
    END IF;
END $$;
