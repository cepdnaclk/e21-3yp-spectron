import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminAudit from '../admin/AdminAudit';
import { getAdminAuditEvents } from '../../services/adminService';

vi.mock('../../services/adminService', () => ({
  getAdminAuditEvents: vi.fn(),
}));

const mockedGetAdminAuditEvents = vi.mocked(getAdminAuditEvents);

describe('AdminAudit', () => {
  beforeEach(() => {
    mockedGetAdminAuditEvents.mockResolvedValue({
      events: [
        {
          id: 'event-1',
          actorEmail: 'admin@spectron.local',
          action: 'DEVICE_REGISTERED',
          targetType: 'CONTROLLER',
          targetId: 'controller-1',
          targetLabel: 'CTRL-ABC123',
          outcome: 'SUCCESS',
          details: { name: 'Main Controller' },
          ipAddress: '127.0.0.1',
          createdAt: '2026-06-15T12:00:00Z',
        },
      ],
      total: 1,
      limit: 25,
      offset: 0,
    });
  });

  it('loads and renders audit events', async () => {
    render(<AdminAudit />);

    expect(await screen.findByText('Device Registered')).toBeInTheDocument();
    expect(screen.getByText('admin@spectron.local')).toBeInTheDocument();
    expect(screen.getByText('CTRL-ABC123')).toBeInTheDocument();
    expect(mockedGetAdminAuditEvents).toHaveBeenCalledWith({
      limit: 25,
      offset: 0,
      action: undefined,
      search: undefined,
    });
  });

  it('submits the actor or target search', async () => {
    render(<AdminAudit />);
    await screen.findByText('Device Registered');

    fireEvent.change(screen.getByLabelText('Search actor or target'), {
      target: { value: 'CTRL-ABC123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(mockedGetAdminAuditEvents).toHaveBeenLastCalledWith({
        limit: 25,
        offset: 0,
        action: undefined,
        search: 'CTRL-ABC123',
      });
    });
  });
});
