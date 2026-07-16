import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Controllers from '../main/Controllers';
import { getFarmControllers, getFarmSensorBases, getFarms, getSensorModules } from '../../services/farmService';

vi.mock('../../services/farmService', () => ({
  getFarms: vi.fn(),
  getFarmControllers: vi.fn(),
  getFarmSensorBases: vi.fn(),
  getSensorModules: vi.fn(),
}));

describe('Controllers dashboard', () => {
  beforeEach(() => {
    vi.mocked(getFarms).mockResolvedValue([
      {
        id: 'farm-1',
        name: 'North Farm',
        role: 'owner',
        created_at: '2026-04-28',
        updated_at: '2026-04-28',
      },
    ]);
    vi.mocked(getFarmControllers).mockResolvedValue([
      {
        id: 'gateway-1',
        farm_id: 'farm-1',
        serial_number: 'CTRL-100',
        model: 'WiFi Controller',
        status: 'online',
        last_seen: '2026-05-01T10:00:00Z',
        field_ids: ['field-1'],
        created_at: '2026-04-28',
        updated_at: '2026-04-28',
      },
    ]);
    vi.mocked(getFarmSensorBases).mockResolvedValue([
      {
        id: 'base-1',
        gateway_id: 'gateway-1',
        serial_number: 'BASE-1',
        label: 'Canopy row',
        status: 'live',
        last_seen: '2026-05-01T10:00:00Z',
        current_assignment: {
          id: 'assign-1',
          base_id: 'base-1',
          field_id: 'field-1',
          field_name: 'West Field',
          monitoring_zone: null,
          assigned_at: '2026-05-01T10:00:00Z',
          unassigned_at: null,
        },
        created_at: '2026-04-28',
        updated_at: '2026-04-28',
      },
    ]);
    vi.mocked(getSensorModules).mockResolvedValue([
      {
        id: 'module-1',
        base_id: 'base-1',
        slot_number: 1,
        model: 'DHT22',
        status: 'live',
        channels: [
          {
            id: 'channel-1',
            module_id: 'module-1',
            channel_key: 'temperature',
            measurement_type: 'temperature',
            unit: 'C',
            calibration_json: {},
            created_at: '2026-04-28',
            updated_at: '2026-04-28',
          },
        ],
        created_at: '2026-04-28',
        updated_at: '2026-04-28',
      },
    ]);
  });

  it('renders controller inventory with farm context', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/controllers', state: { message: 'Controller linked.' } }]}>
        <Controllers />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /controllers/i })).toBeInTheDocument();
    expect(screen.getByText(/north farm/i)).toBeInTheDocument();
    expect(screen.getByText(/ctrl-100/i)).toBeInTheDocument();
    expect(screen.getByText(/controller linked/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /farm setup/i })).toBeInTheDocument();
  });
});
