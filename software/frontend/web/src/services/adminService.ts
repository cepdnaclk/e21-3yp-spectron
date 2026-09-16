import api from './api';

export interface AdminOverview {
  totalDevices: number;
  unclaimedDevices: number;
  pairedDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  configuredSensors: number;
  unconfiguredSensors: number;
  farmControllers?: number;
  sensorBases?: number;
  legacyOnlyDevices?: number;
}

export interface AdminDevice {
  id: string;
  controllerId: string;
  name: string;
  location?: string;
  status: string;
  ownerEmail?: string;
  sensorCount: number;
  configuredSensors: number;
  lastSeen?: string;
  updatedAt?: string;
  architectureState?: string;
  sensorBaseCount?: number;
  farmName?: string;
  operationalStatus?: string;
}

export interface CreateAdminDeviceRequest {
  controllerId?: string;
  name: string;
  location?: string;
  createDefaultSensors: boolean;
}

export interface CreateAdminDeviceResponse {
  device: AdminDevice;
  qrPayload: string;
  claimUrl: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  controllerCount: number;
  createdAt: string;
}

export interface AdminOwner {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'DISABLED';
  accountId: string;
  organizationName: string;
  controllerCount: number;
  viewerCount: number;
  createdAt: string;
}

export interface AdminAuditEvent {
  id: string;
  actorEmail?: string;
  actorName?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  summary?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  outcome?: string;
  details?: Record<string, unknown>;
  userAgent?: string;
}

export interface AdminAuditQuery {
  limit?: number;
  offset?: number;
  action?: string;
  search?: string;
}

export interface AdminAuditResponse {
  events: AdminAuditEvent[];
  total: number;
}

export interface CreateOwnerRequest {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  organizationName?: string;
}

export interface AdminSystemHealth {
  apiStatus: string;
  databaseStatus: string;
  serverTime: string;
}

export const getAdminOverview = async (): Promise<AdminOverview> => {
  const response = await api.get<AdminOverview>('/api/admin/overview');
  return response.data;
};

export const getAdminDevices = async (): Promise<AdminDevice[]> => {
  const response = await api.get<{ devices?: AdminDevice[] }>('/api/admin/devices');
  return response.data.devices || [];
};

export const createAdminDevice = async (
  request: CreateAdminDeviceRequest
): Promise<CreateAdminDeviceResponse> => {
  const response = await api.post<CreateAdminDeviceResponse>('/api/admin/devices', request);
  return response.data;
};

export const getAdminUsers = async (): Promise<AdminUser[]> => {
  const response = await api.get<{ users?: AdminUser[] }>('/api/admin/users');
  return response.data.users || [];
};

export const getAdminOwners = async (): Promise<AdminOwner[]> => {
  const response = await api.get<{ owners?: AdminOwner[] }>('/api/admin/owners');
  return response.data.owners || [];
};

export const createAdminOwner = async (request: CreateOwnerRequest): Promise<AdminOwner> => {
  const response = await api.post<AdminOwner>('/api/admin/owners', request);
  return response.data;
};

export const approveAdminOwner = async (ownerId: string): Promise<void> => {
  await api.patch(`/api/admin/owners/${encodeURIComponent(ownerId)}/approve`);
};

export const rejectAdminOwner = async (ownerId: string): Promise<void> => {
  await api.patch(`/api/admin/owners/${encodeURIComponent(ownerId)}/reject`);
};

export const getAdminSystemHealth = async (): Promise<AdminSystemHealth> => {
  const response = await api.get<AdminSystemHealth>('/api/admin/system');
  return response.data;
};

export const getAdminAuditEvents = async (query: AdminAuditQuery = {}): Promise<AdminAuditResponse> => {
  const response = await api.get<{ events?: AdminAuditEvent[]; total?: number } | AdminAuditEvent[]>('/api/admin/audit', {
    params: query,
  });
  if (Array.isArray(response.data)) {
    return {
      events: response.data,
      total: response.data.length,
    };
  }
  return {
    events: response.data.events || [],
    total: response.data.total ?? (response.data.events || []).length,
  };
};

export const deleteAdminOwner = async (ownerId: string): Promise<void> => {
  await api.delete(`/api/admin/owners/${encodeURIComponent(ownerId)}`);
};
