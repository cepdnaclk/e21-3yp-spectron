import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Grid,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Alert,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { ArrowBack, AutoAwesome, BatteryChargingFull, Tune } from '@mui/icons-material';
import {
  getSensor,
  Sensor,
  getAISuggestedConfig,
  saveSensorConfig,
  SensorConfig as SensorConfigPayload,
  AISuggestRequest,
  SensorContext,
} from '../../services/sensorService';
import {
  getHardwareController,
  getHardwareSensor,
  saveHardwareSensorConfiguration,
} from '../../services/hardwarePairingService';
import { estimateBatteryLifeDays, getSensorMetrics } from '../../utils/sensorConfig';
import { SensorConfigSkeleton } from '../../components/LoadingSkeletons';
import AutoDismissAlert from '../../components/AutoDismissAlert';

type MetricThresholdInput = {
  mode: ThresholdMode;
  min: string;
  max: string;
  warningMin: string;
  warningMax: string;
};

type MetricThresholdPayload = {
  min?: number;
  max?: number;
  warning_min?: number;
  warning_max?: number;
};

type SetupMode = 'manual' | 'ai_assisted';
type ThresholdMode = 'min' | 'max' | 'range';
type UseCaseOption =
  | 'generic_monitoring'
  | 'climate_monitoring'
  | 'fill_level_monitoring'
  | 'occupancy_monitoring'
  | 'attendance_monitoring'
  | 'load_monitoring'
  | 'safety_monitoring';
type PresentationProfileOption =
  | 'single_trend'
  | 'dual_climate'
  | 'level_monitoring'
  | 'counter_status'
  | 'gauge_status'
  | 'event_timeline';
type SensorConfigNavigationState = {
  preferredSetupMode?: SetupMode;
  returnTo?: string;
  controllerId?: string;
  sensorId?: string;
  sensorType?: string;
  sensorName?: string;
  configured?: boolean;
};

type AiDraftSummary = {
  explanation: string;
  warnings: string[];
  confidenceScore: number;
  requiresUserConfirmation: boolean;
};

type TypeSpecificField = {
  key: string;
  label: string;
  type: 'number' | 'text';
  required?: boolean;
  description?: string;
};

