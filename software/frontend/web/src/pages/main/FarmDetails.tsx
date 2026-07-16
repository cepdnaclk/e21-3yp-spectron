import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  Agriculture,
  ArrowBack,
  CheckCircle,
  Delete,
  GroupAdd,
  History,
  Hub,
  Info,
  PersonRemove,
  Place,
  Router,
  Sensors,
  WarningAmber,
} from '@mui/icons-material';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { PageHeaderSkeleton } from '../../components/LoadingSkeletons';
import { EmptyStateCard, MetricCard, PageHeaderPanel, PageShell } from '../../components/ui/PageSurface';
import {
  addFarmCollaborator,
  acknowledgeFarmAlert,
  assignSensorBase,
  attachFarmController,
  Collaborator,
  confirmCropStage,
  createCropInstance,
  createField,
  createSensorBase,
  createSensorModule,
  Crop,
  CropInstance,
  FarmAlert,
  FarmController,
  Field,
  Farm,
  getCrops,
  getFarm,
  getFarmAlerts,
  getFarmCollaborators,
  getFarmControllers,
  getFarmFields,
  getFarmSensorBases,
  getFieldCropInstances,
  getSensorBaseAssignments,
  getSensorModules,
  removeFarmCollaborator,
  SensorBase,
  SensorBaseAssignment,
  SensorModule,
} from '../../services/farmService';

type CropForm = {
  cropId: string;
  varietyId: string;
  plantingDate: string;
  plantingDatePrecision: 'exact' | 'approximate' | 'unknown';
  expectedHarvestDate: string;
};

type ModuleChannelForm = {
  channelKey: string;
  measurementType: string;
  unit: string;
};

type ModuleForm = {
  slotNumber: string;
  model: string;
  channels: ModuleChannelForm[];
};

const emptyCropForm: CropForm = {
  cropId: '',
  varietyId: '',
  plantingDate: '',
  plantingDatePrecision: 'exact',
  expectedHarvestDate: '',
};

const emptyModuleForm: ModuleForm = {
  slotNumber: '1',
  model: '',
  channels: [{ channelKey: 'temperature', measurementType: 'temperature', unit: 'C' }],
};

const channelKeyPattern = /^[a-z0-9][a-z0-9_-]{0,39}$/;

