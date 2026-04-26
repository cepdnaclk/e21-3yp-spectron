import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Add, Refresh } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { AdminDevice, getAdminDevices } from '../../services/adminService';

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

  const loadDevices = () => {
    setError('');
    getAdminDevices().then(setDevices).catch(() => setError('Failed to load devices.'));
  };

  useEffect(() => {
    loadDevices();
  }, []);

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="overline" color="secondary" fontWeight={800}>
            Device Registry
          </Typography>
          <Typography variant="h4">Controllers</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            Register physical controller IDs and review which account owns each device.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
          <Button variant="outlined" startIcon={<Refresh />} onClick={loadDevices} sx={compactButtonSx}>
            Refresh
          </Button>
          <Button variant="contained" color="secondary" startIcon={<Add />} onClick={() => navigate('/admin/devices/new')} sx={compactButtonSx}>
            Add Device
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <CardContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Controller ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Sensors</TableCell>
                  <TableCell>Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id} hover>
                    <TableCell>
                      <Typography fontWeight={800}>{device.controllerId}</Typography>
                      <Typography variant="caption" color="text.secondary">{device.location || 'No location'}</Typography>
                    </TableCell>
                    <TableCell>{device.name}</TableCell>
                    <TableCell><Chip size="small" label={device.status} /></TableCell>
                    <TableCell>{device.ownerEmail || 'Unclaimed'}</TableCell>
                    <TableCell>{device.configuredSensors}/{device.sensorCount} configured</TableCell>
                    <TableCell>{formatDate(device.updatedAt)}</TableCell>
                  </TableRow>
                ))}
                {devices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
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
