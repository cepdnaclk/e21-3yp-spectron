import api from './api';
import { API_ENDPOINTS } from '../config/api';

export interface Controller {
  id: string;
  account_id: string;
  hw_id: string;
  name?: string;
  purpose?: string;
  location?: string;
  status: 'ONLINE' | 'OFFLINE' | 'PENDING_CONFIG' | 'ERROR';
  claim_status?: 'CLAIMED' | 'UNCLAIMED';
  operational_status?: 'ONLINE' | 'OFFLINE' | 'PENDING_CONFIG' | 'ERROR';
  last_seen?: string;
  created_at: string;
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

export const updateController = async (id: string, data: UpdateControllerRequest): Promise<Controller> => {
  const response = await api.patch<Controller>(API_ENDPOINTS.CONTROLLERS.UPDATE(id), data);
  return response.data;
};
