import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ControllerDashboard from '../main/ControllerDashboard';
import {
  getHardwareController,
  getHardwareSensors,
  releaseHardwareController,
} from '../../services/hardwarePairingService';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: 'owner@spectron.test',
      accounts: [{ id: 'account-1', name: 'Spectron', role: 'OWNER' }],
    },
  }),
}));

vi.mock('../../services/hardwarePairingService', () => ({
  getHardwareController: vi.fn(),
  getHardwareSensors: vi.fn(),
  releaseHardwareController: vi.fn(),
}));

describe('Paired hardware sensors dashboard', () => {
  beforeEach(() => {
    vi.mocked(getHardwareController).mockResolvedValue({
      id: 'CTRL-100',
      account_id: 'account-1',
      hw_id: 'CTRL-100',
      name: 'Greenhouse System',
      status: 'ONLINE',
      purpose: 'Greenhouse monitoring',
      location: 'Greenhouse A',
      created_at: '2026-04-28',
    });
    vi.mocked(getHardwareSensors).mockResolvedValue([
      {
        id: 'load-1',
        controller_id: 'CTRL-100',
        hw_id: 'LOAD-1',
        type: 'load',
        name: 'Load Sensor',
        status: 'OK',
        config_active: false,
      },
      {
        id: 'temp-1',
        controller_id: 'CTRL-100',
        hw_id: 'TEMP-1',
        type: 'temperature_humidity',
        name: 'Temperature & Humidity Sensor',
        status: 'OK',
        config_active: true,
      },
      {
        id: 'ultra-1',
        controller_id: 'CTRL-100',
        hw_id: 'ULTRA-1',
        type: 'ultrasonic',
        name: 'Ultrasonic Sensor',
        status: 'OK',
        config_active: false,
      },
    ]);
    vi.mocked(releaseHardwareController).mockResolvedValue(undefined);
  });

  it('renders discovered sensor cards and configuration actions', async () => {
    render(
      <MemoryRouter initialEntries={['/hardware/CTRL-100/sensors']}>
        <Routes>
          <Route path="/hardware/:controllerId/sensors" element={<ControllerDashboard />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /greenhouse system/i })).toBeInTheDocument();
    expect(screen.getByText(/connected hardware/i)).toBeInTheDocument();
    expect(screen.getByText(/load sensor/i)).toBeInTheDocument();
    expect(screen.getByText(/temperature & humidity sensor/i)).toBeInTheDocument();
    expect(screen.getByText(/ultrasonic sensor/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^configure$/i })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /review configuration/i })).toBeInTheDocument();
  });
});
