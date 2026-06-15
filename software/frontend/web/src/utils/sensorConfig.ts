export type ReadingFlowType = 'CONSTANT_PER_DAY' | 'TRIGGER';

export interface ThresholdRange {
  min?: number;
  max?: number;
  warning_min?: number;
  warning_max?: number;
}

export interface SensorMetric {
  key: string;
  label: string;
  unit?: string;
}

export interface SensorHardwareMetric {
  key: string;
  label: string;
  unit?: string;
  minimum_value?: number;
  maximum_value?: number;
  accuracy?: string;
  notes?: string;
}

export interface SensorDerivedMetric {
  key: string;
  label: string;
  unit?: string;
  source_metrics?: string[];
  formula?: string;
  description?: string;
}

export type PresentationProfileKey =
  | 'single_trend'
  | 'dual_climate'
  | 'level_monitoring'
  | 'counter_status'
  | 'gauge_status'
  | 'event_timeline';

export type AlertCondition = 'below' | 'above';

export type PresentationVisualizationMethod =
  | 'line_trend'
  | 'area_trend'
  | 'gauge_band'
  | 'counter_bars'
  | 'event_timeline';

export interface PresentationProfileDefinition {
  value: PresentationProfileKey;
  label: string;
  description: string;
  visualization_method: PresentationVisualizationMethod;
  visualization_label: string;
  visualization_summary: string;
  best_for: string[];
  primary_widget: string;
  secondary_widgets: string[];
  chart_style: string;
}

export interface PresentationConfigValue {
  headline_metric?: string;
  status_mode?: string;
  comparison_mode?: string;
  detail_mode?: string;
}

export interface PresentationConfigOption {
  value: string;
  label: string;
  description: string;
}

export interface PresentationConfigFieldDefinition {
  key: keyof PresentationConfigValue;
  label: string;
  description: string;
  options: PresentationConfigOption[];
}

export interface SensorAlertSetting {
  key: string;
  label: string;
  metric_key?: string;
  condition?: AlertCondition | string;
  unit?: string;
  description?: string;
  warning_threshold?: number;
  critical_threshold?: number;
}

export interface SensorAlertTemplate extends SensorAlertSetting {
  metric_key: string;
  warning_label: string;
  critical_label: string;
}

export interface DerivedMetricPurpose {
  key: string;
  label: string;
  description: string;
}

export interface ConfigurableDerivedMetric {
  key: string;
  label: string;
  unit?: string;
  description: string;
  runtime_metric_key: string;
  use_case:
    | 'generic_monitoring'
    | 'climate_monitoring'
    | 'fill_level_monitoring'
    | 'occupancy_monitoring'
    | 'attendance_monitoring'
    | 'load_monitoring'
    | 'safety_monitoring';
  recommended_profile: PresentationProfileKey;
  supported_profiles: PresentationProfileKey[];
  purposes: DerivedMetricPurpose[];
}

export type ObservableMetricAvailability = 'supported_now' | 'planned_analytics';

export interface ObservableMetricDefinition extends ConfigurableDerivedMetric {
  availability: ObservableMetricAvailability;
  source_metrics?: string[];
  formula?: string;
}

export interface SensorKnowledgeProfile {
  module_name: string;
  sensor_family: string;
  description: string;
  measures: Array<{
    label: string;
    description: string;
  }>;
  readable_ranges: SensorHardwareMetric[];
  common_use_cases: string[];
  notes?: string[];
}

const SENSOR_METRIC_MAP: Record<string, SensorMetric[]> = {
  temperature: [{ key: 'temperature', label: 'Temperature', unit: 'C' }],
  humidity: [{ key: 'humidity', label: 'Humidity', unit: '%RH' }],
  temp_humidity: [
    { key: 'temperature', label: 'Temperature', unit: 'C' },
    { key: 'humidity', label: 'Humidity', unit: '%RH' },
  ],
  temperature_humidity: [
    { key: 'temperature', label: 'Temperature', unit: 'C' },
    { key: 'humidity', label: 'Humidity', unit: '%RH' },
  ],
  dht11: [
    { key: 'temperature', label: 'Temperature', unit: 'C' },
    { key: 'humidity', label: 'Humidity', unit: '%RH' },
  ],
  dht22: [
    { key: 'temperature', label: 'Temperature', unit: 'C' },
    { key: 'humidity', label: 'Humidity', unit: '%RH' },
  ],
  bme280: [
    { key: 'temperature', label: 'Temperature', unit: 'C' },
    { key: 'pressure', label: 'Pressure', unit: 'hPa' },
  ],
  bmp280: [
    { key: 'temperature', label: 'Temperature', unit: 'C' },
    { key: 'pressure', label: 'Pressure', unit: 'hPa' },
  ],
  pressure: [{ key: 'pressure', label: 'Pressure', unit: 'hPa' }],
  vl53l0x: [{ key: 'distance', label: 'Distance', unit: 'cm' }],
  distance: [{ key: 'distance', label: 'Distance', unit: 'cm' }],
  ultrasonic: [{ key: 'fill_level', label: 'Fill Level', unit: '%' }],
  load: [{ key: 'weight', label: 'Weight', unit: 'kg' }],
  load_cell: [{ key: 'weight', label: 'Weight', unit: 'kg' }],
  gas: [{ key: 'gas_level', label: 'Gas Level', unit: 'ppm' }],
  gas_sensor: [{ key: 'gas_level', label: 'Gas Level', unit: 'ppm' }],
  air_quality: [{ key: 'aqi', label: 'Air Quality Index', unit: 'AQI' }],
};

const SENSOR_HARDWARE_METRICS: Record<string, SensorHardwareMetric[]> = {
  temperature: [
    { key: 'temperature', label: 'Temperature', unit: 'C', minimum_value: -10, maximum_value: 60 },
  ],
  humidity: [
    { key: 'humidity', label: 'Humidity', unit: '%RH', minimum_value: 0, maximum_value: 100 },
  ],
  temp_humidity: [
    {
      key: 'temperature',
      label: 'Temperature',
      unit: 'C',
      minimum_value: -40,
      maximum_value: 125,
      accuracy: '+/-0.2 C typ. from 0 C to 65 C',
    },
    {
      key: 'humidity',
      label: 'Humidity',
      unit: '%RH',
      minimum_value: 0,
      maximum_value: 100,
      accuracy: '+/-2 %RH typ.',
    },
  ],
  temperature_humidity: [
    {
      key: 'temperature',
      label: 'Temperature',
      unit: 'C',
      minimum_value: -40,
      maximum_value: 125,
      accuracy: '+/-0.2 C typ. from 0 C to 65 C',
    },
    {
      key: 'humidity',
      label: 'Humidity',
      unit: '%RH',
      minimum_value: 0,
      maximum_value: 100,
      accuracy: '+/-2 %RH typ.',
    },
  ],
  dht11: [
    { key: 'temperature', label: 'Temperature', unit: 'C', minimum_value: -10, maximum_value: 60 },
    { key: 'humidity', label: 'Humidity', unit: '%RH', minimum_value: 0, maximum_value: 100 },
  ],
  dht22: [
    { key: 'temperature', label: 'Temperature', unit: 'C', minimum_value: -10, maximum_value: 60 },
    { key: 'humidity', label: 'Humidity', unit: '%RH', minimum_value: 0, maximum_value: 100 },
  ],
  bme280: [
    {
      key: 'temperature',
      label: 'Temperature',
      unit: 'C',
      minimum_value: -40,
      maximum_value: 85,
      notes: 'Compensation temperature from the BME280 module.',
    },
    {
      key: 'pressure',
      label: 'Pressure',
      unit: 'hPa',
      minimum_value: 300,
      maximum_value: 1100,
      accuracy: '+/-0.25 % pressure sensitivity error',
    },
  ],
  bmp280: [
    {
      key: 'temperature',
      label: 'Temperature',
      unit: 'C',
      minimum_value: -40,
      maximum_value: 85,
    },
    {
      key: 'pressure',
      label: 'Pressure',
      unit: 'hPa',
      minimum_value: 300,
      maximum_value: 1100,
    },
  ],
  pressure: [
    { key: 'pressure', label: 'Pressure', unit: 'hPa', minimum_value: 300, maximum_value: 1100 },
  ],
  vl53l0x: [
    {
      key: 'distance',
      label: 'Distance',
      unit: 'cm',
      minimum_value: 0,
      maximum_value: 200,
      accuracy: '< +/-3% in high-accuracy profile',
      notes: 'Indoor white targets can typically reach 120 cm to 200 cm depending on profile.',
    },
  ],
  distance: [
    {
      key: 'distance',
      label: 'Distance',
      unit: 'cm',
      minimum_value: 0,
      maximum_value: 200,
      accuracy: '< +/-3% in high-accuracy profile',
    },
  ],
  ultrasonic: [
    {
      key: 'distance',
      label: 'Distance',
      unit: 'cm',
      minimum_value: 0,
      maximum_value: 200,
      accuracy: '< +/-3% in high-accuracy profile',
      notes: 'Backed by the VL53L0X time-of-flight distance module in the current hardware stack.',
    },
  ],
  load: [
    { key: 'weight', label: 'Weight', unit: 'kg', minimum_value: 0, maximum_value: 5000 },
  ],
  load_cell: [
    { key: 'weight', label: 'Weight', unit: 'kg', minimum_value: 0, maximum_value: 5000 },
  ],
  gas: [
    { key: 'gas_level', label: 'Gas Level', unit: 'ppm', minimum_value: 0, maximum_value: 1000 },
  ],
  gas_sensor: [
    { key: 'gas_level', label: 'Gas Level', unit: 'ppm', minimum_value: 0, maximum_value: 1000 },
  ],
  air_quality: [
    { key: 'aqi', label: 'Air Quality Index', unit: 'AQI', minimum_value: 0, maximum_value: 500 },
  ],
};

const DEFAULT_DERIVED_METRICS: SensorDerivedMetric[] = [
  {
    key: 'state_summary',
    label: 'State Summary',
    source_metrics: ['value'],
    formula: 'Latest reading interpreted against customer thresholds',
    description: 'A human-readable interpretation of the latest sensor state.',
  },
];

