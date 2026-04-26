import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowBack, ContentCopy, QrCode2, Save } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { createAdminDevice, CreateAdminDeviceResponse } from '../../services/adminService';

const AdminAddDevice: React.FC = () => {
  const navigate = useNavigate();
  const [controllerId, setControllerId] = useState('');
  const [name, setName] = useState('Main Controller');
  const [location, setLocation] = useState('');
  const [tokenExpiryHours, setTokenExpiryHours] = useState('24');
  const [createDefaultSensors, setCreateDefaultSensors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreateAdminDeviceResponse | null>(null);

  const pairingPayload = created?.pairingToken || '';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setCreated(null);
    setSaving(true);
    try {
      const response = await createAdminDevice({
        controllerId: controllerId.trim() || undefined,
        name: name.trim(),
        location: location.trim() || undefined,
        tokenExpiryHours: Number(tokenExpiryHours) || 24,
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

  return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/admin/devices')} sx={{ mb: 2 }}>
        Back to devices
      </Button>
      <Typography variant="overline" color="secondary" fontWeight={800}>
        Device Registry
      </Typography>
      <Typography variant="h4" sx={{ mb: 1 }}>Add Controller</Typography>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 780 }}>
        Register a physical controller before it is installed. The pairing token is one-time and should be printed as the QR payload.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {created && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Device created. QR payload: <strong>{created.pairingToken}</strong>
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card>
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  margin="normal"
                  required
                />
                <TextField
                  fullWidth
                  label="Location"
                  placeholder="Boiler Room"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Pairing Token Expiry Hours"
                  type="number"
                  value={tokenExpiryHours}
                  onChange={(e) => setTokenExpiryHours(e.target.value)}
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
                <Button type="submit" variant="contained" color="secondary" startIcon={<Save />} disabled={saving} sx={{ mt: 2 }}>
                  {saving ? 'Creating...' : 'Create Device'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1.2} alignItems="center">
                <QrCode2 color="primary" />
                <Typography variant="h6">QR Payload</Typography>
              </Stack>
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  borderRadius: 2,
                  bgcolor: '#fffaf4',
                  border: '1px dashed rgba(60, 57, 17, 0.22)',
                  minHeight: 120,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                <Typography variant="h5" sx={{ wordBreak: 'break-word' }}>
                  {pairingPayload || 'Create a device to generate a PAIR token'}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                Put this token in a QR generator or print it as text. Users scan it from Pair Controller.
              </Typography>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<ContentCopy />}
                disabled={!pairingPayload}
                sx={{ mt: 2 }}
                onClick={() => navigator.clipboard?.writeText(pairingPayload)}
              >
                Copy Payload
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdminAddDevice;
