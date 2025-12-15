
import React, { useState, useEffect } from 'react';
import { AccountingService } from '../services/api';
import { Socio, GastoContable, ReporteFinanciero } from '../types';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend 
} from 'recharts';
import { 
  Users, DollarSign, TrendingUp, Calculator, Plus, Edit2, Trash2, Calendar, FileText, ArrowRight, Wallet, Building2, User 
} from 'lucide-react';
import Swal from 'sweetalert2';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const Accounting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'SOCIOS' | 'GASTOS' | 'REPARTO'>('DASHBOARD');
  const [loading, setLoading] = useState(false);
  
  // Data States
  const [socios, setSocios] = useState<Socio[]>([]);
  const [gastos, setGastos] = useState<GastoContable[]>([]);
  const [reporte, setReporte] = useState<ReporteFinanciero | null>(null);
  
  // Filters & Forms
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  
  const [socioForm, setSocioForm] = useState<Partial<Socio>>({ estado: 'Activo' });
  const [gastoForm, setGastoForm] = useState<Partial<GastoContable>>({ categoria: 'Operativo', origenFondo: 'Caja', fecha: new Date().toISOString().split('T')[0] });
  
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab, month, year]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'SOCIOS') {
        const data = await AccountingService.getSocios();
        setSocios(data);
      } else if (activeTab === 'GASTOS') {
        // Load for selected month
        const start = `${year}-${String(month).padStart(2,'0')}-01`;
        const end = `${year}-${String(month).padStart(2,'0')}-31`;
        const [gData, sData] = await Promise.all([
            AccountingService.getGastosContables(start, end),
            AccountingService.getSocios() // Need socios for dropdown
        ]);
        setGastos(gData);
        setSocios(sData);
      } else if (activeTab === 'REPARTO' || activeTab === 'DASHBOARD') {
        const rep = await AccountingService.getFinancialReport(month, year);
        setReporte(rep);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // --- SOCIOS CRUD ---
  const handleSocioSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          if (isEditing && editingId) await AccountingService.updateSocio(editingId, socioForm);
          else await AccountingService.createSocio(socioForm);
          setShowModal(false);
          loadData();
          Swal.fire('Guardado', 'Socio registrado correctamente', 'success');
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleSocioDelete = async (id: number) => {
      const r = await Swal.fire({ title: '¿Eliminar socio?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí' });
      if (r.isConfirmed) {
          await AccountingService.deleteSocio(id);
          loadData();
      }
  };

  // --- GASTOS CRUD ---
  const handleGastoSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          // Convert string "null" to real null
          const payload = { ...gastoForm, idSocioAsignado: gastoForm.idSocioAsignado ? Number(gastoForm.idSocioAsignado) : null };
          
          if (isEditing && editingId) await AccountingService.updateGastoContable(editingId, payload);
          else await AccountingService.createGastoContable(payload);
          setShowModal(false);
          loadData();
          Swal.fire('Guardado', 'Gasto registrado correctamente', 'success');
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleGastoDelete = async (id: number) => {
      const r = await Swal.fire({ title: '¿Eliminar gasto?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí' });
      if (r.isConfirmed) {
          await AccountingService.deleteGastoContable(id);
          loadData();
      }
  };

  const openModal = (type: 'SOCIO'|'GASTO', item?: any) => {
      setIsEditing(!!item);
      setEditingId(item ? (item.idSocio || item.idGasto) : null);
      if (type === 'SOCIO') setSocioForm(item || { estado: 'Activo' });
      else setGastoForm(item || { categoria: 'Operativo', origenFondo: 'Caja', fecha: new Date().toISOString().split('T')[0] });
      setShowModal(true);
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
        {/* Header & Tabs */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Calculator className="text-indigo-600"/> Contabilidad Gerencial
                </h2>
                <p className="text-slate-500 text-sm">Control financiero, socios y utilidades.</p>
            </div>
            <div className="flex gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                {[
                    { id: 'DASHBOARD', label: 'Resumen', icon: <TrendingUp size={16}/> },
                    { id: 'SOCIOS', label: 'Socios', icon: <Users size={16}/> },
                    { id: 'GASTOS', label: 'Gastos', icon: <Wallet size={16}/> },
                    { id: 'REPARTO', label: 'Reparto', icon: <DollarSign size={16}/> },
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>
        </div>

        {/* Global Filters (Month/Year) */}
        {(activeTab === 'DASHBOARD' || activeTab === 'REPARTO' || activeTab === 'GASTOS') && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex gap-4 items-center">
                <Calendar size={20} className="text-slate-400"/>
                <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-slate-50 border rounded-lg p-2 text-sm font-bold text-slate-700">
                    {Array.from({length:12}, (_,i)=>i+1).map(m => <option key={m} value={m}>{new Date(0, m-1).toLocaleString('es',{month:'long'})}</option>)}
                </select>
                <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-slate-50 border rounded-lg p-2 text-sm font-bold text-slate-700">
                    {[2023,2024,2025].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>
        )}

        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col p-6">
            
            {/* --- DASHBOARD TAB --- */}
            {activeTab === 'DASHBOARD' && reporte && (
                <div className="space-y-8 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                            <p className="text-xs text-emerald-600 font-bold uppercase mb-1">Ventas Totales</p>
                            <p className="text-2xl font-bold text-emerald-800">L. {reporte.ingresosVentas.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                            <p className="text-xs text-blue-600 font-bold uppercase mb-1">Costo Ventas</p>
                            <p className="text-2xl font-bold text-blue-800">L. {reporte.costoVentas.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                            <p className="text-xs text-orange-600 font-bold uppercase mb-1">Utilidad Bruta</p>
                            <p className="text-2xl font-bold text-orange-800">L. {reporte.utilidadBruta.toLocaleString()}</p>
                        </div>
                        <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                            <p className="text-xs text-indigo-600 font-bold uppercase mb-1">Utilidad Neta</p>
                            <p className="text-2xl font-bold text-indigo-800">L. {reporte.utilidadNeta.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="h-80 w-full mt-8">
                        <h3 className="font-bold text-slate-800 mb-4">Estado de Resultados (Waterfall)</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={[
                                    { name: 'Ventas', value: reporte.ingresosVentas, fill: '#10b981' },
                                    { name: 'Costos (-)', value: reporte.costoVentas, fill: '#ef4444' },
                                    { name: 'Margen Bruto', value: reporte.utilidadBruta, fill: '#f59e0b' },
                                    { name: 'Gastos Op. (-)', value: reporte.gastosOperativos, fill: '#ef4444' },
                                    { name: 'Utilidad Neta', value: reporte.utilidadNeta, fill: '#4f46e5' }
                                ]}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                                <XAxis dataKey="name" axisLine={false} tickLine={false}/>
                                <YAxis axisLine={false} tickLine={false}/>
                                <Tooltip cursor={{fill: 'transparent'}}/>
                                <Bar dataKey="value" radius={[4,4,0,0]} barSize={50}>
                                    {
                                        [0,1,2,3,4].map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={
                                                index === 0 ? '#10b981' : 
                                                index === 1 || index === 3 ? '#ef4444' : 
                                                index === 2 ? '#f59e0b' : '#4f46e5'
                                            } />
                                        ))
                                    }
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* --- SOCIOS TAB --- */}
            {activeTab === 'SOCIOS' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-slate-800">Directorio de Socios</h3>
                        <button onClick={() => openModal('SOCIO')} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm"><Plus size={16}/> Agregar Socio</button>
                    </div>
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase"><tr><th className="p-3">Nombre</th><th className="p-3">Participación</th><th className="p-3">Estado</th><th className="p-3 text-right">Acciones</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                            {socios.map(s => (
                                <tr key={s.idSocio}>
                                    <td className="p-3 font-bold text-slate-700">{s.nombre}</td>
                                    <td className="p-3">{s.porcentajeParticipacion}%</td>
                                    <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold ${s.estado==='Activo'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{s.estado}</span></td>
                                    <td className="p-3 text-right flex justify-end gap-2">
                                        <button onClick={() => openModal('SOCIO', s)} className="text-blue-500 p-1"><Edit2 size={16}/></button>
                                        <button onClick={() => handleSocioDelete(s.idSocio)} className="text-red-500 p-1"><Trash2 size={16}/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* --- GASTOS TAB --- */}
            {activeTab === 'GASTOS' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-slate-800">Registro de Gastos Contables</h3>
                        <button onClick={() => openModal('GASTO')} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm"><Plus size={16}/> Registrar Gasto</button>
                    </div>
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase"><tr><th className="p-3">Fecha</th><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3">Asignado A</th><th className="p-3">Fondo</th><th className="p-3 text-right">Acciones</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                            {gastos.map(g => (
                                <tr key={g.idGasto} className="hover:bg-slate-50 text-sm">
                                    <td className="p-3 text-slate-500 font-mono">{g.fecha}</td>
                                    <td className="p-3 font-bold text-slate-700">{g.descripcion}</td>
                                    <td className="p-3 font-bold text-red-600">L. {Number(g.monto).toLocaleString()}</td>
                                    <td className="p-3">
                                        {g.idSocioAsignado ? (
                                            <span className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit"><User size={12}/> {g.nombreSocio}</span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded w-fit"><Building2 size={12}/> Empresa</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-xs">{g.origenFondo}</td>
                                    <td className="p-3 text-right flex justify-end gap-2">
                                        <button onClick={() => openModal('GASTO', g)} className="text-blue-500 p-1"><Edit2 size={16}/></button>
                                        <button onClick={() => handleGastoDelete(g.idGasto)} className="text-red-500 p-1"><Trash2 size={16}/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* --- REPARTO TAB --- */}
            {activeTab === 'REPARTO' && reporte && (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-lg flex justify-between items-center">
                        <div>
                            <p className="text-indigo-200 text-xs font-bold uppercase mb-1">Utilidad Neta a Repartir</p>
                            <h3 className="text-3xl font-bold">L. {reporte.utilidadNeta.toLocaleString()}</h3>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-medium opacity-80">Periodo: {reporte.periodo}</p>
                        </div>
                    </div>

                    <h3 className="font-bold text-slate-800 border-b pb-2">Distribución por Socio</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {reporte.distribucion.map((d, idx) => (
                            <div key={idx} className="border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-4">
                                    <h4 className="font-bold text-lg text-slate-800">{d.socio}</h4>
                                    <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold text-xs">{d.porcentaje}% Part.</span>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between text-slate-600">
                                        <span>Utilidad Bruta Corresp.:</span>
                                        <span className="font-bold">L. {d.utilidadCorrespondiente.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-red-500">
                                        <span>(-) Gastos Personales / Adelantos:</span>
                                        <span className="font-bold">- L. {d.gastosPersonalesDeducidos.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between border-t pt-2 mt-2">
                                        <span className="font-bold text-slate-800">A PAGAR:</span>
                                        <span className="font-bold text-xl text-emerald-600">L. {d.pagoFinal.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {/* MODAL FORM */}
        {showModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl animate-fade-in">
                    <h3 className="text-lg font-bold mb-4">{isEditing ? 'Editar' : 'Registrar'} {activeTab === 'SOCIOS' ? 'Socio' : 'Gasto'}</h3>
                    <form onSubmit={activeTab === 'SOCIOS' ? handleSocioSubmit : handleGastoSubmit} className="space-y-4">
                        {activeTab === 'SOCIOS' ? (
                            <>
                                <input required className="w-full p-2 border rounded" placeholder="Nombre Completo" value={socioForm.nombre || ''} onChange={e=>setSocioForm({...socioForm, nombre:e.target.value})}/>
                                <input required type="number" step="0.01" className="w-full p-2 border rounded" placeholder="% Participación (0-100)" value={socioForm.porcentajeParticipacion || ''} onChange={e=>setSocioForm({...socioForm, porcentajeParticipacion: Number(e.target.value)})}/>
                                <select className="w-full p-2 border rounded" value={socioForm.estado} onChange={e=>setSocioForm({...socioForm, estado: e.target.value as any})}><option value="Activo">Activo</option><option value="Inactivo">Inactivo</option></select>
                            </>
                        ) : (
                            <>
                                <input required type="date" className="w-full p-2 border rounded" value={gastoForm.fecha} onChange={e=>setGastoForm({...gastoForm, fecha:e.target.value})}/>
                                <input required className="w-full p-2 border rounded" placeholder="Descripción del Gasto" value={gastoForm.descripcion || ''} onChange={e=>setGastoForm({...gastoForm, descripcion:e.target.value})}/>
                                <input required type="number" className="w-full p-2 border rounded font-bold" placeholder="Monto" value={gastoForm.monto || ''} onChange={e=>setGastoForm({...gastoForm, monto: Number(e.target.value)})}/>
                                
                                <div>
                                    <label className="text-xs font-bold uppercase text-slate-500">Asignar A:</label>
                                    <select className="w-full p-2 border rounded mt-1" value={gastoForm.idSocioAsignado || ''} onChange={e=>setGastoForm({...gastoForm, idSocioAsignado: e.target.value ? Number(e.target.value) : null})}>
                                        <option value="">Empresa (Gasto General)</option>
                                        {socios.map(s => <option key={s.idSocio} value={s.idSocio}>{s.nombre} (Personal)</option>)}
                                    </select>
                                </div>
                                <select className="w-full p-2 border rounded" value={gastoForm.categoria} onChange={e=>setGastoForm({...gastoForm, categoria: e.target.value as any})}>
                                    <option value="Operativo">Operativo</option><option value="Administrativo">Administrativo</option><option value="Ventas">Ventas</option><option value="Personal">Personal</option>
                                </select>
                                <select className="w-full p-2 border rounded" value={gastoForm.origenFondo} onChange={e=>setGastoForm({...gastoForm, origenFondo: e.target.value as any})}>
                                    <option value="Caja">Caja Chica</option><option value="Banco">Banco</option><option value="Tarjeta">Tarjeta Crédito</option>
                                </select>
                            </>
                        )}
                        <div className="flex gap-2 pt-2">
                            <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-slate-100 p-2 rounded text-slate-600 font-bold">Cancelar</button>
                            <button type="submit" className="flex-1 bg-indigo-600 p-2 rounded text-white font-bold">Guardar</button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};

export default Accounting;
