
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, ClientService, SalesService, CashService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, EmpresaConfig, VentaPayload } from '../types';
import { Search, ShoppingCart, Trash2, Smartphone, Zap, RefreshCw, User, X, Check, Plus, Minus, UserPlus, Grid, Filter, Tag, Info, AlertCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { useNavigate, useLocation } from 'react-router-dom';
// Added missing useAuth import
import { useAuth } from '../context/AuthContext';

const POS: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // useAuth now correctly imported
  const { user } = useAuth();

  // Data States
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [cart, setCart] = useState<DetalleVenta[]>([]);
  const [companyConfig, setCompanyConfig] = useState<EmpresaConfig | null>(null);
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'ALL' | 'TELEFONO' | 'ACCESORIO'>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [mobileTab, setMobileTab] = useState<'CATALOG' | 'CART'>('CATALOG');

  // Form States
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'Contado' | 'Credito'>('Contado');
  const [discount, setDiscount] = useState<number>(0);
  
  // Edit Mode
  const [isEditing, setIsEditing] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const state = location.state as any;
    if (state?.editSaleId) {
      loadSaleToEdit(state.editSaleId);
    } else if (state?.customItem) {
      const { descripcion, precio } = state.customItem;
      setCart(prev => [...prev, {
        codDetalleVenta: `MAN-${Date.now()}`,
        cantidad: 1,
        precioVenta: Number(precio),
        descripcionProducto: descripcion,
        tipoProducto: 'SERVICIO'
      }]);
    }
  }, [location.state]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [prods, clis, config] = await Promise.all([
        InventoryService.getUnifiedProducts(),
        ClientService.getAll(),
        ConfigService.get()
      ]);
      setProducts(prods || []);
      setClients(clis || []);
      setCompanyConfig(config);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadSaleToEdit = async (saleId: string) => {
    try {
      setLoading(true);
      const [details, header] = await Promise.all([
        SalesService.getDetallesVenta(saleId),
        SalesService.getVenta(saleId)
      ]);

      if (header) {
        setIsEditing(true);
        setEditingSaleId(saleId);
        setSelectedClientId(header.identidadCliente);
        setPaymentType(header.tipoCompra === 'Credito' ? 'Credito' : 'Contado');
        setDiscount(Number(header.descuento) || 0);
        setCart(details.map(d => ({
          ...d,
          cantidad: Number(d.cantidad),
          precioVenta: Number(d.precioVenta)
        })));
      }
    } catch (e) {
      Swal.fire('Error', 'No se pudo cargar la factura para editar', 'error');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: ProductoUnified) => {
    setCart(prev => {
      const existing = prev.find(item => 
        (product.tipo === 'TELEFONO' && item.idTelefono === product.id) ||
        (product.tipo === 'ACCESORIO' && item.idInventario === product.id)
      );

      if (existing) {
        if (product.tipo === 'TELEFONO') {
          Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'IMEI ya en carrito', showConfirmButton: false, timer: 1500 });
          return prev;
        }
        if (existing.cantidad + 1 > product.stock) {
          Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Sin más stock', showConfirmButton: false, timer: 1500 });
          return prev;
        }
        return prev.map(item => item === existing ? { ...item, cantidad: item.cantidad + 1 } : item);
      }

      return [...prev, {
        codDetalleVenta: `T-${Date.now()}`,
        idTelefono: product.tipo === 'TELEFONO' ? product.id : undefined,
        idInventario: product.tipo === 'ACCESORIO' ? product.id : undefined,
        cantidad: 1,
        precioVenta: Number(product.precioVenta),
        descripcionProducto: product.nombre,
        tipoProducto: product.tipo
      }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.codDetalleVenta === id) {
        if (item.tipoProducto === 'TELEFONO') return item;
        const newQty = item.cantidad + delta;
        
        const product = products.find(p => p.id === item.idInventario);
        if (delta > 0 && product && newQty > product.stock) return item;

        return newQty > 0 ? { ...item, cantidad: newQty } : item;
      }
      return item;
    }));
  };

  const totals = useMemo(() => {
    const bruto = cart.reduce((acc, i) => acc + (i.cantidad * i.precioVenta), 0);
    const conDescuento = Math.max(0, bruto - discount);
    const isvRate = (companyConfig?.isv || 15) / 100;
    const subtotal = conDescuento / (1 + isvRate);
    const isv = conDescuento - subtotal;
    return { bruto, subtotal, isv, total: conDescuento };
  }, [cart, discount, companyConfig]);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    try {
      setLoading(true);
      const payload: VentaPayload = {
        identidadCliente: selectedClientId || '9999999999999',
        tipoCompra: paymentType,
        total: totals.total,
        isv: totals.isv,
        descuento: discount,
        detalles: cart
      };

      if (isEditing && editingSaleId) {
        await SalesService.updateVenta(editingSaleId, payload);
        Swal.fire('Éxito', 'Factura actualizada', 'success');
      } else {
        const res = await SalesService.createVenta(payload);
        Swal.fire('Venta Exitosa', `Factura #${res.codVenta} generada`, 'success');
      }
      resetPOS();
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetPOS = () => {
    setCart([]);
    setDiscount(0);
    setSelectedClientId('');
    setIsEditing(false);
    setEditingSaleId(null);
    setPaymentType('Contado');
    navigate('/pos', { state: {} });
    loadInitialData();
  };

  const brands = useMemo(() => ['ALL', ...new Set(products.filter(p => p.tipo === 'TELEFONO').map(p => p.marca!))].sort(), [products]);
  // Renamed to categoriesList to avoid potential naming conflicts
  const categoriesList = useMemo(() => ['ALL', ...new Set(products.filter(p => p.tipo === 'ACCESORIO').map(p => p.categoria!))].sort(), [products]);

  const filteredProducts = products.filter(p => {
    const matchSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || p.imei?.includes(searchTerm) || p.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = selectedType === 'ALL' || p.tipo === selectedType;
    const matchBrand = selectedType !== 'TELEFONO' || selectedBrand === 'ALL' || p.marca === selectedBrand;
    const matchCat = selectedType !== 'ACCESORIO' || selectedCategory === 'ALL' || p.categoria === selectedCategory;
    return matchSearch && matchType && matchBrand && matchCat;
  });

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-100px)] gap-6 overflow-hidden">
      
      {/* PANEL IZQUIERDO: CATALOGO */}
      <div className={`flex-1 flex flex-col min-w-0 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden ${mobileTab === 'CART' ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Barra Superior con Buscador y Filtros */}
        <div className="p-5 border-b space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
              <input 
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium" 
                placeholder="Buscar por Nombre, Código o IMEI..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button onClick={loadInitialData} className="p-3 text-slate-400 hover:text-indigo-600 bg-slate-50 border rounded-2xl transition-colors">
              <RefreshCw size={22} className={loading ? 'animate-spin' : ''}/>
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <button onClick={() => { setSelectedType('ALL'); setSelectedBrand('ALL'); setSelectedCategory('ALL'); }} className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${selectedType === 'ALL' ? 'bg-[#334155] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>TODOS</button>
              <button onClick={() => { setSelectedType('TELEFONO'); setSelectedCategory('ALL'); }} className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${selectedType === 'TELEFONO' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><Smartphone size={16}/> TELÉFONOS</button>
              <button onClick={() => { setSelectedType('ACCESORIO'); setSelectedBrand('ALL'); }} className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${selectedType === 'ACCESORIO' ? 'bg-[#e67e22] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><Zap size={16}/> ACCESORIOS</button>
            </div>

            {selectedType === 'TELEFONO' && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                <div className="flex items-center gap-2 px-2 border-r pr-4"><Filter size={14} className="text-slate-400"/></div>
                {brands.map(b => (
                  <button key={b} onClick={() => setSelectedBrand(b)} className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase transition-all border ${selectedBrand === b ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white text-slate-400 border-slate-200'}`}>
                    {b === 'ALL' ? 'Todas las Marcas' : b}
                  </button>
                ))}
              </div>
            )}

            {selectedType === 'ACCESORIO' && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                <div className="flex items-center gap-2 px-2 border-r pr-4"><Filter size={14} className="text-slate-400"/></div>
                {categoriesList.map(c => (
                  <button key={c} onClick={() => setSelectedCategory(c)} className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase transition-all border ${selectedCategory === c ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-white text-slate-400 border-slate-200'}`}>
                    {c === 'ALL' ? 'Todas las Categorías' : c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Listado de Productos */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-slate-50/30">
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProducts.map(p => (
              <button 
                key={p.id} 
                onClick={() => addToCart(p)}
                className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all flex flex-col text-left group active:scale-95"
              >
                <div className="flex justify-between items-start mb-3">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest ${p.tipo==='TELEFONO'?'bg-blue-50 text-blue-600':'bg-orange-50 text-orange-600'}`}>{p.tipo==='TELEFONO'?'TEL':'ACC'}</span>
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${p.stock <= 1 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>Stock: {p.stock}</span>
                </div>
                <h4 className="font-bold text-slate-800 text-sm line-clamp-2 leading-tight min-h-[2.5rem] mb-4">{p.nombre}</h4>
                <div className="mt-auto">
                  <p className="text-xl font-black text-indigo-600 mb-1">L. {Number(p.precioVenta).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ubic: {p.ubicacion}</p>
                </div>
              </button>
            ))}
          </div>
          {filteredProducts.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
              <Search size={64} strokeWidth={1} className="mb-4 opacity-20"/>
              <p className="font-black uppercase tracking-widest text-sm">Sin resultados</p>
            </div>
          )}
        </div>
      </div>

      {/* PANEL DERECHO: CARRITO */}
      <div className={`w-full md:w-[420px] flex flex-col bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden ${mobileTab === 'CATALOG' ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 bg-[#1e293b] text-white shrink-0">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <Zap size={24} className="text-amber-400 fill-amber-400"/>
              <h3 className="font-black text-lg uppercase tracking-tight">{isEditing ? `EDITANDO #${editingSaleId}` : 'VENTA'}</h3>
            </div>
            {isEditing && (
              <button onClick={resetPOS} className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-[10px] font-black hover:bg-red-500 hover:text-white transition-all uppercase">Cancelar</button>
            )}
            {!isEditing && (
               <button onClick={() => cart.length > 0 && Swal.fire({title:'¿Vaciar?', icon:'warning', showCancelButton:true}).then(r=>r.isConfirmed && setCart([]))} className="p-2 hover:bg-white/10 rounded-xl text-slate-400"><Trash2 size={20}/></button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <button onClick={() => setPaymentType('Contado')} className={`py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border-2 transition-all ${paymentType === 'Contado' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-transparent border-slate-600 text-slate-400 hover:border-slate-500'}`}>Contado</button>
            <button onClick={() => setPaymentType('Credito')} className={`py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border-2 transition-all ${paymentType === 'Credito' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-transparent border-slate-600 text-slate-400 hover:border-slate-500'}`}>Crédito</button>
          </div>
          
          <div className="relative group">
            <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <select 
              className="w-full pl-10 pr-12 py-3 bg-white border-2 border-transparent rounded-2xl text-sm font-bold text-slate-800 outline-none appearance-none focus:border-indigo-500 transition-all cursor-pointer"
              value={selectedClientId}
              onChange={e => setSelectedClientId(e.target.value)}
            >
              <option value="">-- Cliente --</option>
              {clients.map(c => <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido}</option>)}
            </select>
            <button onClick={() => navigate('/clients')} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-xl hover:scale-105 transition-transform"><UserPlus size={18}/></button>
          </div>
          
          {/* Info del Cliente Seleccionado */}
          {selectedClientId && (
            <div className="mt-4 p-3 bg-white/5 border border-white/10 rounded-xl flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center font-black">{clients.find(c=>c.identidad===selectedClientId)?.nombre[0]}</div>
              <div className="flex-1">
                <p className="text-xs font-bold truncate">{clients.find(c=>c.identidad===selectedClientId)?.nombre} {clients.find(c=>c.identidad===selectedClientId)?.apellido}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">{clients.find(c=>c.identidad===selectedClientId)?.direccion || 'Sin dirección'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Lista de Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-40">
              <ShoppingCart size={80} strokeWidth={1}/>
              <p className="font-black text-sm uppercase mt-4">Carrito vacío</p>
            </div>
          ) : cart.map(item => (
            <div key={item.codDetalleVenta} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3 group animate-fade-in relative">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-8">
                  <p className="text-xs font-black text-slate-800 leading-tight mb-1">{item.descripcionProducto}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${item.tipoProducto==='TELEFONO'?'bg-blue-50 text-blue-600':'bg-orange-50 text-orange-600'}`}>{item.tipoProducto}</span>
                    <span className="text-[10px] text-slate-500 font-bold">{item.cantidad} x L. {Number(item.precioVenta).toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-sm font-black text-indigo-600 whitespace-nowrap">L. {(item.cantidad * item.precioVenta).toFixed(2)}</p>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                  <button 
                    onClick={() => updateQty(item.codDetalleVenta!, -1)}
                    disabled={item.tipoProducto === 'TELEFONO'}
                    className="w-7 h-7 flex items-center justify-center bg-white rounded-lg text-slate-600 hover:text-indigo-600 disabled:opacity-30 shadow-sm"
                  ><Minus size={14}/></button>
                  <span className="text-xs font-black w-6 text-center">{item.cantidad}</span>
                  <button 
                    onClick={() => updateQty(item.codDetalleVenta!, 1)}
                    disabled={item.tipoProducto === 'TELEFONO'}
                    className="w-7 h-7 flex items-center justify-center bg-white rounded-lg text-slate-600 hover:text-indigo-600 disabled:opacity-30 shadow-sm"
                  ><Plus size={14}/></button>
                </div>
                <button onClick={() => setCart(cart.filter(i => i.codDetalleVenta !== item.codDetalleVenta))} className="text-red-300 hover:text-red-500 p-1 transition-colors"><Trash2 size={18}/></button>
              </div>
            </div>
          ))}
        </div>

        {/* Resumen y Totales */}
        <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)]">
           <div className="space-y-3 mb-6">
              <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
                <span>Subtotal Bruto</span>
                <span>L. {totals.bruto.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-y border-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
                  <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Aplicar Descuento</span>
                </div>
                <div className="relative w-24 group">
                   <input 
                    type="number" 
                    className="w-full pl-2 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-right text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
                    value={discount}
                    onChange={e => setDiscount(Math.max(0, Number(e.target.value)))}
                    onFocus={e => e.target.select()}
                   />
                </div>
              </div>

              <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
                <span>ISV ({companyConfig?.isv || 15}%)</span>
                <span>L. {totals.isv.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-end pt-4 border-t-2 border-slate-100">
                <span className="text-lg font-black text-slate-800 uppercase tracking-tighter">Total</span>
                <span className="text-4xl font-black text-indigo-600 tracking-tighter">L. {totals.total.toFixed(2)}</span>
              </div>
           </div>

           <button 
            onClick={handleCheckout}
            disabled={loading || cart.length === 0}
            className={`w-full py-5 rounded-[2rem] font-black text-white shadow-2xl flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98] disabled:bg-slate-200 disabled:shadow-none ${isEditing ? 'bg-[#e67e22] hover:bg-[#d35400]' : 'bg-indigo-600 hover:bg-indigo-700'}`}
           >
             {loading ? <RefreshCw className="animate-spin" size={24}/> : <ShoppingCart size={24}/>}
             {isEditing ? 'Actualizar Venta' : 'Facturar'}
           </button>
        </div>
      </div>

      {/* Navegación Móvil (Bottom Tabs) */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 flex bg-[#1e293b]/95 backdrop-blur-md rounded-full shadow-2xl p-1 z-50 border border-white/10">
          <button 
            onClick={() => setMobileTab('CATALOG')}
            className={`flex-1 py-4 rounded-full flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-[0.1em] transition-all ${mobileTab === 'CATALOG' ? 'bg-white text-slate-900 shadow-xl' : 'text-white/60'}`}
          ><Grid size={18}/> Catálogo</button>
          <button 
            onClick={() => setMobileTab('CART')}
            className={`flex-1 py-4 rounded-full flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-[0.1em] transition-all ${mobileTab === 'CART' ? 'bg-white text-slate-900 shadow-xl' : 'text-white/60'}`}
          >
            <div className="relative">
              <ShoppingCart size={18}/> 
              {cart.length > 0 && <span className="absolute -top-2 -right-2 bg-indigo-600 text-white w-4 h-4 rounded-full flex items-center justify-center text-[8px] border-2 border-white">{cart.reduce((a,b)=>a+b.cantidad,0)}</span>}
            </div>
            Carrito 
          </button>
      </div>

    </div>
  );
};

export default POS;
