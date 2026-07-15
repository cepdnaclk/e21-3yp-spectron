import api from './api';
import { API_ENDPOINTS } from '../config/api';

export interface Farm {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  area?: number | null;
  role: 'owner' | 'viewer';
  created_at: string;
  updated_at: string;
}

export interface Field {
  id: string;
  farm_id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  area?: number | null;
  boundary_json?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Collaborator {
  user_id: string;
  email: string;
  name?: string | null;
  role: 'owner' | 'viewer';
  added_at: string;
  revoked_at?: string | null;
  access_type?: string;
}

export interface CreateFarmRequest {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  area?: number | null;
}

export interface CreateFieldRequest {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  area?: number | null;
  boundary_json?: Record<string, unknown> | null;
}

export interface CreateCollaboratorRequest {
  email: string;
  role: 'viewer';
}

export const getFarms = async (): Promise<Farm[]> => {
  const response = await api.get<{ farms?: Farm[] } | Farm[]>(API_ENDPOINTS.FARMS.LIST);
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.farms || [];
};

export const getFarm = async (farmId: string): Promise<Farm> => {
  const response = await api.get<Farm>(API_ENDPOINTS.FARMS.GET(farmId));
  return response.data;
};

export const createFarm = async (data: CreateFarmRequest): Promise<Farm> => {
  const response = await api.post<Farm>(API_ENDPOINTS.FARMS.CREATE, data);
  return response.data;
};

export const updateFarm = async (farmId: string, data: CreateFarmRequest): Promise<Farm> => {
  const response = await api.put<Farm>(API_ENDPOINTS.FARMS.UPDATE(farmId), data);
  return response.data;
};

export const getFarmFields = async (farmId: string): Promise<Field[]> => {
  const response = await api.get<{ fields?: Field[] } | Field[]>(API_ENDPOINTS.FARMS.FIELDS(farmId));
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.fields || [];
};

export const createField = async (farmId: string, data: CreateFieldRequest): Promise<Field> => {
  const response = await api.post<Field>(API_ENDPOINTS.FARMS.FIELDS(farmId), data);
  return response.data;
};

export const getFarmCollaborators = async (farmId: string): Promise<Collaborator[]> => {
  const response = await api.get<{ collaborators?: Collaborator[] } | Collaborator[]>(API_ENDPOINTS.FARMS.COLLABORATORS(farmId));
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.collaborators || [];
};

export const addFarmCollaborator = async (farmId: string, data: CreateCollaboratorRequest) => {
  const response = await api.post(API_ENDPOINTS.FARMS.COLLABORATORS(farmId), data);
  return response.data;
};

export const removeFarmCollaborator = async (farmId: string, userId: string) => {
  await api.delete(API_ENDPOINTS.FARMS.REMOVE_COLLABORATOR(farmId, userId));
};
