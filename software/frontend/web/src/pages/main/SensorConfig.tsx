import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Card,
  CardContent,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Grid,
  IconButton,
  Alert,
  Stack,
  Chip,
  Popover,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
} from '@mui/material';
import {
  ArrowBack,
  Close,
  Info as InfoIcon,
} from '@mui/icons-material';
import {
  getSensor,
  Sensor,
  saveSensorConfig,
  SensorConfig as SensorConfigPayload,
  SensorContext,
} from '../../services/sensorService';
import {
  findHardwareControllerIdForSensor,
  getHardwareController,
  getHardwareSensor,
  saveHardwareSensorConfiguration,
} from '../../services/hardwarePairingService';
import {
  buildPresentationAlertSettings,
  estimateBatteryLifeDays,
  getPresentationMetadata,
  getPresentationMetrics,
  getPresentationProfileDefinitions,
  getConfigurableDerivedMetrics,
  getDefaultObservableMetric,
  getMetricLabel,
  getObservableMetricDefinition,
  getObservableMetricCatalog,
  getPurposeOptionsForDerivedMetric,
  getRecommendedProfileForDerivedMetric,
  getSensorKnowledgeProfile,
  getSupportedProfilesForDerivedMetric,
  normalizePresentationConfig,
  metricThresholdsFromAlertSettings,
  ObservableMetricDefinition,
  PresentationConfigValue,
  PresentationProfileKey,
} from '../../utils/sensorConfig';
import { SensorConfigSkeleton } from '../../components/LoadingSkeletons';
import AutoDismissAlert from '../../components/AutoDismissAlert';
import {
  AIFollowUpQuestion,
  ConfigurationAiSuggestionResponse,
  LearningPhaseStatusResponse,
  parseConfigurationFromAi,
  getLearningPhaseStatus,
} from '../../services/sensorConfigurationAiService';

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

type AlertSettingInput = {
  key: string;
  label: string;
  metricKey: string;
  condition: 'below' | 'above';
  unit?: string;
  description?: string;
  warningLabel: string;
  criticalLabel: string;
  warningThreshold: string;
  criticalThreshold: string;
};

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
  PresentationProfileKey;
type WizardStepKey = 'setup' | 'alerts';
type SensorConfigNavigationState = {
  returnTo?: string;
  controllerId?: string;
  sensorId?: string;
  sensorType?: string;
  sensorName?: string;
  configured?: boolean;
};

type ClarificationFieldKey =
  | 'fullScaleDistanceCm'
  | 'sustainedWindowMinutes'
  | 'maximumLoadKg'
  | 'safeOccupancyPeople'
  | 'changeWindowMinutes';

type ClarificationPrompt = {
  key: ClarificationFieldKey;
  title: string;
  label: string;
  helperText: string;
  placeholder: string;
  unit: string;
};

type AIDraftSummary = ConfigurationAiSuggestionResponse & {
  metric: string;
  purpose: string;
  presentationProfile: string;
  alertThresholds: {
    warning: string;
    critical: string;
  };
};

type AIFollowUpAnswers = Record<string, string>;

