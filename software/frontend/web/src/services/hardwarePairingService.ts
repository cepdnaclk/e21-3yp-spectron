import api from './api';
import { Controller } from './controllerService';
import {
  getSensor,
  getSensors,
  saveSensorConfig,
  Sensor,
  SensorConfig as SensorConfigPayload,
} from './sensorService';

declare const process: {
  env: {
    REACT_APP_HARDWARE_MOCK?: string;
    REACT_APP_MOCK_HARDWARE?: string;
    REACT_APP_MOCK_MODE?: string;
    [key: string]: string | undefined;
  };
};

const STORAGE_KEY = 'spectron_hardware_pairings';

export interface HardwarePairingSensor {
  id: string;
  name: string;
  type: string;
  status: string;
  configured: boolean;
  config?: Record<string, unknown>;
}

export interface HardwarePairingResponse {
  id?: string;
  controllerId: string;
  routeId?: string;
  status: string;
  sensors: HardwarePairingSensor[];
}

export interface SaveHardwareSensorConfigRequest {
  controllerId: string;
  sensorId: string;
  sensorType: string;
  sensorName: string;
  usedFor: string;
  dashboardView: string;
  config: Record<string, unknown>;
  appConfig: SensorConfigPayload;
}

type StoredHardwareController = HardwarePairingResponse & {
  updatedAt: string;
};

type StoredHardwareState = Record<string, StoredHardwareController>;

const isMockMode = () => {
  return (
    process.env.REACT_APP_HARDWARE_MOCK === 'true' ||
    process.env.REACT_APP_MOCK_HARDWARE === 'true' ||
    process.env.REACT_APP_MOCK_MODE === 'true'
  );
};

const readStore = (): StoredHardwareState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeStore = (state: StoredHardwareState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const savePairedHardware = (pairing: HardwarePairingResponse) => {
  const state = readStore();
  state[pairing.controllerId] = {
    ...pairing,
    sensors: Array.isArray(pairing.sensors) ? pairing.sensors : [],
    updatedAt: new Date().toISOString(),
  };
  writeStore(state);
};

export const getStoredHardware = (controllerId: string): StoredHardwareController | null => {
  if (!isMockMode()) {
    return null;
  }
  return readStore()[controllerId] || null;
};

const normalizeControllerStatus = (status: string | undefined): 'ONLINE' | 'OFFLINE' | 'PENDING_CONFIG' => {
  const normalized = (status || '').toUpperCase().trim();
  switch (normalized) {
    case 'ONLINE':
    case 'PAIRED':
    case 'LIVE':
      return 'ONLINE';
    case 'PENDING_CONFIG':
      return 'PENDING_CONFIG';
    default:
      return 'OFFLINE';
  }
};

const normalizeStatus = (status: string): Sensor['status'] => {
  switch ((status || '').toLowerCase()) {
    case 'live':
    case 'online':
    case 'ok':
      return 'OK';
    case 'error':
      return 'ERROR';
    default:
      return 'OFFLINE';
  }
};

export const toAppSensor = (controllerId: string, sensor: HardwarePairingSensor): Sensor => {
  const appConfig = sensor.config?.appConfig as SensorConfigPayload | undefined;

  return {
    id: sensor.id,
    controller_id: controllerId,
    hw_id: sensor.id,
    type: sensor.type,
    name: sensor.name,
    status: normalizeStatus(sensor.status),
    config_active: sensor.configured,
    active_config: appConfig,
  };
};

const normalizePairingResponse = (data: any, fallbackControllerId: string): HardwarePairingResponse => {
  const controllerId =
    data?.controllerId ||
    data?.controller_id ||
    data?.id ||
    fallbackControllerId.toUpperCase();

  const sensors = Array.isArray(data?.sensors)
    ? data.sensors.map((sensor: any) => ({
        id: sensor.id || sensor.hw_id,
        name: sensor.name || `${sensor.type || 'Unknown'} Sensor`,
        type: sensor.type || 'unknown',
        status: sensor.status || 'live',
        configured: Boolean(sensor.configured ?? sensor.config_active),
        config: sensor.config,
      }))
    : [];

  return {
    id: data?.id,
    controllerId,
    routeId: data?.id || controllerId,
    status: data?.status || 'paired',
    sensors,
  };
};

const mockPairingResponse = (controllerId: string): HardwarePairingResponse => ({
  id: controllerId.toUpperCase(),
  controllerId: controllerId.toUpperCase(),
  routeId: controllerId.toUpperCase(),
  status: 'OFFLINE',
  sensors: [],
});

export const extractControllerId = (value: string): string => {
  const raw = (value || '').trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = JSON.parse(raw);
    const fromJson = parsed?.controllerId || parsed?.controller_id || parsed?.code || parsed?.hw_id || parsed?.id;
    if (typeof fromJson === 'string') {
      return extractControllerId(fromJson);
    }
  } catch {
    // Continue with URL/direct parsing.
  }

  const directMatch = raw.match(/CTRL-[A-Z0-9-]+/i);
  if (directMatch) {
    return directMatch[0].toUpperCase();
  }

  try {
    const url = new URL(raw, window.location.origin);
    const fromQuery =
      url.searchParams.get('code') ||
      url.searchParams.get('hw_id') ||
      url.searchParams.get('controllerId') ||
      url.searchParams.get('controller_id') ||
      url.searchParams.get('id') ||
      '';

    if (fromQuery) {
      return extractControllerId(fromQuery);
    }

    const fromPath = url.pathname.split('/').filter(Boolean).pop() || '';
    if (/^CTRL-/i.test(fromPath)) {
      return extractControllerId(fromPath);
    }
  } catch {
    // Not a URL.
  }

  return '';
};

