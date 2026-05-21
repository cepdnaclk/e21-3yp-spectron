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
  Chip,
  Stepper,
  Step,
  StepButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  ArrowBack,
  BatteryChargingFull,
  Tune,
  ShowChart as ShowChartIcon,
  BarChart as BarChartIcon,
  Speed as SpeedIcon,
  Timeline as TimelineIcon,
  ExpandMore as ExpandMoreIcon,
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
  formatHardwareMetricRange,
  getPresentationMetadata,
  getPresentationConfigFields,
  getPresentationConfigOption,
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
  PresentationVisualizationMethod,
} from '../../utils/sensorConfig';
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
type WizardStepKey = 'about' | 'metric' | 'visualization' | 'alerts' | 'review';
type SensorConfigNavigationState = {
  returnTo?: string;
  controllerId?: string;
  sensorId?: string;
  sensorType?: string;
  sensorName?: string;
  configured?: boolean;
};

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

const getConfigReportsPerDay = (config?: SensorConfigPayload) =>
  config?.operational?.report_interval_per_day || config?.report_interval_per_day;

const getConfigReadingFlowType = (config?: SensorConfigPayload) => {
  const readingFlowType =
    config?.operational?.reading_flow_type ||
    (typeof getConfigHardware(config).readingFlowType === 'string'
      ? (getConfigHardware(config).readingFlowType as string)
      : undefined);
  return readingFlowType === 'TRIGGER' ? 'TRIGGER' : 'CONSTANT_PER_DAY';
};

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

const CONFIGURATION_STEPS: Array<{
  key: WizardStepKey;
  title: string;
  description: string;
}> = [
  {
    key: 'about',
    title: 'Sensor info',
    description: 'Review the detected hardware and give it a friendly name.',
  },
  {
    key: 'metric',
    title: 'What to measure',
    description: 'Select the most important value this sensor should report.',
  },
  {
    key: 'visualization',
    title: 'Dashboard style',
    description: 'Pick the view that makes this easy to understand.',
  },
  {
    key: 'alerts',
    title: 'Alert settings',
    description: 'Set a simple alert level and reporting frequency.',
  },
  {
    key: 'review',
    title: 'Final check',
    description: 'Quickly confirm the setup before saving.',
  },
];

type MetricPreviewSnapshot = {
  headline: string;
  comparison: string;
  detail: string;
  status: string;
};

type MetricPreviewReading = {
  label: string;
  value: string;
};

type MetricPreviewSampleData = {
  trend: number[];
  readings: MetricPreviewReading[];
  trendLabel: string;
  sampleWindowLabel: string;
  gaugePercent?: number;
};

const METRIC_PREVIEW_SNAPSHOTS: Record<string, MetricPreviewSnapshot> = {
  temperature: {
    headline: '28.4 C',
    comparison: '2.4 C above the lower comfort band',
    detail: 'The recent trend shows a gradual daytime rise.',
    status: 'Comfortable',
  },
  humidity: {
    headline: '68 %RH',
    comparison: '4 %RH above the dry threshold',
    detail: 'Humidity has remained stable through the last few readings.',
    status: 'Balanced',
  },
  temperature_spike: {
    headline: '+3.2 C / 10 min',
    comparison: 'Higher than the normal change pattern',
    detail: 'This preview highlights sudden short-window changes.',
    status: 'Rapid rise',
  },
  humidity_spike: {
    headline: '+8 %RH / 10 min',
    comparison: 'Above the expected humidity swing',
    detail: 'Useful when sudden moisture changes matter more than absolute humidity.',
    status: 'Sudden increase',
  },
  heat_index: {
    headline: '31.5 C feel-like',
    comparison: 'Feels warmer than the direct temperature reading',
    detail: 'Combines temperature and humidity into one stress-oriented metric.',
    status: 'Heat stress watch',
  },
  dew_point: {
    headline: '21.7 C',
    comparison: 'Approaching the condensation risk zone',
    detail: 'Shows when moisture may begin condensing on surfaces.',
    status: 'Condensation watch',
  },
  climate_condition: {
    headline: 'Warm and Humid',
    comparison: 'Outside the ideal comfort balance',
    detail: 'A summarized climate state for simple operator dashboards.',
    status: 'Needs attention',
  },
  distance: {
    headline: '92 cm',
    comparison: 'Within the configured monitoring corridor',
    detail: 'Useful for direct clearance or proximity review.',
    status: 'Stable distance',
  },
  fill_level: {
    headline: '76 % full',
    comparison: '16 % below the urgent service threshold',
    detail: 'The container is trending toward service capacity.',
    status: 'Near capacity',
  },
  occupancy_count: {
    headline: '18 people',
    comparison: '6 below the crowded threshold',
    detail: 'The count is rising but still under the limit.',
    status: 'Moderately busy',
  },
  attendance_count: {
    headline: '42 present',
    comparison: '3 below the session target',
    detail: 'Attendance is slightly under the expected turnout.',
    status: 'Almost on target',
  },
  fill_rate: {
    headline: '+4 % / hour',
    comparison: 'Faster than the usual refill pattern',
    detail: 'Highlights how quickly the level is changing over time.',
    status: 'Fast accumulation',
  },
  remaining_capacity_percent: {
    headline: '24 % free',
    comparison: 'Below the preferred spare-capacity band',
    detail: 'Useful for service scheduling and capacity planning.',
    status: 'Limited capacity',
  },
  occupancy_spike: {
    headline: '+7 people / 5 min',
    comparison: 'Higher than the normal entry rate',
    detail: 'Designed for rush detection rather than steady occupancy.',
    status: 'Crowd surge',
  },
  peak_occupancy: {
    headline: '53 max',
    comparison: 'Above the planned utilization peak',
    detail: 'Shows the highest crowd level reached in the chosen window.',
    status: 'Peak pressure',
  },
  weight: {
    headline: '13.6 kg',
    comparison: '2.1 kg below the heavy-load threshold',
    detail: 'Live weight remains inside the preferred operating band.',
    status: 'Within load band',
  },
  utilization_percent: {
    headline: '68 % utilized',
    comparison: '12 % below the preferred capacity ceiling',
    detail: 'Focuses on how much of the supported capacity is in use.',
    status: 'Healthy utilization',
  },
  load_change_rate: {
    headline: '-1.1 kg / hour',
    comparison: 'Faster than the normal depletion pattern',
    detail: 'Useful when rate-of-change matters more than the current weight.',
    status: 'Dropping steadily',
  },
  overload_risk: {
    headline: 'Moderate risk',
    comparison: 'Above the safe handling comfort zone',
    detail: 'Summarizes live load exposure as a risk-oriented signal.',
    status: 'Watch load',
  },
  depletion_rate: {
    headline: '-2.4 kg / day',
    comparison: 'Higher than the usual consumption pace',
    detail: 'Useful for refill planning and stock forecasting.',
    status: 'Depleting quickly',
  },
  gas_level: {
    headline: '320 ppm',
    comparison: '80 ppm below the warning threshold',
    detail: 'The live reading is elevated but still under the configured alert band.',
    status: 'Caution zone',
  },
  gas_spike: {
    headline: '+85 ppm / 5 min',
    comparison: 'Higher than the recent background change rate',
    detail: 'Highlights sudden concentration jumps for incident review.',
    status: 'Sudden gas rise',
  },
  risk_score: {
    headline: '72 / 100',
    comparison: 'Above the preferred safety score band',
    detail: 'A normalized safety view for operator dashboards.',
    status: 'Elevated risk',
  },
  exposure_state: {
    headline: 'Caution',
    comparison: 'One step above the normal safe state',
    detail: 'A traffic-light style summary of gas exposure.',
    status: 'Caution',
  },
  unsafe_duration: {
    headline: '12 min unsafe',
    comparison: 'Longer than the preferred exposure window',
    detail: 'Tracks how long the environment stays above a danger boundary.',
    status: 'Extended exposure',
  },
  aqi: {
    headline: '68 AQI',
    comparison: 'Inside the moderate air-quality band',
    detail: 'Useful for a more human-readable safety interpretation.',
    status: 'Moderate air quality',
  },
};

