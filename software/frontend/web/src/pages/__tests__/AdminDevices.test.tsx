import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminDevices from '../admin/AdminDevices';
import { getAdminDevices } from '../../services/adminService';

vi.mock('../../services/adminService', () => ({
  getAdminDevices: vi.fn(),
}));

describe('Admin device registry', () => {
  const print = vi.fn();

  beforeEach(() => {
    vi.mocked(getAdminDevices).mockResolvedValue([
      {
        id: 'device-1',
        controllerId: 'CTRL-ADMIN1',
        name: 'Warehouse Controller',
        status: 'OFFLINE',
        claimStatus: 'UNCLAIMED',
        operationalStatus: 'OFFLINE',
        sensorCount: 3,
        configuredSensors: 0,
      },
    ]);
    Object.defineProperty(window, 'print', {
      value: print,
      configurable: true,
    });
  });

  it('shows separate statuses and supports copying and printing an existing QR', async () => {
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    render(
      <MemoryRouter>
        <AdminDevices />
      </MemoryRouter>
    );

    expect(await screen.findByText('CTRL-ADMIN1')).toBeInTheDocument();
    expect(screen.getAllByText(/^unclaimed$/i)).toHaveLength(2);
    expect(screen.getByText(/^offline$/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /copy qr for ctrl-admin1/i }));
    expect(clipboardWrite).toHaveBeenCalledWith('CTRL-ADMIN1');
    expect(await screen.findByText(/qr payload copied/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /print qr for ctrl-admin1/i }));
    await waitFor(() => expect(print).toHaveBeenCalled());
  });
});
