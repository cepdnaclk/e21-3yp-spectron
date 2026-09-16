import api from './api';
import { API_ENDPOINTS } from '../config/api';

export interface Alert {
  id: string;
  account_id: string;
  controller_id?: string;
  sensor_id?: string;
  type: 'THRESHOLD_BREACH' | 'SENSOR_OFFLINE' | 'CONTROLLER_OFFLINE';
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  message: string;
  created_at: string;
  acknowledged_at?: string;
}

export interface AlertFilters {
  controller_id?: string;
  sensor_id?: string;
  type?: Alert['type'];
  severity?: Alert['severity'];
  acknowledged?: boolean;
}

export const getAlerts = async (filters?: AlertFilters): Promise<Alert[]> => {
  const response = await api.get<Alert[]>(API_ENDPOINTS.ALERTS.LIST, {
    params: filters,
  });
  return response.data;
};

export const acknowledgeAlert = async (alertId: string): Promise<void> => {
  await api.post(API_ENDPOINTS.ALERTS.ACK(alertId));
};
