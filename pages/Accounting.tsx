import React, { useState, useEffect } from 'react';
import { AccountingService } from '../services/api';
import { Socio } from '../types';
import {
  Calculator, Users, TrendingUp, TrendingDown, DollarSign, Search, Edit2, Trash2,
  PlusCircle, X, Download, Activity, ChevronLeft, ChevronRight, Calendar,
  RefreshCw, BarChart2, Percent, Ticket
} from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate } = ReactRouterDOM as any;

type TabType = 'DASHBOARD' | 'SOCIOS' | 'OPEX' | 'AUDITORIA';
type PeriodType = 'HOY' | 'SEMANA' | 'MES' | 'AÑO';

interface AuditTransaction {
  tipo: 'INGRESO' | 'EGRESO'; id: string; idCaja: string; descripcion: string;
  monto: number; costo: number; fecha: string; estado: string;
  categoria: string; id_socio_asignado: number | null; nombre_socio: string | null;
}

function getPeriodDates(period: PeriodType, date: string): { startDate: string; endDate: string; label: string } {
  const d = new Date(date + 'T12:00:00');
  const fmt = (x: Date) => x.toISOString().split('T')[0];
  if (period === 'HOY') return { startDate: date, endDate: date, label: `Hoy ${date}` };
  if (period === 'SEMANA') {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d); mon.setDate(d.getDate() + diff);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { startDate: fmt(mon), endDate: fmt(sun), label: `Semana ${fmt(mon)} al ${fmt(sun)}` };
  }
  if (period === 'MES') {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { startDate: fmt(first), endDate: fmt(last), label: first.toLocaleString('es-HN', { month: 'long', year: 'numeric' }) };
  }
  return { startDate: `${d.getFullYear()}-01-01`, endDate: `${d.getFullYear()}-12-31`, label: `Año ${d.getFullYear()}` };
}

function advanceDate(period: PeriodType, date: string, direction: 1 | -1): string {
  const d = new Date(date + 'T12:00:00');
  if (period === 'HOY') d.setDate(d.getDate() + direction);
  else if (period === 'SEMANA') d.setDate(d.getDate() + direction * 7);
  else if (period === 'MES') d.setMonth(d.getMonth() + direction);
  else d.setFullYear(d.getFullYear() + direction);
  return d.toISOString().split('T')[0];
}

