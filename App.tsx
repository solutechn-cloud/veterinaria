
import React from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { HashRouter, Routes, Route, Navigate } = ReactRouterDOM as any;
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import OfflineBanner from './components/OfflineBanner';
import CameraPermissionBanner from './components/CameraPermissionBanner';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

// Páginas existentes reutilizadas
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Clients from './pages/Clients';
import Providers from './pages/Providers';
import CashRegister from './pages/CashRegister';
import Login from './pages/Login';
import AdminUsers from './pages/AdminUsers';
import AdminCashDashboard from './pages/AdminCashDashboard';
import Reports from './pages/Reports';
import LabelDesigner from './pages/LabelDesigner';
import CompanyConfig from './pages/CompanyConfig';
import Accounting from './pages/Accounting';

// Páginas nuevas de farmacia
import Medicamentos from './pages/Medicamentos';
import Recetas from './pages/Recetas';
import Sucursales from './pages/Sucursales';
import Vencimientos from './pages/Vencimientos';
import Transferencias from './pages/Transferencias';
import EntregasPendientes from './pages/EntregasPendientes';
import Lealtad from './pages/Lealtad';
import OrdenesCompra from './pages/OrdenesCompra';
import Pacientes from './pages/Pacientes';
import Agenda from './pages/Agenda';
import Expediente from './pages/Expediente';
import Vacunas from './pages/Vacunas';
import ServiciosVeterinarios from './pages/ServiciosVeterinarios';
import Flowboard from './pages/Flowboard';

// SaaS Super Admin
import SuperAdmin from './pages/SuperAdmin';
import SuperAdminLogin from './pages/SuperAdminLogin';
import AIUsage from './pages/AIUsage';

const App: React.FC = () => {
  return (
    <ThemeProvider>
    <AuthProvider>
      <OfflineBanner />
      <CameraPermissionBanner />
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/login/:tenantSlug" element={<Login />} />
          <Route path="/superadmin/login" element={<SuperAdminLogin />} />
          <Route path="/superadmin" element={<SuperAdmin />} />

          {/* Dashboard */}
          <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />

          {/* Ventas */}
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
          <Route path="/pacientes" element={
            <ProtectedRoute requiredPermission="VER_PACIENTES" requiredFeature="modulo_pacientes">
              <Layout><Pacientes /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/agenda" element={
            <ProtectedRoute requiredPermission="VER_CITAS" requiredFeature="modulo_citas">
              <Layout><Agenda /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/expediente" element={
            <ProtectedRoute requiredPermission="VER_EXPEDIENTE" requiredFeature="modulo_expediente">
              <Layout><Expediente /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/vacunas" element={
            <ProtectedRoute requiredPermission="VER_VACUNAS" requiredFeature="modulo_vacunas">
              <Layout><Vacunas /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/servicios-veterinarios" element={
            <ProtectedRoute requiredPermission="VER_SERVICIOS_VET">
              <Layout><ServiciosVeterinarios /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/flowboard" element={
            <ProtectedRoute requiredPermission="VER_FLOWBOARD" requiredFeature="modulo_hospitalizacion">
              <Layout><Flowboard /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/recetas" element={
            <ProtectedRoute requiredPermission="VER_RECETAS" requiredFeature="modulo_recetas">
              <Layout><Recetas /></Layout>
            </ProtectedRoute>
          } />

          {/* Inventario Farmacéutico */}
          <Route path="/medicamentos" element={
            <ProtectedRoute requiredPermission="VER_INVENTARIO">
              <Layout><Medicamentos /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/vencimientos" element={
            <ProtectedRoute requiredPermission="VER_VENCIMIENTOS" requiredFeature="modulo_vencimientos">
              <Layout><Vencimientos /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/transferencias" element={
            <ProtectedRoute requiredPermission="VER_TRANSFERENCIAS" requiredFeature="modulo_transferencias">
              <Layout><Transferencias /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/ordenes-compra" element={
            <ProtectedRoute requiredPermission="VER_ORDENES_COMPRA" requiredFeature="modulo_ordenes_compra">
              <Layout><OrdenesCompra /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/cross-branch/deliveries" element={
            <ProtectedRoute requiredPermission="VER_ENTREGAS" requiredFeature="modulo_entregas">
              <Layout><EntregasPendientes /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/lealtad" element={
            <ProtectedRoute requiredPermission="VER_LEALTAD" requiredFeature="modulo_lealtad">
              <Layout><Lealtad /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/providers" element={
            <ProtectedRoute requiredPermission="VER_PROVEEDORES" requiredFeature="modulo_proveedores">
              <Layout><Providers /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/label-designer" element={
            <ProtectedRoute requiredPermission="DISEÑAR_ETIQUETAS" requiredFeature="modulo_etiquetas">
              <Layout><LabelDesigner /></Layout>
            </ProtectedRoute>
          } />

          {/* Finanzas */}
          <Route path="/cash" element={
            <ProtectedRoute requiredPermission="VER_CAJA">
              <Layout><CashRegister /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/accounting" element={
            <ProtectedRoute requiredPermission="VER_CONTABILIDAD" requiredFeature="modulo_contabilidad">
              <Layout><Accounting /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute requiredPermission="VER_REPORTES">
              <Layout><Reports /></Layout>
            </ProtectedRoute>
          } />

          {/* Administración */}
          <Route path="/sucursales" element={
            <ProtectedRoute requiredPermission="VER_SUCURSALES" requiredFeature="modulo_sucursales">
              <Layout><Sucursales /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/cash-dashboard" element={
            <ProtectedRoute requiredPermission="VER_PANEL_CAJAS" requiredFeature="modulo_panel_cajas">
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
            <ProtectedRoute requiredPermission="GESTIONAR_CAJAS">
              <Layout><AdminUsers initialView="CAJAS" /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/config" element={
            <ProtectedRoute requiredPermission="CONFIGURAR_EMPRESA">
              <Layout><CompanyConfig /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/ai" element={
            <ProtectedRoute requiredPermission="VER_IA_CUOTAS">
              <Layout><AIUsage /></Layout>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
