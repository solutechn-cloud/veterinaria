
import React, { useState, useEffect, useMemo } from 'react';
import { CashService, SalesService, PackagesService, ConfigService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Venta, Saldo, Paquete, EmpresaConfig } from '../types';
import { 
  Lock, PlusCircle, Smartphone, ArrowDownCircle, ArrowUpCircle, Wallet, Edit2, Trash2, X, CloudLightning, FileText, Printer, CheckCircle, RefreshCw, AlertTriangle, ShoppingBag, Download, History, ListFilter
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

type TabType = 'INGRESOS' | 'GASTOS' | 'RECARGAS' | 'HISTORIAL';

const CashRegister: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('INGRESOS');
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);

  const [existingBalances, setExistingBalances] = useState({ tigo: false, claro: false });
  const [openForm, setOpenForm] = useState({ monto: '', tigo: '', claro: '' });
  
  const { user } = useAuth();
  const navigate = useNavigate();

  // Modals
  const [showIngresoModal, setShowIngresoModal] = useState(false);
  const [ingresoForm, setIngresoForm] = useState({ id: '', descripcion: '', monto: '', costo: '', irAPos: true });
  
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [egresoForm, setEgresoForm] = useState({ id: '', descripcion: '', monto: '' });

  const [showSaldoModal, setShowSaldoModal] = useState(false);
  const [saldoForm, setSaldoForm] = useState({ red: 'TIGO', montoPagado: '', saldoRecibido: '' });

  const [showRecargaModal, setShowRecargaModal] = useState<{red: 'TIGO' | 'CLARO', tipo: 'RECARGA' | 'PAQUETE'} | null>(null);
  const [recargaForm, setRecargaForm] = useState({ monto: '', paqueteId: '' });

  const getLocalDate = () => new Date().toISOString().split('T')[0];
  const getFullTimestamp = () => new Date().toLocaleString('en-US', {hour12:false});

  useEffect(() => { if (user) { loadData(); loadCatalogos(); } }, [user]);

  const loadCatalogos = async () => {
      try {
        const paqs = await PackagesService.getAll();
        setPaquetes(paqs || []);
      } catch(e) { console.error(e); }
  };

  const loadData = async () => {
    if (!user?.idCaja) return; 
    setIsLoading(true);
    try {
      const active = await CashService.getActiveArqueo();
      const localDate = getLocalDate();
      if (!active) {
        setArqueo(null);
        const status = await CashService.getSaldosStatus(localDate);
        setExistingBalances(status);
      } else {
        setArqueo(active);
        const [ing, egr, vts, slds] = await Promise.all([
           CashService.getIngresos(user.idCaja, localDate),
           CashService.getEgresos(user.idCaja, localDate),
           SalesService.getVentasDiarias(localDate),
           CashService.getSaldosToday(localDate)
        ]);
        setIngresos(ing || []);
        setEgresos(egr || []);
        setVentas(vts || []);
        setSaldos(slds || []);
      }
    } catch (error) { console.error(error); }
    finally { setIsLoading(false); }
  };

  const totals = useMemo(() => {
    const totalIng = ingresos.reduce((a, b) => a + Number(b.monto), 0);
    const totalEgr = egresos.reduce((a, b) => a + Number(b.monto), 0);
    const inicial = arqueo ? Number(arqueo.montoInicial) : 0;
    const sTigo = saldos.find(s => s.red === 'TIGO')?.saldoFinal || 0;
    const sClaro = saldos.find(s => s.red === 'CLARO')?.saldoFinal || 0;
    return {
      efectivo: (inicial + totalIng) - totalEgr,
      ingresos: totalIng,
      egresos: totalEgr,
      tigo: sTigo,
      claro: sClaro
    };
  }, [ingresos, egresos, arqueo, saldos]);

  const handleOpenBox = async () => {
     if(!openForm.monto) return Swal.fire('Error', 'Ingrese monto inicial', 'error');
     try {
       await CashService.openCaja({ montoInicial: Number(openForm.monto), saldoTigoInicial: Number(openForm.tigo || 0), saldoClaroInicial: Number(openForm.claro || 0), fechaLocal: getLocalDate() });
       loadData();
     } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleCloseBox = async () => {
     if(!arqueo) return;
     const res = await Swal.fire({ 
         title: '¿Cierre de Caja?', 
         text: `El efectivo esperado es L. ${totals.efectivo.toLocaleString()}. ¿Desea finalizar el turno?`, 
         icon: 'warning', 
         showCancelButton: true, 
         confirmButtonText: 'Sí, Cerrar Caja', 
         confirmButtonColor: '#ef4444' 
     });
     if(res.isConfirmed) {
       try {
         await CashService.closeCaja(arqueo.idArqueo);
         loadData();
       } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
     }
  };

  const handleIngresoAction = async () => {
     if (ingresoForm.irAPos) {
         navigate('/pos', { state: { customItem: { descripcion: ingresoForm.descripcion, precio: Number(ingresoForm.monto) } } });
         return;
     }
     try {
         await CashService.createIngreso({ descripcion: ingresoForm.descripcion, monto: Number(ingresoForm.monto), costo: Number(ingresoForm.costo), fechaCreacion: getFullTimestamp() });
         setShowIngresoModal(false); loadData();
     } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleEgresoAction = async () => {
     try {
         await CashService.createEgreso({ descripcion: egresoForm.descripcion, monto: Number(egresoForm.monto), fechaCreacion: getFullTimestamp() });
         setShowEgresoModal(false); loadData();
     } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleBuySaldo = async () => {
      try {
          await CashService.buySaldo({ red: saldoForm.red, monto: Number(saldoForm.montoPagado) });
          setShowSaldoModal(false); loadData();
      } catch(err:any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleRecargaAction = async () => {
      if(!showRecargaModal) return;
      try {
          let desc = '', mnt = 0, cst = 0;
          if (showRecargaModal.tipo === 'RECARGA') {
              mnt = Number(recargaForm.monto);
              cst = mnt * 0.95;
              desc = `RECARGA ${showRecargaModal.red}: L. ${mnt}`;
          } else {
              const paq = paquetes.find(p => p.idPaquete === recargaForm.paqueteId);
              if (!paq) return;
              mnt = Number(paq.precio); cst = Number(paq.costo);
              desc = `PAQUETE ${paq.nombre} (${showRecargaModal.red})`;
          }
          await CashService.createRecarga({ red: showRecargaModal.red, monto: mnt, costo: cst, descripcion: desc });
          setShowRecargaModal(null); setRecargaForm({monto:'', paqueteId:''}); loadData();
      } catch(err:any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleDeleteItem = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      const res = await Swal.fire({ title: '¿Eliminar registro?', text: "Se ajustará el balance de caja.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar' });
      if (res.isConfirmed) {
          try {
              if (type === 'INGRESO') await CashService.deleteIngreso(id);
              else await CashService.deleteEgreso(id);
              loadData();
          } catch (e:any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const generateDailyReport = (includeRecharges: boolean = true) => {
      const doc = new jsPDF();
      const date = getLocalDate();
      const filteredIngresos = includeRecharges ? ingresos : ingresos.filter(i => !i.descripcion.includes('RECARGA'));
      
      doc.setFontSize(18); doc.text("REPORTE DIARIO DE CAJA", 105, 15, { align: 'center' });
      doc.setFontSize(10); doc.text(`Caja: ${user?.idCaja} | Fecha: ${date} | Cajero: ${user?.nombreEmpleado}`, 105, 22, { align: 'center' });

      const bodyIng = filteredIngresos.map(i => [i.descripcion, `L. ${Number(i.monto).toFixed(2)}`]);
      // @ts-ignore
      doc.autoTable({ startY: 30, head: [['Descripción Ingresos', 'Monto']], body: bodyIng, theme: 'striped', headStyles: { fillColor: [16, 185, 129] } });

      const finalYIng = (doc as any).lastAutoTable.finalY || 30;
      const bodyEgr = egresos.map(e => [e.descripcion, `L. ${Number(e.monto).toFixed(2)}`]);
      // @ts-ignore
      doc.autoTable({ startY: finalYIng + 10, head: [['Descripción Egresos', 'Monto']], body: bodyEgr, theme: 'striped', headStyles: { fillColor: [239, 68, 68] } });

      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text(`TOTAL EN CAJA: L. ${totals.efectivo.toLocaleString()}`, 140, finalY);

      doc.save(`Reporte_Caja_${date}${includeRecharges ? '' : '_Sin_Recargas'}.pdf`);
  };

  if (isLoading) return <div className="flex h-screen items-center justify-center text-slate-400"><RefreshCw className="animate-spin mr-2"/> Cargando Caja...</div>;

  if (!arqueo) {
      return (
          <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6">
              <div className="bg-white max-w-lg w-full rounded-3xl shadow-xl p-8 border border-slate-100">
                  <div className="flex flex-col items-center mb-8">
                      <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg mb-4"><CloudLightning className="text-white" size={32} /></div>
                      <h2 className="text-3xl font-bold text-slate-800 text-center">Apertura de Turno</h2>
                  </div>
                  <div className="space-y-6">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 block">Efectivo Inicial L.</label>
                          <input type="number" className="w-full p-4 text-3xl font-black text-center border-2 border-slate-200 rounded-2xl outline-none focus:border-indigo-500" value={openForm.monto} onChange={e => setOpenForm({...openForm, monto: e.target.value})} autoFocus placeholder="0.00"/>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div><label className="text-[10px] font-black text-blue-500 uppercase ml-1">Saldo Tigo</label><input type="number" className="w-full p-3 border-2 border-blue-100 bg-blue-50/30 rounded-xl font-bold" value={openForm.tigo} onChange={e => setOpenForm({...openForm, tigo: e.target.value})} placeholder="L. 0.00" disabled={existingBalances.tigo}/></div>
                          <div><label className="text-[10px] font-black text-red-500 uppercase ml-1">Saldo Claro</label><input type="number" className="w-full p-3 border-2 border-red-100 bg-red-50/30 rounded-xl font-bold" value={openForm.claro} onChange={e => setOpenForm({...openForm, claro: e.target.value})} placeholder="L. 0.00" disabled={existingBalances.claro}/></div>
                      </div>
                      <button onClick={handleOpenBox} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 text-lg transition-all active:scale-95"><Lock size={22}/> ABRIR CAJA</button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* HEADER CARDS SECTION */}
      <div className="bg-[#1e293b] rounded-[30px] p-8 text-white shadow-2xl relative overflow-hidden">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
             <div>
                <h2 className="text-2xl font-black uppercase tracking-widest">CAJA: {user?.idCaja}</h2>
                <p className="text-slate-400 font-medium">Usuario: {user?.nombreEmpleado}</p>
             </div>
             <button onClick={handleCloseBox} className="bg-[#ef4444] hover:bg-red-700 px-8 py-3 rounded-xl font-black text-xs flex items-center gap-3 shadow-xl transition-all uppercase tracking-widest">
                <Lock size={18}/> CIERRE DE CAJA
             </button>
         </div>
         
         <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-10 relative z-10">
              <div className="bg-[#334155] p-5 rounded-2xl border border-white/5">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">EFECTIVO EN CAJA</p>
                  <h3 className="text-2xl font-black">L. {totals.efectivo.toFixed(2)}</h3>
              </div>
              <div className="bg-[#334155] p-5 rounded-2xl border border-white/5">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">TOTAL INGRESOS HOY</p>
                  <h3 className="text-2xl font-black">L. {totals.ingresos.toFixed(2)}</h3>
              </div>
              <div className="bg-[#334155] p-5 rounded-2xl border border-white/5">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">TOTAL GASTOS HOY</p>
                  <h3 className="text-2xl font-black">L. {totals.egresos.toFixed(2)}</h3>
              </div>
              <div className="bg-[#1e3a8a]/40 p-5 rounded-2xl border border-blue-500/20">
                  <p className="text-[9px] text-blue-300 font-black uppercase tracking-widest mb-1">SALDO TIGO</p>
                  <h3 className="text-2xl font-black text-blue-100">L. {totals.tigo.toFixed(2)}</h3>
              </div>
              <div className="bg-[#7f1d1d]/30 p-5 rounded-2xl border border-red-500/20">
                  <p className="text-[9px] text-red-300 font-black uppercase tracking-widest mb-1">SALDO CLARO</p>
                  <h3 className="text-2xl font-black text-red-100">L. {totals.claro.toFixed(2)}</h3>
              </div>
         </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex gap-4 border-b border-slate-200 px-4">
         {[
           { id: 'INGRESOS', label: 'Ingresos', icon: <ArrowUpCircle size={18}/> }, 
           { id: 'GASTOS', label: 'Gastos/Compras', icon: <ArrowDownCircle size={18}/> }, 
           { id: 'RECARGAS', label: 'Recargas', icon: <Smartphone size={18}/> }, 
           { id: 'HISTORIAL', label: 'Historial Ventas', icon: <ShoppingBag size={18}/> }
         ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-6 py-4 font-black text-xs whitespace-nowrap transition-all border-b-[4px] flex items-center gap-2 ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                {tab.icon} {tab.label}
            </button>
         ))}
      </div>

      <div className="px-2">
      <div className="bg-white rounded-[20px] shadow-sm border border-slate-200 p-8 min-h-[500px]">
         
         {/* TAB: INGRESOS */}
         {activeTab === 'INGRESOS' && (
           <div className="space-y-6">
              <div className="flex justify-between items-center bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100">
                 <div><h3 className="font-black text-emerald-800 text-sm uppercase">Registrar Ingreso Manual</h3><p className="text-xs text-emerald-600 opacity-80">Para productos fuera de inventario o servicios.</p></div>
                 <button onClick={() => { setIngresoForm({id:'', descripcion:'', monto:'', costo:'', irAPos:true}); setShowIngresoModal(true); }} className="bg-emerald-600 text-white px-6 py-3 rounded-xl hover:bg-emerald-700 shadow-lg flex items-center gap-2 font-black text-xs transition-all active:scale-95"><PlusCircle size={18}/> Nuevo Ingreso</button>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-black tracking-widest border-b"><tr><th className="p-4">DESCRIPCIÓN</th><th className="p-4">MONTO</th><th className="p-4">COSTO</th><th className="p-4 text-right">ACCIONES</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {ingresos.length === 0 ? <tr><td colSpan={4} className="p-10 text-center text-slate-400 italic">No hay ingresos hoy.</td></tr> : ingresos.map(i => (
                        <tr key={i.idIngreso} className="hover:bg-slate-50 group">
                            <td className="p-4 font-bold text-slate-700 uppercase">{i.descripcion}</td>
                            <td className="p-4 font-black text-emerald-600">L. {Number(i.monto).toFixed(2)}</td>
                            <td className="p-4 text-slate-400">L. {Number(i.costo).toFixed(2)}</td>
                            <td className="p-4 text-right flex justify-end gap-2">
                                <button className="p-2 text-blue-400 hover:bg-blue-50 rounded-lg"><Edit2 size={16}/></button>
                                <button onClick={() => handleDeleteItem(i.idIngreso, 'INGRESO')} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
              </table>
           </div>
         )}

         {/* TAB: GASTOS */}
         {activeTab === 'GASTOS' && (
           <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-red-50/50 p-6 rounded-2xl border border-red-100 flex justify-between items-center">
                    <div><h3 className="font-black text-red-800 text-sm uppercase">Registrar Gasto Operativo</h3><p className="text-xs text-red-600 opacity-80">Salidas de dinero de caja.</p></div>
                    <button onClick={() => { setEgresoForm({id:'', descripcion:'', monto:''}); setShowEgresoModal(true); }} className="bg-red-600 text-white px-6 py-3 rounded-xl hover:bg-red-700 shadow-lg flex items-center gap-2 font-black text-xs transition-all active:scale-95"><ArrowDownCircle size={18}/> Nuevo Gasto</button>
                  </div>
                  <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 flex justify-between items-center">
                    <div><h3 className="font-black text-blue-800 text-sm uppercase">Compra de Saldo</h3><p className="text-xs text-blue-600 opacity-80">Reabastecer saldo Tigo/Claro.</p></div>
                    <button onClick={() => { setSaldoForm({red: 'TIGO', montoPagado: '', saldoRecibido: ''}); setShowSaldoModal(true); }} className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 shadow-lg flex items-center gap-2 font-black text-xs transition-all active:scale-95"><Wallet size={18}/> Comprar Saldo</button>
                  </div>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-black tracking-widest border-b"><tr><th className="p-4">DESCRIPCIÓN</th><th className="p-4">MONTO</th><th className="p-4 text-right">ACCIONES</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {egresos.length === 0 ? <tr><td colSpan={3} className="p-10 text-center text-slate-400 italic">No hay egresos hoy.</td></tr> : egresos.map(e => (
                        <tr key={e.idegresos} className="hover:bg-slate-50">
                            <td className="p-4 font-bold text-slate-700 uppercase">{e.descripcion}</td>
                            <td className="p-4 font-black text-red-600">L. {Number(e.monto).toFixed(2)}</td>
                            <td className="p-4 text-right flex justify-end gap-2">
                                <button className="p-2 text-blue-400 hover:bg-blue-50 rounded-lg"><Edit2 size={16}/></button>
                                <button onClick={() => handleDeleteItem(e.idegresos, 'EGRESO')} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
              </table>
           </div>
         )}

         {/* TAB: RECARGAS */}
         {activeTab === 'RECARGAS' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {['TIGO', 'CLARO'].map(red => {
                    const sld = saldos.find(s => s.red === red);
                    return (
                        <div key={red} className={`rounded-2xl border-2 overflow-hidden bg-white shadow-xl ${red === 'TIGO' ? 'border-blue-500' : 'border-red-500'}`}>
                            <div className={`${red === 'TIGO' ? 'bg-blue-600' : 'bg-red-600'} p-4 flex justify-between items-center text-white`}>
                                <h3 className="font-black text-lg tracking-tighter">{red}</h3>
                                <p className="text-xs font-bold bg-white/20 px-3 py-1 rounded-lg">Saldo: {sld?.saldoFinal || 0}</p>
                            </div>
                            <div className="p-6 space-y-4">
                                <button onClick={() => setShowRecargaModal({ red: red as any, tipo: 'RECARGA' })} className="w-full py-6 rounded-xl border-2 border-slate-100 hover:bg-slate-50 font-black text-slate-600 flex flex-col items-center gap-2 transition-all">
                                    <Smartphone size={24}/> RECARGA NORMAL
                                </button>
                                <button onClick={() => setShowRecargaModal({ red: red as any, tipo: 'PAQUETE' })} className="w-full py-6 rounded-xl border-2 border-slate-100 hover:bg-slate-50 font-black text-slate-600 flex flex-col items-center gap-2 transition-all">
                                    <FileText size={24}/> PAQUETES
                                </button>
                            </div>
                        </div>
                    );
                })}
             </div>
         )}

         {/* TAB: HISTORIAL */}
         {activeTab === 'HISTORIAL' && (
           <div className="space-y-6">
              <div className="flex justify-between items-center">
                 <h3 className="font-black text-slate-800 text-sm uppercase">Historial Ventas POS (Hoy)</h3>
                 <div className="flex gap-2">
                    <button onClick={() => generateDailyReport(true)} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-indigo-100 transition-all"><Download size={16}/> Reporte Full</button>
                    <button onClick={() => generateDailyReport(false)} className="bg-slate-50 text-slate-600 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-slate-100 transition-all"><Download size={16}/> Sin Recargas</button>
                 </div>
              </div>
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-slate-500 uppercase font-black border-b"><tr><th className="p-4">FACTURA</th><th className="p-4">CLIENTE</th><th className="p-4">TOTAL</th><th className="p-4">ESTADO</th><th className="p-4 text-right">ACCIÓN</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {ventas.length === 0 ? <tr><td colSpan={5} className="p-10 text-center text-slate-400 italic">No hay ventas registradas hoy.</td></tr> : ventas.map(v => (
                        <tr key={v.codVenta} className={`hover:bg-slate-50 ${v.estado === 'Anulada' ? 'opacity-40' : ''}`}>
                            <td className="p-4 font-bold text-slate-800">{v.codVenta}</td>
                            <td className="p-4 text-slate-600 font-medium">{v.nombreCliente}</td>
                            <td className="p-4 font-black text-slate-800">L. {Number(v.total).toFixed(2)}</td>
                            <td className="p-4"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.estado === 'Completada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{v.estado}</span></td>
                            <td className="p-4 text-right flex justify-end gap-2">
                                <button className="px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg font-bold hover:bg-indigo-50 flex items-center gap-1"><Edit2 size={12}/> EDITAR</button>
                                <button className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg font-bold hover:bg-red-50 flex items-center gap-1"><X size={12}/> ANULAR</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
              </table>
           </div>
         )}
      </div>
      </div>

      {/* --- MODALS RESTORATION --- */}
      
      {showIngresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-2xl p-8 shadow-2xl animate-fade-in">
               <h3 className="font-black text-lg text-slate-800 mb-6">Registrar Ingreso</h3>
               <div className="space-y-4">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción</label><input className="w-full p-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold" value={ingresoForm.descripcion} onChange={e => setIngresoForm({...ingresoForm, descripcion: e.target.value})} placeholder="Producto/Servicio" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Precio Venta</label><input type="number" className="w-full p-3 bg-slate-50 border rounded-xl font-black text-slate-700" value={ingresoForm.monto} onChange={e => setIngresoForm({...ingresoForm, monto: e.target.value})} placeholder="0.00" /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Costo</label><input type="number" className="w-full p-3 bg-slate-50 border rounded-xl font-bold" value={ingresoForm.costo} onChange={e => setIngresoForm({...ingresoForm, costo: e.target.value})} placeholder="0.00" /></div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer" onClick={() => setIngresoForm({...ingresoForm, irAPos: !ingresoForm.irAPos})}>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${ingresoForm.irAPos ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>{ingresoForm.irAPos && <CheckCircle size={14} className="text-white"/>}</div>
                      <div className="flex flex-col"><span className="text-xs font-bold text-slate-700">Facturar en Punto de Venta</span><span className="text-[10px] text-slate-400">Genera ticket formal</span></div>
                  </div>
               </div>
               <div className="flex gap-3 mt-8">
                   <button onClick={() => setShowIngresoModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-xl">Cancelar</button>
                   <button onClick={handleIngresoAction} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20">Guardar</button>
               </div>
            </div>
         </div>
      )}

      {showEgresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-2xl p-8 shadow-2xl animate-fade-in">
               <h3 className="font-black text-lg text-slate-800 mb-6">Registrar Gasto</h3>
               <div className="space-y-4">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción del gasto</label><input className="w-full p-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-red-500/20 font-bold" value={egresoForm.descripcion} onChange={e => setEgresoForm({...egresoForm, descripcion: e.target.value})} /></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Monto</label><input type="number" className="w-full p-3 bg-slate-50 border rounded-xl font-black text-slate-700" value={egresoForm.monto} onChange={e => setEgresoForm({...egresoForm, monto: e.target.value})} placeholder="0.00" /></div>
               </div>
               <div className="flex gap-3 mt-8">
                   <button onClick={() => setShowEgresoModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-xl">Cancelar</button>
                   <button onClick={handleEgresoAction} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-600/20">Guardar</button>
               </div>
            </div>
         </div>
      )}

      {showSaldoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-2xl p-8 shadow-2xl border-t-8 border-indigo-600">
               <div className="flex justify-between items-center mb-6">
                   <h3 className="font-black text-lg text-slate-800">Comprar Saldo</h3>
                   <button onClick={() => setShowSaldoModal(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
               </div>
               <div className="space-y-4">
                  <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Red</label>
                      <select className="w-full p-3 bg-slate-50 border rounded-xl font-bold" value={saldoForm.red} onChange={e => setSaldoForm({...saldoForm, red: e.target.value as any})}>
                          <option value="TIGO">TIGO</option>
                          <option value="CLARO">CLARO</option>
                      </select>
                  </div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">DINERO PAGADO (EGRESO)</label><input className="w-full p-3 bg-slate-50 border rounded-xl font-black text-lg" placeholder="L. Pagados" value={saldoForm.montoPagado} onChange={e => setSaldoForm({...saldoForm, montoPagado: e.target.value})} /></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">SALDO RECIBIDO</label><input className="w-full p-3 bg-slate-50 border rounded-xl font-black text-lg" placeholder="Saldo Recibido" value={saldoForm.saldoRecibido} onChange={e => setSaldoForm({...saldoForm, saldoRecibido: e.target.value})} /></div>
               </div>
               <button onClick={handleBuySaldo} className="w-full mt-8 py-4 bg-indigo-600 text-white font-black rounded-xl shadow-xl shadow-indigo-600/20 uppercase tracking-widest text-xs">Registrar Compra</button>
            </div>
         </div>
      )}

      {showRecargaModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-2xl p-8 shadow-2xl">
               <div className="flex justify-between items-center mb-6">
                   <h3 className="font-black text-lg text-slate-800 uppercase tracking-tight">{showRecargaModal.tipo === 'RECARGA' ? `Recarga Normal ${showRecargaModal.red}` : `Paquete ${showRecargaModal.red}`}</h3>
                   <button onClick={() => setShowRecargaModal(null)}><X size={24}/></button>
               </div>
               <div className="space-y-4">
                  {showRecargaModal.tipo === 'RECARGA' ? (
                      <div><label className="text-[10px] font-black text-slate-400 uppercase mb-4 block text-center">MONTO RECARGA L.</label><input type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none text-4xl font-black text-center text-indigo-600" value={recargaForm.monto} onChange={e => setRecargaForm({...recargaForm, monto: e.target.value})} autoFocus /></div>
                  ) : (
                      <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Seleccione el Paquete</label><select className="w-full p-4 bg-slate-50 border rounded-xl font-black text-xs" value={recargaForm.paqueteId} onChange={e => setRecargaForm({...recargaForm, paqueteId: e.target.value})}><option value="">-- SELECCIONAR --</option>{paquetes.filter(p => p.red === showRecargaModal.red).map(p => (<option key={p.idPaquete} value={p.idPaquete}>{p.nombre} - L. {p.precio}</option>))}</select></div>
                  )}
               </div>
               <button onClick={handleRecargaAction} className={`w-full mt-8 py-4 text-white font-black rounded-xl shadow-xl uppercase tracking-widest text-xs transition-all active:scale-95 ${showRecargaModal.red === 'TIGO' ? 'bg-blue-600 shadow-blue-600/20' : 'bg-red-600 shadow-red-600/20'}`}>PROCESAR VENTA</button>
            </div>
         </div>
      )}
    </div>
  );
};

export default CashRegister;
