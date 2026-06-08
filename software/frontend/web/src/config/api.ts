export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8081';

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
  SENSORS: {
    LIST: (controllerId: string) => `/controllers/${controllerId}/sensors`,
    GET: (id: string) => `/sensors/${id}`,
    UPDATE: (id: string) => `/sensors/${id}`,
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
    APPLY_RECOMMENDATION: (id: string) => `/alerts/${id}/apply-recommendation`,
  },
  USERS: {
    LIST: '/users',
    CREATE_VIEWER: '/users/viewers',
  },
};
