import {
  buildPresentationAlertSettings,
  getDefaultObservableMetric,
  getObservableMetricCatalog,
  getSensorHardwareCapabilities,
} from '../sensorConfig';

describe('sensor configuration catalog', () => {
  const supportedSensorTypes = [
    'temperature',
    'temperature_sensor',
    'temp',
    'humidity',
    'humidity_sensor',
    'relative_humidity',
    'pressure',
    'pressure_sensor',
    'temperature_humidity',
    'temp_humidity',
    'dht11',
    'dht22',
    'sht30',
    'sht31',
    'sht35',
    'bme280',
    'bmp280',
    'vl53l0x',
    'distance',
    'ultrasonic',
    'load',
    'load_cell',
    'gas',
    'gas_sensor',
    'air_quality',
  ];

  it.each(supportedSensorTypes)('%s has a usable default configuration', (sensorType) => {
    const catalog = getObservableMetricCatalog(sensorType);
    const defaultMetric = getDefaultObservableMetric(sensorType);

    expect(getSensorHardwareCapabilities(sensorType).length).toBeGreaterThan(0);
    expect(catalog.some((metric) => metric.availability === 'supported_now')).toBe(true);
    expect(defaultMetric).toBeDefined();

    const alerts = buildPresentationAlertSettings(
      sensorType,
      defaultMetric?.key,
      defaultMetric?.recommended_profile || 'single_trend',
    );
    expect(alerts.length).toBeGreaterThan(0);
  });
});
