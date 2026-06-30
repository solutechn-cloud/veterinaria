import React, { useState, useEffect } from 'react';
import { AccountingService } from '../services/api';
import {
  Calculator, TrendingUp, DollarSign, Search,
  Download, Activity, ChevronLeft, ChevronRight,
  RefreshCw, BarChart2, ShoppingCart, Package
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

type TabType = 'DASHBOARD' | 'AUDITORIA';
type PeriodType = 'HOY' | 'SEMANA' | 'MES' | 'AÑO';

interface VentaAudit {
  id: string;
  monto: number;
  estado: string;
  categoria: string;
  idCaja: string;
  fecha: string;
  cliente: string;
}

function getPeriodDates(period: PeriodType, date: string) {
  const d = new Date(date + 'T12:00:00');
  const fmt = (x: Date) => x.toISOString().split('T')[0];
  if (period === 'HOY') return { startDate: date, endDate: date, label: `Hoy ${date}` };
  if (period === 'SEMANA') {
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() + diff);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { startDate: fmt(mon), endDate: fmt(sun), label: `Semana ${fmt(mon)} – ${fmt(sun)}` };
  }
  if (period === 'MES') {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last  = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { startDate: fmt(first), endDate: fmt(last), label: first.toLocaleString('es-HN', { month: 'long', year: 'numeric' }) };
  }
  return { startDate: `${d.getFullYear()}-01-01`, endDate: `${d.getFullYear()}-12-31`, label: `Año ${d.getFullYear()}` };
}

function advanceDate(period: PeriodType, date: string, dir: 1 | -1): string {
  const d = new Date(date + 'T12:00:00');
  if (period === 'HOY') d.setDate(d.getDate() + dir);
  else if (period === 'SEMANA') d.setDate(d.getDate() + dir * 7);
  else if (period === 'MES') d.setMonth(d.getMonth() + dir);
  else d.setFullYear(d.getFullYear() + dir);
  return d.toISOString().split('T')[0];
}

