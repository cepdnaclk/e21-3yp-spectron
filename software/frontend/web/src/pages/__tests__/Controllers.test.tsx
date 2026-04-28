import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Controllers from '../main/Controllers';
import { getMyHardwareControllers } from '../../services/hardwarePairingService';

vi.mock('../../services/hardwarePairingService', () => ({
  getMyHardwareControllers: vi.fn(),
}));

describe('Controllers dashboard', () => {
  beforeEach(() => {
    vi.mocked(getMyHardwareControllers).mockResolvedValue([
      {
        id: 'CTRL-100',
        account_id: 'account-1',
        hw_id: 'CTRL-100',
        name: 'Greenhouse Controller',
        status: 'ONLINE',
        purpose: 'Greenhouse monitoring',
        location: 'Greenhouse A',
        created_at: '2026-04-28',
      },
    ]);
  });

  it('renders controller dashboard sections and pairing action', async () => {
    render(
      <MemoryRouter>
        <Controllers />
      </MemoryRouter>
    );

    expect(await screen.findByText(/controller fleet/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /keep every spectron node in view/i })).toBeInTheDocument();
    expect(screen.getByText(/greenhouse controller/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /add controller/i }).length).toBeGreaterThan(0);
  });
});
