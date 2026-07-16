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

const renderSensorConfig = (
  sensor: Sensor,
  navigationState?: Record<string, unknown>
) => {
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
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/hardware/CTRL-100/sensors/sensor-1/configure',
          state: navigationState,
        },
      ]}
    >
      <Routes>
        <Route path="/hardware/:controllerId/sensors/:sensorId/configure" element={<SensorConfig />} />
        <Route path="/hardware/:controllerId/sensors" element={<div>Hardware sensors</div>} />
        <Route path="/farms" element={<div>Back to farms</div>} />
        <Route path="/monitoring" element={<div>Back to monitoring</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('SensorConfig', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders the step-by-step wizard', async () => {
    renderSensorConfig(baseSensor('temperature_humidity', 'Climate Sensor'));

    expect(await screen.findByRole('heading', { name: /configure temperature_humidity sensor/i })).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^core setup$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^your sensor$/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /sensor name/i })).toBeInTheDocument();
    expect(screen.getByText(/what to measure/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save and activate configuration/i })).not.toBeInTheDocument();
  });

  it.each([
    {
      type: 'temperature_humidity',
      name: 'Climate Sensor',
      expected: [/temperature spike/i, /heat index/i, /dew point/i, /climate condition/i],
    },
    {
      type: 'ultrasonic',
      name: 'Ultrasonic Sensor',
      expected: [/fill rate/i, /remaining capacity/i, /occupancy spike/i, /peak occupancy/i],
    },
    {
      type: 'load',
      name: 'Load Sensor',
      expected: [/utilization percentage/i, /load change rate/i, /overload risk/i],
    },
  ])('shows metric choices for $type sensors', async ({ type, name, expected }) => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor(type, name));

    expect(await screen.findByRole('heading', { name: new RegExp(`configure ${type} sensor`, 'i') })).toBeInTheDocument();
    expect(screen.getByText(/what to measure/i)).toBeInTheDocument();
    for (const matcher of expected) {
      expect(screen.getAllByText(matcher).length).toBeGreaterThan(0);
    }
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByRole('heading', { name: /^alert rules$/i })).toBeInTheDocument();
  });

  it('walks through the wizard flow for known sensors', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('ultrasonic', 'Ultrasonic Sensor'));

    expect(await screen.findByRole('heading', { name: /configure ultrasonic sensor/i })).toBeInTheDocument();
    expect(screen.getByText(/gy-vl53l0x time-of-flight distance sensor/i)).toBeInTheDocument();
    expect(screen.getByText(/choose graph \/ visualization/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText(/step 4: alerts/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^alert rules$/i })).toBeInTheDocument();

    const alertThresholds = screen.getAllByRole('spinbutton');
    await user.clear(alertThresholds[0]);
    await user.type(alertThresholds[0], '75');
    expect(screen.getByRole('button', { name: /save and activate configuration/i })).toBeInTheDocument();
  });

  it('shows distance attendance detector settings immediately after metric selection', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('ultrasonic', 'Door Distance Sensor'));

    await screen.findByRole('heading', { name: /configure ultrasonic sensor/i });
    await user.click(screen.getByRole('checkbox', { name: /measure attendance count/i }));

    expect(screen.getByText(/door passage detection/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /normal clear-door distance/i })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /passage trigger distance change/i })).toHaveValue(50);
    expect(screen.getByRole('spinbutton', { name: /cooldown after each count/i })).toHaveValue(2);
  }, 15000);

  it('shows only the questions required by the selected measurement', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('ultrasonic', 'Tank Distance Sensor'));

    await screen.findByRole('heading', { name: /configure ultrasonic sensor/i });
    expect(screen.queryByRole('spinbutton', { name: /how deep is the container/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /measure fill level/i }));
    expect(await screen.findByRole('spinbutton', { name: /how deep is the container/i })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /measure fill rate/i }));
    expect(
      await screen.findByRole('spinbutton', { name: /over how many minutes should changes be calculated/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /measure fill level/i }));
    await user.click(screen.getByRole('checkbox', { name: /measure fill rate/i }));
    expect(screen.queryByRole('spinbutton', { name: /how deep is the container/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('spinbutton', { name: /over how many minutes should changes be calculated/i })
    ).not.toBeInTheDocument();
  });

  it('accepts a distance metric after it is deselected and selected again', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('ultrasonic', 'Door Distance Sensor'));

    await screen.findByRole('heading', { name: /configure ultrasonic sensor/i });
    const distanceCheckbox = await screen.findByRole('checkbox', { name: /measure distance/i });
    expect(distanceCheckbox).toBeChecked();

    await user.click(distanceCheckbox);
    expect(distanceCheckbox).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText(/please choose what to measure/i)).toBeInTheDocument();

    await user.click(distanceCheckbox);
    await waitFor(() => {
      expect(screen.queryByText(/please choose what to measure/i)).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByRole('heading', { name: /^Alert Rules$/i })).toBeInTheDocument();
  });

  it('returns to monitoring after saving a config opened from monitoring', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('load', 'Load Sensor'), { returnTo: '/monitoring' });

    await screen.findByRole('heading', { name: /configure load sensor/i });
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /save and activate configuration/i }));

    expect(await screen.findByText(/back to monitoring/i)).toBeInTheDocument();
    expect(screen.queryByText(/back to sensors/i)).not.toBeInTheDocument();
  });

  it('validates the current step before moving forward', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('temperature_humidity', 'Climate Sensor'));

    const sensorName = await screen.findByRole('textbox', { name: /sensor name/i });
    await user.clear(sensorName);
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(await screen.findByText(/please give your sensor a name/i)).toBeInTheDocument();
    expect(saveHardwareSensorConfiguration).not.toHaveBeenCalled();
  });

  it('saves a valid hardware sensor configuration and navigates back', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('load', 'Load Sensor'));

    await screen.findByRole('heading', { name: /configure load sensor/i });
    await user.click(screen.getByRole('button', { name: /next/i }));

    const alertThresholds = screen.getAllByRole('spinbutton');
    await user.clear(alertThresholds[0]);
    await user.type(alertThresholds[0], '250');
    await user.click(screen.getByRole('button', { name: /save and activate configuration/i }));

    await waitFor(() => {
      expect(saveHardwareSensorConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          controllerId: 'CTRL-100',
          sensorId: 'sensor-1',
          systemName: 'Greenhouse System',
          sensorType: 'load',
          sensorName: 'Load Sensor',
        })
      );
    });
    expect(await screen.findByText(/hardware sensors/i)).toBeInTheDocument();
  });
});
