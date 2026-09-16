import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ControllerDashboard from '../main/ControllerDashboard';
import {
  getHardwareController,
  getHardwareSensors,
  releaseHardwareController,
  resolveHardwareControllerRouteId,
  getMyHardwareControllers,
  renameHardwareController,
  renameHardwareSensor,
} from '../../services/hardwarePairingService';
import { getControllerFieldLinks } from '../../services/controllerService';
import { getFarms, getFarmControllers, getFarmFields, assignSensorBase } from '../../services/farmService';

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
  getMyHardwareControllers: vi.fn(),
  getHardwareSensors: vi.fn(),
  renameHardwareController: vi.fn(),
  renameHardwareSensor: vi.fn(),
  releaseHardwareController: vi.fn(),
  resolveHardwareControllerRouteId: vi.fn(),
}));

vi.mock('../../services/controllerService', () => ({
  getControllerFieldLinks: vi.fn(),
}));

vi.mock('../../services/farmService', () => ({
  getFarms: vi.fn(),
  getFarmControllers: vi.fn(),
  getFarmFields: vi.fn(),
  assignSensorBase: vi.fn(),
}));

describe('Paired hardware sensors dashboard', () => {
  beforeEach(() => {
    vi.mocked(getHardwareController).mockResolvedValue({
      id: 'CTRL-100',
      account_id: 'account-1',
      hw_id: 'CTRL-100',
      name: 'Greenhouse System',
      status: 'ONLINE',
      operational_status: 'ONLINE',
      claim_status: 'CLAIMED',
      purpose: 'Greenhouse monitoring',
      location: 'Greenhouse A',
      created_at: '2026-04-28',
    } as any);
    vi.mocked(getHardwareSensors).mockResolvedValue([
      {
        id: 'load-1',
        controller_id: 'CTRL-100',
        hw_id: 'CTRL-100-sensor-1',
        type: 'load',
        name: 'Load Sensor',
        status: 'OK',
        config_active: false,
      },
      {
        id: 'temp-1',
        controller_id: 'CTRL-100',
        hw_id: 'CTRL-100-sensor-2-temperature',
        type: 'temperature_humidity',
        name: 'Temperature & Humidity Sensor',
        status: 'OK',
        config_active: true,
      },
      {
        id: 'ultra-1',
        controller_id: 'CTRL-100',
        hw_id: 'CTRL-100-sensor-3',
        type: 'ultrasonic',
        name: 'Ultrasonic Sensor',
        status: 'OK',
        config_active: false,
      },
    ] as any);
    vi.mocked(getControllerFieldLinks).mockResolvedValue([]);
    vi.mocked(getMyHardwareControllers).mockResolvedValue([] as any);
    vi.mocked(resolveHardwareControllerRouteId).mockResolvedValue('CTRL-100');
    vi.mocked(renameHardwareController).mockResolvedValue({ name: 'Greenhouse System' } as any);
    vi.mocked(renameHardwareSensor).mockResolvedValue({} as any);
    vi.mocked(releaseHardwareController).mockResolvedValue(undefined);
    vi.mocked(getFarms).mockResolvedValue([] as any);
    vi.mocked(getFarmControllers).mockResolvedValue([] as any);
    vi.mocked(getFarmFields).mockResolvedValue([] as any);
    vi.mocked(assignSensorBase).mockResolvedValue(undefined as any);
  });

  it('renders the current sensor cards and actions', async () => {
    render(
      <MemoryRouter initialEntries={['/hardware/CTRL-100/sensors']}>
        <Routes>
          <Route path="/hardware/:controllerId/sensors" element={<ControllerDashboard />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /greenhouse system/i })).toBeInTheDocument();
    expect(screen.getByText(/^sensors \(3\)$/i)).toBeInTheDocument();
    expect(screen.getByText(/controller status/i)).toBeInTheDocument();
    expect(screen.getByText(/sensor status/i)).toBeInTheDocument();
    expect(screen.getByText(/last controller signal/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /manual|advanced/i })).toHaveLength(3);
    expect(screen.getAllByText(/active/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/configured/i)).toBeInTheDocument();
  });
});
