import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { ArrowBack, Check, Close, DeleteOutline, Edit, Settings, DeviceThermostat, Place, Memory, Tune, Wifi, WifiOff, Grass } from '@mui/icons-material';
import { Controller } from '../../services/controllerService';
import { Sensor } from '../../services/sensorService';
import {
  HardwarePairingSensor,
  deleteHardwareSensor,
  getHardwareController,
  getHardwareSensors,
  renameHardwareController,
  renameHardwareSensor,
  releaseHardwareController,
} from '../../services/hardwarePairingService';
import { formatHardwareMetricRange, getSensorHardwareCapabilities, SensorHardwareMetric } from '../../utils/sensorConfig';
import {
  getOriginalSensorName,
  getPhysicalSensorGroupKey,
  isDefaultSensorName,
  resolvePhysicalSensorType,
} from '../../utils/physicalSensor';
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

const REMOVED_SENSOR_STORAGE_PREFIX = 'spectron_removed_sensors';

const getSensorIdentity = (sensor: Sensor) => sensor.hw_id || sensor.id;

const getRemovedSensorStorageKey = (controllerId: string) =>
  `${REMOVED_SENSOR_STORAGE_PREFIX}:${controllerId}`;

const readRemovedSensorIds = (controllerId: string) => {
  if (!controllerId) {
    return [];
  }

  try {
    const raw = localStorage.getItem(getRemovedSensorStorageKey(controllerId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const writeRemovedSensorIds = (controllerId: string, sensorIds: string[]) => {
  if (!controllerId) {
    return;
  }

  localStorage.setItem(getRemovedSensorStorageKey(controllerId), JSON.stringify(sensorIds));
};

const ControllerDashboard: React.FC = () => {
  const { id, controllerId } = useParams<{ id?: string; controllerId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [controller, setController] = useState<Controller | null>(null);
  const [reportedSensors, setReportedSensors] = useState<Sensor[]>([]);
  const [removedSensorIds, setRemovedSensorIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [renamingController, setRenamingController] = useState(false);
  const [editingControllerName, setEditingControllerName] = useState(false);
  const [controllerNameDraft, setControllerNameDraft] = useState('');
  const [renamingSensorId, setRenamingSensorId] = useState<string | null>(null);
  const [removingSensorId, setRemovingSensorId] = useState<string | null>(null);
  const [editingSensorId, setEditingSensorId] = useState<string | null>(null);
  const [sensorNameDraft, setSensorNameDraft] = useState('');
  const navigationState = (location.state || null) as DashboardNavigationState | null;
  const [saveNotice, setSaveNotice] = useState<DashboardNavigationState | null>(navigationState);
  const [toastOpen, setToastOpen] = useState(Boolean(navigationState?.configurationSaved || navigationState?.paired));
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');
  const activeControllerId = controllerId || id || navigationState?.controllerId || '';
  const releasableControllerId =
    (controller?.hw_id && /^CTRL-/i.test(controller.hw_id) ? controller.hw_id : '') ||
    navigationState?.controllerId ||
    activeControllerId;
  const isHardwareContext = Boolean(activeControllerId && /^CTRL-/i.test(activeControllerId));
  const canManageControllers = user?.accounts?.some((account) => account.role === 'OWNER' || account.role === 'ADMIN');
  const removedSensorSet = useMemo(() => new Set(removedSensorIds), [removedSensorIds]);
  const sensors = useMemo(
    () => reportedSensors.filter((sensor) => !removedSensorSet.has(getSensorIdentity(sensor))),
    [removedSensorSet, reportedSensors]
  );
  const pendingSensors = useMemo(
    () =>
      reportedSensors.filter(
        (sensor) => removedSensorSet.has(getSensorIdentity(sensor)) && sensor.status === 'OK'
      ),
    [removedSensorSet, reportedSensors]
  );

  const groupedSensors = useMemo(() => {
    const groups: Record<string, Sensor[]> = {};
    sensors.forEach((sensor) => {
      const baseId = getPhysicalSensorGroupKey(sensor, sensors);
      if (!groups[baseId]) {
        groups[baseId] = [];
      }
      groups[baseId].push(sensor);
    });

    return Object.entries(groups).map(([baseId, groupSensors]) => {
      const primarySensor = groupSensors.find((s) => s.config_active) || groupSensors[0];

      const groupType = resolvePhysicalSensorType(groupSensors);
      const originalName = getOriginalSensorName(groupType);

      let groupName = '';
      const customNamed = groupSensors.find((sensor) => !isDefaultSensorName(sensor));
      if (customNamed) {
        groupName = customNamed.name || '';
      } else {
        groupName = originalName;
      }

      const hasError = groupSensors.some(s => s.status === 'ERROR');
      const groupStatus = hasError ? 'ERROR' : 'OK';

      const isConfigured = groupSensors.some(s => s.config_active);

      let observation = undefined;
      const review = groupSensors.find(s => s.observation?.status === 'ready_for_review');
      const awaiting = groupSensors.find(s => s.observation?.status === 'awaiting_data');
      const observing = groupSensors.find(s => s.observation?.status === 'observing');
      
      if (review) {
        observation = review.observation;
      } else if (awaiting) {
        observation = awaiting.observation;
      } else if (observing) {
        observation = observing.observation;
      }

      const rangesMap: Record<string, SensorHardwareMetric> = {};
      groupSensors.forEach(s => {
        const capabilities = s.active_config?.hardware?.supported_raw_metrics?.length
          ? s.active_config.hardware.supported_raw_metrics
          : getSensorHardwareCapabilities(s.type);
        capabilities.forEach(c => {
          rangesMap[c.key] = c;
        });
      });
      let readableRanges = Object.values(rangesMap);
      if (readableRanges.length === 0) {
        readableRanges = getSensorHardwareCapabilities(groupType);
      }

      const purpose = groupSensors.map(s => s.purpose).find(p => p && p.trim() !== '');

      return {
        id: primarySensor.id,
        hw_id: baseId,
        name: groupName,
        originalName,
        type: groupType,
        status: groupStatus,
        config_active: isConfigured,
        observation,
        sensors: groupSensors,
        primarySensor,
        readableRanges,
        purpose,
      };
    });
  }, [sensors, removedSensorIds]);

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
      setReportedSensors(Array.isArray(sensorsData) ? sensorsData : []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeControllerId]);

  useEffect(() => {
    if (activeControllerId) {
      loadData();
      setRemovedSensorIds(readRemovedSensorIds(activeControllerId));
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
    if (!navigationState?.configurationSaved && !navigationState?.paired) {
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
    return null;
  };

  const getConnectionChip = (sensor: Sensor) => {
    switch (sensor.status) {
      case 'OK':
        return { label: 'Connected', color: 'success' as const };
      case 'ERROR':
        return { label: 'Error', color: 'error' as const };
      default:
        return { label: 'Not connected', color: 'default' as const };
    }
  };

  const getObservationChipForGroup = (group: any) => {
    if (!group.observation) {
      return null;
    }
    switch (group.observation.status) {
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

  const startSensorGroupRename = (group: any) => {
    setEditingSensorId(group.id);
    setSensorNameDraft(group.name);
  };

  const saveSensorNameForGroup = async (group: any) => {
    const nextName = sensorNameDraft.trim();
    if (!activeControllerId || !nextName || renamingSensorId) {
      return;
    }

    setRenamingSensorId(group.primarySensor.id);
    try {
      const updatedSensor = await renameHardwareSensor(activeControllerId, group.primarySensor.id, nextName);
      setReportedSensors((current) =>
        current.map((item) =>
          item.id === group.primarySensor.id ? { ...item, ...updatedSensor, name: updatedSensor.name || nextName } : item
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

  const removeSensorGroupFromWorkspace = async (group: any) => {
    setRemovingSensorId(group.primarySensor.id);
    try {
      await Promise.all(
        group.sensors.map((s: any) => deleteHardwareSensor(activeControllerId, s.id))
      );
      
      const nextRemovedSensorIds = [...removedSensorIds];
      group.sensors.forEach((s: any) => {
        const sensorKey = getSensorIdentity(s);
        if (!nextRemovedSensorIds.includes(sensorKey)) {
          nextRemovedSensorIds.push(sensorKey);
        }
      });
      setRemovedSensorIds(nextRemovedSensorIds);
      writeRemovedSensorIds(activeControllerId, nextRemovedSensorIds);
      
      const deletedIds = new Set(group.sensors.map((s: any) => s.id));
      setReportedSensors((current) => current.filter((item) => !deletedIds.has(item.id)));
      showToast(`${group.name} removed from the controller.`, 'success');
    } catch (err: any) {
      const responseData = err?.response?.data;
      showToast(
        err?.message ||
          (typeof responseData === 'string' ? responseData : responseData?.message) ||
          'Failed to remove sensor group from the database.',
        'error'
      );
    } finally {
      setRemovingSensorId(null);
    }
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
      setReportedSensors((current) =>
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

  const removeSensorFromWorkspace = async (sensor: Sensor) => {
    const sensorKey = getSensorIdentity(sensor);
    setRemovingSensorId(sensor.id);
    try {
      await deleteHardwareSensor(activeControllerId, sensor.id);
      const nextRemovedSensorIds = Array.from(new Set([...removedSensorIds, sensorKey]));
      setRemovedSensorIds(nextRemovedSensorIds);
      writeRemovedSensorIds(activeControllerId, nextRemovedSensorIds);
      setReportedSensors((current) => current.filter((item) => item.id !== sensor.id));
      showToast(`${sensor.name || sensor.type} removed from the controller.`, 'success');
    } catch (err: any) {
      const responseData = err?.response?.data;
      showToast(
        err?.message ||
          (typeof responseData === 'string' ? responseData : responseData?.message) ||
          'Failed to remove sensor from the database.',
        'error'
      );
    } finally {
      setRemovingSensorId(null);
    }
  };

  const allowSensorInWorkspace = (sensor: Sensor) => {
    const sensorKey = getSensorIdentity(sensor);
    const nextRemovedSensorIds = removedSensorIds.filter((id) => id !== sensorKey);
    setRemovedSensorIds(nextRemovedSensorIds);
    writeRemovedSensorIds(activeControllerId, nextRemovedSensorIds);
    showToast(`${sensor.name || sensor.type} added to this workspace.`, 'success');
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
    <Container maxWidth="xl" sx={{ pt: { xs: 1, md: 11 }, pb: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          position: { xs: 'sticky', md: 'fixed' },
          top: { xs: 8, md: 24 },
          left: { md: 'calc(268px + 32px)' },
          zIndex: 20,
          width: 'fit-content',
          mb: { xs: 1.5, md: 0 },
        }}
      >
        <IconButton
          aria-label="Go back"
          onClick={handleBack}
          sx={{
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
            {saveNotice?.observationMessage || 'System observing live readings.'}
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
          <Box
            display="flex"
            flexDirection={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'flex-start' }}
            gap={2}
            mb={2}
          >
            <Box sx={{ minWidth: 0 }}>
              {editingControllerName ? (
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
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
                    fullWidth
                    sx={{
                      minWidth: 0,
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
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Typography variant="h4" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{controller.name || 'Unnamed Controller'}</Typography>
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
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip
                label={controller.claim_status || 'CLAIMED'}
                color="primary"
                sx={{ color: '#fffdf8' }}
              />
              <Chip
                icon={controller.status === 'ONLINE' ? <Wifi /> : <WifiOff />}
                label={controller.operational_status || controller.status}
                color={getStatusColor(controller.operational_status || controller.status) as any}
                sx={{ bgcolor: controller.status === 'ONLINE' ? '#6c8930' : undefined, color: '#fffdf8' }}
              />
            </Stack>
          </Box>
          {controller.purpose && (
            <Typography variant="body1" sx={{ color: 'rgba(255, 253, 248, 0.76)', display: { xs: 'none', sm: 'block' } }} gutterBottom>
              {controller.purpose}
            </Typography>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
            {controller.location && (
              <Chip icon={<Place />} label={controller.location} sx={{ bgcolor: 'rgba(255, 253, 248, 0.12)', color: '#fffdf8' }} />
            )}
            <Chip icon={<Memory />} label={controller.hw_id} sx={{ bgcolor: 'rgba(255, 253, 248, 0.12)', color: '#fffdf8', display: { xs: 'none', sm: 'inline-flex' } }} />
          </Stack>
          {canManageControllers && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
              {isHardwareContext && (
                <Button
                  variant="contained"
                  startIcon={<Grass />}
                  onClick={() => navigate(`/hardware/${activeControllerId}/agri-config`)}
                  sx={{
                    bgcolor: '#6c8930',
                    color: '#fffdf8',
                    '&:hover': { bgcolor: '#5b7428' },
                  }}
                >
                  AgriAssist
                </Button>
              )}
              {isHardwareContext && (
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<Grass />}
                  onClick={() => navigate(`/hardware/${activeControllerId}/agri-dashboard`)}
                  sx={{
                    color: '#fffdf8',
                    borderColor: 'rgba(255, 253, 248, 0.36)',
                    '&:hover': {
                      borderColor: '#fffdf8',
                      bgcolor: 'rgba(255, 253, 248, 0.08)',
                    },
                  }}
                >
                  Agri Dashboard
                </Button>
              )}
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<DeleteOutline />}
                onClick={handleRemoveController}
                disabled={removing}
                sx={{
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
            </Stack>
          )}
        </CardContent>
      </Card>

      <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography variant="h5">Sensors ({groupedSensors.length})</Typography>
        </Box>
      </Box>

      {pendingSensors.length > 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                New sensor found
              </Typography>
              <Typography variant="body2">
                A sensor that was removed from this workspace is reporting again. Allow it if this
                sensor should be visible for this controller.
              </Typography>
            </Box>
            <Stack spacing={1}>
              {pendingSensors.map((sensor) => (
                <Stack
                  key={sensor.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  sx={{
                    p: 1,
                    border: '1px solid rgba(2, 136, 209, 0.2)',
                    borderRadius: 1,
                    bgcolor: 'rgba(2, 136, 209, 0.04)',
                  }}
                >
                  <Box>
                    <Typography variant="subtitle2">
                      {sensor.name || sensor.hw_id || sensor.type}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {sensor.type} - {sensor.hw_id || sensor.id}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<Check />}
                    onClick={() => allowSensorInWorkspace(sensor)}
                  >
                    Allow
                  </Button>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mt: 1 }}>
        {sensors.length === 0 && pendingSensors.length === 0 ? (
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
          groupedSensors.map((group) => {
            const observationChip = getObservationChipForGroup(group);
            const readinessChip = group.config_active ? { label: 'Configured', color: 'primary' as const } : null;
            const connectionChip = group.status === 'OK'
              ? { label: 'Connected', color: 'success' as const }
              : { label: 'Error', color: 'error' as const };

            const isConfigured = Boolean(group.config_active);
            const isConnected = group.status === 'OK';

            // Match the previous page's clean solid background
            const cardBg = '#fffdf8';
            
            const cardBorder = isConfigured
              ? isConnected ? 'rgba(108, 137, 48, 0.2)' : 'rgba(218, 54, 8, 0.2)'
              : 'rgba(219, 160, 72, 0.3)';
            const hoverBorder = isConfigured
              ? isConnected ? 'rgba(108, 137, 48, 0.4)' : 'rgba(218, 54, 8, 0.4)'
              : 'rgba(219, 160, 72, 0.6)';
            
            const isNewlySaved = saveNotice?.configuredSensorId && group.sensors.some(s => s.id === saveNotice?.configuredSensorId);

            return (
              <Grid item xs={12} sm={6} md={6} lg={4} key={group.hw_id}>
                <Card
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    bgcolor: cardBg,
                    border: '1px solid',
                    borderColor: isNewlySaved ? '#6c8930' : cardBorder,
                    transition: 'box-shadow 0.2s ease-in-out, border-color 0.2s ease-in-out',
                    position: 'relative',
                    overflow: 'hidden',
                    ...(isNewlySaved && {
                      boxShadow: '0 0 0 1px #6c8930 inset',
                    }),
                    '@media (hover: hover)': {
                      '&:hover': {
                        boxShadow: '0 8px 20px rgba(60, 57, 17, 0.08)',
                        borderColor: hoverBorder,
                      },
                    },
                  }}
                >
                  {/* Decorative background accent */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      width: 120,
                      height: 120,
                      opacity: 0.5,
                      background: isConfigured 
                        ? (isConnected ? 'radial-gradient(circle at top right, rgba(108, 137, 48, 0.12), transparent 70%)' : 'radial-gradient(circle at top right, rgba(218, 54, 8, 0.1), transparent 70%)')
                        : 'radial-gradient(circle at top right, rgba(235, 79, 18, 0.12), transparent 70%)',
                      pointerEvents: 'none',
                    }}
                  />
                  
                  <CardContent sx={{ p: { xs: 2.5, md: 3 }, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <Box
                      display="flex"
                      flexDirection={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'stretch', sm: 'flex-start' }}
                      gap={1.5}
                      mb={2}
                      sx={{ position: 'relative', zIndex: 1 }}
                    >
                      <Box display="flex" alignItems="center" gap={1.5} minWidth={0}>
                        <Box sx={{ 
                          p: 1.25, 
                          borderRadius: 2, 
                          bgcolor: isConfigured ? 'rgba(108, 137, 48, 0.12)' : 'rgba(219, 160, 72, 0.15)',
                          color: isConfigured ? '#6c8930' : '#dba048',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <DeviceThermostat fontSize="small" color="inherit" />
                        </Box>
                        
                        {editingSensorId === group.id ? (
                          <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={0.5}
                            alignItems="center"
                            component="form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              saveSensorNameForGroup(group);
                            }}
                            sx={{ flexGrow: 1 }}
                          >
                            <TextField
                              size="small"
                              value={sensorNameDraft}
                              onChange={(event) => setSensorNameDraft(event.target.value)}
                              autoFocus
                              label="Sensor name"
                              fullWidth
                              sx={{ minWidth: 0, bgcolor: '#fffdf8' }}
                            />
                            <Stack direction="row">
                              <IconButton
                                aria-label="Save sensor name"
                                type="submit"
                                size="small"
                                color="primary"
                                disabled={renamingSensorId === group.primarySensor.id || !sensorNameDraft.trim()}
                              >
                                <Check />
                              </IconButton>
                              <IconButton
                                aria-label="Cancel sensor name edit"
                                onClick={cancelSensorRename}
                                size="small"
                                disabled={renamingSensorId === group.primarySensor.id}
                              >
                                <Close />
                              </IconButton>
                            </Stack>
                          </Stack>
                        ) : (
                          <Box sx={{ minWidth: 0, pt: 0.5 }}>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Typography variant="h6" sx={{ 
                                fontWeight: 800, 
                                lineHeight: 1.2,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}>
                                {group.name}
                              </Typography>
                              {canManageControllers && (
                                <IconButton
                                  aria-label="Edit sensor name"
                                  size="small"
                                  onClick={() => startSensorGroupRename(group)}
                                  sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                                >
                                  <Edit fontSize="inherit" />
                                </IconButton>
                              )}
                            </Stack>
                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mt: 0.25 }}>
                              {group.type.toUpperCase()}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                              Hardware: {group.originalName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              Sensor ID: {group.hw_id}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                    
                    <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: '8px 0' }}>
                      <Chip
                        label={connectionChip.label}
                        color={connectionChip.color}
                        size="small"
                        sx={{ fontWeight: 700 }}
                      />
                      {readinessChip && (
                        <Chip
                          size="small"
                          label={readinessChip.label}
                          color={readinessChip.color}
                          sx={{ fontWeight: 700 }}
                        />
                      )}
                      {observationChip && (
                        <Chip
                          size="small"
                          label={observationChip.label}
                          color={observationChip.color}
                          sx={{ fontWeight: 700 }}
                        />
                      )}
                    </Stack>

                    <Box sx={{ flexGrow: 1 }}>
                      {group.readableRanges.length > 0 && (
                        <Box sx={{ 
                          mb: 2, 
                          p: 1.5, 
                          borderRadius: 2, 
                          bgcolor: 'rgba(255, 253, 248, 0.6)', 
                          border: '1px solid rgba(60, 57, 17, 0.08)',
                          backdropFilter: 'blur(8px)',
                        }}>
                          <Typography variant="caption" sx={{ display: 'block', mb: 1, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Physical Metrics
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {group.readableRanges.map((metric) => (
                              <Chip
                                key={`${group.id}-${metric.key}`}
                                label={`${metric.label}: ${formatHardwareMetricRange(metric)}`}
                                variant="outlined"
                                sx={{
                                  borderColor: 'rgba(108, 137, 48, 0.3)',
                                  color: '#6c8930',
                                  fontWeight: 600,
                                  bgcolor: 'rgba(108, 137, 48, 0.04)',
                                }}
                              />
                            ))}
                          </Box>
                        </Box>
                      )}
                      
                      {group.purpose && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
                          "{group.purpose}"
                        </Typography>
                      )}
                    </Box>

                    <Stack direction="row" spacing={1.5} sx={{ mt: 'auto', pt: 2, borderTop: '1px solid rgba(60, 57, 17, 0.08)' }}>
                        <Button
                          variant="outlined"
                          color={group.config_active ? "inherit" : "primary"}
                          startIcon={group.config_active ? <Tune /> : <Settings />}
                          onClick={() =>
                            navigate(
                              isHardwareContext
                                ? `/hardware/${activeControllerId}/sensors/${group.primarySensor.id}/configure`
                                : `/sensors/${group.primarySensor.id}/config`,
                              {
                                state: {
                                  controllerId: activeControllerId,
                                  sensorId: group.primarySensor.id,
                                  sensorType: group.primarySensor.type,
                                  sensorName: group.name,
                                  configured: Boolean(group.config_active),
                                  returnTo: isHardwareContext
                                    ? `/hardware/${activeControllerId}/sensors`
                                    : `/controllers/${activeControllerId}`,
                                },
                              }
                            )
                          }
                          sx={group.config_active ? { flexGrow: 1, borderColor: 'rgba(60, 57, 17, 0.2)' } : { flexGrow: 1 }}
                        >
                          {group.config_active ? 'Advanced' : 'Manual'}
                        </Button>
                        {canManageControllers && (
                          <IconButton
                            color="error"
                            disabled={removingSensorId === group.primarySensor.id}
                            onClick={() => removeSensorGroupFromWorkspace(group)}
                            sx={{ 
                              border: '1px solid rgba(218, 54, 8, 0.2)', 
                              borderRadius: 2,
                              '&:hover': { bgcolor: 'rgba(218, 54, 8, 0.04)' }
                            }}
                            title="Remove Sensor"
                          >
                            <DeleteOutline />
                          </IconButton>
                        )}
                    </Stack>
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
