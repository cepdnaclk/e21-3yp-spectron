import api, { setToken, removeToken, getToken } from './api';
import { API_ENDPOINTS } from '../config/api';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  phone?: string;
  name?: string;
  organizationName?: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name?: string;
    phone?: string;
    avatar_url?: string;
    account_type?: 'USER' | 'ADMIN';
    status?: 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'DISABLED';
  };
  status?: 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'DISABLED';
  message?: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  avatar_url?: string;
  account_type?: 'USER' | 'ADMIN';
  status?: 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'DISABLED';
  accounts: Array<{
    id: string;
    name: string;
    role: 'OWNER' | 'ADMIN' | 'VIEWER';
  }>;
}

type MeResponse =
  | User
  | {
      user: {
        id: string;
        email: string;
        name?: string;
        phone?: string;
        avatar_url?: string;
        account_type?: 'USER' | 'ADMIN';
        status?: 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'DISABLED';
      };
      accounts?: Array<{
        id: string;
        name: string;
        role?: 'OWNER' | 'ADMIN' | 'VIEWER';
      }>;
    };

const normalizeUser = (data: MeResponse): User => {
  if ('user' in data) {
    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      phone: data.user.phone,
      avatar_url: data.user.avatar_url,
      account_type: data.user.account_type,
      status: data.user.status,
      accounts: (data.accounts || []).map((account) => ({
        ...account,
        role: account.role || 'VIEWER',
      })),
    };
  }

  return {
    ...data,
    accounts: (data.accounts || []).map((account) => ({
      ...account,
      role: account.role || 'VIEWER',
    })),
  };
};

export const login = async (credentials: LoginRequest): Promise<AuthResponse> => {
  const response = await api.post<AuthResponse>(API_ENDPOINTS.AUTH.LOGIN, credentials);
  setToken(response.data.token, 'user');
  return response.data;
};

export const adminLogin = async (credentials: LoginRequest): Promise<AuthResponse> => {
  const response = await api.post<AuthResponse>(API_ENDPOINTS.AUTH.ADMIN_LOGIN, credentials);
  setToken(response.data.token, 'admin');
  return response.data;
};

export const register = async (data: RegisterRequest): Promise<AuthResponse> => {
  const response = await api.post<AuthResponse>(API_ENDPOINTS.AUTH.REGISTER, data);
  if (response.data.token) {
    setToken(response.data.token, 'user');
  }
  return response.data;
};

export const getCurrentUser = async (): Promise<User> => {
  if (!getToken()) {
    throw new Error('No authentication token');
  }

  const response = await api.get<MeResponse>(API_ENDPOINTS.AUTH.ME);
  return normalizeUser(response.data);
};

export const logout = async (): Promise<void> => {
  removeToken();
};

export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
  avatar_url?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface DeleteAccountRequest {
  confirm_email: string;
}

export const updateProfile = async (data: UpdateProfileRequest): Promise<User> => {
  const response = await api.patch<User>(API_ENDPOINTS.AUTH.ME, data);
  return normalizeUser(response.data);
};

export const changePassword = async (data: ChangePasswordRequest): Promise<void> => {
  await api.post(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, data);
};

export const deleteAccount = async (data: DeleteAccountRequest): Promise<void> => {
  await api.delete(API_ENDPOINTS.AUTH.ME, { data });
  removeToken('user');
};

export interface AccountUser {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'DISABLED';
  created_at: string;
  role: 'OWNER' | 'ADMIN' | 'VIEWER';
}

export interface CreateViewerRequest {
  email: string;
  password: string;
  name?: string;
  phone?: string;
}

export const getAccountUsers = async (): Promise<AccountUser[]> => {
  const response = await api.get<{ users?: AccountUser[] }>(API_ENDPOINTS.USERS.LIST);
  return response.data.users || [];
};

export const createViewer = async (data: CreateViewerRequest): Promise<User> => {
  const response = await api.post<User>(API_ENDPOINTS.USERS.CREATE_VIEWER, data);
  return normalizeUser(response.data);
};
