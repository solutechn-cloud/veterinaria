
import React, { useEffect, useState } from 'react';
import { CashService, SalesService, AccountingService, PackagesService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Saldo, Socio, SubtipoIngreso, SubtipoEgreso } from '../types';
import { Activity, Lock, Unlock, RefreshCw, AlertTriangle, Eye, ArrowUpCircle, ArrowDownCircle, Settings, X, Save, Edit2, Trash2, FileText, Smartphone, Printer, History, Calendar, Ticket, Info, PlusCircle, ArrowUpRight, UserCheck, DollarSign } from 'lucide-react';
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
    reds?: { tigo: Saldo | null, claro: Saldo | null };
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
  
  const [selectedBox, setSelectedBox] = useState<BoxStatus | null>(null);
  const [sessionDetails, setSessionDetails] = useState<{arqueo: Arqueo, ingresos: Ingreso[], egresos: Egreso[]} | null>(null);
  const [sessionsHistory, setSessionsHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'MOVIMIENTOS' | 'CONFIG'>('MOVIMIENTOS');
  
  const [localTotals, setLocalTotals] = useState({ totalIngresos: 0, totalEgresos: 0, finalCalculado: 0 });

  const [editingItem, setEditingItem] = useState<{id: string, type: 'INGRESO'|'EGRESO'|null}>({id:'', type: null});
  const [editForm, setEditForm] = useState({ 
    descripcion: '', 
    monto: '', 
    costo: '', 
    subtipo: '' as string, 
    idSocio: '' as string 
  });
  
  // States for Balance Adjustments
  const [newMontoInicial, setNewMontoInicial] = useState<string>('');
  const [newSaldoTigoInic, setNewSaldoTigoInic] = useState<string>('');
  const [newSaldoTigoFinal, setNewSaldoTigoFinal] = useState<string>('');
  const [newSaldoClaroInic, setNewSaldoClaroInic] = useState<string>('');
  const [newSaldoClaroFinal, setNewSaldoClaroFinal] = useState<string>('');

  const [showNewModal, setShowNewModal] = useState<'INGRESO' | 'EGRESO' | null>(null);
  const [newForm, setNewForm] = useState({ descripcion: '', monto: '', costo: '0', subtipo: '', idSocio: '' });

  const [saldosSession, setSaldosSession] = useState<Saldo[]>([]);

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
      setLoading(true);
      try {
          const details = await CashService.getSessionDetails(idArqueo);
          setSessionDetails(details);
          
          const historicalBoxInfo: BoxStatus = {
              ...boxInfo,
              idArqueo: details.arqueo.idArqueo,
              estadoArqueo: details.arqueo.estado,
              montoInicial: Number(details.arqueo.montoInicial),
              montoFinal: Number(details.arqueo.montoFinal),
              ganancia: Number(details.arqueo.ganancia),
              fechaApertura: details.arqueo.fechaApertura,
              fechaCierre: details.arqueo.fechaCierre
          };
          setSelectedBox(historicalBoxInfo);
          setNewMontoInicial(String(details.arqueo.montoInicial || 0));
          
          if (details.arqueo.fechaApertura) {
              const fechaStr = details.arqueo.fechaApertura.substring(0, 10);
              const slds = await CashService.getSaldosByDate(fechaStr);
              setSaldosSession(slds || []);
              
              const tigo = slds.find(s => s.red === 'TIGO');
              const claro = slds.find(s => s.red === 'CLARO');
              
              setNewSaldoTigoInic(String(tigo?.saldoInicio || 0));
              setNewSaldoTigoFinal(String(tigo?.saldoFinal || 0));
              setNewSaldoClaroInic(String(claro?.saldoInicio || 0));
              setNewSaldoClaroFinal(String(claro?.saldoFinal || 0));
          }
      } catch (error) { 
          console.error(error); 
          Swal.fire('Error', 'No se pudo cargar la sesión.', 'error'); 
      }
      finally { setLoading(false); }
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

  const handleUpdateBalance = async () => {
      if(!selectedBox?.idArqueo || !sessionDetails) return;
      try {
          Swal.fire({ title: 'Procesando cambios...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
          
          // 1. Update Initial Cash Amount
          await CashService.updateInitialAmount(selectedBox.idArqueo, Number(newMontoInicial));
          
          // 2. Update Red Balances (Tigo/Claro)
          const tigo = saldosSession.find(s => s.red === 'TIGO');
          if (tigo) {
              await CashService.updateSaldo(tigo.idsaldos, { saldoInicio: Number(newSaldoTigoInic), saldoFinal: Number(newSaldoTigoFinal) });
          }
          
          const claro = saldosSession.find(s => s.red === 'CLARO');
          if (claro) {
              await CashService.updateSaldo(claro.idsaldos, { saldoInicio: Number(newSaldoClaroInic), saldoFinal: Number(newSaldoClaroFinal) });
          }

          await loadSessionById(selectedBox.idArqueo, selectedBox);
          await loadData();
          Swal.fire('Actualizado', 'Balance y saldos recalculados correctamente.', 'success');
      } catch(e:any) { 
          Swal.fire('Error', e.message, 'error'); 
      }
  };

  const handleCreateManualTransaction = async () => {
    if (!selectedBox || !sessionDetails) return;
    if (!newForm.descripcion || !newForm.monto || !newForm.subtipo) return Swal.fire('Error', 'Complete los campos requeridos', 'error');
    try {
        const arqDate = sessionDetails.arqueo.fechaApertura.substring(0, 10);
        const manualTimestamp = `${arqDate} 12:00:00`;
        
        if (showNewModal === 'INGRESO') {
            await CashService.createIngreso({ idCaja: selectedBox.idCaja, descripcion: `(AUDITORIA) ${newForm.descripcion}`, monto: Number(newForm.monto), costo: Number(newForm.costo), subtipo_movimiento: newForm.subtipo as SubtipoIngreso, fechaCreacion: manualTimestamp });
        } else {
            await CashService.createEgreso({ idCaja: selectedBox.idCaja, descripcion: `(AUDITORIA) ${newForm.descripcion}`, monto: Number(newForm.monto), subtipo_egreso: newForm.subtipo as SubtipoEgreso, id_socio_asignado: newForm.idSocio ? Number(newForm.idSocio) : null, fechaCreacion: manualTimestamp });
        }
        setShowNewModal(null);
        setNewForm({ descripcion: '', monto: '', costo: '0', subtipo: '', idSocio: '' });
        await loadSessionById(sessionDetails.arqueo.idArqueo, selectedBox);
        loadData();
        Swal.fire('Éxito', 'Movimiento registrado correctamente en la fecha seleccionada.', 'success');
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
          const tableHtml = `<div class="overflow-x-auto mt-4 text-left"><table class="w-full text-xs border-collapse"><thead><tr class="bg-slate-100"><th className="p-2 border font-bold">Cant.</th><th className="p-2 border font-bold">Descripción</th><th className="p-2 border font-bold text-right">Total</th></tr></thead><tbody>${detalles.map(d => `<tr><td className="p-2 border text-center">${d.cantidad}</td><td className="p-2 border font-medium">${d.descripcionProducto || 'N/A'}</td><td className="p-2 border text-right font-bold">L. ${(Number(d.cantidad) * Number(d.precioVenta)).toFixed(2)}</td></tr>`).join('')}</tbody></table></div>`;
          Swal.fire({ title: `Factura: ${saleId}`, html: tableHtml, width: '600px', confirmButtonColor: '#4f46e5' });
      } catch (error) { Swal.fire('Error', 'No se pudo obtener el detalle.', 'error'); }
  };

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
      doc.text("REPORTE DE AUDITORÍA DE CAJA", 105, 15, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`Generado: ${date} | Sesión: ${arqueo.idArqueo}`, 105, 23, { align: 'center' });
      doc.text(`Cajero: ${selectedBox.nombreEmpleado} | Caja: ${selectedBox.idCaja}`, 105, 28, { align: 'center' });

      doc.setTextColor(0); doc.setFontSize(11); doc.text("RESUMEN FINANCIERO", 14, 45);
      const summaryData = [
          ['Monto Inicial', `L. ${mInicial.toFixed(2)}`],
          ['(+) Total Ingresos', `L. ${tVentaIn.toFixed(2)}`],
          ['(-) Total Gastos', `L. ${tGastos.toFixed(2)}`],
          ['(=) Efectivo en Caja', `L. ${mFinal.toFixed(2)}`],
          ['Ganancia Estimada', `L. ${tGananciaIn.toFixed(2)}`]
      ];
      // @ts-ignore
      doc.autoTable({ startY: 50, head: [['Concepto', 'Monto']], body: summaryData, theme: 'grid', headStyles: { fillColor: [79, 70, 229] }, columnStyles: { 1: { halign: 'right' } }, margin: { right: 110 } });
      const ySummary = (doc as any).lastAutoTable.finalY;

      const tigoS = saldosSession.find(s => s.red === 'TIGO')?.saldoFinal || 0;
      const claroS = saldosSession.find(s => s.red === 'CLARO')?.saldoFinal || 0;
      // @ts-ignore
      doc.autoTable({ startY: 50, head: [['Plataforma', 'Saldo Final']], body: [['TIGO', `L. ${Number(tigoS).toFixed(2)}`], ['CLARO', `L. ${Number(claroS).toFixed(2)}`]], theme: 'grid', headStyles: { fillColor: [15, 23, 42] }, columnStyles: { 1: { halign: 'right', textColor: [0, 128, 0], fontStyle: 'bold' } }, margin: { left: 110 } });
      const yPlatforms = (doc as any).lastAutoTable.finalY;

      let currentY = Math.max(ySummary, yPlatforms) + 25; 
      
      doc.setTextColor(0); doc.setFontSize(11); doc.text("DETALLE DE INGRESOS (Completo)", 14, currentY);
      const incomeRows = ingresosList.map(i => [i.descripcion, `L. ${Number(i.costo||0).toFixed(2)}`, `L. ${Number(i.monto||0).toFixed(2)}`, `L. ${(Number(i.monto||0)-Number(i.costo||0)).toFixed(2)}`]);
      // @ts-ignore
      doc.autoTable({ 
          startY: currentY + 5, head: [['Descripción', 'Costo', 'Venta', 'Ganancia']], 
          body: [...incomeRows, [{content: 'TOTALES', styles: {halign: 'right', fontStyle: 'bold'}}, `L. ${tCostoIn.toFixed(2)}`, `L. ${tVentaIn.toFixed(2)}`, `L. ${tGananciaIn.toFixed(2)}` ]], 
          theme: 'striped', headStyles: { fillColor: [16, 185, 129] }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
          didParseCell: (data) => { if(data.row.index === incomeRows.length) { data.cell.styles.fillColor = [30, 41, 59]; data.cell.styles.textColor = [255, 255, 255]; } }
      });

      currentY = (doc as any).lastAutoTable.finalY + 12;
      doc.text("DETALLE DE GASTOS / SALIDAS", 14, currentY);
      const expenseRows = sessionDetails.egresos.map(e => [e.descripcion, `L. ${Number(e.monto||0).toFixed(2)}`]);
      // @ts-ignore
      doc.autoTable({ 
          startY: currentY + 5, head: [['Descripción', 'Monto']], body: [...expenseRows, [{content: 'TOTAL GASTOS', styles: {halign: 'right', fontStyle: 'bold'}}, `L. ${tGastos.toFixed(2)}` ]], 
          theme: 'striped', headStyles: { fillColor: [239, 68, 68] }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
          didParseCell: (data) => { if(data.row.index === expenseRows.length) { data.cell.styles.fillColor = [30, 41, 59]; data.cell.styles.textColor = [255, 255, 255]; } }
      });
      doc.save(`Auditoria_${arqueo.idArqueo}.pdf`);
  };

  const startEdit = (item: Ingreso | Egreso, type: 'INGRESO' | 'EGRESO') => {
      setEditingItem({ id: type === 'INGRESO' ? (item as Ingreso).idIngreso : (item as Egreso).idegresos, type });
      setEditForm({ 
          descripcion: item.descripcion, 
          monto: String(item.monto), 
          costo: type === 'INGRESO' ? String((item as Ingreso).costo || 0) : '0',
          subtipo: (item as any).subtipo_egreso || (item as any).subtipo_movimiento || '',
          idSocio: (item as any).id_socio_asignado ? String((item as any).id_socio_asignado) : ''
      });
  };

  const saveEdit = async () => {
      if(!editingItem.type || !selectedBox || !sessionDetails) return;
      try {
          if(editingItem.type === 'INGRESO') await CashService.updateIngreso(editingItem.id, { descripcion: editForm.descripcion, monto: Number(editForm.monto), costo: Number(editForm.costo) });
          else await CashService.updateEgreso(editingItem.id, { descripcion: editForm.descripcion, monto: Number(editForm.monto), subtipo_egreso: editForm.subtipo, id_socio_asignado: editForm.idSocio ? Number(editForm.idSocio) : null });
          setEditingItem({id:'', type: null}); 
          loadSessionById(sessionDetails.arqueo.idArqueo, selectedBox); 
          loadData(); 
          Swal.fire('Guardado', 'Registro actualizado y balance recalculado.', 'success');
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const deleteTransaction = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      if(!selectedBox || !sessionDetails) return;
      const result = await Swal.fire({ title: '¿Eliminar registro?', text: 'Esto alterará permanentemente el balance de esta sesión.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar', confirmButtonColor: '#ef4444' });
      if(result.isConfirmed) {
          try {
              if(type === 'INGRESO') await CashService.deleteIngreso(id);
              else await CashService.deleteEgreso(id);
              loadSessionById(sessionDetails.arqueo.idArqueo, selectedBox); 
              loadData(); 
              Swal.fire('Eliminado', 'Transacción eliminada con éxito.', 'success');
          } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
       <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div><h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Activity className="text-indigo-600"/> Panel de Control de Cajas</h2><p className="text-slate-500 text-sm">Monitoreo en tiempo real y auditoría retroactiva</p></div>
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
               <div className="bg-white w-full h-full md:h-[95vh] md:max-w-6xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
                   <div className="bg-slate-50 p-4 md:p-6 border-b border-slate-200 flex flex-col gap-5 shrink-0">
                       <div className="flex justify-between items-start">
                           <div className="flex-1 min-w-0 pr-4">
                               <div className="flex items-center gap-3">
                                   <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600"><History size={24}/></div>
                                   <div>
                                       <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">{selectedBox.nombreCaja} <span className="text-sm font-normal text-slate-400 bg-white border px-2 py-0.5 rounded-full">ID: {selectedBox.idArqueo}</span></h2>
                                       <div className="flex items-center gap-4 mt-1">
                                           <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><UserCheck size={14}/> {selectedBox.nombreEmpleado}</div>
                                           <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><Calendar size={14}/> {new Date(selectedBox.fechaApertura).toLocaleDateString()}</div>
                                           <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${selectedBox.estadoArqueo === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{selectedBox.estadoArqueo}</span>
                                       </div>
                                   </div>
                               </div>
                           </div>
                           <button onClick={() => setSelectedBox(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={24} className="text-slate-500"/></button>
                       </div>
                       
                       <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-3 rounded-2xl border border-slate-200">
                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">Cambiar de Sesión:</label>
                                <select 
                                    className="flex-1 md:flex-none p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    value={selectedBox.idArqueo}
                                    onChange={handleSwitchSession}
                                >
                                    {sessionsHistory.map(s => (
                                        <option key={s.idArqueo} value={s.idArqueo}>
                                            {new Date(s.fechaApertura).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} ({s.estado})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-2 w-full md:w-auto">
                                <button onClick={() => generateClosingReportPDF(true)} className="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"><Printer size={16}/> REPORTE SIN RECARGAS</button>
                                <button onClick={() => generateClosingReportPDF(false)} className="flex-1 md:flex-none bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"><FileText size={16}/> REPORTE COMPLETO</button>
                            </div>
                       </div>
                   </div>

                   <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                       <div className="w-full md:w-72 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0">
                           <div className="p-4 flex md:flex-col gap-2 shrink-0">
                               <button onClick={() => setActiveTab('MOVIMIENTOS')} className={`flex-1 min-w-fit px-4 py-3 rounded-xl text-left font-bold text-sm flex items-center gap-3 transition-all whitespace-nowrap ${activeTab === 'MOVIMIENTOS' ? 'bg-white shadow-md text-indigo-600 border border-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}><Activity size={18}/> <span>Movimientos</span></button>
                               <button onClick={() => setActiveTab('CONFIG')} className={`flex-1 min-w-fit px-4 py-3 rounded-xl text-left font-bold text-sm flex items-center gap-3 transition-all whitespace-nowrap ${activeTab === 'CONFIG' ? 'bg-white shadow-md text-indigo-600 border border-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}><Settings size={18}/> <span>Ajustes Balance</span></button>
                           </div>
                           <div className="p-4 mt-auto">
                               <div className="bg-indigo-900 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
                                   <div className="absolute top-0 right-0 p-4 opacity-10"><DollarSign size={80}/></div>
                                   <p className="text-[10px] text-indigo-300 uppercase font-black tracking-widest mb-1">Efectivo en Caja</p>
                                   <h3 className="text-3xl font-black tracking-tight">L. {localTotals.finalCalculado.toFixed(2)}</h3>
                                   <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center text-[10px] font-bold">
                                       <span className="text-indigo-300">TOTAL COSTO:</span>
                                       <span>L. {sessionDetails.ingresos.reduce((a,b)=>a+Number(b.costo||0),0).toFixed(2)}</span>
                                   </div>
                                   <div className="mt-1 flex justify-between items-center text-[10px] font-bold">
                                       <span className="text-emerald-400">GANANCIA EST.:</span>
                                       <span className="text-emerald-400">L. {(localTotals.totalIngresos - sessionDetails.ingresos.reduce((a,b)=>a+Number(b.costo||0),0)).toFixed(2)}</span>
                                   </div>
                               </div>
                           </div>
                       </div>

                       <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/30 custom-scrollbar">
                           {loading && (
                               <div className="flex items-center justify-center h-40 text-indigo-500 gap-2"><RefreshCw className="animate-spin"/> Actualizando datos de auditoría...</div>
                           )}
                           {!loading && activeTab === 'MOVIMIENTOS' && (
                               <div className="space-y-8 animate-fade-in">
                                   <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                       <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
                                           <h3 className="font-black text-emerald-800 flex items-center gap-2 text-sm uppercase tracking-wider"><ArrowUpCircle size={18}/> Ingresos y Ventas</h3>
                                           <button onClick={() => { setShowNewModal('INGRESO'); setNewForm({ descripcion: '', monto: '', costo: '0', subtipo: 'Venta', idSocio: '' }); }} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"><PlusCircle size={14}/> Nuevo Ingreso</button>
                                       </div>
                                       <div className="overflow-x-auto">
                                           <table className="w-full text-xs md:text-sm text-left min-w-[600px]">
                                               <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest border-b">
                                                   <tr><th className="p-4">Hora</th><th className="p-4">Descripción</th><th className="p-4 text-right">Costo</th><th className="p-4 text-right">Monto</th><th className="p-4 text-center">Acción</th></tr>
                                               </thead>
                                               <tbody className="divide-y divide-slate-100">
                                                   {sessionDetails.ingresos.length === 0 ? (
                                                       <tr><td colSpan={5} className="p-10 text-center text-slate-400 italic font-medium">Sin registros encontrados para esta sesión.</td></tr>
                                                   ) : sessionDetails.ingresos.map(ing => (
                                                       <tr key={ing.idIngreso} className="hover:bg-slate-50 group">
                                                           <td className="p-4 text-[10px] text-slate-400 font-mono">{ing.fechaCreacion ? ing.fechaCreacion.split(' ')[1] : '-'}</td>
                                                           <td className="p-4">
                                                               {editingItem.id === ing.idIngreso ? (
                                                                   <div className="flex flex-col gap-1.5"><input className="p-2 bg-slate-50 border rounded-lg w-full font-bold" value={editForm.descripcion} onChange={e=>setEditForm({...editForm, descripcion: e.target.value})} /><div className="flex gap-1.5"><input type="number" className="p-2 border rounded-lg w-1/2 font-bold text-emerald-600" value={editForm.monto} onChange={e=>setEditForm({...editForm, monto: e.target.value})} placeholder="Venta"/><input type="number" className="p-2 border rounded-lg w-1/2 font-bold text-red-500" value={editForm.costo} onChange={e=>setEditForm({...editForm, costo: e.target.value})} placeholder="Costo"/></div></div>
                                                               ) : (
                                                                   <div className="flex items-center gap-2">
                                                                       <span className="font-bold text-slate-700">{ing.descripcion}</span>
                                                                       {ing.descripcion.includes('Factura #') && (<button onClick={() => handleViewInvoiceDetails(ing.descripcion)} className="p-1 text-indigo-500 hover:bg-indigo-50 rounded" title="Ver Detalle"><Eye size={12}/></button>)}
                                                                   </div>
                                                               )}
                                                           </td>
                                                           <td className="p-4 text-right font-bold text-slate-400">L. {Number(ing.costo || 0).toFixed(2)}</td>
                                                           <td className="p-4 text-right font-black text-emerald-600 text-base">L. {Number(ing.monto).toFixed(2)}</td>
                                                           <td className="p-4 text-center">
                                                               <div className="flex justify-center gap-1.5">
                                                                   {editingItem.id === ing.idIngreso ? (
                                                                       <><button onClick={saveEdit} className="bg-emerald-100 text-emerald-700 p-2 rounded-lg hover:bg-emerald-200"><Save size={16}/></button><button onClick={() => setEditingItem({id:'', type:null})} className="bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200"><X size={16}/></button></>
                                                                   ) : (
                                                                       <>{ing.descripcion.includes('Factura #') && (<button onClick={() => handleEditInvoice(ing.descripcion)} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg" title="Editar en POS"><Ticket size={16}/></button>)}<button onClick={() => startEdit(ing, 'INGRESO')} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg" title="Corregir Auditoría"><Edit2 size={16}/></button><button onClick={() => deleteTransaction(ing.idIngreso, 'INGRESO')} className="text-red-400 hover:bg-red-50 p-2 rounded-lg" title="Eliminar"><Trash2 size={16}/></button></>
                                                                   )}
                                                               </div>
                                                           </td>
                                                       </tr>
                                                   ))}
                                               </tbody>
                                           </table>
                                       </div>
                                   </div>

                                   <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                       <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
                                           <h3 className="font-black text-red-800 flex items-center gap-2 text-sm uppercase tracking-wider"><ArrowDownCircle size={18}/> Gastos y Egresos</h3>
                                           <button onClick={() => { setShowNewModal('EGRESO'); setNewForm({ descripcion: '', monto: '', costo: '0', subtipo: 'Gasto Operativo', idSocio: '' }); }} className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-2 shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all"><PlusCircle size={14}/> Nuevo Gasto</button>
                                       </div>
                                       <div className="overflow-x-auto">
                                           <table className="w-full text-xs md:text-sm text-left min-w-[600px]">
                                               <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest border-b">
                                                   <tr><th className="p-4">Hora</th><th className="p-4">Descripción / Socio</th><th className="p-4 text-right">Monto</th><th className="p-4 text-center">Acción</th></tr>
                                               </thead>
                                               <tbody className="divide-y divide-slate-100">
                                                   {sessionDetails.egresos.length === 0 ? (
                                                       <tr><td colSpan={4} className="p-10 text-center text-slate-400 italic font-medium">No se registraron egresos en esta jornada.</td></tr>
                                                   ) : sessionDetails.egresos.map(egr => (
                                                       <tr key={egr.idegresos} className="hover:bg-slate-50 group">
                                                           <td className="p-4 text-[10px] text-slate-400 font-mono">{egr.fechaCreacion ? egr.fechaCreacion.split(' ')[1] : '-'}</td>
                                                           <td className="p-4">
                                                               {editingItem.id === egr.idegresos ? (
                                                                   <div className="flex flex-col gap-1.5"><input className="p-2 border rounded-lg w-full font-bold" value={editForm.descripcion} onChange={e=>setEditForm({...editForm, descripcion: e.target.value})} /><input type="number" className="p-2 border rounded-lg w-full font-bold text-red-600" value={editForm.monto} onChange={e=>setEditForm({...editForm, monto: e.target.value})} placeholder="Monto"/></div>
                                                               ) : (
                                                                   <div>
                                                                       <p className="font-bold text-slate-700">{egr.descripcion}</p>
                                                                       {egr.id_socio_asignado && <span className="text-[10px] text-indigo-500 font-black flex items-center gap-1 mt-0.5"><UserCheck size={10}/> {partners.find(p=>p.idSocio===egr.id_socio_asignado)?.nombre}</span>}
                                                                   </div>
                                                               )}
                                                           </td>
                                                           <td className="p-4 text-right font-black text-red-600 text-base">L. {Number(egr.monto).toFixed(2)}</td>
                                                           <td className="p-4 text-center">
                                                               <div className="flex justify-center gap-1.5">
                                                                   {editingItem.id === egr.idegresos ? (
                                                                       <><button onClick={saveEdit} className="bg-emerald-100 text-emerald-700 p-2 rounded-lg hover:bg-emerald-200"><Save size={16}/></button><button onClick={() => setEditingItem({id:'', type:null})} className="bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200"><X size={16}/></button></>
                                                                   ) : (
                                                                       <><button onClick={() => startEdit(egr, 'EGRESO')} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg" title="Editar"><Edit2 size={16}/></button><button onClick={() => deleteTransaction(egr.idegresos, 'EGRESO')} className="text-red-400 hover:bg-red-50 p-2 rounded-lg" title="Eliminar"><Trash2 size={16}/></button></>
                                                                   )}
                                                               </div>
                                                           </td>
                                                       </tr>
                                                   ))}
                                               </tbody>
                                           </table>
                                       </div>
                                   </div>
                               </div>
                           )}
                           
                           {activeTab === 'CONFIG' && (
                               <div className="space-y-6 animate-fade-in">
                                   <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                       <h3 className="font-black text-slate-800 mb-6 flex items-center gap-3 uppercase text-sm tracking-wider"><Settings className="text-indigo-600"/> Corrección de Balance</h3>
                                       <div className="space-y-6">
                                           <div>
                                               <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Monto Inicial de Efectivo (L.)</label>
                                               <input type="number" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-2xl text-indigo-700 outline-none" value={newMontoInicial} onChange={e => setNewMontoInicial(e.target.value)}/>
                                           </div>
                                           
                                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                                                <div className="md:col-span-2 flex items-center gap-2 border-b border-blue-100 pb-2">
                                                    <Smartphone size={16} className="text-blue-600"/>
                                                    <h4 className="text-xs font-black text-blue-800 uppercase">Saldos de Red: TIGO</h4>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-blue-400 uppercase mb-1 block">Saldo Apertura (Inic)</label>
                                                    <input type="number" className="w-full p-3 bg-white border border-blue-200 rounded-xl font-bold" value={newSaldoTigoInic} onChange={e => setNewSaldoTigoInic(e.target.value)}/>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-blue-400 uppercase mb-1 block">Saldo Cierre (Actual)</label>
                                                    <input type="number" className="w-full p-3 bg-white border border-blue-200 rounded-xl font-bold" value={newSaldoTigoFinal} onChange={e => setNewSaldoTigoFinal(e.target.value)}/>
                                                </div>
                                           </div>

                                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-red-50/50 rounded-2xl border border-red-100">
                                                <div className="md:col-span-2 flex items-center gap-2 border-b border-red-100 pb-2">
                                                    <Smartphone size={16} className="text-red-600"/>
                                                    <h4 className="text-xs font-black text-red-800 uppercase">Saldos de Red: CLARO</h4>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-red-400 uppercase mb-1 block">Saldo Apertura (Inic)</label>
                                                    <input type="number" className="w-full p-3 bg-white border border-red-200 rounded-xl font-bold" value={newSaldoClaroInic} onChange={e => setNewSaldoClaroInic(e.target.value)}/>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-red-400 uppercase mb-1 block">Saldo Cierre (Actual)</label>
                                                    <input type="number" className="w-full p-3 bg-white border border-red-200 rounded-xl font-bold" value={newSaldoClaroFinal} onChange={e => setNewSaldoClaroFinal(e.target.value)}/>
                                                </div>
                                           </div>

                                           <button onClick={handleUpdateBalance} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all active:scale-[0.98] uppercase text-xs tracking-widest">ACTUALIZAR Y RECALCULAR TODO</button>
                                       </div>
                                       <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start gap-3">
                                           <Info size={20} className="text-indigo-500 shrink-0 mt-0.5"/>
                                           <p className="text-xs text-indigo-700 leading-relaxed font-medium">Al actualizar, el sistema ajustará el efectivo y los saldos de redes para esta fecha específica. Úselo con precaución para corregir errores de cierre o apertura.</p>
                                       </div>
                                   </div>
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
                   <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-2">
                       <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                           {showNewModal === 'INGRESO' ? <ArrowUpCircle className="text-emerald-600"/> : <ArrowDownCircle className="text-red-600"/>}
                           {showNewModal === 'INGRESO' ? 'Registrar Ingreso Retroactivo' : 'Registrar Salida Retroactiva'}
                       </h3>
                       <button onClick={() => setShowNewModal(null)}><X className="text-slate-400"/></button>
                   </div>
                   <div className="space-y-4">
                       <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
                           <Calendar size={16} className="text-amber-600"/>
                           <span className="text-[10px] font-black text-amber-800 uppercase">Auditando: {sessionDetails?.arqueo.fechaApertura.substring(0,10)}</span>
                       </div>
                       
                       <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Clasificación</label>
                           {showNewModal === 'INGRESO' ? (
                               <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={newForm.subtipo} onChange={e => setNewForm({...newForm, subtipo: e.target.value})}>
                                   <option value="Reparacion">Servicio de Reparación</option>
                                   <option value="Venta">Venta Producto</option>
                                   <option value="KrediYa_Prima">KrediYa (Pago de Prima)</option>
                                   <option value="Cobros Venta a Negocios Externos">Cobros Venta a Negocios Externos</option>
                               </select>
                           ) : (
                               <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={newForm.subtipo} onChange={e => setNewForm({...newForm, subtipo: e.target.value, idSocio: ''})}>
                                   <option value="Gasto Operativo">Gasto Operativo</option>
                                   <option value="Pago Servicio de Reparación">Pago Servicio de Reparación</option>
                                   <option value="Pago Inventario Externo">Pago Inventario Externo</option>
                                   <option value="Retiro Personal">Retiro Personal</option>
                                   <option value="Nomina">Pago de Empleado (Nómina)</option>
                                   <option value="Compra Inventario">Compra de Mercadería</option>
                               </select>
                           )}
                       </div>
                       
                       {showNewModal === 'EGRESO' && (newForm.subtipo === 'Retiro Personal' || newForm.subtipo === 'Nomina') && (
                           <div className="animate-fade-in">
                               <label className="text-[10px] font-black text-indigo-500 uppercase mb-1 block">Vincular a Socio</label>
                               <select className="w-full p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-bold text-indigo-700" value={newForm.idSocio} onChange={e => setNewForm({...newForm, idSocio: e.target.value})}>
                                   <option value="">-- Seleccionar Socio --</option>
                                   {partners.map(p => <option key={p.idSocio} value={p.idSocio}>{p.nombre}</option>)}
                               </select>
                           </div>
                       )}
                       
                       <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción</label><input className="w-full p-3 border rounded-xl outline-none" value={newForm.descripcion} onChange={e => setNewForm({...newForm, descripcion: e.target.value})} placeholder="Ej: Pago de alquiler atrasado" /></div>
                       
                       <div className="grid grid-cols-2 gap-4">
                           <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Monto</label><input type="number" className="w-full p-3 border rounded-xl font-black text-lg" value={newForm.monto} onChange={e => setNewForm({...newForm, monto: e.target.value})} /></div>
                           {showNewModal === 'INGRESO' && (
                               <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Costo Inversión</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-red-500" value={newForm.costo} onChange={e => setNewForm({...newForm, costo: e.target.value})} /></div>
                           )}
                       </div>
                   </div>
                   <div className="flex gap-3 mt-8">
                       <button onClick={() => setShowNewModal(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl">Cancelar</button>
                       <button onClick={handleCreateManualTransaction} className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 uppercase text-[10px] tracking-widest">INSERTAR</button>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};

export default AdminCashDashboard;
