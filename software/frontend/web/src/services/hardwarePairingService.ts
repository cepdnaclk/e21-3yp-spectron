import api from './api';
import { pairController, Controller } from './controllerService';
import {
  getSensor,
  getSensors,
  saveSensorConfig,
  Sensor,
  SensorConfig as SensorConfigPayload,
} from './sensorService';

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
  controllerId: string;
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
  return readStore()[controllerId] || null;
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

const toHardwareSensor = (sensor: Sensor): HardwarePairingSensor => ({
  id: sensor.id,
  name: sensor.name || `${sensor.type} Sensor`,
  type: sensor.type,
  status: sensor.status === 'OK' ? 'live' : sensor.status.toLowerCase(),
  configured: Boolean(sensor.config_active),
  config: sensor.active_config ? { appConfig: sensor.active_config } : undefined,
});

const normalizePairingResponse = (data: any, fallbackToken: string): HardwarePairingResponse => {
  const controllerId =
    data?.controllerId ||
    data?.controller_id ||
    data?.id ||
    (fallbackToken.toUpperCase().startsWith('CTRL-') ? fallbackToken.toUpperCase() : 'CTRL-8F2A19');

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
    controllerId,
    status: data?.status || 'paired',
    sensors,
  };
};

const mockPairingResponse = (token: string): HardwarePairingResponse => ({
  controllerId: token.toUpperCase().startsWith('CTRL-') ? token.toUpperCase() : 'CTRL-8F2A19',
  status: 'paired',
  sensors: [
    {
      id: 'sensor-load-01',
      name: 'Load Sensor',
      type: 'load',
      status: 'live',
      configured: false,
    },
    {
      id: 'sensor-temp-01',
      name: 'Temperature & Humidity Sensor',
      type: 'temperature_humidity',
      status: 'live',
      configured: true,
      config: {
        appConfig: {
          friendly_name: 'Temperature & Humidity Sensor',
          use_case: 'climate_monitoring',
          presentation_profile: 'dual_climate',
          primary_metric: 'temperature',
          thresholds: {
            min: 20,
            max: 35,
            warning_min: 18,
            warning_max: 38,
          },
          metric_thresholds: {
            temperature: {
              min: 20,
              max: 35,
              warning_min: 18,
              warning_max: 38,
            },
            humidity: {
              min: 40,
              max: 80,
              warning_min: 35,
              warning_max: 85,
            },
          },
          report_interval_per_day: 24,
          power_management: {
            battery_life_days: 77,
            sampling_frequency: 24,
          },
        },
      },
    },
    {
      id: 'sensor-ultra-01',
      name: 'Ultrasonic Sensor',
      type: 'ultrasonic',
      status: 'live',
      configured: false,
    },
  ],
});

export const extractPairingToken = (value: string): string => {
  const raw = (value || '').trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = JSON.parse(raw);
    const fromJson = parsed?.pairingCode || parsed?.pairing_code || parsed?.code || parsed?.controllerId || parsed?.controller_id;
    if (typeof fromJson === 'string') {
      return extractPairingToken(fromJson);
    }
  } catch {
    // Continue with URL/direct parsing.
  }

  const directMatch = raw.match(/(?:PAIR|CTRL)-[A-Z0-9-]+/i);
  if (directMatch) {
    return directMatch[0].toUpperCase();
  }

  try {
    const url = new URL(raw, window.location.origin);
    const fromQuery =
      url.searchParams.get('code') ||
      url.searchParams.get('pairingCode') ||
      url.searchParams.get('pairing_code') ||
      url.searchParams.get('qr_token') ||
      url.searchParams.get('hw_id') ||
      url.searchParams.get('controllerId') ||
      url.searchParams.get('controller_id') ||
      url.searchParams.get('id') ||
      '';

    if (fromQuery) {
      return extractPairingToken(fromQuery);
    }

    const fromPath = url.pathname.split('/').filter(Boolean).pop() || '';
    if (/^(PAIR|CTRL)-/i.test(fromPath)) {
      return extractPairingToken(fromPath);
    }
  } catch {
    // Not a URL.
  }

  return '';
};

export const pairHardwareController = async (token: string): Promise<HardwarePairingResponse> => {
  const normalizedToken = extractPairingToken(token);
  if (!normalizedToken) {
    throw new Error('Invalid QR code');
  }

  if (!isMockMode()) {
    try {
      const response = await api.post('/api/controllers/pair', {
        pairingTokenOrControllerId: normalizedToken,
      });
      const pairing = normalizePairingResponse(response.data, normalizedToken);
      savePairedHardware(pairing);
      return pairing;
    } catch {
      try {
        const controller = await pairController({ qr_token: normalizedToken });
        const sensors = await getSensors(controller.id);
        const pairing = normalizePairingResponse(
          {
            controllerId: controller.id,
            status: 'paired',
            sensors: sensors.map(toHardwareSensor),
          },
          normalizedToken
        );
        savePairedHardware(pairing);
        return pairing;
      } catch {
        // Fall through to mock response for demo continuity.
      }
    }
  }

  const pairing = mockPairingResponse(normalizedToken);
  savePairedHardware(pairing);
  return pairing;
};

export const getHardwareController = async (controllerId: string): Promise<Controller> => {
  const stored = getStoredHardware(controllerId);
  if (stored) {
    return {
      id: stored.controllerId,
      account_id: 'local-demo',
      hw_id: stored.controllerId,
      name: 'Paired Controller',
      status: 'ONLINE',
      created_at: stored.updatedAt,
    };
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
