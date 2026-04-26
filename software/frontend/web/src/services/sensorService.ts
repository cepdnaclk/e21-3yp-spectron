import api from './api';
import { API_ENDPOINTS } from '../config/api';

export interface Sensor {
  id: string;
  controller_id: string;
  hw_id: string;
  type: string;
  name?: string;
  purpose?: string;
  unit?: string;
  status: 'OK' | 'OFFLINE' | 'ERROR';
  config_active?: boolean;
  active_config?: SensorConfig;
  last_seen?: string;
  context?: SensorContext;
  observation?: SensorObservation;
  last_calibrated_at?: string;
  calibration_due_at?: string;
  calibration_status?: string;
}

export interface SensorObservation {
  status: 'awaiting_data' | 'observing' | 'ready_for_review';
  message: string;
  window_days: number;
  readings_collected: number;
  minimum_readings: number;
  started_at?: string;
  last_reading_at?: string;
}

export interface SensorReading {
  time: string;
  value?: number;
  avg_value?: number;
  min_value?: number;
  max_value?: number;
  meta?: Record<string, unknown>;
}

export interface SensorConfig {
  friendly_name: string;
  use_case?: string;
  presentation_profile?: string;
  primary_metric?: string;
  thresholds: {
    min?: number;
    max?: number;
    warning_min?: number;
    warning_max?: number;
  };
  metric_thresholds?: Record<string, {
    min?: number;
    max?: number;
    warning_min?: number;
    warning_max?: number;
  }>;
  report_interval_per_day: number;
  power_management: {
    battery_life_days: number;
    sampling_frequency: number;
  };
}

export interface LocationContext {
  mode?: string;
  label?: string;
  country?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
}

export interface SensorContext {
  domain?: string;
  environment_type?: string;
  indoor_outdoor?: string;
  asset_type?: string;
  installation_notes?: string;
  historical_window_days?: number;
  location?: LocationContext;
}

export interface AISuggestRequest {
  purpose: string;
  context?: SensorContext;
  desired_battery_life_days?: number;
  sampling_preferences?: {
    frequency?: 'low' | 'medium' | 'high';
  };
}

export interface AISuggestResponse {
  suggested_config: SensorConfig;
  validated_config: SensorConfig;
  explanation: string;
  validation_status: string;
  warnings?: string[];
  applied_rules?: string[];
  confidence_score: number;
  requires_user_confirmation: boolean;
}

export interface SaveSensorConfigRequest {
  purpose: string;
  context?: SensorContext;
  config: SensorConfig;
}

export interface SaveSensorConfigResponse {
  status: string;
  validated_config: SensorConfig;
  validation_status: string;
  warnings?: string[];
  applied_rules?: string[];
  confidence_score: number;
  requires_user_confirmation: boolean;
  config_active: boolean;
  observation?: SensorObservation;
}

export const getSensors = async (controllerId: string): Promise<Sensor[]> => {
  const response = await api.get<Sensor[] | null>(API_ENDPOINTS.SENSORS.LIST(controllerId));
  return Array.isArray(response.data) ? response.data : [];
};

export const getSensor = async (id: string): Promise<Sensor> => {
  const response = await api.get<Sensor>(API_ENDPOINTS.SENSORS.GET(id));
  return response.data;
};

export const getAISuggestedConfig = async (
  sensorId: string,
  request: AISuggestRequest
): Promise<AISuggestResponse> => {
  const response = await api.post<AISuggestResponse>(
    API_ENDPOINTS.SENSORS.AI_SUGGEST(sensorId),
    request
  );
  return response.data;
};

export const saveSensorConfig = async (
  sensorId: string,
  request: SaveSensorConfigRequest
): Promise<SaveSensorConfigResponse> => {
  const response = await api.post<SaveSensorConfigResponse>(API_ENDPOINTS.SENSORS.CONFIG(sensorId), request);
  return response.data;
};

export const getSensorReadings = async (
  sensorId: string,
  params?: {
    from?: string;
    to?: string;
    interval?: string;
  }
): Promise<SensorReading[]> => {
  const response = await api.get<SensorReading[] | null>(API_ENDPOINTS.READINGS.GET(sensorId), {
    params,
  });
  return Array.isArray(response.data) ? response.data : [];
};
