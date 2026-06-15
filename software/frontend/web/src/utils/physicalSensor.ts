import { Sensor } from '../services/sensorService';
import { getSensorKnowledgeProfile } from './sensorConfig';

const normalizeType = (value?: string) => (value || '').trim().toLowerCase();

const isCompatibleSidecarParent = (sidecarType: string, parentType: string) => {
  const normalizedParent = normalizeType(parentType);
  if (sidecarType === 'humidity') {
    return [
      'temperature_humidity',
      'temp_humidity',
      'sht30',
      'sht31',
      'sht35',
      'dht11',
      'dht22',
      'bme280',
    ].includes(normalizedParent);
  }

  if (sidecarType === 'pressure') {
    return ['bme280', 'bmp280'].includes(normalizedParent);
  }

  return false;
};

export const getPhysicalSensorGroupKey = (sensor: Sensor, allSensors: Sensor[]) => {
  if (sensor.physical_sensor_id) {
    return sensor.physical_sensor_id;
  }

  const rawId = sensor.hw_id || sensor.id;
  const sensorType = normalizeType(sensor.type);
  if (sensorType !== 'humidity' && sensorType !== 'pressure') {
    return rawId;
  }

  const suffix = `-${sensorType}`;
  if (!rawId.toLowerCase().endsWith(suffix)) {
    return rawId;
  }

  const parentId = rawId.slice(0, -suffix.length);
  const parent = allSensors.find((candidate) => {
    const candidateId = candidate.hw_id || candidate.id;
    return candidateId.toLowerCase() === parentId.toLowerCase();
  });

  return parent && isCompatibleSidecarParent(sensorType, parent.type) ? parentId : rawId;
};

export const resolvePhysicalSensorType = (sensors: Sensor[]) => {
  const types = sensors.map((sensor) => normalizeType(sensor.type));
  if (types.includes('bme280')) return 'bme280';
  if (types.includes('bmp280')) return 'bmp280';
  if (types.some((type) => ['sht30', 'sht31', 'sht35', 'temperature_humidity', 'temp_humidity'].includes(type))) {
    return 'temperature_humidity';
  }
  if (types.some((type) => ['vl53l0x', 'distance', 'ultrasonic'].includes(type))) return 'vl53l0x';
  return types[0] || 'sensor';
};

export const getOriginalSensorName = (sensorType: string) => {
  switch (normalizeType(sensorType)) {
    case 'temperature':
      return 'Temperature Sensor';
    case 'humidity':
      return 'Humidity Sensor';
    case 'pressure':
      return 'Pressure Sensor';
  }
  const profile = getSensorKnowledgeProfile(sensorType);
  return profile?.module_name || `${sensorType.toUpperCase()} Sensor`;
};

export const isDefaultSensorName = (sensor: Sensor) => {
  const name = (sensor.name || '').trim().toLowerCase();
  const type = normalizeType(sensor.type);
  return !name ||
    name === type ||
    name === `${type} sensor` ||
    name === `sensor ${sensor.hw_id}`.toLowerCase();
};