const CONFIGURABLE_DERIVED_METRICS: Record<string, ConfigurableDerivedMetric[]> = {
  temperature_humidity: [
    {
      key: 'temperature',
      label: 'Temperature',
      unit: 'C',
      description: 'Observe the direct ambient temperature reading from the SHT30 sensor.',
      runtime_metric_key: 'temperature',
      use_case: 'climate_monitoring',
      recommended_profile: 'dual_climate',
      supported_profiles: ['dual_climate', 'single_trend'],
      purposes: [
        {
          key: 'greenhouse_temperature_monitoring',
          label: 'Greenhouse Temperature Monitoring',
          description: 'Track crop-zone temperature for greenhouse control and review.',
        },
        {
          key: 'room_temperature_monitoring',
          label: 'Room Temperature Monitoring',
          description: 'Track indoor comfort or workspace temperature conditions.',
        },
        {
          key: 'cold_storage_temperature_monitoring',
          label: 'Cold Storage Monitoring',
          description: 'Track refrigerated or protected storage temperature conditions.',
        },
        {
          key: 'server_room_temperature_monitoring',
          label: 'Server Room / Equipment Monitoring',
          description: 'Track equipment enclosure temperature to prevent overheating.',
        },
      ],
    },
    {
      key: 'humidity',
      label: 'Humidity',
      unit: '%RH',
      description: 'Observe the direct relative humidity reading from the SHT30 sensor.',
      runtime_metric_key: 'humidity',
      use_case: 'climate_monitoring',
      recommended_profile: 'dual_climate',
      supported_profiles: ['dual_climate', 'single_trend'],
      purposes: [
        {
          key: 'greenhouse_humidity_monitoring',
          label: 'Greenhouse Humidity Monitoring',
          description: 'Track humidity around crops and irrigation schedules.',
        },
        {
          key: 'indoor_moisture_monitoring',
          label: 'Indoor Moisture Monitoring',
          description: 'Track indoor moisture, dryness, or human comfort conditions.',
        },
        {
          key: 'storage_humidity_protection',
          label: 'Storage Humidity Protection',
          description: 'Protect stored goods, electronics, or equipment from excess humidity or dryness.',
        },
        {
          key: 'museum_archive_humidity_monitoring',
          label: 'Archive / Museum Humidity Control',
          description: 'Maintain precise humidity bands for artifact, document, or specimen preservation.',
        },
      ],
    },
  ],
  temp_humidity: [],
  dht11: [],
  dht22: [],
  ultrasonic: [
    {
      key: 'distance',
      label: 'Distance',
      unit: 'cm',
      description: 'Observe the raw measured distance from the VL53L0X sensor for diagnostics or proximity monitoring.',
      runtime_metric_key: 'distance',
      use_case: 'generic_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'event_timeline'],
      purposes: [
        {
          key: 'distance_diagnostics',
          label: 'Raw Distance Diagnostics',
          description: 'Use the sensor for direct distance validation, installation testing, and debugging.',
        },
        {
          key: 'clearance_monitoring',
          label: 'Clearance or Gap Monitoring',
          description: 'Monitor free clearance distance in doorways, machinery, or structural gaps.',
        },
        {
          key: 'proximity_tracking',
          label: 'Proximity / Presence Tracking',
          description: 'Detect when objects or people come within a defined distance of the sensor.',
        },
        {
          key: 'surface_height_tracking',
          label: 'Surface Height Tracking',
          description: 'Track height changes on conveyor belts, pallets, or stacked goods.',
        },
      ],
    },
    {
      key: 'fill_level',
      label: 'Fill Level Percentage',
      unit: '%',
      description: 'Interpret raw distance as the current fill percentage of a bin, tank, or container.',
      runtime_metric_key: 'fill_level',
      use_case: 'fill_level_monitoring',
      recommended_profile: 'level_monitoring',
      supported_profiles: ['level_monitoring', 'gauge_status', 'single_trend'],
      purposes: [
        {
          key: 'smart_bin_fill_monitoring',
          label: 'Smart Bin / Waste Bin Fill Monitoring',
          description: 'Track waste bin fill level to plan pickup routes and prevent overflow.',
        },
        {
          key: 'water_tank_level_monitoring',
          label: 'Water Tank Level Monitoring',
          description: 'Track water tank level and get alerts before tanks run empty or overflow.',
        },
        {
          key: 'chemical_liquid_tank_monitoring',
          label: 'Chemical / Liquid Tank Monitoring',
          description: 'Monitor liquid levels in chemical or industrial storage tanks.',
        },
        {
          key: 'grain_silo_storage_tracking',
          label: 'Grain / Dry-Material Storage Tracking',
          description: 'Track stored material level in silos, grain stores, or feed containers.',
        },
      ],
    },
    {
      key: 'occupancy_count',
      label: 'Occupancy Count',
      unit: 'people',
      description: 'Estimate the live people count in a zone by interpreting distance-trigger events.',
      runtime_metric_key: 'occupancy_count',
      use_case: 'occupancy_monitoring',
      recommended_profile: 'counter_status',
      supported_profiles: ['counter_status', 'event_timeline', 'single_trend'],
      purposes: [
        {
          key: 'room_occupancy_estimation',
          label: 'Room / Hall Occupancy Estimation',
          description: 'Estimate how many people are currently inside a room, hall, or waiting area.',
        },
        {
          key: 'doorway_traffic_tracking',
          label: 'Doorway Entry / Exit Counting',
          description: 'Count people passing through a doorway, turnstile, or zone boundary.',
        },
        {
          key: 'queue_density_tracking',
          label: 'Queue or Service Zone Density',
          description: 'Track how crowded a queue, counter, or service zone is in real time.',
        },
        {
          key: 'lab_or_workspace_capacity',
          label: 'Lab / Workspace Capacity Monitoring',
          description: 'Ensure labs, workshops, or meeting rooms do not exceed safe capacity.',
        },
      ],
    },
  ],
  load: [
    {
      key: 'weight',
      label: 'Weight',
      unit: 'kg',
      description: 'Observe the direct measured weight as the primary customer-facing metric.',
      runtime_metric_key: 'weight',
      use_case: 'load_monitoring',
      recommended_profile: 'gauge_status',
      supported_profiles: ['gauge_status', 'single_trend'],
      purposes: [
        {
          key: 'shelf_load_monitoring',
          label: 'Shelf Load Monitoring',
          description: 'Track shelf or rack weight for safety and usage review.',
        },
        {
          key: 'payload_weight_monitoring',
          label: 'Payload Weight Monitoring',
          description: 'Track carried or loaded payload weight in operation.',
        },
        {
          key: 'container_weight_tracking',
          label: 'Container Weight Tracking',
          description: 'Track weight changes in a storage or transport container.',
        },
      ],
    },
  ],
  load_cell: [],
  gas_sensor: [
    {
      key: 'gas_level',
      label: 'Gas Level',
      unit: 'ppm',
      description: 'Observe the direct gas concentration reading as the primary customer-facing metric.',
      runtime_metric_key: 'gas_level',
      use_case: 'safety_monitoring',
      recommended_profile: 'gauge_status',
      supported_profiles: ['gauge_status', 'single_trend', 'event_timeline'],
      purposes: [
        {
          key: 'air_safety_baseline_monitoring',
          label: 'Air Safety Baseline Monitoring',
          description: 'Track background gas concentration for normal safety review.',
        },
        {
          key: 'enclosed_space_gas_monitoring',
          label: 'Enclosed Space Gas Monitoring',
          description: 'Track gas levels in enclosed or hazardous work areas.',
        },
        {
          key: 'ventilation_effectiveness_monitoring',
          label: 'Ventilation Effectiveness Monitoring',
          description: 'Track whether ventilation keeps gas concentration within safe ranges.',
        },
      ],
    },
  ],
  gas: [],
  bme280: [
    {
      key: 'temperature',
      label: 'Temperature',
      unit: 'C',
      description: 'Observe the ambient temperature reading from the GY-BME280 environmental sensor.',
      runtime_metric_key: 'temperature',
      use_case: 'climate_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'dual_climate'],
      purposes: [
        {
          key: 'outdoor_ambient_temperature_monitoring',
          label: 'Outdoor / Ambient Temperature Monitoring',
          description: 'Track outdoor or field-level temperature as part of environmental sensing.',
        },
        {
          key: 'room_temperature_monitoring',
          label: 'Room / Indoor Temperature Monitoring',
          description: 'Track indoor comfort or workspace temperature conditions.',
        },
        {
          key: 'greenhouse_temperature_monitoring',
          label: 'Greenhouse Temperature Monitoring',
          description: 'Track crop-zone temperature for greenhouse control and review.',
        },
        {
          key: 'altitude_compensation_monitoring',
          label: 'Altitude Estimation Monitoring',
          description: 'Use temperature alongside pressure to estimate altitude changes.',
        },
      ],
    },
    {
      key: 'humidity',
      label: 'Humidity',
      unit: '%RH',
      description: 'Observe the relative humidity reading from the GY-BME280 module (the BMP280 variant does not include humidity).',
      runtime_metric_key: 'humidity',
      use_case: 'climate_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'dual_climate'],
      purposes: [
        {
          key: 'outdoor_humidity_monitoring',
          label: 'Outdoor / Ambient Humidity Monitoring',
          description: 'Track outdoor relative humidity as part of environmental condition sensing.',
        },
        {
          key: 'greenhouse_humidity_monitoring',
          label: 'Greenhouse Humidity Monitoring',
          description: 'Track humidity around crops and irrigation schedules.',
        },
        {
          key: 'indoor_moisture_monitoring',
          label: 'Indoor Moisture Monitoring',
          description: 'Track indoor moisture or human comfort conditions.',
        },
      ],
    },
    {
      key: 'pressure',
      label: 'Pressure',
      unit: 'hPa',
      description: 'Observe the barometric pressure reading from the GY-BME280 sensor.',
      runtime_metric_key: 'pressure',
      use_case: 'generic_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'gauge_status'],
      purposes: [
        {
          key: 'weather_trend_monitoring',
          label: 'Weather Trend Monitoring',
          description: 'Track atmospheric pressure trends to anticipate weather changes.',
        },
        {
          key: 'altitude_estimation',
          label: 'Altitude Estimation',
          description: 'Estimate relative altitude or floor-to-floor elevation changes.',
        },
        {
          key: 'indoor_air_pressure_monitoring',
          label: 'Indoor Air Pressure Monitoring',
          description: 'Monitor indoor pressure conditions for HVAC or ventilation analysis.',
        },
      ],
    },
  ],
  bmp280: [
    {
      key: 'temperature',
      label: 'Temperature',
      unit: 'C',
      description: 'Observe the ambient temperature reading from the BMP280 sensor. Note: the BMP280 does not measure humidity — use a BME280 module if humidity is also needed.',
      runtime_metric_key: 'temperature',
      use_case: 'climate_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend'],
      purposes: [
        {
          key: 'outdoor_ambient_temperature_monitoring',
          label: 'Outdoor / Ambient Temperature Monitoring',
          description: 'Track outdoor or field-level temperature as part of environmental sensing.',
        },
        {
          key: 'room_temperature_monitoring',
          label: 'Room / Indoor Temperature Monitoring',
          description: 'Track indoor comfort or workspace temperature conditions.',
        },
        {
          key: 'altitude_compensation_monitoring',
          label: 'Altitude Compensation Monitoring',
          description: 'Use temperature alongside pressure readings for altitude estimation.',
        },
      ],
    },
    {
      key: 'pressure',
      label: 'Pressure',
      unit: 'hPa',
      description: 'Observe the barometric pressure reading from the BMP280 sensor. Note: the BMP280 does not measure humidity.',
      runtime_metric_key: 'pressure',
      use_case: 'generic_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'gauge_status'],
      purposes: [
        {
          key: 'weather_trend_monitoring',
          label: 'Weather Trend Monitoring',
          description: 'Track atmospheric pressure trends to anticipate weather changes.',
        },
        {
          key: 'altitude_estimation',
          label: 'Altitude Estimation',
          description: 'Estimate relative altitude or floor-level changes using pressure.',
        },
        {
          key: 'indoor_air_pressure_monitoring',
          label: 'Indoor Air Pressure Monitoring',
          description: 'Monitor indoor pressure for HVAC or ventilation system analysis.',
        },
      ],
    },
  ],
};

CONFIGURABLE_DERIVED_METRICS.temp_humidity = CONFIGURABLE_DERIVED_METRICS.temperature_humidity;
CONFIGURABLE_DERIVED_METRICS.humidity = CONFIGURABLE_DERIVED_METRICS.temperature_humidity;
CONFIGURABLE_DERIVED_METRICS.dht11 = CONFIGURABLE_DERIVED_METRICS.temperature_humidity;
CONFIGURABLE_DERIVED_METRICS.dht22 = CONFIGURABLE_DERIVED_METRICS.temperature_humidity;
CONFIGURABLE_DERIVED_METRICS.load_cell = CONFIGURABLE_DERIVED_METRICS.load;
CONFIGURABLE_DERIVED_METRICS.gas = CONFIGURABLE_DERIVED_METRICS.gas_sensor;
CONFIGURABLE_DERIVED_METRICS.vl53l0x = CONFIGURABLE_DERIVED_METRICS.ultrasonic;
CONFIGURABLE_DERIVED_METRICS.distance = CONFIGURABLE_DERIVED_METRICS.ultrasonic;

