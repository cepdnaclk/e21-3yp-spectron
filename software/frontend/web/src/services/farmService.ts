import api from './api';
import { API_ENDPOINTS } from '../config/api';

export interface Farm {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  area?: number | null;
  location_accuracy_m?: number | null;
  location_label?: string | null;
  location_source?: FarmLocationSource | null;
  role: 'owner' | 'viewer';
  created_at: string;
  updated_at: string;
}

export type FarmLocationSource = 'device_geolocation' | 'map_pin' | 'place_search' | 'manual_coordinates';

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

export interface GrowthStage {
  id: string;
  name: string;
  days_after_plant_min?: number | null;
  days_after_plant_max?: number | null;
  display_order: number;
  visual_hint?: string | null;
}

export interface CropVariety {
  id: string;
  name: string;
  description?: string | null;
}

export interface Crop {
  id: string;
  name: string;
  varieties: CropVariety[];
  stages: GrowthStage[];
}

export interface CropInstance {
  id: string;
  field_id: string;
  crop_id: string;
  crop_name: string;
  variety_id?: string | null;
  variety_name?: string | null;
  planting_date?: string | null;
  planting_date_precision: 'exact' | 'approximate' | 'unknown';
  expected_harvest_date?: string | null;
  current_stage?: GrowthStage | null;
  stage_source: 'automatic' | 'owner_confirmed' | 'agronomist_confirmed' | 'support_corrected';
  stage_confidence?: number | null;
  stage_estimated_at?: string | null;
  stage_confirmed_at?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FarmController {
  id: string;
  farm_id: string;
  legacy_controller_id?: string | null;
  serial_number: string;
  model?: string | null;
  status: 'pending_setup' | 'online' | 'offline' | 'error' | 'retired';
  last_seen?: string | null;
  field_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface SensorBaseAssignment {
  id: string;
  base_id: string;
  field_id?: string | null;
  field_name?: string | null;
  monitoring_zone?: string | null;
  assigned_at: string;
  unassigned_at?: string | null;
}

export interface SensorBase {
  id: string;
  gateway_id: string;
  serial_number: string;
  label?: string | null;
  status: 'waiting_setup' | 'live' | 'offline' | 'retired' | 'error';
  last_seen?: string | null;
  current_assignment?: SensorBaseAssignment | null;
  created_at: string;
  updated_at: string;
}

export interface SensorChannel {
  id: string;
  module_id: string;
  channel_key: string;
  measurement_type: string;
  unit?: string | null;
  calibration_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SensorModule {
  id: string;
  base_id: string;
  slot_number: number;
  model?: string | null;
  status: 'live' | 'offline' | 'retired' | 'error';
  channels: SensorChannel[];
  created_at: string;
  updated_at: string;
}

export interface FarmAlert {
  id: string;
  farm_id: string;
  field_id?: string | null;
  field_name?: string | null;
  sensor_base_id?: string | null;
  crop_instance_id?: string | null;
  type: string;
  severity: 'info' | 'warning' | 'critical' | 'INFO' | 'WARN' | 'CRITICAL';
  message: string;
  source_ref?: string | null;
  status: 'open' | 'acknowledged' | 'dismissed' | 'resolved' | string;
  created_at: string;
  acknowledged_at?: string | null;
  expires_at?: string | null;
}

export interface FarmAlertFilters {
  field_id?: string;
  severity?: string;
  status?: string;
}

export interface CreateFarmRequest {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  area?: number | null;
  location_accuracy_m?: number | null;
  location_label?: string | null;
  location_source?: FarmLocationSource | null;
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

export interface CreateCropInstanceRequest {
  crop_id: string;
  variety_id?: string | null;
  planting_date?: string | null;
  planting_date_precision?: 'exact' | 'approximate' | 'unknown';
  expected_harvest_date?: string | null;
}

export interface AttachFarmControllerRequest {
  controller_id: string;
  model?: string | null;
}

export interface CreateSensorBaseRequest {
  gateway_id: string;
  serial_number: string;
  label?: string | null;
}

export interface AssignSensorBaseRequest {
  field_id?: string | null;
  monitoring_zone?: string | null;
}

export interface CreateSensorChannelRequest {
  channel_key: string;
  measurement_type: string;
  unit?: string | null;
  calibration_json?: Record<string, unknown>;
}

export interface CreateSensorModuleRequest {
  slot_number: number;
  model?: string | null;
  channels: CreateSensorChannelRequest[];
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

export const getCrops = async (): Promise<Crop[]> => {
  const response = await api.get<{ crops?: Crop[] } | Crop[]>(API_ENDPOINTS.FARMS.CROPS);
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.crops || [];
};

export const getFieldCropInstances = async (fieldId: string): Promise<CropInstance[]> => {
  const response = await api.get<{ crop_instances?: CropInstance[] } | CropInstance[]>(
    API_ENDPOINTS.FARMS.FIELD_CROP_INSTANCES(fieldId),
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.crop_instances || [];
};

export const createCropInstance = async (fieldId: string, data: CreateCropInstanceRequest): Promise<CropInstance> => {
  const response = await api.post<CropInstance | { crop_instance: CropInstance }>(
    API_ENDPOINTS.FARMS.FIELD_CROP_INSTANCES(fieldId),
    data,
  );
  if ('crop_instance' in response.data) {
    return response.data.crop_instance;
  }
  return response.data;
};

export const confirmCropStage = async (cropInstanceId: string, stageId: string): Promise<CropInstance> => {
  const response = await api.post<CropInstance | { crop_instance: CropInstance }>(
    API_ENDPOINTS.FARMS.CONFIRM_STAGE(cropInstanceId),
    { stage_id: stageId },
  );
  if ('crop_instance' in response.data) {
    return response.data.crop_instance;
  }
  return response.data;
};

export const getFarmControllers = async (farmId: string): Promise<FarmController[]> => {
  const response = await api.get<{ controllers?: FarmController[] } | FarmController[]>(
    API_ENDPOINTS.FARMS.CONTROLLERS(farmId),
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.controllers || [];
};

export const attachFarmController = async (
  farmId: string,
  data: AttachFarmControllerRequest,
): Promise<FarmController[]> => {
  const response = await api.post<{ controllers?: FarmController[] } | FarmController[]>(
    API_ENDPOINTS.FARMS.CONTROLLERS(farmId),
    data,
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.controllers || [];
};

export const getFarmSensorBases = async (farmId: string): Promise<SensorBase[]> => {
  const response = await api.get<{ sensor_bases?: SensorBase[] } | SensorBase[]>(
    API_ENDPOINTS.FARMS.SENSOR_BASES(farmId),
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.sensor_bases || [];
};

export const createSensorBase = async (farmId: string, data: CreateSensorBaseRequest): Promise<SensorBase> => {
  const response = await api.post<SensorBase>(API_ENDPOINTS.FARMS.SENSOR_BASES(farmId), data);
  return response.data;
};

export const assignSensorBase = async (baseId: string, data: AssignSensorBaseRequest): Promise<SensorBase> => {
  const response = await api.post<SensorBase>(API_ENDPOINTS.FARMS.ASSIGN_SENSOR_BASE(baseId), data);
  return response.data;
};

export const getSensorBaseAssignments = async (baseId: string): Promise<SensorBaseAssignment[]> => {
  const response = await api.get<{ assignments?: SensorBaseAssignment[] } | SensorBaseAssignment[]>(
    API_ENDPOINTS.FARMS.SENSOR_BASE_ASSIGNMENTS(baseId),
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.assignments || [];
};

export const getSensorModules = async (baseId: string): Promise<SensorModule[]> => {
  const response = await api.get<{ modules?: SensorModule[] } | SensorModule[]>(
    API_ENDPOINTS.FARMS.SENSOR_MODULES(baseId),
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.modules || [];
};

export const createSensorModule = async (
  baseId: string,
  data: CreateSensorModuleRequest,
): Promise<SensorModule> => {
  const response = await api.post<SensorModule>(API_ENDPOINTS.FARMS.SENSOR_MODULES(baseId), data);
  return response.data;
};

export const getFarmAlerts = async (farmId: string, filters?: FarmAlertFilters): Promise<FarmAlert[]> => {
  const response = await api.get<{ alerts?: FarmAlert[] } | FarmAlert[]>(API_ENDPOINTS.FARMS.ALERTS(farmId), {
    params: filters,
  });
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.alerts || [];
};

export const acknowledgeFarmAlert = async (farmId: string, alertId: string): Promise<FarmAlert> => {
  const response = await api.post<FarmAlert | { alert: FarmAlert }>(API_ENDPOINTS.FARMS.ACK_ALERT(farmId, alertId));
  if ('alert' in response.data) {
    return response.data.alert;
  }
  return response.data;
};
