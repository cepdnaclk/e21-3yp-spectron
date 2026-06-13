import React from 'react';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';

const AdminAudit: React.FC = () => {
  const plannedEvents = [
    'Device registered',
    'Pairing token generated',
    'Pairing token used',
    'Controller claimed',
    'Sensor configuration changed',
    'User role changed',
    'Device disabled',
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 1 }}>Operational audit trail</Typography>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 760, display: { xs: 'none', sm: 'block' } }}>
        This section is structured for the production audit log. The current backend stores token and device timestamps; the next step is a dedicated audit_events table for immutable admin activity.
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h6">Events to Capture</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
            {plannedEvents.map((event) => (
              <Chip key={event} label={event} />
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};

export default AdminAudit;
