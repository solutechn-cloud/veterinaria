import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import CashRegister from './pages/CashRegister';

// Placeholder components for routes not fully implemented in this demo
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-96 text-slate-400">
    <h2 className="text-2xl font-bold mb-2">{title}</h2>
    <p>Módulo en construcción o migración</p>
  </div>
);

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="pos" element={<POS />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="cash" element={<CashRegister />} />
          <Route path="clients" element={<Placeholder title="Gestión de Clientes" />} />
          <Route path="reports" element={<Placeholder title="Reportes" />} />
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
};

export default App;