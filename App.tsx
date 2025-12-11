
import React from 'react';
import { HashRouter, Switch, Route, Redirect } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Clients from './pages/Clients';
import Providers from './pages/Providers';
import CashRegister from './pages/CashRegister';
import Costs from './pages/Costs';
import Login from './pages/Login';
import AdminUsers from './pages/AdminUsers';
import Packages from './pages/Packages';
import AdminCashDashboard from './pages/AdminCashDashboard';
import Reports from './pages/Reports';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <Switch>
          <Route path="/login" component={Login} />

          {/* Ruta protegida principal que envuelve el Layout */}
          <Route path="/">
            <ProtectedRoute>
              <Layout>
                <Switch>
                  <Route exact path="/" component={Dashboard} />
                  
                  {/* Rutas Protegidas por Permisos Específicos */}
                  <Route path="/pos">
                    <ProtectedRoute requiredPermission="VER_POS"><POS /></ProtectedRoute>
                  </Route>
                  <Route path="/clients">
                    <ProtectedRoute requiredPermission="VER_CLIENTES"><Clients /></ProtectedRoute>
                  </Route>
                  <Route path="/packages">
                    <ProtectedRoute requiredPermission="GESTIONAR_INVENTARIO"><Packages /></ProtectedRoute>
                  </Route>
                  
                  <Route path="/providers">
                    <ProtectedRoute requiredPermission="VER_PROVEEDORES"><Providers /></ProtectedRoute>
                  </Route>
                  <Route path="/inventory">
                    <ProtectedRoute requiredPermission="VER_INVENTARIO"><Inventory /></ProtectedRoute>
                  </Route>
                  
                  <Route path="/cash">
                    <ProtectedRoute requiredPermission="VER_CAJA"><CashRegister /></ProtectedRoute>
                  </Route>
                  <Route path="/costs">
                    <ProtectedRoute requiredPermission="VER_COSTOS"><Costs /></ProtectedRoute>
                  </Route>

                  <Route path="/reports">
                    <ProtectedRoute requiredPermission="VER_REPORTES"><Reports /></ProtectedRoute>
                  </Route>
                  
                  {/* Rutas de Administración */}
                  <Route path="/admin/cash-dashboard">
                    <ProtectedRoute requiredPermission="VER_ADMIN"><AdminCashDashboard /></ProtectedRoute>
                  </Route>
                  <Route path="/admin/users">
                    <ProtectedRoute requiredPermission="GESTIONAR_USUARIOS"><AdminUsers initialView="USERS" /></ProtectedRoute>
                  </Route>
                  <Route path="/admin/employees">
                    <ProtectedRoute requiredPermission="GESTIONAR_USUARIOS"><AdminUsers initialView="EMPLOYEES" /></ProtectedRoute>
                  </Route>
                  <Route path="/admin/roles">
                    <ProtectedRoute requiredPermission="GESTIONAR_ROLES"><AdminUsers initialView="ROLES" /></ProtectedRoute>
                  </Route>
                  <Route path="/admin/boxes">
                    <ProtectedRoute requiredPermission="GESTIONAR_ROLES"><AdminUsers initialView="CAJAS" /></ProtectedRoute>
                  </Route>

                  {/* Redirección por defecto */}
                  <Redirect to="/" />
                </Switch>
              </Layout>
            </ProtectedRoute>
          </Route>

        </Switch>
      </HashRouter>
    </AuthProvider>
  );
};

export default App;
