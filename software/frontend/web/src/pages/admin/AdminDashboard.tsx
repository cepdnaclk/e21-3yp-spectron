import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material';
import { Add, DevicesOther, Key, Sensors, WarningAmber } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { AdminOverview, getAdminOverview } from '../../services/adminService';

const statCards = [
  { key: 'totalDevices', label: 'Total Devices', icon: DevicesOther, tone: '#fffaf4' },
  { key: 'unclaimedDevices', label: 'Unclaimed', icon: WarningAmber, tone: '#fff7ef' },
  { key: 'activeTokens', label: 'Active Tokens', icon: Key, tone: '#f7fbf0' },
  { key: 'configuredSensors', label: 'Configured Sensors', icon: Sensors, tone: '#f4fbfb' },
] as const;

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  useEffect(() => {
    getAdminOverview().then(setOverview).catch(() => setOverview(null));
  }, []);

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" color="secondary" fontWeight={800}>
            Admin Dashboard
          </Typography>
          <Typography variant="h4">Device operations overview</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>
            Register hardware, issue pairing QR tokens, and keep device readiness visible before users claim controllers.
          </Typography>
        </Box>
        <Button variant="contained" color="secondary" startIcon={<Add />} onClick={() => navigate('/admin/devices/new')}>
          Add Device
        </Button>
      </Stack>

      <Grid container spacing={2}>
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Grid item xs={12} sm={6} lg={3} key={card.key}>
              <Card sx={{ bgcolor: card.tone }}>
                <CardContent>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(108, 137, 48, 0.13)', color: 'primary.main' }}>
                      <Icon />
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary" fontWeight={800}>
                        {card.label}
                      </Typography>
                      <Typography variant="h4">{overview?.[card.key] ?? '-'}</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6">Recommended Operating Flow</Typography>
              <Stack spacing={1.3} sx={{ mt: 2 }}>
                {[
                  'Admin registers a physical controller ID.',
                  'Admin generates a short-lived pairing token and prints the QR payload.',
                  'User scans the QR code from the app and claims the controller.',
                  'Sensors are configured and monitored from the normal user dashboard.',
                ].map((item, index) => (
                  <Stack direction="row" spacing={1.2} alignItems="center" key={item}>
                    <Chip label={index + 1} color="primary" size="small" />
                    <Typography>{item}</Typography>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6">Readiness Snapshot</Typography>
              <Stack spacing={1.2} sx={{ mt: 2 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary">Paired devices</Typography>
                  <Typography fontWeight={800}>{overview?.pairedDevices ?? '-'}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary">Expired tokens</Typography>
                  <Typography fontWeight={800}>{overview?.expiredTokens ?? '-'}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary">Unconfigured sensors</Typography>
                  <Typography fontWeight={800}>{overview?.unconfiguredSensors ?? '-'}</Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdminDashboard;
