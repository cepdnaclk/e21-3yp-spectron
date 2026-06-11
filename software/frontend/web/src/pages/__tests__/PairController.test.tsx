import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PairController from '../main/PairController';
import {
  pairHardwareController,
} from '../../services/hardwarePairingService';

const qrMockState = vi.hoisted(() => ({
  decodedText: 'https://spectron.test/pair?code=CTRL-SCAN42',
  start: vi.fn(),
  stop: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn(function (this: any) {
    this.isScanning = true;
    this.start = qrMockState.start.mockImplementation(async (_camera, _config, onScanSuccess) => {
      await onScanSuccess(qrMockState.decodedText);
    });
    this.stop = qrMockState.stop.mockResolvedValue(undefined);
    this.clear = qrMockState.clear;
  }),
}));

vi.mock('../../services/hardwarePairingService', async () => {
  const actual = await vi.importActual<typeof import('../../services/hardwarePairingService')>(
    '../../services/hardwarePairingService'
  );

  return {
    ...actual,
    pairHardwareController: vi.fn(),
  };
});

const enableCameraSupport = () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn(),
    },
    configurable: true,
  });
};

const PairingDestination = () => {
  const location = useLocation();
  const state = location.state as { observationMessage?: string } | null;
  return <div>{state?.observationMessage}</div>;
};

describe('PairController', () => {
  beforeEach(() => {
    enableCameraSupport();
    qrMockState.decodedText = 'https://spectron.test/pair?code=CTRL-SCAN42';
    qrMockState.start.mockClear();
    qrMockState.stop.mockClear();
    qrMockState.clear.mockClear();
    vi.mocked(pairHardwareController).mockResolvedValue({
      controllerId: 'CTRL-TEST123',
      status: 'paired',
      claimStatus: 'CLAIMED',
      operationalStatus: 'OFFLINE',
      sensors: [],
    });
  });

  it('renders pairing controls and accepts a controller ID', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/controllers/pair']}>
        <Routes>
          <Route path="/controllers/pair" element={<PairController />} />
          <Route path="/hardware/:controllerId/sensors" element={<PairingDestination />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: /start camera scanner/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /controller id/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add controller/i })).toBeInTheDocument();
    expect(screen.queryByText(/attach to existing system/i)).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /controller id/i }), 'CTRL-TEST123');

    expect(screen.getByRole('textbox', { name: /controller id/i })).toHaveValue('CTRL-TEST123');
  });

  it('shows a validation error for empty controller ID', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/controllers/pair']}>
        <Routes>
          <Route path="/controllers/pair" element={<PairController />} />
          <Route path="/hardware/:controllerId/sensors" element={<PairingDestination />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: /add controller/i });
    fireEvent.submit(screen.getByRole('textbox', { name: /controller id/i }).closest('form') as HTMLFormElement);

    expect(await screen.findByText(/controller id required/i)).toBeInTheDocument();
    expect(pairHardwareController).not.toHaveBeenCalled();
  });

  it('calls the pairing API with a valid controller ID', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/controllers/pair']}>
        <Routes>
          <Route path="/controllers/pair" element={<PairController />} />
          <Route path="/hardware/:controllerId/sensors" element={<PairingDestination />} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(await screen.findByRole('textbox', { name: /controller id/i }), 'CTRL-TEST123');
    await user.click(screen.getByRole('button', { name: /add controller/i }));

    await waitFor(() => {
      expect(pairHardwareController).toHaveBeenCalledWith('CTRL-TEST123');
    });
    expect(await screen.findByText(/controller ctrl-test123 claimed successfully/i)).toBeInTheDocument();
  });

  it('shows a clear error when the controller is already claimed', async () => {
    const user = userEvent.setup();
    vi.mocked(pairHardwareController).mockRejectedValue({
      response: {
        status: 409,
        data: 'This controller is already claimed by another account.',
      },
    });

    render(
      <MemoryRouter>
        <PairController />
      </MemoryRouter>
    );

    await user.type(await screen.findByRole('textbox', { name: /controller id/i }), 'CTRL-TEST123');
    await user.click(screen.getByRole('button', { name: /add controller/i }));

    expect(await screen.findByText(/already claimed by another account/i)).toBeInTheDocument();
  });

  it('fills the controller ID after a valid QR scan result', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PairController />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: /start camera scanner/i }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /controller id/i })).toHaveValue('CTRL-SCAN42');
    });
    expect(screen.getByText(/scanned controller id: ctrl-scan42/i)).toBeInTheDocument();
  });

  it('shows an error after an invalid QR scan result', async () => {
    const user = userEvent.setup();
    qrMockState.decodedText = 'not-a-spectron-controller';

    render(
      <MemoryRouter>
        <PairController />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: /start camera scanner/i }));

    expect(await screen.findByText(/invalid controller qr code/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /controller id/i })).toHaveValue('');
  });
});
