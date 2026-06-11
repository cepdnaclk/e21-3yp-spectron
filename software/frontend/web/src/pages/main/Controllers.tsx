import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  Fab,
  Stack,
  Button,
} from '@mui/material';
import { Add, Hub as ChipIcon, Place, Sensors, ArrowForward } from '@mui/icons-material';
import { Controller } from '../../services/controllerService';
import { getMyHardwareControllers } from '../../services/hardwarePairingService';
import { ControllersSkeleton } from '../../components/LoadingSkeletons';
import AutoDismissAlert from '../../components/AutoDismissAlert';

const Controllers: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationMessage = (location.state as { message?: string } | null)?.message || '';
  const [controllers, setControllers] = useState<Controller[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState(navigationMessage);

  useEffect(() => {
    loadControllers();
  }, []);

  useEffect(() => {
    if (navigationMessage) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, navigationMessage]);

  const loadControllers = async () => {
    try {
      const data = await getMyHardwareControllers();
      setControllers(data);
    } catch (error) {
      console.error('Error loading controllers:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ONLINE':
        return 'success';
      case 'OFFLINE':
        return 'error';
      case 'PENDING_CONFIG':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (loading) {
    return <ControllersSkeleton />;
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          mb: 3,
          p: { xs: 2.5, md: 3.5 },
          borderRadius: 2,
          bgcolor: '#3c3911',
          color: '#fffdf8',
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid rgba(255, 253, 248, 0.08)',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            right: { xs: -30, md: 30 },
            top: { xs: -40, md: 18 },
            width: 220,
            height: 220,
            borderRadius: '50%',
            bgcolor: 'rgba(235, 79, 18, 0.22)',
          }}
        />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" sx={{ position: 'relative' }}>
          <Box>
            <Typography variant="overline" sx={{ color: '#e1c7a3', fontWeight: 800 }}>
              Controller fleet
            </Typography>
            <Typography variant="h4" sx={{ mt: 0.5 }}>
              Keep every Spectron node in view.
            </Typography>
            <Typography sx={{ mt: 1, maxWidth: 620, color: 'rgba(255, 253, 248, 0.76)' }}>
              Add, configure, and monitor your connected sensing hardware from one calm workspace.
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<Add />}
            onClick={() => navigate('/controllers/pair')}
            sx={{ alignSelf: { xs: 'stretch', md: 'flex-end' } }}
          >
            Add Controller
          </Button>
        </Stack>
      </Box>

      <AutoDismissAlert
        open={Boolean(successMessage)}
        severity="success"
        sx={{ mb: 2 }}
        onCloseAlert={() => setSuccessMessage('')}
      >
        {successMessage}
      </AutoDismissAlert>

      <Grid container spacing={2}>
        {controllers.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ py: 6, textAlign: 'center' }}>
                <Sensors color="primary" sx={{ fontSize: 44, mb: 1 }} />
                <Typography variant="h6">No controllers paired yet</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                  Add your first controller to start collecting field data.
                </Typography>
                <Button variant="contained" color="secondary" startIcon={<Add />} onClick={() => navigate('/controllers/pair')}>
                  Add Controller
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          controllers.map((controller) => (
            <Grid item xs={12} sm={6} md={4} key={controller.id}>
              <Card
                sx={{
                  cursor: 'pointer',
                  height: '100%',
                  transition: 'border-color 180ms ease',
                  '&:hover': {
                    borderColor: 'rgba(60, 57, 17, 0.18)',
                  },
                }}
                onClick={() => navigate(`/controllers/${controller.id}`)}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'rgba(108, 137, 48, 0.12)' }}>
                        <ChipIcon color="primary" />
                      </Box>
                      <Typography variant="h6">
                        {controller.name || 'Unnamed Controller'}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.75}>
                      <Chip
                        label={controller.claim_status || 'CLAIMED'}
                        color="primary"
                        size="small"
                      />
                      <Chip
                        label={controller.operational_status || controller.status}
                        color={getStatusColor(controller.operational_status || controller.status) as any}
                        size="small"
                      />
                    </Stack>
                  </Box>
                  {controller.purpose && (
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {controller.purpose}
                    </Typography>
                  )}
                  <Stack spacing={1.2} sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(60, 57, 17, 0.08)' }}>
                    {controller.location && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Place color="secondary" fontSize="small" />
                        <Typography variant="body2" color="text.secondary">
                          {controller.location}
                        </Typography>
                      </Stack>
                    )}
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <Typography variant="caption" color="text.secondary">
                        Hardware ID: {controller.hw_id}
                      </Typography>
                      <ArrowForward color="primary" fontSize="small" />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>

      <Fab
        color="secondary"
        aria-label="add"
        sx={{ position: 'fixed', bottom: { xs: 92, md: 28 }, right: 24 }}
        onClick={() => navigate('/controllers/pair')}
      >
        <Add />
      </Fab>
    </Container>
  );
};

export default Controllers;
