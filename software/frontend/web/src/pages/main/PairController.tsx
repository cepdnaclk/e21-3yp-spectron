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
} from '@mui/material';
import { CameraAlt, QrCodeScanner } from '@mui/icons-material';
import { Html5Qrcode } from 'html5-qrcode';
import {
  extractControllerId,
  pairHardwareController,
} from '../../services/hardwarePairingService';
import AutoDismissAlert from '../../components/AutoDismissAlert';

const SCANNER_REGION_ID = 'spectron-controller-qr-reader';

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

  useEffect(() => {
    setIsScannerSupported(Boolean(navigator.mediaDevices?.getUserMedia));

    const controllerIdFromUrl = extractControllerId(window.location.href);
    if (controllerIdFromUrl) {
      setControllerCode(controllerIdFromUrl);
      setScanInfo(`Controller ID loaded: ${controllerIdFromUrl}`);
    }

    return () => {
      stopCamera();
    };
  }, []);

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
    } catch {
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
      const pairing = await pairHardwareController(normalizedControllerId);
      setControllerCode(normalizedControllerId);
      navigate(`/hardware/${pairing.controllerId}/sensors`, {
        state: {
          controllerId: pairing.controllerId,
          sensors: pairing.sensors,
          paired: true,
          observationMessage: `Controller ${pairing.controllerId} claimed successfully.`,
        },
      });
    } catch (err: any) {
      const responseData = err?.response?.data;
      const message =
        err?.response?.status === 409
          ? typeof responseData === 'string'
            ? responseData
            : 'This controller is already claimed by another account.'
          : typeof responseData === 'string'
          ? responseData
          : responseData?.message || err?.message || 'Pairing failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, md: 3 } }}>
      <Paper elevation={0} sx={{ p: { xs: 1.5, sm: 2.5, md: 3.5 }, borderRadius: 2, border: 'none', backgroundColor: 'transparent' }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'rgba(235, 79, 18, 0.12)' }}>
            <QrCodeScanner color="secondary" />
          </Box>
          <Box>
            <Typography variant="h4">Scan Controller QR</Typography>
          </Box>
        </Stack>
        <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 680, display: { xs: 'none', sm: 'block' } }}>
          Scan the QR code on the controller label or enter the controller ID manually. A controller can be added only while it is unowned.
        </Typography>

        <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
          {error}
        </AutoDismissAlert>

        <Box component="form" onSubmit={handlePair} sx={{ mt: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, borderTop: '1px solid rgba(60, 57, 17, 0.08)' }}>
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

          <AutoDismissAlert open={Boolean(scanInfo)} severity="success" sx={{ mb: 2 }} onCloseAlert={() => setScanInfo('')}>
            {scanInfo}
          </AutoDismissAlert>

          <TextField
            fullWidth
            label="Controller ID"
            value={controllerCode}
            onChange={(e) => setControllerCode(e.target.value)}
            placeholder="e.g., CTRL-8F2A19"
            disabled={loading}
            required
          />
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
