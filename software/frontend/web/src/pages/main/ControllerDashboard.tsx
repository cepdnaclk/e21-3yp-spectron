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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material';
import { ArrowBack, Check, Close, Edit, Settings, DeviceThermostat, Place, Memory, Tune, Wifi, WifiOff, Grass } from '@mui/icons-material';
import { Controller, ControllerFieldLink, getControllerFieldLinks } from '../../services/controllerService';
import { Sensor } from '../../services/sensorService';
import {
  HardwarePairingSensor,
  getHardwareController,
  getMyHardwareControllers,
  getHardwareSensors,
  renameHardwareController,
  renameHardwareSensor,
  releaseHardwareController,
  resolveHardwareControllerRouteId,
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
import { PageShell } from '../../components/ui/PageSurface';
import { useAuth } from '../../contexts/AuthContext';
import { assignSensorBase, Field, getFarmControllers, getFarmFields, getFarms } from '../../services/farmService';

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

const isLegacyPlaceholderSensorId = (sensor: Sensor) => {
  const sensorId = (sensor.hw_id || sensor.id || '').trim().toLowerCase();
  return /(?:^|-)sensor-(temp|load|ultra)-01(?:-(temperature|humidity|pressure|distance))?$/.test(sensorId);
};

const isRealPairedHardwareSensorId = (sensor: Sensor) => {
  const sensorId = (sensor.hw_id || sensor.id || '').trim();
  return /^CTRL-[A-Z0-9-]+-sensor-\d+(?:-(temperature|humidity|pressure|distance))?$/i.test(sensorId);
};

const ControllerDashboard: React.FC = () => {
  const { id, controllerId } = useParams<{ id?: string; controllerId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [controller, setController] = useState<Controller | null>(null);
  const [reportedSensors, setReportedSensors] = useState<Sensor[]>([]);
  const [fieldLinks, setFieldLinks] = useState<ControllerFieldLink[]>([]);
  const [removedSensorIds, setRemovedSensorIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [renamingController, setRenamingController] = useState(false);
  const [editingControllerName, setEditingControllerName] = useState(false);
  const [controllerNameDraft, setControllerNameDraft] = useState('');
  const [renamingSensorId, setRenamingSensorId] = useState<string | null>(null);
  const [editingSensorId, setEditingSensorId] = useState<string | null>(null);
  const [sensorNameDraft, setSensorNameDraft] = useState('');
  const [fieldsForAssignment, setFieldsForAssignment] = useState<Field[]>([]);
  const [assigningBaseId, setAssigningBaseId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [assigningBase, setAssigningBase] = useState(false);
  const navigationState = (location.state || null) as DashboardNavigationState | null;
  const [saveNotice, setSaveNotice] = useState<DashboardNavigationState | null>(navigationState);
  const [toastOpen, setToastOpen] = useState(Boolean(navigationState?.configurationSaved || navigationState?.paired));
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');
  const activeControllerId = controllerId || id || navigationState?.controllerId || '';
  const releasableControllerId = (controller?.hw_id || activeControllerId || '').trim();
  const isHardwareContext = Boolean(activeControllerId && /^CTRL-/i.test(activeControllerId));
  const canManageControllers = user?.accounts?.some((account) => account.role === 'OWNER' || account.role === 'ADMIN');
  const removedSensorSet = useMemo(() => new Set(removedSensorIds), [removedSensorIds]);
  const filteredReportedSensors = useMemo(() => {
    const hasRealPairedHardware = reportedSensors.some(isRealPairedHardwareSensorId);
    if (!hasRealPairedHardware) {
      return reportedSensors;
    }

    return reportedSensors.filter((sensor) => !isLegacyPlaceholderSensorId(sensor));
  }, [reportedSensors]);
  const sensors = useMemo(
    () => filteredReportedSensors.filter((sensor) => !removedSensorSet.has(getSensorIdentity(sensor))),
    [filteredReportedSensors, removedSensorSet]
  );
  const pendingSensors = useMemo(
    () =>
      filteredReportedSensors.filter(
        (sensor) => removedSensorSet.has(getSensorIdentity(sensor)) && sensor.status === 'OK'
      ),
    [filteredReportedSensors, removedSensorSet]
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
  }, [sensors]);

  const sensorStatusSummary = useMemo(() => {
    const errorCount = groupedSensors.filter((group) => group.status === 'ERROR').length;
    const connectedCount = groupedSensors.filter((group) => group.status === 'OK').length;
    return { errorCount, connectedCount };
  }, [groupedSensors]);

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

    navigate('/farms');
  };

  const loadData = useCallback(async () => {
    if (!activeControllerId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let resolvedControllerId = activeControllerId;
      let controllerData: Controller;
      let usingOfflineFallback = false;

      try {
        controllerData = await getHardwareController(resolvedControllerId);
      } catch (error) {
        const fallbackControllerId = await resolveHardwareControllerRouteId(activeControllerId);
        if (fallbackControllerId && fallbackControllerId !== resolvedControllerId) {
          resolvedControllerId = fallbackControllerId;
          controllerData = await getHardwareController(resolvedControllerId);
          navigate(`/controllers/${encodeURIComponent(resolvedControllerId)}`, {
            replace: true,
            state: location.state,
          });
        } else {
          const [ownedControllers, farms] = await Promise.all([
            getMyHardwareControllers().catch(() => []),
            getFarms().catch(() => []),
          ]);

          const ownedMatch = ownedControllers.find(
            (item) =>
              item.id === activeControllerId ||
              item.hw_id.trim().toUpperCase() === activeControllerId.trim().toUpperCase()
          );

          if (ownedMatch) {
            controllerData = {
              ...ownedMatch,
              status: 'OFFLINE',
              operational_status: 'OFFLINE',
            };
            resolvedControllerId = ownedMatch.hw_id || ownedMatch.id;
            usingOfflineFallback = true;
          } else {
            let farmMatch: { serial_number: string; legacy_controller_id?: string | null; last_seen?: string | null } | null = null;
            for (const farm of farms) {
              const farmControllers = await getFarmControllers(farm.id).catch(() => []);
              const match = farmControllers.find(
                (item) =>
                  item.id === activeControllerId ||
                  item.serial_number.trim().toUpperCase() === activeControllerId.trim().toUpperCase() ||
                  (item.legacy_controller_id || '').trim().toUpperCase() === activeControllerId.trim().toUpperCase()
              );
              if (match) {
                farmMatch = match;
                break;
              }
            }

            if (!farmMatch) {
              throw error;
            }

            const fallbackHwId = (farmMatch.legacy_controller_id || farmMatch.serial_number || activeControllerId).trim();
            controllerData = {
              id: fallbackHwId,
              account_id: '',
              hw_id: fallbackHwId,
              name: farmMatch.serial_number || fallbackHwId,
              status: 'OFFLINE',
              operational_status: 'OFFLINE',
              claim_status: 'CLAIMED',
              last_seen: farmMatch.last_seen || undefined,
              created_at: '',
            };
            resolvedControllerId = fallbackHwId;
            usingOfflineFallback = true;
          }
        }
      }

      const controllerLookupId =
        (controllerData.hw_id && /^CTRL-/i.test(controllerData.hw_id)
          ? controllerData.hw_id
          : '') || resolvedControllerId;
      const [sensorsData, fieldLinkData] = await Promise.all([
        usingOfflineFallback
          ? Promise.resolve([])
          : getHardwareSensors(controllerLookupId, { liveOnly: true }).catch(() => []),
        getControllerFieldLinks(controllerLookupId).catch(() => []),
      ]);
      setController(controllerData);
      setReportedSensors(Array.isArray(sensorsData) ? sensorsData : []);
      setFieldLinks(fieldLinkData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeControllerId, location.state, navigate]);

  const loadAssignableFields = useCallback(async (controllerHwId: string) => {
    const farms = await getFarms();
    for (const farm of farms) {
      const controllers = await getFarmControllers(farm.id).catch(() => []);
      const isMatch = controllers.some(
        (item) =>
          item.serial_number.trim().toUpperCase() === controllerHwId.trim().toUpperCase() ||
          (item.legacy_controller_id || '').trim().toUpperCase() === controllerHwId.trim().toUpperCase()
      );
      if (isMatch) {
        const fields = await getFarmFields(farm.id).catch(() => []);
        setFieldsForAssignment(fields);
        return;
      }
    }
    setFieldsForAssignment([]);
  }, []);

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

  const showToast = (message: string, severity: 'success' | 'error') => {
    setSaveNotice({ observationMessage: message });
    setToastSeverity(severity);
    setToastOpen(true);
  };

  const handleRemoveController = async () => {
    if (!releasableControllerId || removing) {
      return;
    }

    setRemoving(true);
    try {
      await releaseHardwareController(releasableControllerId);
      navigate('/hardware', {
        replace: true,
        state: { message: 'Controller removed from your account.' },
      });
    } catch (err: any) {
      const responseData = err?.response?.data;
      showToast(
        err?.message ||
          (typeof responseData === 'string' ? responseData : responseData?.message) ||
          'Failed to remove controller.',
        'error'
      );
    } finally {
      setRemoving(false);
    }
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

  const cancelSensorRename = () => {
    setEditingSensorId(null);
    setSensorNameDraft('');
  };

  const openAssignFieldDialog = async (baseId: string) => {
    const controllerHwId = controller?.hw_id || activeControllerId;
    await loadAssignableFields(controllerHwId);
    setAssigningBaseId(baseId);
    setSelectedFieldId('');
  };

  const submitAssignField = async () => {
    if (!assigningBaseId || !selectedFieldId) {
      return;
    }
    setAssigningBase(true);
    try {
      await assignSensorBase(assigningBaseId, { field_id: selectedFieldId });
      setAssigningBaseId(null);
      setSelectedFieldId('');
      await loadData();
      showToast('Sensor Base assigned to the field.', 'success');
    } catch (err: any) {
      const responseData = err?.response?.data;
      showToast(
        err?.message || (typeof responseData === 'string' ? responseData : responseData?.message) || 'Failed to assign Sensor Base to the field.',
        'error'
      );
    } finally {
      setAssigningBase(false);
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
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      <PageShell>
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
          bgcolor: 'rgba(255, 253, 248, 0.9)',
          color: 'text.primary',
          border: '1px solid rgba(60, 57, 17, 0.1)',
          borderRadius: 4,
          backdropFilter: 'blur(14px)',
          boxShadow: '0 16px 40px rgba(60, 57, 17, 0.08)',
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
                    placeholder="eg: Main field controller"
                    fullWidth
                    sx={{
                      minWidth: 0,
                      bgcolor: 'rgba(108, 137, 48, 0.08)',
                      borderRadius: 1,
                      '& .MuiInputBase-input, & .MuiInputLabel-root': {
                        color: 'text.primary',
                      },
                    }}
                  />
                  <IconButton
                    aria-label="Save controller name"
                    type="submit"
                    disabled={renamingController || !controllerNameDraft.trim()}
                    sx={{ color: 'primary.main' }}
                  >
                    <Check />
                  </IconButton>
                  <IconButton
                    aria-label="Cancel controller name edit"
                    onClick={cancelControllerRename}
                    disabled={renamingController}
                    sx={{ color: 'text.secondary' }}
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
                      sx={{ color: 'primary.main' }}
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
              />
              <Chip
                icon={controller.status === 'ONLINE' ? <Wifi /> : <WifiOff />}
                label={controller.operational_status || controller.status}
                color={getStatusColor(controller.operational_status || controller.status) as any}
                sx={{ bgcolor: controller.status === 'ONLINE' ? '#6c8930' : undefined }}
              />
            </Stack>
          </Box>
          {controller.purpose && (
            <Typography variant="body1" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }} gutterBottom>
              {controller.purpose}
            </Typography>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
            {controller.location && (
              <Chip icon={<Place />} label={controller.location} sx={{ bgcolor: 'rgba(108, 137, 48, 0.08)' }} />
            )}
            <Chip icon={<Memory />} label={controller.hw_id} sx={{ bgcolor: 'rgba(108, 137, 48, 0.08)', display: { xs: 'none', sm: 'inline-flex' } }} />
          </Stack>
          {canManageControllers && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
              {isHardwareContext && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Grass />}
                  onClick={() => navigate('/farms')}
                  sx={{
                    minHeight: 40,
                    px: 2.25,
                    bgcolor: '#6c8930',
                    color: '#fffdf8',
                    '&:hover': { bgcolor: '#5b7428' },
                  }}
                >
                  Farm Setup
                </Button>
              )}
              {(controller.operational_status || controller.status) === 'OFFLINE' && (
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleRemoveController}
                  disabled={removing}
                  sx={{
                    borderColor: 'rgba(60, 57, 17, 0.18)',
                    '&:hover': {
                      borderColor: 'rgba(60, 57, 17, 0.28)',
                      bgcolor: 'rgba(108, 137, 48, 0.04)',
                    },
                  }}
                >
                  {removing ? 'Removing...' : 'Remove controller'}
                </Button>
              )}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography variant="h5">Sensors ({groupedSensors.length})</Typography>
        </Box>
      </Box>

      <Grid container spacing={1.5} sx={{ mt: 0.5, mb: 1 }}>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary">Controller status</Typography>
            <Typography fontWeight={800}>{controller.operational_status || controller.status}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary">Sensor status</Typography>
            <Typography fontWeight={800}>{sensorStatusSummary.connectedCount} good · {sensorStatusSummary.errorCount} needs attention</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card variant="outlined"><CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary">Last controller signal</Typography>
            <Typography fontWeight={800}>{controller.last_seen ? new Date(controller.last_seen).toLocaleString() : 'Waiting for signal'}</Typography>
          </CardContent></Card>
        </Grid>
      </Grid>

      {fieldLinks.length > 0 && (
        <Card variant="outlined" sx={{ mb: 1.5 }}>
          <CardContent>
            <Typography variant="h6">Sensor Bases and Fields</Typography>
            <Stack spacing={1.25} sx={{ mt: 1.5 }}>
              {fieldLinks.map((link) => (
                <Stack key={link.base_id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                  <Box>
                    <Typography fontWeight={800}>{link.label || link.serial_number}</Typography>
                    <Typography variant="body2" color="text.secondary">{link.field_name || link.monitoring_zone || 'Waiting for field setup'}</Typography>
                  </Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                    <Chip size="small" label={link.status === 'live' ? 'Good' : link.status === 'waiting_setup' ? 'Waiting setup' : link.status === 'offline' ? 'Offline' : 'Needs attention'} color={link.status === 'live' ? 'success' : link.status === 'offline' ? 'default' : 'warning'} />
                    <Button
                      size="small"
                      variant={link.field_id ? 'outlined' : 'contained'}
                      onClick={() => link.base_id && openAssignFieldDialog(link.base_id)}
                    >
                      {link.field_id ? 'Change field' : 'Assign to field'}
                    </Button>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

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
              ? { label: 'Active', color: 'success' as const }
              : { label: 'Offline', color: 'default' as const };

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
                              placeholder="eg: Canopy temperature"
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
                                  sensorType: group.type,
                                    sensorName: group.name,
                                    configured: Boolean(group.config_active),
                                    returnTo: isHardwareContext
                                      ? `/hardware/${activeControllerId}/sensors`
                                      : '/farms',
                                  },
                                }
                              )
                          }
                          sx={group.config_active ? { flexGrow: 1, borderColor: 'rgba(60, 57, 17, 0.2)' } : { flexGrow: 1 }}
                        >
                          {group.config_active ? 'Advanced' : 'Manual'}
                        </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })
        )}
      </Grid>
      <Dialog open={Boolean(assigningBaseId)} onClose={() => !assigningBase && setAssigningBaseId(null)} fullWidth maxWidth="sm">
        <DialogTitle>Assign Sensor Base to Field</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {fieldsForAssignment.length === 0 ? (
              <Alert severity="info">Create a field in this farm first, then assign this Sensor Base.</Alert>
            ) : (
              <FormControl fullWidth>
                <InputLabel id="assign-field-label">Field</InputLabel>
                <Select
                  labelId="assign-field-label"
                  label="Field"
                  value={selectedFieldId}
                  onChange={(event) => setSelectedFieldId(event.target.value)}
                >
                  {fieldsForAssignment.map((field) => (
                    <MenuItem key={field.id} value={field.id}>
                      {field.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssigningBaseId(null)} disabled={assigningBase}>Cancel</Button>
          {fieldsForAssignment.length === 0 ? (
            <Button variant="contained" onClick={() => navigate('/farms')} disabled={assigningBase}>
              Go to Farms
            </Button>
          ) : (
            <Button variant="contained" onClick={submitAssignField} disabled={assigningBase || !selectedFieldId}>
              {assigningBase ? 'Saving...' : 'Assign field'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
      </PageShell>
    </Container>
  );
};

export default ControllerDashboard;
