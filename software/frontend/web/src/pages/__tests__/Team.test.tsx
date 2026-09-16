import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Team from '../main/Team';
import {
  addFarmCollaborator,
  getFarmCollaborators,
  getFarms,
  removeFarmCollaborator,
} from '../../services/farmService';

vi.mock('../../services/farmService', () => ({
  addFarmCollaborator: vi.fn(),
  getFarmCollaborators: vi.fn(),
  getFarms: vi.fn(),
  removeFarmCollaborator: vi.fn(),
}));

const ownerFarm = {
  id: 'farm-1',
  name: 'North Farm',
  role: 'owner' as const,
  created_at: '2026-06-11T12:00:00Z',
  updated_at: '2026-06-11T12:00:00Z',
};

const owner = {
  user_id: 'owner-1',
  email: 'owner@spectron.com',
  name: 'Farm Owner',
  role: 'owner' as const,
  added_at: '2026-06-11T12:00:00Z',
};

const viewer = {
  user_id: 'viewer-1',
  email: 'test@spectron.com',
  name: 'Test Viewer',
  role: 'viewer' as const,
  added_at: '2026-06-11T12:00:00Z',
};

const renderTeam = async () => {
  render(<Team />);
  await screen.findByRole('button', { name: /^invite$/i });
};

describe('Viewer farm access', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(getFarms).mockResolvedValue([ownerFarm]);
    vi.mocked(addFarmCollaborator).mockResolvedValue(undefined);
    vi.mocked(removeFarmCollaborator).mockResolvedValue(undefined);
  });

  it('reloads the farm viewer list after a viewer is invited', async () => {
    const user = userEvent.setup();
    vi.mocked(getFarmCollaborators)
      .mockResolvedValueOnce([owner])
      .mockResolvedValueOnce([owner, viewer]);

    await renderTeam();

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'TEST@SPECTRON.COM');
    await user.click(screen.getByRole('button', { name: /^invite$/i }));

    expect(addFarmCollaborator).toHaveBeenCalledWith('farm-1', {
      email: 'test@spectron.com',
      role: 'viewer',
    });
    expect(await screen.findByText('Test Viewer')).toBeInTheDocument();
    expect(screen.getByText('test@spectron.com')).toBeInTheDocument();
    expect(screen.getByText('Viewer invited.')).toBeInTheDocument();
    expect(getFarmCollaborators).toHaveBeenLastCalledWith('farm-1');
  });

  it('validates duplicate viewers before submitting', async () => {
    const user = userEvent.setup();
    vi.mocked(getFarmCollaborators).mockResolvedValue([owner, viewer]);

    await renderTeam();

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@spectron.com');
    await user.click(screen.getByRole('button', { name: /^invite$/i }));

    expect(addFarmCollaborator).not.toHaveBeenCalled();
    expect(screen.getByText('Viewer already has access.')).toBeInTheDocument();
  });

  it('removes a viewer from the table', async () => {
    const user = userEvent.setup();
    vi.mocked(getFarmCollaborators).mockResolvedValue([owner, viewer]);

    await renderTeam();

    const viewerRow = await screen.findByText('Test Viewer');
    expect(viewerRow).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove viewer test@spectron.com/i }));

    expect(removeFarmCollaborator).toHaveBeenCalledWith('farm-1', 'viewer-1');
    await waitFor(() => {
      expect(screen.queryByText('Test Viewer')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Viewer removed.')).toBeInTheDocument();
  });

  it('shows an empty viewer state for owner farms without viewers', async () => {
    vi.mocked(getFarmCollaborators).mockResolvedValue([owner]);

    await renderTeam();

    expect(await screen.findByText('No viewers')).toBeInTheDocument();
  });
});