const getMetricPreviewSnapshot = (metricKey?: string): MetricPreviewSnapshot => {
  if (!metricKey) {
    return {
      headline: 'Preview pending',
      comparison: 'Choose an observed metric to see the end-state preview.',
      detail: 'The final preview updates as each layer is configured.',
      status: 'Not configured',
    };
  }

  return (
    METRIC_PREVIEW_SNAPSHOTS[metricKey] || {
      headline: `${getMetricLabel(metricKey)} preview`,
      comparison: 'Comparison details will follow the selected presentation mode.',
      detail: 'This preview uses the selected metric, profile, and thresholds.',
      status: 'Configured',
    }
  );
};

const getMetricPreviewSampleData = (metricKey?: string): MetricPreviewSampleData => {
  switch (metricKey) {
    case 'temperature':
    case 'temperature_spike':
    case 'heat_index':
    case 'dew_point':
    case 'climate_condition':
      return {
        trend: [38, 46, 54, 61, 68, 73, 66],
        readings: [
          { label: '08:00', value: '26.8 C' },
          { label: '10:00', value: '27.6 C' },
          { label: '12:00', value: '28.4 C' },
          { label: '14:00', value: '28.1 C' },
        ],
        trendLabel: 'Sample daytime warming pattern across the last 6 hours.',
        sampleWindowLabel: 'Sample last 6 hours',
      };
    case 'humidity':
    case 'humidity_spike':
      return {
        trend: [62, 58, 64, 67, 65, 69, 68],
        readings: [
          { label: '08:00', value: '63 %RH' },
          { label: '10:00', value: '66 %RH' },
          { label: '12:00', value: '68 %RH' },
          { label: '14:00', value: '67 %RH' },
        ],
        trendLabel: 'Sample humidity behavior with mild fluctuation through the day.',
        sampleWindowLabel: 'Sample last 6 hours',
      };
    case 'distance':
      return {
        trend: [74, 71, 69, 66, 63, 61, 60],
        readings: [
          { label: '09:00', value: '98 cm' },
          { label: '10:00', value: '95 cm' },
          { label: '11:00', value: '93 cm' },
          { label: '12:00', value: '92 cm' },
        ],
        trendLabel: 'Sample direct-distance trend showing a gradual approach.',
        sampleWindowLabel: 'Sample last 4 readings',
      };
    case 'fill_level':
    case 'fill_rate':
    case 'remaining_capacity_percent':
      return {
        trend: [42, 49, 57, 63, 69, 73, 76],
        readings: [
          { label: '07:00', value: '61 %' },
          { label: '09:00', value: '67 %' },
          { label: '11:00', value: '72 %' },
          { label: '13:00', value: '76 %' },
        ],
        trendLabel: 'Sample level build-up toward service capacity.',
        sampleWindowLabel: 'Sample last 8 hours',
        gaugePercent: metricKey === 'remaining_capacity_percent' ? 24 : 76,
      };
    case 'occupancy_count':
    case 'attendance_count':
    case 'occupancy_spike':
    case 'peak_occupancy':
      return {
        trend: [18, 24, 37, 48, 56, 52, 44],
        readings: [
          { label: '09:00', value: '12' },
          { label: '10:00', value: '16' },
          { label: '11:00', value: '18' },
          { label: '12:00', value: '15' },
        ],
        trendLabel: 'Sample crowd pattern with a mid-window rise and a slight release after the peak.',
        sampleWindowLabel: 'Sample session window',
      };
    case 'weight':
    case 'utilization_percent':
    case 'load_change_rate':
    case 'overload_risk':
    case 'depletion_rate':
      return {
        trend: [72, 70, 67, 65, 62, 59, 56],
        readings: [
          { label: '08:00', value: '15.1 kg' },
          { label: '10:00', value: '14.7 kg' },
          { label: '12:00', value: '14.1 kg' },
          { label: '14:00', value: '13.6 kg' },
        ],
        trendLabel: 'Sample inventory drawdown trend across the recent reporting window.',
        sampleWindowLabel: 'Sample last 6 hours',
        gaugePercent:
          metricKey === 'utilization_percent' ? 68 : metricKey === 'overload_risk' ? 72 : undefined,
      };
    case 'gas_level':
    case 'gas_spike':
    case 'risk_score':
    case 'exposure_state':
    case 'unsafe_duration':
    case 'aqi':
      return {
        trend: [28, 33, 38, 46, 54, 63, 58],
        readings: [
          { label: '08:00', value: '250 ppm' },
          { label: '10:00', value: '280 ppm' },
          { label: '12:00', value: '320 ppm' },
          { label: '14:00', value: '305 ppm' },
        ],
        trendLabel: 'Sample safety reading trend with a recent rise and mild recovery.',
        sampleWindowLabel: 'Sample incident window',
        gaugePercent:
          metricKey === 'risk_score' ? 72 : metricKey === 'aqi' ? 68 : undefined,
      };
    default:
      return {
        trend: [36, 41, 47, 53, 58, 62, 59],
        readings: [
          { label: 'T-3', value: 'Sample 1' },
          { label: 'T-2', value: 'Sample 2' },
          { label: 'T-1', value: 'Sample 3' },
          { label: 'Now', value: 'Sample 4' },
        ],
        trendLabel: 'Sample preview data for the selected metric.',
        sampleWindowLabel: 'Sample history',
      };
  }
};

