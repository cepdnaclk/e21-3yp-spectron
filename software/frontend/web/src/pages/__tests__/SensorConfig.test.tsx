import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SensorConfig from '../main/SensorConfig';
import {
  findHardwareControllerIdForSensor,
  getHardwareController,
  getHardwareSensor,
  resolveHardwareControllerRouteId,
  saveHardwareSensorConfiguration,
} from '../../services/hardwarePairingService';
import { getLearningPhaseStatus } from '../../services/sensorConfigurationAiService';
import { Sensor } from '../../services/sensorService';

vi.mock('../../services/hardwarePairingService', () => ({
  findHardwareControllerIdForSensor: vi.fn(),
  getHardwareController: vi.fn(),
  getHardwareSensor: vi.fn(),
  resolveHardwareControllerRouteId: vi.fn(),
  saveHardwareSensorConfiguration: vi.fn(),
}));

vi.mock('../../services/sensorConfigurationAiService', () => ({
  getLearningPhaseStatus: vi.fn(),
  parseConfigurationFromAi: vi.fn(),
}));

const baseSensor = (type: string, name = `${type} Sensor`, overrides: Partial<Sensor> = {}): Sensor => ({
  id: 'sensor-1',
  controller_id: 'CTRL-100',
  hw_id: 'SENSOR-1',
  type,
  name,
  status: 'OK',
  config_active: false,
  ...overrides,
});

const configuredLoadSensor = () =>
  baseSensor('load', 'Load Sensor', {
    config_active: true,
    active_config: {
      friendly_name: 'Load Sensor',
      primary_metric: 'utilization_percent',
      report_interval_per_day: 24,
      hardware_config: {
        maximumLoadKg: 500,
        reportsPerDay: 24,
        readingFlowType: 'periodic',
      },
      hardware: {
        system_name: 'Greenhouse System',
        sensor_type: 'load',
        sensor_name: 'Load Sensor',
        config: {
          maximumLoadKg: 500,
          reportsPerDay: 24,
          readingFlowType: 'periodic',
        },
      },
      interpretation: {
        friendly_name: 'Load Sensor',
        purpose: 'Watch load on the hopper',
        use_case: 'load_monitoring',
        primary_metric: 'utilization_percent',
        observable_metrics: ['utilization_percent'],
        metric_thresholds: {
          utilization_percent: {
            warning_max: 250,
            max: 300,
          },
        },
        thresholds: {
          warning_max: 250,
          max: 300,
        },
      },
      presentation: {
        profile: 'gauge_status',
      },
      settings: {
        alerts: [
          {
            key: 'utilization_warning',
            label: 'Utilization',
            metric_key: 'utilization_percent',
            condition: 'above',
            warning_threshold: 250,
            critical_threshold: 300,
            warning_label: 'Needs attention',
            critical_label: 'Urgent',
          },
        ],
      },
      operational: {
        report_interval_per_day: 24,
        reading_flow_type: 'periodic',
      },
    } as any,
  });

