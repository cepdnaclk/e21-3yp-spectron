import api from './api';
import { API_ENDPOINTS } from '../config/api';
import {
  SensorConfig,
  SensorContext,
} from './sensorService';

export type AIFollowUpAnswers = Record<string, string>;

export interface AIFollowUpQuestion {
  id: string;
  question: string;
  placeholder?: string;
}

export interface ConfigurationAiSuggestionRequest {
  description: string;
  sensorId: string;
  sensorType?: string;
  controllerId?: string;
  context?: SensorContext;
  followUpAnswers?: AIFollowUpAnswers;
  desiredBatteryLifeDays?: number;
  samplingPreferences?: {
    frequency?: 'low' | 'medium' | 'high';
  };
}

interface AiSuggestPayload {
  purpose: string;
  context?: SensorContext;
  desired_battery_life_days?: number;
  sampling_preferences?: {
    frequency?: 'low' | 'medium' | 'high';
  };
  follow_up_answers?: AIFollowUpAnswers;
}

export interface ConfigurationAiSuggestionResponse {
  suggested_config: SensorConfig;
  validated_config: SensorConfig;
  explanation: string;
  validation_status: string;
  warnings?: string[];
  applied_rules?: string[];
  confidence_score: number;
  requires_user_confirmation: boolean;
  needs_follow_up?: boolean;
  follow_up_questions?: AIFollowUpQuestion[];
}

export interface LearningPhaseThresholds {
  min?: number;
  max?: number;
  warning_min?: number;
  warning_max?: number;
}

export interface LearningPhaseSummary {
  windowDays: number;
  primaryMetric: string;
  readingsCollected: number;
  reportIntervalPerDay?: number;
  currentThresholds: LearningPhaseThresholds;
  alertCount: number;
  warningAlertCount: number;
  criticalAlertCount: number;
  minimumValue?: number;
  maximumValue?: number;
  averageValue?: number;
  latestValue?: number;
  firstValue?: number;
  trendDelta?: number;
}

export interface LearningPhaseFeedback {
  source: string;
  model?: string;
  generatedAt?: string;
  summary: string;
  observations?: string[];
  recommendations?: string[];
  suggestedThresholds?: LearningPhaseThresholds;
  suggestedReportIntervalPerDay?: number;
  confidenceScore: number;
}

export interface LearningPhaseStatusResponse {
  phase: string;
  dayNumber: number;
  requiredDays: number;
  startedAt?: string;
  completedAt?: string;
  lastReadingAt?: string;
  readingsCollected: number;
  alertCount: number;
  feedbackReady: boolean;
  message?: string;
  summary?: LearningPhaseSummary;
  feedback?: LearningPhaseFeedback;
}

const hardwareAiSuggestEndpoint = (controllerId: string, sensorId: string) => (
  `/api/controllers/${encodeURIComponent(controllerId)}/sensors/${encodeURIComponent(sensorId)}/ai-suggest-config`
);

const MOCK_AI_STORAGE_KEY = 'spectron.mockAi';

const buildAiSuggestPayload = (request: ConfigurationAiSuggestionRequest): AiSuggestPayload => ({
  purpose: request.description.trim(),
  context: request.context,
  desired_battery_life_days: request.desiredBatteryLifeDays,
  sampling_preferences: request.samplingPreferences,
  follow_up_answers: request.followUpAnswers,
});

const isMockAiEnabled = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const stored = window.localStorage.getItem(MOCK_AI_STORAGE_KEY);
    if (stored && ['1', 'true', 'on', 'yes'].includes(stored.toLowerCase())) {
      return true;
    }
  } catch {
    // ignore storage access issues
  }

  return new URLSearchParams(window.location.search).get('mockAi') === '1';
};

