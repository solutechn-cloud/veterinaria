
import React, { useState, useEffect, useCallback } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate } = ReactRouterDOM as any;
import {
  Building2, Users, Activity, TrendingUp, Shield, Pause, Play,
  Copy, Plus, RefreshCw, LogOut, Eye, Edit3, AlertCircle, Check,
  X, ChevronDown,
} from 'lucide-react';
import { SaasService } from '../services/api';
import { Tenant, TenantStats, CreateTenantPayload, PlanTenant, EstadoTenant } from '../types';

declare const Swal: any;

// ─── Badge helpers ────────────────────────────────────────────────────────────

const PLAN_BADGE: Record<PlanTenant, string> = {
  basico:       'bg-slate-100 text-slate-700',
  profesional:  'bg-indigo-100 text-indigo-700',
  enterprise:   'bg-emerald-100 text-emerald-700',
};

const ESTADO_BADGE: Record<EstadoTenant, string> = {
  activo:     'bg-green-100 text-green-700',
  suspendido: 'bg-amber-100 text-amber-700',
  cancelado:  'bg-red-100 text-red-700',
  prueba:     'bg-blue-100 text-blue-700',
};

const PLAN_PRICE: Record<PlanTenant, string> = {
  basico: '$29/mes', profesional: '$79/mes', enterprise: '$199/mes',
};

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

const APP_URL = 'https://erpveterinaria.onrender.com';

