
import React, { useEffect, useState } from 'react';
import { CashService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Saldo } from '../types';
import { Activity, Lock, Unlock, RefreshCw, AlertTriangle, Eye, ArrowUpCircle, ArrowDownCircle, Settings, X, Save, Edit2, Trash2, FileText, Smartphone, Printer } from 'lucide-react';
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
  
  // Manager Modal State
  const [selectedBox, setSelectedBox] = useState<BoxStatus | null>(null);
  const [sessionDetails, setSessionDetails] = useState<{arqueo: Arqueo, ingresos: Ingreso[], egresos: Egreso[]} | null>(null);
  const [activeTab, setActiveTab] = useState<'MOVIMIENTOS' | 'CONFIG'>('MOVIMIENTOS');
  
  // Calculated Totals (Local State to avoid NaN)
  const [localTotals, setLocalTotals] = useState({ totalIngresos: 0, totalEgresos: 0, finalCalculado: 0 });

  // Edit States
  const [editingItem, setEditingItem] = useState<{id: string, type: 'INGRESO'|'EGRESO'|null}>({id:'', type: null});
  const [editForm, setEditForm] = useState({ descripcion: '', monto: '', costo: '' });
  const [newMontoInicial, setNewMontoInicial] = useState<string>('');

  // NEW: Saldos Management
  const [saldosSession, setSaldosSession] = useState<Saldo[]>([]);
  const [editingSaldo, setEditingSaldo] = useState<Saldo | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
      if (sessionDetails) {
          // Robust mapping para evitar problemas de mayúsculas/minúsculas de la BD
          const ingresos = sessionDetails.ingresos.reduce((acc, curr) => acc + Number(curr.monto || (curr as any).Monto || 0), 0);
          const egresos = sessionDetails.egresos.reduce((acc, curr) => acc + Number(curr.monto || (curr as any).Monto || 0), 0);
          const inicial = Number(sessionDetails.arqueo.montoInicial ?? (sessionDetails.arqueo as any).montoinicial ?? 0);
          
          const finalCalculado = (inicial + ingresos) - egresos;
          
          setLocalTotals({
              totalIngresos: ingresos,
              totalEgresos: egresos,
              finalCalculado: finalCalculado
          });
      }
  }, [sessionDetails]);

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
                  const rawDate = details.arqueo.fechaApertura; 
                  const fechaStr = rawDate.length >= 10 ? rawDate.substring(0, 10) : '';
                  
                  if(fechaStr) {
                      const slds = await CashService.getSaldosByDate(fechaStr);
                      setSaldosSession(slds || []);
                  }
              }
          } else {
              setSessionDetails(null);
              setSaldosSession([]);
          }
      } catch (error) {
          console.error(error);
          Swal.fire('Error', 'No se pudieron cargar los detalles', 'error');
      }
  };

  // --- PDF GENERATOR CORREGIDO (SIN CEROS) ---
  const generateClosingReportPDF = (excludeRecharges: boolean = false) => {
      if (!selectedBox || !sessionDetails) return;

      const doc = new jsPDF();
      const date = new Date().toLocaleString();
      const arqueo = sessionDetails.arqueo;

      // RE-CALCULAR TOTALES AL MOMENTO PARA EL PDF (Soluciona el problema de los ceros)
      const mInicial = Number(arqueo.montoInicial ?? (arqueo as any).montoinicial ?? 0);
      const ingresosRaw = sessionDetails.ingresos;
      
      // Filtrar recargas si se solicita
      let ingresosList = ingresosRaw;
      if (excludeRecharges) {
          ingresosList = ingresosRaw.filter(i => {
              const desc = (i.descripcion || "").toUpperCase();
              return !desc.includes('RECARGA') && !desc.includes('PAQUETE') && !desc.includes('SALDO') && !desc.includes('TIGO') && !desc.includes('CLARO');
          });
      }

      const tIngresosPDF = ingresosList.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
      const tGastosPDF = sessionDetails.egresos.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
      const mFinalPDF = (mInicial + tIngresosPDF) - tGastosPDF;
      // Ganancia real basada en costo (solo ingresos totales)
      const gananciaPDF = sessionDetails.ingresos.reduce((acc, curr) => acc + (Number(curr.monto || 0) - Number(curr.costo || 0)), 0);

      // HEADER
      doc.setFillColor(30, 41, 59); // Slate 800
      doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const title = excludeRecharges ? "REPORTE DE CAJA (SIN RECARGAS)" : "REPORTE DE CIERRE DE CAJA (ADMIN)";
      doc.text(title, 105, 12, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generado: ${date} | Original: ${arqueo.fechaCierre || 'N/A'}`, 105, 22, { align: 'center' });
      doc.text(`Cajero: ${selectedBox.nombreEmpleado} | Caja: ${selectedBox.idCaja}`, 105, 27, { align: 'center' });

      // SUMMARY SECTION
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text("RESUMEN FINANCIERO GLOBAL", 14, 40);
      
      const tigo = saldosSession.find(s => s.red === 'TIGO');
      const claro = saldosSession.find(s => s.red === 'CLARO');
      const sTigo = tigo ? Number(tigo.saldoFinal) : 0;
      const sClaro = claro ? Number(claro.saldoFinal) : 0;

      const summaryData = [
          ['Monto Inicial', `L. ${mInicial.toFixed(2)}`],
          ['(+) Total Ingresos', `L. ${tIngresosPDF.toFixed(2)}`],
          ['(-) Total Gastos', `L. ${tGastosPDF.toFixed(2)}`],
          ['(=) Efectivo Calculado', `L. ${mFinalPDF.toFixed(2)}`],
          ['Ganancia Estimada', `L. ${gananciaPDF.toFixed(2)}`]
      ];

      // @ts-ignore
      doc.autoTable({
          startY: 45,
          head: [['Concepto', 'Monto']],
          body: summaryData,
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
          margin: { right: 110 } 
      });
      
      const yAfterSummary = (doc as any).lastAutoTable.finalY;

      // @ts-ignore
      doc.autoTable({
          startY: 45,
          head: [['Plataforma', 'Saldo Final']],
          body: [
              ['TIGO', `L. ${sTigo.toFixed(2)}`],
              ['CLARO', `L. ${sClaro.toFixed(2)}`]
          ],
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255 },
          columnStyles: { 1: { halign: 'right', textColor: [0, 100, 0], fontStyle: 'bold' } },
          margin: { left: 110 } 
      });
      
      const yAfterSaldos = (doc as any).lastAutoTable.finalY;
      let finalY = Math.max(yAfterSummary, yAfterSaldos) + 15;

      // DETALLES
      doc.setFontSize(11);
      const detalleTitle = excludeRecharges ? "DETALLE DE INGRESOS (Ventas de Productos/Servicios)" : "DETALLE DE INGRESOS (Completo)";
      doc.text(detalleTitle, 14, finalY);
      
      let sumCosto = 0;
      let sumVenta = 0;
      let sumGanancia = 0;

      const incomeRows = ingresosList.map(i => {
          const costo = Number(i.costo || 0);
          const monto = Number(i.monto || 0);
          const gananciaItem = monto - costo;

          sumCosto += costo;
          sumVenta += monto;
          sumGanancia += gananciaItem;

          return [
              i.descripcion, 
              `L. ${costo.toFixed(2)}`, 
              `L. ${monto.toFixed(2)}`,
              `L. ${gananciaItem.toFixed(2)}`
          ];
      });

      // @ts-ignore
      doc.autoTable({
          startY: finalY + 3,
          head: [['Descripción', 'Costo', 'Venta', 'Ganancia']],
          body: incomeRows,
          theme: 'striped',
          headStyles: { fillColor: [16, 185, 129] },
          columnStyles: { 
              1: { halign: 'right' }, 
              2: { halign: 'right', fontStyle: 'bold' },
              3: { halign: 'right', fontStyle: 'bold', textColor: [0, 100, 0] }
          },
          foot: [[
              'TOTALES', 
              `L. ${sumCosto.toFixed(2)}`, 
              `L. ${sumVenta.toFixed(2)}`, 
              `L. ${sumGanancia.toFixed(2)}`
          ]],
          footStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', halign: 'right' }
      });

      finalY = (doc as any).lastAutoTable.finalY + 10;

      doc.setFontSize(11);
      doc.text("DETALLE DE GASTOS / SALIDAS", 14, finalY);
      
      const expenseRows = sessionDetails.egresos.map(e => {
          return [e.descripcion, `L. ${(Number(e.monto)||0).toFixed(2)}`];
      });

      // @ts-ignore
      doc.autoTable({
          startY: finalY + 3,
          head: [['Descripción', 'Monto']],
          body: expenseRows,
          theme: 'striped',
          headStyles: { fillColor: [239, 68, 68] },
          columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
      });

      const fileName = excludeRecharges ? `Reporte_NoRecargas_${selectedBox.idArqueo}.pdf` : `Reporte_Admin_${selectedBox.idArqueo}.pdf`;
      doc.save(fileName);
  };

  const handleUpdateInitial = async () => {
      if(!selectedBox?.idArqueo) return;
      try {
          await CashService.updateInitialAmount(selectedBox.idArqueo, Number(newMontoInicial));
          if (selectedBox) openManager(selectedBox);
          Swal.fire('Actualizado', `Monto inicial actualizado`, 'success');
          loadData(); 
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleSaveSaldo = async () => {
      if (!editingSaldo) return;
      try {
          await CashService.updateSaldo(editingSaldo.idsaldos, {
              saldoInicio: Number(editingSaldo.saldoInicio),
              saldoFinal: Number(editingSaldo.saldoFinal)
          });
          
          const fechaStr = sessionDetails?.arqueo.fechaApertura.substring(0, 10);
          if (fechaStr) {
              const slds = await CashService.getSaldosByDate(fechaStr);
              setSaldosSession(slds || []);
          }
          setEditingSaldo(null);
          Swal.fire('Actualizado', 'Saldos de recarga actualizados', 'success');
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleReopenBox = async (idArqueo: string) => {
      const result = await Swal.fire({
          title: '¿Reabrir Caja?',
          text: 'Esta acción revertirá el cierre. Solo debe hacerse si el cajero cerró por error.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#f59e0b',
          confirmButtonText: 'Sí, reabrir'
      });

      if (result.isConfirmed) {
          try {
              await CashService.reopenBox(idArqueo);
              Swal.fire('Éxito', 'La caja ha sido reabierta.', 'success');
              loadData();
              if(selectedBox) openManager({...selectedBox, estadoArqueo: 'Activo'});
          } catch (error: any) {
              Swal.fire('Error', error.message, 'error');
          }
      }
  };

  const startEdit = (item: Ingreso | Egreso, type: 'INGRESO' | 'EGRESO') => {
      setEditingItem({ id: type === 'INGRESO' ? (item as Ingreso).idIngreso : (item as Egreso).idegresos, type });
      setEditForm({
          descripcion: item.descripcion,
          monto: String(item.monto),
          costo: type === 'INGRESO' ? String((item as Ingreso).costo || 0) : '0'
      });
  };

  const saveEdit = async () => {
      if(!editingItem.type || !selectedBox) return;
      try {
          if(editingItem.type === 'INGRESO') {
              await CashService.updateIngreso(editingItem.id, {
                  descripcion: editForm.descripcion,
                  monto: Number(editForm.monto),
                  costo: Number(editForm.costo)
              });
          } else {
              await CashService.updateEgreso(editingItem.id, {
                  descripcion: editForm.descripcion,
                  monto: Number(editForm.monto)
              });
          }
          setEditingItem({id:'', type: null});
          openManager(selectedBox);
          loadData();
          Swal.fire('Guardado', 'Registro actualizado', 'success');
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const deleteTransaction = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      if(!selectedBox) return;
      const result = await Swal.fire({ title: '¿Eliminar transacción?', text: 'Esto afectará el cuadre de caja.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar' });
      if(result.isConfirmed) {
          try {
              if(type === 'INGRESO') await CashService.deleteIngreso(id);
              else await CashService.deleteEgreso(id);
              openManager(selectedBox);
              loadData();
              Swal.fire('Eliminado', 'Transacción eliminada', 'success');
          } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
       <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Activity className="text-indigo-600"/> Panel de Control de Cajas
            </h2>
            <p className="text-slate-500 text-sm">Monitoreo en tiempo real y auditoría de transacciones</p>
          </div>
          <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg border border-slate-200">
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-4">
          {boxes.map((box) => (
              <div key={box.idCaja} className={`bg-white rounded-2xl p-6 shadow-sm border-l-4 transition-all hover:shadow-md ${box.estadoArqueo === 'Activo' ? 'border-l-emerald-500' : 'border-l-slate-300'}`}>
                  <div className="flex justify-between items-start mb-4">
                      <div>
                          <h3 className="font-bold text-lg text-slate-800">{box.nombreCaja}</h3>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                              <span className="font-mono bg-slate-100 px-1.5 rounded">{box.idCaja}</span>
                              <span>• {box.usuario || 'Sin Asignar'}</span>
                          </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${box.estadoArqueo === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {box.estadoArqueo === 'Activo' ? <Unlock size={12}/> : <Lock size={12}/>}
                          {box.estadoArqueo || 'Inactiva'}
                      </span>
                  </div>

                  <div className="space-y-3 mb-6 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                      <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Monto Inicial:</span>
                          <span className="font-bold text-slate-700">L. {Number(box.montoInicial || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Efectivo Actual:</span>
                          <span className={`font-bold ${Number(box.montoFinal) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              L. {Number(box.montoFinal || 0).toFixed(2)}
                          </span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                          <span className="text-slate-500 font-bold">Ganancia (Est.):</span>
                          <span className="font-bold text-indigo-600">L. {Number(box.ganancia || 0).toFixed(2)}</span>
                      </div>
                  </div>

                  <button 
                    onClick={() => openManager(box)}
                    className="w-full py-2.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
                  >
                      <Eye size={16}/> Gestionar / Auditar
                  </button>
              </div>
          ))}
       </div>

       {/* MANAGER MODAL */}
       {selectedBox && sessionDetails && (
           <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center md:p-4">
               <div className="bg-white w-full h-full md:h-[90vh] md:max-w-6xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
                   
                   {/* Modal Header */}
                   <div className="bg-slate-50 p-4 md:p-5 border-b border-slate-200 flex justify-between items-start md:items-center shrink-0">
                       <div className="flex-1 min-w-0 pr-4">
                           <h2 className="text-lg md:text-xl font-bold text-slate-800 flex flex-col md:flex-row md:items-center gap-1 md:gap-2 leading-tight">
                               <span className="truncate">{selectedBox.nombreCaja}</span> 
                               <span className="text-xs font-normal text-slate-500 bg-white border px-2 py-0.5 rounded-full w-fit">Sesión: {selectedBox.idArqueo}</span>
                           </h2>
                           <p className="text-xs md:text-sm text-slate-500 mt-1 truncate">
                               Cajero: <strong>{selectedBox.nombreEmpleado}</strong> | 
                               Estado: <span className={selectedBox.estadoArqueo === 'Activo' ? 'text-emerald-600 font-bold' : 'text-slate-600 font-bold'}>{selectedBox.estadoArqueo}</span>
                           </p>
                       </div>
                       <div className="flex gap-2">
                           {/* BOTONES PDF DE CIERRE DISPONIBLES EN CUALQUIER ESTADO SI HAY SESION */}
                           <button 
                               onClick={() => generateClosingReportPDF(true)}
                               className="hidden md:flex bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold items-center gap-2 shadow-sm transition-colors"
                               title="Reporte sin incluir recargas"
                           >
                               <Printer size={16}/> PDF (Ventas)
                           </button>
                           <button 
                               onClick={() => generateClosingReportPDF(false)}
                               className="hidden md:flex bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold items-center gap-2 shadow-sm transition-colors"
                               title="Reporte completo de cierre"
                           >
                               <FileText size={16}/> PDF (Completo)
                           </button>
                           <button onClick={() => setSelectedBox(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={24} className="text-slate-500"/></button>
                       </div>
                   </div>

                   <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                       
                       {/* Sidebar */}
                       <div className="w-full md:w-72 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0">
                           <div className="p-3 md:p-4 flex md:flex-col gap-2 overflow-x-auto no-scrollbar shrink-0">
                               <button onClick={() => setActiveTab('MOVIMIENTOS')} className={`flex-1 min-w-fit px-4 py-2.5 md:p-3 rounded-xl text-left font-bold text-sm flex items-center justify-center md:justify-start gap-2 md:gap-3 transition-all whitespace-nowrap ${activeTab === 'MOVIMIENTOS' ? 'bg-white shadow-md text-indigo-600 border border-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}>
                                   <Activity size={18}/> <span>Movimientos</span>
                               </button>
                               <button onClick={() => setActiveTab('CONFIG')} className={`flex-1 min-w-fit px-4 py-2.5 md:p-3 rounded-xl text-left font-bold text-sm flex items-center justify-center md:justify-start gap-2 md:gap-3 transition-all whitespace-nowrap ${activeTab === 'CONFIG' ? 'bg-white shadow-md text-indigo-600 border border-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}>
                                   <Settings size={18}/> <span>Configuración</span>
                               </button>
                           </div>
                           
                           <div className="hidden md:block flex-1"></div>

                           <div className="p-3 md:p-4 pt-0 md:pt-4">
                               <div className="bg-indigo-900 rounded-xl p-4 text-white shadow-lg">
                                   <p className="text-xs text-indigo-300 uppercase font-bold mb-1">Efectivo Calculado</p>
                                   <p className="text-2xl md:text-3xl font-bold tracking-tight">L. {localTotals.finalCalculado.toFixed(2)}</p>
                                   <div className="mt-3 text-[10px] md:text-xs opacity-70 flex justify-between border-t border-indigo-700/50 pt-2 gap-2">
                                       <div className="flex flex-col"><span>Ini</span><span className="font-bold">{Number(sessionDetails.arqueo.montoInicial || 0).toFixed(0)}</span></div>
                                       <div className="flex flex-col text-center"><span>Ing</span><span className="font-bold text-emerald-300">+{localTotals.totalIngresos.toFixed(0)}</span></div>
                                       <div className="flex flex-col text-right"><span>Egr</span><span className="font-bold text-red-300">-{localTotals.totalEgresos.toFixed(0)}</span></div>
                                   </div>
                               </div>
                           </div>
                       </div>

                       {/* Content */}
                       <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/30">
                           
                           {activeTab === 'MOVIMIENTOS' && (
                               <div className="space-y-6">
                                   <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                       <div className="p-3 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
                                           <h3 className="font-bold text-emerald-800 flex items-center gap-2 text-sm md:text-base"><ArrowUpCircle size={18}/> Ingresos y Ventas ({sessionDetails.ingresos.length})</h3>
                                       </div>
                                       <div className="overflow-x-auto">
                                           <table className="w-full text-sm text-left min-w-[500px]">
                                               <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="p-3">Hora</th><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3 text-right">Acción</th></tr></thead>
                                               <tbody>
                                                   {sessionDetails.ingresos.map(ing => (
                                                       <tr key={ing.idIngreso} className="border-b hover:bg-slate-50 group">
                                                           <td className="p-3 text-xs text-slate-400 font-mono whitespace-nowrap">{ing.fechaCreacion ? new Date(ing.fechaCreacion).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                                                           <td className="p-3 min-w-[150px]">
                                                               {editingItem.id === ing.idIngreso ? <input className="border p-1 rounded w-full" value={editForm.descripcion} onChange={e=>setEditForm({...editForm, descripcion: e.target.value})} /> : <span className="line-clamp-2">{ing.descripcion}</span>}
                                                           </td>
                                                           <td className="p-3 font-bold text-emerald-600 whitespace-nowrap">
                                                               {editingItem.id === ing.idIngreso ? <input type="number" className="border p-1 rounded w-20" value={editForm.monto} onChange={e=>setEditForm({...editForm, monto: e.target.value})} /> : `L. ${Number(ing.monto).toFixed(2)}`}
                                                           </td>
                                                           <td className="p-3 text-right">
                                                               {editingItem.id === ing.idIngreso ? (
                                                                   <div className="flex justify-end gap-1"><button onClick={saveEdit} className="bg-emerald-100 text-emerald-700 p-1.5 rounded"><Save size={16}/></button><button onClick={() => setEditingItem({id:'', type:null})} className="bg-slate-100 text-slate-600 p-1.5 rounded"><X size={16}/></button></div>
                                                               ) : (
                                                                   <div className="flex justify-end gap-1"><button onClick={() => startEdit(ing, 'INGRESO')} className="text-slate-400 hover:text-blue-500 p-1 rounded"><Edit2 size={16}/></button><button onClick={() => deleteTransaction(ing.idIngreso, 'INGRESO')} className="text-slate-400 hover:text-red-500 p-1 rounded"><Trash2 size={16}/></button></div>
                                                               )}
                                                           </td>
                                                       </tr>
                                                   ))}
                                               </tbody>
                                           </table>
                                       </div>
                                   </div>

                                   <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                       <div className="p-3 bg-red-50 border-b border-red-100 flex justify-between items-center">
                                           <h3 className="font-bold text-red-800 flex items-center gap-2 text-sm md:text-base"><ArrowDownCircle size={18}/> Gastos y Salidas ({sessionDetails.egresos.length})</h3>
                                       </div>
                                       <div className="overflow-x-auto">
                                           <table className="w-full text-sm text-left min-w-[500px]">
                                               <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="p-3">Hora</th><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3 text-right">Acción</th></tr></thead>
                                               <tbody>
                                                   {sessionDetails.egresos.map(egr => (
                                                       <tr key={egr.idegresos} className="border-b hover:bg-slate-50 group">
                                                           <td className="p-3 text-xs text-slate-400 font-mono whitespace-nowrap">{egr.fechaCreacion ? new Date(egr.fechaCreacion).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-'}</td>
                                                           <td className="p-3 min-w-[150px]">
                                                               {editingItem.id === egr.idegresos ? <input className="border p-1 rounded w-full" value={editForm.descripcion} onChange={e=>setEditForm({...editForm, descripcion: e.target.value})} /> : <span className="line-clamp-2">{egr.descripcion}</span>}
                                                           </td>
                                                           <td className="p-3 font-bold text-red-600 whitespace-nowrap">
                                                               {editingItem.id === egr.idegresos ? <input type="number" className="border p-1 rounded w-20" value={editForm.monto} onChange={e=>setEditForm({...editForm, monto: e.target.value})} /> : `L. ${Number(egr.monto).toFixed(2)}`}
                                                           </td>
                                                           <td className="p-3 text-right">
                                                               {editingItem.id === egr.idegresos ? (
                                                                   <div className="flex justify-end gap-1"><button onClick={saveEdit} className="bg-emerald-100 text-emerald-700 p-1.5 rounded"><Save size={16}/></button><button onClick={() => setEditingItem({id:'', type:null})} className="bg-slate-100 text-slate-600 p-1.5 rounded"><X size={16}/></button></div>
                                                               ) : (
                                                                   <div className="flex justify-end gap-1"><button onClick={() => startEdit(egr, 'EGRESO')} className="text-slate-400 hover:text-blue-500 p-1 rounded"><Edit2 size={16}/></button><button onClick={() => deleteTransaction(egr.idegresos, 'EGRESO')} className="text-slate-400 hover:text-red-500 p-1 rounded"><Trash2 size={16}/></button></div>
                                                               )}
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
                               <div className="space-y-6">
                                   <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
                                       <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Edit2 size={18}/> Corrección de Monto Inicial</h3>
                                       <div className="flex flex-col md:flex-row gap-4 md:items-end">
                                           <div className="flex-1">
                                               <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Monto Inicial (L.)</label>
                                               <input 
                                                  type="number" 
                                                  className="w-full p-3 border border-slate-300 rounded-lg font-bold text-lg" 
                                                  value={newMontoInicial}
                                                  onChange={e => setNewMontoInicial(e.target.value)}
                                               />
                                           </div>
                                           <button onClick={handleUpdateInitial} className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-indigo-700 shadow-lg w-full md:w-auto">Actualizar y Recalcular</button>
                                       </div>
                                       <p className="text-xs text-slate-400 mt-2">
                                           <AlertTriangle size={12} className="inline mr-1"/>
                                           Modificar esto recalculará el monto final y la ganancia de la sesión.
                                       </p>
                                   </div>

                                   <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
                                       <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Smartphone size={18}/> Saldos de Recargas</h3>
                                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                           {saldosSession.map(saldo => (
                                               <div key={saldo.idsaldos} className={`p-4 rounded-xl border ${saldo.red === 'TIGO' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                                   <div className="flex justify-between items-start mb-2">
                                                       <span className={`font-bold ${saldo.red === 'TIGO' ? 'text-blue-700' : 'text-red-700'}`}>{saldo.red}</span>
                                                       <button onClick={() => setEditingSaldo(saldo)} className="text-slate-400 hover:text-indigo-600"><Edit2 size={16}/></button>
                                                   </div>
                                                   {editingSaldo?.idsaldos === saldo.idsaldos ? (
                                                       <div className="space-y-2">
                                                           <div>
                                                               <label className="text-[10px] font-bold uppercase text-slate-500">Saldo Inicial</label>
                                                               <input type="number" className="w-full p-1 border rounded text-sm" value={editingSaldo.saldoInicio} onChange={e=>setEditingSaldo({...editingSaldo, saldoInicio: Number(e.target.value)})}/>
                                                           </div>
                                                           <div>
                                                               <label className="text-[10px] font-bold uppercase text-slate-500">Saldo Final</label>
                                                               <input type="number" className="w-full p-1 border rounded text-sm" value={editingSaldo.saldoFinal} onChange={e=>setEditingSaldo({...editingSaldo, saldoFinal: Number(e.target.value)})}/>
                                                           </div>
                                                           <div className="flex gap-2 mt-2">
                                                               <button onClick={handleSaveSaldo} className="bg-indigo-600 text-white px-2 py-1 rounded text-xs font-bold w-full">Guardar</button>
                                                               <button onClick={() => setEditingSaldo(null)} className="bg-slate-200 text-slate-600 px-2 py-1 rounded text-xs font-bold w-full">Cancelar</button>
                                                           </div>
                                                       </div>
                                                   ) : (
                                                       <div className="text-sm space-y-1">
                                                           <div className="flex justify-between"><span>Inicial:</span> <strong>L. {Number(saldo.saldoInicio).toFixed(2)}</strong></div>
                                                           <div className="flex justify-between border-t border-black/10 pt-1 mt-1"><span>Actual:</span> <strong>L. {Number(saldo.saldoFinal).toFixed(2)}</strong></div>
                                                       </div>
                                                   )}
                                               </div>
                                           ))}
                                           {saldosSession.length === 0 && (
                                               <p className="col-span-2 text-center text-slate-400 text-sm py-4">No se registraron saldos para esta fecha.</p>
                                           )}
                                       </div>
                                   </div>

                                   {selectedBox.estadoArqueo === 'Cerrada' && (
                                       <div className="bg-amber-50 p-4 md:p-6 rounded-xl border border-amber-200 shadow-sm">
                                           <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2"><AlertTriangle size={18}/> Reabrir Caja Cerrada</h3>
                                           <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                                              <p className="text-sm text-amber-700">
                                                  La caja fue cerrada el {new Date(selectedBox.fechaCierre || '').toLocaleString()}. Si esto fue un error, puede reabrirla para continuar operando.
                                              </p>
                                              <div className="flex gap-2 w-full md:w-auto">
                                                  <button onClick={() => handleReopenBox(selectedBox.idArqueo)} className="flex-1 bg-amber-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-amber-700 shadow-lg whitespace-nowrap">
                                                      Reabrir Sesión
                                                  </button>
                                              </div>
                                           </div>
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
