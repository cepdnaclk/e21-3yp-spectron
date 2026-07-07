import api from './api';
import { SensorConfig, SensorContext } from './sensorService';

export interface AgriAdvisory {
  crop: string;
  stage: string;
  issue?: string;
  treatment?: string;
  text: string;
}

export interface AgriSummary {
  crops: string[];
  stages: string[];
  issues: string[];
}

export interface AgriConfigRequest {
  crop: string;
  stage: string;
  sensor_type: string;
  field_name?: string;
  location?: string;
  use_hosted_ai?: boolean;
  controller_id?: string;
  sensor_id?: string;
}

export interface AgriConfigResponse {
  purpose: string;
  context: SensorContext;
  config: SensorConfig;
  advisories: AgriAdvisory[];
  mode: 'deterministic' | 'hosted_ai' | string;
}

export const getAgriSummary = async (): Promise<AgriSummary> => {
  const response = await api.get<AgriSummary>('/api/agri/summary');
  return response.data;
};

export const getAgriAdvisories = async (
  crop: string,
  stage: string
): Promise<AgriAdvisory[]> => {
  const response = await api.get<{ advisories: AgriAdvisory[] }>('/api/agri/advisories', {
    params: { crop, stage },
  });
  return response.data.advisories || [];
};

export const buildAgriConfig = async (
  request: AgriConfigRequest
): Promise<AgriConfigResponse> => {
  const response = await api.post<AgriConfigResponse>('/api/agri/config', request);
  return response.data;
};
