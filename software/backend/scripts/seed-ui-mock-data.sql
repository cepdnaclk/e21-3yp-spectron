-- Local UI seed data for SPECTRON AgriAssist.
-- Safe to rerun. Targets the local customer account test1@spectron.com.

BEGIN;

DO $$
DECLARE
  owner_user_id uuid;
  owner_account_id uuid;

  farm_north uuid := 'a1111111-1111-4111-8111-111111111111';
  farm_green uuid := 'a2222222-2222-4222-8222-222222222222';

  field_paddy uuid := 'b1111111-1111-4111-8111-111111111111';
  field_veg uuid := 'b2222222-2222-4222-8222-222222222222';
  field_chilli uuid := 'b3333333-3333-4333-8333-333333333333';

  controller_north uuid := 'c1111111-1111-4111-8111-111111111111';
  controller_green uuid := 'c2222222-2222-4222-8222-222222222222';
  controller_backup uuid := 'c3333333-3333-4333-8333-333333333333';

  gateway_north uuid := 'd1111111-1111-4111-8111-111111111111';
  gateway_green uuid := 'd2222222-2222-4222-8222-222222222222';
  gateway_backup uuid := 'd3333333-3333-4333-8333-333333333333';

  base_paddy uuid := 'e1111111-1111-4111-8111-111111111111';
  base_veg uuid := 'e2222222-2222-4222-8222-222222222222';
  base_chilli uuid := 'e3333333-3333-4333-8333-333333333333';
  base_nursery uuid := 'e4444444-4444-4444-8444-444444444444';

  module_paddy uuid := 'f1111111-1111-4111-8111-111111111111';
  module_veg uuid := 'f2222222-2222-4222-8222-222222222222';
  module_chilli uuid := 'f3333333-3333-4333-8333-333333333333';
  module_nursery uuid := 'f4444444-4444-4444-8444-444444444444';

  sensor_paddy_temp uuid := '91111111-1111-4111-8111-111111111111';
  sensor_paddy_humidity uuid := '91211111-1111-4111-8111-111111111111';
  sensor_veg_moisture uuid := '92222222-2222-4222-8222-222222222222';
  sensor_chilli_temp uuid := '93333333-3333-4333-8333-333333333333';
  sensor_nursery_level uuid := '94444444-4444-4444-8444-444444444444';

  channel_paddy_temp uuid := '81111111-1111-4111-8111-111111111111';
  channel_paddy_humidity uuid := '81211111-1111-4111-8111-111111111111';
  channel_veg_moisture uuid := '82222222-2222-4222-8222-222222222222';
  channel_chilli_temp uuid := '83333333-3333-4333-8333-333333333333';
  channel_nursery_level uuid := '84444444-4444-4444-8444-444444444444';
