import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Stack,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material';
import { CameraAlt, QrCodeScanner } from '@mui/icons-material';
import { Html5Qrcode } from 'html5-qrcode';
import {
  extractControllerId,
  getMySystems,
  HardwareSystemSummary,
  pairHardwareController,
} from '../../services/hardwarePairingService';

const SCANNER_REGION_ID = 'spectron-controller-qr-reader';

const isGenericSystemName = (name?: string) => {
  const normalized = (name || '').trim().toLowerCase();
  return normalized === '' || normalized === 'main controller' || normalized === 'unnamed controller';
};

const getSystemDisplayName = (system: HardwareSystemSummary) => {
  if (!isGenericSystemName(system.name)) {
    return system.name;
  }
  if (system.location?.trim()) {
    return `System at ${system.location.trim()}`;
  }
  if (system.purpose?.trim()) {
    return system.purpose.trim();
  }
  return `Existing system ${system.id.slice(0, 8).toUpperCase()}`;
};

const getSystemSubtitle = (system: HardwareSystemSummary) => {
  const details = [system.location, system.purpose].filter((value) => value && value.trim().length > 0);
  const summary = `${system.sensorCount} sensor${system.sensorCount === 1 ? '' : 's'} saved`;
  if (details.length > 0) {
    return `${details[0]} • ${summary}`;
  }
  return `Standby monitoring setup • ${summary}`;
};

const PairController: React.FC = () => {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanHandledRef = useRef(false);
  const [controllerCode, setControllerCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanInfo, setScanInfo] = useState('');
  const [isScannerSupported, setIsScannerSupported] = useState(false);
  const [isCameraRunning, setIsCameraRunning] = useState(false);
  const [availableSystems, setAvailableSystems] = useState<HardwareSystemSummary[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState('');

  useEffect(() => {
    setIsScannerSupported(Boolean(navigator.mediaDevices?.getUserMedia));

    const controllerIdFromUrl = extractControllerId(window.location.href);
    if (controllerIdFromUrl) {
      setControllerCode(controllerIdFromUrl);
      setScanInfo(`Controller ID loaded: ${controllerIdFromUrl}`);
    }

    void loadSystems();

    return () => {
      stopCamera();
    };
  }, []);

  const loadSystems = async () => {
    try {
      const systems = await getMySystems();
      setAvailableSystems(systems.filter((system) => !system.activeControllerId));
    } catch (loadError) {
      console.error('Failed to load systems:', loadError);
    }
  };

  const stopCamera = async () => {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      } catch {
        // The scanner may already be stopped by the browser or by a completed scan.
      }
    }

    scannerRef.current = null;
    scanHandledRef.current = false;
    setIsCameraRunning(false);
  };

  const startCamera = async () => {
    setError('');
    setScanInfo('Scanning...');

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is not available in this browser. Enter the controller ID manually.');
      return;
    }

    try {
      await stopCamera();
      setIsCameraRunning(true);
      scanHandledRef.current = false;

      await new Promise((resolve) => window.setTimeout(resolve, 0));

      const scanner = new Html5Qrcode(SCANNER_REGION_ID);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          if (scanHandledRef.current) {
            return;
          }

          const value = extractControllerId(decodedText || '');
          if (!value) {
            setError('Invalid controller QR code');
            return;
          }

          scanHandledRef.current = true;
          setControllerCode(value);
          setScanInfo(`Scanned controller ID: ${value}`);
          await stopCamera();
        },
        () => undefined
      );
    } catch (cameraError) {
      await stopCamera();
      setError('Camera permission denied or camera scanner unavailable. Enter the controller ID manually.');
    }
  };

  const handlePair = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const normalizedControllerId = extractControllerId(controllerCode);

    if (!normalizedControllerId) {
      setError(controllerCode.trim() ? 'Invalid controller QR code' : 'Controller ID required');
      return;
    }

    setLoading(true);
    try {
      const pairing = await pairHardwareController(normalizedControllerId, selectedSystemId || undefined);
      setControllerCode(normalizedControllerId);
      navigate(`/hardware/${pairing.controllerId}/sensors`, {
        state: {
          controllerId: pairing.controllerId,
          sensors: pairing.sensors,
          paired: true,
        },
      });
    } catch (err: any) {
      const responseData = err?.response?.data;
      const message =
        typeof responseData === 'string'
          ? responseData
          : responseData?.message || err?.message || 'Pairing failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, md: 3 } }}>
      <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 2, border: 'none', backgroundColor: 'transparent' }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'rgba(235, 79, 18, 0.12)' }}>
            <QrCodeScanner color="secondary" />
          </Box>
          <Box>
            <Typography variant="overline" color="secondary" fontWeight={800}>
              Controller setup
            </Typography>
            <Typography variant="h4">Scan Controller QR</Typography>
          </Box>
        </Stack>
        <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 680 }}>
          Scan the QR code on the controller label or enter the controller ID manually. A controller can be added only while it is unowned.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handlePair} sx={{ mt: 3, pt: 3, borderTop: '1px solid rgba(60, 57, 17, 0.08)' }}>
          {isScannerSupported ? (
            <Box sx={{ mb: 2 }}>
              {!isCameraRunning ? (
                <Button type="button" variant="outlined" fullWidth onClick={startCamera} startIcon={<CameraAlt />}>
                  Start Camera Scanner
                </Button>
              ) : (
                <Button type="button" variant="outlined" color="secondary" fullWidth onClick={stopCamera} startIcon={<CameraAlt />}>
                  Stop Camera Scanner
                </Button>
              )}
              <Box
                sx={{
                  mt: 1,
                  borderRadius: 2,
                  overflow: 'hidden',
                  border: '1.5px solid',
                  borderColor: 'divider',
                  bgcolor: '#262411',
                  display: isCameraRunning ? 'block' : 'none',
                }}
              >
                <Box id={SCANNER_REGION_ID} sx={{ width: '100%', maxHeight: 280 }} />
              </Box>
            </Box>
          ) : (
            <Alert severity="info" sx={{ mb: 2 }}>
              Camera QR scanning is not available in this browser. Enter the controller ID manually if the scanner is unavailable.
            </Alert>
          )}

          {scanInfo && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {scanInfo}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Controller ID"
            value={controllerCode}
            onChange={(e) => setControllerCode(e.target.value)}
            placeholder="e.g., CTRL-8F2A19"
            disabled={loading}
            required
          />
          {availableSystems.length > 0 && (
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel id="pair-system-select-label">Attach To Existing System</InputLabel>
              <Select
                labelId="pair-system-select-label"
                value={selectedSystemId}
                label="Attach To Existing System"
                onChange={(event) => setSelectedSystemId(event.target.value)}
                disabled={loading}
              >
                <MenuItem value="">
                  Create New System
                </MenuItem>
                {availableSystems.map((system) => (
                  <MenuItem key={system.id} value={system.id}>
                    <Box>
                      <Typography variant="body2" fontWeight={700}>
                        {getSystemDisplayName(system)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {getSystemSubtitle(system)}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                Reattach this controller to a saved monitoring system, or leave it on
                “Create New System” to start a fresh setup.
              </FormHelperText>
            </FormControl>
          )}
          <Button
            type="submit"
            variant="contained"
            color="secondary"
            fullWidth
            sx={{ mt: 2 }}
            disabled={loading}
          >
            {loading ? 'Adding...' : 'Add Controller'}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default PairController;
