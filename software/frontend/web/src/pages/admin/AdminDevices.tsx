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
import { Add, Key, Refresh } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { AdminDevice, generateAdminPairingToken, getAdminDevices } from '../../services/adminService';

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : '-');

const AdminDevices: React.FC = () => {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadDevices = () => {
    setError('');
    getAdminDevices().then(setDevices).catch(() => setError('Failed to load devices.'));
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const handleGenerateToken = async (controllerId: string) => {
    try {
      const token = await generateAdminPairingToken(controllerId, 24);
      setMessage(`New token for ${controllerId}: ${token.pairingToken}`);
      loadDevices();
    } catch {
      setError('Failed to generate pairing token.');
    }
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" color="secondary" fontWeight={800}>
            Device Registry
          </Typography>
          <Typography variant="h4">Controllers</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            Register physical controllers, review ownership, and issue new pairing tokens.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<Refresh />} onClick={loadDevices}>
            Refresh
          </Button>
          <Button variant="contained" color="secondary" startIcon={<Add />} onClick={() => navigate('/admin/devices/new')}>
            Add Device
          </Button>
        </Stack>
      </Stack>

      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
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
                  <TableCell>Token</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell align="right">Actions</TableCell>
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
                    <TableCell>
                      <Chip
                        size="small"
                        label={device.tokenStatus}
                        color={device.tokenStatus === 'active' ? 'success' : device.tokenStatus === 'expired' ? 'warning' : 'default'}
                      />
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDate(device.tokenExpiresAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(device.updatedAt)}</TableCell>
                    <TableCell align="right">
                      <Button size="small" startIcon={<Key />} onClick={() => handleGenerateToken(device.controllerId)}>
                        Token
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {devices.length === 0 && (
                  <TableRow>
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
