import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material';
import { Api, Storage, AccessTime } from '@mui/icons-material';
import { AdminSystemHealth, getAdminSystemHealth } from '../../services/adminService';

const AdminSystem: React.FC = () => {
  const [health, setHealth] = useState<AdminSystemHealth | null>(null);

  useEffect(() => {
    getAdminSystemHealth().then(setHealth).catch(() => setHealth({ apiStatus: 'error', databaseStatus: 'error', serverTime: new Date().toISOString() }));
  }, []);

  const cards = [
    { label: 'API', value: health?.apiStatus || '-', icon: Api },
    { label: 'Database', value: health?.databaseStatus || '-', icon: Storage },
    { label: 'Server Time', value: health?.serverTime ? new Date(health.serverTime).toLocaleString() : '-', icon: AccessTime },
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 1 }}>Infrastructure status</Typography>
      <Typography color="text.secondary" sx={{ mb: 3, display: { xs: 'none', sm: 'block' } }}>
        First-pass health checks for the API and database. MQTT and Kafka panels can be added once those services expose metrics.
      </Typography>

      <Grid container spacing={2}>
        {cards.map((card) => {
          const Icon = card.icon;
          const ok = String(card.value).toLowerCase() === 'ok';
          return (
            <Grid item xs={card.label === 'Server Time' ? 12 : 6} md={4} key={card.label}>
              <Card>
                <CardContent>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(108, 137, 48, 0.12)', color: 'primary.main' }}>
                      <Icon />
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary" fontWeight={800}>{card.label}</Typography>
                      {card.label === 'Server Time' ? (
                        <Typography fontWeight={800}>{card.value}</Typography>
                      ) : (
                        <Chip size="small" label={card.value} color={ok ? 'success' : 'error'} />
                      )}
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default AdminSystem;
