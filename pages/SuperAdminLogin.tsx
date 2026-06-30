
import React, { useState } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate } = ReactRouterDOM as any;
import { Shield, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { SaasService } from '../services/api';

const SuperAdminLogin: React.FC = () => {
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { token } = await SaasService.adminLogin(adminPassword);
      localStorage.setItem('saas_admin_token', token);
      navigate('/superadmin');
    } catch (err: any) {
      setError(err.message || 'Credenciales incorrectas');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-red-600/20 border border-red-600/40 rounded-2xl flex items-center justify-center mb-4">
            <Shield className="text-red-400" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">ERP Veterinaria</h1>
          <p className="text-slate-400 text-sm mt-1">Acceso Super Administrador</p>
        </div>

        {/* Warning banner */}
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-3 mb-6 flex items-start gap-2">
          <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={16} />
          <p className="text-amber-300 text-xs leading-relaxed">
            Acceso restringido. Solo personal autorizado. Toda actividad queda registrada.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-400 p-3 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                Contrasena de Administrador
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-red-500 focus:outline-none transition-all"
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? 'Verificando...' : 'Acceder al Panel'}
              {!isLoading && <ArrowRight size={18} />}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          <a href="#/login" className="text-slate-500 hover:text-slate-400 transition-colors">
            Volver al login de clinica
          </a>
        </p>
      </div>
    </div>
  );
};

export default SuperAdminLogin;
