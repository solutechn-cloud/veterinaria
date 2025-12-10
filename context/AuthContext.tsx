import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserSession, LoginCredentials, AuthResponse } from '../types';

interface AuthContextType {
  user: UserSession | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  hasPermission: (allowedRoles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Restaurar sesión al recargar página
    const storedToken = localStorage.getItem('smartcloud_token');
    const storedUser = localStorage.getItem('smartcloud_user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error de autenticación');
    }

    const data: AuthResponse = await response.json();
    setToken(data.token);
    setUser(data.user);

    localStorage.setItem('smartcloud_token', data.token);
    localStorage.setItem('smartcloud_user', JSON.stringify(data.user));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('smartcloud_token');
    localStorage.removeItem('smartcloud_user');
  };

  const hasPermission = (allowedRoles: string[]) => {
    if (!user) return false;
    // Si la lista de roles permitidos incluye 'ALL', o el rol del usuario está en la lista
    if (allowedRoles.includes('ALL')) return true;
    return allowedRoles.some(role => user.rol.toUpperCase().includes(role.toUpperCase()));
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, login, logout, hasPermission }}>
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