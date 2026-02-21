import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole, AuthResponse } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, keepLoggedIn?: boolean) => Promise<AuthResponse>;
  verifyTwoFa: (code: string, trustDevice?: boolean) => Promise<void>;
  completeTwoFaSetup: (code: string) => Promise<{ backupCodes: string[] }>;
  logout: () => void;
  isSuperAdmin: boolean;
  isParkAdmin: boolean;
  isAdmin: boolean;
  isCompanyAdmin: boolean;
  isReceptionist: boolean;
  twofaPending: boolean;
  twofaSetupRequired: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [twofaPending, setTwofaPending] = useState(false);
  const [twofaSetupRequired, setTwofaSetupRequired] = useState(false);

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      // If user had "keep me logged in" but has been inactive for 7+ days, force logout
      if (api.getKeepLoggedIn() && api.isInactive()) {
        api.logout();
        setLoading(false);
        return;
      }
      api.getCurrentUser()
        .then((userData) => {
          setUser(userData);
          // Silently refresh the token to extend the session
          if (api.getKeepLoggedIn()) {
            api.refreshToken().catch(() => {});
          }
        })
        .catch(() => {
          api.logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string, keepLoggedIn?: boolean): Promise<AuthResponse> => {
    const response = await api.login(email, password, keepLoggedIn || false);

    if (response.requiresTwoFa) {
      setTwofaPending(true);
      setTwofaSetupRequired(!!response.twofaSetupRequired);
      return response;
    }

    setUser(response.user || null);
    setTwofaPending(false);
    setTwofaSetupRequired(false);
    return response;
  };

  const verifyTwoFa = async (code: string, trustDevice: boolean = false) => {
    const response = await api.twofaVerify(code, trustDevice);
    setUser(response.user || null);
    setTwofaPending(false);
    setTwofaSetupRequired(false);
  };

  const completeTwoFaSetup = async (code: string): Promise<{ backupCodes: string[] }> => {
    const response = await api.twofaSetupConfirm(code);
    if (response.user) {
      setUser(response.user);
    }
    setTwofaPending(false);
    setTwofaSetupRequired(false);
    return { backupCodes: response.backupCodes };
  };

  const logout = () => {
    api.logout();
    setUser(null);
    setTwofaPending(false);
    setTwofaSetupRequired(false);
  };

  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isParkAdmin = user?.role === UserRole.PARK_ADMIN || user?.role === UserRole.SUPER_ADMIN;
  const isAdmin = isParkAdmin; // Legacy alias
  const isCompanyAdmin = user?.role === UserRole.COMPANY_ADMIN || isParkAdmin;
  const isReceptionist = !!user?.addonRoles?.includes('receptionist');

  return (
    <AuthContext.Provider value={{
      user, loading, login, verifyTwoFa, completeTwoFaSetup, logout,
      isSuperAdmin, isParkAdmin, isAdmin, isCompanyAdmin, isReceptionist,
      twofaPending, twofaSetupRequired
    }}>
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
