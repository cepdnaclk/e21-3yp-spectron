import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Team from '../main/Team';
import { createViewer, deleteViewer, getAccountUsers } from '../../services/authService';

vi.mock('../../services/authService', () => ({
  createViewer: vi.fn(),
  deleteViewer: vi.fn(),
  getAccountUsers: vi.fn(),
}));

describe('Viewer accounts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('reloads the table after a viewer is created', async () => {
    const user = userEvent.setup();
    vi.mocked(getAccountUsers)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'viewer-1',
          email: 'test@spectron.com',
          name: 'Test Viewer',
          phone: '+94770000000',
          role: 'VIEWER',
          status: 'ACTIVE',
          created_at: '2026-06-11T12:00:00Z',
        },
      ]);
    vi.mocked(createViewer).mockResolvedValue({
      id: 'viewer-1',
      email: 'test@spectron.com',
      name: 'Test Viewer',
      phone: '+94770000000',
      status: 'ACTIVE',
      accounts: [],
    });

    render(<Team />);

    await user.type(screen.getByRole('textbox', { name: /viewer email/i }), 'test@spectron.com');
    await user.type(screen.getByLabelText(/temporary password/i), 'password');
    await user.type(screen.getByRole('textbox', { name: /viewer name/i }), 'Test Viewer');
    await user.click(screen.getByRole('button', { name: /create viewer/i }));

    expect(createViewer).toHaveBeenCalledWith({
      email: 'test@spectron.com',
      password: 'password',
      name: 'Test Viewer',
      phone: undefined,
    });
    expect(await screen.findByText('Test Viewer')).toBeInTheDocument();
    expect(screen.getByText('test@spectron.com')).toBeInTheDocument();
    expect(screen.getByText(/^viewer$/i)).toBeInTheDocument();
    expect(screen.getByText(/^active$/i)).toBeInTheDocument();
    expect(screen.getByText(/viewer account created/i)).toBeInTheDocument();
    expect(getAccountUsers).toHaveBeenCalledTimes(2);
  });

  it('keeps the created viewer visible when the backend list has not caught up', async () => {
    const user = userEvent.setup();
    vi.mocked(getAccountUsers)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.mocked(createViewer).mockResolvedValue({
      id: 'viewer-2',
      email: 'cached@spectron.com',
      name: 'Cached Viewer',
      phone: undefined,
      status: 'ACTIVE',
      accounts: [],
    });

    render(<Team />);

    await user.type(screen.getByRole('textbox', { name: /viewer email/i }), 'cached@spectron.com');
    await user.type(screen.getByLabelText(/temporary password/i), 'password');
    await user.type(screen.getByRole('textbox', { name: /viewer name/i }), 'Cached Viewer');
    await user.click(screen.getByRole('button', { name: /create viewer/i }));

    expect(await screen.findByText('Cached Viewer')).toBeInTheDocument();
    expect(screen.getByText('cached@spectron.com')).toBeInTheDocument();
    expect(screen.queryByText(/no viewer accounts created yet/i)).not.toBeInTheDocument();
  });

  it('removes a viewer from the table', async () => {
    const user = userEvent.setup();
    vi.mocked(getAccountUsers).mockResolvedValueOnce([
      {
        id: 'viewer-3',
        email: 'remove@spectron.com',
        name: 'Removed Viewer',
        phone: undefined,
        role: 'VIEWER',
        status: 'ACTIVE',
        created_at: '2026-06-11T12:00:00Z',
      },
    ]);
    vi.mocked(deleteViewer).mockResolvedValue();

    render(<Team />);

    expect(await screen.findByText('Removed Viewer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove viewer remove@spectron.com/i }));

    expect(deleteViewer).toHaveBeenCalledWith('viewer-3');
    await waitFor(() => {
      expect(screen.queryByText('Removed Viewer')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/viewer account removed/i)).toBeInTheDocument();
  });
});
