
import React, { useEffect, useState } from 'react';
import { CashService } from '../services/api';
import { Arqueo, Ingreso, Egreso } from '../types';
import { Activity, Lock, Unlock, RefreshCw, AlertTriangle, Eye, ArrowUpCircle, ArrowDownCircle, Settings, X, Save, Edit2, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';

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

  useEffect(() => {
    loadData();
  }, []);

  // Efecto para calcular totales cuando cambian los detalles o el monto inicial
  useEffect(() => {
      if (sessionDetails) {
          const ingresos = sessionDetails.ingresos.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
          const egresos = sessionDetails.egresos.reduce((acc, curr) => acc + Number(curr.monto || 0), 0);
          const inicial = Number(sessionDetails.arqueo.montoInicial || 0);
          
          // CAMBIO CRÍTICO: Priorizar siempre el cálculo matemático sobre el valor de DB
          // Esto garantiza que la auditoría refleje exactamente la suma de lo que se ve en pantalla.
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
          } else {
              setSessionDetails(null);
          }
      } catch (error) {
          console.error(error);
          Swal.fire('Error', 'No se pudieron cargar los detalles', 'error');
      }
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

  const handleUpdateInitial = async () => {
      if(!selectedBox?.idArqueo) return;
      try {
          // 1. Actualizar en Servidor
          await CashService.updateInitialAmount(selectedBox.idArqueo, Number(newMontoInicial));
          
          // 2. Refrescar Detalles (Backend recalcula)
          const updatedDetails = await CashService.getSessionDetails(selectedBox.idArqueo);
          setSessionDetails(updatedDetails);

          // 3. Actualizar estado local del Box seleccionado para reflejar cambios en UI
          const updatedBox = {
              ...selectedBox,
              montoInicial: Number(updatedDetails.arqueo.montoInicial),
              montoFinal: Number(updatedDetails.arqueo.montoFinal), // Backend devuelve calculado
              ganancia: Number(updatedDetails.arqueo.ganancia)
          };
          setSelectedBox(updatedBox);
          
          Swal.fire('Actualizado', `Nuevo saldo calculado: L. ${Number(updatedDetails.arqueo.montoFinal).toFixed(2)}`, 'success');
          
          // 4. Refrescar lista general en fondo
          loadData(); 
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
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
          
          // Refrescar datos
          openManager(selectedBox);
          loadData();
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const deleteTransaction = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      if(!selectedBox) return;
      const result = await Swal.fire({ title: '¿Eliminar transacción?', text: 'Esto afectará el cuadre de caja.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar' });
      if(result.isConfirmed) {
          try {
              if(type === 'INGRESO') await CashService.deleteIngreso(id);
              else await CashService.deleteEgreso(id);
              
              // Refrescar datos
              openManager(selectedBox);
              loadData();
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

       {/* GRID DE CAJAS */}
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
           <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
               <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
                   
                   {/* Modal Header */}
                   <div className="bg-slate-50 p-5 border-b border-slate-200 flex justify-between items-center">
                       <div>
                           <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                               {selectedBox.nombreCaja} 
                               <span className="text-sm font-normal text-slate-500 bg-white border px-2 py-0.5 rounded-full">Sesión: {selectedBox.idArqueo}</span>
                           </h2>
                           <p className="text-sm text-slate-500">
                               Cajero: <strong>{selectedBox.nombreEmpleado}</strong> | 
                               Estado: <span className={selectedBox.estadoArqueo === 'Activo' ? 'text-emerald-600 font-bold' : 'text-slate-600 font-bold'}>{selectedBox.estadoArqueo}</span>
                           </p>
                       </div>
                       <button onClick={() => setSelectedBox(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={24} className="text-slate-500"/></button>
                   </div>

                   {/* Content */}
                   <div className="flex-1 flex overflow-hidden">
                       {/* Sidebar Tabs */}
                       <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 flex flex-col gap-2">
                           <button onClick={() => setActiveTab('MOVIMIENTOS')} className={`p-3 rounded-xl text-left font-bold text-sm flex items-center gap-3 transition-all ${activeTab === 'MOVIMIENTOS' ? 'bg-white shadow-md text-indigo-600 border border-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}>
                               <Activity size={18}/> Movimientos
                           </button>
                           <button onClick={() => setActiveTab('CONFIG')} className={`p-3 rounded-xl text-left font-bold text-sm flex items-center gap-3 transition-all ${activeTab === 'CONFIG' ? 'bg-white shadow-md text-indigo-600 border border-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}>
                               <Settings size={18}/> Configuración
                           </button>
                           
                           <div className="mt-auto bg-indigo-900 rounded-xl p-4 text-white shadow-lg">
                               <p className="text-xs text-indigo-300 uppercase font-bold mb-1">Efectivo Calculado</p>
                               <p className="text-2xl font-bold tracking-tight">L. {localTotals.finalCalculado.toFixed(2)}</p>
                               <div className="mt-3 text-[10px] opacity-70 flex justify-between border-t border-indigo-700/50 pt-2">
                                   <span>Ini: {Number(sessionDetails.arqueo.montoInicial || 0).toFixed(2)}</span>
                                   <span>Ing: {localTotals.totalIngresos.toFixed(0)}</span>
                                   <span>Egr: {localTotals.totalEgresos.toFixed(0)}</span>
                               </div>
                           </div>
                       </div>

                       {/* Main Panel */}
                       <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                           
                           {activeTab === 'MOVIMIENTOS' && (
                               <div className="space-y-6">
                                   {/* Ingresos */}
                                   <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                       <div className="p-3 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
                                           <h3 className="font-bold text-emerald-800 flex items-center gap-2"><ArrowUpCircle size={18}/> Ingresos y Ventas ({sessionDetails.ingresos.length})</h3>
                                       </div>
                                       <table className="w-full text-sm text-left">
                                           <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="p-3">Hora</th><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3 text-right">Acción</th></tr></thead>
                                           <tbody>
                                               {sessionDetails.ingresos.map(ing => (
                                                   <tr key={ing.idIngreso} className="border-b hover:bg-slate-50 group">
                                                       <td className="p-3 text-xs text-slate-400 font-mono">{ing.fechaCreacion ? new Date(ing.fechaCreacion).toLocaleString() : '-'}</td>
                                                       <td className="p-3">
                                                           {editingItem.id === ing.idIngreso ? (
                                                               <input className="border p-1 rounded w-full" value={editForm.descripcion} onChange={e=>setEditForm({...editForm, descripcion: e.target.value})} />
                                                           ) : ing.descripcion}
                                                       </td>
                                                       <td className="p-3 font-bold text-emerald-600">
                                                           {editingItem.id === ing.idIngreso ? (
                                                               <input type="number" className="border p-1 rounded w-24" value={editForm.monto} onChange={e=>setEditForm({...editForm, monto: e.target.value})} />
                                                           ) : `L. ${Number(ing.monto).toFixed(2)}`}
                                                       </td>
                                                       <td className="p-3 text-right">
                                                           {editingItem.id === ing.idIngreso ? (
                                                               <div className="flex justify-end gap-1">
                                                                   <button onClick={saveEdit} className="bg-emerald-100 text-emerald-700 p-1.5 rounded hover:bg-emerald-200"><Save size={14}/></button>
                                                                   <button onClick={() => setEditingItem({id:'', type:null})} className="bg-slate-100 text-slate-600 p-1.5 rounded hover:bg-slate-200"><X size={14}/></button>
                                                               </div>
                                                           ) : (
                                                               <div className="flex justify-end gap-1">
                                                                   <button onClick={() => startEdit(ing, 'INGRESO')} className="text-slate-400 hover:text-blue-500 p-1 rounded hover:bg-blue-50 transition-colors"><Edit2 size={16}/></button>
                                                                   <button onClick={() => deleteTransaction(ing.idIngreso, 'INGRESO')} className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"><Trash2 size={16}/></button>
                                                               </div>
                                                           )}
                                                       </td>
                                                   </tr>
                                               ))}
                                           </tbody>
                                       </table>
                                   </div>

                                   {/* Egresos */}
                                   <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                       <div className="p-3 bg-red-50 border-b border-red-100 flex justify-between items-center">
                                           <h3 className="font-bold text-red-800 flex items-center gap-2"><ArrowDownCircle size={18}/> Gastos y Salidas ({sessionDetails.egresos.length})</h3>
                                       </div>
                                       <table className="w-full text-sm text-left">
                                           <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="p-3">Hora</th><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3 text-right">Acción</th></tr></thead>
                                           <tbody>
                                               {sessionDetails.egresos.map(egr => (
                                                   <tr key={egr.idegresos} className="border-b hover:bg-slate-50 group">
                                                       <td className="p-3 text-xs text-slate-400 font-mono">{egr.fechaCreacion ? new Date(egr.fechaCreacion).toLocaleString() : '-'}</td>
                                                       <td className="p-3">
                                                           {editingItem.id === egr.idegresos ? (
                                                               <input className="border p-1 rounded w-full" value={editForm.descripcion} onChange={e=>setEditForm({...editForm, descripcion: e.target.value})} />
                                                           ) : egr.descripcion}
                                                       </td>
                                                       <td className="p-3 font-bold text-red-600">
                                                           {editingItem.id === egr.idegresos ? (
                                                               <input type="number" className="border p-1 rounded w-24" value={editForm.monto} onChange={e=>setEditForm({...editForm, monto: e.target.value})} />
                                                           ) : `L. ${Number(egr.monto).toFixed(2)}`}
                                                       </td>
                                                       <td className="p-3 text-right">
                                                           {editingItem.id === egr.idegresos ? (
                                                               <div className="flex justify-end gap-1">
                                                                   <button onClick={saveEdit} className="bg-emerald-100 text-emerald-700 p-1.5 rounded hover:bg-emerald-200"><Save size={14}/></button>
                                                                   <button onClick={() => setEditingItem({id:'', type:null})} className="bg-slate-100 text-slate-600 p-1.5 rounded hover:bg-slate-200"><X size={14}/></button>
                                                               </div>
                                                           ) : (
                                                               <div className="flex justify-end gap-1">
                                                                   <button onClick={() => startEdit(egr, 'EGRESO')} className="text-slate-400 hover:text-blue-500 p-1 rounded hover:bg-blue-50 transition-colors"><Edit2 size={16}/></button>
                                                                   <button onClick={() => deleteTransaction(egr.idegresos, 'EGRESO')} className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"><Trash2 size={16}/></button>
                                                               </div>
                                                           )}
                                                       </td>
                                                   </tr>
                                               ))}
                                           </tbody>
                                       </table>
                                   </div>
                               </div>
                           )}

                           {activeTab === 'CONFIG' && (
                               <div className="space-y-6">
                                   <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                       <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Edit2 size={18}/> Corrección de Monto Inicial</h3>
                                       <div className="flex gap-4 items-end">
                                           <div className="flex-1">
                                               <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Monto Inicial (L.)</label>
                                               <input 
                                                  type="number" 
                                                  className="w-full p-3 border border-slate-300 rounded-lg font-bold text-lg" 
                                                  value={newMontoInicial}
                                                  onChange={e => setNewMontoInicial(e.target.value)}
                                               />
                                           </div>
                                           <button onClick={handleUpdateInitial} className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-indigo-700 shadow-lg">Actualizar y Recalcular</button>
                                       </div>
                                       <p className="text-xs text-slate-400 mt-2">
                                           <AlertTriangle size={12} className="inline mr-1"/>
                                           Modificar esto recalculará el monto final y la ganancia de la sesión.
                                       </p>
                                   </div>

                                   {selectedBox.estadoArqueo === 'Cerrada' && (
                                       <div className="bg-amber-50 p-6 rounded-xl border border-amber-200 shadow-sm">
                                           <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2"><AlertTriangle size={18}/> Reabrir Caja Cerrada</h3>
                                           <p className="text-sm text-amber-700 mb-4">
                                               La caja fue cerrada el {new Date(selectedBox.fechaCierre || '').toLocaleString()}. Si esto fue un error, puede reabrirla para continuar operando.
                                           </p>
                                           <button onClick={() => handleReopenBox(selectedBox.idArqueo)} className="bg-amber-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-amber-700 shadow-lg">
                                               Reabrir Sesión
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