const visualizationMethodIcon = (method?: PresentationVisualizationMethod) => {
  switch (method) {
    case 'area_trend':
      return ShowChartIcon;
    case 'gauge_band':
      return SpeedIcon;
    case 'counter_bars':
      return BarChartIcon;
    case 'event_timeline':
      return TimelineIcon;
    case 'line_trend':
    default:
      return ShowChartIcon;
  }
};

const buildMiniChartPaths = (values: number[], width = 140, height = 48) => {
  if (values.length === 0) {
    return {
      linePath: '',
      areaPath: '',
      points: [] as Array<{ x: number; y: number }>,
    };
  }

  const padding = 4;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(maxValue - minValue, 1);
  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;

  const points = values.map((value, index) => {
    const x = padding + index * stepX;
    const normalized = (value - minValue) / range;
    const y = height - padding - normalized * (height - padding * 2);
    return { x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${(height - padding).toFixed(2)} L ${points[0].x.toFixed(2)} ${(height - padding).toFixed(2)} Z`;

  return {
    linePath,
    areaPath,
    points,
  };
};

const buildMiniStepPath = (values: number[], width = 140, height = 48) => {
  if (values.length === 0) {
    return '';
  }

  const padding = 4;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(maxValue - minValue, 1);
  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;

  const points = values.map((value, index) => {
    const x = padding + index * stepX;
    const normalized = (value - minValue) / range;
    const y = height - padding - normalized * (height - padding * 2);
    return { x, y };
  });

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    path += ` L ${current.x.toFixed(2)} ${previous.y.toFixed(2)} L ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
  }

  return path;
};

const renderVisualizationMethodPreview = (
  method?: PresentationVisualizationMethod,
  active?: boolean
) => {
  const accent = active ? '#6c8930' : '#9b927d';
  const soft = active ? 'rgba(108, 137, 48, 0.12)' : 'rgba(60, 57, 17, 0.08)';

  switch (method) {
    case 'gauge_band': {
      const gaugeSparkline = buildMiniChartPaths([32, 45, 57, 63, 72]);
      return (
        <Box sx={{ mt: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Live band
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              72%
            </Typography>
          </Stack>
          <Box sx={{ mt: 0.75, height: 10, borderRadius: 999, bgcolor: soft, overflow: 'hidden' }}>
            <Box
              sx={{
                width: '72%',
                height: '100%',
                borderRadius: 999,
                background: active
                  ? 'linear-gradient(90deg, #6c8930 0%, #d39a3f 100%)'
                  : 'linear-gradient(90deg, #9b927d 0%, #c9c2b3 100%)',
              }}
            />
          </Box>
          <svg width="100%" height="36" viewBox="0 0 140 36" role="img" aria-label="Recent trend preview" style={{ marginTop: 8 }}>
            <path
              d={gaugeSparkline.areaPath}
              fill={active ? 'rgba(108, 137, 48, 0.12)' : 'rgba(155, 146, 125, 0.12)'}
              stroke="none"
            />
            <path
              d={gaugeSparkline.linePath}
              fill="none"
              stroke={accent}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </Box>
      );
    }
    case 'counter_bars':
      return (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1 }}>
            18
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="end" sx={{ mt: 1.1, height: 48 }}>
            {[38, 52, 70, 58].map((height, index) => (
              <Box
                key={index}
                sx={{
                  flex: 1,
                  borderRadius: '8px 8px 2px 2px',
                  bgcolor: index === 3 ? accent : soft,
                  height: `${height}%`,
                }}
              />
            ))}
          </Stack>
        </Box>
      );
    case 'event_timeline': {
      const eventValues = [18, 18, 44, 44, 68];
      const eventPath = buildMiniStepPath(eventValues);
      return (
        <Box sx={{ mt: 1.5 }}>
          <svg width="100%" height="52" viewBox="0 0 140 52" role="img" aria-label="Event timeline preview">
            <path d={eventPath} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" />
            {[18, 18, 44, 44, 68].map((_, index) => {
              const x = 4 + index * ((140 - 8) / 4);
              const y = index < 2 ? 44 : index < 4 ? 24 : 10;
              return <circle key={index} cx={x} cy={y} r="3" fill={index === 4 ? accent : '#c9c2b3'} />;
            })}
          </svg>
        </Box>
      );
    }
    case 'area_trend': {
      const areaChart = buildMiniChartPaths([28, 44, 58, 70, 62]);
      return (
        <Box sx={{ mt: 1.5 }}>
          <svg width="100%" height="52" viewBox="0 0 140 52" role="img" aria-label="Area trend preview">
            <path
              d={areaChart.areaPath}
              fill={active ? 'rgba(51, 122, 133, 0.20)' : 'rgba(155, 146, 125, 0.18)'}
              stroke="none"
            />
            <path
              d={areaChart.linePath}
              fill="none"
              stroke={active ? '#337a85' : accent}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </Box>
      );
    }
    case 'line_trend':
    default: {
      const lineChart = buildMiniChartPaths([20, 34, 41, 57, 50]);
      return (
        <Box sx={{ mt: 1.5 }}>
          <svg width="100%" height="52" viewBox="0 0 140 52" role="img" aria-label="Line trend preview">
            <path
              d={lineChart.linePath}
              fill="none"
              stroke={accent}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {lineChart.points.map((point, index) => (
              <circle
                key={index}
                cx={point.x}
                cy={point.y}
                r={index === lineChart.points.length - 1 ? 3.2 : 2.4}
                fill={index === lineChart.points.length - 1 ? accent : '#c9c2b3'}
              />
            ))}
          </svg>
        </Box>
      );
    }
  }
};

const renderDashboardPreviewVisualization = (
  method: PresentationVisualizationMethod | undefined,
  sampleData: MetricPreviewSampleData
) => {
  const gaugePercent =
    sampleData.gaugePercent ??
    Math.min(100, Math.max(12, Math.round(sampleData.trend[sampleData.trend.length - 1] || 0)));
  const chart = buildMiniChartPaths(sampleData.trend, 280, 96);
  const stepPath = buildMiniStepPath(sampleData.trend, 280, 96);

  switch (method) {
    case 'gauge_band':
      return (
        <Box sx={{ mt: 2.25 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Live status
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {gaugePercent}%
            </Typography>
          </Stack>
          <Box
            sx={{
              mt: 0.85,
              height: 12,
              borderRadius: 999,
              bgcolor: 'rgba(60, 57, 17, 0.08)',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                height: '100%',
                width: `${gaugePercent}%`,
                borderRadius: 999,
                background: 'linear-gradient(90deg, #6c8930 0%, #c37b2a 100%)',
              }}
            />
          </Box>
          <svg width="100%" height="92" viewBox="0 0 280 96" role="img" aria-label="Recent trend preview" style={{ marginTop: 12 }}>
            <path d={chart.areaPath} fill="rgba(108, 137, 48, 0.12)" stroke="none" />
            <path
              d={chart.linePath}
              fill="none"
              stroke="#6c8930"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </Box>
      );
    case 'counter_bars':
      return (
        <Stack direction="row" spacing={1} alignItems="end" sx={{ mt: 2.25, height: 96 }}>
          {sampleData.trend.map((point, index) => (
            <Box
              key={`counter-${index}`}
              sx={{
                flex: 1,
                minWidth: 10,
                borderRadius: '10px 10px 4px 4px',
                bgcolor: alpha('#6c8930', index === sampleData.trend.length - 1 ? 0.95 : 0.7),
                height: `${Math.max(point, 14)}%`,
              }}
            />
          ))}
        </Stack>
      );
    case 'event_timeline':
      return (
        <Box sx={{ mt: 2.25 }}>
          <svg width="100%" height="92" viewBox="0 0 280 96" role="img" aria-label="Event timeline preview">
            <path
              d={stepPath}
              fill="none"
              stroke="#c37b2a"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            {chart.points.map((point, index) => (
              <circle
                key={`event-${index}`}
                cx={point.x}
                cy={point.y}
                r={index === chart.points.length - 1 ? 4.5 : 3.4}
                fill={index === chart.points.length - 1 ? '#c37b2a' : '#e1d3bd'}
              />
            ))}
          </svg>
        </Box>
      );
    case 'area_trend':
      return (
        <Box sx={{ mt: 2.25 }}>
          <svg width="100%" height="92" viewBox="0 0 280 96" role="img" aria-label="Area trend preview">
            <path d={chart.areaPath} fill="rgba(51, 122, 133, 0.18)" stroke="none" />
            <path
              d={chart.linePath}
              fill="none"
              stroke="#337a85"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </Box>
      );
    case 'line_trend':
    default:
      return (
        <Box sx={{ mt: 2.25 }}>
          <svg width="100%" height="92" viewBox="0 0 280 96" role="img" aria-label="Line trend preview">
            <path
              d={chart.linePath}
              fill="none"
              stroke="#6c8930"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {chart.points.map((point, index) => (
              <circle
                key={`line-${index}`}
                cx={point.x}
                cy={point.y}
                r={index === chart.points.length - 1 ? 4.5 : 3.4}
                fill={index === chart.points.length - 1 ? '#6c8930' : '#d6d1c4'}
              />
            ))}
          </svg>
        </Box>
      );
  }
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
  const [useCase, setUseCase] = useState<UseCaseOption>('generic_monitoring');
  const [presentationProfile, setPresentationProfile] = useState<PresentationProfileOption>('single_trend');
  const [presentationConfig, setPresentationConfig] = useState<PresentationConfigValue>({});
  const [primaryMetric, setPrimaryMetric] = useState('');
  const [alertSettings, setAlertSettings] = useState<AlertSettingInput[]>([]);
  const [, setMetricThresholds] = useState<Record<string, MetricThresholdInput>>({});
  const [reportsPerDay, setReportsPerDay] = useState('24');
  const [readingFlowType, setReadingFlowType] = useState<'CONSTANT_PER_DAY' | 'TRIGGER'>('CONSTANT_PER_DAY');
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(new Set([0]));
  const [simpleMode, setSimpleMode] = useState(true);
  const [resolvedHardwareControllerId, setResolvedHardwareControllerId] = useState('');
  const initializedSensorIdRef = useRef<string | null>(null);
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
  const plannedObservableMetrics = useMemo(
    () => observableMetricCatalog.filter((metric) => metric.availability === 'planned_analytics'),
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
  const selectedPresentationDefinition = useMemo(
    () => presentationProfiles.find((profile) => profile.value === presentationProfile),
    [presentationProfile, presentationProfiles]
  );
  const presentationConfigFields = useMemo(
    () =>
      getPresentationConfigFields(
        sensor?.type || navigationState?.sensorType || '',
        primaryMetric,
        presentationProfile
      ),
    [navigationState?.sensorType, presentationProfile, primaryMetric, sensor?.type]
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
  const metricPreviewSnapshot = useMemo(
    () => getMetricPreviewSnapshot(primaryMetric),
    [primaryMetric]
  );
  const metricPreviewSampleData = useMemo(
    () => getMetricPreviewSampleData(primaryMetric),
    [primaryMetric]
  );
  const estimatedBatteryLifeDays = estimateBatteryLifeDays(
    parseInt(reportsPerDay, 10) || 1,
    sensorMetrics.length,
    readingFlowType
  );
  const showInterpretationContext = false;
  const activeStepMeta = CONFIGURATION_STEPS[activeStep];

  useEffect(() => {
    setVisitedSteps((current) => new Set(current).add(activeStep));
  }, [activeStep]);

  // Persist draft config locally so users can navigate away and return without losing work
  useEffect(() => {
    if (!activeSensorId) return;
    const key = `sensorConfigDraft-${activeSensorId}`;
    const draft = {
      friendlyName,
      primaryMetric,
      presentationProfile,
      presentationConfig,
      alertSettings,
      reportsPerDay,
      readingFlowType,
      purpose,
      simpleMode,
    };
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch (e) {
      // ignore storage errors
    }
  }, [activeSensorId, friendlyName, primaryMetric, presentationProfile, presentationConfig, alertSettings, reportsPerDay, readingFlowType, purpose, simpleMode]);

  useEffect(() => {
    if (!activeSensorId) return;
    const key = `sensorConfigDraft-${activeSensorId}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.friendlyName) setFriendlyName(draft.friendlyName);
      if (draft.primaryMetric) setPrimaryMetric(draft.primaryMetric);
      if (draft.presentationProfile) setPresentationProfile(draft.presentationProfile);
      if (draft.presentationConfig) setPresentationConfig(draft.presentationConfig);
      if (Array.isArray(draft.alertSettings)) setAlertSettings(draft.alertSettings);
      if (draft.reportsPerDay) setReportsPerDay(draft.reportsPerDay);
      if (draft.readingFlowType) setReadingFlowType(draft.readingFlowType);
      if (draft.purpose) setPurpose(draft.purpose);
      if (typeof draft.simpleMode === 'boolean') setSimpleMode(draft.simpleMode);
    } catch (e) {
      // ignore parse errors
    }
  }, [activeSensorId]);

  const handleBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
      return;
    }

    if (isHardwareContext && activeControllerId) {
      navigate(`/hardware/${activeControllerId}/sensors`);
      return;
    }

    if (sensor?.controller_id) {
      navigate(`/controllers/${sensor.controller_id}`);
      return;
    }

    navigate('/controllers');
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

  const updatePresentationConfig = (
    key: keyof PresentationConfigValue,
    value: string
  ) => {
    setPresentationConfig((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const applyMetricSelection = (metric: ObservableMetricDefinition) => {
    const nextProfile = metric.recommended_profile as PresentationProfileOption;
    setPrimaryMetric(metric.key);
    setUseCase(metric.use_case);
    setPresentationProfile(nextProfile);
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
  };

  const applyPresentationProfileSelection = (profile: PresentationProfileOption) => {
    setPresentationProfile(profile);
    setPresentationConfig(
      normalizePresentationConfig(
        sensor?.type || navigationState?.sensorType || '',
        primaryMetric,
        profile,
        {}
      )
    );
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
      const nextAlerts = buildPresentationAlertSettings(
        sensorType,
        primaryMetric,
        presentationProfile,
        currentAlerts,
        metricThresholdsFromAlertSettings(currentAlerts)
      ).map(toAlertSettingInput);

      setMetricThresholds(alertInputsToMetricThresholds(nextAlerts));
      return nextAlerts;
    });
  }, [navigationState?.sensorType, presentationProfile, primaryMetric, selectedDerivedMetric, sensor?.type]);

  useEffect(() => {
    const sensorType = sensor?.type || navigationState?.sensorType || '';
    setPresentationConfig((current) =>
      normalizePresentationConfig(sensorType, primaryMetric, presentationProfile, current)
    );
  }, [navigationState?.sensorType, presentationProfile, primaryMetric, sensor?.type]);

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
        setPurpose(getConfigPurpose(activeConfig) || sensorData.purpose || defaultPurposeLabel);
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
        setReportsPerDay(getConfigReportsPerDay(activeConfig)?.toString() || '24');
        setReadingFlowType(getConfigReadingFlowType(activeConfig));
        setUseCase(configuredUseCase);
        setPresentationProfile(configuredProfile);
        setPresentationConfig(
          normalizePresentationConfig(sensorData.type || '', configuredMetric?.key, configuredProfile, {
            headline_metric: activeConfig?.presentation?.headline_metric,
            status_mode: activeConfig?.presentation?.status_mode,
            comparison_mode: activeConfig?.presentation?.comparison_mode,
            detail_mode: activeConfig?.presentation?.detail_mode,
          })
        );
        setPrimaryMetric(configuredMetric?.key || '');

        const baseThresholds = { ...(getConfigMetricThresholds(activeConfig) || {}) };
        if (metrics.length === 1 && metrics[0]?.key && !baseThresholds[metrics[0].key]) {
          const primaryThreshold = getConfigThresholds(activeConfig);
          if (primaryThreshold) {
            baseThresholds[metrics[0].key] = primaryThreshold;
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
  ]);

  useEffect(() => {
    initializedSensorIdRef.current = null;
    setActiveStep(0);
    setPageError(null);
  }, [activeSensorId]);

  useEffect(() => {
    if (observableMetricCatalog.length === 0) {
      return;
    }

    if (!observableMetricCatalog.some((metric) => metric.key === primaryMetric)) {
      const fallbackMetric = supportedObservableMetrics[0] || observableMetricCatalog[0];
      setPrimaryMetric(fallbackMetric.key);
      setUseCase(fallbackMetric.use_case);
      setPresentationProfile(fallbackMetric.recommended_profile);
      if (!purpose.trim()) {
        setPurpose(fallbackMetric.purposes[0]?.label || '');
      }
    }
  }, [observableMetricCatalog, primaryMetric, purpose, supportedObservableMetrics]);

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
  }, [allowedPresentationProfiles, presentationProfile]);

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
  }, [allowedPresentationProfiles, presentationProfile, primaryMetric, selectedDerivedMetric, sensor?.type]);

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

  const validateStep = (stepIndex: number) => {
    switch (CONFIGURATION_STEPS[stepIndex]?.key) {
      case 'about':
        if (!friendlyName.trim()) {
          setPageError('Please enter a sensor name to continue.');
          return false;
        }
        return true;
      case 'metric':
        if (!selectedDerivedMetric) {
          setPageError('Please choose the observed metric for this sensor.');
          return false;
        }
        if (!purpose.trim()) {
          setPageError('Please choose the monitoring purpose for this metric.');
          return false;
        }
        return true;
      case 'visualization':
        if (!presentationProfile.trim()) {
          setPageError('Please choose how the dashboard should show this metric.');
          return false;
        }
        return true;
      case 'alerts':
        if (readingFlowType !== 'TRIGGER' && !toPositiveIntOrUndefined(reportsPerDay)) {
          setPageError('Reports per day is required.');
          return false;
        }
        if (isHardwareContext) {
          const missingAlert = alertSettings.find((alert) => !alert.warningThreshold.trim());
          if (missingAlert) {
            setPageError(`${missingAlert.label} requires at least one warning threshold.`);
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

    if (!selectedDerivedMetric) {
      setPageError('Please choose the observed metric for this sensor.');
      return;
    }

    if (selectedDerivedMetric.availability === 'planned_analytics') {
      setPageError(
        `${selectedDerivedMetric.label} can now be selected for design preview, but activation is blocked until the analytics derivation runtime is implemented.`
      );
      return;
    }

    if (!purpose.trim()) {
      setPageError('Please choose the monitoring purpose for this metric.');
      return;
    }

    if (readingFlowType !== 'TRIGGER' && !toPositiveIntOrUndefined(reportsPerDay)) {
      setPageError('Reports per day is required.');
      return;
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
      const reports = readingFlowType === 'TRIGGER' ? 1 : (reportsPerDay ? parseInt(reportsPerDay, 10) : 24);
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

      const primaryMetricKey = selectedDerivedMetric?.runtime_metric_key || sensorMetrics[0]?.key;
      const primaryMetricThreshold: MetricThresholdPayload = primaryMetricKey
        ? metricThresholdPayload[primaryMetricKey] || {}
        : {};

      const presentationMetadata = getPresentationMetadata(presentationProfile, useCase);

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
        hardware: {
          system_name: resolvedSystemName,
          sensor_type: sensor.type,
          sensor_name: friendlyName.trim(),
          config: getConfigHardware(sensor.active_config),
        },
        interpretation: {
          friendly_name: friendlyName.trim(),
          purpose: purpose.trim() || undefined,
          use_case: useCase,
          primary_metric: primaryMetric || primaryMetricKey || undefined,
          display_unit: selectedDerivedMetric.unit || undefined,
          derived_metrics: configurableDerivedMetrics.map((metric) => ({
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
          profile: presentationProfile,
          primary_widget: presentationMetadata.primary_widget,
          secondary_widgets: presentationMetadata.secondary_widgets,
          chart_style: presentationMetadata.chart_style,
          headline_metric: presentationConfig.headline_metric,
          status_mode: presentationConfig.status_mode,
          comparison_mode: presentationConfig.comparison_mode,
          detail_mode: presentationConfig.detail_mode,
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
          ...flattenedMetricConfig,
          readingFlowType,
          reportsPerDay: reports,
          estimatedBatteryLifeDays,
        };
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
            presentationProfiles.find((profile) => profile.value === presentationProfile)?.label ||
            presentationProfile,
          config: hardwareConfig,
          appConfig,
        });

        navigate(`/hardware/${activeControllerId}/sensors`, {
          replace: true,
          state: {
            configurationSaved: true,
            configuredSensorId: sensor.id,
            configuredSensorName: friendlyName.trim(),
            observationMessage: 'Three-layer configuration activated successfully.',
          },
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

      navigate(`/controllers/${sensor.controller_id}`, {
        replace: true,
        state: successState,
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

  const renderAboutStep = () => (
    <Box sx={sectionSx}>
      <Typography variant="subtitle1" sx={sectionTitleSx}>
        Step 1: About Sensor
      </Typography>
      <Typography variant="body2" sx={sectionIntroSx}>
        Layer 1 is already detected for you. Just review the sensor details and give it a clear name.
      </Typography>

      <TextField
        fullWidth
        label="Sensor Name"
        value={friendlyName}
        onChange={(e) => setFriendlyName(e.target.value)}
        margin="normal"
        required
      />

      <Box sx={{ mt: 2.5, p: 2.25, borderRadius: 2, bgcolor: '#fffaf0', border: '1px solid rgba(60, 57, 17, 0.08)' }}>
        <Typography variant="subtitle2" sx={fieldGroupTitleSx}>
          Detected Physical Sensor
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="caption" sx={captionTextSx}>Module</Typography>
            <Typography variant="body1">
              {sensorKnowledgeProfile?.module_name || sensor?.name || sensor?.type || navigationState?.sensorType}
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="caption" sx={captionTextSx}>Sensor Family</Typography>
            <Typography variant="body1">
              {sensorKnowledgeProfile?.sensor_family || sensor?.type || navigationState?.sensorType}
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="caption" sx={captionTextSx}>What It Measures</Typography>
            <Typography variant="body1">
              {sensorKnowledgeProfile?.measures.map((measure) => measure.label).join(', ') || sensor?.type || navigationState?.sensorType}
            </Typography>
          </Grid>
        </Grid>

        <Typography variant="subtitle2" sx={{ ...fieldGroupTitleSx, mt: 3 }}>
          Readable Range and Accuracy
        </Typography>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {(sensorKnowledgeProfile?.readable_ranges || []).map((metric) => (
            <Grid item xs={12} md={6} key={metric.key}>
              <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#fffdf8', border: '1px solid rgba(60, 57, 17, 0.08)', height: '100%' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {metric.label}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  Range: {formatHardwareMetricRange(metric)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  Accuracy: {metric.accuracy || 'Module-specific accuracy is not yet pinned in the current catalog.'}
                </Typography>
                {metric.notes && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    {metric.notes}
                  </Typography>
                )}
              </Box>
            </Grid>
          ))}
        </Grid>

        {sensorKnowledgeProfile?.common_use_cases?.length ? (
          <>
            <Typography variant="subtitle2" sx={{ ...fieldGroupTitleSx, mt: 3 }}>
              Common Use Cases
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {sensorKnowledgeProfile.common_use_cases.map((useCaseLabel) => (
                <Chip key={useCaseLabel} label={useCaseLabel} variant="outlined" />
              ))}
            </Stack>
          </>
        ) : null}
      </Box>
    </Box>
  );

  const renderMetricStep = () => (
    <Box sx={sectionSx}>
      <Typography variant="subtitle1" sx={sectionTitleSx}>
        Step 2: Observable Metric
      </Typography>
      <Typography variant="body2" sx={sectionIntroSx}>
        Choose what the customer wants to watch from this sensor.
      </Typography>
      <Typography variant="caption" sx={captionTextSx}>
        {supportedObservableMetrics.length} supported now, {plannedObservableMetrics.length} planned analytics.
      </Typography>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        {observableMetricCatalog.map((metric) => {
          const selected = metric.key === primaryMetric;
          const availableNow = metric.availability === 'supported_now';

          return (
            <Grid item xs={12} md={6} lg={4} key={metric.key}>
              <Box
                onClick={() => applyMetricSelection(metric)}
                sx={{
                  p: 2.25,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: selected ? 'primary.main' : 'rgba(60, 57, 17, 0.12)',
                  bgcolor: selected ? 'rgba(108, 137, 48, 0.08)' : '#fffdf8',
                  height: '100%',
                  cursor: 'pointer',
                  boxShadow: selected ? '0 12px 22px rgba(108, 137, 48, 0.14)' : 'none',
                }}
              >
                <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    {metric.label}
                    {metric.unit ? ` (${metric.unit})` : ''}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Chip
                      size="small"
                      color={availableNow ? 'primary' : 'default'}
                      label={availableNow ? 'Available now' : 'Preview only'}
                    />
                    {selected && <Chip size="small" color="secondary" label="Selected" />}
                  </Stack>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {metric.description}
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
                  {metric.purposes.slice(0, 3).map((option) => (
                    <Chip key={option.key} size="small" variant="outlined" label={option.label} />
                  ))}
                </Stack>
              </Box>
            </Grid>
          );
        })}
      </Grid>

      {plannedObservableMetrics.length > 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Some advanced metrics can be previewed here, but they still need backend analytics before they can be activated.
        </Alert>
      )}

      {selectedDerivedMetric && (
        <Box sx={{ mt: 3, p: 2.25, borderRadius: 2, bgcolor: '#fffdf8', border: '1px solid rgba(60, 57, 17, 0.08)' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                Selected Metric
              </Typography>
              <Typography variant="body1" sx={{ mt: 0.35 }}>
                {selectedDerivedMetric.label}
                {selectedDerivedMetric.unit ? ` (${selectedDerivedMetric.unit})` : ''}
              </Typography>
            </Box>
            <Chip
              size="small"
              color={selectedDerivedMetric.availability === 'planned_analytics' ? 'warning' : 'success'}
              label={selectedDerivedMetric.availability === 'planned_analytics' ? 'Preview only' : 'Ready to activate'}
            />
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {selectedDerivedMetric.description}
          </Typography>

          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel id="purpose-label">Monitoring Purpose</InputLabel>
            <Select
              labelId="purpose-label"
              value={purpose}
              label="Monitoring Purpose"
              onChange={(e) => setPurpose(e.target.value)}
            >
              {purposeOptions.map((option) => (
                <MenuItem key={option.key} value={option.label}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" sx={captionTextSx}>
            {purposeOptions.find((option) => option.label === purpose)?.description ||
              'Choose why this metric is being monitored.'}
          </Typography>
        </Box>
      )}

      {showInterpretationContext && (
        <>
          <Typography variant="subtitle2" sx={{ ...fieldGroupTitleSx, mt: 3 }}>
            Interpretation Context
          </Typography>
          <Typography variant="body2" sx={fieldGroupIntroSx}>
            These optional fields help preserve the environment and deployment meaning around the
            selected metric and purpose.
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
                helperText="Stored as part of the interpretation layer for later review."
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
        </>
      )}
    </Box>
  );

  const renderVisualizationStep = () => (
    <Box sx={sectionSx}>
      <Typography variant="subtitle1" sx={sectionTitleSx}>
        Step 3: Visualization
      </Typography>
      <Typography variant="body2" sx={sectionIntroSx}>
        Choose how this metric should look on the dashboard.
      </Typography>

      <Grid container spacing={2} sx={{ mt: 2 }}>
        {presentationProfiles
          .filter((profile) => allowedPresentationProfiles.includes(profile.value))
          .map((profile) => {
            const active = presentationProfile === profile.value;
            const VisualizationIcon = visualizationMethodIcon(profile.visualization_method);
            return (
              <Grid item xs={12} md={6} lg={4} key={profile.value}>
                <Box
                  onClick={() => applyPresentationProfileSelection(profile.value)}
                  sx={{
                    p: 2.25,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: active ? 'primary.main' : 'rgba(60, 57, 17, 0.12)',
                    bgcolor: active ? 'rgba(108, 137, 48, 0.08)' : '#fffdf8',
                    boxShadow: active ? '0 12px 22px rgba(108, 137, 48, 0.14)' : 'none',
                    cursor: 'pointer',
                    height: '100%',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                    <Stack direction="row" spacing={1.1} alignItems="center">
                      <Box
                        sx={{
                          p: 1,
                          borderRadius: 2,
                          bgcolor: active ? 'rgba(108, 137, 48, 0.14)' : 'rgba(60, 57, 17, 0.08)',
                          color: active ? 'primary.main' : 'text.secondary',
                          display: 'inline-flex',
                        }}
                      >
                        <VisualizationIcon fontSize="small" />
                      </Box>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                          {profile.visualization_label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {profile.label}
                        </Typography>
                      </Box>
                    </Stack>
                    {active && <Chip size="small" color="primary" label="Selected" />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {profile.description}
                  </Typography>
                  {renderVisualizationMethodPreview(profile.visualization_method, active)}
                </Box>
              </Grid>
            );
          })}
      </Grid>

      {presentationConfigFields.length > 0 && (
        <Accordion
          disableGutters
          elevation={0}
          sx={{
            mt: 2.5,
            borderRadius: 2,
            bgcolor: '#fffdf8',
            border: '1px solid rgba(60, 57, 17, 0.08)',
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box>
              <Typography variant="subtitle2" sx={fieldGroupTitleSx}>
                Advanced dashboard options
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Optional. The default dashboard style is already selected for you.
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Grid container spacing={2}>
              {presentationConfigFields.map((field) => (
                <Grid item xs={12} md={6} key={field.key}>
                  <FormControl fullWidth>
                    <InputLabel id={`${field.key}-label`}>{field.label}</InputLabel>
                    <Select
                      labelId={`${field.key}-label`}
                      value={presentationConfig[field.key] || ''}
                      label={field.label}
                      onChange={(event) =>
                        updatePresentationConfig(field.key, event.target.value)
                      }
                    >
                      {field.options.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Typography variant="caption" sx={captionTextSx}>
                    {getPresentationConfigOption(
                      sensor?.type || navigationState?.sensorType || '',
                      primaryMetric,
                      presentationProfile,
                      field.key,
                      presentationConfig[field.key]
                    )?.description || field.description}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );

  const renderAlertsStep = () => (
    <Box sx={sectionSx}>
      <Typography variant="subtitle1" sx={sectionTitleSx}>
        Step 4: Alerts
      </Typography>
      <Typography variant="body2" sx={sectionIntroSx}>
        Set the alert values and choose how often this sensor should report.
      </Typography>

      {!primaryMetric ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Alerts depend on the selected main metric and use case. Please choose "What to measure" first to see relevant alert options.
        </Alert>
      ) : (
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {alertSettings.map((alert) => (
            <Grid item xs={12} md={6} key={alert.key}>
              <Box sx={{ p: 2.25, borderRadius: 2, bgcolor: '#fffdf8', border: '1px solid rgba(60, 57, 17, 0.08)', height: '100%' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {alert.label}
                </Typography>
                <Typography variant="caption" sx={captionTextSx}>
                  {sensorMetrics.find((metric) => metric.key === alert.metricKey)?.label || alert.metricKey}
                  {alert.unit ? ` (${alert.unit})` : ''} | {alert.condition === 'below' ? 'Lower-bound alert' : 'Upper-bound alert'}
                </Typography>
                {alert.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {alert.description}
                  </Typography>
                )}
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label={alert.warningLabel}
                      type="number"
                      value={alert.warningThreshold}
                      onChange={(e) => updateAlertSetting(alert.key, 'warningThreshold', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label={alert.criticalLabel}
                      type="number"
                      value={alert.criticalThreshold}
                      onChange={(e) => updateAlertSetting(alert.key, 'criticalThreshold', e.target.value)}
                      helperText="Optional, but recommended for escalations."
                    />
                  </Grid>
                </Grid>
              </Box>
            </Grid>
          ))}
        </Grid>
      )}

      {simpleMode ? (
        <Accordion
          disableGutters
          elevation={0}
          sx={{ mt: 3, borderRadius: 2, bgcolor: '#fffdf8', border: '1px solid rgba(60, 57, 17, 0.08)', '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box>
              <Typography variant="subtitle2" sx={fieldGroupTitleSx}>
                Reporting & Power Settings
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Optional. Expand to adjust reporting frequency or power settings.
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
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
            />
            <TextField
              fullWidth
              label="Estimated Battery Life (Days)"
              type="number"
              value={estimatedBatteryLifeDays.toString()}
              margin="normal"
              InputProps={{ readOnly: true }}
            />
          </AccordionDetails>
        </Accordion>
      ) : (
        <>
          <Typography
            variant="subtitle2"
            sx={{ ...fieldGroupTitleSx, mt: 3, pt: 2.25, borderTop: '1px solid rgba(60, 57, 17, 0.08)' }}
          >
            Reporting & Power Settings
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
        </>
      )}
    </Box>
  );

  const renderReviewStep = () => (
    <Box sx={sectionSx}>
      <Typography variant="subtitle1" sx={sectionTitleSx}>
        Step 5: Review
      </Typography>
      <Typography variant="body2" sx={sectionIntroSx}>
        This is how the sensor card will look in Monitoring after you save it.
      </Typography>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
        <Chip size="small" variant="outlined" label={friendlyName || 'Unnamed sensor'} />
        {selectedDerivedMetric && <Chip size="small" variant="outlined" label={selectedDerivedMetric.label} />}
        <Chip
          size="small"
          variant="outlined"
          label={selectedPresentationDefinition?.visualization_label || selectedPresentationDefinition?.label || 'Visualization'}
        />
        <Chip
          size="small"
          variant="outlined"
          label={readingFlowType === 'TRIGGER' ? 'Trigger-based readings' : `${reportsPerDay || '24'} reports/day`}
        />
      </Stack>

      <Box sx={{ mt: 3, p: 2, borderRadius: 2, bgcolor: '#f6f7fb' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Alert configuration
        </Typography>
        {alertSettings.length > 0 ? (
          <Stack spacing={1}>
            {alertSettings.map((alert) => (
              <Box key={alert.key} sx={{ p: 1.25, borderRadius: 1, bgcolor: '#ffffff', border: '1px solid rgba(60, 57, 17, 0.08)' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {alert.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {alert.condition === 'below' ? 'Lower-bound' : 'Upper-bound'} alert for {sensorMetrics.find((metric) => metric.key === alert.metricKey)?.label || alert.metricKey}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  Warning: {alert.warningThreshold || 'Not set'}{alert.unit ? ` ${alert.unit}` : ''}
                  {alert.criticalThreshold ? ` • Critical: ${alert.criticalThreshold}${alert.unit ? ` ${alert.unit}` : ''}` : ''}
                </Typography>
              </Box>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No alert values were configured.
          </Typography>
        )}
      </Box>

      {selectedDerivedMetric?.availability === 'planned_analytics' && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          `{selectedDerivedMetric.label}` is preview only for now.
        </Alert>
      )}

      <Box sx={{ mt: 2, p: 2.25, borderRadius: 2, bgcolor: '#f6f8ef', border: '1px solid rgba(108, 137, 48, 0.16)' }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
        >
          <Box>
            <Typography variant="overline" color="secondary" fontWeight={800}>
              {friendlyName || sensor?.name || sensorKnowledgeProfile?.module_name || 'Sensor'}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 900, lineHeight: 1.1 }}>
              {metricPreviewSnapshot.headline}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {purpose || selectedDerivedMetric?.label || 'Dashboard view'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip
              size="small"
              variant="outlined"
              label={selectedPresentationDefinition?.visualization_label || selectedPresentationDefinition?.label || 'Visualization'}
            />
            <Chip
              size="small"
              color={selectedDerivedMetric?.availability === 'planned_analytics' ? 'warning' : 'success'}
              label={selectedDerivedMetric?.availability === 'planned_analytics' ? 'Preview only' : metricPreviewSnapshot.status}
            />
          </Stack>
        </Stack>

        {renderDashboardPreviewVisualization(
          selectedPresentationDefinition?.visualization_method,
          metricPreviewSampleData
        )}
      </Box>
    </Box>
  );

  const renderActiveStep = () => {
    switch (activeStepMeta.key) {
      case 'about':
        return renderAboutStep();
      case 'metric':
        return renderMetricStep();
      case 'visualization':
        return renderVisualizationStep();
      case 'alerts':
        return renderAlertsStep();
      case 'review':
      default:
        return renderReviewStep();
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
            This sensor is overdue for calibration. Review the readable range and thresholds carefully
            before using them for automation.
          </Alert>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          Only a few simple choices are needed to set this up.
        </Alert>

        <Box sx={{ mt: 3, p: { xs: 1.5, md: 2 }, borderRadius: 2, bgcolor: '#fffdf8', border: '1px solid rgba(60, 57, 17, 0.08)' }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {CONFIGURATION_STEPS.map((step, index) => (
              <Step key={step.key}>
                <StepButton
                  disabled={!visitedSteps.has(index)}
                  onClick={() => visitedSteps.has(index) && setActiveStep(index)}
                >
                  {step.title}
                </StepButton>
              </Step>
            ))}
          </Stepper>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <FormControlLabel
              control={<Switch checked={simpleMode} onChange={(e) => setSimpleMode(e.target.checked)} />}
              label={simpleMode ? 'Simple mode' : 'Expert mode'}
            />
          </Box>
        </Box>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2.5 }}>
          <Chip size="small" variant="outlined" label={friendlyName || 'Name not set'} />
          {selectedDerivedMetric && <Chip size="small" variant="outlined" label={selectedDerivedMetric.label} />}
          {selectedPresentationDefinition && (
            <Chip size="small" variant="outlined" label={selectedPresentationDefinition.visualization_label} />
          )}
        </Stack>

        <Box sx={{ mt: 2.5, mb: 0.5 }}>
          <Typography variant="overline" sx={pageKickerSx}>
            Step {activeStep + 1} of {CONFIGURATION_STEPS.length}
          </Typography>
          <Typography variant="h5" sx={{ ...pageTitleSx, fontSize: { xs: '1.5rem', md: '1.9rem' } }}>
            {activeStepMeta.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {activeStepMeta.description}
          </Typography>
        </Box>

        {renderActiveStep()}

        {activeStepMeta.key === 'review' && (
          <Alert severity="info" sx={{ mt: 3 }}>
            Saving activates this configuration immediately. Future readings will follow this layered
            setup unless you customize it again.
          </Alert>
        )}

        <AutoDismissAlert open={Boolean(pageError)} severity="error" sx={{ mt: 2 }} onCloseAlert={() => setPageError(null)}>
          {pageError}
        </AutoDismissAlert>

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
