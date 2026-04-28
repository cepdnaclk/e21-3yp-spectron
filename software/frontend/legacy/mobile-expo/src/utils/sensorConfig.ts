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
}

const SENSOR_METRIC_MAP: Record<string, SensorMetric[]> = {
  temperature: [{key: 'temperature', label: 'Temperature'}],
  humidity: [{key: 'humidity', label: 'Humidity'}],
  temp_humidity: [
    {key: 'temperature', label: 'Temperature'},
    {key: 'humidity', label: 'Humidity'},
  ],
  temperature_humidity: [
    {key: 'temperature', label: 'Temperature'},
    {key: 'humidity', label: 'Humidity'},
  ],
  dht11: [
    {key: 'temperature', label: 'Temperature'},
    {key: 'humidity', label: 'Humidity'},
  ],
  dht22: [
    {key: 'temperature', label: 'Temperature'},
    {key: 'humidity', label: 'Humidity'},
  ],
  bme280: [
    {key: 'temperature', label: 'Temperature'},
    {key: 'pressure', label: 'Pressure'},
  ],
  bmp280: [
    {key: 'temperature', label: 'Temperature'},
    {key: 'pressure', label: 'Pressure'},
  ],
  pressure: [{key: 'pressure', label: 'Pressure'}],
  vl53l0x: [{key: 'distance', label: 'Distance'}],
  distance: [{key: 'distance', label: 'Distance'}],
  ultrasonic: [{key: 'fill_level', label: 'Fill Level'}],
  load_cell: [{key: 'weight', label: 'Weight'}],
  gas_sensor: [{key: 'gas_level', label: 'Gas Level'}],
  air_quality: [{key: 'aqi', label: 'Air Quality Index'}],
};

export const getSensorMetrics = (sensorType: string): SensorMetric[] => {
  return SENSOR_METRIC_MAP[sensorType?.toLowerCase()] || [{key: 'value', label: 'Value'}];
};

export const estimateBatteryLifeDays = (
  reportsPerDay: number,
  metricCount: number,
  readingFlowType: ReadingFlowType,
): number => {
  const effectiveReportsPerDay =
    readingFlowType === 'TRIGGER' ? 1 : Math.max(1, reportsPerDay || 1);
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
