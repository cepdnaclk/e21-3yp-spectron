import api from './api';

export interface AdminOverview {
  totalDevices: number;
  unclaimedDevices: number;
  pairedDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  activeTokens: number;
  usedTokens: number;
  expiredTokens: number;
  configuredSensors: number;
  unconfiguredSensors: number;
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
  tokenStatus: string;
  tokenExpiresAt?: string;
  tokenUsedAt?: string;
  lastSeen?: string;
  updatedAt?: string;
}

export interface CreateAdminDeviceRequest {
  controllerId?: string;
  name: string;
  location?: string;
  tokenExpiryHours: number;
  createDefaultSensors: boolean;
}

export interface CreateAdminDeviceResponse {
  device: AdminDevice;
  pairingToken: string;
  pairingUrl: string;
}

export interface AdminPairingToken {
  controllerId: string;
  status: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface AdminGeneratedToken {
  controllerId: string;
  pairingToken: string;
  pairingUrl: string;
  expiresAt: string;
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

export interface CreateOwnerRequest {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  organizationName: string;
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

export const getAdminPairingTokens = async (): Promise<AdminPairingToken[]> => {
  const response = await api.get<{ tokens?: AdminPairingToken[] }>('/api/admin/pairing-tokens');
  return response.data.tokens || [];
};

export const generateAdminPairingToken = async (
  controllerId: string,
  tokenExpiryHours = 24
): Promise<AdminGeneratedToken> => {
  const response = await api.post<AdminGeneratedToken>(
    `/api/admin/devices/${encodeURIComponent(controllerId)}/pairing-token`,
    { tokenExpiryHours }
  );
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
