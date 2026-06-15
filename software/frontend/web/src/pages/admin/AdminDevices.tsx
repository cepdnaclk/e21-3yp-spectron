import React, { useEffect, useState } from 'react';
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
import { Add, ContentCopy, Print, Refresh } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { AdminDevice, getAdminDevices } from '../../services/adminService';
import AutoDismissAlert from '../../components/AutoDismissAlert';

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : '-');

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
    <Box>
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
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h4">Controllers</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, display: { xs: 'none', sm: 'block' } }}>
            Register physical controller IDs and review which account owns each device.
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

      <Card>
        <CardContent>
          <TableContainer className="mobile-card-table">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Controller ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Claim Status</TableCell>
                  <TableCell>Operational</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Sensors</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id} hover>
                    <TableCell data-label="Controller">
                      <Typography fontWeight={800}>{device.controllerId}</Typography>
                      <Typography variant="caption" color="text.secondary">{device.location || 'No location'}</Typography>
                    </TableCell>
                    <TableCell data-label="Name">{device.name}</TableCell>
                    <TableCell data-label="Claim status">
                      <Chip
                        size="small"
                        label={device.claimStatus}
                        color={device.claimStatus === 'CLAIMED' ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell data-label="Operational"><Chip size="small" label={device.operationalStatus || device.status} /></TableCell>
                    <TableCell data-label="Owner">{device.ownerEmail || 'Unclaimed'}</TableCell>
                    <TableCell data-label="Sensors">{device.configuredSensors}/{device.sensorCount} configured</TableCell>
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
                    <TableCell colSpan={8}>
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
