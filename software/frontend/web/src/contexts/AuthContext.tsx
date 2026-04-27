import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, login as loginService, adminLogin as adminLoginService, register as registerService, logout as logoutService, User, LoginRequest, RegisterRequest } from '../services/authService';
import { getToken } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: LoginRequest) => Promise<User>;
  adminLogin: (credentials: LoginRequest) => Promise<User>;
  register: (data: RegisterRequest) => Promise<User | null>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const mapAuthUserToUser = (authUser: { id: string; email: string; name?: string; phone?: string; avatar_url?: string; account_type?: 'USER' | 'ADMIN'; status?: 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'DISABLED'; is_email_verified?: boolean }): User => {
  return {
    id: authUser.id,
    email: authUser.email,
    name: authUser.name,
    phone: authUser.phone,
    avatar_url: authUser.avatar_url,
    account_type: authUser.account_type,
    status: authUser.status,
    is_email_verified: authUser.is_email_verified,
    accounts: [],
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials: LoginRequest) => {
    const auth = await loginService(credentials);
    if (!auth.user) {
      throw new Error('Failed to sign in');
    }
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch {
      const mappedUser = mapAuthUserToUser(auth.user);
      setUser(mappedUser);
      return mappedUser;
    }
  };

  const adminLogin = async (credentials: LoginRequest) => {
    const auth = await adminLoginService(credentials);
    if (!auth.user) {
      throw new Error('Failed to sign in as admin');
    }
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch {
      const mappedUser = mapAuthUserToUser(auth.user);
      setUser(mappedUser);
      return mappedUser;
    }
  };

  const register = async (data: RegisterRequest) => {
    const auth = await registerService(data);
    if (!auth.user) {
      setUser(null);
      return null;
    }
    if (!auth.token) {
      setUser(null);
      return mapAuthUserToUser(auth.user);
    }
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch {
      const mappedUser = mapAuthUserToUser(auth.user);
      setUser(mappedUser);
      return mappedUser;
    }
  };

  const logout = async () => {
    await logoutService();
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, adminLogin, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
