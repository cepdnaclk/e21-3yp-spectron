export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8081';

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    ADMIN_LOGIN: '/auth/admin/login',
    REGISTER: '/auth/register',
    ME: '/auth/me',
    CHANGE_PASSWORD: '/auth/change-password',
  },
  CONTROLLERS: {
    LIST: '/controllers',
    GET: (id: string) => `/controllers/${id}`,
    PAIR: '/controllers/pair',
    UPDATE: (id: string) => `/controllers/${id}`,
  },
  SENSORS: {
    LIST: (controllerId: string) => `/controllers/${controllerId}/sensors`,
    GET: (id: string) => `/sensors/${id}`,
    AI_SUGGEST: (id: string) => `/sensors/${id}/ai-suggest-config`,
    CONFIG: (id: string) => `/sensors/${id}/config`,
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
  },
  USERS: {
    LIST: '/users',
    CREATE_VIEWER: '/users/viewers',
  },
};
