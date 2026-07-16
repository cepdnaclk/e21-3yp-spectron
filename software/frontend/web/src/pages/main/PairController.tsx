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
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
} from '@mui/material';
import { CameraAlt, QrCodeScanner } from '@mui/icons-material';
import { Html5Qrcode } from 'html5-qrcode';
import {
  extractControllerId,
  pairHardwareController,
} from '../../services/hardwarePairingService';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { attachFarmController, Farm, getFarms } from '../../services/farmService';

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
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState('');

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

  useEffect(() => {
    const loadFarms = async () => {
      try {
        const nextFarms = (await getFarms()).filter((farm) => farm.role === 'owner');
        setFarms(nextFarms);
        setSelectedFarmId((current) => current || nextFarms[0]?.id || '');
      } catch (err) {
        console.error(err);
        setError('Failed to load farms.');
      }
    };
    void loadFarms();
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
    if (!selectedFarmId) {
      setError('Create or select a farm first.');
      return;
    }

    setLoading(true);
    try {
      const pairing = await pairHardwareController(normalizedControllerId);
      await attachFarmController(selectedFarmId, {
        controller_id: pairing.controllerId,
      });
      setControllerCode(normalizedControllerId);
      navigate(`/farms/${selectedFarmId}`, {
        state: {
          controllerId: pairing.controllerId,
          paired: true,
          message: `Controller ${pairing.controllerId} linked.`,
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
          Scan the controller QR, choose the farm, then link it.
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
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Farm</InputLabel>
            <Select
              label="Farm"
              value={selectedFarmId}
              onChange={(event) => setSelectedFarmId(event.target.value)}
              disabled={loading || farms.length === 0}
            >
              {farms.map((farm) => (
                <MenuItem key={farm.id} value={farm.id}>
                  {farm.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {farms.length === 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Create a farm before linking a controller.
            </Alert>
          )}
          <Button
            type="submit"
            variant="contained"
            color="secondary"
            fullWidth
            sx={{ mt: 2 }}
            disabled={loading || farms.length === 0}
          >
            {loading ? 'Linking...' : 'Link Controller'}
          </Button>
          {farms.length === 0 && (
            <Button variant="outlined" fullWidth sx={{ mt: 1 }} onClick={() => navigate('/farms')}>
              Farm Setup
            </Button>
          )}
        </Box>
      </Paper>
    </Container>
  );
};

export default PairController;