BEGIN
  SELECT u.id, am.account_id
  INTO owner_user_id, owner_account_id
  FROM users u
  JOIN account_memberships am ON am.user_id = u.id
  WHERE u.email = 'test1@spectron.com'
    AND u.account_type = 'USER'
    AND u.status = 'ACTIVE'
  LIMIT 1;

  IF owner_user_id IS NULL OR owner_account_id IS NULL THEN
    RAISE EXCEPTION 'Active customer user test1@spectron.com was not found';
  END IF;

  INSERT INTO farms (
    id, name, latitude, longitude, area, created_by_user_id, created_at, updated_at,
    location_accuracy_m, location_label, location_source
  )
  VALUES
    (farm_north, 'North Paddy Farm', 9.6824, 80.0221, 4.8, owner_user_id, NOW() - INTERVAL '12 days', NOW(),
     18, 'Thirunelveli, Jaffna', 'place_search'),
    (farm_green, 'Green Valley Vegetable Farm', 9.6598, 80.0146, 2.6, owner_user_id, NOW() - INTERVAL '9 days', NOW(),
     24, 'Nallur, Jaffna', 'map_pin')
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      area = EXCLUDED.area,
      location_accuracy_m = EXCLUDED.location_accuracy_m,
      location_label = EXCLUDED.location_label,
      location_source = EXCLUDED.location_source,
      updated_at = NOW(),
      archived_at = NULL;

  INSERT INTO farm_access (farm_id, user_id, role, invited_by_user_id, added_at, revoked_at)
  VALUES
    (farm_north, owner_user_id, 'owner', owner_user_id, NOW() - INTERVAL '12 days', NULL),
    (farm_green, owner_user_id, 'owner', owner_user_id, NOW() - INTERVAL '9 days', NULL)
  ON CONFLICT (farm_id, user_id) DO UPDATE
  SET role = EXCLUDED.role,
      invited_by_user_id = EXCLUDED.invited_by_user_id,
      revoked_at = NULL;

  INSERT INTO fields (id, farm_id, name, latitude, longitude, area, boundary_json, created_at, updated_at)
  VALUES
    (field_paddy, farm_north, 'Paddy Block A', 9.6830, 80.0218, 2.4, NULL, NOW() - INTERVAL '11 days', NOW()),
    (field_veg, farm_north, 'Vegetable Strip', 9.6816, 80.0230, 1.1, NULL, NOW() - INTERVAL '10 days', NOW()),
    (field_chilli, farm_green, 'Chilli Plot', 9.6592, 80.0150, 1.5, NULL, NOW() - INTERVAL '8 days', NOW())
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      area = EXCLUDED.area,
      updated_at = NOW(),
      archived_at = NULL;

  INSERT INTO controllers (
    id, account_id, hw_id, name, purpose, location, qr_code, status, last_seen, created_at,
    environment_type, indoor_outdoor, min_reporting_interval_sec, supports_adaptive_sampling,
    supports_local_alerts, offline_buffer_capacity, capability_profile_json, controller_uid,
    owner_user_id, updated_at, owner_account_id, registered_by_account_id, claim_status, operational_status
  )
  VALUES
    (controller_north, owner_account_id, 'SPC-MOCK-JFN-001', 'North Field Controller', 'Farm monitoring',
     'North Paddy Farm', 'SPC-MOCK-JFN-001', 'ONLINE', NOW() - INTERVAL '2 minutes', NOW() - INTERVAL '12 days',
     'farm', 'outdoor', 300, true, true, 720, '{"mock": true, "connectivity": "wifi"}'::jsonb,
     'SPC-MOCK-JFN-001', owner_user_id, NOW(), owner_account_id, owner_account_id, 'CLAIMED', 'ONLINE'),
    (controller_green, owner_account_id, 'SPC-MOCK-JFN-002', 'Green Valley Controller', 'Vegetable monitoring',
     'Green Valley Vegetable Farm', 'SPC-MOCK-JFN-002', 'ONLINE', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '9 days',
     'farm', 'outdoor', 300, true, true, 720, '{"mock": true, "connectivity": "wifi"}'::jsonb,
     'SPC-MOCK-JFN-002', owner_user_id, NOW(), owner_account_id, owner_account_id, 'CLAIMED', 'ONLINE'),
    (controller_backup, owner_account_id, 'SPC-MOCK-JFN-003', 'Backup Controller', 'Nursery backup monitoring',
     'Green Valley Nursery', 'SPC-MOCK-JFN-003', 'OFFLINE', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '7 days',
     'farm', 'outdoor', 600, true, true, 720, '{"mock": true, "connectivity": "wifi"}'::jsonb,
     'SPC-MOCK-JFN-003', owner_user_id, NOW(), owner_account_id, owner_account_id, 'CLAIMED', 'OFFLINE')
  ON CONFLICT (hw_id) DO UPDATE
  SET account_id = EXCLUDED.account_id,
      name = EXCLUDED.name,
      purpose = EXCLUDED.purpose,
      location = EXCLUDED.location,
      status = EXCLUDED.status,
      last_seen = EXCLUDED.last_seen,
      owner_user_id = EXCLUDED.owner_user_id,
      updated_at = NOW(),
      owner_account_id = EXCLUDED.owner_account_id,
      registered_by_account_id = EXCLUDED.registered_by_account_id,
      claim_status = EXCLUDED.claim_status,
      operational_status = EXCLUDED.operational_status;

  INSERT INTO gateways (
    id, farm_id, legacy_controller_id, serial_number, model, latitude, longitude,
    status, last_seen, created_at, updated_at
  )
  VALUES
    (gateway_north, farm_north, controller_north, 'SPC-MOCK-JFN-001', 'SPECTRON WiFi Controller', 9.6826, 80.0220,
     'online', NOW() - INTERVAL '2 minutes', NOW() - INTERVAL '12 days', NOW()),
    (gateway_green, farm_green, controller_green, 'SPC-MOCK-JFN-002', 'SPECTRON WiFi Controller', 9.6598, 80.0147,
     'online', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '9 days', NOW()),
    (gateway_backup, farm_green, controller_backup, 'SPC-MOCK-JFN-003', 'SPECTRON WiFi Controller', 9.6605, 80.0138,
     'offline', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '7 days', NOW())
  ON CONFLICT (serial_number) DO UPDATE
  SET farm_id = EXCLUDED.farm_id,
      legacy_controller_id = EXCLUDED.legacy_controller_id,
      model = EXCLUDED.model,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      status = EXCLUDED.status,
      last_seen = EXCLUDED.last_seen,
      updated_at = NOW();

  INSERT INTO sensor_bases (id, gateway_id, serial_number, label, status, last_seen, created_at, updated_at)
  VALUES
    (base_paddy, gateway_north, 'BASE-JFN-PADDY-A', 'Paddy edge base', 'live', NOW() - INTERVAL '3 minutes', NOW() - INTERVAL '11 days', NOW()),
    (base_veg, gateway_north, 'BASE-JFN-VEG-A', 'Vegetable strip base', 'live', NOW() - INTERVAL '4 minutes', NOW() - INTERVAL '10 days', NOW()),
    (base_chilli, gateway_green, 'BASE-JFN-CHILLI-A', 'Chilli plot base', 'live', NOW() - INTERVAL '6 minutes', NOW() - INTERVAL '8 days', NOW()),
    (base_nursery, gateway_backup, 'BASE-JFN-NURSERY-A', 'Nursery backup base', 'offline', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '7 days', NOW())
  ON CONFLICT (serial_number) DO UPDATE
  SET gateway_id = EXCLUDED.gateway_id,
      label = EXCLUDED.label,
      status = EXCLUDED.status,
      last_seen = EXCLUDED.last_seen,
      updated_at = NOW();

  UPDATE sensor_base_assignments
  SET unassigned_at = NOW()
  WHERE base_id IN (base_paddy, base_veg, base_chilli, base_nursery)
    AND unassigned_at IS NULL;

  INSERT INTO sensor_base_assignments (
    id, base_id, field_id, monitoring_zone, assigned_at, unassigned_at, assigned_by_user_id
  )
  VALUES
    ('a9111111-1111-4111-8111-111111111111', base_paddy, field_paddy, NULL, NOW() - INTERVAL '11 days', NULL, owner_user_id),
    ('a9222222-2222-4222-8222-222222222222', base_veg, field_veg, NULL, NOW() - INTERVAL '10 days', NULL, owner_user_id),
    ('a9333333-3333-4333-8333-333333333333', base_chilli, field_chilli, NULL, NOW() - INTERVAL '8 days', NULL, owner_user_id),
    ('a9444444-4444-4444-8444-444444444444', base_nursery, NULL, 'Nursery water tank', NOW() - INTERVAL '7 days', NULL, owner_user_id)
  ON CONFLICT (id) DO UPDATE
  SET field_id = EXCLUDED.field_id,
      monitoring_zone = EXCLUDED.monitoring_zone,
      unassigned_at = NULL,
      assigned_by_user_id = EXCLUDED.assigned_by_user_id;

  INSERT INTO sensor_modules (id, base_id, slot_number, model, status, created_at, updated_at)
  VALUES
    (module_paddy, base_paddy, 1, 'SHT30 Climate Module', 'live', NOW() - INTERVAL '11 days', NOW()),
    (module_veg, base_veg, 1, 'Soil Moisture Module', 'live', NOW() - INTERVAL '10 days', NOW()),
    (module_chilli, base_chilli, 1, 'SHT30 Climate Module', 'live', NOW() - INTERVAL '8 days', NOW()),
    (module_nursery, base_nursery, 1, 'Water Level Module', 'offline', NOW() - INTERVAL '7 days', NOW())
  ON CONFLICT (base_id, slot_number) DO UPDATE
  SET model = EXCLUDED.model,
      status = EXCLUDED.status,
      updated_at = NOW();

  INSERT INTO sensor_channels (
    id, module_id, channel_key, measurement_type, unit, calibration_json, created_at, updated_at
  )
  VALUES
    (channel_paddy_temp, module_paddy, 'temperature', 'temperature', 'C', '{}'::jsonb, NOW() - INTERVAL '11 days', NOW()),
    (channel_paddy_humidity, module_paddy, 'humidity', 'humidity', '%', '{}'::jsonb, NOW() - INTERVAL '11 days', NOW()),
    (channel_veg_moisture, module_veg, 'soil_moisture', 'soil_moisture', '%', '{}'::jsonb, NOW() - INTERVAL '10 days', NOW()),
    (channel_chilli_temp, module_chilli, 'temperature', 'temperature', 'C', '{}'::jsonb, NOW() - INTERVAL '8 days', NOW()),
    (channel_nursery_level, module_nursery, 'water_level', 'water_level', '%', '{}'::jsonb, NOW() - INTERVAL '7 days', NOW())
  ON CONFLICT (module_id, channel_key) DO UPDATE
  SET measurement_type = EXCLUDED.measurement_type,
      unit = EXCLUDED.unit,
      calibration_json = EXCLUDED.calibration_json,
      updated_at = NOW();

  INSERT INTO sensors (id, controller_id, hw_id, type, name, purpose, unit, status, last_seen, context_json)
  VALUES
    (sensor_paddy_temp, controller_north, 'BASE-JFN-PADDY-A:temperature', 'temperature', 'Paddy Temperature', 'Climate monitoring', 'C', 'OK', NOW() - INTERVAL '3 minutes', '{"mock": true}'::jsonb),
    (sensor_paddy_humidity, controller_north, 'BASE-JFN-PADDY-A:humidity', 'humidity', 'Paddy Humidity', 'Climate monitoring', '%', 'OK', NOW() - INTERVAL '3 minutes', '{"mock": true}'::jsonb),
    (sensor_veg_moisture, controller_north, 'BASE-JFN-VEG-A:soil_moisture', 'soil_moisture', 'Vegetable Soil Moisture', 'Irrigation monitoring', '%', 'OK', NOW() - INTERVAL '4 minutes', '{"mock": true}'::jsonb),
    (sensor_chilli_temp, controller_green, 'BASE-JFN-CHILLI-A:temperature', 'temperature', 'Chilli Plot Temperature', 'Climate monitoring', 'C', 'OK', NOW() - INTERVAL '6 minutes', '{"mock": true}'::jsonb),
    (sensor_nursery_level, controller_backup, 'BASE-JFN-NURSERY-A:water_level', 'distance', 'Nursery Tank Level', 'Water level monitoring', '%', 'WARN', NOW() - INTERVAL '2 hours', '{"mock": true}'::jsonb)
  ON CONFLICT (controller_id, hw_id) DO UPDATE
  SET type = EXCLUDED.type,
      name = EXCLUDED.name,
      purpose = EXCLUDED.purpose,
      unit = EXCLUDED.unit,
      status = EXCLUDED.status,
      last_seen = EXCLUDED.last_seen,
      context_json = EXCLUDED.context_json;

  INSERT INTO sensor_readings (time, sensor_id, sensor_channel_id, value, meta)
  SELECT
    NOW() - (reading_index * INTERVAL '15 minutes'),
    sensor_id,
    channel_id,
    value,
    meta
  FROM (
    SELECT
      gs AS reading_index,
      sensor_paddy_temp AS sensor_id,
      channel_paddy_temp AS channel_id,
      27.5 + sin(gs / 3.0) * 1.2 AS value,
      jsonb_build_object('mock', true, 'farm_id', farm_north, 'field_id', field_paddy, 'metric', 'temperature') AS meta
    FROM generate_series(0, 47) AS gs
    UNION ALL
    SELECT
      gs,
      sensor_paddy_humidity,
      channel_paddy_humidity,
      72 + cos(gs / 4.0) * 5,
      jsonb_build_object('mock', true, 'farm_id', farm_north, 'field_id', field_paddy, 'metric', 'humidity')
    FROM generate_series(0, 47) AS gs
    UNION ALL
    SELECT
      gs,
      sensor_veg_moisture,
      channel_veg_moisture,
      48 + sin(gs / 5.0) * 8,
      jsonb_build_object('mock', true, 'farm_id', farm_north, 'field_id', field_veg, 'metric', 'soil_moisture')
    FROM generate_series(0, 47) AS gs
    UNION ALL
    SELECT
      gs,
      sensor_chilli_temp,
      channel_chilli_temp,
      30 + sin(gs / 4.0) * 1.6,
      jsonb_build_object('mock', true, 'farm_id', farm_green, 'field_id', field_chilli, 'metric', 'temperature')
    FROM generate_series(0, 47) AS gs
    UNION ALL
    SELECT
      gs,
      sensor_nursery_level,
      channel_nursery_level,
      39 + cos(gs / 6.0) * 7,
      jsonb_build_object('mock', true, 'farm_id', farm_green, 'metric', 'water_level')
    FROM generate_series(0, 47) AS gs
  ) readings
  ON CONFLICT (time, sensor_id) DO UPDATE
  SET sensor_channel_id = EXCLUDED.sensor_channel_id,
      value = EXCLUDED.value,
      meta = EXCLUDED.meta;

  INSERT INTO alerts (
    id, account_id, controller_id, sensor_id, type, severity, message, created_at,
    acknowledged_at, state, first_triggered_at, last_triggered_at, farm_id, field_id,
    gateway_id, sensor_base_id, status
  )
  VALUES
    ('77111111-1111-4111-8111-111111111111', owner_account_id, controller_green, sensor_chilli_temp,
     'THRESHOLD_BREACH', 'WARN', 'Chilli Plot Temperature is higher than the preferred range.',
     NOW() - INTERVAL '35 minutes', NULL, 'open', NOW() - INTERVAL '35 minutes', NOW() - INTERVAL '35 minutes',
     farm_green, field_chilli, gateway_green, base_chilli, 'open'),
    ('77222222-2222-4222-8222-222222222222', owner_account_id, controller_backup, sensor_nursery_level,
     'OFFLINE', 'INFO', 'Nursery backup base has not sent a recent update.',
     NOW() - INTERVAL '2 hours', NULL, 'open', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours',
     farm_green, NULL, gateway_backup, base_nursery, 'open')
  ON CONFLICT (id) DO UPDATE
  SET message = EXCLUDED.message,
      severity = EXCLUDED.severity,
      created_at = EXCLUDED.created_at,
      acknowledged_at = NULL,
      state = EXCLUDED.state,
      first_triggered_at = EXCLUDED.first_triggered_at,
      last_triggered_at = EXCLUDED.last_triggered_at,
      farm_id = EXCLUDED.farm_id,
      field_id = EXCLUDED.field_id,
      gateway_id = EXCLUDED.gateway_id,
      sensor_base_id = EXCLUDED.sensor_base_id,
      status = EXCLUDED.status;
END $$;

COMMIT;
