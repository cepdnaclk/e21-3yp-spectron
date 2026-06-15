import { Sensor } from '../../services/sensorService';
import {
  getOriginalSensorName,
  getPhysicalSensorGroupKey,
  resolvePhysicalSensorType,
} from '../physicalSensor';

const sensor = (hwId: string, type: string): Sensor => ({
  id: hwId,
  controller_id: 'CTRL-1',
  hw_id: hwId,
  type,
  status: 'OK',
});

describe('physical sensor identity', () => {
  it('groups an explicit humidity sidecar with its compatible SHT30 parent', () => {
    const parent = sensor('door-sht30-01', 'temperature_humidity');
    const humidity = sensor('door-sht30-01-humidity', 'humidity');

    expect(getPhysicalSensorGroupKey(humidity, [parent, humidity])).toBe(parent.hw_id);
    expect(resolvePhysicalSensorType([parent, humidity])).toBe('temperature_humidity');
  });

  it('keeps an independent humidity sensor in its own group', () => {
    const temperature = sensor('room-01', 'temperature');
    const humidity = sensor('room-01-humidity', 'humidity');

    expect(getPhysicalSensorGroupKey(humidity, [temperature, humidity])).toBe(humidity.hw_id);
  });

  it('provides the original module name', () => {
    expect(getOriginalSensorName('temperature_humidity')).toMatch(/SHT30/i);
    expect(getOriginalSensorName('vl53l0x')).toMatch(/VL53L0X/i);
    expect(getOriginalSensorName('humidity')).toBe('Humidity Sensor');
  });
});
