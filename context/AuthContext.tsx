
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserSession, LoginCredentials, AuthResponse } from '../types';

interface AuthContextType {
  user: UserSession | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  hasPermission: (requiredPermission?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Decodifica el payload del JWT sin verificar firma (solo cliente)
function decodeJWTPayload(token: string): { exp?: number; [key: string]: any } | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJWTPayload(token);
  if (!payload?.exp) return true;
  // Considera expirado si queda menos de 60s
  return Date.now() >= (payload.exp - 60) * 1000;
}

const KEYS = {
  token: 'sc_token',
  refresh: 'sc_refresh',
  user: 'sc_user',
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const clearSession = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(KEYS.token);
    localStorage.removeItem(KEYS.refresh);
    localStorage.removeItem(KEYS.user);
  };

  const applySession = (accessToken: string, userData: UserSession, refreshToken?: string) => {
    setToken(accessToken);
    setUser(userData);
    localStorage.setItem(KEYS.token, accessToken);
    localStorage.setItem(KEYS.user, JSON.stringify(userData));
    if (refreshToken) localStorage.setItem(KEYS.refresh, refreshToken);
  };

  const silentRefresh = useCallback(async (): Promise<boolean> => {
    const storedRefresh = localStorage.getItem(KEYS.refresh);
    if (!storedRefresh || isTokenExpired(storedRefresh)) return false;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      applySession(data.token, data.user);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Restaurar sesión al montar — espera a resolver antes de renderizar rutas protegidas
  useEffect(() => {
    // Migrar keys viejas si existen
    const oldToken = localStorage.getItem('smartcloud_token');
    const oldUser = localStorage.getItem('smartcloud_user');
    if (oldToken && !localStorage.getItem(KEYS.token)) {
      localStorage.setItem(KEYS.token, oldToken);
      if (oldUser) localStorage.setItem(KEYS.user, oldUser);
      localStorage.removeItem('smartcloud_token');
      localStorage.removeItem('smartcloud_user');
    }

    const restore = async () => {
      const storedToken = localStorage.getItem(KEYS.token);
      const storedUser = localStorage.getItem(KEYS.user);

      if (storedToken && storedUser) {
        if (!isTokenExpired(storedToken)) {
          // Token de acceso aún válido
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        } else {
          // Token expirado → intentar refresh silencioso
          const ok = await silentRefresh();
          if (!ok) clearSession();
        }
      }
      setIsInitializing(false);
    };
    restore();
  }, [silentRefresh]);

  const login = async (credentials: LoginCredentials) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error de autenticación');
    }

    const data: AuthResponse & { refreshToken?: string } = await response.json();
    applySession(data.token, data.user, data.refreshToken);
  };

  const logout = () => {
    clearSession();
  };

  const hasPermission = (requiredPermission?: string) => {
    if (!user) return false;
    if (user.rol === 'Administrador' || user.rol === 'Admin') return true;
    if (!requiredPermission) return true;
    return user.permisos?.includes(requiredPermission) || false;
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, isInitializing, login, logout, hasPermission }}>
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
