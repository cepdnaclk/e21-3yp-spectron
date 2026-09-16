import api from './api';
import { API_ENDPOINTS } from '../config/api';

export interface Controller {
  id: string;
  account_id: string;
  hw_id: string;
  name?: string;
  purpose?: string;
  location?: string;
  status: 'ONLINE' | 'OFFLINE' | 'PENDING_CONFIG';
  claim_status?: string;
  operational_status?: string;
  last_seen?: string;
  created_at: string;
}

export interface ControllerFieldLink {
  field_id?: string | null;
  field_name?: string | null;
  farm_id?: string;
  farm_name?: string;
  sensor_base_id?: string;
  sensor_base_label?: string;
  base_id?: string;
  label?: string | null;
  serial_number?: string | null;
  monitoring_zone?: string | null;
  status?: string | null;
}

export interface PairControllerRequest {
  qr_token: string;
}

export interface UpdateControllerRequest {
  name?: string;
  purpose?: string;
  location?: string;
}

export const getControllers = async (): Promise<Controller[]> => {
  const response = await api.get<Controller[] | null | { controllers?: Controller[] | null }>(API_ENDPOINTS.CONTROLLERS.LIST);

  if (Array.isArray(response.data)) {
    return response.data;
  }

  if (response.data && 'controllers' in response.data && Array.isArray(response.data.controllers)) {
    return response.data.controllers;
  }

  return [];
};

export const getController = async (id: string): Promise<Controller> => {
  const response = await api.get<Controller>(API_ENDPOINTS.CONTROLLERS.GET(id));
  return response.data;
};

export const pairController = async (data: PairControllerRequest): Promise<Controller> => {
  const response = await api.post<Controller>(API_ENDPOINTS.CONTROLLERS.PAIR, data);
  return response.data;
};

export const updateController = async (id: string, data: UpdateControllerRequest): Promise<Controller> => {
  const response = await api.patch<Controller>(API_ENDPOINTS.CONTROLLERS.UPDATE(id), data);
  return response.data;
};

export const getControllerFieldLinks = async (id: string): Promise<ControllerFieldLink[]> => {
  const response = await api.get<{ links?: ControllerFieldLink[] } | ControllerFieldLink[]>(
    `/api/controllers/${encodeURIComponent(id)}/field-links`
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.links || [];
};