const SENSOR_KNOWLEDGE_PROFILES: Record<string, SensorKnowledgeProfile> = {
  temperature_humidity: {
    module_name: 'SHT30 Temperature and Humidity Sensor Module',
    sensor_family: 'Digital climate sensor (Sensirion SHT3x series)',
    description:
      'The SHT30 is the primary climate sensor in the Spectron hardware stack. It delivers high-accuracy temperature (±0.2 °C) and relative humidity (±2 %RH) readings over I²C. Both metrics are available immediately and the configuration page lets the customer choose which one to track and how to display it.',
    measures: [
      {
        label: 'Temperature',
        description: 'Ambient temperature at the installation point. Typical accuracy ±0.2 °C.',
      },
      {
        label: 'Humidity',
        description: 'Relative humidity in the surrounding air. Typical accuracy ±2 %RH.',
      },
    ],
    readable_ranges: SENSOR_HARDWARE_METRICS.temperature_humidity,
    common_use_cases: [
      'Greenhouse climate monitoring',
      'Room comfort and HVAC monitoring',
      'Cold storage condition monitoring',
      'Moisture-sensitive storage protection',
      'Server room / equipment enclosure monitoring',
    ],
    notes: [
      'Based on the SHT30-class module used in the Spectron hardware stack.',
      'Humidity response time is approximately 8 s (tau63) per the SHT3x-DIS datasheet.',
      'Temperature accuracy is ±0.2 °C typical from 0 °C to 65 °C.',
    ],
  },
  temp_humidity: {} as SensorKnowledgeProfile,
  dht11: {} as SensorKnowledgeProfile,
  dht22: {} as SensorKnowledgeProfile,
  ultrasonic: {
    module_name: 'GY-VL53L0X Time-of-Flight Distance Sensor',
    sensor_family: 'VL53L0X ToF distance sensor used as the physical source for level, presence, and traffic interpretations',
    description:
      'The app may still refer to this slot as ultrasonic for compatibility, but the current hardware bill of materials points to a VL53L0X time-of-flight distance module. Layer 2 decides whether that distance becomes fill level, occupancy estimation, doorway traffic cues, or direct distance.',
    measures: [
      {
        label: 'Distance',
        description: 'Absolute distance from the sensor face to the observed surface or subject.',
      },
    ],
    readable_ranges: SENSOR_HARDWARE_METRICS.ultrasonic,
    common_use_cases: [
      'Fill-level monitoring for bins and tanks',
      'Room occupancy estimation',
      'Doorway traffic monitoring',
      'Clearance and proximity diagnostics',
    ],
    notes: [
      'VL53L0X can measure absolute range up to 2 m.',
      'Indoor white-target performance is typically 120 cm to 200 cm depending on the profile and reflectance.',
    ],
  },
  vl53l0x: {
    module_name: 'GY-VL53L0X Time-of-Flight Distance Sensor',
    sensor_family: 'VL53L0X ToF distance sensor',
    description:
      'This module provides the raw distance reading used directly or transformed into customer-facing level, proximity, and estimated occupancy metrics.',
    measures: [
      {
        label: 'Distance',
        description: 'Absolute distance from the sensor to the target surface.',
      },
    ],
    readable_ranges: SENSOR_HARDWARE_METRICS.vl53l0x,
    common_use_cases: [
      'Distance diagnostics',
      'Level monitoring',
      'Presence, occupancy, and doorway traffic sensing',
    ],
    notes: ['High-accuracy profile is typically below +/-3% at up to 1.2 m.'],
  },
  distance: {} as SensorKnowledgeProfile,
  bme280: {
    module_name: 'GY-BME280 Combined Environmental Sensor Module',
    sensor_family: 'Temperature, humidity, and barometric pressure sensor (Bosch BME280)',
    description:
      'The GY-BME280 module measures three environmental quantities — temperature, relative humidity, and barometric pressure — from a single I²C-connected module. All three channels are available for selection in the configuration flow.',
    measures: [
      {
        label: 'Temperature',
        description: 'Ambient temperature (used directly and for pressure/humidity compensation).',
      },
      {
        label: 'Pressure',
        description: 'Absolute barometric pressure (300–1100 hPa, ±0.25 % pressure sensitivity error).',
      },
      {
        label: 'Humidity',
        description: 'Relative humidity (0–100 %RH, ±3 %RH accuracy) — available on BME280 only.',
      },
    ],
    readable_ranges: [
      ...SENSOR_HARDWARE_METRICS.bme280,
      {
        key: 'humidity',
        label: 'Humidity',
        unit: '%RH',
        minimum_value: 0,
        maximum_value: 100,
        accuracy: '+/-3 %RH',
      },
    ],
    common_use_cases: [
      'Weather and ambient condition monitoring',
      'Indoor environmental trend tracking',
      'Outdoor temperature and humidity sensing',
      'Pressure-based altitude and floor-change analysis',
    ],
    notes: [
      'Based on the GY-BME280 5 V module in the Spectron hardware list.',
      'The BMP280 is a pressure-only variant with no humidity channel — the BME280 adds humidity.',
    ],
  },
  pressure: {
    module_name: 'BME280 / BMP280 Pressure Channel',
    sensor_family: 'Barometric pressure sensing',
    description: 'Barometric pressure reading from the discovered environmental module. Note: the BMP280 variant does not include a humidity sensor, while the BME280 does.',
    measures: [
      {
        label: 'Pressure',
        description: 'Absolute atmospheric pressure for weather, altitude, or ventilation analysis.',
      },
    ],
    readable_ranges: SENSOR_HARDWARE_METRICS.pressure,
    common_use_cases: ['Weather trend monitoring', 'Indoor navigation', 'Altitude change estimation', 'HVAC and ventilation analysis'],
  },
  bmp280: {
    module_name: 'BMP280 Barometric Pressure and Temperature Sensor',
    sensor_family: 'Temperature and barometric pressure sensor (Bosch BMP280)',
    description:
      'The BMP280 measures temperature and barometric pressure only. Unlike the BME280, it does NOT include a humidity sensor. If humidity readings are needed, use a BME280 or SHT30 module instead.',
    measures: [
      {
        label: 'Temperature',
        description: 'Ambient temperature (also used for pressure compensation).',
      },
      {
        label: 'Pressure',
        description: 'Absolute barometric pressure (300–1100 hPa). No humidity channel available.',
      },
    ],
    readable_ranges: SENSOR_HARDWARE_METRICS.bmp280,
    common_use_cases: [
      'Outdoor weather trend monitoring',
      'Pressure-based altitude estimation',
      'Indoor air pressure monitoring for HVAC analysis',
    ],
    notes: [
      'The BMP280 does NOT support humidity measurement. Use a BME280 if humidity is required.',
      'Based on the BMP280 module specification; accuracy ±0.12 hPa (typical).',
    ],
  },
  load: {
    module_name: 'Project load sensing channel',
    sensor_family: 'Load / weight sensing',
    description:
      'The software supports load-based observation, but the exact load-cell module is not listed in the provided hardware image. The range below reflects the project defaults currently used in the app.',
    measures: [
      {
        label: 'Weight',
        description: 'Measured load or stored material weight.',
      },
    ],
    readable_ranges: SENSOR_HARDWARE_METRICS.load,
    common_use_cases: ['Shelf load monitoring', 'Payload monitoring', 'Container weight tracking'],
    notes: ['Update this profile with the final load-cell model once the hardware BOM is locked.'],
  },
  load_cell: {} as SensorKnowledgeProfile,
  gas_sensor: {
    module_name: 'Project gas sensing channel',
    sensor_family: 'Gas concentration sensing',
    description:
      'The software supports gas-safety observation, but the exact gas module is not listed in the provided hardware image. The range below reflects the project defaults currently used in the app.',
    measures: [
      {
        label: 'Gas Level',
        description: 'Measured gas concentration value exposed to the app.',
      },
    ],
    readable_ranges: SENSOR_HARDWARE_METRICS.gas_sensor,
    common_use_cases: [
      'Air safety baseline monitoring',
      'Enclosed-space gas monitoring',
      'Ventilation effectiveness monitoring',
    ],
    notes: ['Update this profile with the final gas-sensor model once the hardware BOM is locked.'],
  },
  gas: {} as SensorKnowledgeProfile,
};

SENSOR_KNOWLEDGE_PROFILES.temp_humidity = SENSOR_KNOWLEDGE_PROFILES.temperature_humidity;
SENSOR_KNOWLEDGE_PROFILES.humidity = SENSOR_KNOWLEDGE_PROFILES.temperature_humidity;
SENSOR_KNOWLEDGE_PROFILES.dht11 = SENSOR_KNOWLEDGE_PROFILES.temperature_humidity;
SENSOR_KNOWLEDGE_PROFILES.dht22 = SENSOR_KNOWLEDGE_PROFILES.temperature_humidity;
SENSOR_KNOWLEDGE_PROFILES.distance = SENSOR_KNOWLEDGE_PROFILES.vl53l0x;
SENSOR_KNOWLEDGE_PROFILES.load_cell = SENSOR_KNOWLEDGE_PROFILES.load;
SENSOR_KNOWLEDGE_PROFILES.gas = SENSOR_KNOWLEDGE_PROFILES.gas_sensor;

