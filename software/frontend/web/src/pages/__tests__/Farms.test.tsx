import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Farms from '../main/Farms';
import { createFarm, getFarms } from '../../services/farmService';

vi.mock('../../services/farmService', () => ({
  getFarms: vi.fn(),
  createFarm: vi.fn(),
}));

vi.mock('../../services/geocodingService', () => ({
  searchPlaces: vi.fn(),
  reverseGeocode: vi.fn(),
}));

describe('Farms page location setup', () => {
  beforeEach(() => {
    vi.mocked(getFarms).mockResolvedValue([]);
    vi.mocked(createFarm).mockResolvedValue({
      id: 'farm-1',
      name: 'North Farm',
      role: 'owner',
      created_at: '2026-07-17T00:00:00Z',
      updated_at: '2026-07-17T00:00:00Z',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows farmer-friendly location options and hides coordinates by default', async () => {
    render(
      <MemoryRouter>
        <Farms />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: /my farms/i });
    await userEvent.click(screen.getAllByRole('button', { name: /add farm/i })[0]);

    expect(screen.getByRole('button', { name: /use my current location/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose on map/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search a place/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^latitude$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^longitude$/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /advanced/i }));
    expect(screen.getByLabelText(/^latitude$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^longitude$/i)).toBeInTheDocument();
  });

  it('creates a farm without requiring latitude and longitude', async () => {
    render(
      <MemoryRouter>
        <Farms />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: /my farms/i });
    await userEvent.click(screen.getAllByRole('button', { name: /add farm/i })[0]);
    await userEvent.type(screen.getByLabelText(/farm name/i), 'North Farm');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(createFarm).toHaveBeenCalled();
    });
    expect(vi.mocked(createFarm).mock.calls[0][0]).toMatchObject({
      name: 'North Farm',
      latitude: undefined,
      longitude: undefined,
    });
  });
});
