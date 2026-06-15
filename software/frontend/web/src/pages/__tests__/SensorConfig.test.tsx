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
  it('renders the step-by-step wizard', async () => {
    renderSensorConfig(baseSensor('temperature_humidity', 'Climate Sensor'));

    expect(await screen.findByRole('heading', { name: /configure temperature_humidity sensor/i })).toBeInTheDocument();
    expect(screen.getByText(/^About Sensor$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Observable Metric$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Visualization$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Alerts$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Review$/i)).toBeInTheDocument();
    expect(screen.getByText(/step 1: about sensor/i)).toBeInTheDocument();
    expect(screen.getByText(/detected physical sensor/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /sensor name/i })).toBeInTheDocument();
    expect(screen.queryByText(/interpretation context/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save and activate configuration/i })).not.toBeInTheDocument();
  });

  it.each([
    {
      type: 'temperature_humidity',
      name: 'Climate Sensor',
      expected: [/observed metric/i, /temperature spike/i, /heat index/i, /dew point/i, /climate condition/i],
    },
    {
      type: 'ultrasonic',
      name: 'Ultrasonic Sensor',
      expected: [/observed metric/i, /fill rate/i, /remaining capacity/i, /occupancy spike/i, /peak occupancy/i],
    },
    {
      type: 'load',
      name: 'Load Sensor',
      expected: [/observed metric/i, /utilization percentage/i, /load change rate/i, /overload risk/i],
    },
  ])('shows metric choices for $type sensors', async ({ type, name, expected }) => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor(type, name));

    expect(await screen.findByRole('heading', { name: new RegExp(`configure ${type} sensor`, 'i') })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/step 2: observable metric/i)).toBeInTheDocument();
    for (const matcher of expected) {
      expect(screen.getAllByText(matcher).length).toBeGreaterThan(0);
    }
  });

  it('walks through the wizard flow for known sensors', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('ultrasonic', 'Ultrasonic Sensor'));

    expect(await screen.findByRole('heading', { name: /configure ultrasonic sensor/i })).toBeInTheDocument();
    expect(screen.getByText(/gy-vl53l0x time-of-flight distance sensor/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/step 2: observable metric/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/step 3: visualization/i)).toBeInTheDocument();
    expect(screen.getByText(/gauge \+ recent level/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/step 4: alerts/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /reports per day/i })).toBeInTheDocument();

    const alertThresholds = screen.getAllByRole('spinbutton');
    await user.clear(alertThresholds[0]);
    await user.type(alertThresholds[0], '75');
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/step 5: review/i)).toBeInTheDocument();
    expect(screen.getByText(/this is how the sensor card will look in monitoring/i)).toBeInTheDocument();
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
    localStorage.clear();
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
    localStorage.clear();
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
    expect(await screen.findByRole('heading', { name: /^Alerts$/i })).toBeInTheDocument();
  });

  it('validates the current step before moving forward', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('temperature_humidity', 'Climate Sensor'));

    const sensorName = await screen.findByRole('textbox', { name: /sensor name/i });
    await user.clear(sensorName);
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(await screen.findByText(/please enter a sensor name to continue/i)).toBeInTheDocument();
    expect(saveHardwareSensorConfiguration).not.toHaveBeenCalled();
  });

  it('saves a valid hardware sensor configuration and navigates back', async () => {
    const user = userEvent.setup();
    renderSensorConfig(baseSensor('load', 'Load Sensor'));

    await screen.findByRole('heading', { name: /configure load sensor/i });
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    const alertThresholds = screen.getAllByRole('spinbutton');
    await user.clear(alertThresholds[0]);
    await user.type(alertThresholds[0], '250');
    await user.clear(screen.getByRole('spinbutton', { name: /reports per day/i }));
    await user.type(screen.getByRole('spinbutton', { name: /reports per day/i }), '24');
    await user.click(screen.getByRole('button', { name: /next/i }));
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
    expect(await screen.findByText(/back to sensors/i)).toBeInTheDocument();
  });
});
