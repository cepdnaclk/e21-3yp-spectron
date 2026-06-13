import axios, { AxiosInstance } from 'axios';
import { Capacitor } from '@capacitor/core';
import { API_BASE_URL } from '../config/api';
import { capacitorHttpAdapter } from './capacitorHttpAdapter';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  adapter: Capacitor.isNativePlatform() ? capacitorHttpAdapter : undefined,
  headers: {
    'Content-Type': 'application/json',
  },
});

type AuthScope = 'user' | 'admin';

const LEGACY_TOKEN_KEY = 'spectron_auth_token';
const USER_TOKEN_KEY = 'spectron_user_auth_token';
const ADMIN_TOKEN_KEY = 'spectron_admin_auth_token';

const tokenKeyForScope = (scope: AuthScope) => {
  return scope === 'admin' ? ADMIN_TOKEN_KEY : USER_TOKEN_KEY;
};

const inferAuthScope = (requestUrl = ''): AuthScope => {
  if (requestUrl.includes('/auth/admin') || requestUrl.includes('/api/admin')) {
    return 'admin';
  }
  return window.location.pathname.startsWith('/admin') ? 'admin' : 'user';
};

export const getToken = (scope: AuthScope = inferAuthScope()): string | null => {
  return localStorage.getItem(tokenKeyForScope(scope));
};

export const setToken = (token: string, scope: AuthScope = inferAuthScope()): void => {
  localStorage.setItem(tokenKeyForScope(scope), token);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
};

export const removeToken = (scope: AuthScope = inferAuthScope()): void => {
  localStorage.removeItem(tokenKeyForScope(scope));
  localStorage.removeItem(LEGACY_TOKEN_KEY);
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
