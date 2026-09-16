import React, { useCallback, useEffect, useState } from 'react';
import { Box, Card, CardContent, Chip, Grid, Typography } from '@mui/material';
import { Api, Storage, AccessTime } from '@mui/icons-material';
import { AdminSystemHealth, getAdminSystemHealth } from '../../services/adminService';
import { AdminPageShell, AdminStatCard, adminCardSx } from '../../components/admin/AdminSurface';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

const AdminSystem: React.FC = () => {
  const [health, setHealth] = useState<AdminSystemHealth | null>(null);

  const loadHealth = useCallback(async () => {
    getAdminSystemHealth().then(setHealth).catch(() => setHealth({ apiStatus: 'error', databaseStatus: 'error', serverTime: new Date().toISOString() }));
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);
  useRealtimeRefresh('admin', loadHealth);

  const cards = [
    { label: 'API', value: health?.apiStatus || '-', icon: Api, tone: '#f4f8ea', color: '#6c8930' },
    { label: 'Database', value: health?.databaseStatus || '-', icon: Storage, tone: '#eff8f8', color: '#337a85' },
    { label: 'Server Time', value: health?.serverTime ? new Date(health.serverTime).toLocaleString() : '-', icon: AccessTime, tone: '#fffaf4', color: '#eb4f12' },
  ];

  return (
    <AdminPageShell
      eyebrow="Internal"
      title="Infrastructure status"
      subtitle="First-pass health checks for the API and database. MQTT and Kafka panels can be added once those services expose metrics."
    >

      <Grid container spacing={2}>
        {cards.map((card) => {
          const Icon = card.icon;
          const ok = String(card.value).toLowerCase() === 'ok';
          return (
            <Grid item xs={card.label === 'Server Time' ? 12 : 6} md={4} key={card.label}>
              <AdminStatCard
                label={card.label}
                value={card.label === 'Server Time' ? card.value : <Chip size="small" label={card.value} color={ok ? 'success' : 'error'} />}
                icon={<Icon />}
                tone={card.tone}
                color={card.color}
              />
            </Grid>
          );
        })}
      </Grid>
      <Box sx={{ mt: 2 }}>
        <Card sx={adminCardSx}>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Good health keeps the admin portal responsive. If a panel turns red here, verify the backend service before moving hardware or user records.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </AdminPageShell>
  );
};

export default AdminSystem;
