import React, { useEffect, useState } from 'react';
import { CashService, AccountingService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Saldo, Socio } from '../types';
import { Activity, Lock, Unlock, RefreshCw, AlertTriangle, Eye, ArrowUpCircle, ArrowDownCircle, Settings, X, Save, Edit2, Trash2, FileText, Smartphone, Printer, CheckCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

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
  const [boxes, setBoxes] = useState<BoxStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Manager Modal State
  const [selectedBox, setSelectedBox] = useState<BoxStatus | null>(null);
  const [sessionDetails, setSessionDetails] = useState<{arqueo: Arqueo, ingresos: Ingreso[], egresos: Egreso[]} | null>(null);
  const [activeTab, setActiveTab] = useState<'MOVIMIENTOS' | 'CONFIG'>('MOVIMIENTOS');
  
  // Calculated Totals for Instant UI Feedback
  const [localTotals, setLocalTotals] = useState({ totalIngresos: 0, totalEgresos: 0, finalCalculado: 0 });

  // Edit States
  const [editingItem, setEditingItem] = useState<{id: string, type: 'INGRESO'|'EGRESO'|null}>({id:'', type: null});
  const [editForm, setEditForm] = useState({ descripcion: '', monto: '', costo: '', categoria: '', idSocio: '' });
  const [newMontoInicial, setNewMontoInicial] = useState<string>('');

  // NEW: Saldos & Partners
  const [saldosSession, setSaldosSession] = useState<Saldo[]>([]);
  const [editingSaldo, setEditingSaldo] = useState<Saldo | null>(null);
  const [partners, setPartners] = useState<Socio[]>([]);

  useEffect(() => {
    loadData();
    loadPartners();
  }, []);

  useEffect(() => {
      if (sessionDetails) {
          const ingresos = sessionDetails.ingresos.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
          const egresos = sessionDetails.egresos.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
          const inicial = Number(sessionDetails.arqueo.montoInicial || 0);
          
          setLocalTotals({
              totalIngresos: ingresos,
              totalEgresos: egresos,
              finalCalculado: (inicial + ingresos) - egresos
          });
      }
  }, [sessionDetails]);

  const loadPartners = async () => {
      try { const data = await AccountingService.getSocios(); setPartners(data); } catch (e) { console.error(e); }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await CashService.getAdminBoxesStatus();
      setBoxes(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openManager = async (box: BoxStatus) => {
      setSelectedBox(box);
      setNewMontoInicial(String(box.montoInicial || 0));
      try {
          if (box.idArqueo) {
              const details = await CashService.getSessionDetails(box.idArqueo);
              setSessionDetails(details);
              
              if (details.arqueo.fechaApertura) {
                  const fechaStr = details.arqueo.fechaApertura.substring(0, 10);
                  const slds = await CashService.getSaldosByDate(fechaStr);
                  setSaldosSession(slds || []);
              }
          }
      } catch (error) {
          console.error(error);
          Swal.fire('Error', 'No se pudieron cargar los detalles', 'error');
      }
  };

  const generateClosingReportPDF = (excludeRecharges: boolean = false) => {
      if (!selectedBox || !sessionDetails) return;

      const doc = new jsPDF();
      const date = new Date().toLocaleString();
      const arqueo = sessionDetails.arqueo;

      let ingresosList = sessionDetails.ingresos;
      if (excludeRecharges) {
          ingresosList = ingresosList.filter(i => {
              const desc = i.descripcion.toUpperCase();
              return !desc.includes('RECARGA') && !desc.includes('PAQUETE') && !desc.includes('SALDO');
          });
      }

      // PDF Styling
      doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 35, 'F');
      doc.setTextColor(255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      const title = excludeRecharges ? "REPORTE DE CAJA (SIN RECARGAS)" : "REPORTE DE CIERRE DE CAJA";
      doc.text(title, 105, 15, { align: 'center' });
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(`Cajero: ${selectedBox.nombreEmpleado} | Caja: ${selectedBox.idCaja}`, 105, 24, { align: 'center' });
      doc.text(`Sesión: ${selectedBox.idArqueo} | Generado: ${date}`, 105, 29, { align: 'center' });

      doc.setTextColor(0); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text("RESUMEN FINANCIERO", 14, 45);
      
      const summaryData = [
          ['Monto Inicial', `L. ${Number(arqueo.montoInicial).toFixed(2)}`],
          ['(+) Ingresos', `L. ${localTotals.totalIngresos.toFixed(2)}`],
          ['(-) Egresos/Gastos', `L. ${localTotals.totalEgresos.toFixed(2)}`],
          ['(=) Efectivo en Caja', `L. ${localTotals.finalCalculado.toFixed(2)}`],
          ['Ganancia (Est.)', `L. ${Number(arqueo.ganancia || 0).toFixed(2)}`]
      ];

      // @ts-ignore
      doc.autoTable({
          startY: 50, head: [['Concepto', 'Monto']], body: summaryData, theme: 'grid',
          headStyles: { fillColor: [79, 70, 229] }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
          margin: { right: 110 } 
      });
      
      // Side Table: Recargas
      const tigo = saldosSession.find(s => s.red === 'TIGO');
      const claro = saldosSession.find(s => s.red === 'CLARO');
      // @ts-ignore
      doc.autoTable({
          startY: 50, head: [['Red', 'Saldo Final']],
          body: [['TIGO', `L. ${Number(tigo?.saldoFinal || 0).toFixed(2)}`], ['CLARO', `L. ${Number(claro?.saldoFinal || 0).toFixed(2)}`]],
          theme: 'grid', headStyles: { fillColor: [30, 41, 59] }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold', textColor: [0, 100, 0] } },
          margin: { left: 110 } 
      });

      let currentY = (doc as any).lastAutoTable.finalY + 15;
      doc.text(excludeRecharges ? "DETALLE INGRESOS (VENTAS)" : "DETALLE INGRESOS COMPLETO", 14, currentY);
      
      // @ts-ignore
      doc.autoTable({
          startY: currentY + 3,
          head: [['Descripción', 'Costo', 'Monto', 'Margen']],
          body: ingresosList.map(i => [i.descripcion, `L.${Number(i.costo).toFixed(0)}`, `L.${Number(i.monto).toFixed(0)}`, `L.${(Number(i.monto)-Number(i.costo)).toFixed(0)}`]),
          theme: 'striped', headStyles: { fillColor: [16, 185, 129] }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } }
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;
      doc.text("DETALLE GASTOS / SALIDAS", 14, currentY);
      // @ts-ignore
      doc.autoTable({
          startY: currentY + 3, head: [['Descripción', 'Monto']],
          body: sessionDetails.egresos.map(e => [e.descripcion, `L. ${Number(e.monto).toFixed(2)}`]),
          theme: 'striped', headStyles: { fillColor: [239, 68, 68] }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
      });

      doc.save(`Auditoria_Caja_${selectedBox.idCaja}_${selectedBox.idArqueo}.pdf`);
  };

  const saveEdit = async () => {
      if(!editingItem.type || !selectedBox) return;
      setActionLoading(true);
      try {
          if(editingItem.type === 'INGRESO') {
              await CashService.updateIngreso(editingItem.id, {
                  descripcion: editForm.descripcion,
                  monto: Number(editForm.monto),
                  costo: Number(editForm.costo)
              });
          } else {
              // Auditoria contable avanzada
              await AccountingService.updateAuditTransaction('EGRESO', editingItem.id, {
                  descripcion: editForm.descripcion,
                  monto: Number(editForm.monto),
                  categoria: editForm.categoria,
                  id_socio_asignado: editForm.idSocio || null
              });
          }
          setEditingItem({id:'', type: null});
          await openManager(selectedBox);
          loadData();
          Swal.fire({ icon: 'success', title: 'Registro actualizado', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
      finally { setActionLoading(false); }
  };

  const deleteTransaction = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      if(!selectedBox) return;
      const result = await Swal.fire({ title: '¿Eliminar transacción?', text: 'Esto afectará el cuadre de caja de forma inmediata.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar', confirmButtonColor: '#ef4444' });
      if(result.isConfirmed) {
          try {
              if(type === 'INGRESO') await CashService.deleteIngreso(id);
              else await CashService.deleteEgreso(id);
              await openManager(selectedBox);
              loadData();
              Swal.fire('Eliminado', '', 'success');
          } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const handleUpdateInitial = async () => {
      if(!selectedBox?.idArqueo) return;
      try {
          await CashService.updateInitialAmount(selectedBox.idArqueo, Number(newMontoInicial));
          await openManager(selectedBox);
          loadData(); 
          Swal.fire('Actualizado', `Monto inicial corregido`, 'success');
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleSaveSaldo = async () => {
      if (!editingSaldo || !selectedBox) return;
      try {
          await CashService.updateSaldo(editingSaldo.idsaldos, {
              saldoInicio: Number(editingSaldo.saldoInicio),
              saldoFinal: Number(editingSaldo.saldoFinal)
          });
          await openManager(selectedBox);
          setEditingSaldo(null);
          Swal.fire('Éxito', 'Saldos actualizados', 'success');
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleReopenBox = async (idArqueo: string) => {
      const result = await Swal.fire({
          title: '¿Reabrir Caja?',
          text: 'Se permitirá al cajero seguir operando en esta misma sesión.',
          icon: 'warning', showCancelButton: true, confirmButtonColor: '#f59e0b', confirmButtonText: 'Sí, reabrir'
      });
      if (result.isConfirmed) {
          try {
              await CashService.reopenBox(idArqueo);
              loadData();
              if(selectedBox) openManager({...selectedBox, estadoArqueo: 'Activo'});
              Swal.fire('Reabierta', 'La caja ya está operativa.', 'success');
          } catch (error: any) { Swal.fire('Error', error.message, 'error'); }
      }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
       <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div>
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-600/20"><Activity size={24}/></div>
                Auditoría de Terminales
            </h2>
            <p className="text-slate-500 text-sm font-medium">Control administrativo y corrección de movimientos</p>
          </div>
          <button onClick={loadData} className="p-3 text-slate-500 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all">
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-4">
          {boxes.map((box) => (
              <div key={box.idCaja} className={`bg-white rounded-[2rem] p-7 shadow-sm border-2 transition-all hover:shadow-xl hover:-translate-y-1 ${box.estadoArqueo === 'Activo' ? 'border-emerald-100' : 'border-slate-100'}`}>
                  <div className="flex justify-between items-start mb-6">
                      <div>
                          <h3 className="font-black text-xl text-slate-800">{box.nombreCaja}</h3>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 uppercase font-bold">
                              <span className="bg-slate-100 px-2 py-0.5 rounded-lg">{box.idCaja}</span>
                              <span>• {box.usuario || 'Desconectado'}</span>
                          </div>
                      </div>
                      <span className={`px-4 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${box.estadoArqueo === 'Activo' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                          {box.estadoArqueo === 'Activo' ? <Unlock size={14} className="animate-pulse"/> : <Lock size={14}/>}
                          {box.estadoArqueo || 'Inactiva'}
                      </span>
                  </div>

                  <div className="space-y-4 mb-8">
                      <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                          <span className="text-xs font-bold text-slate-400 uppercase">Efectivo Actual</span>
                          <span className={`text-2xl font-black ${Number(box.montoFinal) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              L. {Number(box.montoFinal || 0).toLocaleString()}
                          </span>
                      </div>
                      <div className="flex justify-between text-xs px-2">
                          <span className="text-slate-400 font-bold uppercase">Ganancia Sesión</span>
                          <span className="font-black text-indigo-600">L. {Number(box.ganancia || 0).toLocaleString()}</span>
                      </div>
                  </div>

                  <button 
                    onClick={() => openManager(box)}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 shadow-lg shadow-slate-900/10 transition-all flex items-center justify-center gap-3"
                  >
                      <Eye size={18}/> Gestionar Terminal
                  </button>
              </div>
          ))}
       </div>

       {/* MANAGER MODAL */}
       {selectedBox && sessionDetails && (
           <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex items-center justify-center p-0 md:p-6 lg:p-12">
               <div className="bg-white w-full h-full max-w-7xl md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
                   
                   {/* Modal Header */}
                   <div className="bg-white px-8 py-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                       <div>
                           <div className="flex items-center gap-3">
                               <h2 className="text-2xl font-black text-slate-800">{selectedBox.nombreCaja}</h2>
                               <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${selectedBox.estadoArqueo === 'Activo' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                   {selectedBox.estadoArqueo}
                               </span>
                           </div>
                           <p className="text-slate-400 text-sm mt-1 font-medium">Auditoría de sesión <span className="font-mono text-indigo-600 font-bold">#{selectedBox.idArqueo}</span></p>
                       </div>
                       <div className="flex gap-3">
                           {selectedBox.estadoArqueo === 'Cerrada' && (
                               <button onClick={() => generateClosingReportPDF(false)} className="hidden md:flex bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest gap-2 items-center hover:bg-indigo-600 transition-all"><Printer size={18}/> Reporte PDF</button>
                           )}
                           <button onClick={() => setSelectedBox(null)} className="p-3 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"><X size={24}/></button>
                       </div>
                   </div>

                   <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                       
                       {/* Sidebar Summary */}
                       <div className="w-full md:w-80 bg-slate-50 border-r border-slate-100 flex flex-col shrink-0 p-8">
                           <div className="space-y-2 mb-8">
                               <button onClick={() => setActiveTab('MOVIMIENTOS')} className={`w-full p-4 rounded-2xl text-left font-black text-xs uppercase tracking-widest flex items-center gap-3 transition-all ${activeTab === 'MOVIMIENTOS' ? 'bg-white shadow-xl text-indigo-600 border border-indigo-100' : 'text-slate-400 hover:bg-slate-100'}`}><Activity size={18}/> Movimientos</button>
                               <button onClick={() => setActiveTab('CONFIG')} className={`w-full p-4 rounded-2xl text-left font-black text-xs uppercase tracking-widest flex items-center gap-3 transition-all ${activeTab === 'CONFIG' ? 'bg-white shadow-xl text-indigo-600 border border-indigo-100' : 'text-slate-400 hover:bg-slate-100'}`}><Settings size={18}/> Ajustes</button>
                           </div>

                           <div className="mt-auto space-y-4">
                               <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-600/20">
                                   <p className="text-[10px] text-indigo-200 uppercase font-black tracking-widest mb-1">Efectivo Calculado</p>
                                   <p className="text-3xl font-black">L. {localTotals.finalCalculado.toLocaleString()}</p>
                                   <div className="mt-4 grid grid-cols-2 gap-4 text-[9px] font-black uppercase text-indigo-200 border-t border-indigo-500/50 pt-4">
                                       <div><span className="block opacity-60">Ingresos</span><span className="text-white text-xs">+{localTotals.totalIngresos.toLocaleString()}</span></div>
                                       <div><span className="block opacity-60">Gastos</span><span className="text-white text-xs">-{localTotals.totalEgresos.toLocaleString()}</span></div>
                                   </div>
                               </div>
                               <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] text-slate-400 uppercase font-black mb-1">Ganancia Estimada</p>
                                    <p className="text-lg font-black text-emerald-600">L. {Number(sessionDetails.arqueo.ganancia || 0).toLocaleString()}</p>
                               </div>
                           </div>
                       </div>

                       {/* Content Area */}
                       <div className="flex-1 overflow-y-auto p-8 md:p-12">
                           
                           {activeTab === 'MOVIMIENTOS' && (
                               <div className="space-y-8 max-w-5xl mx-auto">
                                   {/* Ingresos Table */}
                                   <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                                       <div className="p-5 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
                                           <h3 className="font-black text-emerald-800 text-xs uppercase tracking-widest flex items-center gap-2"><ArrowUpCircle size={18}/> Registro de Ingresos</h3>
                                           <span className="bg-white px-3 py-1 rounded-full text-[10px] font-black text-emerald-600 border border-emerald-200">{sessionDetails.ingresos.length} Registros</span>
                                       </div>
                                       <div className="overflow-x-auto">
                                           <table className="w-full text-xs text-left">
                                               <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-100"><tr><th className="p-5">Detalle</th><th className="p-5 text-right">Inversión</th><th className="p-5 text-right">Venta</th><th className="p-5 text-center">Acción</th></tr></thead>
                                               <tbody className="divide-y divide-slate-100">
                                                   {sessionDetails.ingresos.map(ing => (
                                                       <tr key={ing.idIngreso} className="hover:bg-slate-50/50 group transition-colors">
                                                           <td className="p-5">
                                                               {editingItem.id === ing.idIngreso ? <input className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20" value={editForm.descripcion} onChange={e=>setEditForm({...editForm, descripcion: e.target.value})} /> : <p className="font-bold text-slate-700">{ing.descripcion}</p>}
                                                           </td>
                                                           <td className="p-5 text-right text-slate-400 font-mono">
                                                               {editingItem.id === ing.idIngreso ? <input type="number" className="w-20 p-2 border rounded-lg text-right" value={editForm.costo} onChange={e=>setEditForm({...editForm, costo: e.target.value})} /> : `L.${Number(ing.costo || 0).toFixed(0)}`}
                                                           </td>
                                                           <td className="p-5 text-right font-black text-emerald-600 text-sm">
                                                               {editingItem.id === ing.idIngreso ? <input type="number" className="w-20 p-2 border rounded-lg text-right" value={editForm.monto} onChange={e=>setEditForm({...editForm, monto: e.target.value})} /> : `L.${Number(ing.monto).toLocaleString()}`}
                                                           </td>
                                                           <td className="p-5">
                                                               <div className="flex justify-center gap-2">
                                                                   {editingItem.id === ing.idIngreso ? (
                                                                       <>
                                                                        <button onClick={saveEdit} className="p-2 bg-emerald-600 text-white rounded-lg shadow-lg hover:bg-emerald-700 transition-all"><Save size={16}/></button>
                                                                        <button onClick={() => setEditingItem({id:'', type:null})} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-all"><X size={16}/></button>
                                                                       </>
                                                                   ) : (
                                                                       <>
                                                                        <button onClick={() => { setEditingItem({id:ing.idIngreso, type:'INGRESO'}); setEditForm({descripcion:ing.descripcion, monto:String(ing.monto), costo:String(ing.costo||0), categoria:'', idSocio:''}); }} className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16}/></button>
                                                                        <button onClick={() => deleteTransaction(ing.idIngreso, 'INGRESO')} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16}/></button>
                                                                       </>
                                                                   )}
                                                               </div>
                                                           </td>
                                                       </tr>
                                                   ))}
                                               </tbody>
                                           </table>
                                       </div>
                                   </div>

                                   {/* Egresos Table */}
                                   <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                                       <div className="p-5 bg-red-50 border-b border-red-100 flex justify-between items-center">
                                           <h3 className="font-black text-red-800 text-xs uppercase tracking-widest flex items-center gap-2"><ArrowDownCircle size={18}/> Auditoría de Egresos</h3>
                                           <span className="bg-white px-3 py-1 rounded-full text-[10px] font-black text-red-600 border border-red-200">{sessionDetails.egresos.length} Registros</span>
                                       </div>
                                       <div className="overflow-x-auto">
                                           <table className="w-full text-xs text-left">
                                               <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-100"><tr><th className="p-5">Detalle</th><th className="p-5">Categoría / Socio</th><th className="p-5 text-right">Monto</th><th className="p-5 text-center">Acción</th></tr></thead>
                                               <tbody className="divide-y divide-slate-100">
                                                   {sessionDetails.egresos.map(egr => (
                                                       <tr key={egr.idegresos} className="hover:bg-slate-50/50 group transition-colors">
                                                           <td className="p-5">
                                                               {editingItem.id === egr.idegresos ? <input className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20" value={editForm.descripcion} onChange={e=>setEditForm({...editForm, descripcion: e.target.value})} /> : <p className="font-bold text-slate-700">{egr.descripcion}</p>}
                                                           </td>
                                                           <td className="p-5">
                                                               {editingItem.id === egr.idegresos ? (
                                                                   <div className="flex flex-col gap-1">
                                                                       <select className="p-2 border rounded-lg text-[10px] font-bold" value={editForm.categoria} onChange={e=>setEditForm({...editForm, categoria: e.target.value})}>
                                                                           <option value="Gasto Operativo">Operativo</option>
                                                                           <option value="Compra de Producto">Inversión Stock</option>
                                                                           <option value="Otros">Otros</option>
                                                                       </select>
                                                                       <select className="p-2 border rounded-lg text-[10px] font-bold" value={editForm.idSocio} onChange={e=>setEditForm({...editForm, idSocio: e.target.value})}>
                                                                           <option value="">Gasto Empresa</option>
                                                                           {partners.map(p => <option key={p.idSocio} value={p.idSocio}>{p.nombre}</option>)}
                                                                       </select>
                                                                   </div>
                                                               ) : (
                                                                   <div className="flex flex-col gap-1">
                                                                       <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-black text-[9px] w-fit uppercase">{egr.categoria || 'Gasto Operativo'}</span>
                                                                       {egr.idSocioAsignado && <span className="text-indigo-600 font-black text-[9px] uppercase">Personal: {partners.find(p=>p.idSocio===egr.idSocioAsignado)?.nombre}</span>}
                                                                   </div>
                                                               )}
                                                           </td>
                                                           <td className="p-5 text-right font-black text-red-600 text-sm">
                                                               {editingItem.id === egr.idegresos ? <input type="number" className="w-20 p-2 border rounded-lg text-right font-black" value={editForm.monto} onChange={e=>setEditForm({...editForm, monto: e.target.value})} /> : `L.${Number(egr.monto).toLocaleString()}`}
                                                           </td>
                                                           <td className="p-5 text-center">
                                                               <div className="flex justify-center gap-2">
                                                                   {editingItem.id === egr.idegresos ? (
                                                                       <button onClick={saveEdit} className="p-2 bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-700 transition-all"><Save size={16}/></button>
                                                                   ) : (
                                                                       <button onClick={() => { setEditingItem({id:egr.idegresos, type:'EGRESO'}); setEditForm({descripcion:egr.descripcion, monto:String(egr.monto), costo:'0', categoria: egr.categoria || 'Gasto Operativo', idSocio: egr.idSocioAsignado ? String(egr.idSocioAsignado) : ''}); }} className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={16}/></button>
                                                                   )}
                                                                   <button onClick={() => deleteTransaction(egr.idegresos, 'EGRESO')} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16}/></button>
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
                               <div className="space-y-8 max-w-4xl mx-auto animate-in slide-in-from-right duration-300">
                                   <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
                                       <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 opacity-50"/>
                                       <h3 className="font-black text-slate-800 text-lg mb-6 flex items-center gap-3"><Edit2 size={20} className="text-indigo-600"/> Ajuste de Apertura</h3>
                                       <div className="flex flex-col md:flex-row gap-6 md:items-end">
                                           <div className="flex-1">
                                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Monto Inicial (L.)</label>
                                               <div className="relative">
                                                   <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">L.</span>
                                                   <input type="number" className="w-full pl-10 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl text-slate-800 outline-none focus:border-indigo-500 transition-all" value={newMontoInicial} onChange={e => setNewMontoInicial(e.target.value)}/>
                                               </div>
                                           </div>
                                           <button onClick={handleUpdateInitial} className="bg-slate-900 text-white px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 shadow-xl shadow-slate-900/10 transition-all whitespace-nowrap">Actualizar Sesión</button>
                                       </div>
                                   </div>

                                   <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                       <h3 className="font-black text-slate-800 text-lg mb-6 flex items-center gap-3"><Smartphone size={20} className="text-indigo-600"/> Control de Saldos</h3>
                                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                           {saldosSession.map(saldo => (
                                               <div key={saldo.idsaldos} className={`p-6 rounded-[2rem] border-2 group transition-all ${saldo.red === 'TIGO' ? 'bg-blue-50/30 border-blue-50 hover:border-blue-200' : 'bg-red-50/30 border-red-50 hover:border-red-200'}`}>
                                                   <div className="flex justify-between items-start mb-4">
                                                       <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${saldo.red === 'TIGO' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{saldo.red}</span>
                                                       <button onClick={() => setEditingSaldo(saldo)} className="p-2 text-slate-400 hover:bg-white hover:text-indigo-600 rounded-xl transition-all shadow-sm"><Edit2 size={16}/></button>
                                                   </div>
                                                   {editingSaldo?.idsaldos === saldo.idsaldos ? (
                                                       <div className="space-y-4 animate-fade-in">
                                                           <div><label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">S. Inicial</label><input type="number" className="w-full p-2 border rounded-xl font-bold" value={editingSaldo.saldoInicio} onChange={e=>setEditingSaldo({...editingSaldo, saldoInicio: Number(e.target.value)})}/></div>
                                                           <div><label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">S. Actual</label><input type="number" className="w-full p-2 border rounded-xl font-bold" value={editingSaldo.saldoFinal} onChange={e=>setEditingSaldo({...editingSaldo, saldoFinal: Number(e.target.value)})}/></div>
                                                           <div className="flex gap-2"><button onClick={handleSaveSaldo} className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">OK</button><button onClick={() => setEditingSaldo(null)} className="flex-1 py-2 bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest">No</button></div>
                                                       </div>
                                                   ) : (
                                                       <div className="space-y-2">
                                                           <div className="flex justify-between text-xs"><span className="text-slate-400 font-bold">INICIO:</span> <strong className="text-slate-700">L.{Number(saldo.saldoInicio).toLocaleString()}</strong></div>
                                                           <div className="flex justify-between items-end border-t border-black/5 pt-2"><span className="text-[9px] text-slate-400 font-bold uppercase">Actual:</span> <strong className={`text-xl font-black ${saldo.red === 'TIGO' ? 'text-blue-600' : 'text-red-600'}`}>L.{Number(saldo.saldoFinal).toLocaleString()}</strong></div>
                                                       </div>
                                                   )}
                                               </div>
                                           ))}
                                       </div>
                                   </div>

                                   {selectedBox.estadoArqueo === 'Cerrada' && (
                                       <div className="bg-amber-50 p-10 rounded-[2.5rem] border-2 border-amber-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8">
                                           <div className="flex items-start gap-5">
                                              <div className="p-4 bg-amber-100 text-amber-600 rounded-3xl"><AlertTriangle size={32}/></div>
                                              <div>
                                                  <h4 className="font-black text-amber-900">Operación Irreversible</h4>
                                                  <p className="text-sm text-amber-700/80 mt-1 max-w-md">La sesión finalizó el {new Date(selectedBox.fechaCierre || '').toLocaleString()}. Al reabrirla, el cajero recuperará el acceso y los totales se actualizarán dinámicamente.</p>
                                              </div>
                                           </div>
                                           <button onClick={() => handleReopenBox(selectedBox.idArqueo)} className="w-full md:w-auto bg-amber-600 text-white px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-700 shadow-xl shadow-amber-600/20 transition-all flex items-center gap-3">
                                               <RefreshCw size={18}/> Reabrir Sesión
                                           </button>
                                       </div>
                                   )}
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