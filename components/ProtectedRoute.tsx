
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  requiredPermission?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requiredPermission }) => {
  const { isAuthenticated, hasPermission } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Nueva validación por permiso específico
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  // Validación Legacy por Rol
  if (!requiredPermission && allowedRoles && !allowedRoles.some(r => hasPermission(r.toUpperCase()) || hasPermission())) {
     return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
