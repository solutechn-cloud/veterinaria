
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
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
    // Redirect to login while saving the attempted location using v6 syntax
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Nueva validación por permiso específico
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  // Validación Legacy por Rol (si no se pasa permission)
  if (!requiredPermission && allowedRoles && !allowedRoles.some(r => hasPermission(r.toUpperCase()) || hasPermission())) {
     return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
