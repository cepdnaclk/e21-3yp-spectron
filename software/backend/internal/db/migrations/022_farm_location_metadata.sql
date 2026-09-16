-- Store farm location metadata selected through farmer-friendly location flows.

ALTER TABLE IF EXISTS farms
    ADD COLUMN IF NOT EXISTS location_accuracy_m DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS location_label TEXT,
    ADD COLUMN IF NOT EXISTS location_source TEXT;

ALTER TABLE IF EXISTS farms
    DROP CONSTRAINT IF EXISTS farms_location_accuracy_non_negative,
    ADD CONSTRAINT farms_location_accuracy_non_negative
        CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0);

ALTER TABLE IF EXISTS farms
    DROP CONSTRAINT IF EXISTS farms_location_source_valid,
    ADD CONSTRAINT farms_location_source_valid
        CHECK (
            location_source IS NULL
            OR location_source IN (
                'device_geolocation',
                'map_pin',
                'place_search',
                'manual_coordinates'
            )
        );
