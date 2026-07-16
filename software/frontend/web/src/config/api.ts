const DEPLOYED_API_BASE_URL = 'http://spectron-backend-env.eba-3uqs3iea.ap-south-1.elasticbeanstalk.com';

const configuredApiBaseUrl = process.env.REACT_APP_API_URL?.trim().replace(/\/$/, '');

const normalizeApiBaseUrl = (configuredUrl?: string) => configuredUrl || DEPLOYED_API_BASE_URL;

export const API_BASE_URL = normalizeApiBaseUrl(configuredApiBaseUrl);

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    ADMIN_LOGIN: '/auth/admin/login',
    REGISTER: '/auth/register',
    VERIFY_EMAIL: '/auth/verify-email',
    RESEND_VERIFICATION: '/auth/resend-verification',
    ME: '/auth/me',
    CHANGE_PASSWORD: '/auth/change-password',
  },
  CONTROLLERS: {
    LIST: '/controllers',
    GET: (id: string) => `/controllers/${id}`,
    UPDATE: (id: string) => `/controllers/${id}`,
  },
  FARMS: {
    LIST: '/api/farms',
    CREATE: '/api/farms',
    GET: (id: string) => `/api/farms/${id}`,
    UPDATE: (id: string) => `/api/farms/${id}`,
    FIELDS: (id: string) => `/api/farms/${id}/fields`,
    CROPS: '/api/crops',
    FIELD_CROP_INSTANCES: (fieldId: string) => `/api/fields/${fieldId}/crop-instances`,
    CONFIRM_STAGE: (cropInstanceId: string) => `/api/crop-instances/${cropInstanceId}/stage-confirmation`,
    CONTROLLERS: (farmId: string) => `/api/farms/${farmId}/controllers`,
    SENSOR_BASES: (farmId: string) => `/api/farms/${farmId}/sensor-bases`,
    ASSIGN_SENSOR_BASE: (baseId: string) => `/api/sensor-bases/${baseId}/assignment`,
    SENSOR_BASE_ASSIGNMENTS: (baseId: string) => `/api/sensor-bases/${baseId}/assignments`,
    SENSOR_MODULES: (baseId: string) => `/api/sensor-bases/${baseId}/modules`,
    ALERTS: (farmId: string) => `/api/farms/${farmId}/alerts`,
    ACK_ALERT: (farmId: string, alertId: string) => `/api/farms/${farmId}/alerts/${alertId}/ack`,
    COLLABORATORS: (id: string) => `/api/farms/${id}/collaborators`,
    REMOVE_COLLABORATOR: (farmId: string, userId: string) => `/api/farms/${farmId}/collaborators/${userId}`,
  },
  SENSORS: {
    LIST: (controllerId: string) => `/controllers/${controllerId}/sensors`,
    GET: (id: string) => `/sensors/${id}`,
    UPDATE: (id: string) => `/sensors/${id}`,
    AI_SUGGEST: (id: string) => `/sensors/${id}/ai-suggest-config`,
    CONFIG: (id: string) => `/sensors/${id}/config`,
    ATTENDANCE: (id: string) => `/sensors/${id}/attendance`,
    RESET_ATTENDANCE: (id: string) => `/sensors/${id}/attendance/reset`,
    LEARNING_PHASE: (id: string) => `/sensors/${id}/learning-phase`,
    LEARNING_PHASE_SUGGESTIONS: (id: string) => `/sensors/${id}/learning-phase/suggestions`,
    LEARNING_PHASE_APPLY: (id: string) => `/sensors/${id}/learning-phase/apply`,
  },
  DASHBOARD: {
    OVERVIEW: '/dashboard/overview',
    CONTROLLER: (id: string) => `/controllers/${id}/dashboard`,
  },
  READINGS: {
    GET: (sensorId: string) => `/sensors/${sensorId}/readings`,
  },
  ALERTS: {
    LIST: '/alerts',
    ACK: (id: string) => `/alerts/${id}/ack`,
    APPLY_RECOMMENDATION: (id: string) => `/alerts/${id}/apply-recommendation`,
  },
  USERS: {
    LIST: '/users',
    CREATE_VIEWER: '/users/viewers',
    DELETE_VIEWER: (id: string) => `/users/viewers/${id}`,
  },
};