const toNumberOrUndefined = (value: string): number | undefined => {
  if (!value || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const emptyMetricThresholdInput = (): MetricThresholdInput => ({
  mode: 'range',
  min: '',
  max: '',
  warningMin: '',
  warningMax: '',
});

const inferThresholdMode = (thresholds?: Partial<MetricThresholdPayload>): ThresholdMode => {
  const hasMin = thresholds?.min !== undefined;
  const hasMax = thresholds?.max !== undefined;

  if (hasMin && !hasMax) {
    return 'min';
  }
  if (!hasMin && hasMax) {
    return 'max';
  }
  return 'range';
};

const applyThresholdMode = (
  current: MetricThresholdInput,
  mode: ThresholdMode
): MetricThresholdInput => {
  if (mode === 'min') {
    return {
      ...current,
      mode,
      max: '',
      warningMax: '',
    };
  }

  if (mode === 'max') {
    return {
      ...current,
      mode,
      min: '',
      warningMin: '',
    };
  }

  return {
    ...current,
    mode,
  };
};

const toPositiveIntOrUndefined = (value: string): number | undefined => {
  if (!value || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.round(parsed);
};

const toCamelCaseThresholdKey = (metricKey: string, suffix: string) => {
  return `${metricKey}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`.replace(
    /_([a-z])/g,
    (_, letter: string) => letter.toUpperCase()
  );
};

const getOptionLabel = <T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T
) => options.find((option) => option.value === value)?.label || value;

const getTypeSpecificFieldsForSensorType = (sensorType: string): TypeSpecificField[] => {
  switch (sensorType.toLowerCase()) {
    case 'ultrasonic':
      return [
        {
          key: 'tankHeight',
          label: 'Tank Height',
          type: 'number',
          required: true,
          description: 'Total height or depth of the tank or container.',
        },
        {
          key: 'emptyDistance',
          label: 'Empty Distance',
          type: 'number',
          required: true,
          description: 'Distance measured by the sensor when the tank is empty.',
        },
        {
          key: 'fullDistance',
          label: 'Full Distance',
          type: 'number',
          required: true,
          description: 'Distance measured by the sensor when the tank is full.',
        },
        {
          key: 'lowLevelAlert',
          label: 'Low Level Alert',
          type: 'number',
          required: true,
          description: 'Level threshold where the dashboard should warn that the tank is low.',
        },
        {
          key: 'highLevelAlert',
          label: 'High Level Alert',
          type: 'number',
          required: true,
          description: 'Level threshold where the dashboard should warn that the tank is almost full or too high.',
        },
        {
          key: 'unit',
          label: 'Unit',
          type: 'text',
          required: true,
          description: 'Measurement unit for these distance and level values, usually cm.',
        },
      ];
    case 'vl53l0x':
    case 'distance':
      return [
        {
          key: 'maxDistance',
          label: 'Maximum Distance',
          type: 'number',
          required: false,
          description: 'Farthest distance this sensor should normally measure.',
        },
        {
          key: 'unit',
          label: 'Unit',
          type: 'text',
          required: false,
          description: 'Measurement unit for distance values, usually cm.',
        },
      ];
    case 'load':
    case 'load_cell':
      return [
        {
          key: 'maximumWeight',
          label: 'Maximum Weight',
          type: 'number',
          required: true,
          description: 'Highest weight the sensor or system should expect to measure.',
        },
        {
          key: 'minimumWeight',
          label: 'Minimum Weight',
          type: 'number',
          required: true,
          description: 'Lowest valid weight for this setup, usually 0.',
        },
        {
          key: 'overloadAlert',
          label: 'Overload Alert',
          type: 'number',
          required: true,
          description: 'Weight value where the system should warn that the load is too high.',
        },
        {
          key: 'unit',
          label: 'Unit',
          type: 'text',
          required: true,
          description: 'Measurement unit for weight values, usually kg.',
        },
      ];
    case 'gas':
    case 'gas_sensor':
      return [
        {
          key: 'gasType',
          label: 'Gas Type',
          type: 'text',
          required: true,
          description: 'Gas or air-quality value this sensor is tracking.',
        },
        {
          key: 'warningThreshold',
          label: 'Warning Threshold',
          type: 'number',
          required: true,
          description: 'Reading where the dashboard should show an early warning.',
        },
        {
          key: 'dangerThreshold',
          label: 'Danger Threshold',
          type: 'number',
          required: true,
          description: 'Reading where the dashboard should show a critical danger alert.',
        },
        {
          key: 'unit',
          label: 'Unit',
          type: 'text',
          required: true,
          description: 'Measurement unit for gas readings, usually ppm.',
        },
      ];
    default:
      return [];
  }
};

const getTypeSpecificPlaceholder = (sensorType: string, key: string) => {
  if (key !== 'unit') {
    return '';
  }

  switch (sensorType.toLowerCase()) {
    case 'ultrasonic':
    case 'vl53l0x':
    case 'distance':
      return 'cm';
    case 'pressure':
    case 'bme280':
    case 'bmp280':
      return 'kPa';
    case 'load':
    case 'load_cell':
      return 'kg';
    case 'gas':
    case 'gas_sensor':
      return 'ppm';
    default:
      return '';
  }
};

const USE_CASE_OPTIONS: Array<{ value: UseCaseOption; label: string; description: string }> = [
  { value: 'generic_monitoring', label: 'General Monitoring', description: 'A simple reading-first setup.' },
  { value: 'climate_monitoring', label: 'Climate Monitoring', description: 'Best for temperature and humidity conditions.' },
  { value: 'fill_level_monitoring', label: 'Fill Level Monitoring', description: 'Best for bins, tanks, silos, and storage level.' },
  { value: 'occupancy_monitoring', label: 'Occupancy Monitoring', description: 'Best for people, crowd, or presence tracking.' },
  { value: 'attendance_monitoring', label: 'Attendance Tracking', description: 'Best for classroom attendance or student presence tracking.' },
  { value: 'load_monitoring', label: 'Load Monitoring', description: 'Best for capacity, weight, and utilization.' },
  { value: 'safety_monitoring', label: 'Safety Monitoring', description: 'Best for risk, gas, and unsafe environment alerts.' },
];

const PRESENTATION_PROFILE_OPTIONS: Array<{
  value: PresentationProfileOption;
  label: string;
  description: string;
}> = [
  { value: 'single_trend', label: 'Single Trend', description: 'Current value with one simple trend chart.' },
  { value: 'dual_climate', label: 'Dual Climate', description: 'Climate-focused layout for temperature and humidity.' },
  { value: 'level_monitoring', label: 'Level Monitoring', description: 'Level bar or gauge for fill-level style sensors.' },
  { value: 'counter_status', label: 'Counter Status', description: 'Status-first view for occupancy or count-style sensors.' },
  { value: 'gauge_status', label: 'Gauge Status', description: 'Gauge-first view for load or safety style sensors.' },
  { value: 'event_timeline', label: 'Event Timeline', description: 'Best when incidents matter more than continuous trends.' },
];

const getDefaultUseCaseForSensorType = (sensorType: string): UseCaseOption => {
  switch (sensorType.toLowerCase()) {
    case 'temperature':
    case 'humidity':
    case 'temperature_humidity':
    case 'temp_humidity':
    case 'dht11':
    case 'dht22':
    case 'bme280':
    case 'bmp280':
      return 'climate_monitoring';
    case 'vl53l0x':
    case 'distance':
      return 'generic_monitoring';
    case 'ultrasonic':
      return 'fill_level_monitoring';
    case 'load':
    case 'load_cell':
      return 'load_monitoring';
    case 'gas':
    case 'gas_sensor':
    case 'air_quality':
      return 'safety_monitoring';
    default:
      return 'generic_monitoring';
  }
};

const getAllowedUseCasesForSensorType = (sensorType: string): UseCaseOption[] => {
  switch (sensorType.toLowerCase()) {
    case 'temperature':
    case 'humidity':
      return ['generic_monitoring', 'climate_monitoring'];
    case 'temperature_humidity':
    case 'temp_humidity':
    case 'dht11':
    case 'dht22':
    case 'bme280':
    case 'bmp280':
      return ['climate_monitoring', 'generic_monitoring'];
    case 'pressure':
    case 'vl53l0x':
    case 'distance':
      return ['generic_monitoring'];
    case 'ultrasonic':
      return [
        'generic_monitoring',
        'fill_level_monitoring',
        'occupancy_monitoring',
        'attendance_monitoring',
      ];
    case 'load':
    case 'load_cell':
      return ['generic_monitoring', 'load_monitoring'];
    case 'gas':
    case 'gas_sensor':
    case 'air_quality':
      return ['generic_monitoring', 'safety_monitoring'];
    default:
      return ['generic_monitoring'];
  }
};

const getRecommendedProfileForUseCase = (
  useCase: UseCaseOption,
  sensorType: string
): PresentationProfileOption => {
  if (
    useCase === 'climate_monitoring' &&
    ['temperature_humidity', 'temp_humidity', 'dht11', 'dht22'].includes(sensorType.toLowerCase())
  ) {
    return 'dual_climate';
  }

  switch (useCase) {
    case 'climate_monitoring':
      return 'single_trend';
    case 'fill_level_monitoring':
      return 'level_monitoring';
    case 'occupancy_monitoring':
    case 'attendance_monitoring':
      return 'counter_status';
    case 'load_monitoring':
    case 'safety_monitoring':
      return 'gauge_status';
    default:
      return 'single_trend';
  }
};

const getAllowedProfilesForUseCase = (
  useCase: UseCaseOption,
  sensorType: string
): PresentationProfileOption[] => {
  const normalizedType = sensorType.toLowerCase();

  switch (useCase) {
    case 'climate_monitoring':
      if (['temperature_humidity', 'temp_humidity', 'dht11', 'dht22'].includes(normalizedType)) {
        return ['dual_climate', 'single_trend'];
      }
      return ['single_trend'];
    case 'fill_level_monitoring':
      return ['level_monitoring', 'gauge_status', 'single_trend'];
    case 'occupancy_monitoring':
    case 'attendance_monitoring':
      return ['counter_status', 'event_timeline', 'single_trend'];
    case 'load_monitoring':
    case 'safety_monitoring':
      return ['gauge_status', 'single_trend', 'event_timeline'];
    default:
      return ['single_trend', 'event_timeline'];
  }
};

const pageKickerSx = {
  color: 'secondary.main',
  fontWeight: 900,
  letterSpacing: 1,
} as const;

const pageTitleSx = {
  color: 'text.primary',
  fontWeight: 900,
  letterSpacing: 0,
  lineHeight: 1.15,
} as const;

const sectionSx = {
  mt: 3,
  pt: 3,
  borderTop: '1px solid rgba(60, 57, 17, 0.12)',
} as const;

const sectionTitleSx = {
  mb: 1,
  color: 'primary.main',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  borderBottom: '1px solid rgba(60, 57, 17, 0.14)',
  pb: 0.75,
} as const;

const sectionIntroSx = {
  color: 'text.secondary',
  lineHeight: 1.6,
  maxWidth: 820,
} as const;

const fieldGroupTitleSx = {
  mb: 1,
  color: 'text.primary',
  fontWeight: 800,
  borderLeft: '4px solid rgba(108, 137, 48, 0.55)',
  pl: 1.25,
  lineHeight: 1.35,
} as const;

const fieldGroupIntroSx = {
  mb: 1.5,
  color: 'text.secondary',
  lineHeight: 1.55,
} as const;

const captionTextSx = {
  color: 'text.secondary',
  display: 'block',
  lineHeight: 1.5,
  mt: -0.25,
} as const;

const alertTitleSx = {
  mb: 0.5,
  fontWeight: 800,
} as const;

const SensorConfig: React.FC = () => {
  const { id, controllerId, sensorId } = useParams<{
    id?: string;
    controllerId?: string;
    sensorId?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationState = (location.state || null) as SensorConfigNavigationState | null;
  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const [setupMode, setSetupMode] = useState<SetupMode>('manual');
  const [purpose, setPurpose] = useState('');
  const [domain, setDomain] = useState('');
  const [environmentType, setEnvironmentType] = useState('');
  const [indoorOutdoor, setIndoorOutdoor] = useState('');
  const [assetType, setAssetType] = useState('');
  const [locationCountry, setLocationCountry] = useState('');
  const [locationRegion, setLocationRegion] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [historicalWindowDays, setHistoricalWindowDays] = useState('');
  const [installationNotes, setInstallationNotes] = useState('');
  const [friendlyName, setFriendlyName] = useState('');
  const [systemName, setSystemName] = useState('');
  const [useCase, setUseCase] = useState<UseCaseOption>('generic_monitoring');
  const [presentationProfile, setPresentationProfile] = useState<PresentationProfileOption>('single_trend');
  const [primaryMetric, setPrimaryMetric] = useState('');
  const [metricThresholds, setMetricThresholds] = useState<Record<string, MetricThresholdInput>>({});
  const [typeSpecificValues, setTypeSpecificValues] = useState<Record<string, string>>({});
  const [reportsPerDay, setReportsPerDay] = useState('24');
  const [readingFlowType, setReadingFlowType] = useState<'CONSTANT_PER_DAY' | 'TRIGGER'>('CONSTANT_PER_DAY');
  const [validationStatus, setValidationStatus] = useState('');
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [aiDraftSummary, setAiDraftSummary] = useState<AiDraftSummary | null>(null);
  const initializedSensorIdRef = useRef<string | null>(null);
  const activeSensorId = sensorId || id || navigationState?.sensorId || '';
  const activeControllerId = controllerId || navigationState?.controllerId || sensor?.controller_id || '';
  const isHardwareRoute = Boolean(controllerId && sensorId);

  const sensorMetrics = useMemo(() => getSensorMetrics(sensor?.type || ''), [sensor?.type]);
  const typeSpecificFields = useMemo(
    () => getTypeSpecificFieldsForSensorType(sensor?.type || navigationState?.sensorType || ''),
    [sensor?.type, navigationState?.sensorType]
  );
  const allowedUseCases = useMemo(
    () => getAllowedUseCasesForSensorType(sensor?.type || ''),
    [sensor?.type]
  );
  const allowedPresentationProfiles = useMemo(
    () => getAllowedProfilesForUseCase(useCase, sensor?.type || ''),
    [useCase, sensor?.type]
  );
  const isAiAssisted = setupMode === 'ai_assisted';
  const estimatedBatteryLifeDays = estimateBatteryLifeDays(
    parseInt(reportsPerDay, 10) || 1,
    sensorMetrics.length,
    readingFlowType
  );

  const handleBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
      return;
    }

    if (isHardwareRoute && activeControllerId) {
      navigate(`/hardware/${activeControllerId}/sensors`);
      return;
    }

    if (sensor?.controller_id) {
      navigate(`/controllers/${sensor.controller_id}`);
      return;
    }

    navigate('/controllers');
  };

  useEffect(() => {
    if (sensorMetrics.length === 0) return;

    setMetricThresholds((current) => {
      const next: Record<string, MetricThresholdInput> = {};
      for (const metric of sensorMetrics) {
        next[metric.key] = current[metric.key] || emptyMetricThresholdInput();
      }
      return next;
    });
  }, [sensorMetrics]);

  useEffect(() => {
    if (typeSpecificFields.length === 0) {
      setTypeSpecificValues({});
      return;
    }

    setTypeSpecificValues((current) => {
      const next: Record<string, string> = {};
      for (const field of typeSpecificFields) {
        next[field.key] = current[field.key] ?? '';
      }
      return next;
    });
  }, [typeSpecificFields, sensor?.type, navigationState?.sensorType]);

  const loadSensor = useCallback(async () => {
    if (!activeSensorId) return;

    try {
      setPageError(null);
      const [sensorData, controllerData] = await Promise.all([
        isHardwareRoute || activeControllerId
          ? getHardwareSensor(activeSensorId, activeControllerId)
          : getSensor(activeSensorId),
        isHardwareRoute && activeControllerId
          ? getHardwareController(activeControllerId)
          : Promise.resolve(null),
      ]);
      setSensor(sensorData);

      if (initializedSensorIdRef.current !== activeSensorId) {
        setSystemName(controllerData?.name || '');
        setPurpose(sensorData.purpose || '');
        setFriendlyName(sensorData.active_config?.friendly_name || sensorData.name || '');
        setDomain(sensorData.context?.domain || '');
        setEnvironmentType(sensorData.context?.environment_type || '');
        setIndoorOutdoor(sensorData.context?.indoor_outdoor || '');
        setAssetType(sensorData.context?.asset_type || '');
        setLocationCountry(sensorData.context?.location?.country || '');
        setLocationRegion(sensorData.context?.location?.region || '');
        setLocationLabel(sensorData.context?.location?.label || '');
        setHistoricalWindowDays(sensorData.context?.historical_window_days?.toString() || '');
        setInstallationNotes(sensorData.context?.installation_notes || '');
        setReportsPerDay(sensorData.active_config?.report_interval_per_day?.toString() || '24');
        setUseCase(
          (sensorData.active_config?.use_case as UseCaseOption | undefined) ||
            getDefaultUseCaseForSensorType(sensorData.type || '')
        );
        setPresentationProfile(
          (sensorData.active_config?.presentation_profile as PresentationProfileOption | undefined) ||
            getRecommendedProfileForUseCase(
              ((sensorData.active_config?.use_case as UseCaseOption | undefined) ||
                getDefaultUseCaseForSensorType(sensorData.type || '')) as UseCaseOption,
              sensorData.type || ''
            )
        );
        setPrimaryMetric(sensorData.active_config?.primary_metric || getSensorMetrics(sensorData.type || '')[0]?.key || '');

        const nextMetricThresholds: Record<string, MetricThresholdInput> = {};
        const metrics = getSensorMetrics(sensorData.type || '');
        for (const metric of metrics) {
          const metricConfig =
            sensorData.active_config?.metric_thresholds?.[metric.key] ||
            (metrics.length === 1 ? sensorData.active_config?.thresholds : undefined);

          nextMetricThresholds[metric.key] = {
            mode: inferThresholdMode(metricConfig),
            min: metricConfig?.min?.toString() || '',
            max: metricConfig?.max?.toString() || '',
            warningMin: metricConfig?.warning_min?.toString() || '',
            warningMax: metricConfig?.warning_max?.toString() || '',
          };
        }
        if (metrics.length > 0) {
          setMetricThresholds(nextMetricThresholds);
        }

        const hardwareConfig = ((sensorData.active_config as any)?.hardware_config || {}) as Record<string, unknown>;
        const hardwareFields = getTypeSpecificFieldsForSensorType(sensorData.type || '');
        if (hardwareFields.length > 0) {
          setTypeSpecificValues(
            Object.fromEntries(
              hardwareFields.map((field) => [
                field.key,
                hardwareConfig[field.key]?.toString() || '',
              ])
            )
          );
        }

        setSetupMode(navigationState?.preferredSetupMode || (sensorData.purpose ? 'ai_assisted' : 'manual'));
        initializedSensorIdRef.current = activeSensorId;
      }
    } catch (error) {
      console.error('Error loading sensor:', error);
      setPageError('Sensor not found');
    } finally {
      setLoading(false);
    }
  }, [activeSensorId, activeControllerId, isHardwareRoute, navigationState?.preferredSetupMode]);

  useEffect(() => {
    initializedSensorIdRef.current = null;
  }, [activeSensorId]);

  useEffect(() => {
    if (allowedUseCases.length === 0) {
      return;
    }

    if (!allowedUseCases.includes(useCase)) {
      const nextUseCase = allowedUseCases[0];
      setUseCase(nextUseCase);
      setPresentationProfile(getRecommendedProfileForUseCase(nextUseCase, sensor?.type || ''));
    }
  }, [allowedUseCases, useCase, sensor?.type]);

  useEffect(() => {
    if (allowedPresentationProfiles.length === 0) {
      return;
    }

    if (!allowedPresentationProfiles.includes(presentationProfile)) {
      setPresentationProfile(allowedPresentationProfiles[0]);
    }
  }, [allowedPresentationProfiles, presentationProfile]);

  useEffect(() => {
    if (activeSensorId) {
      loadSensor();
    }
  }, [activeSensorId, loadSensor]);

  const buildContextPayload = (): SensorContext | undefined => {
    const historicalDays = toPositiveIntOrUndefined(historicalWindowDays);

    const payload: SensorContext = {
      domain: domain || undefined,
      environment_type: environmentType || undefined,
      indoor_outdoor: indoorOutdoor || undefined,
      asset_type: assetType.trim() || undefined,
      installation_notes: installationNotes.trim() || undefined,
      historical_window_days: historicalDays,
      location: locationCountry.trim() || locationRegion.trim() || locationLabel.trim()
        ? {
            mode: 'manual',
            country: locationCountry.trim() || undefined,
            region: locationRegion.trim() || undefined,
            label: locationLabel.trim() || undefined,
          }
        : undefined,
    };

    if (
      !payload.domain &&
      !payload.environment_type &&
      !payload.indoor_outdoor &&
      !payload.asset_type &&
      !payload.installation_notes &&
      !payload.historical_window_days &&
      !payload.location
    ) {
      return undefined;
    }

    return payload;
  };

  const handleAISuggest = async () => {
    if (!activeSensorId || !purpose.trim()) {
      setPageError('Add a short purpose before asking AI for setup help.');
      return;
    }

    setAiLoading(true);
    setPageError(null);
    try {
      const request: AISuggestRequest = {
        purpose,
        context: buildContextPayload(),
      };

      const response = await getAISuggestedConfig(activeSensorId, request);
      const config = response.validated_config || response.suggested_config;

      setFriendlyName(config.friendly_name);
      setReportsPerDay(config.report_interval_per_day.toString());
      setUseCase(
        (config.use_case as UseCaseOption | undefined) ||
          getDefaultUseCaseForSensorType(sensor?.type || '')
      );
      setPresentationProfile(
        (config.presentation_profile as PresentationProfileOption | undefined) ||
          getRecommendedProfileForUseCase(
            ((config.use_case as UseCaseOption | undefined) ||
              getDefaultUseCaseForSensorType(sensor?.type || '')) as UseCaseOption,
            sensor?.type || ''
          )
      );
      setPrimaryMetric(config.primary_metric || sensorMetrics[0]?.key || '');
      setValidationStatus(response.validation_status || '');
      setValidationWarnings(response.warnings || []);
      setAiDraftSummary({
        explanation: response.explanation || 'AI drafted a starting configuration based on your purpose and context.',
        warnings: response.warnings || [],
        confidenceScore: response.confidence_score,
        requiresUserConfirmation: response.requires_user_confirmation,
      });

      const nextMetricThresholds: Record<string, MetricThresholdInput> = {};
      for (const metric of sensorMetrics) {
        const metricConfig =
          config.metric_thresholds?.[metric.key] ||
          (sensorMetrics.length === 1 ? config.thresholds : undefined);
        nextMetricThresholds[metric.key] = {
          mode: inferThresholdMode(metricConfig),
          min: metricConfig?.min?.toString() || '',
          max: metricConfig?.max?.toString() || '',
          warningMin: metricConfig?.warning_min?.toString() || '',
          warningMax: metricConfig?.warning_max?.toString() || '',
        };
      }
      setMetricThresholds(nextMetricThresholds);
    } catch (error: any) {
      setPageError(error.response?.data?.message || 'Failed to get AI setup help.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!activeSensorId || !sensor) {
      return;
    }

    if (!friendlyName.trim()) {
      setPageError('Please enter a sensor name before saving.');
      return;
    }

    if (isHardwareRoute && !systemName.trim()) {
      setPageError('Please enter a system name before saving.');
      return;
    }

    if (readingFlowType !== 'TRIGGER' && !toPositiveIntOrUndefined(reportsPerDay)) {
      setPageError('Reports per day is required.');
      return;
    }

    if (isHardwareRoute) {
      const missingMetric = sensorMetrics.find((metric) => {
        const values = metricThresholds[metric.key] || emptyMetricThresholdInput();
        if (values.mode === 'min') {
          return !values.min.trim();
        }
        if (values.mode === 'max') {
          return !values.max.trim();
        }
        return !values.min.trim() || !values.max.trim();
      });

      if (missingMetric) {
        setPageError(`${missingMetric.label} threshold values are required.`);
        return;
      }

      const missingField = typeSpecificFields.find(
        (field) => field.required && !typeSpecificValues[field.key]?.trim()
      );
      if (missingField) {
        setPageError(`${missingField.label} is required.`);
        return;
      }

      const invalidNumberField = typeSpecificFields.find(
        (field) =>
          field.type === 'number' &&
          typeSpecificValues[field.key]?.trim() &&
          toNumberOrUndefined(typeSpecificValues[field.key]) === undefined
      );
      if (invalidNumberField) {
        setPageError(`${invalidNumberField.label} must be a number.`);
        return;
      }
    }

    setSaving(true);
    setPageError(null);
    try {
      const reports = readingFlowType === 'TRIGGER' ? 1 : (reportsPerDay ? parseInt(reportsPerDay, 10) : 24);
      const metricThresholdPayload: Record<string, MetricThresholdPayload> = Object.fromEntries(
        sensorMetrics.map((metric) => {
          const values = metricThresholds[metric.key] || emptyMetricThresholdInput();
          return [
            metric.key,
            {
              min: toNumberOrUndefined(values.min),
              max: toNumberOrUndefined(values.max),
              warning_min: toNumberOrUndefined(values.warningMin),
              warning_max: toNumberOrUndefined(values.warningMax),
            },
          ];
        })
      );

      const primaryMetricKey = sensorMetrics[0]?.key;
      const primaryMetricThreshold: MetricThresholdPayload = primaryMetricKey
        ? metricThresholdPayload[primaryMetricKey] || {}
        : {};

      const config: SensorConfigPayload = {
        friendly_name: friendlyName.trim(),
        use_case: useCase,
        presentation_profile: presentationProfile,
        primary_metric: primaryMetric || primaryMetricKey || undefined,
        thresholds: {
          min: primaryMetricThreshold.min,
          max: primaryMetricThreshold.max,
          warning_min: primaryMetricThreshold.warning_min,
          warning_max: primaryMetricThreshold.warning_max,
        },
        metric_thresholds: metricThresholdPayload,
        report_interval_per_day: reports,
        power_management: {
          battery_life_days: estimatedBatteryLifeDays,
          sampling_frequency: reports,
        },
      };

      if (isHardwareRoute && activeControllerId) {
        const flattenedMetricConfig = Object.entries(metricThresholdPayload).reduce<Record<string, unknown>>(
          (acc, [metricKey, threshold]) => {
            if (threshold.min !== undefined) {
              acc[toCamelCaseThresholdKey(metricKey, 'min')] = threshold.min;
            }
            if (threshold.max !== undefined) {
              acc[toCamelCaseThresholdKey(metricKey, 'max')] = threshold.max;
            }
            if (threshold.warning_min !== undefined) {
              acc[toCamelCaseThresholdKey(metricKey, 'warningMin')] = threshold.warning_min;
            }
            if (threshold.warning_max !== undefined) {
              acc[toCamelCaseThresholdKey(metricKey, 'warningMax')] = threshold.warning_max;
            }
            return acc;
          },
          {}
        );
        const typeSpecificConfig = Object.fromEntries(
          typeSpecificFields.map((field) => [
            field.key,
            field.type === 'number'
              ? toNumberOrUndefined(typeSpecificValues[field.key])
              : typeSpecificValues[field.key]?.trim(),
          ])
        );
        const hardwareConfig = {
          ...flattenedMetricConfig,
          ...typeSpecificConfig,
          readingFlowType,
          reportsPerDay: reports,
          estimatedBatteryLifeDays,
        };
        const appConfig = {
          ...config,
          hardware_config: hardwareConfig,
        } as SensorConfigPayload;

        await saveHardwareSensorConfiguration({
          controllerId: activeControllerId,
          sensorId: activeSensorId,
          systemName: systemName.trim(),
          sensorType: sensor.type,
          sensorName: friendlyName.trim(),
          usedFor: getOptionLabel(USE_CASE_OPTIONS, useCase),
          dashboardView: getOptionLabel(PRESENTATION_PROFILE_OPTIONS, presentationProfile),
          config: hardwareConfig,
          appConfig,
        });

        navigate(`/hardware/${activeControllerId}/sensors`, {
          replace: true,
          state: {
            configurationSaved: true,
            configuredSensorId: sensor.id,
            configuredSensorName: friendlyName.trim(),
            validationWarnings: [],
            observationMessage: 'Configuration activated successfully',
          },
        });
        return;
      }

      const response = await saveSensorConfig(activeSensorId, {
        purpose: purpose.trim(),
        context: isAiAssisted ? buildContextPayload() : undefined,
        config,
      });

      const successState = {
        configurationSaved: true,
        configuredSensorId: sensor.id,
        configuredSensorName: response.validated_config.friendly_name,
        validationWarnings: response.warnings || [],
        observationMessage:
          response.observation?.message ||
          'The system is now observing live readings and can suggest refinements later.',
      };

      if (navigationState?.returnTo) {
        navigate(navigationState.returnTo, {
          replace: true,
          state: successState,
        });
        return;
      }

      if ((window.history.state?.idx ?? 0) > 0) {
        navigate(-1);
        return;
      }

      navigate(`/controllers/${sensor.controller_id}`, {
        replace: true,
        state: successState,
      });
    } catch (error: any) {
      setPageError(
        error.response?.data?.message ||
          (isHardwareRoute ? 'Configuration save failed' : 'Failed to save configuration.')
      );
    } finally {
      setSaving(false);
    }
  };

  const observationSeverity =
    sensor?.observation?.status === 'ready_for_review'
      ? 'success'
      : sensor?.observation?.status === 'awaiting_data'
        ? 'warning'
        : 'info';

  if (loading) {
    return <SensorConfigSkeleton />;
  }

  if (!sensor) {
    return (
      <Container>
        <Typography>Sensor not found</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 2, border: '1px solid rgba(60, 57, 17, 0.1)' }}>
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
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="overline" sx={pageKickerSx}>
              Sensor setup
            </Typography>
            <Typography variant="h4" sx={pageTitleSx}>
              Configure {sensor.type} Sensor
            </Typography>
          </Box>
          <Box sx={{ p: 1.4, borderRadius: '50%', bgcolor: 'rgba(108, 137, 48, 0.12)' }}>
            <Tune color="primary" />
          </Box>
        </Stack>

        {sensor.config_active && sensor.observation && (
          <Alert severity={observationSeverity} sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={alertTitleSx}>
              Current observation status
            </Typography>
            <Typography variant="body2">{sensor.observation.message}</Typography>
          </Alert>
        )}

        {sensor.calibration_status === 'OVERDUE' && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            This sensor is overdue for calibration. The backend will still validate the configuration,
            but you should review thresholds carefully before using them for automation.
          </Alert>
        )}

        <AutoDismissAlert open={Boolean(pageError)} severity="error" sx={{ mt: 2 }} onCloseAlert={() => setPageError(null)}>
            {pageError}
        </AutoDismissAlert>

        {validationWarnings.length > 0 && (
          <Alert severity={validationStatus === 'adjusted' ? 'warning' : 'info'} sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ ...alertTitleSx, mb: 1 }}>
              {validationStatus ? `Validation status: ${validationStatus}` : 'Validation feedback'}
            </Typography>
            <Box component="ul" sx={{ pl: 2, mb: 0 }}>
              {validationWarnings.map((warning) => (
                <li key={warning}>
                  <Typography variant="body2">{warning}</Typography>
                </li>
              ))}
            </Box>
          </Alert>
        )}

        <Box sx={sectionSx}>
          <Typography variant="subtitle1" sx={sectionTitleSx}>
            Setup Mode
          </Typography>
          <Typography variant="body2" sx={sectionIntroSx}>
            Manual setup is the default. AI support is optional and only helps draft a starting
            configuration that you can still adjust before saving.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
            <Button
              variant={setupMode === 'manual' ? 'contained' : 'outlined'}
              onClick={() => setSetupMode('manual')}
              startIcon={<Tune />}
            >
              Manual Setup
            </Button>
            <Button
              variant={setupMode === 'ai_assisted' ? 'contained' : 'outlined'}
              onClick={() => setSetupMode('ai_assisted')}
              color="secondary"
              startIcon={<AutoAwesome />}
            >
              AI Support
            </Button>
          </Stack>
          <Alert severity={setupMode === 'manual' ? 'info' : 'success'} sx={{ mt: 2 }}>
            {setupMode === 'manual'
              ? 'Enter threshold values directly and save whenever you are ready. Context fields are skipped unless you turn on AI support.'
              : 'Use AI support to prefill values from your purpose and context, then review and edit anything before saving.'}
          </Alert>
        </Box>

        {isAiAssisted && (
          <Box sx={sectionSx}>
            <Typography variant="subtitle1" sx={sectionTitleSx}>
              Context
            </Typography>
            <Typography variant="body2" sx={sectionIntroSx}>
              Optional but recommended. These details help with AI suggestions now and with better
              improvement recommendations after live data starts coming in.
            </Typography>

            <Grid container spacing={2} sx={{ mt: 1.5 }}>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel id="domain-label">Domain</InputLabel>
                  <Select
                    labelId="domain-label"
                    value={domain}
                    label="Domain"
                    onChange={(e) => setDomain(e.target.value)}
                  >
                    <MenuItem value="">Not specified</MenuItem>
                    <MenuItem value="agriculture">Agriculture</MenuItem>
                    <MenuItem value="home">Home</MenuItem>
                    <MenuItem value="industrial">Industrial</MenuItem>
                    <MenuItem value="warehouse">Warehouse</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel id="environment-type-label">Environment Type</InputLabel>
                  <Select
                    labelId="environment-type-label"
                    value={environmentType}
                    label="Environment Type"
                    onChange={(e) => setEnvironmentType(e.target.value)}
                  >
                    <MenuItem value="">Not specified</MenuItem>
                    <MenuItem value="farm">Farm</MenuItem>
                    <MenuItem value="greenhouse">Greenhouse</MenuItem>
                    <MenuItem value="home">Home</MenuItem>
                    <MenuItem value="warehouse">Warehouse</MenuItem>
                    <MenuItem value="industrial">Industrial</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel id="indoor-outdoor-label">Exposure</InputLabel>
                  <Select
                    labelId="indoor-outdoor-label"
                    value={indoorOutdoor}
                    label="Exposure"
                    onChange={(e) => setIndoorOutdoor(e.target.value)}
                  >
                    <MenuItem value="">Not specified</MenuItem>
                    <MenuItem value="indoor">Indoor</MenuItem>
                    <MenuItem value="outdoor">Outdoor</MenuItem>
                    <MenuItem value="mixed">Mixed</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Asset / Object"
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value)}
                  placeholder="e.g., tomato crop, storage room, garbage bin"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Observation / History Window (Days)"
                  type="number"
                  value={historicalWindowDays}
                  onChange={(e) => setHistoricalWindowDays(e.target.value)}
                  placeholder="14"
                  helperText="Used for AI review of recent readings and later improvement suggestions."
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Country"
                  value={locationCountry}
                  onChange={(e) => setLocationCountry(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Region / City"
                  value={locationRegion}
                  onChange={(e) => setLocationRegion(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Location Label"
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                  placeholder="e.g., Jaffna greenhouse A"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Installation Notes"
                  value={installationNotes}
                  onChange={(e) => setInstallationNotes(e.target.value)}
                  placeholder="e.g., near south wall, partial shade in afternoon"
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {setupMode === 'ai_assisted' && (
          <Box sx={sectionSx}>
            <Typography variant="subtitle1" sx={sectionTitleSx}>
              AI Support
            </Typography>
            <Typography variant="body2" sx={sectionIntroSx}>
              Describe what this sensor is for, then let AI draft threshold and reporting values that
              you can still fine-tune manually.
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={4}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g., Monitor garbage bin fill level and odor for a 120L outdoor bin using cm level readings"
              sx={{ mt: 1 }}
            />

            <Button
              variant="contained"
              color="secondary"
              onClick={handleAISuggest}
              disabled={aiLoading || !purpose.trim()}
              sx={{ mt: 2 }}
              startIcon={<AutoAwesome />}
            >
              {aiLoading ? 'Generating AI Draft...' : 'Generate AI Draft'}
            </Button>

            {aiDraftSummary && (
              <Alert severity={aiDraftSummary.warnings.length > 0 ? 'warning' : 'success'} sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={alertTitleSx}>
                  AI draft ready
                </Typography>
                <Typography variant="body2">{aiDraftSummary.explanation}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Confidence score: {aiDraftSummary.confidenceScore.toFixed(2)}
                </Typography>
                {aiDraftSummary.requiresUserConfirmation && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Review the draft carefully before saving because the backend flagged that it
                    still needs confirmation.
                  </Typography>
                )}
                {aiDraftSummary.warnings.length > 0 && (
                  <Box component="ul" sx={{ pl: 2, mb: 0, mt: 1 }}>
                    {aiDraftSummary.warnings.map((warning) => (
                      <li key={warning}>
                        <Typography variant="body2">{warning}</Typography>
                      </li>
                    ))}
                  </Box>
                )}
              </Alert>
            )}
          </Box>
        )}

        <Box sx={{ ...sectionSx, mt: 4 }}>
          <Typography variant="subtitle1" sx={sectionTitleSx}>
            Configuration
          </Typography>

          <TextField
            fullWidth
            label="System Name"
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            margin="normal"
            required={isHardwareRoute}
            helperText="This name will represent the monitoring system in dashboards and future controller reattachment."
          />

          <TextField
            fullWidth
            label="Sensor Name"
            value={friendlyName}
            onChange={(e) => setFriendlyName(e.target.value)}
            margin="normal"
            required
          />

          <Grid container spacing={2} sx={{ mt: 0.5, mb: 1 }}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="normal">
                <InputLabel id="use-case-label">Used For</InputLabel>
                <Select
                  labelId="use-case-label"
                  value={useCase}
                  label="Used For"
                  onChange={(e) => {
                    const nextUseCase = e.target.value as UseCaseOption;
                    setUseCase(nextUseCase);
                    setPresentationProfile(getRecommendedProfileForUseCase(nextUseCase, sensor.type || ''));
                  }}
                >
                  {USE_CASE_OPTIONS.filter((option) => allowedUseCases.includes(option.value)).map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="caption" sx={captionTextSx}>
                {USE_CASE_OPTIONS.find((option) => option.value === useCase)?.description}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="normal">
                <InputLabel id="presentation-profile-label">Dashboard View</InputLabel>
                <Select
                  labelId="presentation-profile-label"
                  value={presentationProfile}
                  label="Dashboard View"
                  onChange={(e) =>
                    setPresentationProfile(e.target.value as PresentationProfileOption)
                  }
                >
                  {PRESENTATION_PROFILE_OPTIONS.filter((option) =>
                    allowedPresentationProfiles.includes(option.value)
                  ).map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="caption" sx={captionTextSx}>
                {
                  PRESENTATION_PROFILE_OPTIONS.find(
                    (option) => option.value === presentationProfile
                  )?.description
                }
              </Typography>
            </Grid>
          </Grid>

          {sensorMetrics.map((metric) => (
            <Box key={metric.key} sx={{ mt: 3, pt: 2.25, borderTop: '1px solid rgba(60, 57, 17, 0.08)' }}>
              <Typography variant="subtitle2" sx={fieldGroupTitleSx}>
                {metric.label} Thresholds
              </Typography>
              <Typography variant="body2" sx={fieldGroupIntroSx}>
                Choose whether this sensor should enforce a lower limit, an upper limit, or both.
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                color="primary"
                value={metricThresholds[metric.key]?.mode || 'range'}
                onChange={(_, nextMode: ThresholdMode | null) => {
                  if (!nextMode) {
                    return;
                  }
                  setMetricThresholds((current) => ({
                    ...current,
                    [metric.key]: applyThresholdMode(
                      current[metric.key] || emptyMetricThresholdInput(),
                      nextMode
                    ),
                  }));
                }}
                sx={{ mb: 2, flexWrap: 'wrap' }}
              >
                <ToggleButton value="min">Only Min</ToggleButton>
                <ToggleButton value="max">Only Max</ToggleButton>
                <ToggleButton value="range">Min + Max</ToggleButton>
              </ToggleButtonGroup>
              <Grid container spacing={2}>
                {metricThresholds[metric.key]?.mode !== 'max' && (
                  <Grid item xs={12} md={metricThresholds[metric.key]?.mode === 'range' ? 6 : 12}>
                    <TextField
                      fullWidth
                      label="Min Value"
                      type="number"
                      value={metricThresholds[metric.key]?.min || ''}
                      onChange={(e) =>
                        setMetricThresholds((current) => ({
                          ...current,
                          [metric.key]: {
                            ...(current[metric.key] || emptyMetricThresholdInput()),
                            min: e.target.value,
                          },
                        }))
                      }
                    />
                  </Grid>
                )}
                {metricThresholds[metric.key]?.mode !== 'min' && (
                  <Grid item xs={12} md={metricThresholds[metric.key]?.mode === 'range' ? 6 : 12}>
                    <TextField
                      fullWidth
                      label="Max Value"
                      type="number"
                      value={metricThresholds[metric.key]?.max || ''}
                      onChange={(e) =>
                        setMetricThresholds((current) => ({
                          ...current,
                          [metric.key]: {
                            ...(current[metric.key] || emptyMetricThresholdInput()),
                            max: e.target.value,
                          },
                        }))
                      }
                    />
                  </Grid>
                )}
              </Grid>

              <Typography variant="subtitle2" sx={{ ...fieldGroupTitleSx, mt: 2.5 }}>
                {metric.label} Warning Thresholds (Optional)
              </Typography>
              <Grid container spacing={2}>
                {metricThresholds[metric.key]?.mode !== 'max' && (
                  <Grid item xs={12} md={metricThresholds[metric.key]?.mode === 'range' ? 6 : 12}>
                    <TextField
                      fullWidth
                      label="Warning Min"
                      type="number"
                      value={metricThresholds[metric.key]?.warningMin || ''}
                      onChange={(e) =>
                        setMetricThresholds((current) => ({
                          ...current,
                          [metric.key]: {
                            ...(current[metric.key] || emptyMetricThresholdInput()),
                            warningMin: e.target.value,
                          },
                        }))
                      }
                    />
                  </Grid>
                )}
                {metricThresholds[metric.key]?.mode !== 'min' && (
                  <Grid item xs={12} md={metricThresholds[metric.key]?.mode === 'range' ? 6 : 12}>
                    <TextField
                      fullWidth
                      label="Warning Max"
                      type="number"
                      value={metricThresholds[metric.key]?.warningMax || ''}
                      onChange={(e) =>
                        setMetricThresholds((current) => ({
                          ...current,
                          [metric.key]: {
                            ...(current[metric.key] || emptyMetricThresholdInput()),
                            warningMax: e.target.value,
                          },
                        }))
                      }
                    />
                  </Grid>
                )}
              </Grid>
            </Box>
          ))}

          {typeSpecificFields.length > 0 && (
            <Box sx={{ mt: 3, pt: 2.25, borderTop: '1px solid rgba(60, 57, 17, 0.08)' }}>
              <Typography variant="subtitle2" sx={fieldGroupTitleSx}>
                Sensor Details
              </Typography>
              <Grid container spacing={2}>
                {typeSpecificFields.map((field) => (
                  <Grid item xs={12} md={6} key={field.key}>
                    <TextField
                      fullWidth
                      label={field.label}
                      type={field.type}
                      value={typeSpecificValues[field.key] || ''}
                      placeholder={getTypeSpecificPlaceholder(sensor?.type || navigationState?.sensorType || '', field.key)}
                      helperText={field.description}
                      onChange={(e) =>
                        setTypeSpecificValues((current) => ({
                          ...current,
                          [field.key]: e.target.value,
                        }))
                      }
                      required={field.required}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          <Typography
            variant="subtitle2"
            sx={{ ...fieldGroupTitleSx, mt: 3, pt: 2.25, borderTop: '1px solid rgba(60, 57, 17, 0.08)' }}
          >
            Reading & Power Settings
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'primary.main', mb: 1 }}>
            <BatteryChargingFull />
            <Typography variant="body2" fontWeight={800}>
              Estimated runtime updates as reporting frequency changes.
            </Typography>
          </Stack>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="reading-flow-type-label">Reading Flow Type</InputLabel>
            <Select
              labelId="reading-flow-type-label"
              value={readingFlowType}
              label="Reading Flow Type"
              onChange={(e) => setReadingFlowType(e.target.value as 'CONSTANT_PER_DAY' | 'TRIGGER')}
            >
              <MenuItem value="CONSTANT_PER_DAY">Constant readings per day</MenuItem>
              <MenuItem value="TRIGGER">Trigger-based readings</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Reports Per Day"
            type="number"
            value={reportsPerDay}
            onChange={(e) => setReportsPerDay(e.target.value)}
            placeholder="24"
            margin="normal"
            disabled={readingFlowType === 'TRIGGER'}
            helperText="How many times per day the sensor should send data"
          />
          <TextField
            fullWidth
            label="Estimated Battery Life (Days)"
            type="number"
            value={estimatedBatteryLifeDays.toString()}
            margin="normal"
            InputProps={{ readOnly: true }}
            helperText="Automatically calculated from reports/day and sensor metrics"
          />
        </Box>

        <Alert severity="info" sx={{ mt: 3 }}>
          Saving activates this configuration immediately. After live readings start coming in, the
          system will keep observing in the background and can suggest better refinements later.
        </Alert>

        <AutoDismissAlert open={Boolean(pageError)} severity="error" sx={{ mt: 2 }} onCloseAlert={() => setPageError(null)}>
            {pageError}
        </AutoDismissAlert>

        <Button
          variant="contained"
          color="secondary"
          fullWidth
          onClick={handleSave}
          disabled={saving}
          sx={{ mt: 3 }}
        >
          {saving ? 'Saving...' : 'Save and Activate Configuration'}
        </Button>
      </Paper>
    </Container>
  );
};

export default SensorConfig;