const renderSensorConfig = (sensor: Sensor) => {
  vi.mocked(getHardwareController).mockResolvedValue({
    id: 'CTRL-100',
    account_id: 'account-1',
    hw_id: 'CTRL-100',
    name: 'Greenhouse System',
    status: 'ONLINE',
    operational_status: 'ONLINE',
    created_at: '2026-04-28',
  } as any);
  vi.mocked(getHardwareSensor).mockResolvedValue(sensor);
  vi.mocked(findHardwareControllerIdForSensor).mockResolvedValue('CTRL-100');
  vi.mocked(resolveHardwareControllerRouteId).mockResolvedValue('CTRL-100');
  vi.mocked(getLearningPhaseStatus).mockResolvedValue({ phase: 'idle' } as any);
  vi.mocked(saveHardwareSensorConfiguration).mockResolvedValue(undefined as any);

  render(
    <MemoryRouter initialEntries={['/hardware/CTRL-100/sensors/sensor-1/configure']}>
      <Routes>
        <Route path="/hardware/:controllerId/sensors/:sensorId/configure" element={<SensorConfig />} />
        <Route path="/hardware/:controllerId/sensors" element={<div>Back to sensors</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('SensorConfig', () => {
  it('renders the current sensor setup page', async () => {
    renderSensorConfig(baseSensor('temperature_humidity', 'Climate Sensor'));

    expect(await screen.findByRole('heading', { name: /set up climate sensor/i })).toBeInTheDocument();
    expect(screen.getByText(/confirm what this sensor watches and when spectron should alert you/i)).toBeInTheDocument();
    expect(screen.getByText(/^your sensor$/i)).toBeInTheDocument();
    expect(screen.getByText(/^alert limits$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suggest settings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save sensor setup/i })).toBeInTheDocument();
  });

  it('shows only direct climate measurements in a compact alert setup', async () => {
    renderSensorConfig(baseSensor('temperature_humidity', 'Climate Sensor'));

    expect(await screen.findByText('Metric: Temperature')).toBeInTheDocument();
    expect(await screen.findByText('Metric: Humidity')).toBeInTheDocument();
    expect(screen.queryByText('Metric: Temperature Spike')).not.toBeInTheDocument();
    expect(screen.queryByText('Metric: Heat Index')).not.toBeInTheDocument();
    expect(screen.queryByText('Metric: Dew Point')).not.toBeInTheDocument();
    expect(screen.queryByText('Metric: Climate Condition')).not.toBeInTheDocument();
    expect(screen.getAllByText('Low limit')).toHaveLength(2);
    expect(screen.getAllByText('High limit')).toHaveLength(2);
  });

  it.each([
    ['humidity', 'Humidity Sensor', 'Humidity'],
    ['humidity_sensor', 'Humidity Sensor', 'Humidity'],
    ['temperature', 'Temperature Sensor', 'Temperature'],
    ['pressure_sensor', 'Pressure Sensor', 'Pressure'],
    ['sht30', 'SHT30 Sensor', 'Temperature'],
    ['bmp280', 'BMP280 Sensor', 'Temperature'],
    ['distance', 'Distance Sensor', 'Distance'],
    ['air_quality', 'Air Quality Sensor', 'Air Quality Index'],
  ])(
    'shows configuration controls for %s',
    async (type, name, metricLabel) => {
      renderSensorConfig(baseSensor(type, name));

      expect(
        await screen.findByRole('heading', { name: new RegExp(`set up ${name}`, 'i') }),
      ).toBeInTheDocument();
      expect(await screen.findByText(`Metric: ${metricLabel}`)).toBeInTheDocument();
      expect(screen.queryByText(/select a metric first to see alert options/i)).not.toBeInTheDocument();
    },
  );

  it('does not save when required setup is missing', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('temperature_humidity', 'Climate Sensor'));

    await screen.findByRole('heading', { name: /set up climate sensor/i });
    const lowLimitFields = await screen.findAllByLabelText(/needs attention below/i);
    await user.clear(lowLimitFields[0]);
    vi.mocked(saveHardwareSensorConfiguration).mockClear();
    await user.click(screen.getByRole('button', { name: /save sensor setup/i }));

    await waitFor(() => {
      expect(saveHardwareSensorConfiguration).not.toHaveBeenCalled();
    });
  });

  it('renders configured load sensor details on the current setup screen', async () => {
    renderSensorConfig(configuredLoadSensor());

    expect(await screen.findByRole('heading', { name: /set up load sensor/i })).toBeInTheDocument();
    expect(screen.getByText(/^your sensor$/i)).toBeInTheDocument();
    expect(screen.getByText(/project load sensing channel/i)).toBeInTheDocument();
    expect(screen.getByText(/^one quick clarification$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save sensor setup/i })).toBeInTheDocument();
  });
});
