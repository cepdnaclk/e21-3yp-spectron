import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Controllers from '../main/Controllers';
import { getMyHardwareControllers } from '../../services/hardwarePairingService';
import { getFarms, getFarmControllers, getFarmSensorBases } from '../../services/farmService';

vi.mock('../../services/hardwarePairingService', () => ({
  getMyHardwareControllers: vi.fn(),
}));

vi.mock('../../services/farmService', () => ({
  getFarms: vi.fn(),
  getFarmControllers: vi.fn(),
  getFarmSensorBases: vi.fn(),
  attachFarmController: vi.fn(),
}));

describe('Controllers dashboard', () => {
  beforeEach(() => {
    vi.mocked(getFarms).mockResolvedValue([
      {
        id: 'farm-1',
        name: 'Greenhouse Farm',
        role: 'owner',
      } as any,
    ]);
    vi.mocked(getFarmControllers).mockResolvedValue([]);
    vi.mocked(getFarmSensorBases).mockResolvedValue([]);
    vi.mocked(getMyHardwareControllers).mockResolvedValue([
      {
        id: 'CTRL-100',
        account_id: 'account-1',
        hw_id: 'CTRL-100',
        name: 'Greenhouse Controller',
        status: 'ONLINE',
        operational_status: 'ONLINE',
        purpose: 'Greenhouse monitoring',
        location: 'Greenhouse A',
        created_at: '2026-04-28',
      },
    ] as any);
  });

  it('renders the current hardware overview and setup actions', async () => {
    render(
      <MemoryRouter>
        <Controllers />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /^hardware$/i })).toBeInTheDocument();
    expect(screen.getByText(/your devices, farm links, and sensor status/i)).toBeInTheDocument();
    expect(screen.getByText(/greenhouse controller/i)).toBeInTheDocument();
    expect(screen.getByText(/not linked to a farm/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set up hardware/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /link to farm/i })).toBeInTheDocument();
  });
});
