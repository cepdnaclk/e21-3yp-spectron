import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Collapse,
  FormControlLabel,
  GlobalStyles,
  Grid,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrowBack,
  CheckCircleOutline,
  ContentCopy,
  Print,
  QrCode2,
  Save,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { createAdminDevice, CreateAdminDeviceResponse } from '../../services/adminService';

const compactButtonSx = {
  minHeight: 36,
  px: 1.5,
  py: 0.5,
  borderRadius: 2,
  transition: 'transform 160ms ease, background-color 160ms ease, border-color 160ms ease',
  '&:hover': {
    transform: 'translateY(-1px)',
  },
  '&:active': {
    transform: 'translateY(0)',
  },
};

const AdminAddDevice: React.FC = () => {
  const navigate = useNavigate();
  const [controllerId, setControllerId] = useState('');
  const [name, setName] = useState('');

  const [createDefaultSensors, setCreateDefaultSensors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [helperMessage, setHelperMessage] = useState('');
  const [created, setCreated] = useState<CreateAdminDeviceResponse | null>(null);

  const qrPayload = created?.qrPayload || created?.device.controllerId || '';
  const claimRoute = created?.claimUrl || (qrPayload ? `/controllers/pair?code=${encodeURIComponent(qrPayload)}` : '');

  useEffect(() => {
    if (!error && !helperMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setError('');
      setHelperMessage('');
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [error, helperMessage]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setHelperMessage('');
    setSaving(true);
    try {
      const response = await createAdminDevice({
        controllerId: controllerId.trim() || undefined,
        name: name.trim(),

        createDefaultSensors,
      });
      setCreated(response);
    } catch (err: any) {
      const data = err?.response?.data;
      setError(typeof data === 'string' ? data : data?.message || 'Failed to create device.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (value: string, label: string) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setHelperMessage(`${label} copied.`);
    } catch {
      setError(`Failed to copy ${label.toLowerCase()}.`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const backButton = (
    <Box
      sx={{
        position: 'sticky',
        top: { xs: 12, md: 20 },
        zIndex: 5,
        display: 'flex',
        justifyContent: 'flex-start',
        mb: 1.5,
        pointerEvents: 'none',
      }}
    >
      <IconButton
        aria-label="Go back"
        onClick={() => navigate('/admin/devices')}
        sx={{
          pointerEvents: 'auto',
          border: '1px solid rgba(60, 57, 17, 0.12)',
          bgcolor: '#fffdf8',
          boxShadow: '0 12px 24px rgba(60, 57, 17, 0.08)',
          '&:hover': {
            bgcolor: '#fff8ed',
          },
        }}
      >
        <ArrowBack />
      </IconButton>
    </Box>
  );

  if (created) {
    return (
      <Box>
        <GlobalStyles
          styles={{
            '@page': {
              size: 'auto',
              margin: '10mm',
            },
            '@media print': {
              'html, body': {
                background: '#ffffff !important',
              },
              'body *': {
                visibility: 'hidden !important',
              },
              '.spectron-print-label, .spectron-print-label *': {
                visibility: 'visible !important',
              },
              '.spectron-print-label': {
                display: 'flex !important',
                position: 'fixed',
                left: 0,
                top: 0,
              },
            },
          }}
        />
        {backButton}

        <Box
          className="spectron-print-label"
          sx={{
            display: 'none',
            width: '70mm',
            minHeight: '46mm',
            p: '4mm',
            boxSizing: 'border-box',
            bgcolor: '#ffffff',
            color: '#262411',
            border: '1px solid #262411',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2mm',
            textAlign: 'center',
          }}
        >
          <Box
            component="img"
            src="/assets/spectron-logo-full.svg"
            alt="Spectron"
            sx={{ height: '8mm', width: 'auto', display: 'block' }}
          />
          <QRCodeSVG
            value={qrPayload}
            size={120}
            bgColor="#ffffff"
            fgColor="#262411"
            includeMargin
            imageSettings={{
              src: '/assets/spectron-logo.svg',
              height: 24,
              width: 24,
              excavate: true,
            }}
          />
          <Typography sx={{ fontSize: '11pt', fontWeight: 900, letterSpacing: 0.5, lineHeight: 1.1 }}>
            {created.device.controllerId}
          </Typography>
        </Box>

        <Typography variant="h4" sx={{ mb: 1 }}>
          Device Created
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 760, display: { xs: 'none', sm: 'block' } }}>
          The controller is now registered. Print the controller ID QR label or copy the ID before handing it off to the owner.
        </Typography>

        <Collapse in={Boolean(error)} timeout={260} unmountOnExit>
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        </Collapse>
        <Collapse in={Boolean(helperMessage)} timeout={260} unmountOnExit>
          <Alert severity="success" sx={{ mb: 2 }}>{helperMessage}</Alert>
        </Collapse>

        <Grid container spacing={2}>
          <Grid item xs={12} md={7}>
            <Card
              sx={{
                '@media print': {
                  boxShadow: 'none',
                  borderColor: 'rgba(60, 57, 17, 0.2)',
                },
              }}
            >
              <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
                <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2 }}>
                  <CheckCircleOutline color="success" />
                  <Typography variant="h6">Ready to hand off</Typography>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
                  <Chip label={created.device.controllerId} color="primary" />
                  <Chip label={created.device.name} variant="outlined" />
                  <Chip label="Reusable controller label" variant="outlined" />
                </Stack>

                <Box
                  sx={{
                    p: 2.5,
                    borderRadius: 2,
                    bgcolor: '#fffaf4',
                    border: '1px solid rgba(60, 57, 17, 0.12)',
                    display: 'grid',
                    placeItems: 'center',
                    minHeight: 320,
                  }}
                >
                  <QRCodeSVG
                    value={qrPayload}
                    size={220}
                    bgColor="#fffaf4"
                    fgColor="#262411"
                    includeMargin
                    imageSettings={{
                      src: '/assets/spectron-logo.svg',
                      height: 44,
                      width: 44,
                      excavate: true,
                    }}
                  />
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Scan this QR from the Add Controller flow, or type the controller ID manually.
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={5}>
            <Stack spacing={2}>
              <Card>
                <CardContent>
                  <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2 }}>
                    <QrCode2 color="primary" />
                    <Typography variant="h6">Controller label</Typography>
                  </Stack>

                  <Typography variant="caption" color="text.secondary">
                    Controller ID
                  </Typography>
                  <Typography variant="h5" sx={{ mb: 2, wordBreak: 'break-word' }}>
                    {created.device.controllerId}
                  </Typography>

                  <Typography variant="caption" color="text.secondary">
                    QR payload
                  </Typography>
                  <Box
                    sx={{
                      mt: 0.75,
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: '#fffaf4',
                      border: '1px dashed rgba(60, 57, 17, 0.22)',
                    }}
                  >
                    <Typography variant="h5" sx={{ wordBreak: 'break-word' }}>
                      {qrPayload}
                    </Typography>
                  </Box>

                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                    Claim route
                  </Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                    {claimRoute}
                  </Typography>

                  <Stack spacing={1.25} sx={{ mt: 2 }}>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<ContentCopy />}
                      onClick={() => handleCopy(qrPayload, 'Controller ID')}
                      sx={compactButtonSx}
                    >
                      Copy Controller ID
                    </Button>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<ContentCopy />}
                      onClick={() => handleCopy(claimRoute, 'Claim route')}
                      sx={compactButtonSx}
                    >
                      Copy Route
                    </Button>
                    <Button
                      fullWidth
                      variant="contained"
                      color="secondary"
                      startIcon={<Print />}
                      onClick={handlePrint}
                      sx={compactButtonSx}
                    >
                      Print QR
                    </Button>
                    <Button
                      fullWidth
                      variant="text"
                      onClick={() => navigate('/admin/devices')}
                      sx={compactButtonSx}
                    >
                      Done
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      </Box>
    );
  }

  return (
    <Box>
      {backButton}
      <Typography variant="h4" sx={{ mb: 1 }}>
        Add Controller
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 780, display: { xs: 'none', sm: 'block' } }}>
        Register the controller first. Once it is created, this page will switch into a QR label view for printing and copying the controller ID.
      </Typography>

      <Collapse in={Boolean(error)} timeout={260} unmountOnExit>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      </Collapse>

      <Card sx={{ maxWidth: 820 }}>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Controller ID"
              placeholder="CTRL-BOILER-001"
              value={controllerId}
              onChange={(e) => setControllerId(e.target.value)}
              helperText="Leave empty to generate a CTRL code automatically."
              margin="normal"
            />
            <TextField
              fullWidth
              label="Display Name"
              placeholder="Main Controller"
              value={name}
              onChange={(e) => setName(e.target.value)}
              margin="normal"
              required
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={createDefaultSensors}
                  onChange={(e) => setCreateDefaultSensors(e.target.checked)}
                />
              }
              label="Create default sensor placeholders"
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 2 }}>
              <Button
                type="submit"
                variant="contained"
                color="secondary"
                startIcon={<Save />}
                disabled={saving}
                sx={compactButtonSx}
              >
                {saving ? 'Creating...' : 'Create Device'}
              </Button>
              <Button variant="text" onClick={() => navigate('/admin/devices')} sx={compactButtonSx}>
                Cancel
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default AdminAddDevice;