const OBSERVABLE_METRIC_CATALOG: Record<string, ObservableMetricDefinition[]> = {
  temperature_humidity: [
    {
      key: 'temperature',
      label: 'Temperature',
      unit: 'C',
      description: 'Direct ambient temperature reading from the SHT30 sensor. Accurate to ±0.2 °C.',
      runtime_metric_key: 'temperature',
      use_case: 'climate_monitoring',
      recommended_profile: 'dual_climate',
      supported_profiles: ['dual_climate', 'single_trend'],
      purposes: CONFIGURABLE_DERIVED_METRICS.temperature_humidity[0].purposes,
      availability: 'supported_now',
      source_metrics: ['temperature'],
      formula: 'Direct sensor reading',
    },
    {
      key: 'humidity',
      label: 'Humidity',
      unit: '%RH',
      description: 'Direct relative humidity reading from the SHT30 sensor. Accurate to ±2 %RH.',
      runtime_metric_key: 'humidity',
      use_case: 'climate_monitoring',
      recommended_profile: 'dual_climate',
      supported_profiles: ['dual_climate', 'single_trend'],
      purposes: CONFIGURABLE_DERIVED_METRICS.temperature_humidity[1].purposes,
      availability: 'supported_now',
      source_metrics: ['humidity'],
      formula: 'Direct sensor reading',
    },
    {
      key: 'heat_index',
      label: 'Heat Index',
      unit: 'C',
      description: 'Feels-like temperature combining both temperature and humidity into a single thermal-stress value.',
      runtime_metric_key: 'heat_index',
      use_case: 'climate_monitoring',
      recommended_profile: 'dual_climate',
      supported_profiles: ['dual_climate', 'gauge_status', 'single_trend'],
      purposes: [
        {
          key: 'human_comfort_monitoring',
          label: 'Human Comfort Monitoring',
          description: 'Track perceived heat stress for staff, workers, residents, or visitors.',
        },
        {
          key: 'greenhouse_heat_stress_monitoring',
          label: 'Greenhouse Heat Stress Monitoring',
          description: 'Track crop-zone combined stress where temperature and humidity interact.',
        },
        {
          key: 'livestock_heat_stress',
          label: 'Livestock Heat-Stress Monitoring',
          description: 'Monitor combined thermal stress in poultry houses or cattle barns.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['temperature', 'humidity'],
      formula: 'Derived from temperature and relative humidity',
    },
    {
      key: 'dew_point',
      label: 'Dew Point',
      unit: 'C',
      description: 'Condensation-risk temperature derived from temperature and humidity readings.',
      runtime_metric_key: 'dew_point',
      use_case: 'climate_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'dual_climate'],
      purposes: [
        {
          key: 'cold_room_condensation_prevention',
          label: 'Cold Room Condensation Prevention',
          description: 'Warn before moisture condenses on products, walls, or equipment surfaces.',
        },
        {
          key: 'moisture_risk_monitoring',
          label: 'Moisture-Risk Monitoring',
          description: 'Track when air conditions are approaching the condensation point.',
        },
        {
          key: 'electronics_storage_protection',
          label: 'Electronics Storage Protection',
          description: 'Prevent condensation damage in PCB stores or equipment enclosures.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['temperature', 'humidity'],
      formula: 'Derived dew-point temperature from climate readings',
    },
    {
      key: 'temperature_spike',
      label: 'Temperature Spike',
      unit: 'C',
      description: 'Sudden upward or downward temperature change within a short observation window.',
      runtime_metric_key: 'temperature_spike',
      use_case: 'climate_monitoring',
      recommended_profile: 'event_timeline',
      supported_profiles: ['event_timeline', 'single_trend'],
      purposes: [
        {
          key: 'cold_chain_spike_detection',
          label: 'Cold-Chain Excursion Detection',
          description: 'Catch abrupt temperature excursions in refrigerated storage or transport.',
        },
        {
          key: 'equipment_overheating_detection',
          label: 'Equipment Overheating Detection',
          description: 'Spot sudden heat events near machinery, motors, or electrical panels.',
        },
        {
          key: 'climate_instability_tracking',
          label: 'Climate Instability Tracking',
          description: 'Track fast temperature swings rather than the steady baseline value.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['temperature'],
      formula: 'Temperature delta over a short observation window',
    },
    {
      key: 'humidity_spike',
      label: 'Humidity Spike',
      unit: '%RH',
      description: 'Sudden humidity change indicating an unexpected moisture event or system fault.',
      runtime_metric_key: 'humidity_spike',
      use_case: 'climate_monitoring',
      recommended_profile: 'event_timeline',
      supported_profiles: ['event_timeline', 'single_trend'],
      purposes: [
        {
          key: 'greenhouse_misting_anomaly_detection',
          label: 'Irrigation / Misting Anomaly Detection',
          description: 'Catch unexpected moisture jumps from irrigation, misting, or leaks.',
        },
        {
          key: 'unexpected_moisture_event_detection',
          label: 'Unexpected Moisture Event Detection',
          description: 'Track abrupt humidity surges in sensitive spaces or storage areas.',
        },
        {
          key: 'drying_process_monitoring',
          label: 'Drying Process Monitoring',
          description: 'Detect sudden humidity drops during drying, curing, or dehumidification.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['humidity'],
      formula: 'Humidity delta over a short observation window',
    },
    {
      key: 'climate_condition',
      label: 'Climate Condition',
      description: 'Summarized climate state label such as Dry, Comfortable, Humid, Hot, or Cold.',
      runtime_metric_key: 'climate_condition',
      use_case: 'climate_monitoring',
      recommended_profile: 'dual_climate',
      supported_profiles: ['dual_climate', 'gauge_status', 'single_trend'],
      purposes: [
        {
          key: 'simple_operator_dashboards',
          label: 'Simple Operator Status Dashboard',
          description: 'Summarize climate health without requiring operators to read raw numbers.',
        },
        {
          key: 'traffic_light_climate_status',
          label: 'Traffic-Light Climate Status',
          description: 'Drive clear green, amber, and red condition indicators on a dashboard.',
        },
        {
          key: 'crop_condition_summary',
          label: 'Crop Condition Summary',
          description: 'Give farmers or growers a simple good, caution, or critical crop climate label.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['temperature', 'humidity'],
      formula: 'Rule-based climate classification from direct readings and configured thresholds',
    },
  ],
  ultrasonic: [
    {
      key: 'distance',
      label: 'Distance',
      unit: 'cm',
      description: 'Raw measured distance from the VL53L0X time-of-flight sensor. Useful for diagnostics, proximity detection, and direct distance monitoring.',
      runtime_metric_key: 'distance',
      use_case: 'generic_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'event_timeline'],
      purposes: CONFIGURABLE_DERIVED_METRICS.ultrasonic[0].purposes,
      availability: 'supported_now',
      source_metrics: ['distance'],
      formula: 'Direct sensor reading',
    },
    {
      key: 'fill_level',
      label: 'Fill Level',
      unit: '%',
      description: 'Container or bin fill percentage derived from the measured distance. Requires the container depth to be configured.',
      runtime_metric_key: 'fill_level',
      use_case: 'fill_level_monitoring',
      recommended_profile: 'level_monitoring',
      supported_profiles: ['level_monitoring', 'gauge_status', 'single_trend'],
      purposes: CONFIGURABLE_DERIVED_METRICS.ultrasonic[1].purposes,
      availability: 'supported_now',
      source_metrics: ['distance'],
      formula: 'Distance normalized between the empty and full calibration depth',
    },
    {
      key: 'occupancy_count',
      label: 'Occupancy Count',
      unit: 'people',
      description: 'Live people count inside the monitored zone, inferred from distance-trigger crossing events.',
      runtime_metric_key: 'occupancy_count',
      use_case: 'occupancy_monitoring',
      recommended_profile: 'counter_status',
      supported_profiles: ['counter_status', 'event_timeline', 'single_trend'],
      purposes: CONFIGURABLE_DERIVED_METRICS.ultrasonic[2].purposes,
      availability: 'supported_now',
      source_metrics: ['distance'],
      formula: 'Distance-trigger events converted into a live occupancy count',
    },
    {
      key: 'attendance_count',
      label: 'Attendance Count',
      unit: 'people',
      description: 'Session presence count accumulated from distance-trigger events during a defined session window.',
      runtime_metric_key: 'attendance_count',
      use_case: 'attendance_monitoring',
      recommended_profile: 'counter_status',
      supported_profiles: ['counter_status', 'event_timeline', 'single_trend'],
      purposes: [
        {
          key: 'classroom_attendance_tracking',
          label: 'Classroom / Lecture Attendance',
          description: 'Count students or participants entering a classroom, lecture hall, or lab.',
        },
        {
          key: 'event_attendance_monitoring',
          label: 'Event / Meeting Attendance',
          description: 'Track attendee presence for halls, boardrooms, or scheduled sessions.',
        },
        {
          key: 'library_visitor_counting',
          label: 'Library / Study Room Visitor Counting',
          description: 'Count visitors entering study spaces, reading rooms, or resource areas.',
        },
        {
          key: 'workshop_session_tracking',
          label: 'Workshop / Lab Session Tracking',
          description: 'Track presence during timed lab or workshop sessions for usage review.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['distance'],
      formula: 'Distance-trigger entry events accumulated into session attendance counts',
    },
    {
      key: 'fill_rate',
      label: 'Fill Rate',
      unit: '%/day',
      description: 'Rate at which a container is filling or emptying over time.',
      runtime_metric_key: 'fill_rate',
      use_case: 'fill_level_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'event_timeline'],
      purposes: [
        {
          key: 'bin_collection_planning',
          label: 'Bin Collection Planning',
          description: 'Predict when a waste bin will be full so pickup can be scheduled efficiently.',
        },
        {
          key: 'tank_consumption_forecasting',
          label: 'Tank Consumption Forecasting',
          description: 'Track how quickly water or liquid is being consumed or refilled.',
        },
        {
          key: 'inventory_depletion_tracking',
          label: 'Inventory Depletion Tracking',
          description: 'Track how fast stored dry material is being consumed from a bin or silo.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['fill_level'],
      formula: 'Fill-level change computed over time',
    },
    {
      key: 'remaining_capacity_percent',
      label: 'Remaining Capacity',
      unit: '%',
      description: 'Unused storage or container capacity derived from the current fill level reading.',
      runtime_metric_key: 'remaining_capacity_percent',
      use_case: 'fill_level_monitoring',
      recommended_profile: 'gauge_status',
      supported_profiles: ['gauge_status', 'level_monitoring'],
      purposes: [
        {
          key: 'storage_planning',
          label: 'Storage Planning',
          description: 'Show how much free capacity remains before a refill or service pickup is needed.',
        },
        {
          key: 'tank_reserve_monitoring',
          label: 'Tank Reserve Monitoring',
          description: 'Monitor remaining water or liquid reserve before the tank runs low.',
        },
        {
          key: 'bin_service_scheduling',
          label: 'Bin / Container Service Scheduling',
          description: 'Use remaining capacity to plan collection routes and avoid overflow.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['fill_level'],
      formula: '100 minus current fill level percentage',
    },
    {
      key: 'occupancy_spike',
      label: 'Occupancy Spike',
      unit: 'people',
      description: 'Sudden rapid increase in the people count inside the observed zone.',
      runtime_metric_key: 'occupancy_spike',
      use_case: 'occupancy_monitoring',
      recommended_profile: 'event_timeline',
      supported_profiles: ['event_timeline', 'counter_status'],
      purposes: [
        {
          key: 'crowd_surge_detection',
          label: 'Crowd Surge Detection',
          description: 'Detect sudden rush events in public spaces, halls, or service areas.',
        },
        {
          key: 'entrance_rush_monitoring',
          label: 'Entrance Rush Monitoring',
          description: 'Track abrupt occupancy jumps at opening times or shift changes.',
        },
        {
          key: 'evacuation_route_monitoring',
          label: 'Evacuation Route Monitoring',
          description: 'Detect unusual movement spikes that may signal an evacuation or incident.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['occupancy_count'],
      formula: 'Occupancy count delta over a short observation window',
    },
    {
      key: 'peak_occupancy',
      label: 'Peak Occupancy',
      unit: 'people',
      description: 'Maximum occupancy observed within the current reporting window.',
      runtime_metric_key: 'peak_occupancy',
      use_case: 'occupancy_monitoring',
      recommended_profile: 'counter_status',
      supported_profiles: ['counter_status', 'single_trend'],
      purposes: [
        {
          key: 'space_utilization_reporting',
          label: 'Space Utilization Reporting',
          description: 'Report the highest occupancy level reached in a reporting period.',
        },
        {
          key: 'staffing_and_resource_decisions',
          label: 'Staffing and Resource Decisions',
          description: 'Use peak crowd data to plan staff deployment and resource allocation.',
        },
        {
          key: 'safety_capacity_compliance',
          label: 'Safety Capacity Compliance',
          description: 'Verify that peak occupancy never exceeds the safe building capacity limit.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['occupancy_count'],
      formula: 'Maximum observed occupancy count within a time window',
    },
  ],
  load: [
    {
      key: 'weight',
      label: 'Weight',
      unit: 'kg',
      description: 'Direct measured load or stored material weight.',
      runtime_metric_key: 'weight',
      use_case: 'load_monitoring',
      recommended_profile: 'gauge_status',
      supported_profiles: ['gauge_status', 'single_trend'],
      purposes: CONFIGURABLE_DERIVED_METRICS.load[0].purposes,
      availability: 'supported_now',
      source_metrics: ['weight'],
      formula: 'Direct sensor reading',
    },
    {
      key: 'utilization_percent',
      label: 'Utilization Percentage',
      unit: '%',
      description: 'Percentage of the allowed load capacity currently being used.',
      runtime_metric_key: 'utilization_percent',
      use_case: 'load_monitoring',
      recommended_profile: 'gauge_status',
      supported_profiles: ['gauge_status', 'single_trend'],
      purposes: [
        {
          key: 'capacity_monitoring',
          label: 'Capacity Monitoring',
          description: 'Track how close the system is to its supported capacity.',
        },
        {
          key: 'overload_prevention',
          label: 'Overload Prevention',
          description: 'Watch utilization instead of raw kilograms when limits matter more than totals.',
        },
        {
          key: 'stock_bay_utilization_tracking',
          label: 'Stock Bay Utilization Tracking',
          description: 'Show storage usage as a percentage rather than raw mass.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['weight'],
      formula: 'Current weight divided by configured maximum operating load',
    },
    {
      key: 'load_change_rate',
      label: 'Load Change Rate',
      unit: 'kg/hour',
      description: 'Speed at which measured weight is increasing or decreasing.',
      runtime_metric_key: 'load_change_rate',
      use_case: 'load_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'event_timeline'],
      purposes: [
        {
          key: 'restock_behavior_monitoring',
          label: 'Restock Behavior Monitoring',
          description: 'Track whether stock or load is changing at the expected pace.',
        },
        {
          key: 'rapid_load_shift_detection',
          label: 'Rapid Load Shift Detection',
          description: 'Spot unusually fast load changes that may need intervention.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['weight'],
      formula: 'Weight delta over time',
    },
    {
      key: 'overload_risk',
      label: 'Overload Risk',
      unit: '%',
      description: 'Safety-oriented overload state or risk score derived from load.',
      runtime_metric_key: 'overload_risk',
      use_case: 'load_monitoring',
      recommended_profile: 'gauge_status',
      supported_profiles: ['gauge_status', 'event_timeline'],
      purposes: [
        {
          key: 'safety_dashboards',
          label: 'Safety Dashboards',
          description: 'Summarize whether the current load is safe, cautionary, or critical.',
        },
        {
          key: 'preventive_maintenance_alerts',
          label: 'Preventive Maintenance Alerts',
          description: 'Escalate recurring overload exposure before failure occurs.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['weight'],
      formula: 'Current load evaluated against configured heavy-load and overload bands',
    },
    {
      key: 'depletion_rate',
      label: 'Depletion Rate',
      unit: 'kg/day',
      description: 'How quickly stored weight is dropping over time.',
      runtime_metric_key: 'depletion_rate',
      use_case: 'load_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'event_timeline'],
      purposes: [
        {
          key: 'stock_forecasting',
          label: 'Stock Forecasting',
          description: 'Project how quickly inventory is being consumed.',
        },
        {
          key: 'refill_planning',
          label: 'Refill Planning',
          description: 'Plan replenishment using depletion rather than a single point-in-time weight.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['weight'],
      formula: 'Negative weight delta over time',
    },
  ],
  gas_sensor: [
    {
      key: 'gas_level',
      label: 'Gas Level',
      unit: 'ppm',
      description: 'Direct gas concentration reading.',
      runtime_metric_key: 'gas_level',
      use_case: 'safety_monitoring',
      recommended_profile: 'gauge_status',
      supported_profiles: ['gauge_status', 'single_trend', 'event_timeline'],
      purposes: CONFIGURABLE_DERIVED_METRICS.gas_sensor[0].purposes,
      availability: 'supported_now',
      source_metrics: ['gas_level'],
      formula: 'Direct sensor reading',
    },
    {
      key: 'gas_spike',
      label: 'Gas Spike',
      unit: 'ppm',
      description: 'Sudden gas increase over a short window.',
      runtime_metric_key: 'gas_spike',
      use_case: 'safety_monitoring',
      recommended_profile: 'event_timeline',
      supported_profiles: ['event_timeline', 'single_trend'],
      purposes: [
        {
          key: 'leak_detection',
          label: 'Leak Detection',
          description: 'Spot abrupt gas rises that may indicate a leak event.',
        },
        {
          key: 'abnormal_event_detection',
          label: 'Abnormal Event Detection',
          description: 'Highlight sudden safety excursions rather than the baseline concentration.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['gas_level'],
      formula: 'Gas concentration delta over a short observation window',
    },
    {
      key: 'risk_score',
      label: 'Risk Score',
      description: 'Normalized risk score derived from gas level and configured limits.',
      runtime_metric_key: 'risk_score',
      use_case: 'safety_monitoring',
      recommended_profile: 'gauge_status',
      supported_profiles: ['gauge_status', 'single_trend'],
      purposes: [
        {
          key: 'operator_safety_dashboards',
          label: 'Operator Safety Dashboards',
          description: 'Summarize raw readings into a simpler exposure or risk scale.',
        },
        {
          key: 'hazardous_zone_risk_tracking',
          label: 'Hazardous-Zone Risk Tracking',
          description: 'Track how exposure risk changes over time in sensitive zones.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['gas_level'],
      formula: 'Gas level normalized against configured warning and critical bands',
    },
    {
      key: 'exposure_state',
      label: 'Exposure State',
      description: 'Traffic-light safety state such as safe, caution, or critical.',
      runtime_metric_key: 'exposure_state',
      use_case: 'safety_monitoring',
      recommended_profile: 'gauge_status',
      supported_profiles: ['gauge_status', 'single_trend'],
      purposes: [
        {
          key: 'traffic_light_safety_displays',
          label: 'Traffic-Light Safety Displays',
          description: 'Drive simple safe, caution, and critical operator cues.',
        },
        {
          key: 'evacuation_or_ventilation_guidance',
          label: 'Evacuation or Ventilation Guidance',
          description: 'Turn raw gas data into clear action states for staff.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['risk_score'],
      formula: 'Rule-based state classification from the current risk score',
    },
    {
      key: 'unsafe_duration',
      label: 'Unsafe Duration',
      unit: 'minutes',
      description: 'How long the reading has remained above a danger boundary.',
      runtime_metric_key: 'unsafe_duration',
      use_case: 'safety_monitoring',
      recommended_profile: 'event_timeline',
      supported_profiles: ['event_timeline', 'single_trend'],
      purposes: [
        {
          key: 'compliance_monitoring',
          label: 'Compliance Monitoring',
          description: 'Track time spent above an unsafe level for policy or compliance review.',
        },
        {
          key: 'incident_review',
          label: 'Incident Review',
          description: 'Measure the duration of unsafe exposure after alarms or events.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['gas_level'],
      formula: 'Accumulated time above the configured danger threshold',
    },
  ],
  bme280: [
    {
      key: 'temperature',
      label: 'Temperature',
      unit: 'C',
      description: 'Direct ambient temperature reading from the GY-BME280 environmental module.',
      runtime_metric_key: 'temperature',
      use_case: 'climate_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'dual_climate'],
      purposes: CONFIGURABLE_DERIVED_METRICS.bme280[0].purposes,
      availability: 'supported_now',
      source_metrics: ['temperature'],
      formula: 'Direct sensor reading',
    },
    {
      key: 'humidity',
      label: 'Humidity',
      unit: '%RH',
      description: 'Direct relative humidity reading from the GY-BME280 module (±3 %RH accuracy). Note: the BMP280 variant does not include a humidity sensor.',
      runtime_metric_key: 'humidity',
      use_case: 'climate_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'dual_climate'],
      purposes: CONFIGURABLE_DERIVED_METRICS.bme280[1].purposes,
      availability: 'supported_now',
      source_metrics: ['humidity'],
      formula: 'Direct sensor reading',
    },
    {
      key: 'pressure',
      label: 'Pressure',
      unit: 'hPa',
      description: 'Direct barometric pressure reading from the GY-BME280 environmental module.',
      runtime_metric_key: 'pressure',
      use_case: 'generic_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'gauge_status'],
      purposes: CONFIGURABLE_DERIVED_METRICS.bme280[2].purposes,
      availability: 'supported_now',
      source_metrics: ['pressure'],
      formula: 'Direct sensor reading',
    },
    {
      key: 'temperature_spike',
      label: 'Temperature Spike',
      unit: 'C',
      description: 'Sudden temperature change detected over a short observation window.',
      runtime_metric_key: 'temperature_spike',
      use_case: 'climate_monitoring',
      recommended_profile: 'event_timeline',
      supported_profiles: ['event_timeline', 'single_trend'],
      purposes: [
        {
          key: 'outdoor_temperature_excursion',
          label: 'Outdoor Temperature Excursion Detection',
          description: 'Catch sudden outdoor temperature shifts from weather changes or equipment faults.',
        },
        {
          key: 'equipment_overheating_detection',
          label: 'Equipment Overheating Detection',
          description: 'Spot sudden heat events near machinery or electrical equipment.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['temperature'],
      formula: 'Temperature delta over a short observation window',
    },
    {
      key: 'dew_point',
      label: 'Dew Point',
      unit: 'C',
      description: 'Condensation-risk temperature derived from the BME280 temperature and humidity readings.',
      runtime_metric_key: 'dew_point',
      use_case: 'climate_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'dual_climate'],
      purposes: [
        {
          key: 'outdoor_condensation_risk',
          label: 'Outdoor Condensation Risk Monitoring',
          description: 'Track when outdoor conditions approach the condensation or frost point.',
        },
        {
          key: 'condensation_prevention',
          label: 'Indoor Condensation Prevention',
          description: 'Avoid condensation on products, walls, or electronic equipment.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['temperature', 'humidity'],
      formula: 'Derived dew-point temperature from BME280 temperature and humidity readings',
    },
  ],
  bmp280: [
    {
      key: 'temperature',
      label: 'Temperature',
      unit: 'C',
      description: 'Direct ambient temperature reading from the BMP280 sensor. Note: the BMP280 does not include a humidity sensor — use a BME280 module if humidity is also required.',
      runtime_metric_key: 'temperature',
      use_case: 'climate_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend'],
      purposes: CONFIGURABLE_DERIVED_METRICS.bmp280[0].purposes,
      availability: 'supported_now',
      source_metrics: ['temperature'],
      formula: 'Direct sensor reading',
    },
    {
      key: 'pressure',
      label: 'Pressure',
      unit: 'hPa',
      description: 'Direct barometric pressure reading from the BMP280 sensor. Note: the BMP280 does not include a humidity sensor.',
      runtime_metric_key: 'pressure',
      use_case: 'generic_monitoring',
      recommended_profile: 'single_trend',
      supported_profiles: ['single_trend', 'gauge_status'],
      purposes: CONFIGURABLE_DERIVED_METRICS.bmp280[1].purposes,
      availability: 'supported_now',
      source_metrics: ['pressure'],
      formula: 'Direct sensor reading',
    },
    {
      key: 'temperature_spike',
      label: 'Temperature Spike',
      unit: 'C',
      description: 'Sudden temperature change detected over a short observation window by the BMP280.',
      runtime_metric_key: 'temperature_spike',
      use_case: 'climate_monitoring',
      recommended_profile: 'event_timeline',
      supported_profiles: ['event_timeline', 'single_trend'],
      purposes: [
        {
          key: 'outdoor_temperature_excursion',
          label: 'Outdoor Temperature Excursion Detection',
          description: 'Catch sudden outdoor temperature shifts from weather changes.',
        },
        {
          key: 'equipment_thermal_event',
          label: 'Equipment Thermal Event Detection',
          description: 'Spot sudden heat events near machinery or electrical equipment.',
        },
      ],
      availability: 'supported_now',
      source_metrics: ['temperature'],
      formula: 'Temperature delta over a short observation window',
    },
  ],
};

// Temperature/Humidity sensor type aliases
OBSERVABLE_METRIC_CATALOG.temp_humidity = OBSERVABLE_METRIC_CATALOG.temperature_humidity;
OBSERVABLE_METRIC_CATALOG.humidity = OBSERVABLE_METRIC_CATALOG.temperature_humidity;
OBSERVABLE_METRIC_CATALOG.dht11 = OBSERVABLE_METRIC_CATALOG.temperature_humidity;
OBSERVABLE_METRIC_CATALOG.dht22 = OBSERVABLE_METRIC_CATALOG.temperature_humidity;
OBSERVABLE_METRIC_CATALOG.temperature_sensor = OBSERVABLE_METRIC_CATALOG.temperature_humidity;
OBSERVABLE_METRIC_CATALOG.temperature = OBSERVABLE_METRIC_CATALOG.temperature_humidity;
OBSERVABLE_METRIC_CATALOG.humidity_sensor = OBSERVABLE_METRIC_CATALOG.temperature_humidity;
OBSERVABLE_METRIC_CATALOG.sht30 = OBSERVABLE_METRIC_CATALOG.temperature_humidity;
OBSERVABLE_METRIC_CATALOG.sht31 = OBSERVABLE_METRIC_CATALOG.temperature_humidity;
OBSERVABLE_METRIC_CATALOG.sht35 = OBSERVABLE_METRIC_CATALOG.temperature_humidity;

// Load/Weight sensor type aliases
OBSERVABLE_METRIC_CATALOG.load_cell = OBSERVABLE_METRIC_CATALOG.load;
OBSERVABLE_METRIC_CATALOG.load_cell_sensor = OBSERVABLE_METRIC_CATALOG.load;
OBSERVABLE_METRIC_CATALOG.weight_sensor = OBSERVABLE_METRIC_CATALOG.load;

// Gas sensor type aliases
OBSERVABLE_METRIC_CATALOG.gas = OBSERVABLE_METRIC_CATALOG.gas_sensor;
OBSERVABLE_METRIC_CATALOG.gas_sensor_iot = OBSERVABLE_METRIC_CATALOG.gas_sensor;

// Ultrasonic sensor type aliases
OBSERVABLE_METRIC_CATALOG.ultrasonic_sensor = OBSERVABLE_METRIC_CATALOG.ultrasonic;
OBSERVABLE_METRIC_CATALOG.distance_sensor = OBSERVABLE_METRIC_CATALOG.ultrasonic;
OBSERVABLE_METRIC_CATALOG.vl53l0x = OBSERVABLE_METRIC_CATALOG.ultrasonic;
OBSERVABLE_METRIC_CATALOG.distance = OBSERVABLE_METRIC_CATALOG.ultrasonic;

const PRESENTATION_PROFILE_DEFINITIONS: Record<PresentationProfileKey, PresentationProfileDefinition> = {
  single_trend: {
    value: 'single_trend',
    label: 'Single Trend',
    description: 'Latest value with a trend line.',
    visualization_method: 'line_trend',
    visualization_label: 'Recent Value + Line Trend',
    visualization_summary: 'Best when the main question is how one metric is moving over time.',
    best_for: ['temperature', 'humidity', 'distance', 'weight', 'gas level'],
    primary_widget: 'trend',
    secondary_widgets: ['status'],
    chart_style: 'line',
  },
  dual_climate: {
    value: 'dual_climate',
    label: 'Dual Climate',
    description: 'Paired climate view.',
    visualization_method: 'area_trend',
    visualization_label: 'Dual Metric + Area Trend',
    visualization_summary: 'Best when temperature and humidity need to be read together.',
    best_for: ['climate monitoring', 'comfort tracking', 'greenhouse conditions'],
    primary_widget: 'dual_stat',
    secondary_widgets: ['trend', 'status'],
    chart_style: 'area',
  },
  level_monitoring: {
    value: 'level_monitoring',
    label: 'Level Monitoring',
    description: 'Level-first monitoring.',
    visualization_method: 'gauge_band',
    visualization_label: 'Gauge + Recent Level',
    visualization_summary: 'Best for fill percentage, remaining capacity, and service urgency.',
    best_for: ['fill level', 'remaining capacity', 'service planning'],
    primary_widget: 'gauge',
    secondary_widgets: ['trend', 'status'],
    chart_style: 'line',
  },
  counter_status: {
    value: 'counter_status',
    label: 'Counter Status',
    description: 'Count-first dashboard.',
    visualization_method: 'counter_bars',
    visualization_label: 'Live Count + Bar Trend',
    visualization_summary: 'Best for occupancy and doorway traffic views where each reading is a count.',
    best_for: ['occupancy', 'door traffic', 'live counts'],
    primary_widget: 'counter',
    secondary_widgets: ['status', 'trend'],
    chart_style: 'bar',
  },
  gauge_status: {
    value: 'gauge_status',
    label: 'Gauge Status',
    description: 'Gauge-led status view.',
    visualization_method: 'gauge_band',
    visualization_label: 'Gauge + Status Band',
    visualization_summary: 'Best for live capacity, load, or safety conditions against thresholds.',
    best_for: ['load', 'gas safety', 'capacity state'],
    primary_widget: 'gauge',
    secondary_widgets: ['status', 'trend'],
    chart_style: 'line',
  },
  event_timeline: {
    value: 'event_timeline',
    label: 'Event Timeline',
    description: 'Event-first timeline.',
    visualization_method: 'event_timeline',
    visualization_label: 'Event Timeline + Status',
    visualization_summary: 'Best when threshold crossings and incidents matter more than a smooth trend.',
    best_for: ['spikes', 'incident review', 'threshold crossings'],
    primary_widget: 'timeline',
    secondary_widgets: ['status'],
    chart_style: 'timeline',
  },
};

const presentationOption = (
  value: string,
  label: string,
  description: string
): PresentationConfigOption => ({
  value,
  label,
  description,
});

const presentationField = (
  key: keyof PresentationConfigValue,
  label: string,
  description: string,
  options: PresentationConfigOption[]
): PresentationConfigFieldDefinition => ({
  key,
  label,
  description,
  options,
});

const normalizedMetricKey = (metricKey?: string) => (metricKey || '').trim().toLowerCase();

const headlineMetricOptionsForProfile = (
  metricKey: string,
  profile: PresentationProfileKey
): PresentationConfigOption[] => {
  switch (profile) {
    case 'dual_climate':
      return [
        presentationOption('balanced', 'Balanced Climate', 'Show temperature and humidity with equal emphasis.'),
        presentationOption('temperature', 'Temperature First', 'Make temperature the lead climate metric in the view.'),
        presentationOption('humidity', 'Humidity First', 'Make humidity the lead climate metric in the view.'),
      ];
    case 'level_monitoring':
    case 'gauge_status':
      if (metricKey === 'fill_level') {
        return [
          presentationOption('fill_level', 'Fill Level', 'Lead with used capacity or fill percentage.'),
          presentationOption('remaining_capacity_percent', 'Remaining Capacity', 'Lead with the free capacity still available.'),
        ];
      }
      if (metricKey === 'weight' || metricKey === 'overload_risk') {
        return [
          presentationOption(
            metricKey === 'overload_risk' ? 'overload_risk' : 'weight',
            metricKey === 'overload_risk' ? 'Overload Risk' : 'Weight',
            metricKey === 'overload_risk'
              ? 'Lead with a safety-focused overload score.'
              : 'Lead with the current measured load.'
          ),
          presentationOption('weight', 'Weight', 'Lead with the current measured load.'),
          presentationOption('utilization_percent', 'Utilization Percentage', 'Lead with how much of the supported capacity is in use.'),
        ];
      }
      if (metricKey === 'gas_level') {
        return [
          presentationOption('gas_level', 'Gas Level', 'Lead with the current concentration value.'),
          presentationOption('risk_score', 'Risk Score', 'Lead with a normalized safety-risk scale.'),
        ];
      }
      return [
        presentationOption(metricKey || 'value', 'Primary Metric', 'Lead with the selected observed metric.'),
      ];
    case 'counter_status':
      if (metricKey === 'attendance_count') {
        return [
          presentationOption('attendance_count', 'Attendance Count', 'Lead with the live count of people present.'),
          presentationOption('attendance_gap', 'Attendance Gap', 'Lead with how far the session is from target attendance.'),
        ];
      }
      return [
        presentationOption('occupancy_count', 'Occupancy Count', 'Lead with the current live occupancy.'),
        presentationOption('peak_occupancy', 'Peak Occupancy', 'Lead with the busiest recent observed occupancy.'),
      ];
    default:
      return [
        presentationOption(metricKey || 'value', 'Primary Metric', 'Lead with the selected observed metric.'),
      ];
  }
};

const statusModeOptionsForProfile = (
  metricKey: string,
  profile: PresentationProfileKey
): PresentationConfigOption[] => {
  switch (profile) {
    case 'dual_climate':
      return [
        presentationOption('comfort_band', 'Comfort Band', 'Status reads the climate against an acceptable comfort or crop band.'),
        presentationOption('crop_band', 'Crop Band', 'Status emphasizes target-growing conditions and deviations.'),
        presentationOption('condensation_watch', 'Condensation Watch', 'Status emphasizes moisture and condensation risk.'),
      ];
    case 'level_monitoring':
      return [
        presentationOption('service_urgency', 'Service Urgency', 'Status explains when pickup, refill, or service is becoming urgent.'),
        presentationOption('capacity_state', 'Capacity State', 'Status emphasizes remaining or used storage capacity.'),
      ];
    case 'counter_status':
      if (metricKey === 'attendance_count') {
        return [
          presentationOption('attendance_target', 'Attendance Target', 'Status compares live attendance against the expected session target.'),
          presentationOption('session_presence', 'Session Presence', 'Status emphasizes whether the session is lightly, normally, or heavily attended.'),
        ];
      }
      return [
        presentationOption('crowd_state', 'Crowd State', 'Status emphasizes whether the zone is calm, busy, or crowded.'),
        presentationOption('safe_capacity', 'Safe Capacity', 'Status compares occupancy against a safe operating limit.'),
      ];
    case 'gauge_status':
      if (metricKey === 'weight' || metricKey === 'overload_risk') {
        return [
          presentationOption(
            metricKey === 'overload_risk' ? 'overload_risk' : 'capacity_load',
            metricKey === 'overload_risk' ? 'Overload Risk' : 'Capacity Load',
            metricKey === 'overload_risk'
              ? 'Status emphasizes when the current load is entering heavy-load or overload territory.'
              : 'Status emphasizes how heavy the load is relative to supported capacity.'
          ),
          presentationOption('capacity_load', 'Capacity Load', 'Status emphasizes how heavy the load is relative to supported capacity.'),
          presentationOption('overload_risk', 'Overload Risk', 'Status emphasizes safety risk instead of raw weight.'),
        ];
      }
      if (metricKey === 'gas_level') {
        return [
          presentationOption('safety_exposure', 'Safety Exposure', 'Status explains the current gas reading as an exposure condition.'),
          presentationOption('traffic_light', 'Traffic-Light State', 'Status is reduced to safe, caution, and critical cues.'),
        ];
      }
      if (metricKey === 'fill_level') {
        return [
          presentationOption('service_urgency', 'Service Urgency', 'Status emphasizes when pickup or refill is approaching.'),
          presentationOption('capacity_state', 'Capacity State', 'Status emphasizes remaining or used capacity.'),
        ];
      }
      return [
        presentationOption('threshold_band', 'Threshold Band', 'Status is based on threshold bands for the observed metric.'),
      ];
    case 'event_timeline':
      return [
        presentationOption('event_severity', 'Event Severity', 'Status emphasizes the seriousness of threshold crossings and incidents.'),
        presentationOption('threshold_crossings', 'Threshold Crossings', 'Status emphasizes when a metric moves in and out of operating bands.'),
      ];
    case 'single_trend':
    default:
      switch (metricKey) {
        case 'temperature':
          return [
            presentationOption('temperature_band', 'Temperature Band', 'Status compares current temperature against the configured operating band.'),
            presentationOption('spike_watch', 'Spike Watch', 'Status emphasizes whether temperature is rising or falling unusually fast.'),
          ];
        case 'humidity':
          return [
            presentationOption('humidity_band', 'Humidity Band', 'Status compares humidity against the configured moisture band.'),
            presentationOption('moisture_watch', 'Moisture Watch', 'Status emphasizes dryness and sudden moisture changes.'),
          ];
        case 'distance':
          return [
            presentationOption('distance_limit', 'Distance Limit', 'Status compares distance against configured distance limits.'),
            presentationOption('proximity_state', 'Proximity State', 'Status emphasizes whether the observed target is near, normal, or far.'),
          ];
        case 'weight':
          return [
            presentationOption('load_band', 'Load Band', 'Status compares the current load against the preferred band.'),
            presentationOption('capacity_load', 'Capacity Load', 'Status emphasizes supported capacity usage.'),
          ];
        case 'gas_level':
          return [
            presentationOption('safety_exposure', 'Safety Exposure', 'Status compares the gas level against safe exposure limits.'),
            presentationOption('leak_watch', 'Leak Watch', 'Status emphasizes abnormal upward gas movement and incidents.'),
          ];
        default:
          return [
            presentationOption('threshold_band', 'Threshold Band', 'Status is based on configured threshold bands.'),
          ];
      }
  }
};

const comparisonModeOptionsForProfile = (
  metricKey: string,
  profile: PresentationProfileKey
): PresentationConfigOption[] => {
  switch (profile) {
    case 'dual_climate':
      return [
        presentationOption('paired_thresholds', 'Paired Thresholds', 'Compare the paired climate readings against their operating bands together.'),
      ];
    case 'level_monitoring':
    case 'gauge_status':
      if (metricKey === 'fill_level') {
        return [
          presentationOption('used_capacity', 'Used Capacity', 'Show gauge and comparison values as occupied or filled capacity.'),
          presentationOption('remaining_capacity', 'Remaining Capacity', 'Show gauge and comparison values as free capacity left.'),
        ];
      }
      if (metricKey === 'weight' || metricKey === 'overload_risk') {
        return [
          presentationOption(
            metricKey === 'overload_risk' ? 'risk_band' : 'raw_weight',
            metricKey === 'overload_risk' ? 'Risk Band' : 'Raw Weight',
            metricKey === 'overload_risk'
              ? 'Compare the live load against the heavy-load and overload bands.'
              : 'Compare using the measured weight itself.'
          ),
          presentationOption('raw_weight', 'Raw Weight', 'Compare using the measured weight itself.'),
          presentationOption('capacity_percent', 'Capacity Percentage', 'Compare using how much of supported capacity is in use.'),
        ];
      }
      if (metricKey === 'gas_level') {
        return [
          presentationOption('ppm_band', 'PPM Band', 'Compare using the direct gas concentration bands.'),
          presentationOption('risk_band', 'Risk Band', 'Compare using a normalized risk scale derived from gas exposure.'),
        ];
      }
      return [
        presentationOption('threshold_band', 'Threshold Band', 'Compare the metric against the configured thresholds.'),
      ];
    case 'counter_status':
      if (metricKey === 'attendance_count') {
        return [
          presentationOption('target_gap', 'Target Gap', 'Compare the live count against the expected session target.'),
          presentationOption('live_count', 'Live Count', 'Compare only the live number of people currently present.'),
        ];
      }
      return [
        presentationOption('live_count', 'Live Count', 'Compare and summarize the current live occupancy.'),
        presentationOption('threshold_band', 'Threshold Band', 'Compare occupancy against configured busy and crowded bands.'),
      ];
    case 'event_timeline':
      return [
        presentationOption('event_threshold', 'Event Threshold', 'Highlight all crossing events relative to the configured band.'),
        presentationOption('critical_only', 'Critical Only', 'Reduce the view to only the most severe crossings and incidents.'),
      ];
    case 'single_trend':
    default:
      return [
        presentationOption('threshold_band', 'Threshold Band', 'Compare the current metric against the configured thresholds.'),
        presentationOption('daily_delta', 'Daily Delta', 'Compare the current reading with its recent trend direction.'),
      ];
  }
};

const detailModeOptionsForProfile = (
  metricKey: string,
  profile: PresentationProfileKey
): PresentationConfigOption[] => {
  switch (profile) {
    case 'dual_climate':
      return [
        presentationOption('paired_trends', 'Paired Trends', 'Use the supporting space to show temperature and humidity trends together.'),
        presentationOption('climate_state', 'Climate State', 'Use the supporting space to summarize climate condition states.'),
        presentationOption('daily_extremes', 'Daily Extremes', 'Use the supporting space to show recent highs and lows.'),
      ];
    case 'level_monitoring':
      return [
        presentationOption('service_focus', 'Service Focus', 'Support the gauge with service urgency and pickup context.'),
        presentationOption('historical_fill', 'Historical Fill', 'Support the gauge with how fast the level is changing.'),
      ];
    case 'counter_status':
      if (metricKey === 'attendance_count') {
        return [
          presentationOption('arrival_pattern', 'Arrival Pattern', 'Support the counter with session arrival and attendance flow.'),
          presentationOption('session_total', 'Session Total', 'Support the counter with total present versus expected target.'),
        ];
      }
      return [
        presentationOption('recent_activity', 'Recent Activity', 'Support the counter with recent occupancy changes.'),
        presentationOption('busy_periods', 'Busy Periods', 'Support the counter with the busiest observed windows.'),
      ];
    case 'gauge_status':
      if (metricKey === 'weight' || metricKey === 'overload_risk') {
        return [
          presentationOption(
            metricKey === 'overload_risk' ? 'safety_focus' : 'load_trend',
            metricKey === 'overload_risk' ? 'Safety Focus' : 'Load Trend',
            metricKey === 'overload_risk'
              ? 'Support the gauge with overload warnings and safety context.'
              : 'Support the gauge with how the load is changing over time.'
          ),
          presentationOption('load_trend', 'Load Trend', 'Support the gauge with how the load is changing over time.'),
          presentationOption('safety_focus', 'Safety Focus', 'Support the gauge with overload or capacity risk context.'),
        ];
      }
      if (metricKey === 'gas_level') {
        return [
          presentationOption('ventilation_watch', 'Ventilation Watch', 'Support the gauge with whether the area is recovering or worsening.'),
          presentationOption('incident_focus', 'Incident Focus', 'Support the gauge with recent unsafe events and escalations.'),
        ];
      }
      if (metricKey === 'fill_level') {
        return [
          presentationOption('refill_trend', 'Refill Trend', 'Support the gauge with recent fill or depletion movement.'),
          presentationOption('service_focus', 'Service Focus', 'Support the gauge with service urgency and pickup context.'),
        ];
      }
      return [
        presentationOption('trend_first', 'Trend First', 'Use the supporting space to show recent movement over time.'),
      ];
    case 'event_timeline':
      return [
        presentationOption('incident_feed', 'Incident Feed', 'Show all recent incidents and crossings in time order.'),
        presentationOption('critical_incidents', 'Critical Incidents', 'Show only the most severe incidents and escalations.'),
      ];
    case 'single_trend':
    default:
      return [
        presentationOption('trend_first', 'Trend First', 'Use the supporting space to emphasize the recent trend line.'),
        presentationOption('change_focus', 'Change Focus', 'Use the supporting space to emphasize recent movement or delta.'),
        presentationOption('range_band', 'Range Band', 'Use the supporting space to emphasize the configured operating band.'),
      ];
  }
};

const isClimateSensorType = (sensorType: string) =>
  ['temperature_humidity', 'temp_humidity', 'dht11', 'dht22'].includes(
    (sensorType || '').toLowerCase()
  );

const metricLabelOverrides: Record<string, string> = {
  temperature: 'Temperature',
  humidity: 'Humidity',
  temperature_spike: 'Temperature Spike',
  humidity_spike: 'Humidity Spike',
  heat_index: 'Heat Index',
  dew_point: 'Dew Point',
  climate_condition: 'Climate Condition',
  distance: 'Distance',
  fill_level: 'Fill Level Percentage',
  fill_rate: 'Fill Rate',
  remaining_capacity_percent: 'Remaining Capacity',
  occupancy_count: 'Occupancy Count',
  occupancy_spike: 'Occupancy Spike',
  peak_occupancy: 'Peak Occupancy',
  attendance_count: 'Attendance Count',
  weight: 'Weight',
  utilization_percent: 'Utilization Percentage',
  load_change_rate: 'Load Change Rate',
  overload_risk: 'Overload Risk',
  depletion_rate: 'Depletion Rate',
  gas_level: 'Gas Level',
  gas_spike: 'Gas Spike',
  risk_score: 'Risk Score',
  exposure_state: 'Exposure State',
  unsafe_duration: 'Unsafe Duration',
  pressure: 'Pressure',
  aqi: 'Air Quality Index',
};

const metricUnitOverrides: Record<string, string> = {
  temperature: 'C',
  humidity: '%RH',
  temperature_spike: 'C',
  humidity_spike: '%RH',
  heat_index: 'C',
  dew_point: 'C',
  distance: 'cm',
  fill_level: '%',
  fill_rate: '%/day',
  remaining_capacity_percent: '%',
  occupancy_count: 'people',
  occupancy_spike: 'people',
  peak_occupancy: 'people',
  attendance_count: 'people',
  weight: 'kg',
  utilization_percent: '%',
  load_change_rate: 'kg/hour',
  overload_risk: '%',
  depletion_rate: 'kg/day',
  gas_level: 'ppm',
  gas_spike: 'ppm',
  unsafe_duration: 'minutes',
  pressure: 'hPa',
  aqi: 'AQI',
};

const recommendedAlertThresholds = (
  metricKey: string
): {
  belowWarning?: number;
  belowCritical?: number;
  aboveWarning?: number;
  aboveCritical?: number;
} => {
  switch (metricKey) {
    case 'temperature':
      return { belowWarning: 18, belowCritical: 15, aboveWarning: 25, aboveCritical: 28 };
    case 'humidity':
      return { belowWarning: 30, belowCritical: 20, aboveWarning: 70, aboveCritical: 80 };
    case 'distance':
      return { aboveWarning: 100, aboveCritical: 150 };
    case 'fill_level':
      return { aboveWarning: 80, aboveCritical: 90 };
    case 'occupancy_count':
      return { aboveWarning: 25, aboveCritical: 35 };
    case 'attendance_count':
      return { belowWarning: 20, belowCritical: 15 };
    case 'weight':
      return { aboveWarning: 250, aboveCritical: 300 };
    case 'overload_risk':
      return { aboveWarning: 250, aboveCritical: 300 };
    case 'gas_level':
      return { aboveWarning: 350, aboveCritical: 450 };
    case 'aqi':
      return { aboveWarning: 100, aboveCritical: 150 };
    default:
      return {};
  }
};

export const getSensorMetrics = (sensorType: string, useCase?: string): SensorMetric[] => {
  const normalizedType = sensorType?.toLowerCase();
  const normalizedUseCase = useCase?.toLowerCase();

  if (normalizedType === 'ultrasonic') {
    switch (normalizedUseCase) {
      case 'generic_monitoring':
        return [{ key: 'distance', label: 'Distance', unit: 'cm' }];
      case 'occupancy_monitoring':
        return [{ key: 'occupancy_count', label: 'Occupancy Count', unit: 'people' }];
      case 'attendance_monitoring':
        return [{ key: 'attendance_count', label: 'Attendance Count', unit: 'people' }];
      default:
        return [{ key: 'fill_level', label: 'Fill Level', unit: '%' }];
    }
  }

  return SENSOR_METRIC_MAP[normalizedType] || [{ key: 'value', label: 'Value' }];
};

export const getSensorHardwareCapabilities = (sensorType: string): SensorHardwareMetric[] => {
  const normalizedType = sensorType?.toLowerCase();
  return SENSOR_HARDWARE_METRICS[normalizedType] || [];
};

export const getDerivedMetrics = (sensorType: string, useCase?: string): SensorDerivedMetric[] => {
  const normalizedType = sensorType?.toLowerCase();
  const normalizedUseCase = useCase?.toLowerCase();

  if (normalizedType === 'ultrasonic') {
    switch (normalizedUseCase) {
      case 'generic_monitoring':
        return [
          {
            key: 'distance_state',
            label: 'Distance State',
            unit: 'cm',
            source_metrics: ['distance'],
            formula: 'Latest distance reading compared against configured thresholds',
            description: 'Turns raw distance into a customer-facing near, normal, or far state.',
          },
        ];
      case 'occupancy_monitoring':
        return [
          {
            key: 'occupancy_count',
            label: 'Occupancy Count',
            unit: 'people',
            source_metrics: ['distance'],
            formula: 'Distance triggers converted into a people count window',
            description: 'Represents how many people are detected in the monitored area.',
          },
          {
            key: 'occupancy_state',
            label: 'Occupancy State',
            source_metrics: ['occupancy_count'],
            formula: 'Count banded into quiet, normal, or busy ranges',
            description: 'Summarizes the crowd condition for dashboards and alerts.',
          },
        ];
      case 'attendance_monitoring':
        return [
          {
            key: 'attendance_count',
            label: 'Attendance Count',
            unit: 'people',
            source_metrics: ['distance'],
            formula: 'Entry or presence triggers converted into attendance counts',
            description: 'Tracks how many people are present for the attendance window.',
          },
          {
            key: 'attendance_status',
            label: 'Attendance Status',
            source_metrics: ['attendance_count'],
            formula: 'Attendance count checked against the expected threshold',
            description: 'Shows whether attendance is below target, on target, or above target.',
          },
        ];
      default:
        return [
          {
            key: 'fill_level_percent',
            label: 'Fill Level Percentage',
            unit: '%',
            source_metrics: ['distance'],
            formula: 'Distance normalized between empty and full calibration points',
            description: 'Converts raw distance into a percentage fill level for the container.',
          },
          {
            key: 'service_state',
            label: 'Service State',
            source_metrics: ['fill_level_percent'],
            formula: 'Fill level banded into normal, pickup soon, or urgent',
            description: 'Summarizes collection urgency based on the derived fill level.',
          },
        ];
    }
  }

  if (normalizedUseCase === 'climate_monitoring') {
    return [
      {
        key: 'climate_condition',
        label: 'Climate Condition',
        source_metrics: ['temperature', 'humidity'],
        formula: 'Temperature and humidity compared with the configured comfort or crop bands',
        description: 'Summarizes whether the environment is dry, comfortable, humid, hot, or cold.',
      },
    ];
  }

  if (normalizedUseCase === 'load_monitoring' || normalizedType === 'load' || normalizedType === 'load_cell') {
    return [
      {
        key: 'utilization_percent',
        label: 'Utilization Percentage',
        unit: '%',
        source_metrics: ['weight'],
        formula: 'Current weight divided by configured maximum operating load',
        description: 'Shows how much of the supported load capacity is currently used.',
      },
      {
        key: 'overload_risk',
        label: 'Overload Risk',
        source_metrics: ['utilization_percent'],
        formula: 'Utilization banded into safe, caution, or overload zones',
        description: 'Highlights whether the load is approaching or exceeding safe limits.',
      },
    ];
  }

  if (normalizedUseCase === 'safety_monitoring' || normalizedType === 'gas' || normalizedType === 'gas_sensor' || normalizedType === 'air_quality') {
    const sourceMetric = normalizedType === 'air_quality' ? 'aqi' : 'gas_level';
    return [
      {
        key: 'risk_level',
        label: 'Risk Level',
        source_metrics: [sourceMetric],
        formula: 'Latest safety reading mapped into low, medium, or high risk bands',
        description: 'Provides an easy-to-understand risk label for the monitored environment.',
      },
      {
        key: 'safety_state',
        label: 'Safety State',
        source_metrics: ['risk_level'],
        formula: 'Risk level converted into safe, warning, or critical state',
        description: 'Supports operator decisions and alert routing.',
      },
    ];
  }

  return DEFAULT_DERIVED_METRICS;
};

export const getConfigurableDerivedMetrics = (sensorType: string): ConfigurableDerivedMetric[] => {
  const normalizedType = sensorType?.toLowerCase();
  return CONFIGURABLE_DERIVED_METRICS[normalizedType] || [];
};

export const getObservableMetricCatalog = (sensorType: string): ObservableMetricDefinition[] => {
  const normalizedType = sensorType?.toLowerCase();
  if (!normalizedType) {
    return [];
  }

  const catalog = OBSERVABLE_METRIC_CATALOG[normalizedType];
  if (catalog) {
    return catalog;
  }

  return getConfigurableDerivedMetrics(sensorType).map((metric) => ({
    ...metric,
    availability: 'supported_now' as const,
    source_metrics: [metric.runtime_metric_key],
    formula: 'Directly supported by the current configuration flow',
  }));
};

export const getObservableMetricDefinition = (
  sensorType: string,
  metricKey?: string
): ObservableMetricDefinition | undefined => {
  if (!metricKey) {
    return undefined;
  }
  return getObservableMetricCatalog(sensorType).find((metric) => metric.key === metricKey);
};

export const getDefaultObservableMetric = (
  sensorType: string
): ObservableMetricDefinition | undefined => {
  const catalog = getObservableMetricCatalog(sensorType);
  return catalog.find((metric) => metric.availability === 'supported_now') || catalog[0];
};

export const getSensorKnowledgeProfile = (sensorType: string): SensorKnowledgeProfile | undefined => {
  const normalizedType = sensorType?.toLowerCase();
  if (!normalizedType) {
    return undefined;
  }

  const profile = SENSOR_KNOWLEDGE_PROFILES[normalizedType];
  if (profile) {
    return profile;
  }

  const ranges = getSensorHardwareCapabilities(sensorType);
  const measures = (SENSOR_METRIC_MAP[normalizedType] || []).map((metric) => ({
    label: metric.label,
    description: `Direct ${metric.label.toLowerCase()} reading from the discovered sensor.`,
  }));

  if (ranges.length === 0 && measures.length === 0) {
    return undefined;
  }

  const title = normalizedType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return {
    module_name: `${title} Sensor`,
    sensor_family: 'Detected physical sensor',
    description:
      'Layer 1 is auto-discovered for this sensor. The configuration page starts from customer-facing observation choices, but this panel preserves the hardware facts for review.',
    measures,
    readable_ranges: ranges,
    common_use_cases: [],
  };
};

export const getConfigurableDerivedMetric = (
  sensorType: string,
  metricKey?: string
): ConfigurableDerivedMetric | undefined => {
  if (!metricKey) {
    return undefined;
  }
  return (
    getConfigurableDerivedMetrics(sensorType).find((metric) => metric.key === metricKey) ||
    getObservableMetricDefinition(sensorType, metricKey)
  );
};

export const getDefaultConfigurableDerivedMetric = (
  sensorType: string
): ConfigurableDerivedMetric | undefined =>
  getConfigurableDerivedMetrics(sensorType)[0] || getDefaultObservableMetric(sensorType);

export const getPurposeOptionsForDerivedMetric = (
  sensorType: string,
  metricKey?: string
): DerivedMetricPurpose[] => getConfigurableDerivedMetric(sensorType, metricKey)?.purposes || [];

export const getUseCaseForDerivedMetric = (sensorType: string, metricKey?: string) =>
  getConfigurableDerivedMetric(sensorType, metricKey)?.use_case;

export const getRecommendedProfileForDerivedMetric = (sensorType: string, metricKey?: string) =>
  getConfigurableDerivedMetric(sensorType, metricKey)?.recommended_profile;

const suitableProfileAdditionsByMetric: Record<string, PresentationProfileKey[]> = {
  fill_level: ['level_monitoring', 'gauge_status', 'single_trend'],
  remaining_capacity_percent: ['gauge_status', 'level_monitoring', 'single_trend'],
  fill_rate: ['single_trend', 'gauge_status', 'event_timeline'],
  weight: ['gauge_status', 'single_trend'],
  utilization_percent: ['gauge_status', 'single_trend'],
  overload_risk: ['gauge_status', 'event_timeline', 'single_trend'],
  load_change_rate: ['single_trend', 'gauge_status', 'event_timeline'],
  depletion_rate: ['single_trend', 'gauge_status', 'event_timeline'],
  gas_level: ['gauge_status', 'single_trend', 'event_timeline'],
  risk_score: ['gauge_status', 'single_trend', 'event_timeline'],
  unsafe_duration: ['single_trend', 'gauge_status', 'event_timeline'],
  pressure: ['single_trend', 'gauge_status'],
  aqi: ['gauge_status', 'single_trend', 'event_timeline'],
};

export const getSupportedProfilesForDerivedMetric = (
  sensorType: string,
  metricKey?: string
): PresentationProfileKey[] => {
  const metric = getConfigurableDerivedMetric(sensorType, metricKey);
  const configuredProfiles = metric?.supported_profiles || ['single_trend'];
  const normalizedMetric = normalizedMetricKey(metric?.runtime_metric_key || metricKey);
  const suitableAdditions = suitableProfileAdditionsByMetric[normalizedMetric] || [];
  return Array.from(new Set([...configuredProfiles, ...suitableAdditions]));
};

const metricDescriptor = (metricKey: string): SensorMetric => ({
  key: metricKey,
  label: metricLabelOverrides[metricKey] || metricKey,
  unit: metricUnitOverrides[metricKey],
});

export const getMetricLabel = (metricKey: string) =>
  metricLabelOverrides[metricKey] || metricKey;

export const getMetricUnit = (metricKey: string) => metricUnitOverrides[metricKey];

const alertTemplateValuesForMetric = (
  metricKey: string,
  profile: PresentationProfileKey
): Array<{
  key: string;
  label: string;
  metric_key: string;
  condition: AlertCondition;
  unit?: string;
  description: string;
  warning_label: string;
  critical_label: string;
}> => {
  const unit = metricUnitOverrides[metricKey];

  switch (metricKey) {
    case 'temperature':
      return [
        {
          key: `${metricKey}_low_band`,
          label: 'Temperature Too Low',
          metric_key: metricKey,
          condition: 'below',
          unit,
          description: 'Warn when the environment becomes colder than the acceptable operating band.',
          warning_label: 'Review at or below',
          critical_label: 'Critical at or below',
        },
        {
          key: `${metricKey}_high_band`,
          label: 'Temperature Too High',
          metric_key: metricKey,
          condition: 'above',
          unit,
          description: 'Warn when the environment becomes hotter than the acceptable operating band.',
          warning_label: 'Review at or above',
          critical_label: 'Critical at or above',
        },
      ];
    case 'humidity':
      return [
        {
          key: `${metricKey}_low_band`,
          label: 'Humidity Too Low',
          metric_key: metricKey,
          condition: 'below',
          unit,
          description: 'Warn when the space becomes drier than the accepted humidity range.',
          warning_label: 'Review at or below',
          critical_label: 'Critical at or below',
        },
        {
          key: `${metricKey}_high_band`,
          label: 'Humidity Too High',
          metric_key: metricKey,
          condition: 'above',
          unit,
          description: 'Warn when the space becomes more humid than the accepted range.',
          warning_label: 'Review at or above',
          critical_label: 'Critical at or above',
        },
      ];
    case 'fill_level':
      return [
        {
          key: `${metricKey}_service_band`,
          label: profile === 'gauge_status' ? 'Level Capacity Alert' : 'Pickup / Refill Alert',
          metric_key: metricKey,
          condition: 'above',
          unit,
          description: 'Escalate when fill percentage approaches service or refill capacity.',
          warning_label: 'Service soon at',
          critical_label: 'Urgent service at',
        },
      ];
    case 'occupancy_count':
      return [
        {
          key: `${metricKey}_crowd_band`,
          label: 'High Occupancy Alert',
          metric_key: metricKey,
          condition: 'above',
          unit,
          description: 'Escalate when the monitored area becomes crowded or exceeds safe occupancy.',
          warning_label: 'Busy at',
          critical_label: 'Crowded at',
        },
      ];
    case 'attendance_count':
      return [
        {
          key: `${metricKey}_attendance_band`,
          label: 'Low Attendance Alert',
          metric_key: metricKey,
          condition: 'below',
          unit,
          description: 'Warn when attendance drops below the expected session target.',
          warning_label: 'Below target at or below',
          critical_label: 'Critical shortage at or below',
        },
      ];
    case 'weight':
      return [
        {
          key: `${metricKey}_capacity_band`,
          label: profile === 'single_trend' ? 'Heavy Load Alert' : 'Load Capacity Alert',
          metric_key: metricKey,
          condition: 'above',
          unit,
          description:
            profile === 'single_trend'
              ? 'Warn when the live weight rises above the preferred operating band.'
              : 'Warn when the measured load approaches or exceeds the supported weight band.',
          warning_label: 'Heavy load at',
          critical_label: 'Overload at',
        },
      ];
    case 'overload_risk':
      return [
        {
          key: `${metricKey}_capacity_band`,
          label: 'Overload Risk Alert',
          metric_key: metricKey,
          condition: 'above',
          unit: 'kg',
          description: 'Escalate when the live load enters the heavy-load or overload band.',
          warning_label: 'Heavy load at',
          critical_label: 'Overload at',
        },
      ];
    case 'gas_level':
    case 'aqi':
      return [
        {
          key: `${metricKey}_safety_band`,
          label:
            profile === 'event_timeline'
              ? 'Gas Incident Alert'
              : profile === 'single_trend'
                ? 'Gas Level Alert'
                : 'Safety Exposure Alert',
          metric_key: metricKey,
          condition: 'above',
          unit,
          description:
            profile === 'event_timeline'
              ? 'Escalate when gas readings cross incident thresholds or remain unsafe.'
              : profile === 'single_trend'
                ? 'Warn when the live gas reading rises above the preferred safety band.'
                : 'Escalate when the safety reading moves beyond acceptable exposure limits.',
          warning_label: 'Warning at',
          critical_label: 'Critical at',
        },
      ];
    case 'distance':
    default:
      return [
        {
          key: `${metricKey}_limit_band`,
          label: profile === 'event_timeline' ? 'Distance Crossing Event' : 'Distance Limit Alert',
          metric_key: metricKey,
          condition: 'above',
          unit,
          description:
            profile === 'event_timeline'
              ? 'Escalate when the measured distance crosses the event threshold.'
              : 'Warn when the measured distance exceeds the configured limit.',
          warning_label: 'Review at or above',
          critical_label: 'Critical at or above',
        },
      ];
  }
};

export const getPresentationProfileDefinition = (
  profile: PresentationProfileKey
): PresentationProfileDefinition => PRESENTATION_PROFILE_DEFINITIONS[profile];

export const getPresentationProfileDefinitions = (
  sensorType: string,
  metricKey?: string
): PresentationProfileDefinition[] =>
  getSupportedProfilesForDerivedMetric(sensorType, metricKey).map(
    (profile) => PRESENTATION_PROFILE_DEFINITIONS[profile]
  );

export const getPresentationConfigFields = (
  sensorType: string,
  metricKey?: string,
  profile?: PresentationProfileKey
): PresentationConfigFieldDefinition[] => {
  const resolvedProfile = profile || getRecommendedProfileForDerivedMetric(sensorType, metricKey) || 'single_trend';
  const normalizedMetric = normalizedMetricKey(
    getConfigurableDerivedMetric(sensorType, metricKey)?.runtime_metric_key || metricKey || 'value'
  );

  return [
    presentationField(
      'headline_metric',
      'Main Value',
      'Choose the main value the card should highlight.',
      headlineMetricOptionsForProfile(normalizedMetric, resolvedProfile)
    ),
    presentationField(
      'status_mode',
      'Status Style',
      'Choose how the card should describe the current condition.',
      statusModeOptionsForProfile(normalizedMetric, resolvedProfile)
    ),
    presentationField(
      'comparison_mode',
      'Compare With',
      'Choose what the live value should be compared against.',
      comparisonModeOptionsForProfile(normalizedMetric, resolvedProfile)
    ),
    presentationField(
      'detail_mode',
      'Extra Detail',
      'Choose the small supporting detail shown with the card.',
      detailModeOptionsForProfile(normalizedMetric, resolvedProfile)
    ),
  ];
};

export const getDefaultPresentationConfig = (
  sensorType: string,
  metricKey?: string,
  profile?: PresentationProfileKey
): PresentationConfigValue =>
  Object.fromEntries(
    getPresentationConfigFields(sensorType, metricKey, profile).map((field) => [
      field.key,
      field.options[0]?.value,
    ])
  ) as PresentationConfigValue;

export const normalizePresentationConfig = (
  sensorType: string,
  metricKey: string | undefined,
  profile: PresentationProfileKey,
  current?: PresentationConfigValue
): PresentationConfigValue => {
  const defaults = getDefaultPresentationConfig(sensorType, metricKey, profile);
  const fields = getPresentationConfigFields(sensorType, metricKey, profile);
  const next: PresentationConfigValue = {
    ...defaults,
  };

  const isLegacyOverloadRiskGaugeConfig =
    metricKey === 'overload_risk' &&
    profile === 'gauge_status' &&
    current?.headline_metric === 'weight' &&
    current?.status_mode === 'capacity_load' &&
    current?.comparison_mode === 'raw_weight' &&
    current?.detail_mode === 'load_trend';

  const isLegacyOverloadRiskTrendConfig =
    metricKey === 'overload_risk' &&
    profile === 'single_trend' &&
    current?.headline_metric === 'weight' &&
    current?.status_mode === 'load_band' &&
    current?.comparison_mode === 'threshold_band' &&
    current?.detail_mode === 'trend_first';

  if (isLegacyOverloadRiskGaugeConfig || isLegacyOverloadRiskTrendConfig) {
    return next;
  }

  for (const field of fields) {
    const requestedValue = current?.[field.key];
    if (requestedValue && field.options.some((option) => option.value === requestedValue)) {
      next[field.key] = requestedValue;
    }
  }

  return next;
};

export const getPresentationConfigOption = (
  sensorType: string,
  metricKey: string | undefined,
  profile: PresentationProfileKey,
  fieldKey: keyof PresentationConfigValue,
  value?: string
): PresentationConfigOption | undefined =>
  getPresentationConfigFields(sensorType, metricKey, profile)
    .find((field) => field.key === fieldKey)
    ?.options.find((option) => option.value === value);

export const getPresentationMetadata = (
  profile: PresentationProfileKey,
  useCase?: string
): Pick<PresentationProfileDefinition, 'primary_widget' | 'secondary_widgets' | 'chart_style'> => {
  const definition = PRESENTATION_PROFILE_DEFINITIONS[profile];
  if (!definition) {
    return {
      primary_widget: 'trend',
      secondary_widgets: ['status'],
      chart_style: useCase === 'climate_monitoring' ? 'area' : 'line',
    };
  }

  if (profile === 'single_trend' && useCase === 'climate_monitoring') {
    return {
      ...definition,
      chart_style: 'area',
    };
  }

  return definition;
};

export const getPresentationMetrics = (
  sensorType: string,
  metricKey?: string,
  profile?: PresentationProfileKey
): SensorMetric[] => {
  if (profile === 'dual_climate' && isClimateSensorType(sensorType)) {
    return [metricDescriptor('temperature'), metricDescriptor('humidity')];
  }

  const selectedMetric = getConfigurableDerivedMetric(sensorType, metricKey);
  if (selectedMetric) {
    return [
      {
        key: selectedMetric.runtime_metric_key,
        label: selectedMetric.label,
        unit: selectedMetric.unit,
      },
    ];
  }

  if (metricKey) {
    return [metricDescriptor(metricKey)];
  }

  return [];
};

export const buildPresentationAlertSettings = (
  sensorType: string,
  metricKey: string | undefined,
  profile: PresentationProfileKey,
  currentAlerts?: SensorAlertSetting[],
  currentThresholds?: Record<string, ThresholdRange>
): SensorAlertTemplate[] => {
  const metrics = getPresentationMetrics(sensorType, metricKey, profile);

  return metrics.flatMap((metric) => {
    const defaults = recommendedAlertThresholds(metric.key);
    const thresholdConfig = currentThresholds?.[metric.key];

    return alertTemplateValuesForMetric(metric.key, profile).map((template) => {
      const existing =
        currentAlerts?.find((alert) => alert.key === template.key) ||
        currentAlerts?.find(
          (alert) =>
            alert.metric_key === template.metric_key && alert.condition === template.condition
        );

      const warning_threshold =
        existing?.warning_threshold ??
        (template.condition === 'below'
          ? thresholdConfig?.min ?? defaults.belowWarning
          : thresholdConfig?.max ?? defaults.aboveWarning);
      const critical_threshold =
        existing?.critical_threshold ??
        (template.condition === 'below'
          ? thresholdConfig?.warning_min ?? defaults.belowCritical
          : thresholdConfig?.warning_max ?? defaults.aboveCritical);

      return {
        ...template,
        unit: template.unit || metric.unit,
        warning_threshold,
        critical_threshold,
      };
    });
  });
};

export const metricThresholdsFromAlertSettings = (
  alerts: Array<Pick<SensorAlertSetting, 'metric_key' | 'condition' | 'warning_threshold' | 'critical_threshold'>>
): Record<string, ThresholdRange> => {
  return alerts.reduce<Record<string, ThresholdRange>>((acc, alert) => {
    if (!alert.metric_key) {
      return acc;
    }

    const existing = acc[alert.metric_key] || {};
    if (alert.condition === 'below') {
      acc[alert.metric_key] = {
        ...existing,
        min: alert.warning_threshold,
        warning_min: alert.critical_threshold,
      };
      return acc;
    }

    acc[alert.metric_key] = {
      ...existing,
      max: alert.warning_threshold,
      warning_max: alert.critical_threshold,
    };
    return acc;
  }, {});
};

export const formatHardwareMetricRange = (metric: SensorHardwareMetric): string => {
  const min = metric.minimum_value;
  const max = metric.maximum_value;
  const unit = metric.unit ? ` ${metric.unit}` : '';

  if (min !== undefined && max !== undefined) {
    return `${min} to ${max}${unit}`;
  }
  if (min !== undefined) {
    return `From ${min}${unit}`;
  }
  if (max !== undefined) {
    return `Up to ${max}${unit}`;
  }
  return metric.unit ? `Unit: ${metric.unit}` : 'Range not specified';
};

export const estimateBatteryLifeDays = (
  reportsPerDay: number,
  metricCount: number,
  readingFlowType: ReadingFlowType
): number => {
  const effectiveReportsPerDay = readingFlowType === 'TRIGGER' ? 1 : Math.max(1, reportsPerDay || 1);
  const effectiveMetricCount = Math.max(1, metricCount || 1);

  const batteryCapacityMah = 2400;
  const standbyMahPerDay = 2;
  const txMahPerReportPerMetric = 0.6;

  const dailyConsumptionMah =
    standbyMahPerDay +
    effectiveReportsPerDay * effectiveMetricCount * txMahPerReportPerMetric;

  const estimatedDays = Math.floor(batteryCapacityMah / dailyConsumptionMah);

  return Math.max(1, Math.min(730, estimatedDays));
};
