import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FarmDetails from '../main/FarmDetails';
import {
  addFarmCollaborator,
  acknowledgeFarmAlert,
  assignSensorBase,
  attachFarmController,
  confirmCropStage,
  createCropInstance,
  createField,
  createSensorBase,
  createSensorModule,
  getCrops,
  getFarm,
  getFarmAlerts,
  getFarmCollaborators,
  getFarmControllers,
  getFarmFields,
  getFarmSensorBases,
  getFieldCropInstances,
  getSensorBaseAssignments,
  getSensorModules,
  removeFarmCollaborator,
} from '../../services/farmService';

vi.mock('../../components/FarmLocationPicker', () => ({
  default: () => <div data-testid="field-location-picker" />,
}));

vi.mock('../../services/farmService', () => ({
  addFarmCollaborator: vi.fn(),
  acknowledgeFarmAlert: vi.fn(),
  assignSensorBase: vi.fn(),
  attachFarmController: vi.fn(),
  confirmCropStage: vi.fn(),
  createCropInstance: vi.fn(),
  createField: vi.fn(),
  createSensorBase: vi.fn(),
  createSensorModule: vi.fn(),
  getCrops: vi.fn(),
  getFarm: vi.fn(),
  getFarmAlerts: vi.fn(),
  getFarmCollaborators: vi.fn(),
  getFarmControllers: vi.fn(),
  getFarmFields: vi.fn(),
  getFarmSensorBases: vi.fn(),
  getFieldCropInstances: vi.fn(),
  getSensorBaseAssignments: vi.fn(),
  getSensorModules: vi.fn(),
  removeFarmCollaborator: vi.fn(),
}));

describe('FarmDetails field location setup', () => {
  beforeEach(() => {
    vi.mocked(getFarm).mockResolvedValue({
      id: 'farm-1',
      name: 'North Farm',
      role: 'owner',
      created_at: '2026-07-17T00:00:00Z',
      updated_at: '2026-07-17T00:00:00Z',
    });
    vi.mocked(getFarmFields).mockResolvedValue([]);
    vi.mocked(getFarmCollaborators).mockResolvedValue([]);
    vi.mocked(getCrops).mockResolvedValue([]);
    vi.mocked(getFarmControllers).mockResolvedValue([]);
    vi.mocked(getFarmSensorBases).mockResolvedValue([]);
    vi.mocked(getFarmAlerts).mockResolvedValue([]);
    vi.mocked(getFieldCropInstances).mockResolvedValue([]);
    vi.mocked(getSensorModules).mockResolvedValue([]);
    vi.mocked(getSensorBaseAssignments).mockResolvedValue([]);
    vi.mocked(createField).mockResolvedValue({
      id: 'field-1',
      farm_id: 'farm-1',
      name: 'Field 1',
      area: null,
      latitude: null,
      longitude: null,
      created_at: '2026-07-17T00:00:00Z',
      updated_at: '2026-07-17T00:00:00Z',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the shared location picker instead of latitude and longitude fields', async () => {
    render(
      <MemoryRouter initialEntries={['/farms/farm-1']}>
        <Routes>
          <Route path="/farms/:farmId" element={<FarmDetails />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: /north farm/i });
    await userEvent.click(screen.getByRole('button', { name: /create a field to hold crops and monitoring areas/i }));

    expect(screen.getByTestId('field-location-picker')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^latitude$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^longitude$/i)).not.toBeInTheDocument();
  });
});
