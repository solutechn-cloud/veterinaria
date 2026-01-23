
import React, { useState, useEffect } from 'react';
import { ConsignService, InventoryService } from '../services/api';
import { Consignacion, ProductoUnified } from '../types';
import { 
  Hand, PlusCircle, Search, Store, ShoppingCart, RefreshCcw, X, Save, RefreshCw, AlertTriangle, ArrowRightCircle
} from 'lucide-react';
import Swal from 'sweetalert2';

const Consignments: React.FC = () => {
  const [consignments, setConsignments] = useState<Consignacion[]>([]);
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Consignacion>>({
      tipo_producto: 'TELEFONO',
      cantidad_prestada: 1
  });

  useEffect(() => { loadData(); loadProducts(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await ConsignService.getAll();
      setConsignments(data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const loadProducts = async () => {
      try {
          const data = await InventoryService.getUnifiedProducts();
          setProducts(data || []);
      } catch (e) { console.error(e); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        await ConsignService.create(form);
        setShowModal(false);
        loadData();
        loadProducts();
        Swal.fire('En Consignación', 'Producto registrado fuera de tienda.', 'success');
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleLiquidate = async (id: number) => {
      const result = await Swal.fire({
          title: '¿Confirmar Pago?',
          text: 'Se registrará el ingreso por el precio especial y se dará salida oficial al stock.',
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Sí, Liquidar'
      });

      if (result.isConfirmed) {
          try {
              await ConsignService.liquidate(id);
              loadData();
              Swal.fire('Vendido', 'Ingreso registrado en caja.', 'success');
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const handleReturn = async (id: number) => {
      const result = await Swal.fire({
          title: '¿Retornar a Stock?',
          text: 'El producto volverá a estar disponible en el inventario local.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Confirmar Retorno'
      });

      if (result.isConfirmed) {
          try {
              await ConsignService.returnToStock(id);
              loadData();
              loadProducts();
              Swal.fire('Retornado', 'Producto reingresado.', 'success');
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const filtered = consignments.filter(c => 
      c.negocio_destino.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.nombre_producto?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in h-full flex flex-col">
        <div className="flex flex-col md:flex-row justify-between items-end gap-4">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Hand className="text-orange-600"/> Consignaciones
                </h2>
                <p className="text-slate-500 text-sm">Inventario prestado a otros negocios y liquidaciones.</p>
            </div>
            <button onClick={() => setShowModal(true)} className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-orange-600/20 transition-all">
                <PlusCircle size={20}/> Prestar Producto
            </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-slate-50 flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Buscar por negocio o producto..." className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg border border-slate-200 bg-white">
                    <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="flex-1 overflow-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase sticky top-0 z-10">
                        <tr>
                            <th className="p-4">Negocio Destino</th>
                            <th className="p-4">Producto</th>
                            <th className="p-4">Precio Rebajado</th>
                            <th className="p-4">Estado</th>
                            <th className="p-4">Fecha Salida</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.map(c => (
                            <tr key={c.id_consignacion} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Store size={18}/></div>
                                        <span className="font-bold text-slate-800">{c.negocio_destino}</span>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <p className="text-sm font-medium">{c.nombre_producto}</p>
                                    <p className="text-[10px] text-slate-400">{c.cantidad_prestada} unidad(es)</p>
                                </td>
                                <td className="p-4 font-bold text-emerald-600">L. {Number(c.precio_especial_pago).toFixed(2)}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${c.estado_consignacion === 'Vendido_Pagado' ? 'bg-emerald-100 text-emerald-700' : c.estado_consignacion === 'Devuelto' ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-orange-700'}`}>
                                        {c.estado_consignacion.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="p-4 text-xs text-slate-400">{new Date(c.fecha_salida).toLocaleDateString()}</td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        {c.estado_consignacion === 'Prestado' && (
                                            <>
                                                <button onClick={() => handleLiquidate(c.id_consignacion)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/10"><ShoppingCart size={14}/> COBRAR</button>
                                                <button onClick={() => handleReturn(c.id_consignacion)} className="bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-slate-300 transition-all"><RefreshCcw size={14}/> RETORNAR</button>
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

        {showModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in flex flex-col">
                    <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                        <h3 className="text-xl font-bold">Nueva Consignación</h3>
                        <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X/></button>
                    </div>
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase">Negocio Destino</label>
                            <input required className="w-full p-3 border rounded-xl" value={form.negocio_destino || ''} onChange={e => setForm({...form, negocio_destino: e.target.value})} placeholder="Ej: Tienda Variedades" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase">Producto a Prestar</label>
                            <select required className="w-full p-3 border rounded-xl" value={form.id_producto || ''} onChange={e => {
                                const prod = products.find(p => p.id === e.target.value);
                                setForm({...form, id_producto: e.target.value, tipo_producto: prod?.tipo === 'TELEFONO' ? 'TELEFONO' : 'ACCESORIO'});
                            }}>
                                <option value="">-- Seleccionar --</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.nombre} (Stock: {p.stock})</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-[10px] font-black text-slate-400 uppercase">Cantidad</label><input type="number" disabled={form.tipo_producto === 'TELEFONO'} className="w-full p-3 border rounded-xl disabled:bg-slate-50" value={form.cantidad_prestada || ''} onChange={e => setForm({...form, cantidad_prestada: Number(e.target.value)})} /></div>
                            <div><label className="text-[10px] font-black text-slate-400 uppercase">Precio Rebajado</label><input type="number" required className="w-full p-3 border rounded-xl font-bold text-emerald-600" value={form.precio_especial_pago || ''} onChange={e => setForm({...form, precio_especial_pago: Number(e.target.value)})} /></div>
                        </div>
                        <div className="p-3 bg-orange-50 border border-orange-100 rounded-xl flex items-start gap-2">
                            <AlertTriangle size={20} className="text-orange-500 shrink-0"/>
                            <p className="text-[10px] text-orange-700 font-medium">Este producto saldrá de tu stock actual inmediatamente. Se considerará "Venta" hasta que lo liquides.</p>
                        </div>
                        <button type="submit" className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black shadow-xl hover:bg-orange-700 transition-all flex items-center justify-center gap-2"><ArrowRightCircle size={18}/> REGISTRAR SALIDA</button>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};

export default Consignments;