const buildMockSensorSuggestion = (
  request: ConfigurationAiSuggestionRequest,
): ConfigurationAiSuggestionResponse => {
  const sensorType = (request.sensorType || 'temperature_humidity').toLowerCase();
  const description = request.description.trim() || 'Monitor crop conditions';
  const generatedAt = '2026-08-03T09:00:00.000Z';

  const baseConfig = (
    friendlyName: string,
    useCase: string,
    presentationProfile: string,
    primaryMetric: string,
    metricThresholds: NonNullable<SensorConfig['metric_thresholds']>,
    alerts: NonNullable<NonNullable<SensorConfig['settings']>['alerts']>,
    hardwareConfig?: Record<string, unknown>,
  ): SensorConfig => ({
    friendly_name: friendlyName,
    use_case: useCase,
    presentation_profile: presentationProfile,
    primary_metric: primaryMetric,
    thresholds: metricThresholds[primaryMetric] || {},
    metric_thresholds: metricThresholds,
    report_interval_per_day: 24,
    power_management: {
      battery_life_days: 120,
      sampling_frequency: 24,
    },
    hardware_config: hardwareConfig,
    interpretation: {
      friendly_name: friendlyName,
      purpose: description,
      use_case: useCase,
      primary_metric: primaryMetric,
      observable_metrics: Object.keys(metricThresholds),
      metric_thresholds: metricThresholds,
      thresholds: metricThresholds[primaryMetric] || {},
      context: request.context,
    },
    settings: {
      alerts,
      report_interval_per_day: 24,
      reading_flow_type: useCase === 'safety_monitoring' ? 'TRIGGER' : 'CONSTANT_PER_DAY',
      power_management: {
        battery_life_days: 120,
        sampling_frequency: 24,
      },
    },
    operational: {
      report_interval_per_day: 24,
      reading_flow_type: useCase === 'safety_monitoring' ? 'TRIGGER' : 'CONSTANT_PER_DAY',
      power_management: {
        battery_life_days: 120,
        sampling_frequency: 24,
      },
    },
  });

  if (['distance', 'vl53l0x', 'ultrasonic'].includes(sensorType)) {
    const config = baseConfig(
      'Gate Security Sensor',
      'safety_monitoring',
      'event_timeline',
      'distance',
      {
        distance: {
          min: 120,
          warning_min: 80,
        },
      },
      [
        {
          key: 'distance_security_band',
          label: 'Gate Security Alert',
          metric_key: 'distance',
          condition: 'below',
          unit: 'cm',
          warning_threshold: 120,
          critical_threshold: 80,
          description: 'Raise an alert when an object comes inside the gate detection zone.',
        },
      ],
      {
        securityEnabled: true,
        objectDetectionDistanceCm: 120,
        generatedAt,
      },
    );

    return {
      suggested_config: config,
      validated_config: config,
      explanation:
        'Mock AI: This ToF sensor is set for gate security. It watches for objects within 120 cm and raises an intrusion alert at 80 cm.',
      validation_status: 'validated',
      warnings: ['Mock AI data is enabled for testing. Distance sensors are treated as gate security by default.'],
      applied_rules: ['safety_monitoring', 'distance_alerts_below_threshold'],
      confidence_score: 0.93,
      requires_user_confirmation: true,
      needs_follow_up: false,
      follow_up_questions: [],
    };
  }

  if (['pressure', 'bmp280', 'bme280'].includes(sensorType)) {
    const config = baseConfig(
      'Pressure Watch',
      'climate_monitoring',
      'single_trend',
      'pressure',
      {
        pressure: {
          min: 980,
          warning_min: 950,
          max: 1030,
          warning_max: 1060,
        },
      },
      [
        {
          key: 'pressure_low_band',
          label: 'Pressure Too Low',
          metric_key: 'pressure',
          condition: 'below',
          unit: 'hPa',
          warning_threshold: 980,
          critical_threshold: 950,
        },
        {
          key: 'pressure_high_band',
          label: 'Pressure Too High',
          metric_key: 'pressure',
          condition: 'above',
          unit: 'hPa',
          warning_threshold: 1030,
          critical_threshold: 1060,
        },
      ],
      { generatedAt },
    );

    return {
      suggested_config: config,
      validated_config: config,
      explanation:
        'Mock AI: This setup tracks pressure for crop-condition review with practical low and high alert bands.',
      validation_status: 'validated',
      warnings: ['Mock AI data is enabled for testing. Review pressure limits before using them in the field.'],
      applied_rules: ['pressure_low_high_limits'],
      confidence_score: 0.88,
      requires_user_confirmation: true,
      needs_follow_up: false,
      follow_up_questions: [],
    };
  }

  const config = baseConfig(
    'Climate Watch',
    'climate_monitoring',
    'dual_climate',
    'temperature',
    {
      temperature: {
        min: 18,
        warning_min: 15,
        max: 30,
        warning_max: 34,
      },
      humidity: {
        min: 45,
        warning_min: 35,
        max: 80,
        warning_max: 88,
      },
    },
    [
      {
        key: 'temperature_low_band',
        label: 'Temperature Too Low',
        metric_key: 'temperature',
        condition: 'below',
        unit: 'C',
        warning_threshold: 18,
        critical_threshold: 15,
      },
      {
        key: 'temperature_high_band',
        label: 'Temperature Too High',
        metric_key: 'temperature',
        condition: 'above',
        unit: 'C',
        warning_threshold: 30,
        critical_threshold: 34,
      },
      {
        key: 'humidity_low_band',
        label: 'Humidity Too Low',
        metric_key: 'humidity',
        condition: 'below',
        unit: '%RH',
        warning_threshold: 45,
        critical_threshold: 35,
      },
      {
        key: 'humidity_high_band',
        label: 'Humidity Too High',
        metric_key: 'humidity',
        condition: 'above',
        unit: '%RH',
        warning_threshold: 80,
        critical_threshold: 88,
      },
    ],
    { generatedAt },
  );

  return {
    suggested_config: config,
    validated_config: config,
    explanation:
      'Mock AI: This climate setup watches temperature and humidity together for crop stress and greenhouse comfort.',
    validation_status: 'validated',
    warnings: ['Mock AI data is enabled for testing. Adjust the limits to match the crop and growth stage.'],
    applied_rules: ['temperature_humidity_dual_monitoring'],
    confidence_score: 0.91,
    requires_user_confirmation: true,
    needs_follow_up: false,
    follow_up_questions: [],
  };
};