const fmtL = (n: number) => `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Accounting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('DASHBOARD');
  const [period, setPeriod]       = useState<PeriodType>('MES');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading]     = useState(false);
  const [report, setReport]       = useState<any>(null);
  const [ventas, setVentas]       = useState<VentaAudit[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const { startDate, endDate, label } = getPeriodDates(period, selectedDate);

  useEffect(() => { loadData(); }, [selectedDate, period]);

  const loadData = async () => {
    setLoading(true);
    const { startDate: sd, endDate: ed } = getPeriodDates(period, selectedDate);
    try {
      const [profData, auditData] = await Promise.all([
        AccountingService.getProfitabilityReport(sd, ed),
        AccountingService.getAuditTransactions(sd, ed),
      ]);
      setReport(profData);
      setVentas(auditData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = () => {
    if (!report) return;
    const m = report.metrics;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('REPORTE DE RENTABILIDAD VETERINARIA', 14, 20);
    doc.setFontSize(10);
    doc.text(`Periodo: ${label}`, 14, 28);
    // @ts-ignore
    doc.autoTable({
      startY: 35,
      head: [['Concepto', 'Monto']],
      body: [
        ['Ventas Brutas', fmtL(m.ingresos)],
        ['(-) Costo de Mercancía (COGS)', `- ${fmtL(m.costos)}`],
        ['= Utilidad Bruta', fmtL(m.utilBruta)],
        ['ISV Recaudado', fmtL(m.isvTotal)],
        ['N° Facturas', String(m.numFacturas)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 1: { halign: 'right' } },
    });
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Generado: ${new Date().toLocaleString('es-HN')}`, 14, doc.internal.pageSize.height - 10);
    }
    doc.save(`Rentabilidad_${startDate}_${endDate}.pdf`);
  };

  const filteredVentas = ventas.filter(v =>
    v.cliente?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: <BarChart2 size={14} /> },
    { id: 'AUDITORIA', label: 'Auditoría de Ventas', icon: <Activity size={14} /> },
  ];

  return (
    <div className="space-y-4 h-full flex flex-col pb-10">
      {/* ── Header ── */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 rounded-xl text-white"><Calculator size={22} /></div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Contabilidad</h2>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-xl">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors ${activeTab === t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          {/* Period selector */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {(['HOY', 'SEMANA', 'MES', 'AÑO'] as PeriodType[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors ${period === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>{p}</button>
            ))}
          </div>
          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedDate(advanceDate(period, selectedDate, -1))} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"><ChevronLeft size={14} /></button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="bg-indigo-50 p-2 rounded-xl text-xs font-bold text-indigo-700 outline-none border border-indigo-100" />
            <button onClick={() => setSelectedDate(advanceDate(period, selectedDate, 1))} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"><ChevronRight size={14} /></button>
          </div>
          <button onClick={loadData} className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"><RefreshCw size={14} /></button>
          {activeTab === 'DASHBOARD' && (
            <button onClick={exportPDF} className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors">
              <Download size={13} />PDF
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center py-10 text-slate-400 text-sm">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2" />Cargando...
        </div>
      )}

      {/* ── DASHBOARD ── */}
      {!loading && activeTab === 'DASHBOARD' && (
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          {!report ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
              <BarChart2 size={36} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm">Sin datos para el período seleccionado.</p>
            </div>
          ) : (
            <>
              {/* Estado de Resultados */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="text-xs font-black text-slate-500 uppercase mb-4 flex items-center gap-2">
                  <TrendingUp size={14} className="text-indigo-500" /> Estado de Resultados — Veterinaria
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-3 border-b border-slate-100">
                    <div>
                      <span className="text-sm font-bold text-slate-700">Ventas Brutas</span>
                      <p className="text-[10px] text-slate-400">{report.metrics.numFacturas} facturas completadas</p>
                    </div>
                    <span className="text-lg font-black text-slate-900">{fmtL(report.metrics.ingresos)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-slate-100">
                    <div>
                      <span className="text-sm font-bold text-red-600">(-) Costo de Mercancía (COGS)</span>
                      <p className="text-[10px] text-slate-400">Costo de lotes descontados en ventas</p>
                    </div>
                    <span className="text-base font-bold text-red-600">- {fmtL(report.metrics.costos)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 px-4 bg-indigo-50 rounded-xl border border-indigo-100">
                    <span className="text-sm font-black text-indigo-800">= Utilidad Bruta</span>
                    <span className={`text-xl font-black ${report.metrics.utilBruta >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                      {fmtL(report.metrics.utilBruta)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-slate-100">
                    <div>
                      <span className="text-sm font-bold text-slate-600">ISV Recaudado</span>
                      <p className="text-[10px] text-slate-400">Impuesto sobre ventas (15%/18%)</p>
                    </div>
                    <span className="text-base font-bold text-slate-600">{fmtL(report.metrics.isvTotal)}</span>
                  </div>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Ventas Brutas', val: report.metrics.ingresos, icon: <ShoppingCart size={16} />, bg: 'bg-slate-900', text: 'text-white', sub: 'text-slate-300' },
                  { label: 'COGS', val: report.metrics.costos, icon: <Package size={16} />, bg: 'bg-red-50', text: 'text-red-700', sub: 'text-red-400' },
                  { label: 'Utilidad Bruta', val: report.metrics.utilBruta, icon: <DollarSign size={16} />, bg: 'bg-emerald-50', text: 'text-emerald-700', sub: 'text-emerald-400' },
                  { label: 'ISV Recaudado', val: report.metrics.isvTotal, icon: <Calculator size={16} />, bg: 'bg-indigo-50', text: 'text-indigo-700', sub: 'text-indigo-400' },
                ].map((card, i) => (
                  <div key={i} className={`${card.bg} border border-transparent rounded-2xl p-4 shadow-sm`}>
                    <div className={`mb-1 ${card.text}`}>{card.icon}</div>
                    <p className={`text-[10px] font-bold uppercase ${card.sub}`}>{card.label}</p>
                    <p className={`text-lg font-black ${card.text}`}>{fmtL(card.val)}</p>
                  </div>
                ))}
              </div>

              {/* Margen */}
              {report.metrics.ingresos > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="text-xs font-black text-slate-500 uppercase mb-3">Indicadores de Rentabilidad</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-xl p-4 text-center">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Margen Bruto</p>
                      <p className="text-2xl font-black text-slate-800">
                        {((report.metrics.utilBruta / report.metrics.ingresos) * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 text-center">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Ticket Promedio</p>
                      <p className="text-2xl font-black text-slate-800">
                        {report.metrics.numFacturas > 0 ? fmtL(report.metrics.ingresos / report.metrics.numFacturas) : 'L. 0.00'}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 text-center">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Facturas</p>
                      <p className="text-2xl font-black text-slate-800">{report.metrics.numFacturas}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── AUDITORÍA ── */}
      {!loading && activeTab === 'AUDITORIA' && (
        <div className="flex flex-col flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 transition"
                placeholder="Buscar por factura o cliente..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <span className="text-xs text-slate-400 font-medium">{filteredVentas.length} registros</span>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3">Factura</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Caja</th>
                  <th className="px-4 py-3">Tipo Pago</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredVentas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      <Activity size={32} className="mx-auto mb-3 text-slate-200" />
                      <p>Sin transacciones en el período seleccionado.</p>
                    </td>
                  </tr>
                ) : filteredVentas.map(v => (
                  <tr key={v.id} className={`hover:bg-slate-50 transition-colors ${v.estado === 'Anulada' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-slate-600">{v.id}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-[180px] truncate">{v.cliente}</td>
                    <td className="px-4 py-3 text-slate-500">{v.idCaja}</td>
                    <td className="px-4 py-3">
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-medium">
                        {v.categoria || 'Contado'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${v.estado === 'Anulada' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {fmtL(Number(v.monto))}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        v.estado === 'Completada' ? 'bg-emerald-100 text-emerald-700' :
                        v.estado === 'Anulada'    ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {v.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {v.fecha ? new Date(v.fecha).toLocaleDateString('es-HN') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredVentas.length > 0 && (
            <div className="flex items-center justify-end gap-4 px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs">
              <span className="text-slate-500">Total facturado (completadas):</span>
              <span className="font-bold text-slate-800 text-sm">
                {fmtL(filteredVentas.filter(v => v.estado !== 'Anulada').reduce((a, v) => a + Number(v.monto), 0))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Accounting;
