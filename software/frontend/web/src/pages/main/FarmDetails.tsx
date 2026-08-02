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
  DeviceThermostat,
  Edit,
  Grass,
  GroupAdd,
  History,
  Hub,
  Info,
  PersonRemove,
  Place,
  Router,
  Sensors,
  ShowChart,
  Speed,
  WarningAmber,
  WaterDrop,
  WbSunny,
} from '@mui/icons-material';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import { PageHeaderSkeleton } from '../../components/LoadingSkeletons';
import { EmptyStateCard, PageShell } from '../../components/ui/PageSurface';
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
import { getSensorReadings, getSensors, Sensor, SensorReading } from '../../services/sensorService';
import FarmLocationPicker, { FarmLocationSelection } from '../../components/FarmLocationPicker';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

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
  const [sensorsByController, setSensorsByController] = useState<Record<string, Sensor[]>>({});
  const [latestReadingsBySensor, setLatestReadingsBySensor] = useState<Record<string, SensorReading | null>>({});
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
  const [openFarmTools, setOpenFarmTools] = useState(false);
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [selectedCropInstance, setSelectedCropInstance] = useState<CropInstance | null>(null);
  const [selectedBase, setSelectedBase] = useState<SensorBase | null>(null);
  const [saving, setSaving] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [fieldForm, setFieldForm] = useState({ name: '', area: '' });
  const [selectedFieldLocation, setSelectedFieldLocation] = useState<FarmLocationSelection | null>(null);
  const [fieldLocationConfirmed, setFieldLocationConfirmed] = useState(false);
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
      const sensorPairs = await Promise.allSettled(
        nextControllers.map(async (controller) => {
          const sensors = await getSensors(controller.id);
          return [controller.id, sensors] as const;
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
      const nextSensorsByController: Record<string, Sensor[]> = {};
      sensorPairs.forEach((result) => {
        if (result.status === 'fulfilled') {
          const [controllerID, sensors] = result.value;
          nextSensorsByController[controllerID] = sensors;
        }
      });
      const allSensors = Object.values(nextSensorsByController).flat();
      const latestReadingPairs = await Promise.allSettled(
        allSensors.map(async (sensor) => {
          const readings = await getSensorReadings(sensor.id);
          return [sensor.id, readings[0] || null] as const;
        }),
      );
      const nextLatestReadingsBySensor: Record<string, SensorReading | null> = {};
      latestReadingPairs.forEach((result) => {
        if (result.status === 'fulfilled') {
          const [sensorID, reading] = result.value;
          nextLatestReadingsBySensor[sensorID] = reading;
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
      setSensorsByController(nextSensorsByController);
      setLatestReadingsBySensor(nextLatestReadingsBySensor);
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
        ...sensorPairs.map((result) => result.status),
        ...latestReadingPairs.map((result) => result.status),
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
  useRealtimeRefresh('customer', load);

  useEffect(() => {
    if (navigationMessage) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, navigationMessage]);

  const fieldCount = useMemo(() => fields.length, [fields]);
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
  const normalizeText = (value?: string | null) => String(value || '').trim().toLowerCase();
  const titleText = (value?: string | null) => {
    const cleaned = String(value || '').replace(/[_-]+/g, ' ').trim();
    return cleaned ? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Sensor';
  };
  const readingNumber = (reading?: SensorReading | null) => reading?.value ?? reading?.avg_value;
  const friendlyUnit = (unit?: string | null) => {
    const cleaned = String(unit || '').trim();
    if (!cleaned) {
      return '';
    }
    if (cleaned.toLowerCase() === 'c') {
      return ' C';
    }
    return ` ${cleaned}`;
  };
  const formatReadingValue = (reading?: SensorReading | null, unit?: string | null) => {
    const value = readingNumber(reading);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 'Waiting';
    }
    const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(1).replace(/\.0$/, '');
    return `${rounded}${friendlyUnit(unit)}`;
  };
  const formatShortDate = (value?: string | null) => {
    if (!value) {
      return 'No recent reading';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'No recent reading';
    }
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const basesForField = (fieldId: string) =>
    sensorBases.filter((base) => base.current_assignment?.field_id === fieldId);
  const channelsForBase = (base: SensorBase) =>
    modulesForBase(base.id).flatMap((module) =>
      module.channels.map((channel) => ({ base, module, channel })),
    );
  const latestReadingForChannel = (base: SensorBase, channel: SensorModule['channels'][number]) => {
    const baseID = normalizeText(base.id);
    const baseSerial = normalizeText(base.serial_number);
    const channelID = normalizeText(channel.id);
    const channelKey = normalizeText(channel.channel_key);
    const measurementType = normalizeText(channel.measurement_type);
    const sensors = sensorsByController[base.gateway_id] || [];
    const exactMetaMatch = sensors.find((sensor) => {
      const meta = latestReadingsBySensor[sensor.id]?.meta || {};
      return normalizeText(String(meta.sensor_channel_id || '')) === channelID;
    });
    if (exactMetaMatch) {
      return latestReadingsBySensor[exactMetaMatch.id] || null;
    }
    const baseMetaMatch = sensors.find((sensor) => {
      const meta = latestReadingsBySensor[sensor.id]?.meta || {};
      return (
        normalizeText(String(meta.sensor_base_id || '')) === baseID &&
        normalizeText(String(meta.sensor_channel_key || '')) === channelKey
      );
    });
    if (baseMetaMatch) {
      return latestReadingsBySensor[baseMetaMatch.id] || null;
    }
    const serialMatch = sensors.find((sensor) => {
      const hwID = normalizeText(sensor.hw_id);
      const sensorType = normalizeText(sensor.type);
      return hwID.includes(baseSerial) && (sensorType === measurementType || sensorType.includes(measurementType));
    });
    if (serialMatch) {
      return latestReadingsBySensor[serialMatch.id] || null;
    }
    const metricMatch = sensors.find((sensor) => normalizeText(sensor.type) === measurementType);
    return metricMatch ? latestReadingsBySensor[metricMatch.id] || null : null;
  };
  const liveConditionItems = (() => {
    const priority = ['temperature', 'humidity', 'pressure'];
    const seen = new Set<string>();
    const items: Array<{ key: string; label: string; value: string; updatedAt?: string | null; icon: React.ReactNode }> = [];
    const iconByKey: Record<string, React.ReactNode> = {
      temperature: <DeviceThermostat fontSize="small" />,
      humidity: <WaterDrop fontSize="small" />,
      pressure: <Speed fontSize="small" />,
    };
    sensorBases.forEach((base) => {
      channelsForBase(base).forEach(({ channel }) => {
        const metric = normalizeText(channel.measurement_type || channel.channel_key);
        if (seen.has(metric)) {
          return;
        }
        const reading = latestReadingForChannel(base, channel);
        seen.add(metric);
        items.push({
          key: metric,
          label: titleText(channel.measurement_type || channel.channel_key),
          value: formatReadingValue(reading, channel.unit),
          updatedAt: reading?.time,
          icon: iconByKey[metric] || <Sensors fontSize="small" />,
        });
      });
    });
    return items.sort((a, b) => {
      const first = priority.indexOf(a.key);
      const second = priority.indexOf(b.key);
      return (first === -1 ? 99 : first) - (second === -1 ? 99 : second);
    }).slice(0, 3);
  })();
  const totalChannelCount = useMemo(
    () => Object.values(modulesByBase).flatMap((modules) => modules.flatMap((module) => module.channels)).length,
    [modulesByBase],
  );
  const offlineBaseCount = useMemo(
    () => sensorBases.filter((base) => ['offline', 'error'].includes(normalizeText(base.status))).length,
    [sensorBases],
  );
  const waitingBaseCount = useMemo(
    () => sensorBases.filter((base) => normalizeText(base.status) === 'waiting_setup' || !base.current_assignment).length,
    [sensorBases],
  );
  const farmAttention = useMemo(() => {
    if (openAlertCount > 0 || offlineBaseCount > 0) {
      return {
        label: 'Needs attention',
        detail: openAlertCount > 0 ? `${openAlertCount} alert${openAlertCount === 1 ? '' : 's'} to check` : `${offlineBaseCount} base${offlineBaseCount === 1 ? '' : 's'} offline`,
        color: '#dba048',
        bg: 'rgba(219, 160, 72, 0.16)',
      };
    }
    if (fieldCount === 0 || waitingBaseCount > 0) {
      return {
        label: 'Waiting setup',
        detail: fieldCount === 0 ? 'Add your first field' : `${waitingBaseCount} base${waitingBaseCount === 1 ? '' : 's'} need setup`,
        color: '#337a85',
        bg: 'rgba(51, 122, 133, 0.12)',
      };
    }
    return {
      label: 'Good',
      detail: 'Farm is monitored',
      color: '#6c8930',
      bg: 'rgba(108, 137, 48, 0.13)',
    };
  }, [fieldCount, offlineBaseCount, openAlertCount, waitingBaseCount]);
  const farmLocationLabel = farm?.location_label || (
    typeof farm?.latitude === 'number' && typeof farm?.longitude === 'number'
      ? `${farm.latitude.toFixed(4)}, ${farm.longitude.toFixed(4)}`
      : 'Farm location'
  );
  const fieldAttention = (field: Field) => {
    const fieldAlerts = farmAlerts.filter((alert) => alert.field_id === field.id && alert.status !== 'acknowledged');
    const fieldBases = basesForField(field.id);
    const problemBases = fieldBases.filter((base) => ['offline', 'error'].includes(normalizeText(base.status)));
    if (fieldAlerts.length || problemBases.length) {
      return {
        label: 'Needs attention',
        detail: fieldAlerts[0]?.message || `${problemBases.length} base${problemBases.length === 1 ? '' : 's'} offline`,
        color: '#dba048',
        bg: 'rgba(219, 160, 72, 0.16)',
      };
    }
    if (fieldBases.length === 0) {
      return {
        label: 'Waiting setup',
        detail: 'Assign a sensor base when ready.',
        color: '#337a85',
        bg: 'rgba(51, 122, 133, 0.12)',
      };
    }
    return {
      label: 'Good',
      detail: 'No open issues.',
      color: '#6c8930',
      bg: 'rgba(108, 137, 48, 0.13)',
    };
  };
  const surfaceCardSx = {
    height: '100%',
    borderRadius: 2.5,
    borderColor: 'rgba(60, 57, 17, 0.1)',
    bgcolor: 'rgba(255,253,248,0.9)',
    boxShadow: '0 12px 28px rgba(60, 57, 17, 0.06)',
  };
  const softMetricSx = {
    p: 1.4,
    borderRadius: 2,
    bgcolor: 'rgba(108, 137, 48, 0.07)',
    minHeight: 86,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  };
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
      if (selectedFieldLocation && !fieldLocationConfirmed) {
        setSetupError('Confirm the selected field location before adding.');
        return;
      }
      setSaving(true);
      const field = await createField(farmId, {
        name: fieldForm.name.trim(),
        latitude: selectedFieldLocation?.latitude,
        longitude: selectedFieldLocation?.longitude,
        area: parseOptionalNumber(fieldForm.area, 'Area', 0),
      });
      setFields((current) => [field, ...current]);
      setCropInstances((current) => ({ ...current, [field.id]: [] }));
      setFieldForm({ name: '', area: '' });
      setSelectedFieldLocation(null);
      setFieldLocationConfirmed(false);
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
        <IconButton onClick={() => navigate('/farms')} aria-label="Back to farms" sx={{ mb: 1 }}>
          <ArrowBack />
        </IconButton>

        <Box
          sx={{
            mb: 3,
            px: { xs: 2, md: 3 },
            py: { xs: 2.25, md: 3 },
            borderRadius: { xs: 3, md: 5 },
            border: '1px solid rgba(60, 57, 17, 0.08)',
            bgcolor: 'rgba(255,253,248,0.92)',
            boxShadow: '0 18px 44px rgba(60, 57, 17, 0.08)',
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            spacing={2}
          >
            <Stack direction="row" spacing={1.75} alignItems="center" sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  width: { xs: 50, md: 60 },
                  height: { xs: 50, md: 60 },
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: 'rgba(108, 137, 48, 0.12)',
                  color: 'primary.main',
                  flexShrink: 0,
                }}
              >
                <Agriculture />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                  <Typography variant="h4" sx={{ overflowWrap: 'anywhere', textTransform: 'uppercase' }}>
                    {farm.name}
                  </Typography>
                  <Tooltip title={`${farm.role} access. Farm-level view for fields, crops, people, and hardware.`}>
                    <IconButton size="small" aria-label="Farm details help">
                      <Info fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {farmLocationLabel}
                </Typography>
              </Box>
            </Stack>
            {ownerMode && (
              <Button
                variant="outlined"
                startIcon={<Edit />}
                onClick={() => setOpenFarmTools(true)}
                sx={{
                  alignSelf: { xs: 'flex-start', sm: 'center' },
                  borderRadius: 999,
                  px: 2.25,
                  bgcolor: 'rgba(255,253,248,0.75)',
                }}
              >
                Farm settings
              </Button>
            )}
          </Stack>
        </Box>

        <Grid container spacing={2.5} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={surfaceCardSx}>
              <CardContent sx={{ p: { xs: 2.25, md: 2.75 }, '&:last-child': { pb: { xs: 2.25, md: 2.75 } } }}>
                <Stack direction="row" spacing={1.75} alignItems="flex-start">
                  <WbSunny sx={{ color: '#dba048' }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6">Weather</Typography>
                    <Typography color="text.secondary">Waiting for weather</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {farmLocationLabel}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Forecast source not connected
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={surfaceCardSx}>
              <CardContent sx={{ p: { xs: 2.25, md: 2.75 }, '&:last-child': { pb: { xs: 2.25, md: 2.75 } } }}>
                <Stack direction="row" spacing={1.75} alignItems="flex-start">
                  <ShowChart sx={{ color: 'primary.main' }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6">Live conditions</Typography>
                    <Typography color="text.secondary">
                      {totalChannelCount > 0 ? `${totalChannelCount} sensor channels` : 'Waiting for sensors'}
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                      {liveConditionItems.length ? liveConditionItems.map((item) => (
                        <Chip key={item.key} size="small" icon={item.icon as React.ReactElement} label={`${item.label}: ${item.value}`} />
                      )) : (
                        <Chip size="small" label="No readings yet" />
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={surfaceCardSx}>
              <CardContent sx={{ p: { xs: 2.25, md: 2.75 }, '&:last-child': { pb: { xs: 2.25, md: 2.75 } } }}>
                <Stack direction="row" spacing={1.75} alignItems="flex-start">
                  <WarningAmber sx={{ color: '#dba048' }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6">
                      {openAlertCount === 1 ? '1 alert to check' : `${openAlertCount} alerts to check`}
                    </Typography>
                    <Typography color="text.secondary">
                      {openAlertCount > 0 ? 'Conditions that need your attention' : 'No open alerts'}
                    </Typography>
                    <Chip
                      size="small"
                      label={farmAttention.label}
                      sx={{ mt: 1, color: farmAttention.color, bgcolor: farmAttention.bg, fontWeight: 800 }}
                    />
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {ownerMode && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mb: 3 }}>
            <Tooltip title="Create a field to hold crops and monitoring areas.">
              <Button
                startIcon={<Add />}
                variant="contained"
                onClick={() => {
                  setSetupError('');
                  setFieldForm({ name: '', area: '' });
                  setSelectedFieldLocation(null);
                  setFieldLocationConfirmed(false);
                  setOpenField(true);
                }}
              >
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

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="h5">Fields</Typography>
          <Tooltip title="Fields show crops, readings, and what needs attention.">
            <IconButton size="small" aria-label="Fields help">
              <Info fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        {fields.length === 0 ? (
          <EmptyStateCard
            icon={<Place sx={{ fontSize: 38 }} />}
            title="No fields yet"
            action={ownerMode ? (
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => {
                  setSetupError('');
                  setFieldForm({ name: '', area: '' });
                  setSelectedFieldLocation(null);
                  setFieldLocationConfirmed(false);
                  setOpenField(true);
                }}
              >
                Add field
              </Button>
            ) : undefined}
          />
        ) : (
          <Grid container spacing={2.5}>
            {fields.map((field) => {
              const activeCrop = activeCropForField(field.id);
              const attention = fieldAttention(field);
              const fieldBases = basesForField(field.id);
              const fieldChannels = fieldBases.flatMap(channelsForBase).slice(0, 6);
              return (
                <Grid item xs={12} md={6} key={field.id}>
                  <Card variant="outlined" sx={{ ...surfaceCardSx, bgcolor: 'rgba(255,253,248,0.94)' }}>
                    <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: { xs: 2, md: 2.5 } } }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>
                            {field.name}
                          </Typography>
                          <Typography color="text.secondary">
                            {activeCrop
                              ? `${activeCrop.crop_name} - ${activeCrop.current_stage?.name || 'Stage pending'}`
                              : 'No crop set'}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={attention.label}
                          sx={{ bgcolor: attention.bg, color: attention.color, fontWeight: 800, flexShrink: 0 }}
                        />
                      </Stack>

                      <Grid container spacing={1.5} sx={{ mt: 2 }}>
                        {fieldChannels.length ? fieldChannels.slice(0, 3).map(({ base, channel }) => {
                          const reading = latestReadingForChannel(base, channel);
                          return (
                            <Grid item xs={12} sm={4} key={channel.id}>
                              <Box sx={softMetricSx}>
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  {titleText(channel.measurement_type || channel.channel_key)}
                                </Typography>
                                <Typography variant="h6">{formatReadingValue(reading, channel.unit)}</Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  {formatShortDate(reading?.time)}
                                </Typography>
                              </Box>
                            </Grid>
                          );
                        }) : (
                          <Grid item xs={12}>
                            <Box sx={{ ...softMetricSx, minHeight: 76 }}>
                              <Typography fontWeight={800}>Sensor readings</Typography>
                              <Typography color="text.secondary">Waiting for sensor base setup</Typography>
                            </Box>
                          </Grid>
                        )}
                      </Grid>

                      <Box
                        sx={{
                          mt: 2,
                          p: 1.75,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: attention.label === 'Needs attention' ? 'rgba(219, 160, 72, 0.45)' : 'rgba(60, 57, 17, 0.09)',
                          bgcolor: attention.label === 'Needs attention' ? 'rgba(235, 79, 18, 0.06)' : 'rgba(108, 137, 48, 0.045)',
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                          <WarningAmber fontSize="small" sx={{ color: attention.color, mt: 0.2 }} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography fontWeight={800}>
                              {attention.label === 'Needs attention' ? 'Why this needs attention' : 'Attention status'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                              {attention.detail}
                            </Typography>
                          </Box>
                        </Stack>
                      </Box>

                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2 }}>
                        <Chip size="small" icon={<Grass />} label={field.area ? `${field.area} ha` : 'Area n/a'} />
                        <Chip size="small" icon={<Sensors />} label={`${fieldChannels.length} readings`} />
                        {ownerMode && (
                          <Button size="small" startIcon={<Agriculture />} onClick={() => openCropDialog(field)}>
                            {activeCrop ? 'Change crop' : 'Set crop'}
                          </Button>
                        )}
                        {ownerMode && activeCrop?.current_stage && (
                          <Button size="small" onClick={() => openStageDialog(activeCrop)}>
                            Stage
                          </Button>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}

        <Grid container spacing={2.5} sx={{ mt: 3 }}>
          <Grid item xs={12} lg={4}>
            <Card variant="outlined" sx={surfaceCardSx}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="h6">Alerts to Check</Typography>
                  <Chip size="small" label={openAlertCount} />
                </Stack>
                {farmAlerts.length === 0 ? (
                  <Typography color="text.secondary">No open alerts.</Typography>
                ) : (
                  <Stack spacing={1.25}>
                    {farmAlerts.slice(0, 3).map((alert) => (
                      <Box key={alert.id} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(219, 160, 72, 0.08)' }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Chip size="small" color={alertSeverityColor(alert.severity)} label={String(alert.severity).toLowerCase()} />
                          {alert.field_name && <Chip size="small" variant="outlined" label={alert.field_name} />}
                        </Stack>
                        <Typography sx={{ mt: 1 }} fontWeight={800}>
                          {alert.message}
                        </Typography>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(alert.created_at).toLocaleDateString()}
                          </Typography>
                          {ownerMode && alert.status !== 'acknowledged' && (
                            <Button size="small" onClick={() => acknowledgeAlert(alert.id)} disabled={saving}>
                              Ack
                            </Button>
                          )}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Card variant="outlined" sx={surfaceCardSx}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1.5 }}>Sensor readings</Typography>
                {liveConditionItems.length === 0 ? (
                  <Typography color="text.secondary">No recent readings yet.</Typography>
                ) : (
                  <Stack spacing={1.25}>
                    {liveConditionItems.map((item) => (
                      <Stack key={item.key} direction="row" spacing={1.25} alignItems="center">
                        <Box
                          sx={{
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            display: 'grid',
                            placeItems: 'center',
                            bgcolor: 'rgba(108, 137, 48, 0.1)',
                            color: 'primary.main',
                            flexShrink: 0,
                          }}
                        >
                          {item.icon}
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography fontWeight={800}>{item.label}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatShortDate(item.updatedAt)}
                          </Typography>
                        </Box>
                        <Typography variant="h6">{item.value}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Card variant="outlined" sx={surfaceCardSx}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1.5 }}>Attention status</Typography>
                <Chip
                  label={farmAttention.label}
                  sx={{ bgcolor: farmAttention.bg, color: farmAttention.color, fontWeight: 800, mb: 1.5 }}
                />
                <Typography color="text.secondary">{farmAttention.detail}</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2 }}>
                  <Chip size="small" label={`${fieldCount} fields`} />
                  <Chip size="small" label={`${baseCount} bases`} />
                  <Chip size="small" label={`${activeCropCount} crops`} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Grid container spacing={2.5} sx={{ mt: 3 }}>
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
                <Card key={person.user_id} variant="outlined" sx={surfaceCardSx}>
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
              {collaborators.length === 0 && <EmptyStateCard title="No people yet" />}
            </Stack>
          </Grid>

          <Grid item xs={12} lg={7}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="h6">Hardware</Typography>
              <Tooltip title="Controllers belong to the farm. Fields are linked through sensor bases.">
                <IconButton size="small" aria-label="Hardware help">
                  <Info fontSize="small" />
                </IconButton>
              </Tooltip>
              <Chip size="small" label={baseCount} />
            </Stack>
            <Grid container spacing={1.5}>
              {controllers.map((controller) => (
                <Grid item xs={12} md={6} key={controller.id}>
                  <Card variant="outlined" sx={surfaceCardSx}>
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
                </Grid>
              ))}
              {sensorBases.map((base) => (
                <Grid item xs={12} md={6} key={base.id}>
                  <Card variant="outlined" sx={surfaceCardSx}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
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
                </Grid>
              ))}
              {controllers.length === 0 && sensorBases.length === 0 && (
                <Grid item xs={12}>
                  <EmptyStateCard icon={<Hub sx={{ fontSize: 38 }} />} title="No hardware yet" />
                </Grid>
              )}
            </Grid>
          </Grid>
        </Grid>
      </PageShell>

      <Dialog open={openFarmTools} onClose={() => setOpenFarmTools(false)} fullWidth maxWidth="sm">
        <DialogTitle>Farm settings</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.25} sx={{ mt: 1 }}>
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={() => {
                setOpenFarmTools(false);
                setSetupError('');
                setFieldForm({ name: '', area: '' });
                setSelectedFieldLocation(null);
                setFieldLocationConfirmed(false);
                setOpenField(true);
              }}
            >
              Add field
            </Button>
            <Button
              variant="outlined"
              startIcon={<GroupAdd />}
              onClick={() => {
                setOpenFarmTools(false);
                setOpenAccess(true);
              }}
            >
              Invite viewer
            </Button>
            <Button
              variant="outlined"
              startIcon={<Router />}
              onClick={() => {
                setOpenFarmTools(false);
                setOpenController(true);
              }}
            >
              Link controller
            </Button>
            <Button
              variant="outlined"
              startIcon={<Hub />}
              disabled={baseActionDisabled}
              onClick={() => {
                setOpenFarmTools(false);
                setBaseForm({ gatewayId: controllers[0]?.id || '', serialNumber: '', label: '' });
                setOpenBase(true);
              }}
            >
              Register base
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenFarmTools(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openField}
        onClose={() => {
          setOpenField(false);
          setSetupError('');
          setSelectedFieldLocation(null);
          setFieldLocationConfirmed(false);
        }}
        fullWidth
        maxWidth="md"
      >
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
            <TextField
              label="Field name"
              placeholder="eg: Field A"
              value={fieldForm.name}
              onChange={(e) => setFieldForm((c) => ({ ...c, name: e.target.value }))}
              autoFocus
            />
            <TextField
              label="Area (ha)"
              placeholder="eg: 1.25"
              value={fieldForm.area}
              onChange={(e) => setFieldForm((c) => ({ ...c, area: e.target.value }))}
            />
            <FarmLocationPicker
              title="Field location"
              helpText="Pick a field point without typing coordinates. Coordinates are in Advanced."
              value={selectedFieldLocation}
              confirmed={fieldLocationConfirmed}
              disabled={saving}
              onChange={(location) => {
                setSelectedFieldLocation(location);
                setFieldLocationConfirmed(false);
              }}
              onConfirm={() => setFieldLocationConfirmed(true)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpenField(false);
              setSetupError('');
              setSelectedFieldLocation(null);
              setFieldLocationConfirmed(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submitField}
            disabled={saving || !fieldForm.name.trim() || Boolean(selectedFieldLocation && !fieldLocationConfirmed)}
          >
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
            <TextField
              label="Viewer email"
              placeholder="eg: viewer@example.com"
              value={accessForm.email}
              onChange={(e) => setAccessForm({ email: e.target.value })}
              autoFocus
            />
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
            <TextField
              label="Controller ID"
              placeholder="eg: CTRL-8F2A19"
              value={controllerForm.controllerId}
              onChange={(e) => setControllerForm((c) => ({ ...c, controllerId: e.target.value }))}
              autoFocus
            />
            <TextField
              label="Model"
              placeholder="eg: SPECTRON C1"
              value={controllerForm.model}
              onChange={(e) => setControllerForm((c) => ({ ...c, model: e.target.value }))}
            />
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
            <TextField
              label="Base serial"
              placeholder="eg: BASE-FARM-001"
              value={baseForm.serialNumber}
              onChange={(e) => setBaseForm((c) => ({ ...c, serialNumber: e.target.value }))}
            />
            <TextField
              label="Label"
              placeholder="eg: North corner"
              value={baseForm.label}
              onChange={(e) => setBaseForm((c) => ({ ...c, label: e.target.value }))}
            />
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
            <TextField
              label="Zone"
              placeholder="eg: Pump area"
              value={baseAssignForm.monitoringZone}
              onChange={(e) => setBaseAssignForm((c) => ({ ...c, monitoringZone: e.target.value }))}
            />
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
                placeholder="eg: 1"
                value={moduleForm.slotNumber}
                onChange={(e) => setModuleForm((current) => ({ ...current, slotNumber: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Model"
                placeholder="eg: SHT30"
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
                        placeholder="eg: temperature"
                        value={channel.channelKey}
                        onChange={(e) => updateModuleChannel(index, { channelKey: e.target.value })}
                        size="small"
                        fullWidth
                      />
                      <TextField
                        label="Type"
                        placeholder="eg: temperature"
                        value={channel.measurementType}
                        onChange={(e) => updateModuleChannel(index, { measurementType: e.target.value })}
                        size="small"
                        fullWidth
                      />
                      <TextField
                        label="Unit"
                        placeholder="eg: C"
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
                placeholder="eg: 2026-07-17"
                value={cropForm.plantingDate}
                onChange={(event) => setCropForm((current) => ({ ...current, plantingDate: event.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            )}
            <TextField
              label="Harvest"
              type="date"
              placeholder="eg: 2026-11-30"
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