const FarmDetails: React.FC = () => {
  const { farmId = '' } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationMessage = (location.state as { message?: string } | null)?.message || '';
  const [farm, setFarm] = useState<Farm | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [cropInstances, setCropInstances] = useState<Record<string, CropInstance[]>>({});
  const [controllers, setControllers] = useState<FarmController[]>([]);
  const [sensorBases, setSensorBases] = useState<SensorBase[]>([]);
  const [modulesByBase, setModulesByBase] = useState<Record<string, SensorModule[]>>({});
  const [farmAlerts, setFarmAlerts] = useState<FarmAlert[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<SensorBaseAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(navigationMessage);
  const [error, setError] = useState('');
  const [openField, setOpenField] = useState(false);
  const [openAccess, setOpenAccess] = useState(false);
  const [openCrop, setOpenCrop] = useState(false);
  const [openStage, setOpenStage] = useState(false);
  const [openController, setOpenController] = useState(false);
  const [openBase, setOpenBase] = useState(false);
  const [openAssignBase, setOpenAssignBase] = useState(false);
  const [openModule, setOpenModule] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [selectedCropInstance, setSelectedCropInstance] = useState<CropInstance | null>(null);
  const [selectedBase, setSelectedBase] = useState<SensorBase | null>(null);
  const [saving, setSaving] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [fieldForm, setFieldForm] = useState({ name: '', latitude: '', longitude: '', area: '' });
  const [accessForm, setAccessForm] = useState({ email: '' });
  const [cropForm, setCropForm] = useState<CropForm>(emptyCropForm);
  const [controllerForm, setControllerForm] = useState({ controllerId: '', model: '' });
  const [baseForm, setBaseForm] = useState({ gatewayId: '', serialNumber: '', label: '' });
  const [baseAssignForm, setBaseAssignForm] = useState({ fieldId: '', monitoringZone: '' });
  const [moduleForm, setModuleForm] = useState<ModuleForm>(emptyModuleForm);

  const ownerMode = farm?.role === 'owner';

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const nextFarm = await getFarm(farmId);
      const [fieldsResult, collaboratorsResult, cropsResult, controllersResult, basesResult, alertsResult] =
        await Promise.allSettled([
          getFarmFields(farmId),
          getFarmCollaborators(farmId),
          getCrops(),
          getFarmControllers(farmId),
          getFarmSensorBases(farmId),
          getFarmAlerts(farmId, { status: 'open' }),
        ]);

      const nextFields = fieldsResult.status === 'fulfilled' ? fieldsResult.value : [];
      const nextCollaborators = collaboratorsResult.status === 'fulfilled' ? collaboratorsResult.value : [];
      const nextCrops = cropsResult.status === 'fulfilled' ? cropsResult.value : [];
      const nextControllers = controllersResult.status === 'fulfilled' ? controllersResult.value : [];
      const nextBases = basesResult.status === 'fulfilled' ? basesResult.value : [];
      const nextAlerts = alertsResult.status === 'fulfilled' ? alertsResult.value : [];

      const cropPairs = await Promise.allSettled(
        nextFields.map(async (field) => {
          const instances = await getFieldCropInstances(field.id);
          return [field.id, instances] as const;
        }),
      );
      const modulePairs = await Promise.allSettled(
        nextBases.map(async (base) => {
          const modules = await getSensorModules(base.id);
          return [base.id, modules] as const;
        }),
      );
      const nextCropInstances: Record<string, CropInstance[]> = {};
      cropPairs.forEach((result) => {
        if (result.status === 'fulfilled') {
          const [fieldID, instances] = result.value;
          nextCropInstances[fieldID] = instances;
        }
      });
      const nextModulesByBase: Record<string, SensorModule[]> = {};
      modulePairs.forEach((result) => {
        if (result.status === 'fulfilled') {
          const [baseID, modules] = result.value;
          nextModulesByBase[baseID] = modules;
        }
      });

      setFarm(nextFarm);
      setFields(nextFields);
      setCollaborators(nextCollaborators);
      setCrops(nextCrops);
      setCropInstances(nextCropInstances);
      setControllers(nextControllers);
      setSensorBases(nextBases);
      setModulesByBase(nextModulesByBase);
      setFarmAlerts(nextAlerts);
      const failedSections = [
        fieldsResult.status,
        collaboratorsResult.status,
        cropsResult.status,
        controllersResult.status,
        basesResult.status,
        alertsResult.status,
        ...cropPairs.map((result) => result.status),
        ...modulePairs.map((result) => result.status),
      ].some((status) => status === 'rejected');
      if (failedSections) {
        setError('Some farm sections could not be loaded.');
      } else {
        setError('');
      }
    } catch (err) {
      console.error(err);
      setFarm(null);
      setError(err instanceof Error && err.message ? err.message : 'Failed to load farm.');
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (navigationMessage) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, navigationMessage]);

  const fieldCount = useMemo(() => fields.length, [fields]);
  const collaboratorCount = useMemo(() => collaborators.length, [collaborators]);
  const baseCount = useMemo(() => sensorBases.length, [sensorBases]);
  const openAlertCount = useMemo(() => farmAlerts.filter((alert) => alert.status !== 'acknowledged').length, [farmAlerts]);
  const activeCropCount = useMemo(
    () => Object.values(cropInstances).filter((items) => items.some((item) => item.active)).length,
    [cropInstances],
  );
  const baseActionDisabled = controllers.length === 0;
  const selectedCrop = useMemo(() => crops.find((crop) => crop.id === cropForm.cropId), [cropForm.cropId, crops]);
  const stageChoices = useMemo(() => {
    if (!selectedCropInstance) {
      return [];
    }
    return crops.find((crop) => crop.id === selectedCropInstance.crop_id)?.stages || [];
  }, [crops, selectedCropInstance]);

  const activeCropForField = (fieldId: string) => cropInstances[fieldId]?.find((instance) => instance.active);
  const fieldNameById = (fieldId?: string | null) => fields.find((field) => field.id === fieldId)?.name || 'Field';
  const controllerNameById = (gatewayId: string) => controllers.find((controller) => controller.id === gatewayId)?.serial_number || 'Controller';
  const modulesForBase = (baseId: string) => modulesByBase[baseId] || [];
  const alertSeverityColor = (severity: FarmAlert['severity']) => {
    const normalized = String(severity).toLowerCase();
    if (normalized === 'critical') {
      return 'error' as const;
    }
    if (normalized === 'warning' || normalized === 'warn') {
      return 'warning' as const;
    }
    return 'info' as const;
  };

  const parseOptionalNumber = (value: string, label: string, min?: number, max?: number) => {
    if (!value.trim()) {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${label} must be a number.`);
    }
    if (min !== undefined && parsed < min) {
      throw new Error(`${label} is too low.`);
    }
    if (max !== undefined && parsed > max) {
      throw new Error(`${label} is too high.`);
    }
    return parsed;
  };

  const submitField = async () => {
    try {
      if (!fieldForm.name.trim()) {
        setError('Field name is required.');
        return;
      }
      setSaving(true);
      const field = await createField(farmId, {
        name: fieldForm.name.trim(),
        latitude: parseOptionalNumber(fieldForm.latitude, 'Latitude', -90, 90),
        longitude: parseOptionalNumber(fieldForm.longitude, 'Longitude', -180, 180),
        area: parseOptionalNumber(fieldForm.area, 'Area', 0),
      });
      setFields((current) => [field, ...current]);
      setCropInstances((current) => ({ ...current, [field.id]: [] }));
      setFieldForm({ name: '', latitude: '', longitude: '', area: '' });
      setOpenField(false);
      setNotice('Field added.');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to add field.');
    } finally {
      setSaving(false);
    }
  };

  const submitAccess = async () => {
    try {
      const email = accessForm.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Enter a valid email.');
        return;
      }
      setSaving(true);
      await addFarmCollaborator(farmId, { email, role: 'viewer' });
      setAccessForm({ email: '' });
      setOpenAccess(false);
      setNotice('Access sent.');
      setCollaborators(await getFarmCollaborators(farmId));
    } catch (err) {
      console.error(err);
      setError('Failed to add access.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeFarmCollaborator(farmId, userId);
      setCollaborators(await getFarmCollaborators(farmId));
      setNotice('Access removed.');
    } catch (err) {
      console.error(err);
      setError('Failed to remove access.');
    }
  };

  const openCropDialog = (field: Field) => {
    setSelectedField(field);
    setCropForm({ ...emptyCropForm, cropId: crops[0]?.id || '' });
    setOpenCrop(true);
  };

  const submitCrop = async () => {
    if (!selectedField) {
      return;
    }
    try {
      if (!cropForm.cropId) {
        setError('Select a crop.');
        return;
      }
      if (cropForm.plantingDatePrecision !== 'unknown' && !cropForm.plantingDate) {
        setError('Planting date is required.');
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      if (cropForm.plantingDate && cropForm.plantingDate > today) {
        setError('Planting date cannot be future.');
        return;
      }
      if (cropForm.expectedHarvestDate && cropForm.plantingDate && cropForm.expectedHarvestDate < cropForm.plantingDate) {
        setError('Harvest date must be after planting.');
        return;
      }
      setSaving(true);
      const instance = await createCropInstance(selectedField.id, {
        crop_id: cropForm.cropId,
        variety_id: cropForm.varietyId || undefined,
        planting_date: cropForm.plantingDatePrecision === 'unknown' ? undefined : cropForm.plantingDate,
        planting_date_precision: cropForm.plantingDatePrecision,
        expected_harvest_date: cropForm.expectedHarvestDate || undefined,
      });
      setCropInstances((current) => ({
        ...current,
        [selectedField.id]: [instance, ...(current[selectedField.id] || [])],
      }));
      setOpenCrop(false);
      setSelectedField(null);
      setNotice('Crop set.');
    } catch (err) {
      console.error(err);
      setError('Failed to set crop.');
    } finally {
      setSaving(false);
    }
  };

  const openStageDialog = (instance: CropInstance) => {
    setSelectedCropInstance(instance);
    setOpenStage(true);
  };

  const confirmStage = async (stageId: string) => {
    if (!selectedCropInstance) {
      return;
    }
    try {
      setSaving(true);
      const updated = await confirmCropStage(selectedCropInstance.id, stageId);
      setCropInstances((current) => ({
        ...current,
        [updated.field_id]: (current[updated.field_id] || []).map((item) => (item.id === updated.id ? updated : item)),
      }));
      setSelectedCropInstance(updated);
      setOpenStage(false);
      setNotice('Stage confirmed.');
    } catch (err) {
      console.error(err);
      setError('Failed to confirm stage.');
    } finally {
      setSaving(false);
    }
  };

  const submitController = async () => {
    try {
      const controllerId = controllerForm.controllerId.trim();
      if (!controllerId) {
        setSetupError('Controller ID is required.');
        return;
      }
      setSaving(true);
      const nextControllers = await attachFarmController(farmId, {
        controller_id: controllerId,
        model: controllerForm.model.trim() || undefined,
      });
      setControllers(nextControllers);
      setControllerForm({ controllerId: '', model: '' });
      setSetupError('');
      setOpenController(false);
      setNotice('Controller linked.');
    } catch (err) {
      console.error(err);
      setSetupError('Failed to link controller.');
    } finally {
      setSaving(false);
    }
  };

  const submitBase = async () => {
    try {
      if (!baseForm.gatewayId) {
        setSetupError('Select controller.');
        return;
      }
      const serialNumber = baseForm.serialNumber.trim().toUpperCase();
      if (!serialNumber) {
        setSetupError('Base serial is required.');
        return;
      }
      if (serialNumber.length > 80) {
        setSetupError('Base serial is too long.');
        return;
      }
      if (sensorBases.some((base) => base.serial_number.toUpperCase() === serialNumber)) {
        setSetupError('Base serial already exists.');
        return;
      }
      setSaving(true);
      const base = await createSensorBase(farmId, {
        gateway_id: baseForm.gatewayId,
        serial_number: serialNumber,
        label: baseForm.label.trim() || undefined,
      });
      setSensorBases((current) => [base, ...current]);
      setModulesByBase((current) => ({ ...current, [base.id]: [] }));
      setBaseForm({ gatewayId: controllers[0]?.id || '', serialNumber: '', label: '' });
      setSetupError('');
      setOpenBase(false);
      setNotice('Base added.');
    } catch (err) {
      console.error(err);
      setSetupError('Failed to add base.');
    } finally {
      setSaving(false);
    }
  };

  const openAssignDialog = (base: SensorBase) => {
    setSetupError('');
    setSelectedBase(base);
    setBaseAssignForm({
      fieldId: base.current_assignment?.field_id || fields[0]?.id || '',
      monitoringZone: base.current_assignment?.monitoring_zone || '',
    });
    setOpenAssignBase(true);
  };

  const submitBaseAssignment = async () => {
    if (!selectedBase) {
      return;
    }
    try {
      if (!baseAssignForm.fieldId && !baseAssignForm.monitoringZone.trim()) {
        setSetupError('Select field or zone.');
        return;
      }
      if (baseAssignForm.monitoringZone.trim().length > 80) {
        setSetupError('Zone is too long.');
        return;
      }
      setSaving(true);
      const updated = await assignSensorBase(selectedBase.id, {
        field_id: baseAssignForm.fieldId || undefined,
        monitoring_zone: baseAssignForm.monitoringZone.trim() || undefined,
      });
      setSensorBases((current) => current.map((base) => (base.id === updated.id ? updated : base)));
      setControllers(await getFarmControllers(farmId));
      setSetupError('');
      setOpenAssignBase(false);
      setSelectedBase(null);
      setNotice('Base assigned.');
    } catch (err) {
      console.error(err);
      setSetupError('Failed to assign base.');
    } finally {
      setSaving(false);
    }
  };

  const openBaseHistory = async (base: SensorBase) => {
    try {
      setSelectedBase(base);
      setAssignmentHistory(await getSensorBaseAssignments(base.id));
      setOpenHistory(true);
    } catch (err) {
      console.error(err);
      setError('Failed to load history.');
    }
  };

  const openModuleDialog = (base: SensorBase) => {
    setSetupError('');
    setSelectedBase(base);
    setModuleForm({
      ...emptyModuleForm,
      slotNumber: String((modulesByBase[base.id]?.length || 0) + 1),
      channels: emptyModuleForm.channels.map((channel) => ({ ...channel })),
    });
    setOpenModule(true);
  };

  const updateModuleChannel = (index: number, patch: Partial<ModuleChannelForm>) => {
    setModuleForm((current) => ({
      ...current,
      channels: current.channels.map((channel, channelIndex) => (
        channelIndex === index ? { ...channel, ...patch } : channel
      )),
    }));
  };

  const addModuleChannel = () => {
    setModuleForm((current) => ({
      ...current,
      channels: [...current.channels, { channelKey: '', measurementType: '', unit: '' }],
    }));
  };

  const removeModuleChannel = (index: number) => {
    setModuleForm((current) => ({
      ...current,
      channels: current.channels.filter((_, channelIndex) => channelIndex !== index),
    }));
  };

  const submitModule = async () => {
    if (!selectedBase) {
      return;
    }
    try {
      const slotNumber = Number(moduleForm.slotNumber);
      if (!Number.isInteger(slotNumber) || slotNumber <= 0) {
        setSetupError('Slot must be positive.');
        return;
      }
      if (modulesForBase(selectedBase.id).some((module) => module.slot_number === slotNumber)) {
        setSetupError('Slot already exists.');
        return;
      }
      if (moduleForm.channels.length > 12) {
        setSetupError('Use 12 channels or fewer.');
        return;
      }
      const channels = moduleForm.channels.map((channel) => ({
        channel_key: channel.channelKey.trim().toLowerCase(),
        measurement_type: channel.measurementType.trim().toLowerCase(),
        unit: channel.unit.trim() || undefined,
      }));
      if (channels.length === 0 || channels.some((channel) => !channel.channel_key || !channel.measurement_type)) {
        setSetupError('Channels need key and type.');
        return;
      }
      if (channels.some((channel) => !channelKeyPattern.test(channel.channel_key))) {
        setSetupError('Channel keys need letters, numbers, hyphen, or underscore.');
        return;
      }
      if (channels.some((channel) => channel.measurement_type.length > 80)) {
        setSetupError('Measurement type is too long.');
        return;
      }
      const keys = new Set(channels.map((channel) => channel.channel_key.toLowerCase()));
      if (keys.size !== channels.length) {
        setSetupError('Channel keys must be unique.');
        return;
      }
      setSaving(true);
      const module = await createSensorModule(selectedBase.id, {
        slot_number: slotNumber,
        model: moduleForm.model.trim() || undefined,
        channels,
      });
      setModulesByBase((current) => ({
        ...current,
        [selectedBase.id]: [...(current[selectedBase.id] || []), module].sort((a, b) => a.slot_number - b.slot_number),
      }));
      setSetupError('');
      setOpenModule(false);
      setSelectedBase(null);
      setNotice('Module added.');
    } catch (err) {
      console.error(err);
      setSetupError('Failed to add module.');
    } finally {
      setSaving(false);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      setSaving(true);
      const updated = await acknowledgeFarmAlert(farmId, alertId);
      setFarmAlerts((current) => current.map((alert) => (alert.id === updated.id ? updated : alert)));
      setNotice('Alert acknowledged.');
    } catch (err) {
      console.error(err);
      setError('Failed to acknowledge alert.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageHeaderSkeleton />;
  }

  if (!farm) {
    return (
      <Container maxWidth="md" sx={{ py: { xs: 2, md: 3 } }}>
        <PageShell>
          <Card
            variant="outlined"
            sx={{
              bgcolor: 'rgba(255,253,248,0.94)',
              boxShadow: '0 12px 28px rgba(60, 57, 17, 0.06)',
            }}
          >
            <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h5">Farm unavailable</Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                    {error || 'This farm could not be opened.'}
                  </Typography>
                </Box>
                <Button variant="contained" onClick={() => navigate('/farms')} sx={{ alignSelf: 'flex-start' }}>
                  Back to Farms
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </PageShell>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      <AutoDismissAlert open={Boolean(notice)} severity="success" sx={{ mb: 2 }} onCloseAlert={() => setNotice('')}>
        {notice}
      </AutoDismissAlert>
      <AutoDismissAlert open={Boolean(error)} severity="error" sx={{ mb: 2 }} onCloseAlert={() => setError('')}>
        {error}
      </AutoDismissAlert>

      <PageShell>
        <PageHeaderPanel
          title={farm.name}
          subtitle={`${farm.role} access`}
          icon={<Agriculture />}
          info="Farm-level view. Fields, crops, and people live here."
          actions={
            <Stack direction="row" spacing={1}>
              <IconButton onClick={() => navigate('/farms')} aria-label="Back to farms">
                <ArrowBack />
              </IconButton>
            </Stack>
          }
        />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Fields" value={fieldCount} icon={<Place fontSize="small" />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="People" value={collaboratorCount} icon={<GroupAdd fontSize="small" />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Crops" value={activeCropCount} icon={<Agriculture fontSize="small" />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Alerts" value={openAlertCount} icon={<WarningAmber fontSize="small" />} tone="error.main" />
        </Grid>
      </Grid>

      {ownerMode && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
          <Tooltip title="Create a field to hold crops and monitoring areas.">
            <Button startIcon={<Add />} variant="contained" onClick={() => setOpenField(true)}>
              Add field
            </Button>
          </Tooltip>
          <Tooltip title="Invite a viewer to read this farm.">
            <Button variant="outlined" onClick={() => setOpenAccess(true)}>
              Invite viewer
            </Button>
          </Tooltip>
          <Tooltip title="Register a physical controller for this farm.">
            <Button variant="outlined" startIcon={<Router />} onClick={() => setOpenController(true)}>
              Link controller
            </Button>
          </Tooltip>
          <Tooltip title={baseActionDisabled ? 'Add a controller first.' : 'Register a sensor base under a controller.'}>
            <span>
              <Button
                variant="outlined"
                startIcon={<Hub />}
                onClick={() => {
                  setBaseForm({ gatewayId: controllers[0]?.id || '', serialNumber: '', label: '' });
                  setOpenBase(true);
                }}
                disabled={baseActionDisabled}
              >
                Register base
              </Button>
            </span>
          </Tooltip>
        </Stack>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} lg={7}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="h6">Fields</Typography>
            <Tooltip title="Fields hold crop setup. Controller links come later through sensor bases.">
              <IconButton size="small" aria-label="Fields help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          <Grid container spacing={2}>
            {fields.length === 0 ? (
              <Grid item xs={12}>
                <EmptyStateCard icon={<Place sx={{ fontSize: 38 }} />} title="No fields yet" />
              </Grid>
            ) : (
              fields.map((field) => {
                const activeCrop = activeCropForField(field.id);
                return (
                  <Grid item xs={12} sm={6} key={field.id}>
                    <Card variant="outlined" sx={{ height: '100%', bgcolor: 'rgba(255,253,248,0.94)', boxShadow: '0 12px 28px rgba(60, 57, 17, 0.06)' }}>
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                          <Box>
                            <Typography fontWeight={800}>{field.name}</Typography>
                            <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                              <Chip size="small" label={field.area ? `${field.area} ha` : 'Area n/a'} />
                            </Stack>
                          </Box>
                          {ownerMode && (
                            <Tooltip title="Set crop">
                              <IconButton size="small" onClick={() => openCropDialog(field)} aria-label={`Set crop for ${field.name}`}>
                                <Agriculture fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>

                        {activeCrop ? (
                          <Box sx={{ mt: 2, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(108, 137, 48, 0.06)' }}>
                            <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                              <Box>
                                <Typography fontWeight={700}>{activeCrop.crop_name}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {activeCrop.current_stage?.name || 'Stage pending'}
                                </Typography>
                              </Box>
                              {ownerMode && activeCrop.current_stage && (
                                <Button size="small" onClick={() => openStageDialog(activeCrop)}>
                                  Stage
                                </Button>
                              )}
                            </Stack>
                          </Box>
                        ) : (
                          <Stack direction="row" spacing={1} sx={{ mt: 2 }} alignItems="center">
                            <Chip size="small" icon={<Agriculture />} label="No crop" />
                            {ownerMode && (
                              <Button size="small" onClick={() => openCropDialog(field)}>
                                Set
                              </Button>
                            )}
                          </Stack>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })
            )}
          </Grid>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="h6">People</Typography>
            <Tooltip title="Owners manage access. Viewers can only read.">
              <IconButton size="small" aria-label="People help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          <Stack spacing={1.25}>
            {collaborators.map((person) => (
              <Card key={person.user_id} variant="outlined" sx={{ bgcolor: 'rgba(255,253,248,0.94)', boxShadow: '0 12px 28px rgba(60, 57, 17, 0.06)' }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={800} noWrap>{person.name || person.email}</Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {person.email}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" label={person.role} />
                      {ownerMode && person.role === 'viewer' && (
                        <IconButton size="small" onClick={() => handleRemove(person.user_id)} aria-label="Remove viewer">
                          <PersonRemove fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
            {collaborators.length === 0 && (
              <EmptyStateCard title="No people yet" />
            )}
          </Stack>
        </Grid>
      </Grid>

      <Box sx={{ mt: 4 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="h6">Alerts</Typography>
          <Tooltip title="Farm alerts are scoped to fields, bases, and crops.">
            <IconButton size="small" aria-label="Farm alerts help">
              <Info fontSize="small" />
            </IconButton>
          </Tooltip>
          <Chip size="small" label={openAlertCount} />
        </Stack>
        {farmAlerts.length === 0 ? (
          <EmptyStateCard icon={<WarningAmber sx={{ fontSize: 38 }} />} title="No alerts" />
        ) : (
          <Grid container spacing={2}>
            {farmAlerts.slice(0, 4).map((alert) => (
              <Grid item xs={12} md={6} key={alert.id}>
                <Card variant="outlined" sx={{ bgcolor: 'rgba(255,253,248,0.94)', boxShadow: '0 12px 28px rgba(60, 57, 17, 0.06)' }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Chip size="small" color={alertSeverityColor(alert.severity)} label={String(alert.severity).toLowerCase()} />
                          <Chip size="small" variant="outlined" label={alert.status} />
                          {alert.field_name && <Chip size="small" variant="outlined" label={alert.field_name} />}
                        </Stack>
                        <Typography sx={{ mt: 1 }} fontWeight={800}>
                          {alert.message}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(alert.created_at).toLocaleDateString()}
                        </Typography>
                      </Box>
                      {ownerMode && alert.status !== 'acknowledged' && (
                        <Button size="small" onClick={() => acknowledgeAlert(alert.id)} disabled={saving}>
                          Ack
                        </Button>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
      </PageShell>

      <Box sx={{ mt: 4 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="h6">Hardware</Typography>
          <Tooltip title="Controllers belong to the farm. Fields are linked through sensor bases.">
            <IconButton size="small" aria-label="Hardware help">
              <Info fontSize="small" />
            </IconButton>
          </Tooltip>
          <Chip size="small" label={baseCount} />
        </Stack>
        <Grid container spacing={2}>
          <Grid item xs={12} md={5}>
            <Stack spacing={1.25}>
              {controllers.map((controller) => (
                <Card key={controller.id} variant="outlined">
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={800} noWrap>{controller.serial_number}</Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {controller.field_ids.length ? controller.field_ids.map(fieldNameById).join(', ') : 'No field link'}
                        </Typography>
                      </Box>
                      <Chip size="small" label={controller.status} />
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {controllers.length === 0 && (
                <Box sx={{ py: 4, textAlign: 'center', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Router color="primary" sx={{ fontSize: 36 }} />
                  <Typography sx={{ mt: 1 }}>No controllers</Typography>
                </Box>
              )}
            </Stack>
          </Grid>
          <Grid item xs={12} md={7}>
            <Stack spacing={1.25}>
              {sensorBases.map((base) => (
                <Card key={base.id} variant="outlined">
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={800} noWrap>{base.label || base.serial_number}</Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {controllerNameById(base.gateway_id)}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                          <Chip size="small" label={base.status} />
                          <Chip
                            size="small"
                            label={
                              base.current_assignment?.field_id
                                ? fieldNameById(base.current_assignment.field_id)
                                : base.current_assignment?.monitoring_zone || 'Unassigned'
                            }
                          />
                        </Stack>
                        {modulesForBase(base.id).length > 0 && (
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                            {modulesForBase(base.id).flatMap((module) =>
                              module.channels.map((channel) => (
                                <Chip
                                  key={channel.id}
                                  size="small"
                                  variant="outlined"
                                  label={channel.unit ? `${channel.measurement_type} ${channel.unit}` : channel.measurement_type}
                                />
                              )),
                            )}
                          </Stack>
                        )}
                      </Box>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {ownerMode && (
                          <Tooltip title="Module">
                            <IconButton size="small" onClick={() => openModuleDialog(base)} aria-label="Add module">
                              <Sensors fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {ownerMode && (
                          <Tooltip title="Assign">
                            <IconButton size="small" onClick={() => openAssignDialog(base)} aria-label="Assign base">
                              <Place fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="History">
                          <IconButton size="small" onClick={() => openBaseHistory(base)} aria-label="Base history">
                            <History fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {sensorBases.length === 0 && (
                <Box sx={{ py: 4, textAlign: 'center', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Hub color="primary" sx={{ fontSize: 36 }} />
                  <Typography sx={{ mt: 1 }}>No bases</Typography>
                </Box>
              )}
            </Stack>
          </Grid>
        </Grid>
      </Box>

      <Dialog open={openField} onClose={() => { setOpenField(false); setSetupError(''); }} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Add Field</span>
            <Tooltip title="Name is required. Location and area help maps and alerts.">
              <IconButton size="small" aria-label="Add field help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <AutoDismissAlert open={Boolean(setupError) && openField} severity="error" onCloseAlert={() => setSetupError('')}>
              {setupError}
            </AutoDismissAlert>
            <TextField label="Field name" value={fieldForm.name} onChange={(e) => setFieldForm((c) => ({ ...c, name: e.target.value }))} autoFocus />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Latitude" value={fieldForm.latitude} onChange={(e) => setFieldForm((c) => ({ ...c, latitude: e.target.value }))} fullWidth />
              <TextField label="Longitude" value={fieldForm.longitude} onChange={(e) => setFieldForm((c) => ({ ...c, longitude: e.target.value }))} fullWidth />
            </Stack>
            <TextField label="Area" value={fieldForm.area} onChange={(e) => setFieldForm((c) => ({ ...c, area: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenField(false); setSetupError(''); }}>Cancel</Button>
          <Button variant="contained" onClick={submitField} disabled={saving || !fieldForm.name.trim()}>
            {saving ? 'Saving' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openAccess} onClose={() => { setOpenAccess(false); setSetupError(''); }} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Access</span>
            <Tooltip title="Invited people can view only. Admin accounts are separate.">
              <IconButton size="small" aria-label="Access help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <AutoDismissAlert open={Boolean(setupError) && openAccess} severity="error" onCloseAlert={() => setSetupError('')}>
              {setupError}
            </AutoDismissAlert>
            <TextField label="Viewer email" value={accessForm.email} onChange={(e) => setAccessForm({ email: e.target.value })} autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenAccess(false); setSetupError(''); }}>Cancel</Button>
          <Button variant="contained" onClick={submitAccess} disabled={saving || !accessForm.email.trim()}>
            {saving ? 'Sending' : 'Invite'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openController} onClose={() => { setOpenController(false); setSetupError(''); }} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Controller</span>
            <Tooltip title="Use a paired controller ID owned by this account.">
              <IconButton size="small" aria-label="Controller help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <AutoDismissAlert open={Boolean(setupError) && openController} severity="error" onCloseAlert={() => setSetupError('')}>
              {setupError}
            </AutoDismissAlert>
            <TextField label="Controller ID" value={controllerForm.controllerId} onChange={(e) => setControllerForm((c) => ({ ...c, controllerId: e.target.value }))} autoFocus />
            <TextField label="Model" value={controllerForm.model} onChange={(e) => setControllerForm((c) => ({ ...c, model: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenController(false); setSetupError(''); }}>Cancel</Button>
          <Button variant="contained" onClick={submitController} disabled={saving || !controllerForm.controllerId.trim()}>
            {saving ? 'Saving' : 'Link'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openBase} onClose={() => { setOpenBase(false); setSetupError(''); }} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Base</span>
            <Tooltip title="A base links one controller to one field at a time. Moves keep history.">
              <IconButton size="small" aria-label="Sensor base help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <AutoDismissAlert open={Boolean(setupError) && openBase} severity="error" onCloseAlert={() => setSetupError('')}>
              {setupError}
            </AutoDismissAlert>
            <FormControl fullWidth>
              <InputLabel>Controller</InputLabel>
              <Select label="Controller" value={baseForm.gatewayId} onChange={(event) => setBaseForm((c) => ({ ...c, gatewayId: event.target.value }))}>
                {controllers.map((controller) => (
                  <MenuItem key={controller.id} value={controller.id}>{controller.serial_number}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Base serial" value={baseForm.serialNumber} onChange={(e) => setBaseForm((c) => ({ ...c, serialNumber: e.target.value }))} />
            <TextField label="Label" value={baseForm.label} onChange={(e) => setBaseForm((c) => ({ ...c, label: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenBase(false); setSetupError(''); }}>Cancel</Button>
          <Button variant="contained" onClick={submitBase} disabled={saving || !baseForm.gatewayId || !baseForm.serialNumber.trim()}>
            {saving ? 'Saving' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openAssignBase} onClose={() => { setOpenAssignBase(false); setSetupError(''); }} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Assign Base</span>
            <Tooltip title="Changing field closes the old assignment and keeps it in history.">
              <IconButton size="small" aria-label="Assign base help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <AutoDismissAlert open={Boolean(setupError) && openAssignBase} severity="error" onCloseAlert={() => setSetupError('')}>
              {setupError}
            </AutoDismissAlert>
            <FormControl fullWidth disabled={fields.length === 0}>
              <InputLabel>Field</InputLabel>
              <Select label="Field" value={baseAssignForm.fieldId} onChange={(event) => setBaseAssignForm((c) => ({ ...c, fieldId: event.target.value }))}>
                <MenuItem value="">None</MenuItem>
                {fields.map((field) => (
                  <MenuItem key={field.id} value={field.id}>{field.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Zone" value={baseAssignForm.monitoringZone} onChange={(e) => setBaseAssignForm((c) => ({ ...c, monitoringZone: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenAssignBase(false); setSetupError(''); }}>Cancel</Button>
          <Button variant="contained" onClick={submitBaseAssignment} disabled={saving || (!baseAssignForm.fieldId && !baseAssignForm.monitoringZone.trim())}>
            {saving ? 'Saving' : 'Assign'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openModule} onClose={() => { setOpenModule(false); setSetupError(''); }} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Module</span>
            <Tooltip title="One physical module can expose multiple channels.">
              <IconButton size="small" aria-label="Module help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <AutoDismissAlert open={Boolean(setupError) && openModule} severity="error" onCloseAlert={() => setSetupError('')}>
              {setupError}
            </AutoDismissAlert>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Slot"
                value={moduleForm.slotNumber}
                onChange={(e) => setModuleForm((current) => ({ ...current, slotNumber: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Model"
                value={moduleForm.model}
                onChange={(e) => setModuleForm((current) => ({ ...current, model: e.target.value }))}
                fullWidth
              />
            </Stack>
            <Stack spacing={1.25}>
              {moduleForm.channels.map((channel, index) => (
                <Card key={`${index}-${channel.channelKey}`} variant="outlined">
                  <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                      <TextField
                        label="Key"
                        value={channel.channelKey}
                        onChange={(e) => updateModuleChannel(index, { channelKey: e.target.value })}
                        size="small"
                        fullWidth
                      />
                      <TextField
                        label="Type"
                        value={channel.measurementType}
                        onChange={(e) => updateModuleChannel(index, { measurementType: e.target.value })}
                        size="small"
                        fullWidth
                      />
                      <TextField
                        label="Unit"
                        value={channel.unit}
                        onChange={(e) => updateModuleChannel(index, { unit: e.target.value })}
                        size="small"
                        sx={{ minWidth: { sm: 92 } }}
                      />
                      <Tooltip title="Remove">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => removeModuleChannel(index)}
                            disabled={moduleForm.channels.length === 1}
                            aria-label="Remove channel"
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
            <Button variant="outlined" startIcon={<Add />} onClick={addModuleChannel} disabled={moduleForm.channels.length >= 12}>
              Channel
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenModule(false); setSetupError(''); }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitModule}
            disabled={saving || !moduleForm.slotNumber || moduleForm.channels.length > 12 || moduleForm.channels.some((channel) => !channel.channelKey.trim() || !channel.measurementType.trim())}
          >
            {saving ? 'Saving' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openHistory} onClose={() => setOpenHistory(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>History</span>
            <Tooltip title="Previous field links are kept for readings and reports.">
              <IconButton size="small" aria-label="Base history help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.25} sx={{ mt: 1 }}>
            {assignmentHistory.map((assignment) => (
              <Card key={assignment.id} variant="outlined">
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={800} noWrap>
                        {assignment.field_id ? fieldNameById(assignment.field_id) : assignment.monitoring_zone || 'Zone'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {new Date(assignment.assigned_at).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Chip size="small" label={assignment.unassigned_at ? 'Past' : 'Active'} />
                  </Stack>
                </CardContent>
              </Card>
            ))}
            {assignmentHistory.length === 0 && (
              <Box sx={{ py: 4, textAlign: 'center', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography color="text.secondary">No history</Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenHistory(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openCrop} onClose={() => setOpenCrop(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Set Crop</span>
            <Tooltip title="Stage is estimated from planting date. Confirm only if needed.">
              <IconButton size="small" aria-label="Crop setup help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Crop</InputLabel>
              <Select
                label="Crop"
                value={cropForm.cropId}
                onChange={(event) => setCropForm((current) => ({ ...current, cropId: event.target.value, varietyId: '' }))}
              >
                {crops.map((crop) => (
                  <MenuItem key={crop.id} value={crop.id}>{crop.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={!selectedCrop?.varieties.length}>
              <InputLabel>Variety</InputLabel>
              <Select
                label="Variety"
                value={cropForm.varietyId}
                onChange={(event) => setCropForm((current) => ({ ...current, varietyId: event.target.value }))}
              >
                <MenuItem value="">None</MenuItem>
                {selectedCrop?.varieties.map((variety) => (
                  <MenuItem key={variety.id} value={variety.id}>{variety.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Planting</InputLabel>
              <Select
                label="Planting"
                value={cropForm.plantingDatePrecision}
                onChange={(event) => setCropForm((current) => ({
                  ...current,
                  plantingDatePrecision: event.target.value as CropForm['plantingDatePrecision'],
                  plantingDate: event.target.value === 'unknown' ? '' : current.plantingDate,
                }))}
              >
                <MenuItem value="exact">Exact</MenuItem>
                <MenuItem value="approximate">Approx</MenuItem>
                <MenuItem value="unknown">Unknown</MenuItem>
              </Select>
            </FormControl>
            {cropForm.plantingDatePrecision !== 'unknown' && (
              <TextField
                label="Date"
                type="date"
                value={cropForm.plantingDate}
                onChange={(event) => setCropForm((current) => ({ ...current, plantingDate: event.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            )}
            <TextField
              label="Harvest"
              type="date"
              value={cropForm.expectedHarvestDate}
              onChange={(event) => setCropForm((current) => ({ ...current, expectedHarvestDate: event.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCrop(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitCrop} disabled={saving || !cropForm.cropId}>
            {saving ? 'Saving' : 'Set'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openStage} onClose={() => setOpenStage(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Confirm Stage</span>
            <Tooltip title="Pick the closest visual stage when the estimate looks wrong.">
              <IconButton size="small" aria-label="Stage help">
                <Info fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.25} sx={{ mt: 1 }}>
            {stageChoices.map((stage) => {
              const selected = selectedCropInstance?.current_stage?.id === stage.id;
              return (
                <Button
                  key={stage.id}
                  variant={selected ? 'contained' : 'outlined'}
                  startIcon={selected ? <CheckCircle /> : undefined}
                  onClick={() => confirmStage(stage.id)}
                  disabled={saving}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  {stage.name}
                </Button>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenStage(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default FarmDetails;
