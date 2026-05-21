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
  TextField,
} from '@mui/material';
import { ArrowBack, Check, Close, DeleteOutline, Edit, Settings, DeviceThermostat, Place, Memory, Tune, Wifi, WifiOff } from '@mui/icons-material';
import { Controller } from '../../services/controllerService';
import { Sensor } from '../../services/sensorService';
import {
  HardwarePairingSensor,
  getHardwareController,
  getHardwareSensors,
  renameHardwareController,
  renameHardwareSensor,
  releaseHardwareController,
} from '../../services/hardwarePairingService';
import { formatHardwareMetricRange, getSensorHardwareCapabilities } from '../../utils/sensorConfig';
import { ControllerDashboardSkeleton } from '../../components/LoadingSkeletons';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { useAuth } from '../../contexts/AuthContext';

type DashboardNavigationState = {
  controllerId?: string;
  sensors?: HardwarePairingSensor[];
  paired?: boolean;
  configurationSaved?: boolean;
  configuredSensorId?: string;
  configuredSensorName?: string;
  observationMessage?: string;
};

const ControllerDashboard: React.FC = () => {
  const { id, controllerId } = useParams<{ id?: string; controllerId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [controller, setController] = useState<Controller | null>(null);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [renamingController, setRenamingController] = useState(false);
  const [editingControllerName, setEditingControllerName] = useState(false);
  const [controllerNameDraft, setControllerNameDraft] = useState('');
  const [renamingSensorId, setRenamingSensorId] = useState<string | null>(null);
  const [editingSensorId, setEditingSensorId] = useState<string | null>(null);
  const [sensorNameDraft, setSensorNameDraft] = useState('');
  const navigationState = (location.state || null) as DashboardNavigationState | null;
  const [saveNotice, setSaveNotice] = useState<DashboardNavigationState | null>(navigationState);
  const [toastOpen, setToastOpen] = useState(Boolean(navigationState?.configurationSaved));
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');
  const activeControllerId = controllerId || id || navigationState?.controllerId || '';
  const releasableControllerId =
    (controller?.hw_id && /^CTRL-/i.test(controller.hw_id) ? controller.hw_id : '') ||
    navigationState?.controllerId ||
    activeControllerId;
  const isHardwareContext = Boolean(activeControllerId && /^CTRL-/i.test(activeControllerId));
  const canManageControllers = user?.accounts?.some((account) => account.role === 'OWNER' || account.role === 'ADMIN');

  useEffect(() => {
    if (controller && !editingControllerName) {
      setControllerNameDraft(controller.name || '');
    }
  }, [controller, editingControllerName]);

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
      setSensors(Array.isArray(sensorsData) ? sensorsData : []);
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
    if (!activeControllerId) {
      return undefined;
    }

    const intervalMs = sensors.length === 0 ? 5000 : 15000;
    const intervalId = window.setInterval(() => {
      loadData();
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [activeControllerId, loadData, sensors.length]);

  useEffect(() => {
    if (!navigationState?.configurationSaved) {
      return;
    }

    setSaveNotice(navigationState);
    setToastSeverity('success');
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

  const handleRemoveController = async () => {
    if (!releasableControllerId || removing) {
      return;
    }

    setRemoving(true);
    try {
      await releaseHardwareController(releasableControllerId);
      navigate('/controllers', {
        replace: true,
        state: { message: 'Controller removed from your account.' },
      });
    } catch (err: any) {
      const responseData = err?.response?.data;
      setSaveNotice({
        observationMessage:
          typeof responseData === 'string'
            ? responseData
            : responseData?.message || 'Failed to remove controller.',
      });
      setToastSeverity('error');
      setToastOpen(true);
    } finally {
      setRemoving(false);
    }
  };

  const showToast = (message: string, severity: 'success' | 'error') => {
    setSaveNotice({ observationMessage: message });
    setToastSeverity(severity);
    setToastOpen(true);
  };

  const startControllerRename = () => {
    setControllerNameDraft(controller?.name || '');
    setEditingControllerName(true);
  };

  const cancelControllerRename = () => {
    setControllerNameDraft(controller?.name || '');
    setEditingControllerName(false);
  };

  const saveControllerName = async () => {
    const nextName = controllerNameDraft.trim();
    if (!controller || !activeControllerId || !nextName || renamingController) {
      return;
    }

    setRenamingController(true);
    try {
      const updatedController = await renameHardwareController(activeControllerId, nextName);
      setController((current) => current ? { ...current, ...updatedController, name: updatedController.name || nextName } : updatedController);
      setEditingControllerName(false);
      showToast('Controller name updated.', 'success');
    } catch (err: any) {
      const responseData = err?.response?.data;
      showToast(err?.message || (typeof responseData === 'string' ? responseData : responseData?.message) || 'Failed to update controller name.', 'error');
    } finally {
      setRenamingController(false);
    }
  };

  const startSensorRename = (sensor: Sensor) => {
    setEditingSensorId(sensor.id);
    setSensorNameDraft(sensor.name || `${sensor.type} Sensor`);
  };

  const cancelSensorRename = () => {
    setEditingSensorId(null);
    setSensorNameDraft('');
  };

  const saveSensorName = async (sensor: Sensor) => {
    const nextName = sensorNameDraft.trim();
    if (!activeControllerId || !nextName || renamingSensorId) {
      return;
    }

    setRenamingSensorId(sensor.id);
    try {
      const updatedSensor = await renameHardwareSensor(activeControllerId, sensor.id, nextName);
      setSensors((current) =>
        current.map((item) =>
          item.id === sensor.id ? { ...item, ...updatedSensor, name: updatedSensor.name || nextName } : item
        )
      );
      cancelSensorRename();
      showToast('Sensor name updated.', 'success');
    } catch (err: any) {
      const responseData = err?.response?.data;
      showToast(err?.message || (typeof responseData === 'string' ? responseData : responseData?.message) || 'Failed to update sensor name.', 'error');
    } finally {
      setRenamingSensorId(null);
    }
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
      <AutoDismissAlert
        open={Boolean(saveNotice?.configurationSaved)}
        severity="success"
        sx={{ mb: 3 }}
        onCloseAlert={() => setSaveNotice((current) => current?.configurationSaved ? null : current)}
      >
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            {saveNotice?.configuredSensorName || 'Sensor'} is now configured.
          </Typography>
          <Typography variant="body2">
            {saveNotice?.observationMessage || 'The system is now observing live readings with the saved three-layer setup.'}
          </Typography>
      </AutoDismissAlert>
      <Snackbar
        open={toastOpen}
        autoHideDuration={5000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity={toastSeverity} onClose={() => setToastOpen(false)}>
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
              {editingControllerName ? (
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  component="form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveControllerName();
                  }}
                  sx={{ mt: 0.5 }}
                >
                  <TextField
                    size="small"
                    value={controllerNameDraft}
                    onChange={(event) => setControllerNameDraft(event.target.value)}
                    autoFocus
                    variant="filled"
                    label="Controller name"
                    sx={{
                      minWidth: { xs: 220, sm: 360 },
                      bgcolor: 'rgba(255, 253, 248, 0.12)',
                      borderRadius: 1,
                      '& .MuiInputBase-input, & .MuiInputLabel-root': {
                        color: '#fffdf8',
                      },
                    }}
                  />
                  <IconButton
                    aria-label="Save controller name"
                    type="submit"
                    disabled={renamingController || !controllerNameDraft.trim()}
                    sx={{ color: '#fffdf8' }}
                  >
                    <Check />
                  </IconButton>
                  <IconButton
                    aria-label="Cancel controller name edit"
                    onClick={cancelControllerRename}
                    disabled={renamingController}
                    sx={{ color: '#fffdf8' }}
                  >
                    <Close />
                  </IconButton>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="h4">{controller.name || 'Unnamed Controller'}</Typography>
                  {canManageControllers && (
                    <IconButton
                      aria-label="Edit controller name"
                      onClick={startControllerRename}
                      sx={{ color: '#fffdf8' }}
                    >
                      <Edit />
                    </IconButton>
                  )}
                </Stack>
              )}
            </Box>
            <Chip
              icon={controller.status === 'ONLINE' ? <Wifi /> : <WifiOff />}
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
          {canManageControllers && (
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<DeleteOutline />}
              onClick={handleRemoveController}
              disabled={removing}
              sx={{
                mt: 2,
                color: '#fffdf8',
                borderColor: 'rgba(255, 253, 248, 0.36)',
                '&:hover': {
                  borderColor: '#fffdf8',
                  bgcolor: 'rgba(255, 253, 248, 0.08)',
                },
              }}
            >
              {removing ? 'Removing...' : 'Remove from my account'}
            </Button>
          )}
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
            <Card
              sx={{
                border: '1px solid',
                borderColor: controller.status === 'ONLINE' ? 'info.light' : 'warning.light',
                bgcolor: controller.status === 'ONLINE' ? 'rgba(25, 118, 210, 0.04)' : 'rgba(237, 108, 0, 0.04)',
              }}
            >
              <CardContent sx={{ py: 4 }}>
                <Box sx={{ textAlign: 'center' }}>
                  {controller.status === 'OFFLINE' ? (
                    <>
                      <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                        Controller is OFFLINE
                      </Typography>
                      <Typography color="text.secondary">
                        Turn on the ESP32 controller to start sensor discovery. Sensors will appear here automatically once the controller connects and reports its connected sensors.
                      </Typography>
                    </>
                  ) : (
                    <>
                      <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                        Waiting for sensor discovery...
                      </Typography>
                      <Typography color="text.secondary">
                        The controller is <strong>ONLINE</strong> and listening for sensor data. Sensors will appear here once they are detected and reported by the controller. Check that your sensor modules are powered on and properly connected to the ESP32.
                      </Typography>
                    </>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          sensors.map((sensor) => {
            const observationChip = getObservationChip(sensor);
            const readinessChip = getReadinessChip(sensor);
            const readableRanges =
              sensor.active_config?.hardware?.supported_raw_metrics?.length
                ? sensor.active_config.hardware.supported_raw_metrics
                : getSensorHardwareCapabilities(sensor.type);

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
                        {editingSensorId === sensor.id ? (
                          <Stack
                            direction="row"
                            spacing={0.5}
                            alignItems="center"
                            component="form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              saveSensorName(sensor);
                            }}
                          >
                            <TextField
                              size="small"
                              value={sensorNameDraft}
                              onChange={(event) => setSensorNameDraft(event.target.value)}
                              autoFocus
                              label="Sensor name"
                              sx={{ minWidth: { xs: 180, sm: 240 } }}
                            />
                            <IconButton
                              aria-label="Save sensor name"
                              type="submit"
                              size="small"
                              disabled={renamingSensorId === sensor.id || !sensorNameDraft.trim()}
                            >
                              <Check fontSize="small" />
                            </IconButton>
                            <IconButton
                              aria-label="Cancel sensor name edit"
                              onClick={cancelSensorRename}
                              size="small"
                              disabled={renamingSensorId === sensor.id}
                            >
                              <Close fontSize="small" />
                            </IconButton>
                          </Stack>
                        ) : (
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography variant="h6">
                              {sensor.name || `${sensor.type} Sensor`}
                            </Typography>
                            {canManageControllers && (
                              <IconButton
                                aria-label="Edit sensor name"
                                size="small"
                                onClick={() => startSensorRename(sensor)}
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                            )}
                          </Stack>
                        )}
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
                    {readableRanges.length > 0 && (
                      <Box sx={{ mt: 1.5, mb: 1.5, p: 1.5, borderRadius: 2, bgcolor: '#fffaf0', border: '1px solid rgba(60, 57, 17, 0.08)' }}>
                        <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                          Physical readable range
                        </Typography>
                        {readableRanges.map((metric) => (
                          <Typography key={`${sensor.id}-${metric.key}`} variant="body2" color="text.secondary">
                            {metric.label}: {formatHardwareMetricRange(metric)}
                          </Typography>
                        ))}
                      </Box>
                    )}
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
                            isHardwareContext
                              ? `/hardware/${activeControllerId}/sensors/${sensor.id}/configure`
                              : `/sensors/${sensor.id}/config`,
                            {
                              state: {
                                controllerId: activeControllerId,
                                sensorId: sensor.id,
                                sensorType: sensor.type,
                                sensorName: sensor.name || `${sensor.type} Sensor`,
                                configured: Boolean(sensor.config_active),
                                returnTo: isHardwareContext
                                  ? `/hardware/${activeControllerId}/sensors`
                                  : `/controllers/${activeControllerId}`,
                              },
                            }
                          )
                        }
                      >
                        {sensor.config_active ? 'Review Configuration' : 'Configure'}
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