export const pairHardwareController = async (controllerId: string): Promise<HardwarePairingResponse> => {
  const normalizedControllerId = extractControllerId(controllerId);
  if (!normalizedControllerId) {
    throw new Error('Invalid controller QR code');
  }

  if (!isMockMode()) {
    const response = await api.post('/api/controllers/pair', {
      controllerId: normalizedControllerId,
    });
    return normalizePairingResponse(response.data, normalizedControllerId);
  }

  // In mock mode, return empty response (no hardcoded defaults)
  const pairing = mockPairingResponse(normalizedControllerId);
  savePairedHardware(pairing);
  return pairing;
};

export const releaseHardwareController = async (controllerId: string): Promise<void> => {
  if (!isMockMode()) {
    await api.delete(`/api/controllers/${encodeURIComponent(controllerId)}/claim`);
    return;
  }

  const state = readStore();
  delete state[controllerId];
  writeStore(state);
};

export const getHardwareController = async (controllerId: string): Promise<Controller> => {
  const stored = getStoredHardware(controllerId);
  if (stored) {
    return {
      id: stored.controllerId,
      account_id: 'local-demo',
      hw_id: stored.controllerId,
      name: 'Paired Controller',
      status: normalizeControllerStatus(stored.status),
      created_at: stored.updatedAt,
    };
  }

  if (/^CTRL-/i.test(controllerId)) {
    const response = await api.get<{ controllers?: Array<{
      controllerId: string;
      name?: string;
      status?: string;
    }> }>('/api/controllers/my');
    const controller = (response.data.controllers || []).find((item) =>
      item.controllerId.toUpperCase() === controllerId.toUpperCase()
    );

    if (controller) {
      return {
        id: controller.controllerId,
        account_id: '',
        hw_id: controller.controllerId,
        name: controller.name,
        status: normalizeControllerStatus(controller.status),
        created_at: '',
      };
    }
  }

  const response = await api.get<Controller>(`/controllers/${controllerId}`);
  return response.data;
};

export const getHardwareSensors = async (controllerId: string): Promise<Sensor[]> => {
  const stored = getStoredHardware(controllerId);
  if (stored) {
    const storedSensors = Array.isArray(stored.sensors) ? stored.sensors : [];
    return storedSensors.map((sensor) => toAppSensor(controllerId, sensor));
  }

  return getSensors(controllerId);
};

export const getHardwareSensor = async (sensorId: string, controllerId?: string): Promise<Sensor> => {
  if (controllerId) {
    const stored = getStoredHardware(controllerId);
    const sensor = (Array.isArray(stored?.sensors) ? stored?.sensors : [])?.find((item) => item.id === sensorId);
    if (sensor) {
      return toAppSensor(controllerId, sensor);
    }
  }

  return getSensor(sensorId);
};

export const saveHardwareSensorConfiguration = async (
  request: SaveHardwareSensorConfigRequest
): Promise<void> => {
  if (!isMockMode()) {
    try {
      await api.post(`/api/controllers/${request.controllerId}/sensors/${request.sensorId}/config`, request);
    } catch {
      try {
        await saveSensorConfig(request.sensorId, {
          purpose: request.usedFor,
          config: request.appConfig,
        });
      } catch {
        // Persist locally if neither backend shape is available.
      }
    }
  }

  const state = readStore();
  const current = state[request.controllerId] || mockPairingResponse(request.controllerId);
  const currentSensors = Array.isArray(current.sensors) ? current.sensors : [];
  const nextSensors = currentSensors.map((sensor) =>
    sensor.id === request.sensorId
      ? {
          ...sensor,
          name: request.sensorName,
          configured: true,
          config: {
            ...request.config,
            appConfig: request.appConfig,
          },
        }
      : sensor
  );

  state[request.controllerId] = {
    ...current,
    sensors: nextSensors,
    updatedAt: new Date().toISOString(),
  };
  writeStore(state);
};
