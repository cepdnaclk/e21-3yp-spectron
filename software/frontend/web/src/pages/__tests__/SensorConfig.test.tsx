import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SensorConfig from '../main/SensorConfig';
import {
  getHardwareController,
  getHardwareSensor,
  saveHardwareSensorConfiguration,
} from '../../services/hardwarePairingService';
import { Sensor } from '../../services/sensorService';

vi.mock('../../services/hardwarePairingService', () => ({
  getHardwareController: vi.fn(),
  getHardwareSensor: vi.fn(),
  saveHardwareSensorConfiguration: vi.fn(),
}));

const baseSensor = (type: string, name = `${type} Sensor`): Sensor => ({
  id: 'sensor-1',
  controller_id: 'CTRL-100',
  hw_id: 'SENSOR-1',
  type,
  name,
  status: 'OK',
  config_active: false,
});

const renderSensorConfig = (sensor: Sensor) => {
  vi.mocked(getHardwareController).mockResolvedValue({
    id: 'CTRL-100',
    account_id: 'account-1',
    hw_id: 'CTRL-100',
    name: 'Greenhouse System',
    status: 'ONLINE',
    created_at: '2026-04-28',
  });
  vi.mocked(getHardwareSensor).mockResolvedValue(sensor);
  vi.mocked(saveHardwareSensorConfiguration).mockResolvedValue(undefined);

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
  it('renders the configuration form controls', async () => {
    renderSensorConfig(baseSensor('temperature_humidity', 'Climate Sensor'));

    expect(await screen.findByRole('heading', { name: /configure temperature_humidity sensor/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /sensor name/i })).toBeInTheDocument();
    expect(screen.getAllByText(/used for/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/dashboard view/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/temperature thresholds/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/humidity thresholds/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /save and activate configuration/i })).toBeInTheDocument();
  });

  it.each([
    {
      type: 'temperature_humidity',
      name: 'Climate Sensor',
      expected: [/temperature thresholds/i, /humidity thresholds/i],
    },
    {
      type: 'ultrasonic',
      name: 'Ultrasonic Sensor',
      expected: [/fill level thresholds/i, /tank height/i, /low level alert/i],
    },
    {
      type: 'load',
      name: 'Load Sensor',
      expected: [/weight thresholds/i, /maximum weight/i, /overload alert/i],
    },
  ])('shows fields for $type sensors', async ({ type, name, expected }) => {
    renderSensorConfig(baseSensor(type, name));

    expect(await screen.findByRole('heading', { name: new RegExp(`configure ${type} sensor`, 'i') })).toBeInTheDocument();
    for (const matcher of expected) {
      expect(screen.getAllByText(matcher).length).toBeGreaterThan(0);
    }
  });

  it('validates required fields before saving', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('temperature_humidity', 'Climate Sensor'));

    const sensorName = await screen.findByRole('textbox', { name: /sensor name/i });
    await user.clear(sensorName);
    await user.click(screen.getByRole('button', { name: /save and activate configuration/i }));

    expect(await screen.findByText(/please enter a sensor name before saving/i)).toBeInTheDocument();
    expect(saveHardwareSensorConfiguration).not.toHaveBeenCalled();
  });

  it('saves a valid hardware sensor configuration and navigates back', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('temperature_humidity', 'Climate Sensor'));

    await screen.findByRole('heading', { name: /configure temperature_humidity sensor/i });

    const minFields = screen.getAllByRole('spinbutton', { name: /min value/i });
    const maxFields = screen.getAllByRole('spinbutton', { name: /max value/i });

    await user.type(minFields[0], '18');
    await user.type(maxFields[0], '32');
    await user.type(minFields[1], '40');
    await user.type(maxFields[1], '85');
    await user.type(screen.getByRole('spinbutton', { name: /reports per day/i }), '24');
    await user.click(screen.getByRole('button', { name: /save and activate configuration/i }));

    await waitFor(() => {
      expect(saveHardwareSensorConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          controllerId: 'CTRL-100',
          sensorId: 'sensor-1',
          systemName: 'Greenhouse System',
          sensorType: 'temperature_humidity',
          sensorName: 'Climate Sensor',
        })
      );
    });
    expect(await screen.findByText(/back to sensors/i)).toBeInTheDocument();
  });
});
