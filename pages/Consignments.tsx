
import React, { useState, useEffect, useMemo } from 'react';
import { ConsignService, InventoryService } from '../services/api';
import { Consignacion, ProductoUnified } from '../types';
import { 
  Hand, PlusCircle, Search, Store, ShoppingCart, RefreshCcw, X, Save, RefreshCw, AlertTriangle, ArrowRightCircle, Trash2, Edit2, Filter, Package, Smartphone, Layers, Check, Minus, Plus
} from 'lucide-react';
import Swal from 'sweetalert2';
import * as ReactRouterDOM from 'react-router-dom';
const { useLocation } = ReactRouterDOM as any;

const Consignments: React.FC = () => {
  const location = useLocation();
  const [consignments, setConsignments] = useState<Consignacion[]>([]);
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal & Flow State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  
  // Selection / Cart State
  const [cart, setCart] = useState<{product: ProductoUnified, qty: number, specialPrice: number}[]>([]);
  const [businessName, setBusinessName] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Catalog Filtering
  const [catSearch, setCatSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'TELEFONO' | 'ACCESORIO'>('ALL');

  useEffect(() => { 
    loadData(); 
    loadProducts();
    // Handle redirect from Inventory
    if (location.state?.consignItem) {
        const item = location.state.consignItem;
        addToCart(item);
        setShowModal(true);
    }
  }, [location.state]);

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

  const addToCart = (p: ProductoUnified) => {
      const exists = cart.find(c => c.product.id === p.id);
      if (exists) {
          if (p.tipo === 'TELEFONO') return;
          if (exists.qty + 1 > p.stock) return Swal.fire('Stock Insuficiente', '', 'warning');
          setCart(cart.map(c => c.product.id === p.id ? {...c, qty: c.qty + 1} : c));
      } else {
          setCart([...cart, { product: p, qty: 1, specialPrice: p.precioVenta }]);
      }
  };

  const removeFromCart = (id: string) => setCart(cart.filter(c => c.product.id !== id));
  
  const updateCartItem = (id: string, updates: any) => {
      setCart(cart.map(c => c.product.id === id ? {...c, ...updates} : c));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return Swal.fire('Error', 'Agregue productos al préstamo', 'warning');
    if (!businessName) return Swal.fire('Error', 'Ingrese el negocio de destino', 'warning');

    try {
        // // Fix: Explicitly cast tipo_producto to 'TELEFONO' | 'ACCESORIO' to match Consignacion type
        const payload = cart.map(item => ({
            id_producto: item.product.id,
            tipo_producto: item.product.tipo as 'TELEFONO' | 'ACCESORIO',
            negocio_destino: businessName,
            cantidad_prestada: item.qty,
            precio_especial_pago: item.specialPrice,
            fecha_limite: dueDate || null
        }));
        
        await ConsignService.create(payload);
        setShowModal(false);
        setCart([]);
        setBusinessName('');
        loadData();
        loadProducts();
        Swal.fire('Éxito', 'Préstamo registrado correctamente', 'success');
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleUpdate = async () => {
      if(!editId || !businessName) return;
      try {
          const item = cart[0]; // Edicion solo permite 1 a la vez por simplicidad de UI
          await ConsignService.update(editId, {
              negocio_destino: businessName,
              precio_especial_pago: item.specialPrice,
              fecha_limite: dueDate
          });
          setShowModal(false); loadData();
          Swal.fire('Actualizado', 'Registro modificado', 'success');
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleEdit = (c: Consignacion) => {
      setIsEditing(true);
      setEditId(c.id_consignacion);
      setBusinessName(c.negocio_destino);
      setDueDate(c.fecha_limite ? c.fecha_limite.split('T')[0] : '');
      const prod = products.find(p => p.id === c.id_producto) || { id: c.id_producto, nombre: c.nombre_producto, tipo: c.tipo_producto, stock: 0, precioVenta: c.precio_especial_pago, codigo: '' } as ProductoUnified;
      setCart([{ product: prod, qty: c.cantidad_prestada, specialPrice: Number(c.precio_especial_pago) }]);
      setShowModal(true);
  };

  const handleDelete = async (id: number) => {
      const result = await Swal.fire({ title: '¿Eliminar registro?', text: 'El stock será devuelto al inventario.', icon: 'warning', showCancelButton: true });
      if(result.isConfirmed) { try { await ConsignService.delete(id); loadData(); loadProducts(); } catch(e:any) { Swal.fire('Error', e.message, 'error'); } }
  };

  const handleLiquidate = async (id: number) => {
      const result = await Swal.fire({
          title: '¿Confirmar Pago?',
          text: 'Se registrará el ingreso por el precio especial detallando marca y modelo.',
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Sí, Liquidar'
      });
      if (result.isConfirmed) {
          try { await ConsignService.liquidate(id); loadData(); Swal.fire('Vendido', 'Ingreso registrado en caja.', 'success'); } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const handleReturn = async (id: number) => {
      const result = await Swal.fire({ title: '¿Retornar a Stock?', text: 'El producto volverá a estar disponible.', icon: 'warning', showCancelButton: true });
      if (result.isConfirmed) {
          try { await ConsignService.returnToStock(id); loadData(); loadProducts(); Swal.fire('Retornado', 'Producto reingresado.', 'success'); } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const categories = useMemo(() => ['ALL', ...new Set(products.map(p => p.categoria).filter(Boolean))], [products]);
  
  const filteredCatalog = products.filter(p => {
      const matchSearch = p.nombre.toLowerCase().includes(catSearch.toLowerCase()) || p.imei?.includes(catSearch);
      const matchCat = selectedCat === 'ALL' || p.categoria === selectedCat;
      const matchType = selectedType === 'ALL' || p.tipo === selectedType;
      return matchSearch && matchCat && matchType && p.stock > 0;
  });

  const filteredConsignments = consignments.filter(c => 
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
                <p className="text-slate-500 text-sm">Gestiona préstamos a otros negocios y liquidaciones externas.</p>
            </div>
            <button onClick={() => { setIsEditing(false); setCart([]); setBusinessName(''); setDueDate(''); setShowModal(true); }} className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-orange-600/20 transition-all">
                <PlusCircle size={20}/> Nuevo Préstamo
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
                            <th className="p-4">Producto / Código</th>
                            <th className="p-4">Precio Pactado</th>
                            <th className="p-4">Estado</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredConsignments.map(c => (
                            <tr key={c.id_consignacion} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Store size={18}/></div>
                                        <span className="font-bold text-slate-800">{c.negocio_destino}</span>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <p className="text-sm font-bold text-slate-700">{c.nombre_producto}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">{c.tipo_producto}: {c.id_producto} {c.cantidad_prestada > 1 && `(x${c.cantidad_prestada})`}</p>
                                </td>
                                <td className="p-4 font-bold text-emerald-600">L. {Number(c.precio_especial_pago).toFixed(2)}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${c.estado_consignacion === 'Vendido_Pagado' ? 'bg-emerald-100 text-emerald-700' : c.estado_consignacion === 'Devuelto' ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-orange-700'}`}>
                                        {c.estado_consignacion.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-1.5">
                                        {c.estado_consignacion === 'Prestado' ? (
                                            <>
                                                <button onClick={() => handleLiquidate(c.id_consignacion)} className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700 shadow-md shadow-emerald-600/10" title="Cobrar"><ShoppingCart size={14}/></button>
                                                <button onClick={() => handleEdit(c)} className="bg-blue-100 text-blue-600 p-2 rounded-lg hover:bg-blue-200" title="Editar"><Edit2 size={14}/></button>
                                                <button onClick={() => handleReturn(c.id_consignacion)} className="bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200" title="Retornar"><RefreshCcw size={14}/></button>
                                                <button onClick={() => handleDelete(c.id_consignacion)} className="bg-red-50 text-red-400 p-2 rounded-lg hover:bg-red-100" title="Eliminar"><Trash2 size={14}/></button>
                                            </>
                                        ) : (
                                            <span className="text-[10px] font-bold text-slate-300 uppercase">Sesión Cerrada</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* MODAL MAESTRO DE CONSIGNACIÓN */}
        {showModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[95vh]">
                    <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                           <Hand size={24} className="text-orange-600"/> {isEditing ? 'Editar Consignación' : 'Registrar Salida de Inventario'}
                        </h3>
                        <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X/></button>
                    </div>
                    
                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                        {/* Panel de Selección (Buscador Avanzado) */}
                        {!isEditing && (
                            <div className="w-full md:w-1/2 border-r flex flex-col bg-slate-50/30">
                                <div className="p-4 space-y-3 border-b bg-white">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                        <input className="w-full pl-9 pr-4 py-2 border rounded-xl text-sm" placeholder="Buscar por nombre o IMEI..." value={catSearch} onChange={e=>setCatSearch(e.target.value)} />
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase">Categoría</label>
                                            <select className="w-full p-2 border rounded-lg text-xs" value={selectedCat} onChange={e=>setSelectedCat(e.target.value)}>
                                                <option value="ALL">Todas las categorías</option>
                                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase">Tipo</label>
                                            <div className="flex p-1 bg-slate-100 rounded-lg">
                                                <button onClick={()=>setSelectedType('ALL')} className={`px-2 py-1 rounded text-[10px] font-bold ${selectedType==='ALL'?'bg-white shadow-sm':''}`}>Todos</button>
                                                <button onClick={()=>setSelectedType('TELEFONO')} className={`px-2 py-1 rounded text-[10px] font-bold ${selectedType==='TELEFONO'?'bg-white shadow-sm':''}`}>Tel</button>
                                                <button onClick={()=>setSelectedType('ACCESORIO')} className={`px-2 py-1 rounded text-[10px] font-bold ${selectedType==='ACCESORIO'?'bg-white shadow-sm':''}`}>Acc</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                    <div className="grid grid-cols-1 gap-2">
                                        {filteredCatalog.map(p => (
                                            <button key={p.id} onClick={() => addToCart(p)} className="flex items-center gap-3 p-3 bg-white border rounded-xl hover:border-indigo-500 transition-all text-left shadow-sm group">
                                                <div className={`p-2 rounded-lg ${p.tipo === 'TELEFONO' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                                    {p.tipo === 'TELEFONO' ? <Smartphone size={18}/> : <Package size={18}/>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-slate-800 text-sm truncate">{p.nombre}</p>
                                                    <div className="flex justify-between items-center mt-1">
                                                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-500">{p.codigo || p.id}</span>
                                                        <span className="text-[10px] font-black text-emerald-600">Stock: {p.stock}</span>
                                                    </div>
                                                </div>
                                                <div className="opacity-0 group-hover:opacity-100 bg-indigo-600 text-white p-1 rounded-full"><Plus size={14}/></div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Panel de Resumen / Carrito */}
                        <div className={`flex-1 flex flex-col ${isEditing ? 'w-full' : ''}`}>
                            <div className="p-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Negocio de Destino</label>
                                        <input required className="w-full p-3 border rounded-xl font-bold" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Nombre del local aliado" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Fecha Límite Retorno</label>
                                        <input type="date" className="w-full p-3 border rounded-xl" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Layers size={14}/> Productos en el Lote
                                    </p>
                                    {cart.length === 0 ? (
                                        <div className="p-10 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-300">
                                            <Package size={48} className="mb-2 opacity-20"/>
                                            <p className="text-sm font-medium">No has seleccionado productos</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {cart.map(item => (
                                                <div key={item.product.id} className="bg-white border rounded-2xl p-4 shadow-sm group">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-slate-800 text-sm truncate">{item.product.nombre}</p>
                                                            <p className="text-[10px] text-slate-400">{item.product.tipo} - SKU: {item.product.codigo || item.product.id}</p>
                                                        </div>
                                                        {!isEditing && (
                                                            <button onClick={() => removeFromCart(item.product.id)} className="text-slate-300 hover:text-red-500"><X size={16}/></button>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="text-[9px] font-bold text-slate-400 uppercase">Cant.</label>
                                                            <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg w-fit">
                                                                <button disabled={isEditing || item.product.tipo==='TELEFONO'} onClick={()=>updateCartItem(item.product.id, {qty: Math.max(1, item.qty-1)})} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-0"><Minus size={14}/></button>
                                                                <span className="text-xs font-black w-6 text-center">{item.qty}</span>
                                                                <button disabled={isEditing || item.product.tipo==='TELEFONO'} onClick={()=>updateCartItem(item.product.id, {qty: Math.min(item.product.stock, item.qty+1)})} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-0"><Plus size={14}/></button>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-slate-400 uppercase">Precio Especial</label>
                                                            <input type="number" className="w-full p-1.5 border rounded-lg text-xs font-bold text-emerald-600" value={item.specialPrice} onChange={e=>updateCartItem(item.product.id, {specialPrice: Number(e.target.value)})} />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50 border-t">
                                {isEditing ? (
                                    <button onClick={handleUpdate} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs"><Save size={18}/> ACTUALIZAR REGISTRO</button>
                                ) : (
                                    <button onClick={handleCreate} disabled={cart.length === 0} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black shadow-lg hover:bg-orange-700 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs disabled:opacity-50"><ArrowRightCircle size={18}/> FINALIZAR Y ENTREGAR</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default Consignments;
