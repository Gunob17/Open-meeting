import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isSuperAdmin: boolean;
  isParkAdmin: boolean;
  isAdmin: boolean; // Legacy: park admin or above
  isCompanyAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api.getCurrentUser()
        .then(setUser)
        .catch(() => {
          api.logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.login(email, password);
    setUser(response.user);
  };

  const logout = () => {
    api.logout();
    setUser(null);
  };

  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isParkAdmin = user?.role === UserRole.PARK_ADMIN || user?.role === UserRole.SUPER_ADMIN;
  const isAdmin = isParkAdmin; // Legacy alias
  const isCompanyAdmin = user?.role === UserRole.COMPANY_ADMIN || isParkAdmin;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isSuperAdmin, isParkAdmin, isAdmin, isCompanyAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
