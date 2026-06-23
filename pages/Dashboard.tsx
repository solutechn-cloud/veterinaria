import React, { useCallback, useEffect, useState } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { Link } = ReactRouterDOM as any;
import { DashboardService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Box, ClipboardList,
  DollarSign, Package, RefreshCw, ShieldCheck, ShoppingCart, Store, TrendingUp
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import AlertsCenter from '../components/AlertsCenter';

const fmt = (n: number) => `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function healthScore(boxStatus: any[], invCosto: number, lowStock: any[] = []): number {
  let score = 0;
  if (boxStatus.some(b => b.estadoArqueo === 'Cerrada')) score += 30;
  if (invCosto > 0) score += 20;
  if (boxStatus.some(b => Number(b.ganancia ?? 0) > 0)) score += 25;
  if (lowStock.length === 0) score += 25;
  return score;
}

function StatCard({ label, value, icon, tone = 'indigo' }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${tones[tone] || tones.indigo}`}>
        {icon}
      </div>
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function EmptyNotice({ title, text }: { title: string; text: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-4">
        <ShieldCheck size={22} />
      </div>
      <h3 className="font-black text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">{text}</p>
    </div>
  );
}

function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await DashboardService.getAdmin());
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el dashboard administrativo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const kpis = data?.kpis || {};
  const boxes = Array.isArray(data?.boxes) ? data.boxes : [];
  const lowStock = (Array.isArray(data?.lowStock) ? data.lowStock : []).map((s: any) => ({
    nombre: s.nombreGenerico || s.nombre,
    cantidad: s.stockActual,
    stockMinimo: s.stockMinimo,
  }));
  const score = healthScore(boxes, Number(kpis.costoInventario || 0), lowStock);
  const scoreColor = score <= 40 ? 'text-red-500' : score <= 70 ? 'text-amber-500' : 'text-emerald-500';

  return (
    <div className="space-y-7">
      <DashboardHeader
        title="Panel administrativo"
        subtitle="Resumen general protegido para gerencia y administracion."
        loading={loading}
        onRefresh={load}
      />
      {error && <ErrorBox text={error} />}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard label="Ventas hoy" value={loading ? '...' : fmt(kpis.totalVentas)} icon={<TrendingUp size={20} />} />
        <StatCard label="Cajas activas" value={loading ? '...' : kpis.cajasActivas || 0} icon={<Activity size={20} />} tone="amber" />
        <StatCard label="Costo inventario" value={loading ? '...' : fmt(kpis.costoInventario)} icon={<Package size={20} />} tone="emerald" />
        <StatCard label="Ganancia estimada" value={loading ? '...' : fmt(kpis.gananciaEstimada)} icon={<DollarSign size={20} />} tone="blue" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-slate-900 flex items-center gap-2">
              <BarChart3 size={18} className="text-indigo-500" /> Flujo anual
            </h3>
            <Link to="/reports" className="text-xs font-black text-indigo-600 hover:text-indigo-800">Reportes</Link>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.salesTrend || []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.16} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} width={60} />
                <Tooltip formatter={(v: any) => [fmt(Number(v)), 'Total']} />
                <Area type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={3} fill="url(#adminTotal)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="font-black text-slate-900 mb-5">Salud operativa</h3>
          <div className="flex items-center justify-center">
            <div className="relative w-32 h-32 rounded-full border-[12px] border-slate-100 flex items-center justify-center">
              <span className={`text-3xl font-black ${scoreColor}`}>{loading ? '--' : score}</span>
            </div>
          </div>
          <div className="mt-6 space-y-2 text-sm text-slate-600">
            <div className="flex justify-between"><span>Facturas hoy</span><b>{kpis.numFacturas || 0}</b></div>
            <div className="flex justify-between"><span>Medicamentos con stock</span><b>{kpis.medicamentosConStock || 0}</b></div>
            <div className="flex justify-between"><span>Stock bajo</span><b>{lowStock.length}</b></div>
          </div>
          <Link to="/admin/cash-dashboard" className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-700">
            Ver cajas <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="font-black text-slate-900 mb-5 flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" /> Alertas
        </h3>
        <AlertsCenter boxes={boxes} lowStock={lowStock} />
      </div>
    </div>
  );
}

function CashierDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await DashboardService.getCashier());
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar tu panel de caja.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasBox = !!data?.cajaAsignada;
  const active = !!data?.activeArqueo;

  return (
    <div className="space-y-7">
      <DashboardHeader title="Mi caja" subtitle="Tu actividad del turno y accesos de venta." loading={loading} onRefresh={load} />
      {error && <ErrorBox text={error} />}
      {!loading && !hasBox && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-amber-900">Caja no asignada</h3>
            <p className="text-sm text-amber-700 mt-1">Puedes iniciar sesion, pero no puedes facturar hasta que un administrador te asigne una caja activa.</p>
          </div>
          <Link to="/cash" className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-600 text-white text-sm font-black">
            Ver caja <ArrowRight size={16} />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StatCard label="Estado de turno" value={loading ? '...' : active ? 'Abierto' : 'Cerrado'} icon={<Store size={20} />} tone={active ? 'emerald' : 'amber'} />
        <StatCard label="Ventas del turno" value={loading ? '...' : fmt(data?.turno?.totalVentas)} icon={<ShoppingCart size={20} />} />
        <StatCard label="Facturas del turno" value={loading ? '...' : data?.turno?.numFacturas || 0} icon={<ClipboardList size={20} />} tone="blue" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-black text-slate-900 mb-5">Ultimas ventas propias</h3>
          {data?.recentSales?.length ? (
            <div className="divide-y divide-slate-100">
              {data.recentSales.map((sale: any) => (
                <div key={sale.codVenta} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-black text-slate-800">{sale.codVenta}</p>
                    <p className="text-xs text-slate-400">{new Date(sale.fecha).toLocaleString('es-HN')}</p>
                  </div>
                  <span className="font-black text-indigo-600">{fmt(sale.total)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyNotice title="Sin ventas recientes" text="Cuando factures desde POS, tus ultimas ventas apareceran aqui." />
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-black text-slate-900 mb-5">Acciones rapidas</h3>
          <div className="space-y-3">
            <Link to="/pos" className={`flex items-center justify-between rounded-xl px-4 py-3 font-black text-sm ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 pointer-events-none'}`}>
              Ir a POS <ArrowRight size={16} />
            </Link>
            <Link to="/cash" className="flex items-center justify-between rounded-xl px-4 py-3 bg-slate-900 text-white font-black text-sm">
              {active ? 'Cerrar caja' : 'Abrir caja'} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-bold text-slate-800">{data?.caja?.nombre || 'Sin caja'}</p>
            <p>{data?.caja?.sucursalNombre || 'Sin sucursal asignada'}</p>
            {data?.activeArqueo && <p className="mt-2">Monto inicial: <b>{fmt(data.activeArqueo.montoInicial)}</b></p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await DashboardService.getInventory()); }
    catch (e: any) { setError(e.message || 'No se pudo cargar inventario.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-7">
      <DashboardHeader title="Panel de inventario" subtitle="Alertas operativas filtradas por tu sucursal cuando aplica." loading={loading} onRefresh={load} />
      {error && <ErrorBox text={error} />}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <StatCard label="Stock bajo" value={loading ? '...' : data?.lowStock?.length || 0} icon={<Package size={20} />} tone="amber" />
        <StatCard label="Vencimientos" value={loading ? '...' : data?.expirations?.length || 0} icon={<AlertTriangle size={20} />} tone="rose" />
        <StatCard label="Transferencias" value={loading ? '...' : data?.transferenciasPendientes || 0} icon={<Activity size={20} />} tone="blue" />
        <StatCard label="Ordenes compra" value={loading ? '...' : data?.ordenesPendientes || 0} icon={<Box size={20} />} tone="emerald" />
      </div>
      <InventoryList title="Stock bajo" items={data?.lowStock || []} type="stock" />
      <InventoryList title="Proximos vencimientos" items={data?.expirations || []} type="expiration" />
    </div>
  );
}

function FinanceDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await DashboardService.getFinance()); }
    catch (e: any) { setError(e.message || 'No se pudo cargar finanzas.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-7">
      <DashboardHeader title="Panel financiero" subtitle="Resumen financiero para usuarios autorizados." loading={loading} onRefresh={load} />
      {error && <ErrorBox text={error} />}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <StatCard label="Ventas hoy" value={loading ? '...' : fmt(data?.ventas?.totalVentas)} icon={<DollarSign size={20} />} />
        <StatCard label="Facturas" value={loading ? '...' : data?.ventas?.numFacturas || 0} icon={<ClipboardList size={20} />} tone="blue" />
        <StatCard label="Cajas abiertas" value={loading ? '...' : data?.cajas?.cajasAbiertas || 0} icon={<Activity size={20} />} tone="amber" />
        <StatCard label="Cierres hoy" value={loading ? '...' : data?.cajas?.cierresHoy || 0} icon={<ShieldCheck size={20} />} tone="emerald" />
      </div>
      <div className="bg-white border border-slate-100 rounded-2xl p-6">
        <h3 className="font-black text-slate-900 mb-4">Accesos financieros</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link to="/accounting" className="rounded-xl bg-slate-900 text-white px-4 py-3 font-black text-sm flex justify-between">Contabilidad <ArrowRight size={16} /></Link>
          <Link to="/reports" className="rounded-xl bg-indigo-600 text-white px-4 py-3 font-black text-sm flex justify-between">Reportes <ArrowRight size={16} /></Link>
        </div>
      </div>
    </div>
  );
}

function InventoryList({ title, items, type }: { title: string; items: any[]; type: 'stock' | 'expiration' }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
      <h3 className="font-black text-slate-900 mb-5">{title}</h3>
      {items.length === 0 ? (
        <EmptyNotice title="Sin alertas" text="No hay registros que requieran atencion en este momento." />
      ) : (
        <div className="divide-y divide-slate-100">
          {items.slice(0, 8).map((item, i) => (
            <div key={`${item.codigo}-${i}`} className="py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-black text-slate-800">{item.nombreGenerico}</p>
                <p className="text-xs text-slate-400">{type === 'stock' ? `Minimo: ${item.stockMinimo}` : `Lote: ${item.numeroLote}`}</p>
              </div>
              <span className="text-sm font-black text-amber-600">
                {type === 'stock' ? `${item.stockActual} uds` : `${item.diasParaVencer} dias`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LimitedDashboard() {
  const { hasPermission } = useAuth();
  const links = [
    { show: hasPermission('VER_POS'), to: '/pos', label: 'Punto de venta' },
    { show: hasPermission('VER_CAJA'), to: '/cash', label: 'Caja y movimientos' },
    { show: hasPermission('VER_INVENTARIO'), to: '/medicamentos', label: 'Inventario' },
    { show: hasPermission('VER_CLIENTES'), to: '/clients', label: 'Clientes' },
    { show: hasPermission('VER_PACIENTES'), to: '/pacientes', label: 'Pacientes' },
    { show: hasPermission('VER_CITAS'), to: '/agenda', label: 'Agenda' },
    { show: hasPermission('VER_EXPEDIENTE'), to: '/expediente', label: 'Expediente clinico' },
  ].filter(l => l.show);
  return (
    <div className="space-y-7">
      <DashboardHeader title="Inicio" subtitle="Accesos disponibles para tu usuario." loading={false} onRefresh={() => {}} />
      <div className="bg-white border border-slate-100 rounded-2xl p-6">
        {links.length === 0 ? (
          <EmptyNotice title="Sin modulos asignados" text="Tu usuario no tiene permisos operativos configurados. Solicita acceso a un administrador." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {links.map(link => (
              <Link key={link.to} to={link.to} className="rounded-xl border border-slate-200 px-4 py-3 font-black text-slate-700 hover:border-indigo-300 hover:text-indigo-700 flex justify-between">
                {link.label} <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardHeader({ title, subtitle, loading, onRefresh }: { title: string; subtitle: string; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{title}</h2>
        <p className="text-slate-500 font-medium mt-1">{subtitle}</p>
      </div>
      <button onClick={onRefresh} disabled={loading} className="self-start sm:self-auto p-2.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-xl border border-transparent hover:border-slate-200 shadow-sm disabled:opacity-50">
        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-2xl">{text}</div>;
}

const Dashboard: React.FC = () => {
  const [profile, setProfile] = useState<string>('limited');
  const [loading, setLoading] = useState(true);
  const { hasPermission } = useAuth();

  useEffect(() => {
    DashboardService.getMe()
      .then(data => setProfile(data.profile || 'limited'))
      .catch(() => {
        if (hasPermission('VER_REPORTES') || hasPermission('VER_CONTABILIDAD') || hasPermission('GESTIONAR_PANEL_CAJAS')) setProfile('admin');
        else if (hasPermission('VER_POS') || hasPermission('VER_CAJA')) setProfile('cashier');
        else if (hasPermission('VER_INVENTARIO')) setProfile('inventory');
        else setProfile('limited');
      })
      .finally(() => setLoading(false));
  }, [hasPermission]);

  if (loading) {
    return (
      <div className="space-y-5">
        <DashboardHeader title="Panel de control" subtitle="Cargando tu vista segura..." loading onRefresh={() => {}} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => <div key={i} className="h-36 rounded-2xl bg-white border border-slate-100 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (profile === 'admin') return <AdminDashboard />;
  if (profile === 'finance') return <FinanceDashboard />;
  if (profile === 'cashier') return <CashierDashboard />;
  if (profile === 'inventory') return <InventoryDashboard />;
  return <LimitedDashboard />;
};

export default Dashboard;