// ─── CreateTenantModal ────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const CreateTenantModal: React.FC<CreateModalProps> = ({ onClose, onCreated }) => {
  const [form, setForm] = useState<CreateTenantPayload>({
    slug: '', nombreEmpresa: '', emailContacto: '', telefono: '', pais: 'Honduras',
    plan: 'basico', maxSucursales: 1, maxUsuarios: 5, maxMedicamentos: 500,
    adminUsuario: '', adminPassword: '', fechaVencimiento: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof CreateTenantPayload, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleEmpresaChange = (v: string) => {
    set('nombreEmpresa', v);
    set('slug', slugify(v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z0-9-]+$/.test(form.slug)) {
      setError('El slug solo puede contener letras minusculas, numeros y guiones.');
      return;
    }
    setSaving(true); setError('');
    try {
      await SaasService.createTenant(form);
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al crear tenant');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Plus size={20} className="text-indigo-600" /> Nuevo Tenant
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex gap-2 items-center">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Empresa *</label>
              <input className={inputCls} required value={form.nombreEmpresa}
                onChange={e => handleEmpresaChange(e.target.value)} placeholder="Clinica Veterinaria Central" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Slug (URL) *</label>
              <input className={inputCls} required value={form.slug}
                onChange={e => set('slug', slugify(e.target.value))} placeholder="vet-central" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Plan *</label>
              <select className={inputCls} value={form.plan}
                onChange={e => set('plan', e.target.value as PlanTenant)}>
                {(['basico', 'profesional', 'enterprise'] as PlanTenant[]).map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)} — {PLAN_PRICE[p]}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email de Contacto *</label>
              <input type="email" className={inputCls} required value={form.emailContacto}
                onChange={e => set('emailContacto', e.target.value)} placeholder="admin@veterinaria.com" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telefono</label>
              <input className={inputCls} value={form.telefono}
                onChange={e => set('telefono', e.target.value)} placeholder="+504 9999-9999" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Pais</label>
              <input className={inputCls} value={form.pais}
                onChange={e => set('pais', e.target.value)} placeholder="Honduras" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max Sucursales</label>
              <input type="number" min={1} className={inputCls} value={form.maxSucursales}
                onChange={e => set('maxSucursales', Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max Usuarios</label>
              <input type="number" min={1} className={inputCls} value={form.maxUsuarios}
                onChange={e => set('maxUsuarios', Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max Medicamentos</label>
              <input type="number" min={1} className={inputCls} value={form.maxMedicamentos}
                onChange={e => set('maxMedicamentos', Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Vencimiento</label>
              <input type="date" className={inputCls} value={form.fechaVencimiento}
                onChange={e => set('fechaVencimiento', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Admin Usuario *</label>
              <input className={inputCls} required value={form.adminUsuario}
                onChange={e => set('adminUsuario', e.target.value)} placeholder="admin" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Admin Contrasena *</label>
              <input type="password" className={inputCls} required value={form.adminPassword}
                onChange={e => set('adminPassword', e.target.value)} placeholder="••••••••" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-60 flex items-center gap-2">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Creando...' : 'Crear Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── ViewTenantModal ──────────────────────────────────────────────────────────

interface ViewModalProps {
  tenant: Tenant;
  onClose: () => void;
  onUpdated: () => void;
}

const ViewTenantModal: React.FC<ViewModalProps> = ({ tenant, onClose, onUpdated }) => {
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Tenant>>({
    plan: tenant.plan, estado: tenant.estado,
    maxSucursales: tenant.maxSucursales, maxUsuarios: tenant.maxUsuarios,
    maxMedicamentos: tenant.maxMedicamentos, fechaVencimiento: tenant.fechaVencimiento,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    SaasService.getTenantStats(tenant.id).then(setStats).catch(() => {});
  }, [tenant.id]);

  const set = (field: keyof Tenant, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await SaasService.updateTenant(tenant.id, form);
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none';
  const loginUrl = `${APP_URL}/#/login?tenant=${tenant.slug}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{tenant.nombreEmpresa}</h2>
            <p className="text-sm text-slate-500">slug: {tenant.slug}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(v => !v)}
              className="text-slate-400 hover:text-indigo-600 p-1 rounded-lg transition-colors">
              <Edit3 size={18} />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex gap-2 items-center">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Usuarios', val: stats.totalUsuarios },
                { label: 'Sucursales', val: stats.totalSucursales },
                { label: 'Medicamentos', val: stats.totalMedicamentos },
              ].map(item => (
                <div key={item.label} className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-slate-800">{item.val}</p>
                  <p className="text-xs text-slate-500">{item.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Plan</label>
              {editing ? (
                <select className={inputCls} value={form.plan}
                  onChange={e => set('plan', e.target.value as PlanTenant)}>
                  {(['basico', 'profesional', 'enterprise'] as PlanTenant[]).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${PLAN_BADGE[tenant.plan]}`}>
                  {tenant.plan}
                </span>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Estado</label>
              {editing ? (
                <select className={inputCls} value={form.estado}
                  onChange={e => set('estado', e.target.value as EstadoTenant)}>
                  {(['activo', 'suspendido', 'cancelado', 'prueba'] as EstadoTenant[]).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO_BADGE[tenant.estado]}`}>
                  {tenant.estado}
                </span>
              )}
            </div>
            {editing && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max Sucursales</label>
                  <input type="number" min={1} className={inputCls} value={form.maxSucursales}
                    onChange={e => set('maxSucursales', Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max Usuarios</label>
                  <input type="number" min={1} className={inputCls} value={form.maxUsuarios}
                    onChange={e => set('maxUsuarios', Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max Medicamentos</label>
                  <input type="number" min={1} className={inputCls} value={form.maxMedicamentos}
                    onChange={e => set('maxMedicamentos', Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Vencimiento</label>
                  <input type="date" className={inputCls} value={form.fechaVencimiento || ''}
                    onChange={e => set('fechaVencimiento', e.target.value)} />
                </div>
              </>
            )}
          </div>

          {/* Login URL */}
          <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-600 truncate">{loginUrl}</p>
            <button onClick={() => { navigator.clipboard.writeText(loginUrl); }}
              className="shrink-0 text-slate-400 hover:text-indigo-600 transition-colors">
              <Copy size={16} />
            </button>
          </div>

          {editing && (
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-60 flex items-center gap-2">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main SuperAdmin page ─────────────────────────────────────────────────────

const SuperAdmin: React.FC = () => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewTenant, setViewTenant] = useState<Tenant | null>(null);

  const adminToken = localStorage.getItem('saas_admin_token');

  // Redirect if no admin token
  useEffect(() => {
    if (!adminToken) navigate('/superadmin/login');
  }, [adminToken, navigate]);

  const loadTenants = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await SaasService.getTenants();
      setTenants(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar tenants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const handleLogout = () => {
    localStorage.removeItem('saas_admin_token');
    navigate('/superadmin/login');
  };

  const handleSuspend = async (t: Tenant) => {
    const result = await Swal.fire({
      title: 'Suspender tenant',
      text: `Se suspendera el acceso a "${t.nombreEmpresa}". Los datos se conservan.`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Si, suspender', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#d97706',
    });
    if (!result.isConfirmed) return;
    try {
      await SaasService.suspendTenant(t.id);
      await loadTenants();
      Swal.fire({ icon: 'success', title: 'Suspendido', timer: 1500, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  };

  const handleActivate = async (t: Tenant) => {
    try {
      await SaasService.activateTenant(t.id);
      await loadTenants();
      Swal.fire({ icon: 'success', title: 'Activado', timer: 1500, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  };

  const handleCopyUrl = (slug: string) => {
    const url = `${APP_URL}/#/login?tenant=${slug}`;
    navigator.clipboard.writeText(url);
    Swal.fire({ icon: 'success', title: 'URL copiada', timer: 1200, showConfirmButton: false });
  };

  // Dashboard stats
  const total = tenants.length;
  const activos = tenants.filter(t => t.estado === 'activo').length;
  const suspendidos = tenants.filter(t => t.estado === 'suspendido').length;
  const prueba = tenants.filter(t => t.estado === 'prueba').length;
  const mrrMap: Record<PlanTenant, number> = { basico: 29, profesional: 79, enterprise: 199 };
  const mrr = tenants.filter(t => t.estado === 'activo').reduce((sum, t) => sum + mrrMap[t.plan], 0);

  const cards = [
    { icon: Building2, label: 'Total Tenants', value: total, color: 'bg-indigo-50 text-indigo-600' },
    { icon: Activity, label: 'Activos', value: activos, color: 'bg-green-50 text-green-600' },
    { icon: Pause, label: 'Suspendidos', value: suspendidos, color: 'bg-amber-50 text-amber-600' },
    { icon: Users, label: 'En Prueba', value: prueba, color: 'bg-blue-50 text-blue-600' },
    { icon: TrendingUp, label: 'MRR Estimado', value: `$${mrr}`, color: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="text-red-600" size={22} />
          <span className="font-bold text-slate-800">Super Admin Panel</span>
          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">RESTRINGIDO</span>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-600 transition-colors">
          <LogOut size={16} /> Salir
        </button>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Dashboard cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {cards.map(card => (
            <div key={card.label} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <div className={`w-10 h-10 ${card.color} rounded-xl flex items-center justify-center mb-3`}>
                <card.icon size={20} />
              </div>
              <p className="text-2xl font-bold text-slate-800">{card.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Tenants table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Building2 size={18} className="text-indigo-600" /> Tenants ({total})
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={loadTenants}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition-colors">
                <RefreshCw size={16} />
              </button>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-xl transition-colors">
                <Plus size={15} /> Nuevo
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 text-sm flex gap-2 items-center">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              Cargando tenants...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    {['Empresa', 'Slug', 'Plan', 'Estado', 'Usuarios', 'Sucursales', 'Vencimiento', 'Acciones'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tenants.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{t.nombreEmpresa}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{t.slug}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PLAN_BADGE[t.plan]}`}>
                          {t.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO_BADGE[t.estado]}`}>
                          {t.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-center">{t.maxUsuarios}</td>
                      <td className="px-4 py-3 text-slate-600 text-center">{t.maxSucursales}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {t.fechaVencimiento ? new Date(t.fechaVencimiento).toLocaleDateString('es-HN') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setViewTenant(t)} title="Ver/Editar"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors">
                            <Eye size={15} />
                          </button>
                          {t.estado !== 'suspendido' ? (
                            <button onClick={() => handleSuspend(t)} title="Suspender"
                              className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg transition-colors">
                              <Pause size={15} />
                            </button>
                          ) : (
                            <button onClick={() => handleActivate(t)} title="Activar"
                              className="p-1.5 text-slate-400 hover:text-green-600 rounded-lg transition-colors">
                              <Play size={15} />
                            </button>
                          )}
                          <button onClick={() => handleCopyUrl(t.slug)} title="Copiar URL de login"
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                            <Copy size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tenants.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                        No hay tenants registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateTenantModal onClose={() => setShowCreate(false)} onCreated={loadTenants} />
      )}
      {viewTenant && (
        <ViewTenantModal tenant={viewTenant} onClose={() => setViewTenant(null)} onUpdated={loadTenants} />
      )}
    </div>
  );
};

export default SuperAdmin;
