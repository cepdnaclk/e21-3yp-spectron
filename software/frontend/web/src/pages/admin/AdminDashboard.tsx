import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Grid, LinearProgress, Stack, Typography } from '@mui/material';
import { Add, Agriculture, DeviceHub, DevicesOther, WarningAmber } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { AdminOverview, getAdminOverview } from '../../services/adminService';

const statCards = [
  { key: 'totalDevices', label: 'Registered', icon: DevicesOther, tone: '#fffaf4', color: '#eb4f12' },
  { key: 'farmControllers', label: 'Farm attached', icon: Agriculture, tone: '#f4f8ea', color: '#6c8930' },
  { key: 'sensorBases', label: 'Sensor bases', icon: DeviceHub, tone: '#eff8f8', color: '#337a85' },
  { key: 'legacyOnlyDevices', label: 'Needs review', icon: WarningAmber, tone: '#fff7ef', color: '#b95416' },
] as const;

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
    <Box
      sx={{
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: { xs: '-8px -8px auto -8px', md: '-16px -16px auto -16px' },
          height: 170,
          borderRadius: 4,
          background:
            'linear-gradient(90deg, rgba(235,79,18,0.09), rgba(108,137,48,0.1) 48%, rgba(51,122,133,0.08))',
          pointerEvents: 'none',
          zIndex: 0,
        },
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }}
        spacing={2}
        sx={{
          mb: 3,
          p: { xs: 2, md: 2.5 },
          borderRadius: 4,
          border: '1px solid rgba(60, 57, 17, 0.1)',
          bgcolor: 'rgba(255,253,248,0.92)',
          boxShadow: '0 16px 40px rgba(60,57,17,0.08)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <Chip size="small" color="primary" label="Internal" />
            <Chip size="small" variant="outlined" label={`${readiness}% farm attached`} />
          </Stack>
          <Typography variant="h4">Hardware operations</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>
            Register controllers, print QR labels, and track farm attachment.
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<Add />}
          onClick={() => navigate('/admin/devices/new')}
          sx={{ ...compactButtonSx, alignSelf: { xs: 'stretch', md: 'center' } }}
        >
          Add Device
        </Button>
      </Stack>

      <Grid container spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Grid item xs={6} lg={3} key={card.key}>
              <Card
                sx={{
                  height: '100%',
                  bgcolor: card.tone,
                  border: '1px solid rgba(60,57,17,0.08)',
                  boxShadow: '0 12px 28px rgba(60,57,17,0.06)',
                }}
              >
                <CardContent sx={{ p: 2 }}>
                  <Stack direction="row" spacing={{ xs: 0.75, sm: 1.5 }} alignItems="center">
                    <Box
                      sx={{
                        width: 42,
                        height: 42,
                        borderRadius: 2,
                        display: { xs: 'none', sm: 'grid' },
                        placeItems: 'center',
                        bgcolor: 'rgba(255,255,255,0.72)',
                        color: card.color,
                      }}
                    >
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

      <Grid container spacing={2} sx={{ mt: 1, position: 'relative', zIndex: 1 }}>
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%', border: '1px solid rgba(60,57,17,0.08)', boxShadow: '0 12px 28px rgba(60,57,17,0.06)' }}>
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
          <Card sx={{ height: '100%', border: '1px solid rgba(60,57,17,0.08)', boxShadow: '0 12px 28px rgba(60,57,17,0.06)' }}>
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
    </Box>
  );
};

export default AdminDashboard;
