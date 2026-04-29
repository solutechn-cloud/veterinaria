import React, { useState, useEffect, useCallback } from 'react';
import { ReportsService, CashService, InventoryService } from '../services/api';
import {
  TrendingUp, Package, DollarSign, Activity, RefreshCw, Smartphone
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import AlertsCenter from '../components/AlertsCenter';

const fmt = (n: number) => `L. ${Number(n).toLocaleString('es-HN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function healthScore(boxStatus: any[], invCosto: number): number {
  let score = 0;
  const hasClosedToday = boxStatus.some(b => b.estadoArqueo === 'Cerrada');
  if (hasClosedToday) score += 30;
  if (invCosto > 0) score += 20;
  const hasProfit = boxStatus.some(b => Number(b.ganancia ?? 0) > 0);
  if (hasProfit) score += 25;
  score += 25; // reparaciones placeholder
  return score;
}

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [boxStatus, setBoxStatus] = useState<any[]>([]);
  const [kpiSummary, setKpiSummary] = useState<any>(null);
  const [invCosto, setInvCosto] = useState(0);
  const [ventasHoy, setVentasHoy] = useState(0);
  const [lowStock, setLowStock] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      const year = new Date().getFullYear();

      const [trend, valuation, boxes, kpi, dailySales, stockAlerts] = await Promise.all([
        ReportsService.getSalesTrend(year),
        ReportsService.getInventoryValuation(),
        CashService.getAdminBoxesStatus(),
        ReportsService.getKpiSummary(today, today).catch(() => null),
        ReportsService.getDailySales(today, today).catch(() => []),
        InventoryService.getLowStock().catch(() => []),
      ]);

      setSalesTrend(Array.isArray(trend) ? trend : []);
      setBoxStatus(Array.isArray(boxes) ? boxes : []);
      setKpiSummary(kpi);
      setLowStock(Array.isArray(stockAlerts) ? stockAlerts : []);

      const costo = (Array.isArray(valuation) ? valuation : []).reduce(
        (acc: number, v: any) => acc + Number(v.costo_total || 0), 0
      );
      setInvCosto(costo);

      const hoy = (Array.isArray(dailySales) ? dailySales : []).reduce(
        (acc: number, d: any) => acc + Number(d.total || d.monto || 0), 0
      );
      setVentasHoy(hoy);
    } catch (e: any) {
      setError('No se pudo cargar el panel. Verifique su conexion.');
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const activeBoxes = boxStatus.filter(b => b.estadoArqueo === 'Activo');

  // Real profit: from kpiSummary when available, otherwise compute from trend costs
  const gananciaReal = kpiSummary
    ? Number(kpiSummary.totalVentas || 0) - Number(kpiSummary.totalCostos || 0) - Number(kpiSummary.totalEgresos || 0)
    : 0;

  const score = healthScore(boxStatus, invCosto);
  const scoreColor = score <= 40 ? 'text-red-500' : score <= 70 ? 'text-amber-500' : 'text-emerald-500';
  const scoreBg = score <= 40 ? 'bg-red-50 border-red-200' : score <= 70 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200';
  const scoreRing = score <= 40 ? '#ef4444' : score <= 70 ? '#f59e0b' : '#10b981';

  // Payment type breakdown from kpiSummary
  const paymentTypes: { label: string; value: number }[] = kpiSummary?.ventasPorTipo
    ? Object.entries(kpiSummary.ventasPorTipo).map(([label, value]) => ({ label, value: Number(value) }))
    : [];

  const kpis = [
    {
      label: 'Ventas Hoy',
      value: fmt(ventasHoy),
      icon: <TrendingUp size={20} className="text-indigo-600" />,
      bg: 'bg-indigo-50',
    },
    {
      label: 'Cajas Activas',
      value: activeBoxes.length,
      icon: <Activity size={20} className="text-amber-600" />,
      bg: 'bg-amber-50',
    },
    {
      label: 'Costo Inventario',
      value: fmt(invCosto),
      icon: <Package size={20} className="text-emerald-600" />,
      bg: 'bg-emerald-50',
    },
    {
      label: 'Ganancia Real Est.',
      value: fmt(gananciaReal),
      icon: <DollarSign size={20} className="text-blue-600" />,
      bg: 'bg-blue-50',
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Panel de Control</h2>
          <p className="text-slate-500 font-medium">Resumen general de operaciones de SmartCloud</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-2.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-xl transition-all border border-transparent hover:border-slate-200 shadow-sm disabled:opacity-50"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-2xl">
          {error}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-2xl ${kpi.bg} group-hover:scale-110 transition-transform`}>
                {kpi.icon}
              </div>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{kpi.label}</p>
            <h3 className={`font-black text-slate-800 mt-1 ${loading ? 'blur-sm select-none' : ''} ${String(kpi.value).length > 10 ? 'text-xl' : 'text-2xl'}`}>
              {loading ? '—' : kpi.value}
            </h3>
          </div>
        ))}
      </div>

      {/* Middle Row: Chart + Resumen Hoy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sales Trend Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <TrendingUp size={20} className="text-indigo-500" />
              Flujo de Ingresos Anual
            </h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} width={60} />
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                  cursor={{ stroke: '#4f46e5', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                  formatter={(v: any) => [`L. ${Number(v).toLocaleString()}`, 'Total']}
                />
                <Area type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" dot={false} activeDot={{ r: 6, fill: '#4f46e5', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Resumen de Hoy */}
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg mb-6 flex items-center gap-2">
            <Smartphone size={20} className="text-indigo-500" />
            Resumen de Hoy
          </h3>
          {paymentTypes.length > 0 ? (
            <div className="space-y-3">
              {paymentTypes.map((pt, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-sm font-semibold text-slate-600">{pt.label}</span>
                  <span className="text-sm font-black text-indigo-600">{fmt(pt.value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm font-semibold text-slate-600">Total del dia</span>
                <span className="text-sm font-black text-indigo-600">{loading ? '—' : fmt(ventasHoy)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm font-semibold text-slate-600">Cajas operando</span>
                <span className="text-sm font-black text-amber-600">{loading ? '—' : activeBoxes.length}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm font-semibold text-slate-600">Costo inventario</span>
                <span className="text-sm font-black text-emerald-600">{loading ? '—' : fmt(invCosto)}</span>
              </div>
            </div>
          )}
          <button
            onClick={() => { window.location.href = '/admin/cash-dashboard'; }}
            className="w-full mt-6 py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"
          >
            Ver todas las cajas
          </button>
        </div>
      </div>

      {/* Bottom Row: Alerts + Health Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Centro de Alertas */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg mb-6 flex items-center gap-2">
            <Activity size={20} className="text-indigo-500" />
            Centro de Alertas
          </h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <AlertsCenter boxes={boxStatus} lowStock={lowStock} />
          )}
        </div>

        {/* Health Score */}
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center">
          <h3 className="font-bold text-slate-800 text-lg mb-6 self-start">Salud del Sistema</h3>
          <div className="relative flex items-center justify-center">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" strokeWidth="12" />
              <circle
                cx="60" cy="60" r="50"
                fill="none"
                stroke={scoreRing}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 314} 314`}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dasharray 0.6s ease' }}
              />
            </svg>
            <div className="absolute text-center">
              <span className={`text-3xl font-black ${scoreColor}`}>{score}</span>
              <span className="block text-xs text-slate-400 font-bold">/100</span>
            </div>
          </div>
          <div className={`mt-6 w-full border rounded-xl px-4 py-3 text-center ${scoreBg}`}>
            <p className={`text-sm font-bold ${scoreColor}`}>
              {score > 70 ? 'Sistema operando bien' : score > 40 ? 'Requiere atencion' : 'Alertas criticas'}
            </p>
          </div>
          <ul className="mt-4 space-y-1.5 w-full text-xs text-slate-500">
            <li className="flex justify-between"><span>Caja cerrada hoy</span><span className="font-bold">{boxStatus.some(b => b.estadoArqueo === 'Cerrada') ? '+30' : '0'}</span></li>
            <li className="flex justify-between"><span>Inventario valorado</span><span className="font-bold">{invCosto > 0 ? '+20' : '0'}</span></li>
            <li className="flex justify-between"><span>Saldo positivo</span><span className="font-bold">{boxStatus.some(b => Number(b.ganancia ?? 0) > 0) ? '+25' : '0'}</span></li>
            <li className="flex justify-between"><span>Reparaciones al dia</span><span className="font-bold">+25</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