const toNumberOrUndefined = (value: string): number | undefined => {
  if (!value || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

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

const toAlertSettingInput = (
  alert: ReturnType<typeof buildPresentationAlertSettings>[number]
): AlertSettingInput => ({
  key: alert.key,
  label: alert.label,
  metricKey: alert.metric_key || '',
  condition: alert.condition === 'below' ? 'below' : 'above',
  unit: alert.unit,
  description: alert.description,
  warningLabel: alert.warning_label,
  criticalLabel: alert.critical_label,
  warningThreshold: alert.warning_threshold?.toString() || '',
  criticalThreshold: alert.critical_threshold?.toString() || '',
});

const alertInputsToMetricThresholds = (
  alerts: AlertSettingInput[]
): Record<string, MetricThresholdInput> => {
  const thresholdMap = metricThresholdsFromAlertSettings(
    alerts.map((alert) => ({
      metric_key: alert.metricKey,
      condition: alert.condition,
      warning_threshold: toNumberOrUndefined(alert.warningThreshold),
      critical_threshold: toNumberOrUndefined(alert.criticalThreshold),
    }))
  );

  return Object.fromEntries(
    Object.entries(thresholdMap).map(([metricKey, threshold]) => [
      metricKey,
      {
        mode: inferThresholdMode(threshold),
        min: threshold.min?.toString() || '',
        max: threshold.max?.toString() || '',
        warningMin: threshold.warning_min?.toString() || '',
        warningMax: threshold.warning_max?.toString() || '',
      },
    ])
  );
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

const getConfigUseCase = (config?: SensorConfigPayload) =>
  config?.interpretation?.use_case || config?.use_case;

const getConfigPresentationProfile = (config?: SensorConfigPayload) =>
  config?.presentation?.profile || config?.presentation_profile;

const getConfigPrimaryMetric = (config?: SensorConfigPayload) =>
  config?.interpretation?.primary_metric || config?.primary_metric;

const getConfigMetricThresholds = (config?: SensorConfigPayload) =>
  config?.interpretation?.metric_thresholds || config?.metric_thresholds;

const getConfigThresholds = (config?: SensorConfigPayload) =>
  config?.interpretation?.thresholds || config?.thresholds;

const getConfigHardware = (config?: SensorConfigPayload) =>
  config?.hardware?.config || config?.hardware_config || {};

const getConfigContext = (config?: SensorConfigPayload) =>
  config?.interpretation?.context;

const getConfigPurpose = (config?: SensorConfigPayload) =>
  config?.interpretation?.purpose;

const resolvePurposeLabel = (
  options: Array<{ label: string }>,
  ...candidates: Array<string | undefined>
) => {
  for (const candidate of candidates) {
    const normalizedCandidate = candidate?.trim();
    if (!normalizedCandidate) {
      continue;
    }

    const matchedOption = options.find((option) => option.label === normalizedCandidate);
    if (matchedOption) {
      return matchedOption.label;
    }
  }

  return options[0]?.label || '';
};

const getConfigReportsPerDay = (config?: SensorConfigPayload) =>
  config?.operational?.report_interval_per_day || config?.report_interval_per_day;

const normalizeUseCaseOption = (value?: string): UseCaseOption | undefined => {
  switch ((value || '').trim().toLowerCase()) {
    case 'generic_monitoring':
    case 'general monitoring':
      return 'generic_monitoring';
    case 'climate_monitoring':
    case 'climate monitoring':
      return 'climate_monitoring';
    case 'fill_level_monitoring':
    case 'fill level monitoring':
      return 'fill_level_monitoring';
    case 'occupancy_monitoring':
    case 'occupancy monitoring':
      return 'occupancy_monitoring';
    case 'attendance_monitoring':
    case 'attendance monitoring':
      return 'attendance_monitoring';
    case 'load_monitoring':
    case 'load monitoring':
      return 'load_monitoring';
    case 'safety_monitoring':
    case 'safety monitoring':
      return 'safety_monitoring';
    default:
      return undefined;
  }
};

const normalizePresentationProfileOption = (
  value?: string
): PresentationProfileOption | undefined => {
  switch ((value || '').trim().toLowerCase()) {
    case 'single_trend':
    case 'single trend':
      return 'single_trend';
    case 'dual_climate':
    case 'dual climate':
      return 'dual_climate';
    case 'level_monitoring':
    case 'level monitoring':
    case 'level view':
      return 'level_monitoring';
    case 'counter_status':
    case 'counter status':
    case 'status view':
      return 'counter_status';
    case 'gauge_status':
    case 'gauge status':
    case 'gauge view':
      return 'gauge_status';
    case 'event_timeline':
    case 'event timeline':
    case 'timeline view':
      return 'event_timeline';
    default:
      return undefined;
  }
};

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

const getClarificationPrompts = (
  sensorType: string,
  metricKeys: string[]
): ClarificationPrompt[] => {
  const normalizedSensorType = sensorType.toLowerCase();
  const prompts: ClarificationPrompt[] = [];
  const selected = new Set(metricKeys);

  if (
    ['vl53l0x', 'distance', 'ultrasonic'].includes(normalizedSensorType) &&
    ['fill_level', 'remaining_capacity_percent', 'fill_rate'].some((metric) => selected.has(metric))
  ) {
    prompts.push({
      key: 'fullScaleDistanceCm',
      title: 'One physical detail is still needed',
      label: 'How deep is the container when it is completely full?',
      helperText: 'This lets Spectron turn raw distance into a meaningful fill-level view.',
      placeholder: 'e.g. 40',
      unit: 'cm',
    });
  }

  if (['utilization_percent', 'overload_risk'].some((metric) => selected.has(metric))) {
    prompts.push({
      key: 'maximumLoadKg',
      title: 'Load capacity is required',
      label: 'What is the maximum safe operating load?',
      helperText: 'This is required to calculate utilization percentage and overload risk.',
      placeholder: 'e.g. 500',
      unit: 'kg',
    });
  }

  if (['occupancy_count', 'occupancy_spike', 'peak_occupancy'].some((metric) => selected.has(metric))) {
    prompts.push({
      key: 'safeOccupancyPeople',
      title: 'Occupancy capacity is required',
      label: 'What is the safe occupancy limit for this area?',
      helperText: 'This lets alerts distinguish normal, busy, and unsafe occupancy.',
      placeholder: 'e.g. 40',
      unit: 'people',
    });
  }

  if (
    [
      'temperature_spike',
      'humidity_spike',
      'gas_spike',
      'occupancy_spike',
      'fill_rate',
      'load_change_rate',
      'depletion_rate',
    ].some((metric) => selected.has(metric))
  ) {
    prompts.push({
      key: 'changeWindowMinutes',
      title: 'Choose the change window',
      label: 'Over how many minutes should changes be calculated?',
      helperText: 'Shorter windows react faster; longer windows reduce noise.',
      placeholder: 'e.g. 15',
      unit: 'minutes',
    });
  }



  return prompts;
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

const fieldGroupTitleSx = {
  mb: 1,
  color: 'text.primary',
  fontWeight: 800,
  borderLeft: '4px solid rgba(108, 137, 48, 0.55)',
  pl: 1.25,
  lineHeight: 1.35,
} as const;

const alertTitleSx = {
  mb: 0.5,
  fontWeight: 800,
} as const;

const CONFIGURATION_STEPS: Array<{
  key: WizardStepKey;
  title: string;
  description: string;
}> = [
  {
    key: 'setup',
    title: 'Core Setup',
    description: 'Name it, pick the key metric, and set the display.',
  },
  {
    key: 'alerts',
    title: 'Alert Rules',
    description: 'Set the warning and critical limits.',
  },
];

interface InfoButtonProps {
  children?: React.ReactNode;
  tooltip?: string;
}

const InfoButton: React.FC<InfoButtonProps> = ({ children, tooltip = 'More info' }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  if (!children) return null;

  const open = Boolean(anchorEl);
  const popoverId = open ? 'sensor-config-info-popover' : undefined;

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
      <IconButton
        size="small"
        aria-describedby={popoverId}
        onClick={(event) => setAnchorEl(open ? null : event.currentTarget)}
        sx={{
          p: 0.5,
          color: 'text.secondary',
          '&:hover': { color: 'primary.main', bgcolor: 'rgba(108, 137, 48, 0.08)' },
        }}
        title={tooltip}
      >
        <InfoIcon sx={{ fontSize: '1.1rem' }} />
      </IconButton>
      <Popover
        id={popoverId}
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        PaperProps={{
          sx: {
            mt: 0.75,
            maxWidth: 360,
            p: 1.5,
            borderRadius: 1.5,
            bgcolor: '#fffdf8',
            border: '1px solid rgba(60, 57, 17, 0.12)',
            boxShadow: '0 16px 30px rgba(60, 57, 17, 0.12)',
          },
        }}
      >
        {typeof children === 'string' ? (
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {children}
          </Typography>
        ) : (
          <Box sx={{ color: 'text.secondary', '& p': { lineHeight: 1.6 } }}>{children}</Box>
        )}
      </Popover>
    </Box>
  );
};

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
  const [fullScaleDistanceCm, setFullScaleDistanceCm] = useState('');
  const [sustainedWindowMinutes, setSustainedWindowMinutes] = useState('15');
  const [maximumLoadKg, setMaximumLoadKg] = useState('');
  const [safeOccupancyPeople, setSafeOccupancyPeople] = useState('');
  const [changeWindowMinutes, setChangeWindowMinutes] = useState('15');
  const [attendanceBaselineDistanceCm, setAttendanceBaselineDistanceCm] = useState('');
  const [attendanceTriggerDeltaCm, setAttendanceTriggerDeltaCm] = useState('50');
  const [attendanceResetHysteresisCm, setAttendanceResetHysteresisCm] = useState('10');
  const [attendanceCooldownSeconds, setAttendanceCooldownSeconds] = useState('2');
  const [useCase, setUseCase] = useState<UseCaseOption>('generic_monitoring');
  // Multi-metric support: Keep primaryMetric as a derived value for backward compatibility with preview/AI logic
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const primaryMetric = selectedMetrics[0] || '';

  const [metricPresentationProfiles, setMetricPresentationProfiles] = useState<Record<string, PresentationProfileOption>>({});
  const [metricPresentationConfigs, setMetricPresentationConfigs] = useState<Record<string, PresentationConfigValue>>({});
  
  // Maintain backward compatibility for AI/primary metric logic
  const presentationProfile = metricPresentationProfiles[primaryMetric] || 'single_trend';
  const presentationConfig = useMemo(
    () => metricPresentationConfigs[primaryMetric] || {},
    [metricPresentationConfigs, primaryMetric]
  );

  const setPrimaryMetric = useCallback((val: string) => {
    if (!val) {
      setSelectedMetrics([]);
      return;
    }
    setSelectedMetrics((prev) => (prev.includes(val) ? prev : [val, ...prev.filter((m) => m !== val)]));
  }, []);

  const setPresentationProfile = useCallback((profile: PresentationProfileOption) => {
    setMetricPresentationProfiles((prev) => ({ ...prev, [primaryMetric]: profile }));
  }, [primaryMetric]);

  const setPresentationConfig = useCallback((updater: PresentationConfigValue | ((current: PresentationConfigValue) => PresentationConfigValue)) => {
    setMetricPresentationConfigs((prev) => {
      const current = prev[primaryMetric] || {};
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [primaryMetric]: next };
    });
  }, [primaryMetric]);
  
  const [alertSettings, setAlertSettings] = useState<AlertSettingInput[]>([]);
  const [, setMetricThresholds] = useState<Record<string, MetricThresholdInput>>({});
  const [reportsPerDay, setReportsPerDay] = useState('24');
  const readingFlowType: 'CONSTANT_PER_DAY' = 'CONSTANT_PER_DAY';
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [aiPrompt, setAiPrompt] = useState('');
  const [learningPhaseDay, setLearningPhaseDay] = useState(0);
  const [learningPhaseStatus, setLearningPhaseStatus] = useState<LearningPhaseStatusResponse | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AIDraftSummary | null>(null);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  const [aiFollowUpQuestions, setAiFollowUpQuestions] = useState<AIFollowUpQuestion[]>([]);
  const [aiFollowUpAnswers, setAiFollowUpAnswers] = useState<AIFollowUpAnswers>({});
  const [requestingAi, setRequestingAi] = useState(false);
  const [showAiAssistance, setShowAiAssistance] = useState(false);
  const [resolvedHardwareControllerId, setResolvedHardwareControllerId] = useState('');
  const initializedSensorIdRef = useRef<string | null>(null);
  const hasUserEditedMetricsRef = useRef(false);
  const activeSensorId = sensorId || id || navigationState?.sensorId || '';
  const activeControllerId =
    controllerId || navigationState?.controllerId || resolvedHardwareControllerId || sensor?.controller_id || '';
  const isHardwareContext = Boolean(activeControllerId && /^CTRL-/i.test(activeControllerId));

  const configurableDerivedMetrics = useMemo(
    () => getConfigurableDerivedMetrics(sensor?.type || navigationState?.sensorType || ''),
    [sensor?.type, navigationState?.sensorType]
  );
  const sensorKnowledgeProfile = useMemo(
    () => getSensorKnowledgeProfile(sensor?.type || navigationState?.sensorType || ''),
    [navigationState?.sensorType, sensor?.type]
  );
  const observableMetricCatalog = useMemo(
    () => getObservableMetricCatalog(sensor?.type || navigationState?.sensorType || ''),
    [navigationState?.sensorType, sensor?.type]
  );
  const supportedObservableMetrics = useMemo(
    () => observableMetricCatalog.filter((metric) => metric.availability === 'supported_now'),
    [observableMetricCatalog]
  );
  const selectedDerivedMetric = useMemo(
    () => getObservableMetricDefinition(sensor?.type || navigationState?.sensorType || '', primaryMetric),
    [navigationState?.sensorType, primaryMetric, sensor?.type]
  );
  const purposeOptions = useMemo(
    () => getPurposeOptionsForDerivedMetric(sensor?.type || navigationState?.sensorType || '', primaryMetric),
    [navigationState?.sensorType, primaryMetric, sensor?.type]
  );
  const presentationProfiles = useMemo(
    () => getPresentationProfileDefinitions(sensor?.type || navigationState?.sensorType || '', primaryMetric),
    [navigationState?.sensorType, primaryMetric, sensor?.type]
  );
  const sensorMetrics = useMemo(
    () => getPresentationMetrics(sensor?.type || navigationState?.sensorType || '', primaryMetric, presentationProfile),
    [navigationState?.sensorType, presentationProfile, primaryMetric, sensor?.type]
  );
  const allowedPresentationProfiles = useMemo(
    () =>
      getSupportedProfilesForDerivedMetric(
        sensor?.type || navigationState?.sensorType || '',
        primaryMetric
      ) as PresentationProfileOption[],
    [navigationState?.sensorType, primaryMetric, sensor?.type]
  );
  const clarificationPrompts = useMemo(
    () => getClarificationPrompts(sensor?.type || navigationState?.sensorType || '', selectedMetrics),
    [navigationState?.sensorType, selectedMetrics, sensor?.type]
  );
  const resolvedReportsPerDay = toPositiveIntOrUndefined(reportsPerDay) || 24;
  const estimatedBatteryLifeDays = estimateBatteryLifeDays(
    resolvedReportsPerDay,
    sensorMetrics.length,
    readingFlowType
  );
  const activeStepMeta = CONFIGURATION_STEPS[activeStep];

  // Persist draft config locally so users can navigate away and return without losing work
  useEffect(() => {
    if (!activeSensorId) return;
    const key = `sensorConfigDraft-${activeSensorId}`;
    const draft = {
      friendlyName,
      systemName,
      primaryMetric,
      selectedMetrics,
      purpose,
      useCase,
      metricPresentationProfiles,
      metricPresentationConfigs,
      presentationConfig,
      alertSettings,
      reportsPerDay,
      readingFlowType,
      aiPrompt,
      learningPhaseDay,
      aiSuggestions,
      aiFollowUpQuestions,
      aiFollowUpAnswers,
      presentationProfile,
      fullScaleDistanceCm,
      sustainedWindowMinutes,
      maximumLoadKg,
      safeOccupancyPeople,
      changeWindowMinutes,
      attendanceBaselineDistanceCm,
      attendanceTriggerDeltaCm,
      attendanceResetHysteresisCm,
      attendanceCooldownSeconds,
    };
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch (e) {
      // ignore storage errors
    }
  }, [
    activeSensorId,
    aiPrompt,
    aiFollowUpAnswers,
    aiFollowUpQuestions,
    aiSuggestions,
    alertSettings,
    friendlyName,
    fullScaleDistanceCm,
    maximumLoadKg,
    safeOccupancyPeople,
    changeWindowMinutes,
    attendanceBaselineDistanceCm,
    attendanceTriggerDeltaCm,
    attendanceResetHysteresisCm,
    attendanceCooldownSeconds,
    metricPresentationConfigs,
    metricPresentationProfiles,
    learningPhaseDay,
    presentationConfig,
    presentationProfile,
    primaryMetric,
    purpose,
    readingFlowType,
    reportsPerDay,
    sustainedWindowMinutes,
    selectedMetrics,
    systemName,
    useCase,
  ]);

  useEffect(() => {
    if (!activeSensorId) return;
    const key = `sensorConfigDraft-${activeSensorId}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.friendlyName) setFriendlyName(draft.friendlyName);
      if (draft.systemName) setSystemName(draft.systemName);
      if (draft.selectedMetrics && Array.isArray(draft.selectedMetrics)) {
        setSelectedMetrics(draft.selectedMetrics);
      } else if (draft.primaryMetric) {
        setPrimaryMetric(draft.primaryMetric);
      }
      if (draft.presentationProfile) setPresentationProfile(draft.presentationProfile);
      if (draft.metricPresentationProfiles) setMetricPresentationProfiles(draft.metricPresentationProfiles);
      if (draft.metricPresentationConfigs) setMetricPresentationConfigs(draft.metricPresentationConfigs);
      if (draft.presentationConfig) setPresentationConfig(draft.presentationConfig);
      if (Array.isArray(draft.alertSettings)) setAlertSettings(draft.alertSettings);
      if (draft.reportsPerDay) setReportsPerDay(draft.reportsPerDay);
      if (draft.purpose) setPurpose(draft.purpose);
      if (draft.aiPrompt) setAiPrompt(draft.aiPrompt);
      if (typeof draft.learningPhaseDay === 'number') setLearningPhaseDay(draft.learningPhaseDay);
      if (draft.aiSuggestions) setAiSuggestions(draft.aiSuggestions);
      if (Array.isArray(draft.aiFollowUpQuestions)) setAiFollowUpQuestions(draft.aiFollowUpQuestions);
      if (draft.aiFollowUpAnswers && typeof draft.aiFollowUpAnswers === 'object') {
        setAiFollowUpAnswers(draft.aiFollowUpAnswers);
      }
      if (typeof draft.fullScaleDistanceCm === 'string') setFullScaleDistanceCm(draft.fullScaleDistanceCm);
      if (typeof draft.sustainedWindowMinutes === 'string') setSustainedWindowMinutes(draft.sustainedWindowMinutes);
      if (typeof draft.maximumLoadKg === 'string') setMaximumLoadKg(draft.maximumLoadKg);
      if (typeof draft.safeOccupancyPeople === 'string') setSafeOccupancyPeople(draft.safeOccupancyPeople);
      if (typeof draft.changeWindowMinutes === 'string') setChangeWindowMinutes(draft.changeWindowMinutes);
      if (typeof draft.attendanceBaselineDistanceCm === 'string') {
        setAttendanceBaselineDistanceCm(draft.attendanceBaselineDistanceCm);
      }
      if (typeof draft.attendanceTriggerDeltaCm === 'string') {
        setAttendanceTriggerDeltaCm(draft.attendanceTriggerDeltaCm);
      }
      if (typeof draft.attendanceResetHysteresisCm === 'string') {
        setAttendanceResetHysteresisCm(draft.attendanceResetHysteresisCm);
      }
      if (typeof draft.attendanceCooldownSeconds === 'string') {
        setAttendanceCooldownSeconds(draft.attendanceCooldownSeconds);
      }
    } catch (e) {
      // ignore parse errors
    }
  }, [activeSensorId, setPresentationConfig, setPresentationProfile, setPrimaryMetric]);

  const handleBack = () => {
    if (navigationState?.returnTo) {
      navigate(navigationState.returnTo);
      return;
    }

    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
      return;
    }

    if (isHardwareContext && activeControllerId) {
      navigate(`/hardware/${activeControllerId}/sensors`);
      return;
    }

    if (sensor?.controller_id) {
      navigate(`/farms`, {
        state: { message: 'Open the farm workspace to continue sensor setup.' },
      });
      return;
    }

    navigate('/farms');
  };

  const updateAlertSetting = (
    key: string,
    field: 'warningThreshold' | 'criticalThreshold',
    value: string
  ) => {
    setAlertSettings((current) => {
      const next = current.map((alert) =>
        alert.key === key
          ? {
              ...alert,
              [field]: value,
            }
          : alert
      );
      setMetricThresholds(alertInputsToMetricThresholds(next));
      return next;
    });
  };

  const toggleMetricSelection = (metric: ObservableMetricDefinition) => {
    hasUserEditedMetricsRef.current = true;
    setSelectedMetrics((prev) => {
      const isSelected = prev.includes(metric.key);
      const next = isSelected ? prev.filter((k) => k !== metric.key) : [...prev, metric.key];
      
      if (!isSelected) {
        // Set recommended profile for this metric if not already set
        if (!metricPresentationProfiles[metric.key]) {
          setMetricPresentationProfiles((current) => ({
            ...current,
            [metric.key]: metric.recommended_profile as PresentationProfileOption,
          }));
        }

        // If we just selected the very first metric, set up defaults for it
        if (next.length === 1) {
          const nextProfile = metric.recommended_profile as PresentationProfileOption;
          setUseCase(metric.use_case);
          setPresentationConfig(
            normalizePresentationConfig(
              sensor?.type || navigationState?.sensorType || '',
              metric.key,
              nextProfile,
              {}
            )
          );
          if (!metric.purposes.some((option) => option.label === purpose)) {
            setPurpose(metric.purposes[0]?.label || '');
          }
        }
      }
      if (next.length > 0) {
        setPageError((current) =>
          current === 'Please choose what to measure.' ? null : current
        );
      }
      return next;
    });
  };

  const applyPresentationProfileSelectionForMetric = (metricKey: string, profile: PresentationProfileOption) => {
    setMetricPresentationProfiles((prev) => ({ ...prev, [metricKey]: profile }));
    
    // If it's the primary metric, sync the presentation configuration as well
    if (metricKey === primaryMetric) {
      setPresentationConfig(
        normalizePresentationConfig(
          sensor?.type || navigationState?.sensorType || '',
          metricKey,
          profile,
          {}
        )
      );
    }
  };

  const renderProfilePreview = (visualizationMethod: string, visualizationLabel: string) => {
    switch (visualizationMethod) {
      case 'line_trend':
        return (
          <Box sx={{ mt: 1.5 }}>
            <svg width="100%" height="45" viewBox="0 0 200 45" role="img" aria-label={`${visualizationLabel} preview`}>
              <path d="M10,38 Q50,26 90,18 T170,12" fill="none" stroke="#337a85" strokeWidth="2" strokeLinejoin="round" />
              {[10, 50, 90, 130, 170].map((x, i) => (
                <circle key={i} cx={x} cy={[38, 26, 18, 15, 12][i]} r="2" fill={i === 4 ? '#337a85' : '#c9c2b3'} />
              ))}
            </svg>
          </Box>
        );
      case 'area_trend':
        return (
          <Box sx={{ mt: 1.5 }}>
            <svg width="100%" height="45" viewBox="0 0 200 45" role="img" aria-label={`${visualizationLabel} preview`}>
              <defs>
                <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(51, 122, 133, 0.3)" />
                  <stop offset="100%" stopColor="rgba(51, 122, 133, 0.05)" />
                </linearGradient>
              </defs>
              <path d="M10,32 Q50,20 90,12 T170,8 L170,42 L10,42 Z" fill="url(#areaGrad)" stroke="none" />
              <path d="M10,32 Q50,20 90,12 T170,8" fill="none" stroke="#337a85" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </Box>
        );
      case 'gauge_band':
        return (
          <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="60" height="45" viewBox="0 0 100 80" role="img" aria-label={`${visualizationLabel} preview`}>
              <path d="M20,60 A40,40 0 0,1 80,60" fill="none" stroke="#e0e0e0" strokeWidth="6" />
              <path d="M20,60 A40,40 0 0,1 70,20" fill="none" stroke="#6c8930" strokeWidth="6" strokeLinecap="round" />
              <circle cx="50" cy="60" r="3" fill="#333" />
              <text x="50" y="75" textAnchor="middle" fontSize="10" fill="#666">68%</text>
            </svg>
          </Box>
        );
      case 'counter_bars':
        return (
          <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 45, gap: 0.5 }}>
            <svg width="100%" height="45" viewBox="0 0 200 45" role="img" aria-label={`${visualizationLabel} preview`}>
              {[10, 20, 30, 40, 35].map((height, i) => (
                <rect key={i} x={i * 35 + 20} y={45 - height} width="20" height={height} fill="#6c8930" rx="2" />
              ))}
            </svg>
          </Box>
        );
      case 'event_timeline':
        return (
          <Box sx={{ mt: 1.5 }}>
            <svg width="100%" height="40" viewBox="0 0 200 40" role="img" aria-label={`${visualizationLabel} preview`}>
              <line x1="10" y1="20" x2="190" y2="20" stroke="#e0e0e0" strokeWidth="1" />
              {[30, 60, 90, 120, 150].map((x, i) => {
                const y = [25, 12, 25, 10, 25][i];
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r="2.5" fill={i === 4 ? '#c37b2a' : '#999'} />
                  </g>
                );
              })}
            </svg>
          </Box>
        );
      default:
        return (
          <Box sx={{ mt: 1.5, p: 1, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="caption">Preview</Typography>
          </Box>
        );
    }
  };

  useEffect(() => {
    if (!selectedDerivedMetric) {
      return;
    }

    const sensorType = sensor?.type || navigationState?.sensorType || '';
    setAlertSettings((current) => {
      const currentAlerts = current.map((alert) => ({
        key: alert.key,
        label: alert.label,
        metric_key: alert.metricKey,
        condition: alert.condition,
        unit: alert.unit,
        description: alert.description,
        warning_threshold: toNumberOrUndefined(alert.warningThreshold),
        critical_threshold: toNumberOrUndefined(alert.criticalThreshold),
      }));
      const nextAlerts = selectedMetrics.flatMap(metricKey =>
        buildPresentationAlertSettings(
          sensorType,
          metricKey,
          metricPresentationProfiles[metricKey] ||
            (getObservableMetricDefinition(sensorType, metricKey)
              ?.recommended_profile as PresentationProfileOption | undefined) ||
            'single_trend',
          currentAlerts,
          metricThresholdsFromAlertSettings(currentAlerts)
        ).map(toAlertSettingInput)
      );

      setMetricThresholds(alertInputsToMetricThresholds(nextAlerts));
      return nextAlerts;
    });
  }, [
    metricPresentationProfiles,
    navigationState?.sensorType,
    selectedDerivedMetric,
    selectedMetrics,
    sensor?.type,
  ]);

  useEffect(() => {
    const sensorType = sensor?.type || navigationState?.sensorType || '';
    setPresentationConfig((current) =>
      normalizePresentationConfig(sensorType, primaryMetric, presentationProfile, current)
    );
  }, [navigationState?.sensorType, presentationProfile, primaryMetric, sensor?.type, setPresentationConfig]);

  useEffect(() => {
    if (!purposeOptions.length) {
      return;
    }

    const nextPurpose = resolvePurposeLabel(purposeOptions, purpose);
    if (nextPurpose !== purpose) {
      setPurpose(nextPurpose);
    }
  }, [purpose, purposeOptions]);

  const loadSensor = useCallback(async () => {
    if (!activeSensorId) return;

    try {
      setPageError(null);
      if (!isHardwareContext && !controllerId && !navigationState?.controllerId) {
        let discoveredHardwareControllerId: string | null = null;
        try {
          discoveredHardwareControllerId = await findHardwareControllerIdForSensor(activeSensorId);
        } catch {
          discoveredHardwareControllerId = null;
        }
        if (discoveredHardwareControllerId) {
          setResolvedHardwareControllerId(discoveredHardwareControllerId);
          navigate(`/hardware/${discoveredHardwareControllerId}/sensors/${activeSensorId}/configure`, {
            replace: true,
            state: {
              ...navigationState,
              controllerId: discoveredHardwareControllerId,
              sensorId: activeSensorId,
            },
          });
          return;
        }
      }

      const [sensorData, controllerData] = await Promise.all([
        isHardwareContext && activeControllerId ? getHardwareSensor(activeSensorId, activeControllerId) : getSensor(activeSensorId),
        isHardwareContext && activeControllerId
          ? getHardwareController(activeControllerId)
          : Promise.resolve(null),
      ]);
      setSensor(sensorData);

      if (initializedSensorIdRef.current !== activeSensorId) {
        const activeConfig = sensorData.active_config;
        const configuredMetricKey =
          getConfigPrimaryMetric(activeConfig) ||
          getDefaultObservableMetric(sensorData.type || '')?.key ||
          '';
        const configuredMetric =
          getObservableMetricDefinition(sensorData.type || '', configuredMetricKey) ||
          getDefaultObservableMetric(sensorData.type || '');
        const configuredUseCase =
          configuredMetric?.use_case ||
          normalizeUseCaseOption(getConfigUseCase(activeConfig)) ||
          getDefaultUseCaseForSensorType(sensorData.type || '');
        const configuredProfile =
          normalizePresentationProfileOption(getConfigPresentationProfile(activeConfig)) ||
          (configuredMetric?.recommended_profile as PresentationProfileOption | undefined) ||
          getRecommendedProfileForUseCase(configuredUseCase, sensorData.type || '');
        const metrics = getPresentationMetrics(
          sensorData.type || '',
          configuredMetric?.key,
          configuredProfile
        );
        const context = getConfigContext(activeConfig) || sensorData.context;
        const defaultPurposeLabel = configuredMetric?.purposes[0]?.label || '';

        setSystemName(activeConfig?.hardware?.system_name || controllerData?.name || '');
        setPurpose(
          resolvePurposeLabel(
            configuredMetric?.purposes || [],
            getConfigPurpose(activeConfig),
            sensorData.purpose,
            defaultPurposeLabel
          )
        );
        setFriendlyName(
          activeConfig?.interpretation?.friendly_name ||
            activeConfig?.friendly_name ||
            sensorData.name ||
            ''
        );
        setDomain(context?.domain || '');
        setEnvironmentType(context?.environment_type || '');
        setIndoorOutdoor(context?.indoor_outdoor || '');
        setAssetType(context?.asset_type || '');
        setLocationCountry(context?.location?.country || '');
        setLocationRegion(context?.location?.region || '');
        setLocationLabel(context?.location?.label || '');
        setHistoricalWindowDays(context?.historical_window_days?.toString() || '');
        setInstallationNotes(context?.installation_notes || '');
        const existingHardwareConfig = getConfigHardware(activeConfig);
        setFullScaleDistanceCm(
          typeof existingHardwareConfig.fullScaleDistanceCm === 'number'
            ? existingHardwareConfig.fullScaleDistanceCm.toString()
            : typeof existingHardwareConfig.tankDepthCm === 'number'
              ? existingHardwareConfig.tankDepthCm.toString()
              : ''
        );
        setSustainedWindowMinutes(
          typeof existingHardwareConfig.sustainedWindowMinutes === 'number'
            ? existingHardwareConfig.sustainedWindowMinutes.toString()
            : '15'
        );
        setMaximumLoadKg(
          typeof existingHardwareConfig.maximumLoadKg === 'number'
            ? existingHardwareConfig.maximumLoadKg.toString()
            : ''
        );
        setSafeOccupancyPeople(
          typeof existingHardwareConfig.safeOccupancyPeople === 'number'
            ? existingHardwareConfig.safeOccupancyPeople.toString()
            : ''
        );
        setChangeWindowMinutes(
          typeof existingHardwareConfig.changeWindowMinutes === 'number'
            ? existingHardwareConfig.changeWindowMinutes.toString()
            : '15'
        );
        setAttendanceBaselineDistanceCm(
          typeof existingHardwareConfig.attendanceBaselineDistanceCm === 'number'
            ? existingHardwareConfig.attendanceBaselineDistanceCm.toString()
            : ''
        );
        setAttendanceTriggerDeltaCm(
          typeof existingHardwareConfig.attendanceTriggerDeltaCm === 'number'
            ? existingHardwareConfig.attendanceTriggerDeltaCm.toString()
            : '50'
        );
        setAttendanceResetHysteresisCm(
          typeof existingHardwareConfig.attendanceResetHysteresisCm === 'number'
            ? existingHardwareConfig.attendanceResetHysteresisCm.toString()
            : '10'
        );
        setAttendanceCooldownSeconds(
          typeof existingHardwareConfig.attendanceCooldownSeconds === 'number'
            ? existingHardwareConfig.attendanceCooldownSeconds.toString()
            : '2'
        );
        setReportsPerDay(getConfigReportsPerDay(activeConfig)?.toString() || '24');
        setUseCase(configuredUseCase);
        
        const savedObservableMetrics =
          activeConfig?.interpretation?.observable_metrics?.filter(Boolean) || [];
        const savedDerivedMetrics =
          activeConfig?.interpretation?.derived_metrics?.map((metric) => metric.key).filter(Boolean) || [];
        const hwConfigProfiles =
          (existingHardwareConfig.metric_profiles as Record<string, PresentationProfileOption> | undefined) || {};
        const savedMetricPresentationConfigs =
          (existingHardwareConfig.metric_presentation_configs as Record<string, PresentationConfigValue> | undefined) || {};
        const savedProfileMetricKeys = Object.keys(hwConfigProfiles);
        const savedMetricKeys =
          savedObservableMetrics.length > 0
            ? savedObservableMetrics
            : savedProfileMetricKeys.length > 0
              ? savedProfileMetricKeys
              : savedDerivedMetrics.length > 0
                ? savedDerivedMetrics
                : metrics.map((metric) => metric.key).filter(Boolean);
        const hydratedMetricKeys = Array.from(
          new Set(
            savedMetricKeys.filter(
              (metricKey) =>
                Boolean(metricKey) &&
                Boolean(getObservableMetricDefinition(sensorData.type || '', metricKey))
            )
          )
        );
        if (hydratedMetricKeys.length === 0 && configuredMetric?.key) {
          hydratedMetricKeys.push(configuredMetric.key);
        }
        const hydratedProfiles = hydratedMetricKeys.reduce<Record<string, PresentationProfileOption>>(
          (profiles, metricKey) => {
            const savedProfile = hwConfigProfiles[metricKey];
            const allowedProfiles = getSupportedProfilesForDerivedMetric(sensorData.type || '', metricKey);
            profiles[metricKey] =
              savedProfile && allowedProfiles.includes(savedProfile)
                ? savedProfile
                : metricKey === configuredMetric?.key
                  ? configuredProfile
                  : (allowedProfiles[0] as PresentationProfileOption) || 'single_trend';
            return profiles;
          },
          {}
        );
        const primaryMetricKey = hydratedMetricKeys[0] || configuredMetric?.key || '';
        const primaryProfile = hydratedProfiles[primaryMetricKey] || configuredProfile;
        const primaryPresentationConfig = normalizePresentationConfig(
          sensorData.type || '',
          primaryMetricKey,
          primaryProfile,
          savedMetricPresentationConfigs[primaryMetricKey] || {
            headline_metric: activeConfig?.presentation?.headline_metric,
            status_mode: activeConfig?.presentation?.status_mode,
            comparison_mode: activeConfig?.presentation?.comparison_mode,
            detail_mode: activeConfig?.presentation?.detail_mode,
          }
        );

        setSelectedMetrics(hydratedMetricKeys);
        setMetricPresentationProfiles(hydratedProfiles);
        setMetricPresentationConfigs({
          ...savedMetricPresentationConfigs,
          [primaryMetricKey]: primaryPresentationConfig,
        });

        const baseThresholds = { ...(getConfigMetricThresholds(activeConfig) || {}) };
        if (metrics.length === 1 && metrics[0]?.key && !baseThresholds[metrics[0].key]) {
          const primaryThreshold = getConfigThresholds(activeConfig);
          if (primaryThreshold) {
            baseThresholds[metrics[0].key] = primaryThreshold;
          }
        }
        if (hydratedMetricKeys.length === 0) {
            const configuredKeys = Object.keys(baseThresholds);
            if (configuredKeys.length > 0) {
                const keys = Array.from(new Set([configuredMetric?.key || '', ...configuredKeys])).filter(Boolean);
                setSelectedMetrics(keys);
            } else {
                setPrimaryMetric(configuredMetric?.key || '');
            }
        }
        const nextAlertSettings = buildPresentationAlertSettings(
          sensorData.type || '',
          configuredMetric?.key,
          configuredProfile,
          activeConfig?.settings?.alerts,
          baseThresholds
        ).map(toAlertSettingInput);
        setAlertSettings(nextAlertSettings);
        setMetricThresholds(alertInputsToMetricThresholds(nextAlertSettings));
        initializedSensorIdRef.current = activeSensorId;
      }
    } catch (error) {
      console.error('Error loading sensor:', error);
      setPageError('Sensor not found');
    } finally {
      setLoading(false);
    }
  }, [
    activeSensorId,
    activeControllerId,
    controllerId,
    isHardwareContext,
    navigate,
    navigationState,
    setPrimaryMetric,
  ]);

  useEffect(() => {
    initializedSensorIdRef.current = null;
    hasUserEditedMetricsRef.current = false;
    setActiveStep(0);
    setPageError(null);
  }, [activeSensorId]);

  useEffect(() => {
    if (observableMetricCatalog.length === 0) {
      return;
    }
    if (hasUserEditedMetricsRef.current) {
      return;
    }
    
    // Only auto-select a fallback if NO metrics are selected at all.
    // Do NOT reset if selectedMetrics has valid values already (e.g. user selected 2nd metric).
    if (selectedMetrics.length > 0) {
      return;
    }

    const fallbackMetric = supportedObservableMetrics[0] || observableMetricCatalog[0];
    if (!fallbackMetric) return;
    setPrimaryMetric(fallbackMetric.key);
    setUseCase(fallbackMetric.use_case);
    setPresentationProfile(fallbackMetric.recommended_profile);
    if (!purpose.trim()) {
      setPurpose(fallbackMetric.purposes[0]?.label || '');
    }
  }, [observableMetricCatalog, selectedMetrics, purpose, supportedObservableMetrics, setPrimaryMetric, setPresentationProfile]);

  useEffect(() => {
    if (!selectedDerivedMetric) {
      return;
    }

    if (useCase !== selectedDerivedMetric.use_case) {
      setUseCase(selectedDerivedMetric.use_case);
    }
  }, [selectedDerivedMetric, useCase]);

  useEffect(() => {
    if (allowedPresentationProfiles.length === 0) {
      return;
    }

    if (!allowedPresentationProfiles.includes(presentationProfile)) {
      setPresentationProfile(allowedPresentationProfiles[0]);
    }
  }, [allowedPresentationProfiles, presentationProfile, setPresentationProfile]);

  useEffect(() => {
    if (!selectedDerivedMetric) {
      return;
    }

    if (!allowedPresentationProfiles.includes(presentationProfile)) {
      setPresentationProfile(
        (getRecommendedProfileForDerivedMetric(sensor?.type || '', primaryMetric) as PresentationProfileOption | undefined) ||
          allowedPresentationProfiles[0]
      );
    }
  }, [allowedPresentationProfiles, presentationProfile, primaryMetric, selectedDerivedMetric, sensor?.type, setPresentationProfile]);

  useEffect(() => {
    if (activeSensorId) {
      loadSensor();
    }
  }, [activeSensorId, loadSensor]);

  useEffect(() => {
    if (!activeSensorId) {
      return;
    }

    let cancelled = false;
    getLearningPhaseStatus(activeSensorId)
      .then((status) => {
        if (cancelled) {
          return;
        }
        setLearningPhaseStatus(status || null);
        if (status?.phase === 'learning') {
          setLearningPhaseDay(status.dayNumber);
        } else if (status?.phase === 'completed') {
          setLearningPhaseDay((status.requiredDays || 7) + 1);
        } else {
          setLearningPhaseDay(0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLearningPhaseStatus(null);
          setLearningPhaseDay(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSensorId]);

  const buildContextPayload = useCallback((): SensorContext | undefined => {
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
  }, [
    assetType,
    domain,
    environmentType,
    historicalWindowDays,
    indoorOutdoor,
    installationNotes,
    locationCountry,
    locationLabel,
    locationRegion,
  ]);

  const resetAiFollowUpState = useCallback(() => {
    setAiFollowUpQuestions([]);
    setAiFollowUpAnswers({});
  }, []);

  const buildAiDraftSummary = useCallback((
    suggestions: ConfigurationAiSuggestionResponse,
    sensorType: string
  ): AIDraftSummary => {
    const suggestedMetricKey =
      getConfigPrimaryMetric(suggestions.validated_config) ||
      getConfigPrimaryMetric(suggestions.suggested_config) ||
      primaryMetric ||
      'value';
    const suggestedMetric =
      getObservableMetricDefinition(sensorType, suggestedMetricKey) ||
      getDefaultObservableMetric(sensorType);
    const suggestedPurpose = resolvePurposeLabel(
      suggestedMetric?.purposes || [],
      getConfigPurpose(suggestions.validated_config),
      getConfigPurpose(suggestions.suggested_config),
      purpose,
      suggestedMetric?.purposes[0]?.label
    );
    const suggestedProfile =
      getConfigPresentationProfile(suggestions.validated_config) ||
      getConfigPresentationProfile(suggestions.suggested_config) ||
      presentationProfile;
    const firstAlert =
      suggestions.validated_config.settings?.alerts?.[0] ||
      suggestions.suggested_config.settings?.alerts?.[0];

    return {
      ...suggestions,
      metric: getMetricLabel(suggestedMetricKey),
      purpose: suggestedPurpose,
      presentationProfile: suggestedProfile,
      alertThresholds: {
        warning:
          firstAlert?.warning_threshold !== undefined
            ? String(firstAlert.warning_threshold)
            : '--',
        critical:
          firstAlert?.critical_threshold !== undefined
            ? String(firstAlert.critical_threshold)
            : '--',
      },
    };
  }, [presentationProfile, primaryMetric, purpose]);

  const handleAiSuggestionResponse = useCallback((
    suggestions: ConfigurationAiSuggestionResponse,
    sensorType: string
  ) => {
    // Skip follow-up questions — always show results directly
    resetAiFollowUpState();
    setShowAiSuggestions(true);
    setAiSuggestions(buildAiDraftSummary(suggestions, sensorType));
  }, [buildAiDraftSummary, resetAiFollowUpState]);

  const requestAiConfiguration = useCallback(async (followUpAnswers?: AIFollowUpAnswers) => {
    if (!aiPrompt.trim()) {
      return;
    }

    try {
      setRequestingAi(true);
      setPageError(null);
      const sensorType = sensor?.type || navigationState?.sensorType || 'unknown';
      const suggestions = await parseConfigurationFromAi({
        description: aiPrompt.trim(),
        sensorId: activeSensorId,
        sensorType,
        controllerId: isHardwareContext ? activeControllerId : undefined,
        context: buildContextPayload(),
        followUpAnswers,
      });
      handleAiSuggestionResponse(suggestions, sensorType);
    } catch (error: any) {
      let errorMessage = 'Failed to get AI suggestions. Please try again or configure manually.';
      
      // Provide more specific error messages based on the error type
      if (error?.response?.status === 404) {
        errorMessage = 'Sensor not found. Please ensure the sensor is properly configured and try again.';
      } else if (error?.response?.status === 403) {
        errorMessage = 'You do not have permission to use AI assistance for this sensor.';
      } else if (error?.response?.status === 400) {
        errorMessage = error?.response?.data?.message || 'Invalid request. Please check your input and try again.';
      } else if (error?.message?.includes('timeout')) {
        errorMessage = 'Request timed out. The AI service may be slow. Please try again.';
      }
      
      setPageError(errorMessage);
      console.error('AI parse error:', error);
    } finally {
      setRequestingAi(false);
    }
  }, [
    activeControllerId,
    activeSensorId,
    aiPrompt,
    buildContextPayload,
    handleAiSuggestionResponse,
    isHardwareContext,
    navigationState?.sensorType,
    sensor?.type,
  ]);

  const applyAiSuggestionToForm = (
    response: ConfigurationAiSuggestionResponse,
    fallbackDescription: string
  ) => {
    const sensorType = sensor?.type || navigationState?.sensorType || '';
    const suggestedConfig = response.validated_config || response.suggested_config;
    const suggestedMetricKey =
      getConfigPrimaryMetric(suggestedConfig) ||
      getDefaultObservableMetric(sensorType)?.key ||
      primaryMetric;
    const suggestedMetric =
      getObservableMetricDefinition(sensorType, suggestedMetricKey) ||
      getDefaultObservableMetric(sensorType);

    if (!suggestedMetric) {
      return;
    }

    const suggestedUseCase =
      suggestedMetric.use_case ||
      normalizeUseCaseOption(getConfigUseCase(suggestedConfig)) ||
      getDefaultUseCaseForSensorType(sensorType);
    const suggestedProfile =
      normalizePresentationProfileOption(getConfigPresentationProfile(suggestedConfig)) ||
      (suggestedMetric.recommended_profile as PresentationProfileOption | undefined) ||
      getRecommendedProfileForUseCase(suggestedUseCase, sensorType);
    const suggestedPurpose = resolvePurposeLabel(
      suggestedMetric.purposes || [],
      getConfigPurpose(suggestedConfig),
      purpose,
      suggestedMetric.purposes[0]?.label
    );
    const suggestedContext = getConfigContext(suggestedConfig);
    const suggestedHardwareConfig = getConfigHardware(suggestedConfig);

    setFriendlyName(
      suggestedConfig.interpretation?.friendly_name ||
        suggestedConfig.friendly_name ||
        friendlyName
    );
    setPurpose(suggestedPurpose);
    setUseCase(suggestedUseCase);
    setPrimaryMetric(suggestedMetric.key);
    setPresentationProfile(suggestedProfile);
    setPresentationConfig(
      normalizePresentationConfig(sensorType, suggestedMetric.key, suggestedProfile, {
        headline_metric: suggestedConfig.presentation?.headline_metric,
        status_mode: suggestedConfig.presentation?.status_mode,
        comparison_mode: suggestedConfig.presentation?.comparison_mode,
        detail_mode: suggestedConfig.presentation?.detail_mode,
      })
    );
    setReportsPerDay(getConfigReportsPerDay(suggestedConfig)?.toString() || reportsPerDay);

    if (suggestedConfig.hardware?.system_name) {
      setSystemName(suggestedConfig.hardware.system_name);
    }

    if (suggestedContext) {
      setDomain(suggestedContext.domain || '');
      setEnvironmentType(suggestedContext.environment_type || '');
      setIndoorOutdoor(suggestedContext.indoor_outdoor || '');
      setAssetType(suggestedContext.asset_type || '');
      setLocationCountry(suggestedContext.location?.country || '');
      setLocationRegion(suggestedContext.location?.region || '');
      setLocationLabel(suggestedContext.location?.label || '');
      setHistoricalWindowDays(suggestedContext.historical_window_days?.toString() || '');
      setInstallationNotes(suggestedContext.installation_notes || '');
    }

    if (typeof suggestedHardwareConfig.fullScaleDistanceCm === 'number') {
      setFullScaleDistanceCm(suggestedHardwareConfig.fullScaleDistanceCm.toString());
    }
    if (typeof suggestedHardwareConfig.sustainedWindowMinutes === 'number') {
      setSustainedWindowMinutes(suggestedHardwareConfig.sustainedWindowMinutes.toString());
    }
    if (typeof suggestedHardwareConfig.maximumLoadKg === 'number') {
      setMaximumLoadKg(suggestedHardwareConfig.maximumLoadKg.toString());
    }
    if (typeof suggestedHardwareConfig.safeOccupancyPeople === 'number') {
      setSafeOccupancyPeople(suggestedHardwareConfig.safeOccupancyPeople.toString());
    }
    if (typeof suggestedHardwareConfig.changeWindowMinutes === 'number') {
      setChangeWindowMinutes(suggestedHardwareConfig.changeWindowMinutes.toString());
    }

    const previewMetrics = getPresentationMetrics(sensorType, suggestedMetric.key, suggestedProfile);
    const baseThresholds = { ...(getConfigMetricThresholds(suggestedConfig) || {}) };
    if (previewMetrics.length === 1 && previewMetrics[0]?.key && !baseThresholds[previewMetrics[0].key]) {
      const primaryThreshold = getConfigThresholds(suggestedConfig);
      if (primaryThreshold) {
        baseThresholds[previewMetrics[0].key] = primaryThreshold;
      }
    }

    const nextAlertSettings = buildPresentationAlertSettings(
      sensorType,
      suggestedMetric.key,
      suggestedProfile,
      suggestedConfig.settings?.alerts,
      baseThresholds
    ).map(toAlertSettingInput);
    setAlertSettings(nextAlertSettings);
    setMetricThresholds(alertInputsToMetricThresholds(nextAlertSettings));
  };

  const validateStep = (stepIndex: number) => {
    switch (CONFIGURATION_STEPS[stepIndex]?.key) {
      case 'setup':
        if (!friendlyName.trim()) {
          setPageError('Please give your sensor a name.');
          return false;
        }
        if (selectedMetrics.length === 0) {
          setPageError('Please choose what to measure.');
          return false;
        }
        if (!observableMetricCatalog.some((metric) => selectedMetrics.includes(metric.key))) {
          setPageError('The selected measurement is not supported by this sensor.');
          return false;
        }
        if (!purpose.trim()) {
          setPageError('Please explain why you are measuring this.');
          return false;
        }
        if (!presentationProfile.trim()) {
          setPageError('Please choose how to display it.');
          return false;
        }
        if (
          clarificationPrompts.some((prompt) => prompt.key === 'fullScaleDistanceCm') &&
          !toPositiveIntOrUndefined(fullScaleDistanceCm)
        ) {
          setPageError('Please tell us how deep the container is when it is full.');
          return false;
        }
        if (
          clarificationPrompts.some((prompt) => prompt.key === 'sustainedWindowMinutes') &&
          !toPositiveIntOrUndefined(sustainedWindowMinutes)
        ) {
          setPageError('Please choose how many minutes a condition must stay unsafe before alerting.');
          return false;
        }
        if (
          clarificationPrompts.some((prompt) => prompt.key === 'maximumLoadKg') &&
          !toPositiveIntOrUndefined(maximumLoadKg)
        ) {
          setPageError('Please enter the maximum safe operating load.');
          return false;
        }
        if (
          clarificationPrompts.some((prompt) => prompt.key === 'safeOccupancyPeople') &&
          !toPositiveIntOrUndefined(safeOccupancyPeople)
        ) {
          setPageError('Please enter the safe occupancy limit.');
          return false;
        }
        if (
          clarificationPrompts.some((prompt) => prompt.key === 'changeWindowMinutes') &&
          !toPositiveIntOrUndefined(changeWindowMinutes)
        ) {
          setPageError('Please choose how many minutes should be used to calculate changes.');
          return false;
        }
        if (selectedMetrics.includes('attendance_count')) {
          const baseline = Number(attendanceBaselineDistanceCm);
          const trigger = Number(attendanceTriggerDeltaCm);
          const hysteresis = Number(attendanceResetHysteresisCm);
          const cooldown = Number(attendanceCooldownSeconds);
          if (!Number.isFinite(baseline) || baseline <= 0) {
            setPageError('Enter the normal clear-door distance before continuing.');
            return false;
          }
          if (!Number.isFinite(trigger) || trigger <= 0) {
            setPageError('Enter a positive distance change that should count as a passage.');
            return false;
          }
          if (!Number.isFinite(hysteresis) || hysteresis < 0 || hysteresis >= trigger) {
            setPageError('The reset margin must be zero or more and smaller than the trigger distance change.');
            return false;
          }
          if (!Number.isFinite(cooldown) || cooldown <= 0) {
            setPageError('Enter a positive attendance cooldown duration.');
            return false;
          }
        }
        return true;
      case 'alerts':
        if (isHardwareContext) {
          const missingAlert = alertSettings.find((alert) => !alert.warningThreshold.trim());
          if (missingAlert) {
            setPageError(`Please set a warning level for ${missingAlert.label}.`);
            return false;
          }
        }
        return true;
      default:
        return true;
    }
  };

  const handleNextStep = () => {
    if (!validateStep(activeStep)) {
      return;
    }

    setPageError(null);
    setActiveStep((current) => Math.min(current + 1, CONFIGURATION_STEPS.length - 1));
  };

  const handlePreviousStep = () => {
    setPageError(null);
    setActiveStep((current) => Math.max(current - 1, 0));
  };

  const handleSave = async () => {
    if (!activeSensorId || !sensor) {
      return;
    }

    if (!friendlyName.trim()) {
      setPageError('Please enter a sensor name before saving.');
      return;
    }

    const selectedMetricDefinition = selectedMetrics
      .map((metricKey) =>
        getObservableMetricDefinition(
          sensor.type || navigationState?.sensorType || '',
          metricKey
        )
      )
      .find((metric): metric is ObservableMetricDefinition => Boolean(metric));

    if (selectedMetrics.length === 0) {
      setPageError('Please choose the observed metric for this sensor.');
      return;
    }

    if (!selectedMetricDefinition) {
      setPageError('The selected measurement is not supported by this sensor.');
      return;
    }

    if (selectedMetricDefinition.availability === 'planned_analytics') {
      setPageError(
        `${selectedMetricDefinition.label} can now be selected for design preview, but activation is blocked until the analytics derivation runtime is implemented.`
      );
      return;
    }

    if (!purpose.trim()) {
      setPageError('Please choose the monitoring purpose for this metric.');
      return;
    }

    if (selectedMetrics.includes('attendance_count')) {
      const baseline = Number(attendanceBaselineDistanceCm);
      const trigger = Number(attendanceTriggerDeltaCm);
      const hysteresis = Number(attendanceResetHysteresisCm);
      const cooldown = Number(attendanceCooldownSeconds);
      if (!Number.isFinite(baseline) || baseline <= 0) {
        setPageError('Enter the normal clear-door distance before activating attendance counting.');
        return;
      }
      if (!Number.isFinite(trigger) || trigger <= 0) {
        setPageError('Enter a positive distance change that should count as a passage.');
        return;
      }
      if (!Number.isFinite(hysteresis) || hysteresis < 0 || hysteresis >= trigger) {
        setPageError('The reset margin must be zero or more and smaller than the trigger distance change.');
        return;
      }
      if (!Number.isFinite(cooldown) || cooldown <= 0) {
        setPageError('Enter a positive attendance cooldown duration.');
        return;
      }
    }

    if (isHardwareContext) {
      const missingAlert = alertSettings.find((alert) => !alert.warningThreshold.trim());

      if (missingAlert) {
        setPageError(`${missingAlert.label} requires at least one warning threshold.`);
        return;
      }
    }

    setSaving(true);
    setPageError(null);
    try {
      const contextPayload = buildContextPayload();
      const resolvedSystemName =
        systemName.trim() ||
        sensor.active_config?.hardware?.system_name ||
        friendlyName.trim() ||
        'Monitoring System';
      const reports = resolvedReportsPerDay;
      const alertSettingPayload = alertSettings.map((alert) => ({
        key: alert.key,
        label: alert.label,
        metric_key: alert.metricKey,
        condition: alert.condition,
        unit: alert.unit,
        description: alert.description,
        warning_threshold: toNumberOrUndefined(alert.warningThreshold),
        critical_threshold: toNumberOrUndefined(alert.criticalThreshold),
      }));
      const metricThresholdPayload = Object.fromEntries(
        Object.entries(metricThresholdsFromAlertSettings(alertSettingPayload)).map(([metricKey, threshold]) => [
          metricKey,
          {
            min: threshold.min,
            max: threshold.max,
            warning_min: threshold.warning_min,
            warning_max: threshold.warning_max,
          },
        ])
      ) as Record<string, MetricThresholdPayload>;

      const primaryMetricKey = selectedMetricDefinition.runtime_metric_key || sensorMetrics[0]?.key;
      const primaryMetricThreshold: MetricThresholdPayload = primaryMetricKey
        ? metricThresholdPayload[primaryMetricKey] || {}
        : {};
      // Ensure every selected metric has a profile and its profile-specific settings persisted.
      const finalMetricProfiles = { ...metricPresentationProfiles };
      const finalMetricPresentationConfigs = { ...metricPresentationConfigs };
      selectedMetrics.forEach(metricKey => {
        if (!finalMetricProfiles[metricKey]) {
          const allowedProfiles = getSupportedProfilesForDerivedMetric(sensor?.type || navigationState?.sensorType || '', metricKey);
          finalMetricProfiles[metricKey] = (allowedProfiles[0] as PresentationProfileOption) || 'single_trend';
        }
        finalMetricPresentationConfigs[metricKey] = normalizePresentationConfig(
          sensor?.type || navigationState?.sensorType || '',
          metricKey,
          finalMetricProfiles[metricKey],
          finalMetricPresentationConfigs[metricKey] || {}
        );
      });

      const primaryPresentationProfile =
        finalMetricProfiles[primaryMetricKey || primaryMetric] || presentationProfile;
      const primaryPresentationConfig =
        finalMetricPresentationConfigs[primaryMetricKey || primaryMetric] || presentationConfig;
      const presentationMetadata = getPresentationMetadata(primaryPresentationProfile, useCase);
      const fullScaleDistance = toPositiveIntOrUndefined(fullScaleDistanceCm);
      const sustainedWindow = toPositiveIntOrUndefined(sustainedWindowMinutes);
      const maximumLoad = toPositiveIntOrUndefined(maximumLoadKg);
      const safeOccupancy = toPositiveIntOrUndefined(safeOccupancyPeople);
      const changeWindow = toPositiveIntOrUndefined(changeWindowMinutes);
      const existingHardwareConfig = getConfigHardware(sensor.active_config);
      const conversationalHardwareConfig: Record<string, unknown> = {
        ...existingHardwareConfig,
        readingFlowType,
        reportsPerDay: reports,
        estimatedBatteryLifeDays,
        metric_profiles: finalMetricProfiles,
        metric_presentation_configs: finalMetricPresentationConfigs,
      };

      if (fullScaleDistance !== undefined) {
        conversationalHardwareConfig.fullScaleDistanceCm = fullScaleDistance;
        conversationalHardwareConfig.tankDepthCm = fullScaleDistance;
      }

      if (sustainedWindow !== undefined) {
        conversationalHardwareConfig.sustainedWindowMinutes = sustainedWindow;
      }
      if (maximumLoad !== undefined) {
        conversationalHardwareConfig.maximumLoadKg = maximumLoad;
      }
      if (safeOccupancy !== undefined) {
        conversationalHardwareConfig.safeOccupancyPeople = safeOccupancy;
      }
      if (changeWindow !== undefined) {
        conversationalHardwareConfig.changeWindowMinutes = changeWindow;
      }
      if (selectedMetrics.includes('attendance_count')) {
        conversationalHardwareConfig.attendanceBaselineDistanceCm = Number(attendanceBaselineDistanceCm);
        conversationalHardwareConfig.attendanceTriggerDeltaCm = Number(attendanceTriggerDeltaCm);
        conversationalHardwareConfig.attendanceResetHysteresisCm = Number(attendanceResetHysteresisCm);
        conversationalHardwareConfig.attendanceCooldownSeconds = Number(attendanceCooldownSeconds);
      }

      const config: SensorConfigPayload = {
        friendly_name: friendlyName.trim(),
        use_case: useCase,
        presentation_profile: primaryPresentationProfile,
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
        hardware_config: conversationalHardwareConfig,
        hardware: {
          system_name: resolvedSystemName,
          sensor_type: sensor.type,
          sensor_name: friendlyName.trim(),
          config: conversationalHardwareConfig,
        },
        interpretation: {
          friendly_name: friendlyName.trim(),
          purpose: purpose.trim() || undefined,
          use_case: useCase,
          primary_metric: primaryMetric || primaryMetricKey || undefined,
          display_unit: selectedMetricDefinition.unit || undefined,
          // observable_metrics records every metric key the user explicitly selected
          // in the "What to Measure" step. The monitoring dashboard reads this field
          // to decide which metric cards to render. This is the source of truth.
          observable_metrics: selectedMetrics.filter(Boolean),
          derived_metrics: configurableDerivedMetrics
            .filter((metric) => selectedMetrics.includes(metric.key))
            .map((metric) => ({
            key: metric.key,
            label: metric.label,
            unit: metric.unit,
            source_metrics: [metric.runtime_metric_key],
            description: metric.description,
          })),
          thresholds: {
            min: primaryMetricThreshold.min,
            max: primaryMetricThreshold.max,
            warning_min: primaryMetricThreshold.warning_min,
            warning_max: primaryMetricThreshold.warning_max,
          },
          metric_thresholds: metricThresholdPayload,
          context: contextPayload,
        },
        presentation: {
          profile: primaryPresentationProfile,
          primary_widget: presentationMetadata.primary_widget,
          secondary_widgets: presentationMetadata.secondary_widgets,
          chart_style: presentationMetadata.chart_style,
          headline_metric: primaryPresentationConfig.headline_metric,
          status_mode: primaryPresentationConfig.status_mode,
          comparison_mode: primaryPresentationConfig.comparison_mode,
          detail_mode: primaryPresentationConfig.detail_mode,
        },
        settings: {
          alerts: alertSettingPayload,
          report_interval_per_day: reports,
          reading_flow_type: readingFlowType,
          power_management: {
            battery_life_days: estimatedBatteryLifeDays,
            sampling_frequency: reports,
          },
        },
        operational: {
          report_interval_per_day: reports,
          reading_flow_type: readingFlowType,
          power_management: {
            battery_life_days: estimatedBatteryLifeDays,
            sampling_frequency: reports,
          },
        },
      };

      if (isHardwareContext && activeControllerId) {
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
        const hardwareConfig = {
          ...conversationalHardwareConfig,
          ...flattenedMetricConfig,
        };

        // Remove any null or empty string values from the hardware config 
        // to prevent backend numeric validation errors for legacy/stale keys.
        Object.keys(hardwareConfig).forEach((key) => {
          if (hardwareConfig[key] === null || hardwareConfig[key] === '') {
            delete hardwareConfig[key];
          }
        });
        const appConfig = {
          ...config,
          hardware_config: hardwareConfig,
          hardware: {
            system_name: resolvedSystemName,
            sensor_type: sensor.type,
            sensor_name: friendlyName.trim(),
            config: hardwareConfig,
          },
        } as SensorConfigPayload;

        await saveHardwareSensorConfiguration({
          controllerId: activeControllerId,
          sensorId: activeSensorId,
          systemName: resolvedSystemName,
          sensorType: sensor.type,
          sensorName: friendlyName.trim(),
          usedFor: purpose.trim(),
          dashboardView:
            presentationProfiles.find((profile) => profile.value === primaryPresentationProfile)?.label ||
            primaryPresentationProfile,
          config: hardwareConfig,
          appConfig,
        });

        const successState = {
          configurationSaved: true,
          configuredSensorId: sensor.id,
          configuredSensorName: friendlyName.trim(),
          observationMessage: 'Three-layer configuration activated successfully.',
        };

        if (navigationState?.returnTo) {
          navigate(navigationState.returnTo, {
            replace: true,
            state: successState,
          });
          return;
        }

        navigate(`/hardware/${activeControllerId}/sensors`, {
          replace: true,
          state: successState,
        });
        return;
      }

      const response = await saveSensorConfig(activeSensorId, {
        purpose: purpose.trim(),
        context: contextPayload,
        config,
      });

      const successState = {
        configurationSaved: true,
        configuredSensorId: sensor.id,
        configuredSensorName: response.validated_config.friendly_name,
        observationMessage:
          response.observation?.message ||
          'The system is now observing live readings using the saved three-layer configuration.',
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

      navigate('/farms', {
        replace: true,
        state: {
          ...successState,
          message: 'Sensor configuration saved.',
        },
      });
    } catch (error: any) {
      setPageError(
        error.response?.data?.message ||
          (isHardwareContext ? 'Configuration save failed' : 'Failed to save configuration.')
      );
    } finally {
      setSaving(false);
    }
  };

  const renderAttendanceQuestions = () =>
    selectedMetrics.includes('attendance_count') ? (
      <Box
        sx={{
          p: 2.25,
          borderRadius: 2,
          bgcolor: '#fffdf8',
          border: '1px solid rgba(60, 57, 17, 0.08)',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          Door passage detection
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Measure the empty doorway first. A reading that changes from that baseline by the trigger
          distance counts once, then the detector waits for the doorway to clear and for the cooldown
          to finish.
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required
              type="number"
              label="Normal clear-door distance"
              value={attendanceBaselineDistanceCm}
              onChange={(event) => setAttendanceBaselineDistanceCm(event.target.value)}
              inputProps={{ min: 0, step: 'any' }}
              helperText="The stable distance recorded when nobody is in the doorway (cm)."
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required
              type="number"
              label="Passage trigger distance change"
              value={attendanceTriggerDeltaCm}
              onChange={(event) => setAttendanceTriggerDeltaCm(event.target.value)}
              inputProps={{ min: 0, step: 'any' }}
              helperText="Count when the distance moves up or down by at least this amount (cm)."
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              type="number"
              label="Reset margin"
              value={attendanceResetHysteresisCm}
              onChange={(event) => setAttendanceResetHysteresisCm(event.target.value)}
              inputProps={{ min: 0, step: 'any' }}
              helperText="Prevents noisy readings near the trigger from counting repeatedly (cm)."
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              required
              type="number"
              label="Cooldown after each count"
              value={attendanceCooldownSeconds}
              onChange={(event) => setAttendanceCooldownSeconds(event.target.value)}
              inputProps={{ min: 0.1, step: 0.1 }}
              helperText="Defaults to 2 seconds before another passage can count."
            />
          </Grid>
        </Grid>
        <Alert severity="info" sx={{ mt: 2 }}>
          The sensor must send readings frequently enough to capture a person crossing the doorway.
          One reading per second or faster is recommended for testing.
        </Alert>
      </Box>
    ) : null;

  // ===== NEW SIMPLIFIED 2-PAGE FLOW =====
  const renderSetupStep = () => (
    <Box sx={{ ...sectionSx, position: 'relative' }}>
      {/* AI ASSISTANCE BUTTON - TOP RIGHT */}
      <Box sx={{ position: 'absolute', top: -50, right: 0 }}>
          <Button
            variant="outlined"
            onClick={() => setShowAiAssistance(true)}
            sx={{
              textTransform: 'none',
              fontSize: '0.95rem',
              fontWeight: 600,
              py: 1,
              px: 2,
              borderColor: 'rgba(108, 137, 48, 0.3)',
              color: '#6c8930',
              '&:hover': {
                borderColor: '#6c8930',
                bgcolor: 'rgba(108, 137, 48, 0.06)',
              },
            }}
          >
            AI Assistance
          </Button>
      </Box>

      <Stack spacing={3}>
        {/* LEARNING PHASE INDICATOR */}
        {learningPhaseStatus?.phase === 'learning' && learningPhaseDay > 0 && learningPhaseDay <= 7 && (
          <Alert severity="info" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ fontWeight: 700 }}>Learning Phase: Day {learningPhaseDay} of 7</Box>
            <Box sx={{ fontSize: '0.85rem', opacity: 0.8 }}>
              {learningPhaseStatus.message || 'Our AI is learning from your sensor readings. On day 8, it will suggest improvements to your alert settings.'}
            </Box>
          </Alert>
        )}

        {learningPhaseStatus?.phase === 'completed' && learningPhaseStatus.feedback && (
          <Alert severity="success" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Stack spacing={1.25} sx={{ width: '100%' }}>
              <Box sx={{ fontWeight: 700 }}>Learning Complete</Box>
              <Box sx={{ fontSize: '0.9rem', opacity: 0.9 }}>
                {learningPhaseStatus.feedback.summary}
              </Box>
              {learningPhaseStatus.feedback.observations && learningPhaseStatus.feedback.observations.length > 0 && (
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                    What the 7-day report observed
                  </Typography>
                  <Box component="ul" sx={{ pl: 2.25, my: 0, fontSize: '0.85rem' }}>
                    {learningPhaseStatus.feedback.observations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </Box>
                </Box>
              )}
              {learningPhaseStatus.feedback.recommendations && learningPhaseStatus.feedback.recommendations.length > 0 && (
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                    AI recommendations
                  </Typography>
                  <Box component="ul" sx={{ pl: 2.25, my: 0, fontSize: '0.85rem' }}>
                    {learningPhaseStatus.feedback.recommendations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </Box>
                </Box>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Chip
                  size="small"
                  label={`${learningPhaseStatus.readingsCollected} readings reviewed`}
                  sx={{ width: 'fit-content' }}
                />
                <Chip
                  size="small"
                  label={`${learningPhaseStatus.alertCount} alerts in learning window`}
                  sx={{ width: 'fit-content' }}
                />
                <Chip
                  size="small"
                  label={`AI confidence ${Math.round((learningPhaseStatus.feedback.confidenceScore || 0) * 100)}%`}
                  sx={{ width: 'fit-content' }}
                />
              </Stack>
            </Stack>
          </Alert>
        )}

        {/* AI ASSISTANCE DIALOG */}
        <Dialog
          open={showAiAssistance}
          onClose={() => setShowAiAssistance(false)}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: {
              m: { xs: 1.5, sm: 3 },
              width: { xs: 'calc(100% - 24px)', sm: '100%' },
              maxHeight: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 64px)' },
              borderRadius: { xs: 2, sm: 3 },
            },
          }}
        >
          <DialogTitle
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              pb: 1,
            }}
          >
            <Typography component="span" variant="h6" sx={{ fontWeight: 700 }}>
              AI Assistance
            </Typography>
            <IconButton
              aria-label="Close AI assistance"
              onClick={() => setShowAiAssistance(false)}
              edge="end"
            >
              <Close />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ bgcolor: '#f7faf4', p: { xs: 2, sm: 2.5 } }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Describe Your Setup
            </Typography>

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Describe your monitoring setup..."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Example: I am monitoring a greenhouse with tomatoes. Temperature should stay 20 to 28 C and humidity 60 to 80 percent."
              variant="outlined"
              helperText={`${aiPrompt.length}/300 characters`}
              error={aiPrompt.length > 300}
            />
            <Button
              variant="contained"
              color="secondary"
              fullWidth
              disabled={!aiPrompt.trim() || requestingAi}
              sx={{ mt: 1.5, fontWeight: 700 }}
              onClick={() => requestAiConfiguration()}
            >
              {requestingAi ? 'Generating Configuration...' : 'Use AI to Fill Configuration'}
            </Button>

          {showAiSuggestions && aiSuggestions && (
            <Box sx={{ mt: 2.5, p: 2, borderRadius: 2, bgcolor: '#fffdf8', border: '1px solid rgba(108, 137, 48, 0.3)' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'primary.main' }}>
                ✓ AI Configuration Ready
              </Typography>

              {/* Explanation from AI */}
              {aiSuggestions.explanation && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.6, fontStyle: 'italic' }}>
                  {aiSuggestions.explanation}
                </Typography>
              )}

              {/* Configuration summary */}
              <Stack spacing={0.5} sx={{ fontSize: '0.875rem', mb: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>Metric:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{aiSuggestions.metric}</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>Purpose:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{aiSuggestions.purpose}</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>Display:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{aiSuggestions.presentationProfile}</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>Alerts:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Warning {aiSuggestions.alertThresholds.warning} | Critical {aiSuggestions.alertThresholds.critical}
                  </Typography>
                </Stack>
              </Stack>

              {/* Warnings from AI */}
              {aiSuggestions.warnings && aiSuggestions.warnings.length > 0 && (
                <Alert severity="warning" sx={{ mb: 1.5, py: 0.25 }}>
                  <Typography variant="caption">
                    {aiSuggestions.warnings.join(' • ')}
                  </Typography>
                </Alert>
              )}

              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  sx={{ fontWeight: 700 }}
                  onClick={() => {
                    applyAiSuggestionToForm(aiSuggestions, aiPrompt);
                    setShowAiSuggestions(false);
                    setShowAiAssistance(false);
                  }}
                >
                  Accept & Apply
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setShowAiSuggestions(false)}
                >
                  Discard
                </Button>
              </Stack>
            </Box>
          )}
          </DialogContent>
          <DialogActions sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5 }}>
            <Button
              onClick={() => setShowAiAssistance(false)}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>

        {/* SENSOR NAME */}
        <Box>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 1.5 }}
          >
            <Typography variant="subtitle2" sx={{ ...fieldGroupTitleSx, mb: 0 }}>
              Sensor Name
            </Typography>
            <InfoButton tooltip="Name guidance">
              Give your sensor a friendly name that helps people recognize it quickly on the dashboard, such as "Greenhouse A" or "Storage Room Temperature".
            </InfoButton>
          </Stack>
          <TextField
            fullWidth
            label="Sensor Name"
            value={friendlyName}
            onChange={(e) => setFriendlyName(e.target.value)}
            placeholder="e.g., Greenhouse A"
            required
          />
        </Box>

        {/* SENSOR INFO DISPLAY */}
        {sensorKnowledgeProfile && (
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#fffdf8', border: '1px solid rgba(60, 57, 17, 0.08)' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Your sensor
            </Typography>
            <Stack spacing={1}>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Module</Typography>
                <Typography variant="body2">{sensorKnowledgeProfile?.module_name || sensor?.type}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Can measure</Typography>
                <Typography variant="body2">{sensorKnowledgeProfile?.measures.map((m) => m.label).join(', ')}</Typography>
              </Box>
            </Stack>
          </Box>
        )}

        {/* WHAT TO MEASURE */}
        <Box>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 1.5 }}
          >
            <Typography variant="subtitle2" sx={{ ...fieldGroupTitleSx, mb: 0 }}>
              What to Measure
            </Typography>
            <InfoButton tooltip="Metric guidance">
              Pick the main value that matters most for this sensor. This choice controls the alerts, dashboard view, and AI recommendations that follow.
            </InfoButton>
          </Stack>
          <Grid container spacing={2}>
            {observableMetricCatalog.map((metric) => {
              const selected = selectedMetrics.includes(metric.key);
              const metricProfiles = getPresentationProfileDefinitions(
                sensor?.type || navigationState?.sensorType || '',
                metric.key
              );
              const activeProfile =
                metricPresentationProfiles[metric.key] ||
                (metric.recommended_profile as PresentationProfileOption) ||
                'single_trend';

              return (
                <Grid item xs={12} key={metric.key}>
                  <Box
                    onClick={() => toggleMetricSelection(metric)}
                    sx={{
                      p: 2.5,
                      borderRadius: 3,
                      border: '2px solid',
                      borderColor: selected ? 'primary.main' : 'rgba(60, 57, 17, 0.12)',
                      bgcolor: selected ? 'rgba(108, 137, 48, 0.04)' : '#fff',
                      cursor: 'pointer',
                      boxShadow: selected ? '0 8px 20px rgba(108, 137, 48, 0.08)' : 'none',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <Box display="flex" alignItems="flex-start" gap={2}>
                      <Checkbox
                        checked={selected}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleMetricSelection(metric)}
                        inputProps={{ 'aria-label': `Measure ${metric.label}` }}
                        sx={{ p: 0, '& .MuiSvgIcon-root': { fontSize: 26 } }}
                        color="primary"
                      />
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                          {metric.label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.55 }}>
                          {metric.description}
                        </Typography>
                      </Box>
                    </Box>

                    {selected && metricProfiles.length > 0 && (
                      <Box 
                        onClick={(e) => e.stopPropagation()} 
                        sx={{ 
                          mt: 1, 
                          p: 2, 
                          borderRadius: 2.5, 
                          bgcolor: '#fffdf8', 
                          border: '1px solid rgba(108, 137, 48, 0.2)',
                          cursor: 'default'
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 800, color: 'primary.main', display: 'block', mb: 1.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                          Choose Graph / Visualization
                        </Typography>
                        <Grid container spacing={2}>
                          {metricProfiles.map((profile) => {
                            const isProfileActive = activeProfile === profile.value;
                            return (
                              <Grid item xs={12} sm={6} key={profile.value}>
                                <Box
                                  onClick={() => applyPresentationProfileSelectionForMetric(metric.key, profile.value as PresentationProfileOption)}
                                  sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    border: '2px solid',
                                    borderColor: isProfileActive ? 'primary.main' : 'rgba(60, 57, 17, 0.12)',
                                    bgcolor: isProfileActive ? 'rgba(108, 137, 48, 0.08)' : '#fff',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    height: '100%',
                                    '&:hover': {
                                      borderColor: 'primary.main',
                                      bgcolor: 'rgba(108, 137, 48, 0.04)',
                                    }
                                  }}
                                >
                                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                    {profile.label}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, mb: 1.5, flexGrow: 1 }}>
                                    {profile.description}
                                  </Typography>
                                  {renderProfilePreview(profile.visualization_method, profile.visualization_label)}
                                </Box>
                              </Grid>
                            );
                          })}
                        </Grid>
                      </Box>
                    )}
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Box>

        {clarificationPrompts.length > 0 && (
          <Box>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1.5 }}
            >
              <Typography variant="subtitle2" sx={{ ...fieldGroupTitleSx, mb: 0 }}>
                One quick clarification
              </Typography>
              <InfoButton tooltip="Why is this needed?">
                Spectron can draft the setup, but it still needs a few physical details that only the installer knows, such as tank depth or how long a risky condition should persist before raising an alert.
              </InfoButton>
            </Stack>
            <Stack spacing={2}>
              {clarificationPrompts.map((prompt) => {
                const field = {
                  fullScaleDistanceCm: {
                    value: fullScaleDistanceCm,
                    onChange: setFullScaleDistanceCm,
                  },
                  sustainedWindowMinutes: {
                    value: sustainedWindowMinutes,
                    onChange: setSustainedWindowMinutes,
                  },
                  maximumLoadKg: {
                    value: maximumLoadKg,
                    onChange: setMaximumLoadKg,
                  },
                  safeOccupancyPeople: {
                    value: safeOccupancyPeople,
                    onChange: setSafeOccupancyPeople,
                  },
                  changeWindowMinutes: {
                    value: changeWindowMinutes,
                    onChange: setChangeWindowMinutes,
                  },
                }[prompt.key];

                return (
                  <Box
                    key={prompt.key}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      border: '1px solid rgba(60, 57, 17, 0.12)',
                      bgcolor: '#fffdf8',
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
                      {prompt.title}
                    </Typography>
                    <TextField
                      fullWidth
                      label={prompt.label}
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      type="number"
                      placeholder={prompt.placeholder}
                      helperText={`${prompt.helperText} (${prompt.unit})`}
                    />
                  </Box>
                );
              })}
            </Stack>
          </Box>
        )}

        {renderAttendanceQuestions()}

      </Stack>
    </Box>
  );

  const renderAlertsReviewStep = () => (
    <Box sx={sectionSx}>
      <Typography variant="subtitle1" sx={sectionTitleSx}>
        Step 4: Alerts
      </Typography>
      <InfoButton tooltip="Help">
        Set thresholds for warning and critical states. Alerts adapt to your metric and purpose.
      </InfoButton>

      {!primaryMetric ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Select a metric first to see alert options.
        </Alert>
      ) : (
        <Box sx={{ mt: 2 }}>
          {(purpose || primaryMetric) && (
            <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {selectedMetrics.map(metric => {
                const metricDef = observableMetricCatalog.find(m => m.key === metric);
                return metricDef ? (
                  <Chip key={metric} label={`Metric: ${metricDef.label}`} size="small" variant="outlined" />
                ) : null;
              })}
              {purpose && (
                <Chip label={`Purpose: ${purpose}`} size="small" variant="outlined" />
              )}
            </Box>
          )}
          <Grid container spacing={2}>
            {alertSettings.map((alert, index) => (
              <Grid item xs={12} md={6} key={`${alert.key}-${index}`}>
                <Box sx={{ p: 2.25, borderRadius: 2, bgcolor: '#fffdf8', border: '1px solid rgba(60, 57, 17, 0.08)', height: '100%' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.75 }}>
                    {selectedMetrics.length > 1 ? `${observableMetricCatalog.find(m => m.key === alert.metricKey)?.label || alert.metricKey}: ` : ''}{alert.label}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                    {alert.condition === 'below' ? 'Alert when below' : 'Alert when above'}
                  </Typography>
                  {alert.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: '0.85rem' }}>
                      {alert.description}
                    </Typography>
                  )}
                  {(() => {
                    const hwMetric = (sensorKnowledgeProfile?.readable_ranges || []).find((m: any) => m.key === alert.metricKey);
                    if (hwMetric?.minimum_value !== undefined || hwMetric?.maximum_value !== undefined) {
                      const min = hwMetric.minimum_value !== undefined ? hwMetric.minimum_value : 'N/A';
                      const max = hwMetric.maximum_value !== undefined ? hwMetric.maximum_value : 'N/A';
                      
                      // Calculate suggested thresholds (1/4 and 3/4 of range)
                      let suggestedWarning = '';
                      let suggestedCritical = '';
                      if (typeof min === 'number' && typeof max === 'number') {
                        const range = max - min;
                        if (alert.condition === 'above') {
                          suggestedCritical = `~${(max - range * 0.15).toFixed(1)}`;
                          suggestedWarning = `~${(max - range * 0.3).toFixed(1)}`;
                        } else {
                          suggestedWarning = `~${(min + range * 0.3).toFixed(1)}`;
                          suggestedCritical = `~${(min + range * 0.15).toFixed(1)}`;
                        }
                      }
                      
                      return (
                        <InfoButton tooltip="Threshold guidance">
                          <Stack spacing={0.5}>
                            <Typography variant="body2">
                              Sensor range: {min} to {max} {hwMetric.unit || ''}
                            </Typography>
                            {(suggestedWarning || suggestedCritical) && (
                              <Typography variant="body2" sx={{ fontWeight: 600, color: '#6c8930' }}>
                                Suggested values: warning {suggestedWarning} | critical {suggestedCritical}
                              </Typography>
                            )}
                          </Stack>
                        </InfoButton>
                      );
                    }
                    return null;
                  })()}
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label={alert.warningLabel}
                        type="number"
                        value={alert.warningThreshold}
                        onChange={(e) => updateAlertSetting(alert.key, 'warningThreshold', e.target.value)}
                        size="small"
                        helperText={alert.warningThreshold ? 'Set' : 'Enter a warning threshold'}
                        error={!alert.warningThreshold}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label={alert.criticalLabel}
                        type="number"
                        value={alert.criticalThreshold}
                        onChange={(e) => updateAlertSetting(alert.key, 'criticalThreshold', e.target.value)}
                        size="small"
                        helperText={alert.criticalThreshold ? 'Set' : 'Enter a critical threshold'}
                        error={!alert.criticalThreshold}
                      />
                    </Grid>
                  </Grid>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

    </Box>
  );

  const renderActiveStep = () => {
    switch (activeStepMeta.key) {
      case 'setup':
        return renderSetupStep();
      case 'alerts':
      default:
        return renderAlertsReviewStep();
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
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Card variant="outlined">
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h5">Sensor unavailable</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                  The sensor context could not be loaded. Go back and reopen it from the farm flow.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button variant="outlined" onClick={handleBack}>
                  Back
                </Button>
                <Button variant="contained" color="secondary" onClick={() => navigate('/farms')}>
                  Farm Setup
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.75, sm: 2.5, md: 3.5 },
          borderRadius: 4,
          border: '1px solid rgba(60, 57, 17, 0.1)',
          bgcolor: 'rgba(255,253,248,0.94)',
          boxShadow: '0 16px 40px rgba(60, 57, 17, 0.08)',
          overflow: 'hidden',
        }}
      >
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
            <Typography variant="h4" sx={{ ...pageTitleSx, fontSize: { xs: '1.45rem', sm: '2rem' } }}>
              Configure {sensor.type} Sensor
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              Keep the flow short. We validate each step as you go.
            </Typography>
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
            This sensor is overdue for calibration. Review the readable range and thresholds carefully
            before using them for automation.
          </Alert>
        )}



        <Box sx={{ mt: 2.5, mb: 0.5 }}>
          <Typography variant="overline" sx={pageKickerSx}>
            Step {activeStep + 1} of {CONFIGURATION_STEPS.length}
          </Typography>
          <Typography variant="h5" sx={{ ...pageTitleSx, fontSize: { xs: '1.5rem', md: '1.9rem' } }}>
            {activeStepMeta.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: { xs: 'none', sm: 'block' } }}>
            {activeStepMeta.description}
          </Typography>
        </Box>

        <Box sx={{ mt: 0.5 }}>
          {renderActiveStep()}

          <AutoDismissAlert
            open={Boolean(pageError)}
            severity="error"
            sx={{ mt: 2 }}
            onCloseAlert={() => setPageError(null)}
          >
            {pageError}
          </AutoDismissAlert>
        </Box>

        <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1.5} sx={{ mt: 3 }}>
          <Button
            variant="outlined"
            fullWidth
            disabled={activeStep === 0 || saving}
            onClick={handlePreviousStep}
          >
            Previous
          </Button>

          {activeStep < CONFIGURATION_STEPS.length - 1 ? (
            <Button
              variant="contained"
              color="secondary"
              fullWidth
              onClick={handleNextStep}
              disabled={saving}
            >
              Next
            </Button>
          ) : (
            <Button
              variant="contained"
              color="secondary"
              fullWidth
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save and Activate Configuration'}
            </Button>
          )}
        </Stack>
      </Paper>
    </Container>
  );
};

export default SensorConfig;
