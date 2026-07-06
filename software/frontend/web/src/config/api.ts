const DEPLOYED_API_BASE_URL = 'http://spectron-backend-env.eba-3uqs3iea.ap-south-1.elasticbeanstalk.com';

const configuredApiBaseUrl = process.env.REACT_APP_API_URL?.trim().replace(/\/$/, '');

const normalizeApiBaseUrl = (configuredUrl?: string) => {
  if (!configuredUrl) {
    return DEPLOYED_API_BASE_URL;
  }

  try {
    const url = new URL(configuredUrl);
    if (url.hostname.endsWith('.elasticbeanstalk.com')) {
      return DEPLOYED_API_BASE_URL;
    }
  } catch {
    return configuredUrl;
  }

  return configuredUrl;
};

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
