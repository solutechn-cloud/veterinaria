
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import LabelDesigner from './pages/LabelDesigner';
import CompanyConfig from './pages/CompanyConfig';
import Accounting from './pages/Accounting';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Rutas Protegidas Envueltas en Layout */}
          <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          
          <Route path="/pos" element={
            <ProtectedRoute requiredPermission="VER_POS">
              <Layout><POS /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/clients" element={
            <ProtectedRoute requiredPermission="VER_CLIENTES">
              <Layout><Clients /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/packages" element={
            <ProtectedRoute requiredPermission="GESTIONAR_INVENTARIO">
              <Layout><Packages /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/providers" element={
            <ProtectedRoute requiredPermission="VER_PROVEEDORES">
              <Layout><Providers /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/inventory" element={
            <ProtectedRoute requiredPermission="VER_INVENTARIO">
              <Layout><Inventory /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/label-designer" element={
            <ProtectedRoute requiredPermission="DISEÑAR_ETIQUETAS">
              <Layout><LabelDesigner /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/cash" element={
            <ProtectedRoute requiredPermission="VER_CAJA">
              <Layout><CashRegister /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/costs" element={
            <ProtectedRoute requiredPermission="VER_COSTOS">
              <Layout><Costs /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/reports" element={
            <ProtectedRoute requiredPermission="VER_REPORTES">
              <Layout><Reports /></Layout>
            </ProtectedRoute>
          } />

          <Route path="/accounting" element={
            <ProtectedRoute requiredPermission="VER_CONTABILIDAD">
              <Layout><Accounting /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/admin/cash-dashboard" element={
            <ProtectedRoute requiredPermission="GESTIONAR_PANEL_CAJAS">
              <Layout><AdminCashDashboard /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/admin/users" element={
            <ProtectedRoute requiredPermission="GESTIONAR_USUARIOS">
              <Layout><AdminUsers initialView="USERS" /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/admin/employees" element={
            <ProtectedRoute requiredPermission="GESTIONAR_USUARIOS">
              <Layout><AdminUsers initialView="EMPLOYEES" /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/admin/roles" element={
            <ProtectedRoute requiredPermission="GESTIONAR_ROLES">
              <Layout><AdminUsers initialView="ROLES" /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/admin/boxes" element={
            <ProtectedRoute requiredPermission="GESTIONAR_ROLES">
              <Layout><AdminUsers initialView="CAJAS" /></Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/admin/config" element={
            <ProtectedRoute requiredPermission="CONFIGURAR_EMPRESA">
              <Layout><CompanyConfig /></Layout>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
};

export default App;
