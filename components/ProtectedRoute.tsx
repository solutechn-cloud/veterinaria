
import React from 'react';
import { Redirect, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[]; // Deprecated, kept for compat if needed, but priority is permission
  requiredPermission?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requiredPermission }) => {
  const { isAuthenticated, hasPermission } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Redirect to login while saving the attempted location
    return <Redirect to={{ pathname: "/login", state: { from: location } }} />;
  }

  // Nueva validación por permiso específico
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Redirect to="/" />;
  }

  // Validación Legacy por Rol (si no se pasa permission)
  if (!requiredPermission && allowedRoles && !allowedRoles.some(r => hasPermission(r.toUpperCase()) || hasPermission())) {
     return <Redirect to="/" />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
