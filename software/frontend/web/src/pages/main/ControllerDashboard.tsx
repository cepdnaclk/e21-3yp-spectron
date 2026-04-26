import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Box,
  Grid,
  Alert,
  Stack,
  IconButton,
  Snackbar,
} from '@mui/material';
import { ArrowBack, Settings, DeviceThermostat, Place, Memory, Tune } from '@mui/icons-material';
import { Controller } from '../../services/controllerService';
import { Sensor } from '../../services/sensorService';
import {
  HardwarePairingSensor,
  getHardwareController,
  getHardwareSensors,
} from '../../services/hardwarePairingService';
import { ControllerDashboardSkeleton } from '../../components/LoadingSkeletons';

type DashboardNavigationState = {
  controllerId?: string;
  sensors?: HardwarePairingSensor[];
  paired?: boolean;
  configurationSaved?: boolean;
  configuredSensorId?: string;
  configuredSensorName?: string;
  validationWarnings?: string[];
  observationMessage?: string;
};

const ControllerDashboard: React.FC = () => {
  const { id, controllerId } = useParams<{ id?: string; controllerId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [controller, setController] = useState<Controller | null>(null);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [loading, setLoading] = useState(true);
  const navigationState = (location.state || null) as DashboardNavigationState | null;
  const [saveNotice, setSaveNotice] = useState<DashboardNavigationState | null>(navigationState);
  const [toastOpen, setToastOpen] = useState(Boolean(navigationState?.configurationSaved));
  const activeControllerId = controllerId || id || navigationState?.controllerId || '';
  const isHardwareRoute = Boolean(controllerId);

  const handleBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
      return;
    }

    navigate('/controllers');
  };

  const loadData = useCallback(async () => {
    if (!activeControllerId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [controllerData, sensorsData] = await Promise.all([
        getHardwareController(activeControllerId),
        getHardwareSensors(activeControllerId),
      ]);
      setController(controllerData);
      setSensors(sensorsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeControllerId]);

  useEffect(() => {
    if (activeControllerId) {
      loadData();
    }
  }, [activeControllerId, loadData]);

  useEffect(() => {
    if (!navigationState?.configurationSaved) {
      return;
    }

    setSaveNotice(navigationState);
    setToastOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, navigate, navigationState]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OK':
      case 'ONLINE':
        return 'success';
      case 'OFFLINE':
      case 'ERROR':
        return 'error';
      default:
        return 'default';
    }
  };

  const getObservationChip = (sensor: Sensor) => {
    switch (sensor.observation?.status) {
      case 'ready_for_review':
        return { label: 'Ready for Review', color: 'success' as const };
      case 'awaiting_data':
        return { label: 'Awaiting Data', color: 'warning' as const };
      case 'observing':
        return { label: 'Observing', color: 'info' as const };
      default:
        return null;
    }
  };

  const getReadinessChip = (sensor: Sensor) => {
    if (sensor.config_active) {
      return { label: 'Configured', color: 'primary' as const };
    }
    if (sensor.status === 'OK') {
      return { label: 'Live - config optional', color: 'success' as const };
    }
    return { label: 'Discovered', color: 'default' as const };
  };

  if (loading) {
    return <ControllerDashboardSkeleton />;
  }

  if (!controller) {
    return (
      <Container>
        <Typography>Controller not found</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          position: 'sticky',
          top: { xs: 12, md: 20 },
          zIndex: 5,
          display: 'flex',
          justifyContent: 'flex-start',
          mb: 1.5,
          pointerEvents: 'none',
        }}
      >
        <IconButton
          aria-label="Go back"
          onClick={handleBack}
          sx={{
            pointerEvents: 'auto',
            border: '1px solid rgba(60, 57, 17, 0.12)',
            bgcolor: '#fffdf8',
            boxShadow: '0 12px 24px rgba(60, 57, 17, 0.08)',
            '&:hover': {
              bgcolor: '#fff8ed',
            },
          }}
        >
          <ArrowBack />
        </IconButton>
      </Box>
      {saveNotice?.configurationSaved && (
        <Alert
          severity={(saveNotice.validationWarnings || []).length > 0 ? 'warning' : 'success'}
          sx={{ mb: 3 }}
        >
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            {saveNotice.configuredSensorName || 'Sensor'} is now configured.
          </Typography>
          <Typography variant="body2">
            {saveNotice.observationMessage || 'The system is now observing live readings and can suggest refinements later.'}
          </Typography>
          {(saveNotice.validationWarnings || []).length > 0 && (
            <Box component="ul" sx={{ pl: 2, mb: 0, mt: 1 }}>
              {(saveNotice.validationWarnings || []).map((warning) => (
                <li key={warning}>
                  <Typography variant="body2">{warning}</Typography>
                </li>
              ))}
            </Box>
          )}
        </Alert>
      )}
      <Snackbar
        open={toastOpen}
        autoHideDuration={3600}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity="success" onClose={() => setToastOpen(false)}>
          {saveNotice?.observationMessage || 'Configuration activated successfully'}
        </Alert>
      </Snackbar>

      <Card
        sx={{
          mb: 3,
          bgcolor: '#3c3911',
          color: '#fffdf8',
          border: '1px solid rgba(255, 253, 248, 0.08)',
          boxShadow: 'none',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} mb={2}>
            <Box>
              <Typography variant="overline" sx={{ color: '#e1c7a3', fontWeight: 800 }}>
                Controller workspace
              </Typography>
              <Typography variant="h4">{controller.name || 'Unnamed Controller'}</Typography>
            </Box>
            <Chip
              label={controller.status}
              color={getStatusColor(controller.status) as any}
              sx={{ bgcolor: controller.status === 'ONLINE' ? '#6c8930' : undefined, color: '#fffdf8' }}
            />
          </Box>
          {controller.purpose && (
            <Typography variant="body1" sx={{ color: 'rgba(255, 253, 248, 0.76)' }} gutterBottom>
              {controller.purpose}
            </Typography>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
            {controller.location && (
              <Chip icon={<Place />} label={controller.location} sx={{ bgcolor: 'rgba(255, 253, 248, 0.12)', color: '#fffdf8' }} />
            )}
            <Chip icon={<Memory />} label={controller.hw_id} sx={{ bgcolor: 'rgba(255, 253, 248, 0.12)', color: '#fffdf8' }} />
          </Stack>
        </CardContent>
      </Card>

      <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography variant="overline" color="secondary" fontWeight={800}>
            Connected hardware
          </Typography>
          <Typography variant="h5">Sensors ({sensors.length})</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Configuration is optional for this hardware verification run. First confirm that
            discovered sensors and live readings reach the UI.
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        {sensors.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography align="center" color="text.secondary">
                  No sensors found. Sensors will appear here once the controller discovers them.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          sensors.map((sensor) => {
            const observationChip = getObservationChip(sensor);
            const readinessChip = getReadinessChip(sensor);

            return (
              <Grid item xs={12} sm={6} key={sensor.id}>
                <Card
                  sx={
                    saveNotice?.configuredSensorId === sensor.id
                      ? {
                          border: '1.5px solid',
                          borderColor: 'success.main',
                          boxShadow: 'none',
                        }
                      : undefined
                  }
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'rgba(108, 137, 48, 0.12)' }}>
                          <DeviceThermostat color="primary" />
                        </Box>
                        <Typography variant="h6">
                          {sensor.name || `${sensor.type} Sensor`}
                        </Typography>
                      </Box>
                      <Chip
                        label={sensor.status}
                        color={getStatusColor(sensor.status) as any}
                        size="small"
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {sensor.type}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        label={readinessChip.label}
                        color={readinessChip.color}
                      />
                      {observationChip && (
                        <Chip
                          size="small"
                          label={observationChip.label}
                          color={observationChip.color}
                        />
                      )}
                    </Stack>
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(60, 57, 17, 0.08)' }}>
                      {sensor.purpose ? (
                        <Typography variant="body2" color="text.secondary">
                          {sensor.purpose}
                        </Typography>
                      ) : sensor.config_active ? (
                        <Typography variant="body2" color="text.secondary" fontStyle="italic">
                          {sensor.observation?.message || 'Configured and collecting live readings for later review.'}
                        </Typography>
                      ) : sensor.status === 'OK' ? (
                        <Typography variant="body2" color="text.secondary" fontStyle="italic">
                          Sensor is discovered and can show readings now. Configuration can be added later.
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary" fontStyle="italic">
                          Sensor discovered. Send a reading packet from the controller to confirm live data.
                        </Typography>
                      )}
                      <Button
                        variant="outlined"
                        startIcon={sensor.config_active ? <Tune /> : <Settings />}
                        size="small"
                        sx={{ mt: 2 }}
                        onClick={() =>
                          navigate(
                            isHardwareRoute
                              ? `/hardware/${activeControllerId}/sensors/${sensor.id}/configure`
                              : `/sensors/${sensor.id}/config`,
                            {
                              state: {
                                controllerId: activeControllerId,
                                sensorId: sensor.id,
                                sensorType: sensor.type,
                                sensorName: sensor.name || `${sensor.type} Sensor`,
                                configured: Boolean(sensor.config_active),
                                returnTo: isHardwareRoute
                                  ? `/hardware/${activeControllerId}/sensors`
                                  : `/controllers/${activeControllerId}`,
                              },
                            }
                          )
                        }
                      >
                        {sensor.config_active ? 'Review Configuration' : 'Configure Later'}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })
        )}
      </Grid>
    </Container>
  );
};

export default ControllerDashboard;
