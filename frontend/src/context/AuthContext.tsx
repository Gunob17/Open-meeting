import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole, AuthResponse } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;          // Effective user (impersonated when active, otherwise real)
  realUser: User | null;      // Always the actual logged-in user — used by DevRoleWidget
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
  // Dev impersonation (only active in development mode)
  impersonatedUser: User | null;
  startImpersonation: (token: string, impUser: User) => void;
  stopImpersonation: () => void;
  // Dev role-only override (quick UI check without token swap)
  viewAsRole: UserRole | null;
  setViewAsRole: (role: UserRole | null) => void;
  viewAsReceptionist: boolean;
  setViewAsReceptionist: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [realUser, setRealUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [twofaPending, setTwofaPending] = useState(false);
  const [twofaSetupRequired, setTwofaSetupRequired] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(null);
  const [viewAsRole, setViewAsRole] = useState<UserRole | null>(null);
  const [viewAsReceptionist, setViewAsReceptionist] = useState(false);

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
          setRealUser(userData);
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

    setRealUser(response.user || null);
    setTwofaPending(false);
    setTwofaSetupRequired(false);
    return response;
  };

  const verifyTwoFa = async (code: string, trustDevice: boolean = false) => {
    const response = await api.twofaVerify(code, trustDevice);
    setRealUser(response.user || null);
    setTwofaPending(false);
    setTwofaSetupRequired(false);
  };

  const completeTwoFaSetup = async (code: string): Promise<{ backupCodes: string[] }> => {
    const response = await api.twofaSetupConfirm(code);
    if (response.user) {
      setRealUser(response.user);
    }
    setTwofaPending(false);
    setTwofaSetupRequired(false);
    return { backupCodes: response.backupCodes };
  };

  const startImpersonation = (token: string, impUser: User) => {
    api.setImpersonationToken(token);
    setImpersonatedUser(impUser);
    // Clear role-only overrides — impersonation gives us real scoped data
    setViewAsRole(null);
    setViewAsReceptionist(false);
  };

  const stopImpersonation = () => {
    api.setImpersonationToken(null);
    setImpersonatedUser(null);
  };

  const logout = () => {
    api.logout(); // also clears impersonation token
    setRealUser(null);
    setImpersonatedUser(null);
    setTwofaPending(false);
    setTwofaSetupRequired(false);
    setViewAsRole(null);
    setViewAsReceptionist(false);
  };

  // Effective user: impersonated user takes precedence over the real logged-in user
  const user = impersonatedUser ?? realUser;

  // Role flags are computed from the effective user's role, with optional quick override.
  // When impersonating, viewAsRole is always null so the impersonated user's real role is used.
  const effectiveRole = viewAsRole ?? user?.role;
  const effectiveAddonRoles = viewAsReceptionist ? ['receptionist'] : (user?.addonRoles ?? []);

  const isSuperAdmin = effectiveRole === UserRole.SUPER_ADMIN;
  const isParkAdmin = effectiveRole === UserRole.PARK_ADMIN || effectiveRole === UserRole.SUPER_ADMIN;
  const isAdmin = isParkAdmin; // Legacy alias
  const isCompanyAdmin = effectiveRole === UserRole.COMPANY_ADMIN || isParkAdmin;
  const isReceptionist = effectiveAddonRoles.includes('receptionist');

  return (
    <AuthContext.Provider value={{
      user, realUser, loading, login, verifyTwoFa, completeTwoFaSetup, logout,
      isSuperAdmin, isParkAdmin, isAdmin, isCompanyAdmin, isReceptionist,
      twofaPending, twofaSetupRequired,
      impersonatedUser, startImpersonation, stopImpersonation,
      viewAsRole, setViewAsRole, viewAsReceptionist, setViewAsReceptionist,
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