const buildMockLearningPhaseStatus = (sensorId: string): LearningPhaseStatusResponse => ({
  phase: 'complete',
  dayNumber: 7,
  requiredDays: 7,
  startedAt: '2026-07-27T06:00:00.000Z',
  completedAt: '2026-08-03T06:00:00.000Z',
  lastReadingAt: '2026-08-03T05:45:00.000Z',
  readingsCollected: 168,
  alertCount: 4,
  feedbackReady: true,
  message: 'Mock AI: Seven-day learning feedback is ready for review.',
  summary: {
    windowDays: 7,
    primaryMetric: 'temperature',
    readingsCollected: 168,
    reportIntervalPerDay: 24,
    currentThresholds: {
      min: 18,
      max: 30,
      warning_min: 15,
      warning_max: 34,
    },
    alertCount: 4,
    warningAlertCount: 3,
    criticalAlertCount: 1,
    minimumValue: 16.8,
    maximumValue: 32.4,
    averageValue: 24.3,
    latestValue: 25.1,
    firstValue: 23.4,
    trendDelta: 1.7,
  },
  feedback: {
    source: 'mock-ai',
    model: 'spectron-mock-learning-v1',
    generatedAt: '2026-08-03T06:05:00.000Z',
    summary:
      'Mock AI: The last seven days show a mostly stable pattern with short afternoon heat spikes. The current alert limits are usable but should be tightened slightly for earlier crop protection.',
    observations: [
      'Temperature stayed inside the preferred band for most of the week.',
      'Short afternoon spikes pushed the warning band on two days.',
      'Night readings recovered normally, so sustained heat stress was limited.',
    ],
    recommendations: [
      'Keep 24 reports per day for another week to confirm the afternoon pattern.',
      'Review ventilation or shade actions during the hottest part of the day.',
      'Use the suggested warning band if you want earlier farmer-facing alerts.',
    ],
    suggestedThresholds: {
      min: 18,
      max: 29,
      warning_min: 16,
      warning_max: 32,
    },
    suggestedReportIntervalPerDay: 24,
    confidenceScore: 0.86,
  },
});

export const parseConfigurationFromAi = async (
  request: ConfigurationAiSuggestionRequest
): Promise<ConfigurationAiSuggestionResponse> => {
  const sensorId = request.sensorId.trim();

  if (!sensorId) {
    throw new Error('sensorId is required to request AI configuration suggestions');
  }

  if (isMockAiEnabled()) {
    return buildMockSensorSuggestion(request);
  }

  const endpoint = request.controllerId
    ? hardwareAiSuggestEndpoint(request.controllerId, sensorId)
    : API_ENDPOINTS.SENSORS.AI_SUGGEST(sensorId);

  const response = await api.post<ConfigurationAiSuggestionResponse>(
    endpoint,
    buildAiSuggestPayload(request)
  );

  return response.data;
};

export const getLearningPhaseStatus = async (
  sensorId: string
): Promise<LearningPhaseStatusResponse> => {
  if (isMockAiEnabled()) {
    return buildMockLearningPhaseStatus(sensorId);
  }

  const response = await api.get<LearningPhaseStatusResponse>(
    API_ENDPOINTS.SENSORS.LEARNING_PHASE(sensorId)
  );

  return response.data;
};
