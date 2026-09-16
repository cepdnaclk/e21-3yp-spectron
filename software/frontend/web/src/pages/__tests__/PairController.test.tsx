import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PairController from '../main/PairController';
import {
  extractControllerId,
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
    extractControllerId: vi.fn(actual.extractControllerId),
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

describe('PairController', () => {
  beforeEach(() => {
    enableCameraSupport();
    qrMockState.decodedText = 'https://spectron.test/pair?code=CTRL-SCAN42';
    qrMockState.start.mockClear();
    qrMockState.stop.mockClear();
    qrMockState.clear.mockClear();
    vi.mocked(extractControllerId).mockImplementation((value: string) => {
      const match = value.match(/CTRL-[A-Z0-9-]+/i);
      return match ? match[0].toUpperCase() : '';
    });
    vi.mocked(pairHardwareController).mockResolvedValue({
      controllerId: 'CTRL-TEST123',
      routeId: 'CTRL-TEST123',
      status: 'paired',
      sensors: [],
    } as any);
  });

  it('renders the current pairing controls and accepts a device code', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PairController />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /connect farm device/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /device code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan device/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect device/i })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /device code/i }), 'CTRL-TEST123');

    expect(screen.getByRole('textbox', { name: /device code/i })).toHaveValue('CTRL-TEST123');
  });

  it('shows a validation error for empty device code', async () => {
    render(
      <MemoryRouter>
        <PairController />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: /connect device/i });
    fireEvent.submit(screen.getByRole('textbox', { name: /device code/i }).closest('form') as HTMLFormElement);

    expect(await screen.findByText(/device code required/i)).toBeInTheDocument();
    expect(pairHardwareController).not.toHaveBeenCalled();
  });

  it('calls the pairing API with a valid device code', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PairController />
      </MemoryRouter>
    );

    await user.type(await screen.findByRole('textbox', { name: /device code/i }), 'CTRL-TEST123');
    await user.click(screen.getByRole('button', { name: /connect device/i }));

    await waitFor(() => {
      expect(pairHardwareController).toHaveBeenCalledWith('CTRL-TEST123');
    });
  });

  it('fills the device code after a valid QR scan result', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PairController />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: /scan device/i }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /device code/i })).toHaveValue('CTRL-SCAN42');
    });
    expect(screen.getByText(/device scanned successfully/i)).toBeInTheDocument();
  });

  it('shows an error after an invalid QR scan result', async () => {
    const user = userEvent.setup();
    qrMockState.decodedText = 'not-a-spectron-controller';

    render(
      <MemoryRouter>
        <PairController />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: /scan device/i }));

    expect(await screen.findByText(/invalid device qr code/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /device code/i })).toHaveValue('');
  });
});
