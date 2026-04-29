import api from './api';
import { Controller, updateController } from './controllerService';
import { API_ENDPOINTS } from '../config/api';
import {
  getSensor,
  getSensors,
  updateSensor,
  Sensor,
  AISuggestRequest,
  AISuggestResponse,
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
  sensorUid?: string;
  systemId?: string;
  slotKey?: string;
  name: string;
  type: string;
  status: string;
  configured: boolean;
  config?: Record<string, unknown>;
}

export interface HardwarePairingResponse {
  id?: string;
  controllerId: string;
  systemId?: string;
  systemName?: string;
  routeId?: string;
  status: string;
  sensors: HardwarePairingSensor[];
}

export interface HardwareSystemSummary {
  id: string;
  name: string;
  purpose?: string;
  location?: string;
  status: string;
  activeControllerId?: string;
  activeControllerHw?: string;
  sensorCount: number;
  configuredSensors: number;
}

interface UserHardwareController {
  controllerId: string;
  systemId?: string;
  systemName?: string;
  name: string;
  status: string;
  sensors: HardwarePairingSensor[];
}

interface UserHardwareControllersResponse {
  controllers: UserHardwareController[];
}

export interface SaveHardwareSensorConfigRequest {
  controllerId: string;
  sensorId: string;
  systemName: string;
  sensorType: string;
  sensorName: string;
  usedFor: string;
  dashboardView: string;
  config: Record<string, unknown>;
  appConfig: SensorConfigPayload;
}

