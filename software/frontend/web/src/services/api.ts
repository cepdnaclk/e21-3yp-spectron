import axios, { AxiosInstance } from 'axios';
import { Capacitor } from '@capacitor/core';
import { API_BASE_URL } from '../config/api';
import { capacitorHttpAdapter } from './capacitorHttpAdapter';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  // Native Android requests avoid WebView cross-origin restrictions while still
  // using Android's HTTPS certificate validation for the deployed API.
  ...(Capacitor.isNativePlatform() ? { adapter: capacitorHttpAdapter } : {}),
});

type AuthScope = 'user' | 'admin';

const LEGACY_TOKEN_KEY = 'spectron_auth_token';
const USER_TOKEN_KEY = 'spectron_user_auth_token';
const ADMIN_TOKEN_KEY = 'spectron_admin_auth_token';
const AUTH_BASE_KEY = 'spectron_auth_base';

const normalizedAuthBase = API_BASE_URL.replace(/\/$/, '');

const migrateLegacyToken = (scope: AuthScope, key: string) => {
  const legacyKey = tokenKeyForScope(scope, false);
  const legacyValue = localStorage.getItem(legacyKey) || localStorage.getItem(LEGACY_TOKEN_KEY);
  if (!legacyValue) {
    return null;
  }

  localStorage.setItem(key, legacyValue);
  localStorage.setItem(AUTH_BASE_KEY, normalizedAuthBase);
  localStorage.removeItem(legacyKey);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  return legacyValue;
};

const tokenKeyForScope = (scope: AuthScope, includeBase = true) => {
  const baseKey = scope === 'admin' ? ADMIN_TOKEN_KEY : USER_TOKEN_KEY;
  if (!includeBase) {
    return baseKey;
  }
  return `${baseKey}:${normalizedAuthBase}`;
};

const inferAuthScope = (requestUrl = ''): AuthScope => {
  if (requestUrl.includes('/auth/admin') || requestUrl.includes('/api/admin')) {
    return 'admin';
  }
  return window.location.pathname.startsWith('/admin') ? 'admin' : 'user';
};

export const getToken = (scope: AuthScope = inferAuthScope()): string | null => {
  const key = tokenKeyForScope(scope);
  const storedBase = localStorage.getItem(AUTH_BASE_KEY);

  if (storedBase && storedBase !== normalizedAuthBase) {
    return null;
  }

  const scopedToken = localStorage.getItem(key);
  if (scopedToken) {
    return scopedToken;
  }

  return migrateLegacyToken(scope, key);
};

export const setToken = (token: string, scope: AuthScope = inferAuthScope()): void => {
  localStorage.setItem(tokenKeyForScope(scope), token);
  localStorage.setItem(AUTH_BASE_KEY, normalizedAuthBase);
  localStorage.removeItem(tokenKeyForScope(scope, false));
  localStorage.removeItem(LEGACY_TOKEN_KEY);
};

export const removeToken = (scope: AuthScope = inferAuthScope()): void => {
  localStorage.removeItem(tokenKeyForScope(scope));
  localStorage.removeItem(tokenKeyForScope(scope, false));
  localStorage.removeItem(LEGACY_TOKEN_KEY);

  const userToken = localStorage.getItem(tokenKeyForScope('user'));
  const adminToken = localStorage.getItem(tokenKeyForScope('admin'));
  if (!userToken && !adminToken) {
    localStorage.removeItem(AUTH_BASE_KEY);
  }
};

api.interceptors.request.use(
  (config) => {
    const token = getToken(inferAuthScope(config.url || ''));
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || '';
      const requestScope = inferAuthScope(requestUrl);
      removeToken(requestScope);
      const currentPath = window.location.pathname;
      const isAuthRequest =
        requestUrl.includes('/auth/login') ||
        requestUrl.includes('/auth/admin/login') ||
        requestUrl.includes('/auth/register');

      if (!isAuthRequest) {
        window.location.href = currentPath.startsWith('/admin') ? '/admin/signin' : '/signin';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
