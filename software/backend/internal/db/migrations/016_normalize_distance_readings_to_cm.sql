-- VL53L0X hardware reports millimeters while application distance settings use centimeters.
-- Normalize existing retained readings once and mark them to prevent ambiguous mixed-unit history.

UPDATE sensor_readings sr
SET value = sr.value / 10.0,
    meta = COALESCE(sr.meta, '{}'::jsonb) || jsonb_build_object(
        'raw_value', sr.value,
        'raw_unit', 'mm',
        'normalized_unit', 'cm',
        'distance_conversion', 'mm_to_cm'
    )
FROM sensors s
WHERE sr.sensor_id = s.id
  AND LOWER(TRIM(s.type)) IN ('vl53l0x', 'distance')
  AND COALESCE(sr.meta->>'distance_conversion', '') <> 'mm_to_cm';
