
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ConsignService, InventoryService } from '../services/api';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { Consignacion, ProductoUnified } from '../types';
import {
  Hand, PlusCircle, Search, Store, ShoppingCart, RefreshCcw, X, Save, RefreshCw,
  ArrowRightCircle, Trash2, Edit2, Package, Smartphone, Check, Minus, Plus, ScanLine, ChevronRight
} from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';
import Swal from 'sweetalert2';
import * as ReactRouterDOM from 'react-router-dom';
const { useLocation } = ReactRouterDOM as any;

const TODAY = new Date().toISOString().split('T')[0];

interface CartItem { product: ProductoUnified; qty: number; specialPrice: number; }

const Consignments: React.FC = () => {
  const location = useLocation();
  const [consignments, setConsignments] = useState<Consignacion[]>([]);
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  // Cart & form
  const [cart, setCart] = useState<CartItem[]>([]);
  const [businessName, setBusinessName] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMode, setScannerMode] = useState<'new' | 'search'>('search');

  // Summary confirm modal
  const [showSummary, setShowSummary] = useState(false);
  const [summaryCart, setSummaryCart] = useState<CartItem[]>([]);

  const businessInputRef = useRef<HTMLInputElement>(null);

  // Unique businesses from history
  const uniqueBusinesses = useMemo(() =>
    [...new Set(consignments.map(c => c.negocio_destino).filter(Boolean))].sort(),
    [consignments]
  );

  useEffect(() => {
    loadData();
    loadProducts();
    if (location.state?.consignItem) {
      addToCart(location.state.consignItem);
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

  useOfflineSync(loadData);

  const loadProducts = async () => {
    try {
      const data = await InventoryService.getUnifiedProducts();
      setProducts(data || []);
    } catch (e) { console.error(e); }
  };

  const addToCart = (p: ProductoUnified) => {
    setCart(prev => {
      const exists = prev.find(c => c.product.id === p.id);
      if (exists) {
        if (p.tipo === 'TELEFONO') return prev; // phones can't have qty > 1
        return prev.map(c => c.product.id === p.id ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { product: p, qty: 1, specialPrice: p.precioVenta }];
    });
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.product.id !== id));

  const updateCartItem = (id: string, updates: Partial<CartItem>) =>
    setCart(prev => prev.map(c => c.product.id === id ? { ...c, ...updates } : c));

  // Barcode scan → find product → add to cart
  const handleBarcodeScan = (code: string) => {
    if (scannerMode === 'search') {
      setSearchTerm(code);
      setShowScanner(false);
      return;
    }
    const found = products.find(p =>
      p.imei === code || p.codigo === code || String(p.id) === code
    );
    if (!found) {
      Swal.fire({ title: 'Producto no encontrado', text: `Código: ${code}`, icon: 'warning', timer: 2000, showConfirmButton: false });
      return;
    }
    if (found.stock <= 0) {
      Swal.fire({ title: 'Sin stock', text: found.nombre, icon: 'warning', timer: 1500, showConfirmButton: false });
      return;
    }
    addToCart(found);
    // haptic / toast feedback
    Swal.fire({ title: found.nombre, text: 'Agregado al lote', icon: 'success', timer: 1000, showConfirmButton: false, position: 'top-end', toast: true });
  };

  const openNewModal = () => {
    setIsEditing(false);
    setEditId(null);
    setCart([]);
    setBusinessName('');
    setDueDate('');
    setShowModal(true);
    setTimeout(() => businessInputRef.current?.focus(), 100);
  };

  const handleCreate = async () => {
    if (cart.length === 0) return Swal.fire('Error', 'Agregue productos al lote', 'warning');
    if (!businessName.trim()) return Swal.fire('Error', 'Seleccione o escriba un negocio destino', 'warning');
    // Open summary
    setSummaryCart(cart.map(c => ({ ...c })));
    setShowSummary(true);
  };

  const confirmCreate = async () => {
    try {
      const payload = summaryCart.map(item => ({
        id_producto: item.product.id,
        tipo_producto: item.product.tipo as 'TELEFONO' | 'ACCESORIO',
        negocio_destino: businessName.trim(),
        cantidad_prestada: item.qty,
        precio_especial_pago: item.specialPrice,
        fecha_limite: dueDate || null
      }));
      await ConsignService.create(payload);
      setShowSummary(false);
      setShowModal(false);
      setCart([]);
      setBusinessName('');
      setDueDate('');
      loadData();
      loadProducts();
      Swal.fire({ title: 'Préstamo registrado', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleUpdate = async () => {
    if (!editId || !businessName) return;
    try {
      const item = cart[0];
      await ConsignService.update(editId, {
        negocio_destino: businessName,
        precio_especial_pago: item.specialPrice,
        fecha_limite: dueDate
      });
      setShowModal(false);
      loadData();
      Swal.fire({ title: 'Actualizado', icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleEdit = (c: Consignacion) => {
    setIsEditing(true);
    setEditId(c.id_consignacion);
    setBusinessName(c.negocio_destino);
    setDueDate(c.fecha_limite ? c.fecha_limite.split('T')[0] : '');
    const prod = products.find(p => p.id === c.id_producto) || {
      id: c.id_producto, nombre: c.nombre_producto, tipo: c.tipo_producto,
      stock: 0, precioVenta: c.precio_especial_pago, codigo: ''
    } as ProductoUnified;
    setCart([{ product: prod, qty: c.cantidad_prestada, specialPrice: Number(c.precio_especial_pago) }]);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    const result = await Swal.fire({ title: '¿Eliminar registro?', text: 'El stock será devuelto.', icon: 'warning', showCancelButton: true });
    if (result.isConfirmed) {
      try { await ConsignService.delete(id); loadData(); loadProducts(); }
      catch (e: any) { Swal.fire('Error', e.message, 'error'); }
    }
  };

  const handleLiquidate = async (id: number) => {
    const result = await Swal.fire({
      title: '¿Confirmar Pago?', text: 'Se registrará el ingreso.',
      icon: 'question', showCancelButton: true, confirmButtonText: 'Sí, Liquidar'
    });
    if (result.isConfirmed) {
      try { await ConsignService.liquidate(id); loadData(); Swal.fire({ title: 'Liquidado', icon: 'success', timer: 1200, showConfirmButton: false }); }
      catch (e: any) { Swal.fire('Error', e.message, 'error'); }
    }
  };

  const handleReturn = async (id: number) => {
    const result = await Swal.fire({ title: '¿Retornar a Stock?', icon: 'warning', showCancelButton: true });
    if (result.isConfirmed) {
      try { await ConsignService.returnToStock(id); loadData(); loadProducts(); Swal.fire({ title: 'Retornado', icon: 'success', timer: 1200, showConfirmButton: false }); }
      catch (e: any) { Swal.fire('Error', e.message, 'error'); }
    }
  };

  const filteredConsignments = consignments.filter(c =>
    c.negocio_destino.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.nombre_producto?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const cartTotal = cart.reduce((sum, i) => sum + i.specialPrice * i.qty, 0);

  return (
    <div className="space-y-6 animate-fade-in h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-1 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Hand className="text-orange-600" size={24}/> Consignaciones
          </h2>
          <p className="text-slate-500 text-xs md:text-sm">Préstamos a negocios externos y liquidaciones.</p>
        </div>
        <button
          onClick={openNewModal}
          className="w-full md:w-auto bg-orange-600 hover:bg-orange-700 text-white px-5 py-3 md:py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-orange-600/20 transition-all active:scale-95"
        >
          <PlusCircle size={20}/> Nuevo Préstamo
        </button>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
        <div className="p-3 md:p-4 border-b bg-slate-50 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
            <input
              type="text"
              placeholder="Buscar negocio o producto..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => { setScannerMode('search'); setShowScanner(true); }}
            className="bg-orange-100 hover:bg-orange-200 text-orange-600 p-2.5 rounded-xl transition-all active:scale-95"
            title="Buscar por código de barras"
          >
            <ScanLine size={20}/>
          </button>
          <button onClick={loadData} className="p-2.5 text-slate-500 hover:bg-slate-200 rounded-xl border border-slate-200 bg-white">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''}/>
          </button>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left min-w-[600px] md:min-w-0">
            <thead className="bg-slate-100 text-[10px] font-black text-slate-500 uppercase sticky top-0 z-10 tracking-widest border-b">
              <tr>
                <th className="p-4">Negocio</th>
                <th className="p-4">Producto</th>
                <th className="p-4">Precio</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredConsignments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-slate-400 italic text-sm">
                    {loading ? 'Cargando...' : 'No hay registros de consignación.'}
                  </td>
                </tr>
              ) : filteredConsignments.map(c => (
                <tr key={c.id_consignacion} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="bg-orange-100 p-1.5 rounded-lg text-orange-600"><Store size={16}/></div>
                      <span className="font-bold text-slate-800 text-sm">{c.negocio_destino}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <p className="text-xs font-bold text-slate-700">{c.nombre_producto}</p>
                    <p className="text-[10px] text-slate-400 font-mono uppercase">{c.tipo_producto} {c.cantidad_prestada > 1 && `×${c.cantidad_prestada}`}</p>
                  </td>
                  <td className="p-4 font-black text-emerald-600 text-sm">L. {Number(c.precio_especial_pago).toFixed(2)}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                      c.estado_consignacion === 'Vendido_Pagado' ? 'bg-emerald-100 text-emerald-700' :
                      c.estado_consignacion === 'Devuelto' ? 'bg-slate-100 text-slate-500' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {c.estado_consignacion.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {c.estado_consignacion === 'Prestado' ? (
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => handleLiquidate(c.id_consignacion)} className="bg-emerald-600 text-white p-2 rounded-xl hover:bg-emerald-700 active:scale-90 transition-all" title="Cobrar"><ShoppingCart size={14}/></button>
                        <button onClick={() => handleEdit(c)} className="bg-blue-100 text-blue-600 p-2 rounded-xl hover:bg-blue-200 active:scale-90 transition-all" title="Editar"><Edit2 size={14}/></button>
                        <button onClick={() => handleReturn(c.id_consignacion)} className="bg-slate-100 text-slate-600 p-2 rounded-xl hover:bg-slate-200 active:scale-90 transition-all" title="Retornar"><RefreshCcw size={14}/></button>
                        <button onClick={() => handleDelete(c.id_consignacion)} className="bg-red-50 text-red-400 p-2 rounded-xl hover:bg-red-100 active:scale-90 transition-all" title="Eliminar"><Trash2 size={14}/></button>
                      </div>
                    ) : (
                      <span className="text-[10px] font-black text-slate-300 uppercase bg-slate-50 px-2 py-1 rounded">CERRADO</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── NEW / EDIT MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-end md:items-center justify-center md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-lg shadow-2xl flex flex-col max-h-[95vh] animate-slide-up">

            {/* Modal header */}
            <div className="p-5 border-b flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-orange-100 p-2 rounded-xl text-orange-600"><Hand size={22}/></div>
                <div>
                  <h3 className="font-bold text-slate-800">{isEditing ? 'Editar Registro' : 'Nuevo Préstamo'}</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Módulo de Consignación</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"><X size={22}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">

              {/* Business + Date row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Negocio Destino</label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                    <input
                      ref={businessInputRef}
                      list="businesses-list"
                      className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500/30"
                      placeholder="Seleccionar o escribir negocio..."
                      value={businessName}
                      onChange={e => setBusinessName(e.target.value)}
                    />
                    <datalist id="businesses-list">
                      {uniqueBusinesses.map(b => <option key={b} value={b}/>)}
                    </datalist>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Límite</label>
                  <input
                    type="date"
                    className="w-full p-2.5 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-orange-500/30"
                    value={dueDate}
                    min={TODAY}
                    onChange={e => setDueDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1 flex flex-col justify-end">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Préstamo</label>
                  <div className="p-2.5 border border-slate-100 rounded-2xl bg-slate-50 text-sm font-bold text-slate-500">{TODAY}</div>
                </div>
              </div>

              {/* Scan + Products section (only for new) */}
              {!isEditing && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Productos en el Lote</p>
                    <button
                      onClick={() => { setScannerMode('new'); setShowScanner(true); }}
                      className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-xl text-xs font-black transition-all active:scale-95 shadow-md shadow-orange-600/20"
                    >
                      <ScanLine size={16}/> Escanear
                    </button>
                  </div>

                  {cart.length === 0 ? (
                    <div
                      className="p-10 border-2 border-dashed border-orange-200 rounded-2xl flex flex-col items-center justify-center text-slate-300 bg-orange-50/30 cursor-pointer"
                      onClick={() => { setScannerMode('new'); setShowScanner(true); }}
                    >
                      <ScanLine size={40} className="mb-3 text-orange-200"/>
                      <p className="text-xs font-black uppercase tracking-widest text-orange-400">Escanea o toca aquí</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cart.map(item => (
                        <div key={item.product.id} className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
                          <div className={`p-2 rounded-xl shrink-0 ${item.product.tipo === 'TELEFONO' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                            {item.product.tipo === 'TELEFONO' ? <Smartphone size={16}/> : <Package size={16}/>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 text-xs truncate">{item.product.nombre}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{item.product.codigo || item.product.id}</p>
                          </div>
                          {item.product.tipo === 'ACCESORIO' && (
                            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                              <button onClick={() => item.qty > 1 ? updateCartItem(item.product.id, {qty: item.qty - 1}) : removeFromCart(item.product.id)} className="w-6 h-6 bg-white rounded text-slate-600 hover:text-red-500 flex items-center justify-center shadow-sm"><Minus size={10}/></button>
                              <span className="text-xs font-black w-5 text-center">{item.qty}</span>
                              <button onClick={() => updateCartItem(item.product.id, {qty: item.qty + 1})} className="w-6 h-6 bg-white rounded text-slate-600 hover:text-orange-600 flex items-center justify-center shadow-sm"><Plus size={10}/></button>
                            </div>
                          )}
                          <button onClick={() => removeFromCart(item.product.id)} className="text-slate-300 hover:text-red-500 p-1 transition-colors"><X size={16}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Edit mode: single item price */}
              {isEditing && cart.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Producto</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <p className="font-bold text-slate-800 text-sm">{cart[0].product.nombre}</p>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Precio Especial (L.)</label>
                      <input
                        type="number"
                        className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-black text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-500/20"
                        value={cart[0].specialPrice}
                        onChange={e => updateCartItem(cart[0].product.id, { specialPrice: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-slate-50 shrink-0">
              {isEditing ? (
                <button onClick={handleUpdate} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest active:scale-95">
                  <Save size={18}/> Actualizar Registro
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={cart.length === 0 || !businessName.trim()}
                  className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black shadow-lg shadow-orange-600/20 hover:bg-orange-700 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-40 disabled:grayscale active:scale-95"
                >
                  <ChevronRight size={18}/> Revisar y Confirmar ({cart.length} item{cart.length !== 1 ? 's' : ''})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SUMMARY CONFIRM MODAL ── */}
      {showSummary && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[60] flex items-end md:items-center justify-center md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md shadow-2xl flex flex-col max-h-[90vh] animate-slide-up">
            <div className="p-5 border-b flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Confirmar Préstamo</h3>
                <p className="text-[11px] text-slate-400">Verifica y ajusta los precios si es necesario</p>
              </div>
              <button onClick={() => setShowSummary(false)} className="p-2 text-slate-400 hover:text-red-500 rounded-full"><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 flex items-center gap-3">
                <Store size={18} className="text-orange-600 shrink-0"/>
                <div>
                  <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest">Negocio</p>
                  <p className="font-bold text-slate-800 text-sm">{businessName}</p>
                </div>
              </div>

              {summaryCart.map((item, idx) => (
                <div key={item.product.id} className="bg-white border border-slate-100 rounded-2xl p-4 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${item.product.tipo === 'TELEFONO' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                      {item.product.tipo === 'TELEFONO' ? <Smartphone size={14}/> : <Package size={14}/>}
                    </div>
                    <p className="font-bold text-slate-800 text-xs flex-1 truncate">{item.product.nombre}</p>
                    {item.qty > 1 && <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-black text-slate-500">×{item.qty}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Precio Pactado (L.)</p>
                      <input
                        type="number"
                        className="w-full p-2 border border-slate-200 rounded-xl text-sm font-black text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-500/20"
                        value={summaryCart[idx].specialPrice}
                        onChange={e => setSummaryCart(prev => prev.map((c, i) => i === idx ? { ...c, specialPrice: Number(e.target.value) } : c))}
                        onFocus={ev => ev.target.select()}
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Subtotal</p>
                      <p className="font-black text-slate-700 text-sm">L. {(summaryCart[idx].specialPrice * item.qty).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <span className="font-black text-xs text-slate-400 uppercase tracking-widest">Total Estimado</span>
                <span className="font-black text-xl text-orange-600">L. {summaryCart.reduce((s, i) => s + i.specialPrice * i.qty, 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 shrink-0 flex gap-3">
              <button onClick={() => setShowSummary(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-2xl font-bold text-xs uppercase transition-all hover:bg-slate-100 active:scale-95">
                Modificar
              </button>
              <button onClick={confirmCreate} className="flex-1 py-3 bg-orange-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg shadow-orange-600/20 hover:bg-orange-700 transition-all flex items-center justify-center gap-2 active:scale-95">
                <Check size={16}/> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner overlay */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
          title={scannerMode === 'new' ? 'Escanear Producto' : 'Buscar por Código'}
          hint={scannerMode === 'new' ? 'Apunta al código para agregar al lote' : 'Apunta al código para buscar'}
          continuous={scannerMode === 'new'}
        />
      )}
    </div>
  );
};

export default Consignments;