const fmt = (n: number) => `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Accounting: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('DASHBOARD');
  const [period, setPeriod] = useState<PeriodType>('HOY');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [opex, setOpex] = useState<any>(null);
  const [transactions, setTransactions] = useState<AuditTransaction[]>([]);
  const [partners, setPartners] = useState<Socio[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSocioModal, setShowSocioModal] = useState(false);
  const [editingSocio, setEditingSocio] = useState<Socio | null>(null);
  const [socioForm, setSocioForm] = useState({ nombre: '', porcentaje_participacion: 0, estado: 'Activo' });
  const [editingTx, setEditingTx] = useState<AuditTransaction | null>(null);
  const [editForm, setEditForm] = useState({ descripcion: '', monto: '', costo: '', categoria: '', id_socio_asignado: '' });

  const { startDate, endDate, label } = getPeriodDates(period, selectedDate);

  useEffect(() => { loadData(); }, [selectedDate, period]);

  const loadData = async () => {
    setLoading(true);
    const { startDate: sd, endDate: ed } = getPeriodDates(period, selectedDate);
    try {
      const [pData, sData, oData, aData] = await Promise.all([
        AccountingService.getProfitabilityReport(sd, ed),
        AccountingService.getSocios(),
        AccountingService.getOpexReport(sd, ed),
        AccountingService.getAuditTransactions(sd, ed),
      ]);
      setReport(pData);
      setPartners(sData);
      setOpex(oData);
      setTransactions(aData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleEditTx = (tx: AuditTransaction) => {
    setEditingTx(tx);
    setEditForm({
      descripcion: tx.descripcion, monto: String(tx.monto), costo: String(tx.costo || 0),
      categoria: tx.categoria || (tx.tipo === 'EGRESO' ? 'Gasto Operativo' : 'Venta/Servicio'),
      id_socio_asignado: tx.id_socio_asignado ? String(tx.id_socio_asignado) : ''
    });
  };

  const saveEditTx = async () => {
    if (!editingTx) return;
    try {
      await AccountingService.updateAuditTransaction(editingTx.tipo, editingTx.id, {
        ...editForm, monto: Number(editForm.monto), costo: Number(editForm.costo),
        id_socio_asignado: editForm.id_socio_asignado || null
      });
      setEditingTx(null);
      loadData();
      Swal.fire('Actualizado', 'Transacción corregida.', 'success');
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleEditInvoice = (descripcion: string) => {
    const match = descripcion.match(/#(FACT-\d+)/);
    if (match?.[1]) navigate('/pos', { state: { editSaleId: match[1] } });
    else Swal.fire('Info', 'Sin factura válida.', 'info');
  };

  const openSocioModal = (s?: Socio) => {
    setEditingSocio(s || null);
    setSocioForm(s ? { nombre: s.nombre, porcentaje_participacion: s.porcentajeParticipacion, estado: s.estado } : { nombre: '', porcentaje_participacion: 0, estado: 'Activo' });
    setShowSocioModal(true);
  };

  const saveSocio = async () => {
    try {
      if (editingSocio) await AccountingService.updateSocio(editingSocio.idSocio, socioForm);
      else await AccountingService.createSocio(socioForm);
      setShowSocioModal(false);
      loadData();
      Swal.fire('Guardado', 'Socio actualizado.', 'success');
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const deleteSocio = async (id: number) => {
    const r = await Swal.fire({ title: '¿Eliminar socio?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar', confirmButtonColor: '#ef4444' });
    if (!r.isConfirmed) return;
    try {
      await AccountingService.deleteSocio(id);
      loadData();
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const exportPDF = () => {
    if (!report) return;
    const doc = new jsPDF();
    const m = report.metrics;
    doc.setFontSize(18); doc.text('REPORTE DE RENTABILIDAD', 14, 20);
    doc.setFontSize(10); doc.text(`Periodo: ${label}`, 14, 28);
    const mainData = [
      ['Ingresos Totales', fmt(m.ingresos)],
      ['(-) Costo Mercancía', fmt(m.costos)],
      ['Utilidad Bruta', fmt(m.utilBruta)],
      ['(-) Gastos Operativos', fmt(m.gastosGral)],
      ['UTILIDAD NETA NEGOCIO', fmt(m.utilNetaNegocio)],
    ];
    // @ts-ignore
    doc.autoTable({ startY: 35, head: [['Concepto', 'Monto']], body: mainData, theme: 'grid' });
    if (report.distribucion?.length) {
      const distData = report.distribucion.map((d: any) => [d.socio, `${d.porcentaje}%`, fmt(d.gananciaBruta), fmt(d.deduccionPersonal), fmt(d.gananciaNeta)]);
      // @ts-ignore
      doc.autoTable({ startY: (doc as any).lastAutoTable.finalY + 10, head: [['Socio', '%', 'Ganancia Bruta', 'Deducción', 'Ganancia Neta']], body: distData, theme: 'striped' });
    }
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i); doc.setFontSize(8);
      doc.text(`Generado: ${new Date().toLocaleString('es-HN')}`, 14, doc.internal.pageSize.height - 10);
    }
    doc.save(`Rentabilidad_${startDate}_${endDate}.pdf`);
  };

  const filteredTransactions = transactions.filter(t =>
    t.descripcion?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: <BarChart2 size={14} /> },
    { id: 'SOCIOS', label: 'Socios', icon: <Users size={14} /> },
    { id: 'OPEX', label: 'OPEX', icon: <TrendingDown size={14} /> },
    { id: 'AUDITORIA', label: 'Auditoría', icon: <Activity size={14} /> },
  ];

  return (
    <div className="space-y-4 h-full flex flex-col pb-10">
      {/* Header */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border flex flex-col md:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 rounded-xl text-white"><Calculator size={22} /></div>
          <div><h2 className="text-xl font-bold">Contabilidad Gerencial</h2><p className="text-xs text-slate-500">{label}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex p-1 bg-slate-100 rounded-xl">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs ${activeTab === t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {(['HOY', 'SEMANA', 'MES', 'AÑO'] as PeriodType[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold ${period === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>{p}</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedDate(advanceDate(period, selectedDate, -1))} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200"><ChevronLeft size={14} /></button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-indigo-50 p-2 rounded-xl text-xs font-bold text-indigo-700 outline-none border border-indigo-100" />
            <button onClick={() => setSelectedDate(advanceDate(period, selectedDate, 1))} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200"><ChevronRight size={14} /></button>
          </div>
          <button onClick={loadData} className="p-2 bg-slate-100 text-slate-600 rounded-xl"><RefreshCw size={14} /></button>
          {activeTab === 'DASHBOARD' && <button onClick={exportPDF} className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs"><Download size={13} />PDF</button>}
        </div>
      </div>

      {loading && <div className="text-center py-8 text-slate-400 text-sm">Cargando...</div>}

      {/* DASHBOARD */}
      {!loading && activeTab === 'DASHBOARD' && report && (
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl">
              <p className="text-indigo-300 text-[10px] font-black uppercase mb-1">Ventas Brutas</p>
              <h3 className="text-3xl font-black">{fmt(report.metrics.ingresos)}</h3>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-3xl p-6">
              <p className="text-red-400 text-[10px] font-black uppercase mb-1">Gastos Operativos</p>
              <h3 className="text-2xl font-bold text-red-600">{fmt(report.metrics.gastosGral)}</h3>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6">
              <p className="text-emerald-600 text-[10px] font-black uppercase mb-1">Utilidad Neta</p>
              <h3 className="text-3xl font-black text-emerald-700">{fmt(report.metrics.utilNetaNegocio)}</h3>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Costo Mercancía', val: report.metrics.costos, icon: <TrendingDown size={16} />, color: 'text-orange-600' },
              { label: 'Utilidad Bruta', val: report.metrics.utilBruta, icon: <TrendingUp size={16} />, color: 'text-blue-600' },
              { label: 'Inversión', val: report.metrics.inversion, icon: <DollarSign size={16} />, color: 'text-purple-600' },
              { label: '% Margen', val: null, icon: <Percent size={16} />, color: 'text-indigo-600' },
            ].map((card, i) => (
              <div key={i} className="bg-white border rounded-2xl p-4 shadow-sm">
                <div className={`mb-1 ${card.color}`}>{card.icon}</div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{card.label}</p>
                <p className={`text-lg font-black ${card.color}`}>
                  {card.val !== null ? fmt(card.val) : (report.metrics.ingresos > 0 ? `${((report.metrics.utilNetaNegocio / report.metrics.ingresos) * 100).toFixed(1)}%` : '0%')}
                </p>
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-700 uppercase mb-3">Distribucion de Ganancias</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {report.distribucion?.map((d: any, i: number) => (
                <div key={i} className="bg-white border rounded-2xl p-5 shadow-sm hover:border-indigo-300 transition-all relative">
                  <span className="absolute top-4 right-4 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-black">{d.porcentaje}%</span>
                  <h4 className="text-base font-bold mb-3">{d.socio}</h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-slate-500">Ganancia Bruta</span><span className="font-bold">{fmt(d.gananciaBruta)}</span></div>
                    <div className="flex justify-between text-red-600"><span>Deduccion Personal</span><span className="font-bold">- {fmt(d.deduccionPersonal)}</span></div>
                    <div className="border-t pt-2 flex justify-between items-center">
                      <span className="font-black text-slate-700 text-xs uppercase">Ganancia Neta</span>
                      <span className="text-xl font-black text-emerald-600">{fmt(d.gananciaNeta)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SOCIOS */}
      {!loading && activeTab === 'SOCIOS' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col flex-1">
          <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
            <h3 className="font-bold text-sm">Gestion de Socios</h3>
            <button onClick={() => openSocioModal()} className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">
              <PlusCircle size={14} />Nuevo Socio
            </button>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b sticky top-0">
                <tr><th className="p-4">Nombre</th><th className="p-4">% Participacion</th><th className="p-4">Estado</th><th className="p-4 text-center">Acciones</th></tr>
              </thead>
              <tbody className="divide-y">
                {partners.map(p => (
                  <tr key={p.idSocio} className="hover:bg-slate-50">
                    <td className="p-4 font-bold">{p.nombre}</td>
                    <td className="p-4"><span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-black">{p.porcentajeParticipacion}%</span></td>
                    <td className="p-4"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.estado === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.estado}</span></td>
                    <td className="p-4">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => openSocioModal(p)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 size={13} /></button>
                        <button onClick={() => deleteSocio(p.idSocio)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OPEX */}
      {!loading && activeTab === 'OPEX' && opex && (
        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
              <p className="text-red-400 text-[10px] font-black uppercase mb-1">Total Gastos</p>
              <p className="text-2xl font-black text-red-600">{fmt(opex.porCategoria?.reduce((s: number, c: any) => s + c.total, 0) || 0)}</p>
            </div>
            <div className="bg-slate-50 border rounded-2xl p-5">
              <p className="text-slate-400 text-[10px] font-black uppercase mb-1"># Transacciones</p>
              <p className="text-2xl font-black text-slate-700">{opex.detalles?.length || 0}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
              <div className="p-3 bg-slate-50 border-b"><p className="text-xs font-black uppercase text-slate-600">Por Categoria</p></div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-400 font-bold border-b"><tr><th className="p-3 text-left">Categoria</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">#</th></tr></thead>
                <tbody className="divide-y">
                  {opex.porCategoria?.map((c: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-3 font-medium">{c.categoria}</td>
                      <td className="p-3 text-right font-bold text-red-600">{fmt(c.total)}</td>
                      <td className="p-3 text-right text-slate-500">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
              <div className="p-3 bg-slate-50 border-b"><p className="text-xs font-black uppercase text-slate-600">Deducciones por Socio</p></div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-400 font-bold border-b"><tr><th className="p-3 text-left">Socio</th><th className="p-3 text-right">Total Deducido</th></tr></thead>
                <tbody className="divide-y">
                  {opex.porSocio?.length ? opex.porSocio.map((s: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-3 font-medium">{s.socio}</td>
                      <td className="p-3 text-right font-bold text-orange-600">{fmt(s.total)}</td>
                    </tr>
                  )) : <tr><td colSpan={2} className="p-4 text-center text-slate-400">Sin deducciones</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
            <div className="p-3 bg-slate-50 border-b"><p className="text-xs font-black uppercase text-slate-600">Detalle de Gastos</p></div>
            <div className="overflow-auto max-h-72">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-400 font-bold border-b sticky top-0"><tr><th className="p-3 text-left">Descripcion</th><th className="p-3 text-left">Categoria</th><th className="p-3 text-left">Socio</th><th className="p-3 text-right">Monto</th><th className="p-3 text-left">Fecha</th></tr></thead>
                <tbody className="divide-y">
                  {opex.detalles?.map((d: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-3">{d.descripcion}</td>
                      <td className="p-3 text-slate-500">{d.categoria}</td>
                      <td className="p-3 text-slate-500">{d.nombre_socio || '-'}</td>
                      <td className="p-3 text-right font-bold text-red-600">{fmt(d.monto)}</td>
                      <td className="p-3 text-slate-400">{d.fecha}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* AUDITORIA */}
      {!loading && activeTab === 'AUDITORIA' && (
        <div className="flex flex-col flex-1 bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="pl-9 pr-3 py-2 bg-white border rounded-lg text-xs outline-none" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
            <span className="text-xs text-slate-400">{filteredTransactions.length} registros</span>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b sticky top-0">
                <tr><th className="p-4">Tipo</th><th className="p-4">Descripcion</th><th className="p-4 text-right">Monto</th><th className="p-4 text-right">Costo</th><th className="p-4 text-right">Ganancia</th><th className="p-4 text-center">Acciones</th></tr>
              </thead>
              <tbody className="divide-y">
                {filteredTransactions.map(tx => (
                  <tr key={`${tx.tipo}-${tx.id}`} className="hover:bg-slate-50">
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${tx.tipo === 'INGRESO' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{tx.tipo}</span>
                    </td>
                    <td className="p-4 max-w-xs truncate">{tx.descripcion}</td>
                    <td className={`p-4 text-right font-bold ${tx.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(tx.monto)}</td>
                    <td className="p-4 text-right text-slate-500">{fmt(tx.costo)}</td>
                    <td className="p-4 text-right font-bold text-indigo-600">{tx.tipo === 'INGRESO' ? fmt(tx.monto - tx.costo) : '-'}</td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => handleEditTx(tx)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 size={13} /></button>
                        {tx.descripcion?.includes('Factura #') && <button onClick={() => handleEditInvoice(tx.descripcion)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Ticket size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Socio */}
      {showSocioModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-lg">{editingSocio ? 'Editar Socio' : 'Nuevo Socio'}</h3>
              <button onClick={() => setShowSocioModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Nombre</label><input className="w-full p-3 bg-slate-50 border rounded-xl text-sm" value={socioForm.nombre} onChange={e => setSocioForm({ ...socioForm, nombre: e.target.value })} /></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">% Participacion (0-100)</label><input type="number" min={0} max={100} className="w-full p-3 border rounded-xl font-bold text-sm" value={socioForm.porcentaje_participacion} onChange={e => setSocioForm({ ...socioForm, porcentaje_participacion: Number(e.target.value) })} /></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Estado</label>
                <select className="w-full p-3 bg-slate-50 border rounded-xl text-sm" value={socioForm.estado} onChange={e => setSocioForm({ ...socioForm, estado: e.target.value })}>
                  <option>Activo</option><option>Inactivo</option>
                </select>
              </div>
              <button onClick={saveSocio} className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">GUARDAR</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Transaccion */}
      {editingTx && (
        <div className="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-lg">Correccion Contable</h3>
              <button onClick={() => setEditingTx(null)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Descripcion</label><input className="w-full p-3 bg-slate-50 border rounded-xl" value={editForm.descripcion} onChange={e => setEditForm({ ...editForm, descripcion: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Monto</label><input type="number" className="w-full p-3 border rounded-xl font-bold" value={editForm.monto} onChange={e => setEditForm({ ...editForm, monto: e.target.value })} /></div>
                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Costo</label><input type="number" className="w-full p-3 border rounded-xl font-bold" value={editForm.costo} onChange={e => setEditForm({ ...editForm, costo: e.target.value })} /></div>
              </div>
              {editingTx.tipo === 'EGRESO' && (
                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Socio Asignado</label>
                  <select className="w-full p-3 bg-slate-50 border rounded-xl" value={editForm.id_socio_asignado} onChange={e => setEditForm({ ...editForm, id_socio_asignado: e.target.value })}>
                    <option value="">-- Sin Socio --</option>
                    {partners.map(p => <option key={p.idSocio} value={p.idSocio}>{p.nombre}</option>)}
                  </select>
                </div>
              )}
              <button onClick={saveEditTx} className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounting;
