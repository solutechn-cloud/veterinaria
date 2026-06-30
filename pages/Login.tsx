import React, { useEffect, useState } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { useLocation, useNavigate, useParams } = ReactRouterDOM as any;
import { useAuth } from '../context/AuthContext';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CloudLightning,
  Lock,
  RotateCcw,
  Search,
  User,
} from 'lucide-react';

interface TenantBranding {
  slug: string;
  nombreEmpresa: string;
  logoBase64: string;
  activo: boolean;
}

const normalizeTenantSlug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9-\s]/g, '').replace(/\s+/g, '-').slice(0, 50);

const isValidTenantSlug = (value: string) => /^[a-z0-9-]{3,50}$/.test(value);

const Login: React.FC = () => {
  const [finderSlug, setFinderSlug] = useState('');
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const routeTenantSlug = normalizeTenantSlug(params.tenantSlug || '');
  const hasTenantRoute = !!routeTenantSlug;

  useEffect(() => {
    if (hasTenantRoute) return;

    const searchParams = new URLSearchParams(location.search);
    const tenantParam = normalizeTenantSlug(searchParams.get('tenant') || '');
    if (isValidTenantSlug(tenantParam)) {
      navigate(`/login/${tenantParam}`, { replace: true });
      return;
    }

    const savedTenant = normalizeTenantSlug(localStorage.getItem('last_tenant_slug') || '');
    if (isValidTenantSlug(savedTenant)) navigate(`/login/${savedTenant}`, { replace: true });
  }, [hasTenantRoute, location.search, navigate]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    setBranding(null);

    if (!hasTenantRoute) return;
    if (!isValidTenantSlug(routeTenantSlug)) {
      setError('El codigo de clinica no es valido.');
      return;
    }

    const loadBranding = async () => {
      setBrandingLoading(true);
      try {
        const response = await fetch(`/api/public/tenant-branding/${routeTenantSlug}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar la clinica.');

        const nextBranding = payload.data as TenantBranding;
        if (cancelled) return;
        setBranding(nextBranding);
        if (!nextBranding.activo) {
          setError('Esta clinica no esta disponible para iniciar sesion. Contacte al administrador.');
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'No se pudo cargar la clinica.');
      } finally {
        if (!cancelled) setBrandingLoading(false);
      }
    };

    loadBranding();
    return () => { cancelled = true; };
  }, [hasTenantRoute, routeTenantSlug]);

  const handleFindTenant = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const normalized = normalizeTenantSlug(finderSlug);
    if (!isValidTenantSlug(normalized)) {
      setError('Ingresa un codigo de clinica valido.');
      return;
    }
    navigate(`/login/${normalized}`);
  };

  const handleChangeTenant = () => {
    localStorage.removeItem('last_tenant_slug');
    setFinderSlug('');
    setUsuario('');
    setPassword('');
    navigate('/login', { replace: true });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!isValidTenantSlug(routeTenantSlug)) {
      setError('Abre el login desde la URL de tu clinica.');
      return;
    }
    if (!branding) {
      setError('Espera a que se valide la clinica antes de iniciar sesion.');
      return;
    }
    if (branding && !branding.activo) {
      setError('Esta clinica no esta disponible para iniciar sesion.');
      return;
    }

    setIsLoading(true);
    try {
      await login({ usuario, password, tenantSlug: routeTenantSlug });
      localStorage.setItem('last_tenant_slug', routeTenantSlug);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesion');
    } finally {
      setIsLoading(false);
    }
  };

  const renderLogo = () => {
    if (branding?.logoBase64) {
      return (
        <img
          src={branding.logoBase64}
          alt={branding.nombreEmpresa}
          className="w-16 h-16 rounded-2xl object-contain bg-white border border-slate-200 shadow-sm"
        />
      );
    }

    return (
      <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
        <CloudLightning className="text-white" size={30} />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.25),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.18),_transparent_34%)]" />
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-white/70">
        <div className="p-8 w-full">
          <div className="flex flex-col items-center mb-8">
            {hasTenantRoute ? renderLogo() : (
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Building2 className="text-white" size={30} />
              </div>
            )}
            <h2 className="text-2xl font-bold text-slate-800 mt-5 text-center">
              {hasTenantRoute
                ? branding?.nombreEmpresa || (brandingLoading ? 'Cargando clinica...' : 'ERP Veterinaria')
                : 'Selecciona tu clinica'}
            </h2>
            <p className="text-slate-500 text-sm mt-1 text-center">
              {hasTenantRoute ? 'Ingresa con tu usuario y contrasena' : 'Despues solo necesitaras usuario y contrasena'}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm flex items-start gap-2 mb-4">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!hasTenantRoute ? (
            <form onSubmit={handleFindTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Codigo de clinica</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={finderSlug}
                    onChange={(e) => setFinderSlug(normalizeTenantSlug(e.target.value))}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                    placeholder="vetcare-central"
                    autoComplete="organization"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
              >
                Continuar
                <ArrowRight size={18} />
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Usuario</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                    placeholder="admin"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contrasena</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                    placeholder="********"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || brandingLoading || !branding || !branding.activo}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-6"
              >
                {isLoading ? 'Conectando...' : 'Iniciar sesion'}
                {!isLoading && <ArrowRight size={18} />}
              </button>

              <button
                type="button"
                onClick={handleChangeTenant}
                className="w-full text-slate-500 hover:text-indigo-600 text-sm font-medium flex items-center justify-center gap-2 pt-1"
              >
                <RotateCcw size={15} />
                Cambiar clinica
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm text-slate-500">
            <span>No tienes cuenta? </span>
            <a href="#/registro" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Registrar clinica
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