interface HardwareSensorConfigResponse {
  controllerId: string;
  systemId?: string;
  sensorId: string;
  sensorUid?: string;
  sensorType: string;
  sensorName: string;
  usedFor?: string;
  dashboardView?: string;
  config?: Record<string, unknown>;
  appConfig?: SensorConfigPayload;
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

export const findHardwareControllerIdForSensor = async (sensorId: string): Promise<string | null> => {
  const trimmedSensorId = sensorId.trim();
  if (!trimmedSensorId) {
    return null;
  }

  if (isMockMode()) {
    const state = readStore();
    for (const controller of Object.values(state)) {
      const sensors = Array.isArray(controller.sensors) ? controller.sensors : [];
      if (sensors.some((sensor) => sensor.id === trimmedSensorId || sensor.sensorUid === trimmedSensorId)) {
        return controller.controllerId;
      }
    }
    return null;
  }

  const response = await api.get<UserHardwareControllersResponse>('/api/controllers/my');
  const controllers = Array.isArray(response.data?.controllers) ? response.data.controllers : [];

  for (const controller of controllers) {
    const sensors = Array.isArray(controller.sensors) ? controller.sensors : [];
    if (sensors.some((sensor) => sensor.id === trimmedSensorId || sensor.sensorUid === trimmedSensorId)) {
      return controller.controllerId;
    }
  }

  return null;
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

const isRouteNotFound = (error: any) => {
  return error?.response?.status === 404 && typeof error?.response?.data === 'string';
};

const renameRouteUnavailableError = () => {
  return new Error('Rename endpoint is not available on the running backend. Please restart the backend server and try again.');
};

export const toAppSensor = (controllerId: string, sensor: HardwarePairingSensor): Sensor => {
  const appConfig = sensor.config?.appConfig as SensorConfigPayload | undefined;

  return {
    id: sensor.id,
    controller_id: controllerId,
    hw_id: sensor.sensorUid || sensor.id,
    type: sensor.type,
    name: sensor.name,
    status: normalizeStatus(sensor.status),
    config_active: sensor.configured,
    active_config: appConfig,
  };
};

const toHardwareThreshold = (rawValue: unknown): number | undefined => {
  return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : undefined;
};

const toHardwareAppConfig = (
  configResponse: HardwareSensorConfigResponse
): SensorConfigPayload => {
  const rawConfig = configResponse.config || {};
  const sensorType = (configResponse.sensorType || '').toLowerCase();
  const reportsPerDay =
    typeof rawConfig.reportsPerDay === 'number' && Number.isFinite(rawConfig.reportsPerDay)
      ? rawConfig.reportsPerDay
      : 24;
  const estimatedBatteryLifeDays =
    typeof rawConfig.estimatedBatteryLifeDays === 'number' && Number.isFinite(rawConfig.estimatedBatteryLifeDays)
      ? rawConfig.estimatedBatteryLifeDays
      : 77;

  const metricThresholds: SensorConfigPayload['metric_thresholds'] = {};
  if (sensorType === 'bme280' || sensorType === 'bmp280') {
    metricThresholds.temperature = {
      min: toHardwareThreshold(rawConfig.temperatureMin),
      max: toHardwareThreshold(rawConfig.temperatureMax),
      warning_min: toHardwareThreshold(rawConfig.temperatureWarningMin),
      warning_max: toHardwareThreshold(rawConfig.temperatureWarningMax),
    };
    metricThresholds.pressure = {
      min: toHardwareThreshold(rawConfig.pressureMin),
      max: toHardwareThreshold(rawConfig.pressureMax),
      warning_min: toHardwareThreshold(rawConfig.pressureWarningMin),
      warning_max: toHardwareThreshold(rawConfig.pressureWarningMax),
    };
  } else if (sensorType === 'vl53l0x' || sensorType === 'distance') {
    metricThresholds.distance = {
      min: toHardwareThreshold(rawConfig.distanceMin),
      max: toHardwareThreshold(rawConfig.distanceMax),
      warning_min: toHardwareThreshold(rawConfig.distanceWarningMin),
      warning_max: toHardwareThreshold(rawConfig.distanceWarningMax),
    };
  } else {
    metricThresholds.temperature = {
      min: toHardwareThreshold(rawConfig.temperatureMin),
      max: toHardwareThreshold(rawConfig.temperatureMax),
      warning_min: toHardwareThreshold(rawConfig.temperatureWarningMin),
      warning_max: toHardwareThreshold(rawConfig.temperatureWarningMax),
    };
    metricThresholds.humidity = {
      min: toHardwareThreshold(rawConfig.humidityMin),
      max: toHardwareThreshold(rawConfig.humidityMax),
      warning_min: toHardwareThreshold(rawConfig.humidityWarningMin),
      warning_max: toHardwareThreshold(rawConfig.humidityWarningMax),
    };
  }

  const primaryMetric =
    sensorType === 'vl53l0x' || sensorType === 'distance'
      ? 'distance'
      : sensorType === 'pressure'
        ? 'pressure'
        : 'temperature';
  const primaryThreshold = metricThresholds[primaryMetric] || {};

  return {
    friendly_name: configResponse.sensorName,
    use_case: configResponse.usedFor,
    presentation_profile: configResponse.dashboardView,
    primary_metric: primaryMetric,
    thresholds: primaryThreshold,
    metric_thresholds: metricThresholds,
    report_interval_per_day: reportsPerDay,
    power_management: {
      battery_life_days: estimatedBatteryLifeDays,
      sampling_frequency: reportsPerDay,
    },
    hardware_config: rawConfig,
  } as SensorConfigPayload;
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
        sensorUid: sensor.sensorUid || sensor.sensor_uid || sensor.hw_id,
        systemId: sensor.systemId || sensor.system_id,
        slotKey: sensor.slotKey || sensor.slot_key,
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
    systemId: data?.systemId || data?.system_id,
    systemName: data?.systemName || data?.system_name,
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

export const pairHardwareController = async (controllerId: string, systemId?: string): Promise<HardwarePairingResponse> => {
  const normalizedControllerId = extractControllerId(controllerId);
  if (!normalizedControllerId) {
    throw new Error('Invalid controller QR code');
  }

  if (!isMockMode()) {
    const response = await api.post('/api/controllers/pair', {
      controllerId: normalizedControllerId,
      systemId: systemId || undefined,
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
    const releaseByIdentifier = async (identifier: string) =>
      api.delete(`/api/controllers/${encodeURIComponent(identifier)}/claim`);

    try {
      await releaseByIdentifier(controllerId);
      return;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status !== 404 || /^CTRL-/i.test(controllerId)) {
        throw error;
      }

      const legacyResponse = await api.get<Controller>(API_ENDPOINTS.CONTROLLERS.GET(controllerId));
      const fallbackControllerId = extractControllerId(legacyResponse.data?.hw_id || '');
      if (!fallbackControllerId) {
        throw error;
      }

      await releaseByIdentifier(fallbackControllerId);
      return;
    }
  }

  const state = readStore();
  delete state[controllerId];
  writeStore(state);
};

export const getMyHardwareControllers = async (): Promise<Controller[]> => {
  if (isMockMode()) {
    return Object.values(readStore()).map((stored) => ({
      id: stored.controllerId,
      account_id: 'local-demo',
      hw_id: stored.controllerId,
      name: 'Paired Controller',
      status: normalizeControllerStatus(stored.status),
      created_at: stored.updatedAt,
    }));
  }

  const response = await api.get<{
    controllers?: Array<{
      controllerId: string;
      systemId?: string;
      systemName?: string;
      name?: string;
      status?: string;
    }>;
  }>('/api/controllers/my');

  const controllers = Array.isArray(response.data?.controllers)
    ? response.data.controllers
    : [];

  return controllers.map((controller) => ({
    id: controller.controllerId,
    account_id: '',
    hw_id: controller.controllerId,
    name: controller.systemName || controller.name,
    status: normalizeControllerStatus(controller.status),
    created_at: '',
  }));
};

export const getMySystems = async (): Promise<HardwareSystemSummary[]> => {
  if (isMockMode()) {
    return [];
  }

  const response = await api.get<{
    systems?: Array<{
      id: string;
      name: string;
      purpose?: string;
      location?: string;
      status?: string;
      activeControllerId?: string;
      activeControllerHw?: string;
      sensorCount?: number;
      configuredSensors?: number;
    }>;
  }>('/api/systems/my');

  const systems = Array.isArray(response.data?.systems) ? response.data.systems : [];
  return systems.map((system) => ({
    id: system.id,
    name: system.name,
    purpose: system.purpose,
    location: system.location,
    status: system.status || 'standby',
    activeControllerId: system.activeControllerId,
    activeControllerHw: system.activeControllerHw,
    sensorCount: system.sensorCount || 0,
    configuredSensors: system.configuredSensors || 0,
  }));
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
      systemId?: string;
      systemName?: string;
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
        name: controller.systemName || controller.name,
        status: normalizeControllerStatus(controller.status),
        created_at: '',
      };
    }
  }

  const response = await api.get<Controller>(`/controllers/${controllerId}`);
  return response.data;
};

export const getHardwareSensors = async (
  controllerId: string,
  options?: {
    liveOnly?: boolean;
  }
): Promise<Sensor[]> => {
  const stored = getStoredHardware(controllerId);
  if (stored) {
    const storedSensors = Array.isArray(stored.sensors) ? stored.sensors : [];
    return storedSensors.map((sensor) => toAppSensor(controllerId, sensor));
  }

  if (/^CTRL-/i.test(controllerId)) {
    const response = await api.get<{
      controllerId?: string;
      sensors?: HardwarePairingSensor[];
    }>(`/api/controllers/${encodeURIComponent(controllerId)}/sensors`, {
      params: options?.liveOnly ? { live: 'true' } : undefined,
    });

    const sensors = Array.isArray(response.data?.sensors) ? response.data.sensors : [];
    return sensors.map((sensor) => toAppSensor(controllerId, sensor));
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

    if (/^CTRL-/i.test(controllerId)) {
      const sensors = await getHardwareSensors(controllerId);
      const hardwareSensor = sensors.find((item) => item.id === sensorId || item.hw_id === sensorId);
      if (!hardwareSensor) {
        return getSensor(sensorId);
      }

      try {
        const configResponse = await api.get<HardwareSensorConfigResponse>(
          `/api/controllers/${encodeURIComponent(controllerId)}/sensors/${encodeURIComponent(sensorId)}/config`
        );
        const config = configResponse.data;
        return {
          ...hardwareSensor,
          name: config.sensorName || hardwareSensor.name,
          purpose: config.usedFor || hardwareSensor.purpose,
          config_active: true,
          active_config: config.appConfig || toHardwareAppConfig(config),
        };
      } catch (error: any) {
        if (error?.response?.status !== 404) {
          throw error;
        }
      }

      return hardwareSensor;
    }
  }

  return getSensor(sensorId);
};

export const renameHardwareController = async (
  controllerId: string,
  name: string
): Promise<Controller> => {
  const trimmedName = name.trim();

  if (isMockMode()) {
    const state = readStore();
    const current = state[controllerId] || mockPairingResponse(controllerId);
    state[controllerId] = {
      ...current,
      systemName: trimmedName,
      updatedAt: new Date().toISOString(),
    };
    writeStore(state);

    return {
      id: controllerId,
      account_id: 'local-demo',
      hw_id: controllerId,
      name: trimmedName,
      status: normalizeControllerStatus(current.status),
      created_at: state[controllerId].updatedAt,
    };
  }

  if (/^CTRL-/i.test(controllerId)) {
    let response;
    try {
      response = await api.patch<{
        controllerId: string;
        systemName?: string;
        name?: string;
        status?: string;
      }>(`/api/controllers/${encodeURIComponent(controllerId)}`, { name: trimmedName });
    } catch (error: any) {
      if (!isRouteNotFound(error)) {
        throw error;
      }

      try {
        response = await api.put<{
          controllerId: string;
          systemName?: string;
          name?: string;
          status?: string;
        }>(`/api/controllers/${encodeURIComponent(controllerId)}`, { name: trimmedName });
      } catch (fallbackError: any) {
        if (isRouteNotFound(fallbackError)) {
          throw renameRouteUnavailableError();
        }
        throw fallbackError;
      }
    }

    return {
      id: response.data.controllerId || controllerId,
      account_id: '',
      hw_id: response.data.controllerId || controllerId,
      name: response.data.systemName || response.data.name || trimmedName,
      status: normalizeControllerStatus(response.data.status),
      created_at: '',
    };
  }

  return updateController(controllerId, { name: trimmedName });
};

export const renameHardwareSensor = async (
  controllerId: string,
  sensorId: string,
  name: string
): Promise<Sensor> => {
  const trimmedName = name.trim();

  if (isMockMode()) {
    const state = readStore();
    const current = state[controllerId] || mockPairingResponse(controllerId);
    const nextSensors = (Array.isArray(current.sensors) ? current.sensors : []).map((sensor) =>
      sensor.id === sensorId || sensor.sensorUid === sensorId
        ? { ...sensor, name: trimmedName }
        : sensor
    );
    state[controllerId] = {
      ...current,
      sensors: nextSensors,
      updatedAt: new Date().toISOString(),
    };
    writeStore(state);

    const updatedSensor = nextSensors.find((sensor) => sensor.id === sensorId || sensor.sensorUid === sensorId);
    return updatedSensor ? toAppSensor(controllerId, updatedSensor) : getSensor(sensorId);
  }

  if (/^CTRL-/i.test(controllerId)) {
    let response;
    try {
      response = await api.patch<HardwarePairingSensor>(
        `/api/controllers/${encodeURIComponent(controllerId)}/sensors/${encodeURIComponent(sensorId)}`,
        { name: trimmedName }
      );
    } catch (error: any) {
      if (!isRouteNotFound(error)) {
        throw error;
      }

      try {
        response = await api.put<HardwarePairingSensor>(
          `/api/controllers/${encodeURIComponent(controllerId)}/sensors/${encodeURIComponent(sensorId)}`,
          { name: trimmedName }
        );
      } catch (fallbackError: any) {
        if (isRouteNotFound(fallbackError)) {
          throw renameRouteUnavailableError();
        }
        throw fallbackError;
      }
    }
    return toAppSensor(controllerId, response.data);
  }

  return updateSensor(sensorId, { name: trimmedName });
};

export const saveHardwareSensorConfiguration = async (
  request: SaveHardwareSensorConfigRequest
): Promise<void> => {
  if (!isMockMode()) {
    try {
      await api.post(`/api/controllers/${request.controllerId}/sensors/${request.sensorId}/config`, request);
      return;
    } catch (error: any) {
      /*
       * Hardware routes and legacy /sensors/{id}/config routes are not
       * interchangeable. Falling back with the hardware logical sensor UUID
       * produces misleading 404s and makes the UI look like save succeeded
       * even when the backend rejected it.
       */
      throw error;
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
    systemName: request.systemName || current.systemName,
    sensors: nextSensors,
    updatedAt: new Date().toISOString(),
  };
  writeStore(state);
};

export const getHardwareAISuggestedConfig = async (
  controllerId: string,
  sensorId: string,
  request: AISuggestRequest
): Promise<AISuggestResponse> => {
  const response = await api.post<AISuggestResponse>(
    `/api/controllers/${encodeURIComponent(controllerId)}/sensors/${encodeURIComponent(sensorId)}/ai-suggest-config`,
    request
  );
  return response.data;
};
