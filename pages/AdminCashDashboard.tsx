
import React, { useEffect, useState } from 'react';
import { CashService, SalesService, AccountingService, PackagesService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Saldo, Socio, SubtipoIngreso, SubtipoEgreso } from '../types';
import { Activity, Lock, Unlock, RefreshCw, AlertTriangle, Eye, ArrowUpCircle, ArrowDownCircle, Settings, X, Save, Edit2, Trash2, FileText, Smartphone, Printer, History, Calendar, Ticket, Info, PlusCircle, ArrowUpRight, UserCheck } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useNavigate } from 'react-router-dom';

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

const AdminCashDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [boxes, setBoxes] = useState<BoxStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [partners, setPartners] = useState<Socio[]>([]);
  
  // Manager Modal State
  const [selectedBox, setSelectedBox] = useState<BoxStatus | null>(null);
  const [sessionDetails, setSessionDetails] = useState<{arqueo: Arqueo, ingresos: Ingreso[], egresos: Egreso[]} | null>(null);
  const [sessionsHistory, setSessionsHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'MOVIMIENTOS' | 'CONFIG'>('MOVIMIENTOS');
  
  // Calculated Totals
  const [localTotals, setLocalTotals] = useState({ totalIngresos: 0, totalEgresos: 0, finalCalculado: 0 });

  // Edit States
  const [editingItem, setEditingItem] = useState<{id: string, type: 'INGRESO'|'EGRESO'|null}>({id:'', type: null});
  // FIX: Estado unificado para evitar errores de propiedades inexistentes
  const [editForm, setEditForm] = useState({ 
    descripcion: '', 
    monto: '', 
    costo: '', 
    subtipo: '' as string, 
    idSocio: '' as string 
  });
  const [newMontoInicial, setNewMontoInicial] = useState<string>('');

  // Creation Modals
  const [showNewModal, setShowNewModal] = useState<'INGRESO' | 'EGRESO' | null>(null);
  const [newForm, setNewForm] = useState({ descripcion: '', monto: '', costo: '0', subtipo: '', idSocio: '' });

  // Saldos Management
  const [saldosSession, setSaldosSession] = useState<Saldo[]>([]);
  const [editingSaldo, setEditingSaldo] = useState<Saldo | null>(null);

  useEffect(() => { loadData(); loadPartners(); }, []);

  const loadPartners = async () => {
      try { const data = await AccountingService.getSocios(); setPartners(data || []); } catch(e) { console.error(e); }
  };

  useEffect(() => {
      if (sessionDetails) {
          const ingresos = sessionDetails.ingresos.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
          const egresos = sessionDetails.egresos.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
          const inicial = Number(sessionDetails.arqueo.montoInicial ?? 0);
          const finalCalculado = (inicial + ingresos) - egresos;
          setLocalTotals({ totalIngresos: ingresos, totalEgresos: egresos, finalCalculado: finalCalculado });
      }
  }, [sessionDetails]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await CashService.getAdminBoxesStatus();
      setBoxes(data);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const loadSessionById = async (idArqueo: string, boxInfo: BoxStatus) => {
      try {
          const details = await CashService.getSessionDetails(idArqueo);
          setSessionDetails(details);
          const historicalBoxInfo: BoxStatus = {
              ...boxInfo,
              idArqueo: details.arqueo.idArqueo,
              estadoArqueo: details.arqueo.estado,
              montoInicial: Number(details.arqueo.montoInicial),
              fechaApertura: details.arqueo.fechaApertura,
              fechaCierre: details.arqueo.fechaCierre
          };
          setSelectedBox(historicalBoxInfo);
          setNewMontoInicial(String(details.arqueo.montoInicial || 0));
          if (details.arqueo.fechaApertura) {
              const rawDate = details.arqueo.fechaApertura; 
              const fechaStr = rawDate.length >= 10 ? rawDate.substring(0, 10) : '';
              if(fechaStr) {
                  const slds = await CashService.getSaldosByDate(fechaStr);
                  setSaldosSession(slds || []);
              }
          }
      } catch (error) { console.error(error); Swal.fire('Error', 'No se pudo cargar la sesión.', 'error'); }
  };

  const openManager = async (box: BoxStatus) => {
      setLoading(true);
      try {
          const history = await CashService.getBoxHistory(box.idCaja);
          setSessionsHistory(history || []);
          if (box.idArqueo) await loadSessionById(box.idArqueo, box);
          else { setSelectedBox(box); setSessionDetails(null); setSaldosSession([]); }
      } catch (error) { console.error(error); Swal.fire('Error', 'No se pudieron cargar los datos de auditoría', 'error'); } finally { setLoading(false); }
  };

  const handleSwitchSession = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const idArq = e.target.value;
      if (!idArq || !selectedBox) return;
      loadSessionById(idArq, selectedBox);
  };

  const handleCreateManualTransaction = async () => {
    if (!selectedBox || !sessionDetails) return;
    if (!newForm.descripcion || !newForm.monto || !newForm.subtipo) return Swal.fire('Error', 'Complete los campos requeridos', 'error');
    try {
        const arqDate = sessionDetails.arqueo.fechaApertura.substring(0, 10);
        const manualTimestamp = `${arqDate} 12:00:00`;
        if (showNewModal === 'INGRESO') {
            await CashService.createIngreso({ idCaja: selectedBox.idCaja, descripcion: `(ADMIN) ${newForm.descripcion}`, monto: Number(newForm.monto), costo: Number(newForm.costo), subtipo_movimiento: newForm.subtipo as SubtipoIngreso, fechaCreacion: manualTimestamp });
        } else {
            await CashService.createEgreso({ idCaja: selectedBox.idCaja, descripcion: `(ADMIN) ${newForm.descripcion}`, monto: Number(newForm.monto), subtipo_egreso: newForm.subtipo as SubtipoEgreso, id_socio_asignado: newForm.idSocio ? Number(newForm.idSocio) : null, fechaCreacion: manualTimestamp });
        }
        setShowNewModal(null);
        setNewForm({ descripcion: '', monto: '', costo: '0', subtipo: '', idSocio: '' });
        await openManager(selectedBox);
        loadData();
        Swal.fire('Éxito', 'Movimiento registrado.', 'success');
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleEditInvoice = (descripcion: string) => {
      const match = descripcion.match(/#(FACT-\d+)/);
      if (match && match[1]) navigate('/pos', { state: { editSaleId: match[1] } });
      else Swal.fire('Info', 'No se pudo identificar un número de factura válido.', 'info');
  };

  const handleViewInvoiceDetails = async (descripcion: string) => {
      const match = descripcion.match(/#(FACT-\d+)/);
      if (!match || !match[1]) return;
      const saleId = match[1];
      Swal.fire({ title: 'Cargando detalle...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
      try {
          const detalles = await SalesService.getDetallesVenta(saleId);
          Swal.close();
          const tableHtml = `<div class="overflow-x-auto mt-4 text-left"><table class="w-full text-xs border-collapse"><thead><tr class="bg-slate-100"><th class="p-2 border font-bold">Cant.</th><th class="p-2 border font-bold">Descripción</th><th class="p-2 border font-bold text-right">Total</th></tr></thead><tbody>${detalles.map(d => `<tr><td class="p-2 border text-center">${d.cantidad}</td><td class="p-2 border font-medium">${d.descripcionProducto || 'N/A'}</td><td class="p-2 border text-right font-bold">L. ${(Number(d.cantidad) * Number(d.precioVenta)).toFixed(2)}</td></tr>`).join('')}</tbody></table></div>`;
          Swal.fire({ title: `Factura: ${saleId}`, html: tableHtml, width: '600px', confirmButtonColor: '#4f46e5' });
      } catch (error) { Swal.fire('Error', 'No se pudo obtener el detalle.', 'error'); }
  };

  // --- REPORTE PDF CORREGIDO (ESPACIADO Y COLORES) ---
  const generateClosingReportPDF = (excludeRecharges: boolean = false) => {
      if (!selectedBox || !sessionDetails) return;
      const doc = new jsPDF();
      const date = new Date().toLocaleString();
      const arqueo = sessionDetails.arqueo;
      const mInicial = Number(arqueo.montoInicial ?? 0);
      let ingresosList = sessionDetails.ingresos;
      if (excludeRecharges) ingresosList = ingresosList.filter(i => !(i.descripcion || "").toUpperCase().includes('RECARGA'));
      const tCostoIn = ingresosList.reduce((a, b) => a + Number(b.costo || 0), 0);
      const tVentaIn = ingresosList.reduce((a, b) => a + Number(b.monto || 0), 0);
      const tGananciaIn = tVentaIn - tCostoIn;
      const tGastos = sessionDetails.egresos.reduce((a, b) => a + Number(b.monto || 0), 0);
      const mFinal = (mInicial + tVentaIn) - tGastos;

      doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 35, 'F');
      doc.setTextColor(255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text("REPORTE DE CIERRE DE CAJA (ADMIN)", 105, 15, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`Generado: ${date} | Original: ${arqueo.fechaApertura}`, 105, 23, { align: 'center' });
      doc.text(`Cajero: ${selectedBox.nombreEmpleado} | Caja: ${selectedBox.idCaja}`, 105, 28, { align: 'center' });

      doc.setTextColor(0); doc.setFontSize(11); doc.text("RESUMEN FINANCIERO GLOBAL", 14, 45);
      const summaryData = [['Monto Inicial', `L. ${mInicial.toFixed(2)}`],['(+) Total Ingresos', `L. ${tVentaIn.toFixed(2)}`],['(-) Total Gastos', `L. ${tGastos.toFixed(2)}`],['(=) Efectivo Calculado', `L. ${mFinal.toFixed(2)}`],['Ganancia Estimada', `L. ${tGananciaIn.toFixed(2)}`]];
      // @ts-ignore
      doc.autoTable({ startY: 50, head: [['Concepto', 'Monto']], body: summaryData, theme: 'grid', headStyles: { fillColor: [79, 70, 229] }, columnStyles: { 1: { halign: 'right' } }, margin: { right: 110 } });
      const tigoS = saldosSession.find(s => s.red === 'TIGO')?.saldoFinal || 0;
      const claroS = saldosSession.find(s => s.red === 'CLARO')?.saldoFinal || 0;
      // @ts-ignore
      doc.autoTable({ startY: 50, head: [['Plataforma', 'Saldo Final']], body: [['TIGO', `L. ${Number(tigoS).toFixed(2)}`], ['CLARO', `L. ${Number(claroS).toFixed(2)}`]], theme: 'grid', headStyles: { fillColor: [15, 23, 42] }, columnStyles: { 1: { halign: 'right', textColor: [0, 128, 0], fontStyle: 'bold' } }, margin: { left: 110 } });
      
      // MARGEN DE SEGURIDAD PARA EVITAR SOLAPAMIENTO (20MM ADICIONALES)
      let finalY = (doc as any).lastAutoTable.finalY + 20; 
      doc.setTextColor(0); doc.setFontSize(11); doc.text("DETALLE DE INGRESOS (Completo)", 14, finalY);
      const incomeRows = ingresosList.map(i => [i.descripcion, `L. ${Number(i.costo||0).toFixed(2)}`, `L. ${Number(i.monto||0).toFixed(2)}`, `L. ${(Number(i.monto||0)-Number(i.costo||0)).toFixed(2)}`]);
      // @ts-ignore
      doc.autoTable({ 
          startY: finalY + 5, head: [['Descripción', 'Costo', 'Venta', 'Ganancia']], 
          body: [...incomeRows, [{content: 'TOTALES', styles: {halign: 'right', fontStyle: 'bold'}}, `L. ${tCostoIn.toFixed(2)}`, `L. ${tVentaIn.toFixed(2)}`, `L. ${tGananciaIn.toFixed(2)}` ]], 
          theme: 'striped', headStyles: { fillColor: [16, 185, 129] }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
          // COLOR AZUL MARINO PARA TOTALES
          didParseCell: (data) => { if(data.row.index === incomeRows.length) { data.cell.styles.fillColor = [30, 41, 59]; data.cell.styles.textColor = [255, 255, 255]; } }
      });

      finalY = (doc as any).lastAutoTable.finalY + 12;
      doc.text("DETALLE DE GASTOS / SALIDAS", 14, finalY);
      const expenseRows = sessionDetails.egresos.map(e => [e.descripcion, `L. ${Number(e.monto||0).toFixed(2)}`]);
      // @ts-ignore
      doc.autoTable({ 
          startY: finalY + 5, head: [['Descripción', 'Monto']], body: [...expenseRows, [{content: 'TOTAL GASTOS', styles: {halign: 'right', fontStyle: 'bold'}}, `L. ${tGastos.toFixed(2)}` ]], 
          theme: 'striped', headStyles: { fillColor: [239, 68, 68] }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
          didParseCell: (data) => { if(data.row.index === expenseRows.length) { data.cell.styles.fillColor = [30, 41, 59]; data.cell.styles.textColor = [255, 255, 255]; } }
      });
      doc.save(`Cierre_Auditoria_${arqueo.idArqueo}.pdf`);
  };

  const handleUpdateInitial = async () => {
      if(!selectedBox?.idArqueo) return;
      try { await CashService.updateInitialAmount(selectedBox.idArqueo, Number(newMontoInicial)); openManager(selectedBox); Swal.fire('Actualizado', `Monto inicial actualizado`, 'success'); loadData(); } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleSaveSaldo = async () => {
      if (!editingSaldo) return;
      try {
          await CashService.updateSaldo(editingSaldo.idsaldos, { saldoInicio: Number(editingSaldo.saldoInicio), saldoFinal: Number(editingSaldo.saldoFinal) });
          const fechaStr = sessionDetails?.arqueo.fechaApertura.substring(0, 10);
          if (fechaStr) { const slds = await CashService.getSaldosByDate(fechaStr); setSaldosSession(slds || []); }
          setEditingSaldo(null); Swal.fire('Actualizado', 'Saldos actualizados', 'success');
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleReopenBox = async (idArqueo: string) => {
      const result = await Swal.fire({ title: '¿Reabrir Caja?', text: 'Se revertirá el cierre.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, reabrir' });
      if (result.isConfirmed) {
          try { await CashService.reopenBox(idArqueo); Swal.fire('Éxito', 'La caja ha sido reabierta.', 'success'); loadData(); if(selectedBox) openManager({...selectedBox, estadoArqueo: 'Activo'}); } catch (error: any) { Swal.fire('Error', error.message, 'error'); }
      }
  };

  const startEdit = (item: Ingreso | Egreso, type: 'INGRESO' | 'EGRESO') => {
      setEditingItem({ id: type === 'INGRESO' ? (item as Ingreso).idIngreso : (item as Egreso).idegresos, type });
      // Se inicializa el formulario con todos los campos para evitar el error de undefined
      setEditForm({ 
          descripcion: item.descripcion, 
          monto: String(item.monto), 
          costo: type === 'INGRESO' ? String((item as Ingreso).costo || 0) : '0',
          subtipo: (item as any).subtipo_egreso || (item as any).subtipo_movimiento || '',
          idSocio: (item as any).id_socio_asignado ? String((item as any).id_socio_asignado) : ''
      });
  };

  const saveEdit = async () => {
      if(!editingItem.type || !selectedBox) return;
      try {
          if(editingItem.type === 'INGRESO') await CashService.updateIngreso(editingItem.id, { descripcion: editForm.descripcion, monto: Number(editForm.monto), costo: Number(editForm.costo) });
          else await CashService.updateEgreso(editingItem.id, { descripcion: editForm.descripcion, monto: Number(editForm.monto), subtipo_egreso: editForm.subtipo, id_socio_asignado: editForm.idSocio ? Number(editForm.idSocio) : null });
          setEditingItem({id:'', type: null}); openManager(selectedBox); loadData(); Swal.fire('Guardado', 'Registro actualizado', 'success');
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const deleteTransaction = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      if(!selectedBox) return;
      const result = await Swal.fire({ title: '¿Eliminar?', text: 'Esto afectará el cuadre.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar' });
      if(result.isConfirmed) {
          try {
              if(type === 'INGRESO') await CashService.deleteIngreso(id);
              else await CashService.deleteEgreso(id);
              openManager(selectedBox); loadData(); Swal.fire('Eliminado', 'Transacción eliminada', 'success');
          } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
       <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div><h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Activity className="text-indigo-600"/> Panel de Control de Cajas</h2><p className="text-slate-500 text-sm">Monitoreo en tiempo real y auditoría avanzada</p></div>
          <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg border border-slate-200"><RefreshCw size={20} className={loading ? "animate-spin" : ""} /></button>
       </div>
       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-4">
          {boxes.map((box) => (
              <div key={box.idCaja} className={`bg-white rounded-2xl p-6 shadow-sm border-l-4 transition-all hover:shadow-md ${box.estadoArqueo === 'Activo' ? 'border-l-emerald-500' : 'border-l-slate-300'}`}>
                  <div className="flex justify-between items-start mb-4">
                      <div><h3 className="font-bold text-lg text-slate-800">{box.nombreCaja}</h3><div className="flex items-center gap-2 text-xs text-slate-500 mt-1"><span className="font-mono bg-slate-100 px-1.5 rounded">{box.idCaja}</span><span>• {box.usuario || 'Sin Asignar'}</span></div></div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${box.estadoArqueo === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{box.estadoArqueo === 'Activo' ? <Unlock size={12}/> : <Lock size={12}/>}{box.estadoArqueo || 'Inactiva'}</span>
                  </div>
                  <div className="space-y-3 mb-6 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                      <div className="flex justify-between text-sm"><span className="text-slate-500">Monto Inicial:</span><span className="font-bold text-slate-700">L. {Number(box.montoInicial || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-slate-500">Efectivo Actual:</span><span className={`font-bold ${Number(box.montoFinal) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>L. {Number(box.montoFinal || 0).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm pt-2 border-t border-slate-200"><span className="text-slate-500 font-bold">Ganancia (Est.):</span><span className="font-bold text-indigo-600">L. {Number(box.ganancia || 0).toFixed(2)}</span></div>
                  </div>
                  <button onClick={() => openManager(box)} className="w-full py-2.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"><Eye size={16}/> Gestionar / Auditar</button>
              </div>
          ))}
       </div>
       {selectedBox && sessionDetails && (
           <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center md:p-4">
               <div className="bg-white w-full h-full md:h-[90vh] md:max-w-6xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
                   <div className="bg-slate-50 p-4 md:p-5 border-b border-slate-200 flex flex-col gap-4 shrink-0">
                       <div className="flex justify-between items-start">
                           <div className="flex-1 min-w-0 pr-4">
                               <h2 className="text-lg md:text-xl font-bold text-slate-800 flex flex-col md:flex-row md:items-center gap-1 md:gap-2 leading-tight"><span className="truncate">{selectedBox.nombreCaja}</span><span className="text-xs font-normal text-slate-500 bg-white border px-2 py-0.5 rounded-full w-fit">Sesión: {selectedBox.idArqueo}</span></h2>
                               <p className="text-xs md:sm text-slate-500 mt-1 truncate">Cajero: <strong>{selectedBox.nombreEmpleado}</strong> | Estado: <span className={selectedBox.estadoArqueo === 'Activo' ? 'text-emerald-600 font-bold' : 'text-slate-600 font-bold'}>{selectedBox.estadoArqueo}</span></p>
                           </div>
                           <button onClick={() => setSelectedBox(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={24} className="text-slate-500"/></button>
                       </div>
                       <div className="flex flex-wrap gap-2"><button onClick={() => generateClosingReportPDF(true)} className="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"><Printer size={16}/> Reporte Sin RECARGAS</button><button onClick={() => generateClosingReportPDF(false)} className="flex-1 md:flex-none bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"><FileText size={16}/> Reporte Completo</button></div>
                   </div>
                   <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                       <div className="w-full md:w-72 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0">
                           <div className="p-3 md:p-4 flex md:flex-col gap-2 overflow-x-auto no-scrollbar shrink-0">
                               <button onClick={() => setActiveTab('MOVIMIENTOS')} className={`flex-1 min-w-fit px-4 py-2.5 md:p-3 rounded-xl text-left font-bold text-sm flex items-center justify-center md:justify-start gap-2 md:gap-3 transition-all whitespace-nowrap ${activeTab === 'MOVIMIENTOS' ? 'bg-white shadow-md text-indigo-600 border border-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}><Activity size={18}/> <span>Movimientos</span></button>
                               <button onClick={() => setActiveTab('CONFIG')} className={`flex-1 min-w-fit px-4 py-2.5 md:p-3 rounded-xl text-left font-bold text-sm flex items-center justify-center md:justify-start gap-2 md:gap-3 transition-all whitespace-nowrap ${activeTab === 'CONFIG' ? 'bg-white shadow-md text-indigo-600 border border-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}><Settings size={18}/> <span>Configuración</span></button>
                           </div>
                           <div className="p-3 md:p-4"><div className="bg-indigo-900 rounded-xl p-4 text-white shadow-lg"><p className="text-xs text-indigo-300 uppercase font-bold mb-1">Efectivo Calculado</p><p className="text-2xl md:text-3xl font-bold tracking-tight">L. {localTotals.finalCalculado.toFixed(2)}</p></div></div>
                       </div>
                       <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/30">
                           {activeTab === 'MOVIMIENTOS' && (
                               <div className="space-y-6 animate-fade-in">
                                   <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                       <div className="p-3 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center"><h3 className="font-bold text-emerald-800 flex items-center gap-2 text-sm md:text-base"><ArrowUpCircle size={18}/> Ingresos y Ventas</h3><button onClick={() => { setShowNewModal('INGRESO'); setNewForm({ descripcion: '', monto: '', costo: '0', subtipo: 'Reparacion', idSocio: '' }); }} className="bg-emerald-600 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm hover:bg-emerald-700 transition-colors"><PlusCircle size={14}/> Nuevo Ingreso</button></div>
                                       <div className="overflow-x-auto"><table className="w-full text-[10px] md:text-sm text-left min-w-[500px]"><thead className="bg-slate-50 text-slate-500 text-[10px] uppercase"><tr><th className="p-3">Hora</th><th className="p-3">Descripción</th><th className="p-3">Costo</th><th className="p-3">Venta</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>{sessionDetails.ingresos.length === 0 ? (<tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">Sin registros.</td></tr>) : sessionDetails.ingresos.map(ing => (<tr key={ing.idIngreso} className="border-b hover:bg-slate-50 group"><td className="p-3 text-xs text-slate-400 font-mono whitespace-nowrap">{ing.fechaCreacion ? new Date(ing.fechaCreacion).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td><td className="p-3">{editingItem.id === ing.idIngreso ? (<div className="flex flex-col gap-1"><input className="border p-1 rounded w-full text-xs" value={editForm.descripcion} onChange={e=>setEditForm({...editForm, descripcion: e.target.value})} /><div className="flex gap-1"><input type="number" className="border p-1 rounded w-1/2 text-xs" value={editForm.monto} onChange={e=>setEditForm({...editForm, monto: e.target.value})} placeholder="Venta"/><input type="number" className="border p-1 rounded w-1/2 text-xs" value={editForm.costo} onChange={e=>setEditForm({...editForm, costo: e.target.value})} placeholder="Costo"/></div></div>) : (<div className="flex items-center gap-2"><span>{ing.descripcion}</span>{ing.descripcion.includes('Factura #') && (<button onClick={() => handleViewInvoiceDetails(ing.descripcion)} className="p-1 text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100"><Eye size={12}/></button>)}</div>)}</td><td className="p-3 text-slate-500">L. {Number(ing.costo || 0).toFixed(2)}</td><td className="p-3 font-bold text-emerald-600">L. {Number(ing.monto).toFixed(2)}</td><td className="p-3 text-right"><div className="flex justify-end gap-1">{editingItem.id === ing.idIngreso ? (<><button onClick={saveEdit} className="bg-emerald-100 text-emerald-700 p-1.5 rounded"><Save size={16}/></button><button onClick={() => setEditingItem({id:'', type:null})} className="bg-slate-100 text-slate-600 p-1.5 rounded"><X size={16}/></button></>) : (<>{ing.descripcion.includes('Factura #') && (<button onClick={() => handleEditInvoice(ing.descripcion)} className="text-indigo-600 hover:bg-indigo-50 p-1 rounded"><Ticket size={16}/></button>)}<button onClick={() => startEdit(ing, 'INGRESO')} className="text-slate-400 hover:text-blue-500 p-1 rounded"><Edit2 size={16}/></button><button onClick={() => deleteTransaction(ing.idIngreso, 'INGRESO')} className="text-slate-400 hover:text-red-500 p-1 rounded"><Trash2 size={16}/></button></>)}</div></td></tr>))}</tbody></table></div>
                                   </div>
                                   <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                       <div className="p-3 bg-red-50 border-b border-red-100 flex justify-between items-center"><h3 className="font-bold text-red-800 flex items-center gap-2 text-sm md:text-base"><ArrowDownCircle size={18}/> Gastos y Salidas</h3><button onClick={() => { setShowNewModal('EGRESO'); setNewForm({ descripcion: '', monto: '', costo: '0', subtipo: 'Gasto Operativo', idSocio: '' }); }} className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm hover:bg-red-700 transition-colors"><PlusCircle size={14}/> Nuevo Gasto</button></div>
                                       <div className="overflow-x-auto"><table className="w-full text-[10px] md:text-sm text-left min-w-[500px]"><thead className="bg-slate-50 text-slate-500 text-[10px] uppercase"><tr><th className="p-3">Hora</th><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>{sessionDetails.egresos.length === 0 ? (<tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">Sin registros.</td></tr>) : sessionDetails.egresos.map(egr => (<tr key={egr.idegresos} className="border-b hover:bg-slate-50 group"><td className="p-3 text-xs text-slate-400 font-mono whitespace-nowrap">{egr.fechaCreacion ? new Date(egr.fechaCreacion).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td><td className="p-3">{editingItem.id === egr.idegresos ? (<div className="flex flex-col gap-1"><input className="border p-1 rounded w-full" value={editForm.descripcion} onChange={e=>setEditForm({...editForm, descripcion: e.target.value})} /><input type="number" className="border p-1 rounded w-full text-xs" value={editForm.monto} onChange={e=>setEditForm({...editForm, monto: e.target.value})} placeholder="Monto"/></div>) : egr.descripcion}</td><td className="p-3 font-bold text-red-600">L. {Number(egr.monto).toFixed(2)}</td><td className="p-3 text-right"><div className="flex justify-end gap-1">{editingItem.id === egr.idegresos ? (<><button onClick={saveEdit} className="bg-emerald-100 text-emerald-700 p-1.5 rounded"><Save size={16}/></button><button onClick={() => setEditingItem({id:'', type:null})} className="bg-slate-100 text-slate-600 p-1.5 rounded"><X size={16}/></button></>) : (<><button onClick={() => startEdit(egr, 'EGRESO')} className="text-slate-400 hover:text-blue-500 p-1 rounded"><Edit2 size={16}/></button><button onClick={() => deleteTransaction(egr.idegresos, 'EGRESO')} className="text-slate-400 hover:text-red-500 p-1 rounded"><Trash2 size={16}/></button></>)}</div></td></tr>))}</tbody></table></div>
                                   </div>
                               </div>
                           )}
                           {activeTab === 'CONFIG' && (
                               <div className="space-y-6 animate-fade-in">
                                   <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm"><h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Edit2 size={18}/> Corrección de Monto Inicial</h3><div className="flex flex-col md:flex-row gap-4 md:items-end"><div className="flex-1"><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Monto Inicial (L.)</label><input type="number" className="w-full p-3 border border-slate-300 rounded-lg font-bold text-lg" value={newMontoInicial} onChange={e => setNewMontoInicial(e.target.value)}/></div><button onClick={handleUpdateInitial} className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-indigo-700 shadow-lg w-full md:w-auto">Actualizar y Recalcular</button></div></div>
                                   <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm"><h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Smartphone size={18}/> Saldos de Recargas</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{saldosSession.map(saldo => (<div key={saldo.idsaldos} className={`p-4 rounded-xl border ${saldo.red === 'TIGO' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}><div className="flex justify-between items-start mb-2"><span className={`font-bold ${saldo.red === 'TIGO' ? 'text-blue-700' : 'text-red-700'}`}>{saldo.red}</span><button onClick={() => setEditingSaldo(saldo)} className="text-slate-400 hover:text-indigo-600"><Edit2 size={16}/></button></div>{editingSaldo?.idsaldos === saldo.idsaldos ? (<div className="space-y-2"><div><label className="text-[10px] font-bold uppercase text-slate-500">Saldo Inicial</label><input type="number" className="w-full p-1 border rounded text-sm" value={editingSaldo.saldoInicio} onChange={e=>setEditingSaldo({...editingSaldo, saldoInicio: Number(e.target.value)})}/></div><div><label className="text-[10px] font-bold uppercase text-slate-500">Saldo Final</label><input type="number" className="w-full p-1 border rounded text-sm" value={editingSaldo.saldoFinal} onChange={e=>setEditingSaldo({...editingSaldo, saldoFinal: Number(e.target.value)})}/></div><div className="flex gap-2 mt-2"><button onClick={handleSaveSaldo} className="bg-indigo-600 text-white px-2 py-1 rounded text-xs font-bold w-full">Guardar</button><button onClick={() => setEditingSaldo(null)} className="bg-slate-200 text-slate-600 px-2 py-1 rounded text-xs font-bold w-full">Cancelar</button></div></div>) : (<div className="text-sm space-y-1"><div className="flex justify-between"><span>Inicial:</span> <strong>L. {Number(saldo.saldoInicio).toFixed(2)}</strong></div><div className="flex justify-between border-t border-black/10 pt-1 mt-1"><span>Actual:</span> <strong>L. {Number(saldo.saldoFinal).toFixed(2)}</strong></div></div>)}</div>))}</div></div>
                               </div>
                           )}
                       </div>
                   </div>
               </div>
           </div>
       )}
       {showNewModal && (
           <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
               <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 animate-fade-in">
                   <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-2"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">{showNewModal === 'INGRESO' ? <ArrowUpCircle className="text-emerald-600"/> : <ArrowDownCircle className="text-red-600"/>}{showNewModal === 'INGRESO' ? 'Registrar Ingreso (Admin)' : 'Registrar Salida (Admin)'}</h3><button onClick={() => { setShowNewModal(null); setNewForm({ descripcion: '', monto: '', costo: '0', subtipo: '', idSocio: '' }); }}><X className="text-slate-400"/></button></div>
                   <div className="space-y-4">
                       <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Clasificación</label>{showNewModal === 'INGRESO' ? (<select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={newForm.subtipo} onChange={e => setNewForm({...newForm, subtipo: e.target.value})}><option value="Reparacion">Servicio de Reparación</option><option value="Venta POS">Venta POS</option><option value="KrediYa_Prima">KrediYa (Pago de Prima)</option><option value="Cobros Venta a Negocios Externos">Cobros Venta a Negocios Externos</option></select>) : (<select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={newForm.subtipo} onChange={e => setNewForm({...newForm, subtipo: e.target.value, idSocio: ''})}><option value="Gasto Operativo">Gasto Operativo</option><option value="Pago Servicio de Reparación">Pago Servicio de Reparación</option><option value="Pago Inventario Externo">Pago Inventario Externo</option><option value="Retiro Personal">Retiro Personal</option><option value="Nomina">Pago de Empleado (Nómina)</option><option value="Compra Inventario">Compra de Mercadería</option></select>)}</div>
                       {showNewModal === 'EGRESO' && (newForm.subtipo === 'Retiro Personal' || newForm.subtipo === 'Nomina') && (<div className="animate-fade-in"><label className="text-[10px] font-black text-indigo-500 uppercase mb-1 block">Vincular a Socio</label><select className="w-full p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-bold text-indigo-700" value={newForm.idSocio} onChange={e => setNewForm({...newForm, idSocio: e.target.value})}><option value="">-- Seleccionar Socio --</option>{partners.map(p => <option key={p.idSocio} value={p.idSocio}>{p.nombre}</option>)}</select></div>)}
                       <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción</label><input className="w-full p-3 border rounded-xl outline-none" value={newForm.descripcion} onChange={e => setNewForm({...newForm, descripcion: e.target.value})} placeholder="Ej: Pago de alquiler" /></div>
                       <div className="grid grid-cols-2 gap-4"><div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Monto</label><input type="number" className="w-full p-3 border rounded-xl font-bold" value={newForm.monto} onChange={e => setNewForm({...newForm, monto: e.target.value})} /></div>{showNewModal === 'INGRESO' && (<div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Costo Inversión</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-red-500" value={newForm.costo} onChange={e => setNewForm({...newForm, costo: e.target.value})} /></div>)}</div>
                   </div>
                   <div className="flex gap-3 mt-8"><button onClick={() => { setShowNewModal(null); setNewForm({ descripcion: '', monto: '', costo: '0', subtipo: '', idSocio: '' }); }} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-xl">Cancelar</button><button onClick={handleCreateManualTransaction} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg uppercase text-xs tracking-widest">REGISTRAR</button></div>
               </div>
           </div>
       )}
    </div>
  );
};

export default AdminCashDashboard;
