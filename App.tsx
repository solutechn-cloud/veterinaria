import React from 'react';
import { HashRouter, Switch, Route, Redirect } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import CashRegister from './pages/CashRegister';
import Login from './pages/Login';
import AdminUsers from './pages/AdminUsers';

// Placeholder components
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-96 text-slate-400">
    <h2 className="text-2xl font-bold mb-2">{title}</h2>
    <p>Módulo en construcción o migración</p>
  </div>
);

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <Switch>
          <Route path="/login" component={Login} />

          {/* Wrapper Route for all protected pages */}
          <Route path="/">
            <ProtectedRoute>
              <Layout>
                <Switch>
                  <Route exact path="/" component={Dashboard} />
                  
                  <ProtectedRoute 
                    path="/pos" 
                    component={POS} 
                    allowedRoles={['Administrador', 'Vendedor']} 
                  />
                  
                  <ProtectedRoute 
                    path="/clients" 
                    render={() => <Placeholder title="Gestión de Clientes" />} 
                    allowedRoles={['Administrador', 'Vendedor']} 
                  />

                  <ProtectedRoute 
                    path="/inventory" 
                    component={Inventory} 
                    allowedRoles={['Administrador', 'Inventario']} 
                  />

                  <ProtectedRoute 
                    path="/cash" 
                    component={CashRegister} 
                    allowedRoles={['Administrador', 'Cajero']} 
                  />

                  <ProtectedRoute 
                    path="/reports" 
                    render={() => <Placeholder title="Reportes" />} 
                    allowedRoles={['Administrador']} 
                  />
                  
                  <ProtectedRoute 
                    path="/admin/users" 
                    component={AdminUsers} 
                    allowedRoles={['Administrador']} 
                  />

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