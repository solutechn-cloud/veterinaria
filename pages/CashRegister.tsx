

import React, { useState, useEffect } from 'react';
import { CashService, SalesService, PackagesService, ConfigService, AccountingService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Venta, Saldo, Paquete, EmpresaConfig, SubtipoIngreso, SubtipoEgreso, Socio } from '../types';
import { 
  Lock, PlusCircle, Smartphone, Ban, ShoppingCart, ArrowDownCircle, ArrowUpCircle, Wallet, Edit2, Trash2, X, CloudLightning, FileText, Printer, UserCheck, RefreshCw
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

type TabType = 'INGRESOS' | 'EGRESO' | 'VENTAS' | 'RECARGAS';

const CashRegister: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('INGRESOS');
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [partners, setPartners] = useState<Socio[]>([]);
  
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);

  const [existingBalances, setExistingBalances] = useState({ tigo: false, claro: false });
  const [openForm, setOpenForm] = useState({ monto: '', tigo: '', claro: '' });
  
  const { user } = useAuth();
  const navigate = useNavigate();

  // Modals Forms
  const [showIngresoModal, setShowIngresoModal] = useState(false);
  const [ingresoForm, setIngresoForm] = useState({ 
    id: '', descripcion: '', monto: '', costo: '', subtipo: 'Venta Inventario' as SubtipoIngreso, irAPos: true 
  });
  
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [egresoForm, setEgresoForm] = useState({ 
    id: '', descripcion: '', monto: '', subtipo: 'Gasto Operativo' as SubtipoEgreso, idSocio: '' 
  });

  const getHndDateOnly = () => {
    // Generar la fecha actual en formato Honduras para las consultas del frontend
    const options: Intl.DateTimeFormatOptions = { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(new Date());
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  };

  const getFullHndTimestamp = () => {
    const options: Intl.DateTimeFormatOptions = { 
        timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false 
    };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(new Date());
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  };

  useEffect(() => {
    if (user) {
        loadData();
        loadCatalogos();
    }
  }, [user]);

  const loadCatalogos = async () => {
      try {
        const socs = await AccountingService.getSocios();
        setPartners(socs || []);
      } catch(e) { console.error(e); }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const hndDate = getHndDateOnly();
      // 1. Verificar si hay un arqueo activo para EL USUARIO/CAJA
      const active = await CashService.getActiveArqueo();
      
      // 2. Verificar estado GLOBAL de saldos Tigo/Claro
      const status = await CashService.getSaldosStatus(hndDate);
      setExistingBalances(status);

      if (active) {
        setArqueo(active);
        // Cargar movimientos filtrados por la fecha de hoy en Honduras
        const [ing, egr, vts, slds] = await Promise.all([
           CashService.getIngresos(user!.idCaja, hndDate),
           CashService.getEgresos(user!.idCaja, hndDate),
           SalesService.getVentasDiDaily(hndDate),
           CashService.getSaldosToday(hndDate)
        ]);
        setIngresos(ing || []);
        setEgresos(egr || []);
        setVentas(vts || []);
        setSaldos(slds || []);
      } else {
        setArqueo(null);
      }
    } catch (error) { 
        console.error(error); 
    } finally { 
        setIsLoading(false); 
    }
  };

  const handleOpenBox = async () => {
     if(!openForm.monto) return Swal.fire('Error', 'Ingrese monto inicial de caja', 'error');
     
     // Validar que si no existen saldos globales, se ingresen ahora
     if (!existingBalances.tigo && !openForm.tigo) return Swal.fire('Error', 'Debe ingresar el Saldo Tigo inicial del día', 'error');
     if (!existingBalances.claro && !openForm.claro) return Swal.fire('Error', 'Debe ingresar el Saldo Claro inicial del día', 'error');

     try {
       await CashService.openCaja({ 
           montoInicial: Number(openForm.monto), 
           saldoTigoInicial: existingBalances.tigo ? 0 : Number(openForm.tigo || 0), 
           saldoClaroInicial: existingBalances.claro ? 0 : Number(openForm.claro || 0) 
       });
       Swal.fire('Éxito', 'Caja Aperturada', 'success');
       loadData();
     } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleCloseBox = async () => {
     if(!arqueo) return;
     const result = await Swal.fire({ title: '¿Cerrar Turno?', text: 'Se guardará el saldo final y se bloquearán movimientos.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Cerrar Caja', confirmButtonColor: '#ef4444' });
     if(result.isConfirmed) {
       try {
         await CashService.closeCaja(arqueo.idArqueo);
         Swal.fire('Cierre Exitoso', 'El turno ha sido finalizado.', 'success');
         loadData(); 
       } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
     }
  };

  // ... resto de manejadores de ingresos/egresos se mantienen igual ...
  // Solo actualizando el timestamp al crear para asegurar fecha Honduras
  const handleIngresoAction = async () => {
    try {
        if (ingresoForm.irAPos && !ingresoForm.id) {
            navigate('/pos', { state: { customItem: { descripcion: `[${ingresoForm.subtipo}] ${ingresoForm.descripcion}`, precio: Number(ingresoForm.monto) } } });
            return;
        }
        await CashService.createIngreso({
            descripcion: ingresoForm.descripcion,
            monto: Number(ingresoForm.monto),
            costo: Number(ingresoForm.costo),
            subtipo_movimiento: ingresoForm.subtipo,
            fechaCreacion: getFullHndTimestamp()
        });
        setShowIngresoModal(false);
        setIngresoForm({ id: '', descripcion: '', monto: '', costo: '', subtipo: 'Venta Inventario', irAPos: true });
        await loadData();
        Swal.fire('Guardado', 'Ingreso registrado', 'success');
    } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleEgresoAction = async () => {
     try {
         await CashService.createEgreso({ 
             descripcion: egresoForm.descripcion, 
             monto: Number(egresoForm.monto), 
             subtipo_egreso: egresoForm.subtipo,
             id_socio_asignado: egresoForm.idSocio || null,
             fechaCreacion: getFullHndTimestamp() 
         });
         setShowEgresoModal(false);
         setEgresoForm({ id: '', descripcion: '', monto: '', subtipo: 'Gasto Operativo', idSocio: '' });
         await loadData();
         Swal.fire('Guardado', 'Egreso registrado', 'success');
     } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  /* fix: Added missing handleDeleteItem function to handle removing ingresos/egresos from the current session */
  const handleDeleteItem = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      const result = await Swal.fire({
          title: '¿Eliminar movimiento?',
          text: "Se recalculará el balance de la caja.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar'
      });

      if (result.isConfirmed) {
          try {
              if (type === 'INGRESO') await CashService.deleteIngreso(id);
              else await CashService.deleteEgreso(id);
              
              Swal.fire({ title: 'Eliminado', icon: 'success', timer: 1500, showConfirmButton: false });
              loadData();
          } catch (error: any) {
              Swal.fire('Error', error.message, 'error');
          }
      }
  };

  const totalIngresos = ingresos.reduce((a,b) => a + Number(b.monto), 0);
  const totalGastos = egresos.reduce((a,b) => a + Number(b.monto), 0);
  const cashInBoxCalculated = arqueo ? (Number(arqueo.montoInicial) + totalIngresos) - totalGastos : 0;

  if (isLoading) return <div className="flex flex-col justify-center items-center h-full text-slate-400 gap-4"><RefreshCw className="animate-spin" size={32}/><span>Validando Arqueo de Honduras...</span></div>;

  if (!arqueo) {
      return (
          <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6 animate-fade-in">
              <div className="bg-white max-w-lg w-full rounded-3xl shadow-xl p-8 border border-slate-100">
                  <div className="flex flex-col items-center mb-8">
                      <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4"><CloudLightning className="text-white" size={32} /></div>
                      <h2 className="text-3xl font-bold text-slate-800">Apertura de Turno</h2>
                      <p className="text-slate-500 mt-2 text-center">Registra el efectivo inicial de tu caja. {(!existingBalances.tigo || !existingBalances.claro) && 'Hoy eres el primero en abrir, por favor ingresa los saldos de recargas.'}</p>
                  </div>
                  <div className="space-y-6">
                      <div><label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Efectivo Inicial en Caja</label><input type="number" className="w-full p-4 text-2xl font-bold text-center border-2 border-slate-200 rounded-2xl outline-none focus:border-indigo-500 transition-all" placeholder="0.00" value={openForm.monto} onChange={e => setOpenForm({...openForm, monto: e.target.value})} autoFocus/></div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          {!existingBalances.tigo && (
                             <div className="animate-fade-in"><label className="text-xs font-bold text-blue-500 uppercase mb-2 block">Saldo Tigo (Inicial Día)</label><input type="number" className="w-full p-3 border-2 border-blue-100 bg-blue-50/50 rounded-xl" placeholder="0.00" value={openForm.tigo} onChange={e => setOpenForm({...openForm, tigo: e.target.value})} /></div>
                          )}
                          {!existingBalances.claro && (
                             <div className="animate-fade-in"><label className="text-xs font-bold text-red-500 uppercase mb-2 block">Saldo Claro (Inicial Día)</label><input type="number" className="w-full p-3 border-2 border-red-100 bg-red-50/50 rounded-xl" placeholder="0.00" value={openForm.claro} onChange={e => setOpenForm({...openForm, claro: e.target.value})} /></div>
                          )}
                      </div>

                      {existingBalances.tigo && existingBalances.claro && (
                          <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-center gap-3">
                              <Smartphone className="text-emerald-600"/>
                              <p className="text-xs font-medium text-emerald-800">Los saldos de recargas ya fueron registrados por otra terminal hoy.</p>
                          </div>
                      )}

                      <button onClick={handleOpenBox} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-xl flex items-center justify-center gap-3 text-lg transition-all"><Lock size={20}/> CONFIRMAR APERTURA</button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6 min-h-[80vh] flex flex-col pb-10">
      {/* Header Cards con datos reales del Arqueo Detectado */}
      <div className="bg-slate-800 rounded-2xl p-6 text-white shadow-lg animate-fade-in">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
             <div>
                <h2 className="text-xl font-bold uppercase tracking-wider">Caja: {user?.idCaja}</h2>
                <p className="text-slate-400 text-xs">Turno Activo desde: {new Date(arqueo.fechaApertura).toLocaleString()}</p>
             </div>
             <button onClick={handleCloseBox} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg border border-red-500"><Lock size={16}/> CERRAR TURNO</button>
         </div>
         <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/5"><p className="text-xs text-slate-400 mb-1 font-bold uppercase tracking-tighter">Efectivo en Caja</p><h3 className="text-2xl md:text-3xl font-bold tracking-tight">L. {cashInBoxCalculated.toLocaleString()}</h3></div>
              <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/5"><p className="text-xs text-emerald-400 mb-1 font-bold uppercase tracking-tighter">Ingresos</p><h3 className="text-lg md:text-xl font-bold">L. {totalIngresos.toLocaleString()}</h3></div>
              <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/5"><p className="text-xs text-red-300 mb-1 font-bold uppercase tracking-tighter">Gastos</p><h3 className="text-lg md:text-xl font-bold text-red-200">L. {totalGastos.toLocaleString()}</h3></div>
              <div className="bg-blue-600/20 border border-blue-500/30 p-4 rounded-xl"><p className="text-xs text-blue-200 mb-1 font-bold uppercase tracking-tighter">S. Tigo</p><h3 className="text-lg md:text-xl font-bold">L. {(saldos.find(x => x.red === 'TIGO')?.saldoFinal || 0).toLocaleString()}</h3></div>
              <div className="bg-red-600/20 border border-red-500/30 p-4 rounded-xl"><p className="text-xs text-red-200 mb-1 font-bold uppercase tracking-tighter">S. Claro</p><h3 className="text-lg md:text-xl font-bold">L. {(saldos.find(x => x.red === 'CLARO')?.saldoFinal || 0).toLocaleString()}</h3></div>
         </div>
      </div>

      {/* Tabs y Contenido de Movimientos (Igual que antes pero filtrado por loadData con timezone corregido) */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-slate-200">
         {[{ id: 'INGRESOS', label: 'Ingresos', icon: <ArrowUpCircle size={18}/> }, { id: 'EGRESO', label: 'Gastos/Compras', icon: <ArrowDownCircle size={18}/> }, { id: 'RECARGAS', label: 'Recargas', icon: <Smartphone size={18}/> }, { id: 'VENTAS', label: 'Historial Ventas', icon: <ShoppingCart size={18}/> }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 flex items-center gap-2 ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{tab.icon} {tab.label}</button>
         ))}
      </div>

      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
         {activeTab === 'INGRESOS' && (
           <div className="space-y-4">
              <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                 <div><h3 className="font-bold text-emerald-800 text-sm md:text-base">Nuevo Ingreso</h3><p className="text-[10px] md:text-xs text-emerald-600">Servicios técnicos, reparaciones o ventas manuales.</p></div>
                 <button onClick={() => setShowIngresoModal(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 shadow-md flex items-center gap-2 font-bold text-sm"><PlusCircle size={18}/> Nuevo</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] md:text-xs font-black"><tr><th className="p-3">Categoría</th><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3 text-right">Acción</th></tr></thead>
                  <tbody>
                    {ingresos.length === 0 ? (<tr><td colSpan={4} className="p-10 text-center text-slate-400 italic">No hay ingresos registrados hoy.</td></tr>) : ingresos.map(i => (
                      <tr key={i.idIngreso} className="border-b hover:bg-slate-50 group">
                        <td className="p-3"><span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-black text-slate-600 uppercase">{i.subtipo_movimiento || 'Venta'}</span></td>
                        <td className="p-3 font-medium text-slate-700">{i.descripcion}</td>
                        <td className="p-3 font-bold text-emerald-600">L. {Number(i.monto).toFixed(2)}</td>
                        <td className="p-3 text-right"><button onClick={() => handleDeleteItem(i.idIngreso, 'INGRESO')} className="p-1 text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={16}/></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
           </div>
         )}

         {activeTab === 'EGRESO' && (
           <div className="space-y-4">
              <div className="flex justify-between items-center bg-red-50 p-4 rounded-xl border border-red-100">
                <div><h3 className="font-bold text-red-800 text-sm">Gasto o Retiro de Efectivo</h3><p className="text-[10px] text-red-600">Luz, alquiler, pago a técnicos o retiros personales.</p></div>
                <button onClick={() => setShowEgresoModal(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shadow-md flex items-center gap-2 font-bold text-sm"><ArrowDownCircle size={16}/> Registrar</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] md:text-xs font-black"><tr><th className="p-3">Categoría</th><th className="p-3">Descripción / Socio</th><th className="p-3">Monto</th><th className="p-3 text-right">Acción</th></tr></thead>
                  <tbody>
                    {egresos.length === 0 ? (<tr><td colSpan={4} className="p-10 text-center text-slate-400 italic">No hay gastos hoy.</td></tr>) : egresos.map(e => (
                      <tr key={e.idegresos} className="border-b hover:bg-slate-50 group">
                        <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${e.subtipo_egreso?.includes('Personal') ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{e.subtipo_egreso || 'Gasto'}</span></td>
                        <td className="p-3"><p className="font-medium text-slate-700">{e.descripcion}</p>{e.id_socio_asignado && <p className="text-[10px] text-indigo-500 font-bold flex items-center gap-1"><UserCheck size={10}/> {partners.find(p=>p.idSocio===e.id_socio_asignado)?.nombre}</p>}</td>
                        <td className="p-3 font-bold text-red-600">L. {Number(e.monto).toFixed(2)}</td>
                        <td className="p-3 text-right"><button onClick={() => handleDeleteItem(e.idegresos, 'EGRESO')} className="p-1 text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={16}/></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
           </div>
         )}
         
         {/* Los modales se mantienen pero ahora envían fecha de Honduras al guardar */}
      </div>

      {/* --- RE-USANDO LOS MODALES DEL TURNO ANTERIOR PERO CON FECHA FORZADA --- */}
      {showIngresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-fade-in">
               <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-xl text-slate-800">Registrar Ingreso</h3><button onClick={() => setShowIngresoModal(false)}><X className="text-slate-400"/></button></div>
               <div className="space-y-4">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Clasificación</label>
                    <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={ingresoForm.subtipo} onChange={e => setIngresoForm({...ingresoForm, subtipo: e.target.value as any})}>
                      <option value="Venta Inventario">Venta de Inventario</option><option value="Venta Prestado">Venta Producto Prestado</option><option value="Reparacion">Servicio de Reparación</option><option value="KrediYa_Prima">KrediYa (Pago de Prima)</option><option value="Cobro Consignacion">Cobro a Otros Negocios</option><option value="Ajuste">Ajuste de Caja</option>
                    </select>
                  </div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción</label><input className="w-full p-3 border rounded-xl" placeholder="Ej: Reparación Pantalla S20" value={ingresoForm.descripcion} onChange={e => setIngresoForm({...ingresoForm, descripcion:e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Precio Cobrado</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-emerald-600" placeholder="0.00" value={ingresoForm.monto} onChange={e => setIngresoForm({...ingresoForm, monto:e.target.value})} /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Costo Base</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-slate-400" placeholder="0.00" value={ingresoForm.costo} onChange={e => setIngresoForm({...ingresoForm, costo:e.target.value})} /></div>
                  </div>
                  <button onClick={handleIngresoAction} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-lg hover:bg-emerald-700 transition-all text-sm tracking-widest mt-4 uppercase">GUARDAR INGRESO</button>
               </div>
            </div>
         </div>
      )}

      {showEgresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-fade-in">
               <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-xl text-slate-800">Registrar Salida</h3><button onClick={() => setShowEgresoModal(false)}><X className="text-slate-400"/></button></div>
               <div className="space-y-4">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Tipo de Salida</label>
                    <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={egresoForm.subtipo} onChange={e => setEgresoForm({...egresoForm, subtipo: e.target.value as any})}>
                      <option value="Gasto Operativo">Gasto Operativo (Limpieza, Luz, etc)</option><option value="Pago a Tecnico">Pago a Técnico Amigo</option><option value="Pago a Tienda Externa">Pago por Producto Prestado</option><option value="Gasto Personal Socio">Retiro Personal de Socio</option><option value="Nomina">Pago de Empleado</option><option value="Compra Inventario">Compra de Mercadería</option>
                    </select>
                  </div>
                  {(egresoForm.subtipo === 'Gasto Personal Socio' || egresoForm.subtipo === 'Nomina') && (
                      <div className="animate-fade-in"><label className="text-[10px] font-black text-indigo-500 uppercase mb-1 block">Vincular a Socio</label>
                        <select className="w-full p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-bold text-indigo-700" value={egresoForm.idSocio} onChange={e => setEgresoForm({...egresoForm, idSocio: e.target.value})}>
                          <option value="">-- Seleccionar Socio --</option>
                          {partners.map(p => <option key={p.idSocio} value={p.idSocio}>{p.nombre}</option>)}
                        </select>
                      </div>
                  )}
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción</label><input className="w-full p-3 border rounded-xl" placeholder="Ej: Pago de almuerzo" value={egresoForm.descripcion} onChange={e => setEgresoForm({...egresoForm, descripcion:e.target.value})} /></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Monto a Retirar</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-red-600" placeholder="0.00" value={egresoForm.monto} onChange={e => setEgresoForm({...egresoForm, monto:e.target.value})} /></div>
                  <button onClick={handleEgresoAction} className="w-full py-4 bg-red-600 text-white rounded-2xl font-black shadow-lg hover:bg-red-700 transition-all text-sm tracking-widest mt-4 uppercase">REGISTRAR SALIDA</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default CashRegister;
