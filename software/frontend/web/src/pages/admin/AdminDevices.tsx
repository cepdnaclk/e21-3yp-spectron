import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  GlobalStyles,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Agriculture, ContentCopy, DeviceHub, Inventory2, Print, Refresh, WarningAmber } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { AdminDevice, getAdminDevices } from '../../services/adminService';
import AutoDismissAlert from '../../components/AutoDismissAlert';

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : '-');

const architectureLabel = (state?: string) => {
  switch (state) {
    case 'farm_attached':
      return 'Farm attached';
    case 'legacy_claimed':
      return 'Legacy claimed';
    case 'unclaimed_inventory':
      return 'Unclaimed';
    default:
      return 'Needs review';
  }
};

const architectureColor = (state?: string) => {
  switch (state) {
    case 'farm_attached':
      return 'primary' as const;
    case 'legacy_claimed':
      return 'warning' as const;
    case 'unclaimed_inventory':
      return 'default' as const;
    default:
      return 'error' as const;
  }
};

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

const AdminDevices: React.FC = () => {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [error, setError] = useState('');
  const [helperMessage, setHelperMessage] = useState('');
  const [printDevice, setPrintDevice] = useState<AdminDevice | null>(null);

  const summary = useMemo(() => ({
    total: devices.length,
    farmAttached: devices.filter((device) => device.architectureState === 'farm_attached').length,
    legacyOnly: devices.filter((device) => device.architectureState === 'legacy_claimed').length,
    bases: devices.reduce((total, device) => total + (device.sensorBaseCount || 0), 0),
  }), [devices]);

  const loadDevices = () => {
    setError('');
    getAdminDevices().then(setDevices).catch(() => setError('Failed to load devices.'));
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const handleCopy = async (controllerId: string) => {
    try {
      await navigator.clipboard.writeText(controllerId);
      setHelperMessage('QR payload copied.');
    } catch {
      setError('Failed to copy QR payload.');
    }
  };

  const handlePrint = (device: AdminDevice) => {
    setPrintDevice(device);
    window.setTimeout(() => window.print(), 0);
  };

  return (
    <Box
      sx={{
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: { xs: '-8px -8px auto -8px', md: '-16px -16px auto -16px' },
          height: 150,
          borderRadius: 4,
          background:
            'linear-gradient(90deg, rgba(235,79,18,0.08), rgba(108,137,48,0.1) 52%, rgba(51,122,133,0.07))',
          pointerEvents: 'none',
          zIndex: 0,
        },
      }}
    >
      <GlobalStyles
        styles={{
          '@media print': {
            'body *': {
              visibility: 'hidden !important',
            },
            '.spectron-existing-device-print, .spectron-existing-device-print *': {
              visibility: 'visible !important',
            },
            '.spectron-existing-device-print': {
              display: 'flex !important',
              position: 'fixed',
              left: 0,
              top: 0,
            },
          },
        }}
      />
      {printDevice && (
        <Box
          className="spectron-existing-device-print"
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
            value={printDevice.controllerId}
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
            {printDevice.controllerId}
          </Typography>
        </Box>
      )}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }}
        spacing={2}
        sx={{
          mb: 2,
          p: { xs: 2, md: 2.5 },
          borderRadius: 4,
          border: '1px solid rgba(60,57,17,0.1)',
          bgcolor: 'rgba(255,253,248,0.92)',
          boxShadow: '0 16px 40px rgba(60,57,17,0.08)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Box>
          <Typography variant="h4">Controllers</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            Internal hardware inventory with farm attachment status.
          </Typography>
        </Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems="stretch"
          sx={{ flexShrink: 0, width: { xs: '100%', md: 'auto' } }}
        >
          <Button variant="outlined" startIcon={<Refresh />} onClick={loadDevices} sx={compactButtonSx}>
            Refresh
          </Button>
          <Button variant="contained" color="secondary" startIcon={<Add />} onClick={() => navigate('/admin/devices/new')} sx={compactButtonSx}>
            Add Device
          </Button>
        </Stack>
      </Stack>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ mb: 2.5, position: 'relative', zIndex: 1 }}
      >
        {[
          { label: 'Registered', value: summary.total, icon: <Inventory2 fontSize="small" />, tone: '#fffaf4' },
          { label: 'Farm attached', value: summary.farmAttached, icon: <Agriculture fontSize="small" />, tone: '#f4f8ea' },
          { label: 'Legacy review', value: summary.legacyOnly, icon: <WarningAmber fontSize="small" />, tone: '#fff7ef' },
          { label: 'Sensor bases', value: summary.bases, icon: <DeviceHub fontSize="small" />, tone: '#eff8f8' },
        ].map((item) => (
          <Card
            key={item.label}
            sx={{
              flex: 1,
              bgcolor: item.tone,
              border: '1px solid rgba(60,57,17,0.08)',
              boxShadow: '0 10px 24px rgba(60,57,17,0.06)',
            }}
          >
            <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: 2,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: 'rgba(255,255,255,0.72)',
                    color: 'primary.main',
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {item.label}
                  </Typography>
                  <Typography variant="h5" sx={{ lineHeight: 1 }}>
                    {item.value}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>
      <AutoDismissAlert
        open={Boolean(helperMessage)}
        severity="success"
        sx={{ mb: 2 }}
        onCloseAlert={() => setHelperMessage('')}
      >
        {helperMessage}
      </AutoDismissAlert>

      <Card sx={{ border: '1px solid rgba(60,57,17,0.08)', boxShadow: '0 12px 28px rgba(60,57,17,0.06)', position: 'relative', zIndex: 1 }}>
        <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
          <TableContainer className="mobile-card-table">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Controller ID</TableCell>
                  <TableCell>Attachment</TableCell>
                  <TableCell>Owner / Farm</TableCell>
                  <TableCell>Bases</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id} hover>
                    <TableCell data-label="Controller">
                      <Typography fontWeight={800}>{device.controllerId}</Typography>
                      <Typography variant="caption" color="text.secondary">{device.name || device.location || 'Registered controller'}</Typography>
                    </TableCell>
                    <TableCell data-label="Attachment">
                      <Chip
                        size="small"
                        label={architectureLabel(device.architectureState)}
                        color={architectureColor(device.architectureState)}
                      />
                    </TableCell>
                    <TableCell data-label="Owner / Farm">
                      <Typography fontWeight={800}>{device.farmName || device.ownerEmail || 'Unclaimed'}</Typography>
                      {device.farmName && (
                        <Typography variant="caption" color="text.secondary">{device.ownerEmail || 'Owner not shown'}</Typography>
                      )}
                    </TableCell>
                    <TableCell data-label="Bases">{device.sensorBaseCount || 0}</TableCell>
                    <TableCell data-label="Status">
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        <Chip size="small" label={device.operationalStatus || device.status} />
                        <Chip size="small" variant="outlined" label={`${device.configuredSensors}/${device.sensorCount} sensors`} />
                      </Stack>
                    </TableCell>
                    <TableCell data-label="Updated">{formatDate(device.updatedAt)}</TableCell>
                    <TableCell data-label="Actions" align="right">
                      <Tooltip title="Copy QR payload">
                        <IconButton
                          size="small"
                          aria-label={`Copy QR for ${device.controllerId}`}
                          onClick={() => handleCopy(device.controllerId)}
                        >
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Print QR">
                        <IconButton
                          size="small"
                          aria-label={`Print QR for ${device.controllerId}`}
                          onClick={() => handlePrint(device)}
                        >
                          <Print fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {devices.length === 0 && (
                  <TableRow className="mobile-empty-row">
                    <TableCell colSpan={7}>
                      <Typography align="center" color="text.secondary" sx={{ py: 3 }}>
                        No devices registered yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default AdminDevices;
