
import React, { useEffect, useState } from 'react';
import { CashService, SalesService, AIService } from '../services/api';
import { Arqueo } from '../types';
import {
  Activity, Lock, Unlock, RefreshCw, Eye, Settings, X, FileText,
  History, Calendar, DollarSign, ShoppingCart, TrendingUp, Calculator,
  Printer, ChevronDown
} from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate } = ReactRouterDOM as any;

interface BoxStatus {
  idCaja: string;
  nombreCaja: string;
  idArqueo: string;
  estadoArqueo: string;
  montoInicial: number;
  montoFinal: number;
  ganancia: number;
  fechaApertura: string;
  fechaCierre?: string;
  usuario: string;
  nombreEmpleado: string;
}

interface SessionDetails {
  arqueo: Arqueo;
  ventas: any[];
}

const fmtL = (n: number) =>
  `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdminCashDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [boxes, setBoxes]       = useState<BoxStatus[]>([]);
  const [loading, setLoading]   = useState(false);

  const [selectedBox, setSelectedBox]       = useState<BoxStatus | null>(null);
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const [sessionsHistory, setSessionsHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'VENTAS' | 'CONFIG'>('VENTAS');

  const [newMontoInicial, setNewMontoInicial] = useState('');
  const [anomalyResult, setAnomalyResult]     = useState<any>(null);
  const [anomalyLoading, setAnomalyLoading]   = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await CashService.getAdminBoxesStatus();
      setBoxes(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadSessionById = async (idArqueo: string, boxInfo: BoxStatus) => {
    setLoading(true);
    try {
      const details = await CashService.getSessionDetails(idArqueo) as unknown as SessionDetails;
      setSessionDetails(details);
      setAnomalyResult(null);
      setSelectedBox({
        ...boxInfo,
        idArqueo: details.arqueo.idArqueo,
        estadoArqueo: details.arqueo.estado,
        montoInicial: Number(details.arqueo.montoInicial),
        montoFinal: Number(details.arqueo.montoFinal || 0),
        ganancia: Number(details.arqueo.ganancia || 0),
        fechaApertura: details.arqueo.fechaApertura,
        fechaCierre: details.arqueo.fechaCierre,
      });
      setNewMontoInicial(String(details.arqueo.montoInicial || 0));
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo cargar la sesión.', 'error');
    } finally { setLoading(false); }
  };

  const openManager = async (box: BoxStatus) => {
    setLoading(true);
    try {
      const history = await CashService.getBoxHistory(box.idCaja);
      setSessionsHistory(history || []);
      if (box.idArqueo) await loadSessionById(box.idArqueo, box);
      else { setSelectedBox(box); setSessionDetails(null); }
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudieron cargar los datos.', 'error');
    } finally { setLoading(false); }
  };

  const handleSwitchSession = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idArq = e.target.value;
    if (!idArq || !selectedBox) return;
    loadSessionById(idArq, selectedBox);
  };

  const handleUpdateInitialAmount = async () => {
    if (!selectedBox?.idArqueo) return;
    try {
      await CashService.updateInitialAmount(selectedBox.idArqueo, Number(newMontoInicial));
      if (selectedBox) await loadSessionById(selectedBox.idArqueo, selectedBox);
      loadData();
      Swal.fire({ title: 'Actualizado', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleReopenCaja = async (box: BoxStatus) => {
    if (!box.idArqueo) return Swal.fire('Sin sesión', 'Esta caja no tiene arqueo registrado.', 'info');
    const result = await Swal.fire({
      title: '¿Reaperturar caja?',
      html: `<p class="text-sm">Se reabrirá la sesión <b>${box.idArqueo}</b> de <b>${box.nombreCaja}</b>.</p><p class="text-xs text-amber-600 mt-2">Solo usa esta opción si la caja se cerró por error.</p>`,
      icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#f59e0b', confirmButtonText: 'Sí, reaperturar',
    });
    if (!result.isConfirmed) return;
    try {
      Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      await CashService.reopenCaja(box.idArqueo);
      await loadData();
      Swal.fire({ icon: 'success', title: 'Caja reaperturada', timer: 2000, showConfirmButton: false });
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleAnomalyCheck = async () => {
    if (!sessionDetails?.arqueo?.idArqueo) return;
    setAnomalyLoading(true);
    try {
      const result = await AIService.checkAnomaly(sessionDetails.arqueo.idArqueo);
      setAnomalyResult(result);
    } catch {
      setAnomalyResult({ error: 'No disponible' });
    } finally { setAnomalyLoading(false); }
  };

  const handleViewInvoice = async (codVenta: string) => {
    Swal.fire({ title: 'Cargando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const detalles = await SalesService.getDetallesVenta(codVenta);
      Swal.close();
      const rows = detalles.map(d =>
        `<tr><td style="padding:6px 8px;border:1px solid #e2e8f0">${d.cantidad}</td>` +
        `<td style="padding:6px 8px;border:1px solid #e2e8f0">${d.descripcionProducto || 'N/A'}</td>` +
        `<td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;font-weight:700">${fmtL(Number(d.cantidad) * Number(d.precioVenta))}</td></tr>`
      ).join('');
      Swal.fire({
        title: `Factura: ${codVenta}`,
        html: `<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f8fafc"><th style="padding:8px;border:1px solid #e2e8f0">Cant.</th><th style="padding:8px;border:1px solid #e2e8f0">Producto</th><th style="padding:8px;border:1px solid #e2e8f0">Total</th></tr></thead><tbody>${rows}</tbody></table>`,
        width: '560px', confirmButtonColor: '#4f46e5',
      });
    } catch { Swal.fire('Error', 'No se pudo obtener el detalle.', 'error'); }
  };

  const generateSessionPDF = () => {
    if (!selectedBox || !sessionDetails) return;
    const doc = new jsPDF();
    const arqueo = sessionDetails.arqueo;
    const mInicial = Number(arqueo.montoInicial || 0);
    const ventasComp = (sessionDetails.ventas || []).filter((v: any) => v.estado !== 'Anulada');
    const tVentas = ventasComp.reduce((a: number, v: any) => a + Number(v.total || 0), 0);
    const mFinal = mInicial + tVentas;

    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('AUDITORÍA DE CAJA — VETERINARIA', 105, 13, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Sesión: ${arqueo.idArqueo}  |  Caja: ${selectedBox.idCaja}  |  Cajero: ${selectedBox.nombreEmpleado}`, 105, 22, { align: 'center' });
    doc.text(`Apertura: ${arqueo.fechaApertura}  ${arqueo.fechaCierre ? '|  Cierre: ' + arqueo.fechaCierre : '|  (Activa)'}`, 105, 29, { align: 'center' });

    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.text('RESUMEN FINANCIERO', 14, 44);

    // @ts-ignore
    doc.autoTable({
      startY: 49,
      head: [['Concepto', 'Monto']],
      body: [
        ['Monto Inicial en Caja', fmtL(mInicial)],
        [`(+) Total Ventas (${ventasComp.length} facturas)`, fmtL(tVentas)],
        ['(=) Efectivo Esperado', fmtL(mFinal)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });

    // @ts-ignore
    const afterSummary = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(12);
    doc.text(`VENTAS DEL TURNO (${ventasComp.length} facturas completadas)`, 14, afterSummary);

    // @ts-ignore
    doc.autoTable({
      startY: afterSummary + 5,
      head: [['Factura', 'Cliente', 'Forma Pago', 'Total']],
      body: (sessionDetails.ventas || []).map((v: any) => [
        v.codVenta || v.id || '—',
        v.nombreCliente || v.cliente || 'Consumidor Final',
        v.tipoCompra || 'Contado',
        v.estado === 'Anulada' ? 'ANULADA' : fmtL(Number(v.total || v.monto || 0)),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 3: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });

    doc.save(`Auditoria_${arqueo.idArqueo}.pdf`);
  };

  /* ── Cálculos de sesión ── */
  const ventasCompletadas = sessionDetails?.ventas?.filter((v: any) => v.estado !== 'Anulada') || [];
  const totalVentas = ventasCompletadas.reduce((a: number, v: any) => a + Number(v.total || v.monto || 0), 0);
  const efectivoCalculado = sessionDetails ? Number(sessionDetails.arqueo.montoInicial || 0) + totalVentas : 0;

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* ── Header ── */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Activity className="text-indigo-600" size={22} /> Panel de Control de Cajas
          </h2>
          <p className="text-slate-500 text-sm">Monitoreo y auditoría de sesiones</p>
        </div>
        <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Box Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 overflow-y-auto pb-4">
        {boxes.length === 0 && !loading && (
          <div className="col-span-3 py-12 text-center text-slate-400">
            <Activity size={36} className="mx-auto mb-3 text-slate-200" />
            <p className="text-sm">No hay cajas configuradas.</p>
          </div>
        )}
        {boxes.map(box => (
          <div key={box.idCaja} className={`bg-white rounded-2xl p-5 shadow-sm border-l-4 transition-all hover:shadow-md ${box.estadoArqueo === 'Activo' ? 'border-l-emerald-500' : 'border-l-slate-200'}`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-800">{box.nombreCaja}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{box.idCaja}</span>
                  <span>•</span>
                  <span>{box.nombreEmpleado || box.usuario || 'Sin asignar'}</span>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${box.estadoArqueo === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {box.estadoArqueo === 'Activo' ? <Unlock size={11} /> : <Lock size={11} />}
                {box.estadoArqueo || 'Inactiva'}
              </span>
            </div>

            <div className="space-y-2 mb-5 bg-slate-50 p-3 rounded-xl border border-slate-100 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Monto Inicial:</span>
                <span className="font-bold text-slate-700">{fmtL(Number(box.montoInicial || 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Efectivo Calculado:</span>
                <span className={`font-bold ${Number(box.montoFinal) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {fmtL(Number(box.montoFinal || 0))}
                </span>
              </div>
              {box.fechaApertura && (
                <div className="flex justify-between text-xs pt-1 border-t border-slate-200">
                  <span className="text-slate-400">Apertura:</span>
                  <span className="text-slate-500">{new Date(box.fechaApertura).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => openManager(box)} className="flex-1 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2">
                <Eye size={14} /> Gestionar
              </button>
              {box.estadoArqueo !== 'Activo' && box.idArqueo && (
                <button onClick={() => handleReopenCaja(box)} className="py-2 px-3 bg-amber-50 text-amber-600 border border-amber-100 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors flex items-center gap-1.5">
                  <Unlock size={14} /> Reaperturar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Session Detail Modal ── */}
      {selectedBox && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center md:p-4">
          <div className="bg-white w-full h-full md:h-[95vh] md:max-w-6xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden">

            {/* Modal Header */}
            <div className="bg-slate-50 p-4 md:p-5 border-b border-slate-200 shrink-0">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600"><History size={20} /></div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      {selectedBox.nombreCaja}
                      <span className="ml-2 text-xs font-normal text-slate-400 bg-white border px-2 py-0.5 rounded-full">{selectedBox.idArqueo}</span>
                    </h2>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Calendar size={11} />{new Date(selectedBox.fechaApertura).toLocaleDateString('es-HN')}</span>
                      <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${selectedBox.estadoArqueo === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{selectedBox.estadoArqueo}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setSelectedBox(null); setSessionDetails(null); }} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              {/* Controls row */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">Sesión:</label>
                  <div className="relative flex-1 min-w-0">
                    <select
                      className="w-full pl-3 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400 appearance-none"
                      value={selectedBox.idArqueo}
                      onChange={handleSwitchSession}
                    >
                      {sessionsHistory.map(s => (
                        <option key={s.idArqueo} value={s.idArqueo}>
                          {new Date(s.fechaApertura).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} — {s.estado}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={generateSessionPDF} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors">
                    <FileText size={14} /> Reporte PDF
                  </button>
                  <button onClick={handleAnomalyCheck} disabled={anomalyLoading} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-50">
                    {anomalyLoading ? <RefreshCw size={14} className="animate-spin" /> : '🤖'} Análisis IA
                  </button>
                </div>
              </div>

              {anomalyResult && !anomalyResult.error && (
                <div className={`mt-3 p-3 rounded-xl text-xs ${anomalyResult.esAnomal ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <span className="font-bold">{anomalyResult.esAnomal ? '⚠️ Anomalía: ' : '✅ '}</span>
                  {anomalyResult.observaciones}
                  {anomalyResult.recomendacion && <p className="text-slate-500 mt-1 italic">{anomalyResult.recomendacion}</p>}
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

              {/* Sidebar */}
              <div className="w-full md:w-60 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0">
                <div className="p-3 flex md:flex-col gap-2">
                  <button onClick={() => setActiveTab('VENTAS')} className={`flex-1 px-4 py-2.5 rounded-xl text-left font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === 'VENTAS' ? 'bg-white shadow-sm text-indigo-600 border border-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}>
                    <ShoppingCart size={16} /> Ventas
                  </button>
                  <button onClick={() => setActiveTab('CONFIG')} className={`flex-1 px-4 py-2.5 rounded-xl text-left font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === 'CONFIG' ? 'bg-white shadow-sm text-indigo-600 border border-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}>
                    <Settings size={16} /> Ajustes
                  </button>
                </div>

                {/* Summary Card */}
                <div className="p-4 mt-auto">
                  <div className="bg-indigo-900 rounded-2xl p-4 text-white shadow-xl">
                    <p className="text-[10px] text-indigo-300 uppercase font-black tracking-widest mb-1 flex items-center gap-1">
                      <Calculator size={10} /> Efectivo Esperado
                    </p>
                    <h3 className="text-2xl font-black">{fmtL(efectivoCalculado)}</h3>
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5 text-[10px] font-bold">
                      <div className="flex justify-between text-indigo-300">
                        <span>Monto Inicial:</span>
                        <span>{fmtL(Number(sessionDetails?.arqueo.montoInicial || 0))}</span>
                      </div>
                      <div className="flex justify-between text-emerald-400">
                        <span>Total Ventas:</span>
                        <span>{fmtL(totalVentas)}</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Facturas:</span>
                        <span>{ventasCompletadas.length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Content */}
              <div className="flex-1 overflow-y-auto p-4 md:p-5 bg-slate-50/30">
                {loading && (
                  <div className="flex items-center justify-center h-40 text-indigo-500 gap-2">
                    <RefreshCw className="animate-spin" size={18} /> Cargando...
                  </div>
                )}

                {/* VENTAS Tab */}
                {!loading && activeTab === 'VENTAS' && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <ShoppingCart size={16} className="text-indigo-500" />
                      <h3 className="font-bold text-sm text-slate-800">Ventas de la Sesión</h3>
                      <span className="ml-auto text-xs text-slate-400">{(sessionDetails?.ventas || []).length} registros</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left min-w-[560px]">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-100">
                          <tr>
                            <th className="px-4 py-3">Factura</th>
                            <th className="px-4 py-3">Cliente</th>
                            <th className="px-4 py-3">Tipo Pago</th>
                            <th className="px-4 py-3 text-right">Total</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3 text-center">Detalle</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {(sessionDetails?.ventas || []).length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                                <ShoppingCart size={28} className="mx-auto mb-2 text-slate-200" />
                                Sin ventas en esta sesión.
                              </td>
                            </tr>
                          ) : (sessionDetails?.ventas || []).map((v: any) => (
                            <tr key={v.codVenta || v.id} className={`hover:bg-slate-50 transition-colors ${v.estado === 'Anulada' ? 'opacity-50' : ''}`}>
                              <td className="px-4 py-3 font-mono text-slate-600">{v.codVenta || v.id || '—'}</td>
                              <td className="px-4 py-3 text-slate-700 max-w-[160px] truncate">{v.nombreCliente || v.cliente || 'Consumidor Final'}</td>
                              <td className="px-4 py-3">
                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">{v.tipoCompra || 'Contado'}</span>
                              </td>
                              <td className={`px-4 py-3 text-right font-bold ${v.estado === 'Anulada' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                {fmtL(Number(v.total || v.monto || 0))}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.estado === 'Completada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                  {v.estado}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleViewInvoice(v.codVenta || v.id)}
                                  className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="Ver detalle"
                                >
                                  <Eye size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(sessionDetails?.ventas || []).length > 0 && (
                      <div className="flex justify-end items-center gap-4 px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs">
                        <span className="text-slate-500">Total completadas:</span>
                        <span className="font-bold text-slate-800 text-sm">{fmtL(totalVentas)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* CONFIG Tab */}
                {!loading && activeTab === 'CONFIG' && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-wide">
                      <Settings size={16} className="text-indigo-600" /> Corrección de Balance
                    </h3>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase block mb-2 tracking-widest">
                        Monto Inicial de Efectivo (L.)
                      </label>
                      <input
                        type="number" min="0" step="0.01"
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-2xl text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-400 transition"
                        value={newMontoInicial}
                        onChange={e => setNewMontoInicial(e.target.value)}
                      />
                    </div>
                    <button
                      onClick={handleUpdateInitialAmount}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl font-black shadow-lg shadow-indigo-600/20 transition-colors uppercase text-xs tracking-widest"
                    >
                      ACTUALIZAR MONTO INICIAL
                    </button>
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                      Ajuste el monto inicial si fue registrado incorrectamente al abrir la caja. El efectivo esperado se recalculará automáticamente.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCashDashboard;
