import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Grid, LinearProgress, Stack, Typography } from '@mui/material';
import { Add, Agriculture, DeviceHub, DevicesOther, WarningAmber } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { AdminOverview, getAdminOverview } from '../../services/adminService';
import { AdminPageShell, AdminStatCard, compactAdminButtonSx, adminCardSx } from '../../components/admin/AdminSurface';

const statCards = [
  { key: 'totalDevices', label: 'Registered', icon: DevicesOther, tone: '#fffaf4', color: '#eb4f12' },
  { key: 'farmControllers', label: 'Farm attached', icon: Agriculture, tone: '#f4f8ea', color: '#6c8930' },
  { key: 'sensorBases', label: 'Sensor bases', icon: DeviceHub, tone: '#eff8f8', color: '#337a85' },
  { key: 'legacyOnlyDevices', label: 'Needs review', icon: WarningAmber, tone: '#fff7ef', color: '#b95416' },
] as const;

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  useEffect(() => {
    getAdminOverview().then(setOverview).catch(() => setOverview(null));
  }, []);

  const totalDevices = overview?.totalDevices || 0;
  const farmAttached = overview?.farmControllers || 0;
  const readiness = totalDevices > 0 ? Math.round((farmAttached / totalDevices) * 100) : 0;

  return (
    <AdminPageShell
      eyebrow="Internal"
      title="Hardware operations"
      subtitle="Register controllers, print QR labels, and track farm attachment."
      actions={(
        <Button
          variant="contained"
          color="secondary"
          startIcon={<Add />}
          onClick={() => navigate('/admin/devices/new')}
          sx={{ ...compactAdminButtonSx, alignSelf: { xs: 'stretch', md: 'center' } }}
        >
          Add Device
        </Button>
      )}
    >
      <Grid container spacing={2}>
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Grid item xs={6} lg={3} key={card.key}>
              <AdminStatCard label={card.label} value={overview?.[card.key] ?? '-'} icon={<Icon />} tone={card.tone} color={card.color} />
            </Grid>
          );
        })}
      </Grid>

      <Grid container spacing={2} sx={{ mt: 0.5 }}>
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%', ...adminCardSx }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="h6">Setup Flow</Typography>
              <Stack spacing={1.3} sx={{ mt: 2 }}>
                {[
                  'Register physical controller ID.',
                  'Print permanent QR label.',
                  'Farm owner claims and attaches it to a farm.',
                  'Sensor bases connect fields to controllers.',
                ].map((item, index) => (
                  <Stack direction="row" spacing={1.2} alignItems="flex-start" key={item}>
                    <Chip label={index + 1} color="primary" size="small" />
                    <Typography>{item}</Typography>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%', ...adminCardSx }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="h6">Readiness</Typography>
              <Box sx={{ mt: 2 }}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography color="text.secondary">Farm attachment</Typography>
                  <Typography fontWeight={900}>{readiness}%</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={readiness} sx={{ height: 8, borderRadius: 999 }} />
              </Box>
              <Stack spacing={1.2} sx={{ mt: 2.5 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary">Claimed</Typography>
                  <Typography fontWeight={800}>{overview?.pairedDevices ?? '-'}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary">Unclaimed</Typography>
                  <Typography fontWeight={800}>{overview?.unclaimedDevices ?? '-'}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography color="text.secondary">Unconfigured</Typography>
                  <Typography fontWeight={800}>{overview?.unconfiguredSensors ?? '-'}</Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </AdminPageShell>
  );
};

export default AdminDashboard;
