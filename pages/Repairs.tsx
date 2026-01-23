
import React, { useState, useEffect } from 'react';
import { RepairService } from '../services/api';
import { Reparacion } from '../types';
// Add missing FileText import from lucide-react
import { 
  Wrench, PlusCircle, Search, Clock, CheckCircle, Package, DollarSign, User, Smartphone, X, Save, RefreshCw, AlertCircle, FileText
} from 'lucide-react';
import Swal from 'sweetalert2';

const Repairs: React.FC = () => {
  const [repairs, setRepairs] = useState<Reparacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Reparacion>>({
      estado_reparacion: 'Pendiente',
      pago_tecnico_estado: 'Pendiente'
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await RepairService.getAll();
      setRepairs(data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        await RepairService.create(form);
        setShowModal(false);
        loadData();
        Swal.fire('Éxito', 'Orden de servicio creada', 'success');
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const updateStatus = async (id: number, currentStatus: string) => {
    const { value: newStatus } = await Swal.fire({
      title: 'Cambiar Estado',
      input: 'select',
      inputOptions: {
        'Pendiente': 'Pendiente',
        'En Taller': 'En Taller',
        'Listo': 'Listo',
        'Entregado': 'Entregado'
      },
      inputValue: currentStatus,
      showCancelButton: true
    });

    if (newStatus) {
      try {
        await RepairService.updateStatus(id, newStatus);
        loadData();
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
    }
  };

  const payTechnician = async (id: number) => {
      const result = await Swal.fire({
          title: '¿Marcar como Pagado?',
          text: 'Se registrará un egreso de caja con el costo del técnico.',
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Sí, Pagar'
      });

      if (result.isConfirmed) {
          try {
              await RepairService.payTechnician(id);
              loadData();
              Swal.fire('Pagado', 'Gasto registrado en caja.', 'success');
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const filtered = repairs.filter(r => 
      r.marca_modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.nombre_tecnico.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.imei_equipo?.includes(searchTerm)
  );

  return (
    <div className="space-y-6 animate-fade-in h-full flex flex-col">
        <div className="flex flex-col md:flex-row justify-between items-end gap-4">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Wrench className="text-indigo-600"/> Gestión de Reparaciones
                </h2>
                <p className="text-slate-500 text-sm">Control de órdenes de servicio y pagos a terceros.</p>
            </div>
            <button onClick={() => setShowModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-indigo-600/20 transition-all">
                <PlusCircle size={20}/> Nueva Orden
            </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-slate-50 flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Buscar por equipo, técnico o IMEI..." className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg border border-slate-200 bg-white">
                    <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="flex-1 overflow-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase sticky top-0 z-10">
                        <tr>
                            <th className="p-4">Equipo / IMEI</th>
                            <th className="p-4">Técnico</th>
                            <th className="p-4">Estado Taller</th>
                            <th className="p-4 text-right">Precios</th>
                            <th className="p-4 text-center">Pago Técnico</th>
                            <th className="p-4 text-right">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.map(r => (
                            <tr key={r.id_reparacion} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4">
                                    <p className="font-bold text-slate-800">{r.marca_modelo}</p>
                                    <p className="text-[10px] font-mono text-slate-400">{r.imei_equipo || 'N/A'}</p>
                                </td>
                                <td className="p-4 text-sm text-slate-600">{r.nombre_tecnico}</td>
                                <td className="p-4">
                                    <button onClick={() => updateStatus(r.id_reparacion, r.estado_reparacion)} className={`px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 ${r.estado_reparacion === 'Entregado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {r.estado_reparacion === 'Entregado' ? <CheckCircle size={12}/> : <Clock size={12}/>}
                                        {r.estado_reparacion}
                                    </button>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="text-xs">
                                        <p className="text-slate-400">Cliente: <span className="font-bold text-slate-800">L. {Number(r.precio_cliente).toFixed(2)}</span></p>
                                        <p className="text-slate-400">Técnico: <span className="font-bold text-slate-800">L. {Number(r.costo_tecnico).toFixed(2)}</span></p>
                                    </div>
                                </td>
                                <td className="p-4 text-center">
                                    {r.pago_tecnico_estado === 'Pagado' ? (
                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">LIQUIDADO</span>
                                    ) : (
                                        <button onClick={() => payTechnician(r.id_reparacion)} className="text-[10px] font-black text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-50 transition-all">PAGAR AHORA</button>
                                    )}
                                </td>
                                <td className="p-4 text-right">
                                    <button className="text-slate-400 hover:text-indigo-600"><FileText size={18}/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {showModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
                    <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                        <h3 className="text-xl font-bold">Nueva Orden de Servicio</h3>
                        <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X/></button>
                    </div>
                    <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-[10px] font-black text-slate-400 uppercase">Marca/Modelo</label><input required className="w-full p-3 border rounded-xl" value={form.marca_modelo || ''} onChange={e => setForm({...form, marca_modelo: e.target.value})} placeholder="Ej: Samsung S23" /></div>
                            <div><label className="text-[10px] font-black text-slate-400 uppercase">IMEI / Serie</label><input className="w-full p-3 border rounded-xl font-mono" value={form.imei_equipo || ''} onChange={e => setForm({...form, imei_equipo: e.target.value})} placeholder="0000..." /></div>
                        </div>
                        <div><label className="text-[10px] font-black text-slate-400 uppercase">Falla Reportada</label><textarea required className="w-full p-3 border rounded-xl" value={form.descripcion_falla || ''} onChange={e => setForm({...form, descripcion_falla: e.target.value})} rows={2} /></div>
                        <div><label className="text-[10px] font-black text-slate-400 uppercase">Técnico Asignado</label><input required className="w-full p-3 border rounded-xl" value={form.nombre_tecnico || ''} onChange={e => setForm({...form, nombre_tecnico: e.target.value})} placeholder="Nombre del taller o técnico" /></div>
                        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div><label className="text-[10px] font-black text-slate-400 uppercase">Lo que COBRAMOS</label><input type="number" required className="w-full p-3 border border-indigo-200 rounded-xl font-bold text-indigo-700" value={form.precio_cliente || ''} onChange={e => setForm({...form, precio_cliente: Number(e.target.value)})} /></div>
                            <div><label className="text-[10px] font-black text-slate-400 uppercase">Lo que el TECNICO nos COBRA</label><input type="number" required className="w-full p-3 border border-red-200 rounded-xl font-bold text-red-700" value={form.costo_tecnico || ''} onChange={e => setForm({...form, costo_tecnico: Number(e.target.value)})} /></div>
                        </div>
                        <div><label className="text-[10px] font-black text-slate-400 uppercase">Entrega Estimada</label><input type="date" className="w-full p-3 border rounded-xl" value={form.fecha_entrega_estimada || ''} onChange={e => setForm({...form, fecha_entrega_estimada: e.target.value})} /></div>
                        <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"><Save size={18}/> CREAR ORDEN</button>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};

export default Repairs;
