import React from 'react';
import { Route, Redirect, RouteProps } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps extends RouteProps {
  allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles, component: Component, render, children, ...rest }) => {
  const { isAuthenticated, hasPermission } = useAuth();

  return (
    <Route
      {...rest}
      render={(props) => {
        if (!isAuthenticated) {
          return <Redirect to={{ pathname: '/login', state: { from: props.location } }} />;
        }

        if (allowedRoles && !hasPermission(allowedRoles)) {
          return <Redirect to="/" />;
        }

        if (Component) {
          return <Component {...props} />;
        }

        if (render) {
          return render(props);
        }

        return children;
      }}
    />
  );
};

export default ProtectedRoute;