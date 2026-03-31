
import React, { useState, useEffect, useCallback } from 'react';
import { ReportsService } from '../services/api';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell
} from 'recharts';
import {
  FileText, Download, Filter, TrendingUp, TrendingDown, Package, Users, Smartphone,
  RefreshCw, DollarSign, ShoppingCart, UserCheck, Award
} from 'lucide-react';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const fmt = (n: number) => `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (n: number) => Number(n || 0).toLocaleString('es-HN');

// FIX: Calcula último día real del mes (evita hardcodear día 31)
function getMonthRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  const m = String(month).padStart(2, '0');
  return {
    start: `${year}-${m}-01`,
    end: `${year}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 4 }, (_, i) => currentYear - i);

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState('SALES');
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [kpi, setKpi] = useState<any>(null);
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [inventoryVal, setInventoryVal] = useState<any[]>([]);
  const [recharges, setRecharges] = useState<any[]>([]);
  const [topClients, setTopClients] = useState<any[]>([]);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);

  const { start, end } = getMonthRange(year, month);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // KPI siempre se carga
      const kpiData = await ReportsService.getKpiSummary(start, end);
      setKpi(kpiData);

      if (activeTab === 'SALES') {
        const [trend, daily] = await Promise.all([
          ReportsService.getSalesTrend(year),
          ReportsService.getDailySales(start, end),
        ]);
        setSalesTrend(trend);
        setDailySales(daily);
      } else if (activeTab === 'INVENTORY') {
        const [inv, top] = await Promise.all([
          ReportsService.getInventoryValuation(),
          ReportsService.getTopProducts(start, end),
        ]);
        setInventoryVal(inv);
        setTopProducts(top);
      } else if (activeTab === 'RECHARGES') {
        const rec = await ReportsService.getRechargesProfit(year);
        setRecharges(rec);
      } else if (activeTab === 'CLIENTS') {
        const [clients, sell] = await Promise.all([
          ReportsService.getTopClients(start, end),
          ReportsService.getSalesBySeller(start, end),
        ]);
        setTopClients(clients);
        setSellers(sell);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, year, month, start, end]);

  useEffect(() => { loadData(); }, [loadData]);

  const generatePDF = (title: string, columns: string[], data: any[], filename: string) => {
    const doc = new jsPDF();
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.text('SMARTCLOUD ERP', 14, 12);
    doc.setFontSize(9); doc.text('Reporte generado automáticamente', 14, 20);
    doc.text(new Date().toLocaleString('es-HN'), 150, 20);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13); doc.text(title, 14, 38);
    doc.setFontSize(9); doc.text(`Período: ${start} al ${end}`, 14, 45);
    // @ts-ignore
    doc.autoTable({ startY: 52, head: [columns], body: data, theme: 'striped', headStyles: { fillColor: [79, 70, 229] }, alternateRowStyles: { fillColor: [245, 247, 255] } });
    doc.save(`${filename}.pdf`);
  };

  const monthName = new Date(year, month - 1).toLocaleString('es-HN', { month: 'long', year: 'numeric' });

  // Reagrupar recargas por mes para el gráfico (un punto por mes, barras por red)
  const rechargesChartData = (() => {
    const map: Record<string, any> = {};
    recharges.forEach(r => {
      if (!map[r.mes]) map[r.mes] = { mes: r.mes, num_mes: r.num_mes };
      map[r.mes][r.red] = Number(r.ganancia);
    });
    return Object.values(map).sort((a, b) => a.num_mes - b.num_mes);
  })();

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><FileText className="text-indigo-600" /> Reportes y Análisis</h2>
          <p className="text-slate-500 text-sm">{monthName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <Filter size={14} className="text-slate-400" />
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-transparent text-sm font-bold text-slate-700 outline-none">
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-transparent text-sm font-bold text-slate-700 outline-none">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('es-HN', { month: 'long' })}</option>
              ))}
            </select>
          </div>
          <button onClick={loadData} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards — siempre visibles */}
      {kpi && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Facturas', val: fmtN(kpi.numFacturas), icon: <ShoppingCart size={18} />, color: 'bg-indigo-600', raw: true },
            { label: 'Ventas Brutas', val: fmt(kpi.totalVentas), icon: <DollarSign size={18} />, color: 'bg-emerald-600', raw: false },
            { label: 'Utilidad Neta', val: fmt(kpi.utilidadNeta), icon: <TrendingUp size={18} />, color: kpi.utilidadNeta >= 0 ? 'bg-emerald-500' : 'bg-red-500', raw: false },
            { label: 'Recargas', val: `${fmtN(kpi.numRecargas)} ops`, icon: <Smartphone size={18} />, color: 'bg-amber-500', raw: true },
          ].map((c, i) => (
            <div key={i} className="bg-white border rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className={`${c.color} text-white p-2.5 rounded-xl shrink-0`}>{c.icon}</div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{c.label}</p>
                <p className="text-lg font-black text-slate-800">{c.val}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'SALES', label: 'Ventas', icon: <TrendingUp size={16} /> },
          { id: 'INVENTORY', label: 'Inventario', icon: <Package size={16} /> },
          { id: 'RECHARGES', label: 'Recargas', icon: <Smartphone size={16} /> },
          { id: 'CLIENTS', label: 'Clientes', icon: <Users size={16} /> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-12 text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} />Cargando datos...</div>}

      {/* VENTAS */}
      {!loading && activeTab === 'SALES' && (
        <div className="space-y-5">
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <h3 className="font-bold text-slate-800 mb-5">Tendencia de Ventas — {year}</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => `L.${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => fmt(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgb(0 0 0 / 0.08)' }} />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: '#4f46e5' }} name="Ventas (L.)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-slate-800">Ventas Diarias — {monthName}</h3>
              <button onClick={() => generatePDF(`Ventas Diarias - ${monthName}`, ['Fecha', 'Vendedor', 'Facturas', 'Total'], dailySales.map(d => [d.fecha, d.vendedor, d.num_ventas, fmt(d.total_dia)]), `Ventas_${year}_${month}`)}
                className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-2 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors">
                <Download size={15} /> PDF
              </button>
            </div>
            {dailySales.length === 0
              ? <p className="text-center text-slate-400 py-8 text-sm">Sin ventas en este período</p>
              : <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                    <tr><th className="p-3">Fecha</th><th className="p-3">Vendedor</th><th className="p-3 text-center">Facturas</th><th className="p-3 text-right">Total</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailySales.map((d, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-xs">{d.fecha}</td>
                        <td className="p-3 font-medium">{d.vendedor}</td>
                        <td className="p-3 text-center"><span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-bold">{d.num_ventas}</span></td>
                        <td className="p-3 text-right font-bold text-emerald-600">{fmt(d.total_dia)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>
      )}

      {/* INVENTARIO */}
      {!loading && activeTab === 'INVENTORY' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <h3 className="font-bold text-slate-800 mb-4">Valoración de Inventario Actual</h3>
            <div className="space-y-4">
              {inventoryVal.map((inv, i) => {
                const margen = inv.costo_total > 0 ? ((inv.venta_proyectada - inv.costo_total) / inv.costo_total * 100).toFixed(1) : 0;
                return (
                  <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex justify-between mb-3">
                      <span className="font-bold text-slate-700">{inv.categoria}</span>
                      <span className="text-xs bg-white border px-2 py-0.5 rounded font-mono text-slate-500">{fmtN(inv.cantidad)} uds</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div><p className="text-slate-400">Costo Inv.</p><p className="font-bold text-slate-800">{fmt(inv.costo_total)}</p></div>
                      <div><p className="text-slate-400">V. Proyectada</p><p className="font-bold text-indigo-600">{fmt(inv.venta_proyectada)}</p></div>
                      <div><p className="text-slate-400">% Margen</p><p className="font-bold text-emerald-600">+{margen}%</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-slate-800">Top 10 Productos — {monthName}</h3>
              <button onClick={() => generatePDF(`Top Productos - ${monthName}`, ['Producto', 'Cant.', 'Costo', 'Total Venta'], topProducts.map(p => [p.producto, p.cantidad, fmt(p.total_costo), fmt(p.total_vendido)]), `TopProductos_${year}_${month}`)}
                className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg"><Download size={18} /></button>
            </div>
            {topProducts.length === 0
              ? <p className="text-center text-slate-400 py-8 text-sm">Sin datos de ventas en este período</p>
              : <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b">
                  <tr><th className="p-3">Producto</th><th className="p-3 text-center">Cant.</th><th className="p-3 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y">
                  {topProducts.map((p, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-3 font-medium flex items-center gap-2">
                        <span className="w-5 h-5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                        {p.producto}
                      </td>
                      <td className="p-3 text-center font-bold">{p.cantidad}</td>
                      <td className="p-3 text-right font-bold text-indigo-600">{fmt(p.total_vendido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>
        </div>
      )}

      {/* RECARGAS */}
      {!loading && activeTab === 'RECHARGES' && (
        <div className="space-y-5">
          {kpi && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Operaciones', val: fmtN(kpi.numRecargas) },
                { label: 'Ingreso Recargas', val: fmt(kpi.ingresoRecargas) },
                { label: 'Ganancia Recargas', val: fmt(kpi.gananciaRecargas) },
              ].map((c, i) => (
                <div key={i} className="bg-white border rounded-2xl p-4 shadow-sm">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{c.label}</p>
                  <p className="text-xl font-black text-slate-800">{c.val}</p>
                </div>
              ))}
            </div>
          )}
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <h3 className="font-bold text-slate-800 mb-5">Ganancia por Recargas — {year}</h3>
            {rechargesChartData.length === 0
              ? <p className="text-center text-slate-400 py-8 text-sm">Sin recargas registradas en {year}</p>
              : <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rechargesChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => `L.${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmt(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgb(0 0 0 / 0.08)' }} />
                    <Legend />
                    <Bar dataKey="TIGO" fill="#10b981" name="TIGO (L.)" radius={[4, 4, 0, 0]} barSize={28} />
                    <Bar dataKey="CLARO" fill="#f59e0b" name="CLARO (L.)" radius={[4, 4, 0, 0]} barSize={28} />
                    <Bar dataKey="OTRA" fill="#6366f1" name="Otras (L.)" radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            }
          </div>
        </div>
      )}

      {/* CLIENTES + VENDEDORES */}
      {!loading && activeTab === 'CLIENTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Award size={16} className="text-amber-500" /> Top Clientes — {monthName}</h3>
              <button onClick={() => generatePDF(`Top Clientes - ${monthName}`, ['Nombre', 'Identidad', 'Compras', 'Total'], topClients.map(c => [c.nombre, c.identidad, c.compras, fmt(c.total_gastado)]), `TopClientes_${year}_${month}`)}
                className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg"><Download size={18} /></button>
            </div>
            {topClients.length === 0
              ? <p className="text-center text-slate-400 py-8 text-sm">Sin compras en este período</p>
              : <div className="space-y-2">
                {topClients.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors">
                    <span className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{c.nombre}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{c.identidad}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-indigo-600 text-sm">{fmt(c.total_gastado)}</p>
                      <p className="text-[10px] text-slate-400">{c.compras} compras</p>
                    </div>
                  </div>
                ))}
              </div>
            }
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><UserCheck size={16} className="text-indigo-500" /> Rendimiento Vendedores — {monthName}</h3>
              <button onClick={() => generatePDF(`Vendedores - ${monthName}`, ['Vendedor', 'Facturas', 'Total', 'Ticket Prom.'], sellers.map(s => [s.vendedor, s.num_ventas, fmt(s.total_vendido), fmt(s.ticket_promedio)]), `Vendedores_${year}_${month}`)}
                className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg"><Download size={18} /></button>
            </div>
            {sellers.length === 0
              ? <p className="text-center text-slate-400 py-8 text-sm">Sin datos de vendedores en este período</p>
              : <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b">
                  <tr><th className="p-3">Vendedor</th><th className="p-3 text-center">Facts.</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Ticket</th></tr>
                </thead>
                <tbody className="divide-y">
                  {sellers.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-3 font-bold">{s.vendedor}</td>
                      <td className="p-3 text-center"><span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-black">{s.num_ventas}</span></td>
                      <td className="p-3 text-right font-bold text-emerald-600">{fmt(s.total_vendido)}</td>
                      <td className="p-3 text-right text-slate-500">{fmt(s.ticket_promedio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
