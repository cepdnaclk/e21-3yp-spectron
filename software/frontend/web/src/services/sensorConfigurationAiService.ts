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

const buildAiSuggestPayload = (request: ConfigurationAiSuggestionRequest): AiSuggestPayload => ({
  purpose: request.description.trim(),
  context: request.context,
  desired_battery_life_days: request.desiredBatteryLifeDays,
  sampling_preferences: request.samplingPreferences,
  follow_up_answers: request.followUpAnswers,
});

export const parseConfigurationFromAi = async (
  request: ConfigurationAiSuggestionRequest
): Promise<ConfigurationAiSuggestionResponse> => {
  const sensorId = request.sensorId.trim();

  if (!sensorId) {
    throw new Error('sensorId is required to request AI configuration suggestions');
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
  const response = await api.get<LearningPhaseStatusResponse>(
    API_ENDPOINTS.SENSORS.LEARNING_PHASE(sensorId)
  );

  return response.data;
};
