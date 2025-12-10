import React, { useState, useEffect } from 'react';
import { InventoryService, ClientService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente } from '../types';
import { Search, ShoppingCart, Trash2, UserPlus, CreditCard, RotateCcw, Smartphone, Headphones, Zap } from 'lucide-react';

const POS: React.FC = () => {
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [cart, setCart] = useState<DetalleVenta[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [clients, setClients] = useState<Cliente[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');

  useEffect(() => {
    // Load initial data
    InventoryService.getUnifiedProducts().then(setProducts);
    ClientService.getAll().then(setClients);
  }, []);

  const addToCart = (product: ProductoUnified) => {
    setCart(prev => {
      // Check if product is already in cart
      const existing = prev.find(item => 
        (item.idTelefono === product.id) || (item.idAccesorio === product.id)
      );

      if (existing) {
        // If it's a phone, usually we don't add quantity > 1 for same IMEI, but for logic simplicity:
        return prev.map(item => {
           const isMatch = (item.idTelefono === product.id) || (item.idAccesorio === product.id);
           return isMatch ? { ...item, cantidad: item.cantidad + 1 } : item;
        });
      }

      // New Item
      const newItem: DetalleVenta = {
        codDetalleVenta: `TEMP-${Date.now()}`,
        idVenta: 'TEMP',
        idTelefono: product.tipo === 'TELEFONO' ? product.id : undefined,
        idAccesorio: product.tipo === 'ACCESORIO' ? product.id : undefined,
        cantidad: 1,
        precioVenta: product.precioVenta,
        estado: 'Activo',
        descripcionProducto: product.nombre // Helper for UI
      };
      return [...prev, newItem];
    });
  };

  const removeFromCart = (tempId: string) => {
    setCart(prev => prev.filter(item => item.codDetalleVenta !== tempId));
  };

  const calculateTotal = () => {
    const subtotal = cart.reduce((acc, item) => acc + (item.cantidad * item.precioVenta), 0);
    const tax = subtotal * 0.15; // Assuming 15% ISV from configuracion table
    return { subtotal, tax, total: subtotal + tax };
  };

  const { subtotal, tax, total } = calculateTotal();

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || p.tipo === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-6">
      
      {/* Product Selector */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col gap-4">
          <div className="flex gap-3">
             <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text" 
                placeholder="Escanear IMEI, código o buscar..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-base font-medium placeholder:text-slate-400"
                autoFocus
              />
            </div>
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-1">
             <button onClick={() => setSelectedCategory('ALL')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${selectedCategory === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>Todos</button>
             <button onClick={() => setSelectedCategory('TELEFONO')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase flex gap-2 ${selectedCategory === 'TELEFONO' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Smartphone size={14}/> Teléfonos</button>
             <button onClick={() => setSelectedCategory('ACCESORIO')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase flex gap-2 ${selectedCategory === 'ACCESORIO' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Headphones size={14}/> Accesorios</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 custom-scrollbar">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map(product => (
              <button 
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={product.stock === 0}
                className={`flex flex-col items-start p-4 bg-white rounded-xl border transition-all text-left relative overflow-hidden group
                  ${product.stock === 0 ? 'opacity-60 border-slate-100 grayscale' : 'border-slate-200/60 hover:border-indigo-500 hover:shadow-lg'}`}
              >
                <div className="w-full flex justify-between items-start mb-3">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-500 tracking-wider uppercase`}>
                    {product.tipo.substring(0,3)}
                  </span>
                  <span className={`text-[10px] font-bold ${product.stock > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'} px-2 py-1 rounded-md`}>
                    {product.stock}
                  </span>
                </div>
                <h4 className="font-bold text-slate-800 text-sm line-clamp-2 mb-auto leading-snug">{product.nombre}</h4>
                <div className="mt-4 w-full pt-3 border-t border-slate-50">
                  <span className="block text-lg font-bold text-indigo-600">L. {product.precioVenta}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart & Checkout */}
      <div className="w-full lg:w-[420px] flex flex-col bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 h-full">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cliente (Tabla Clientes)</label>
            <button className="text-indigo-600 text-xs font-bold hover:underline flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md">
              <UserPlus size={14} /> Nuevo
            </button>
          </div>
          <select 
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Consumidor Final</option>
            {clients.map(c => (
              <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <ShoppingCart size={32} className="opacity-30 mb-4" />
              <p className="font-medium">Carrito vacío</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.codDetalleVenta} className="flex gap-4 items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                <div className="flex-1 min-w-0">
                  <h5 className="text-sm font-bold text-slate-800 truncate">{item.descripcionProducto}</h5>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-slate-500 font-medium">{item.cantidad} x L. {item.precioVenta}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end min-w-[60px]">
                  <span className="font-bold text-slate-800 text-sm">L. {item.cantidad * item.precioVenta}</span>
                  <button 
                    onClick={() => removeFromCart(item.codDetalleVenta)}
                    className="text-red-400 hover:text-red-600 mt-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 bg-slate-50/80 border-t border-slate-200 backdrop-blur-sm">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-slate-600 text-sm">
              <span className="font-medium">Subtotal</span>
              <span className="font-mono">L. {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600 text-sm">
              <span className="font-medium">ISV (15%)</span>
              <span className="font-mono">L. {tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-end pt-3 border-t border-slate-200">
              <span className="font-bold text-lg text-slate-800">Total</span>
              <span className="font-bold text-2xl text-indigo-600 font-mono">L. {total.toFixed(2)}</span>
            </div>
          </div>

          <button 
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50"
            disabled={cart.length === 0}
            onClick={() => alert(`Guardando en tabla ventas: ${total.toFixed(2)}`)}
          >
            <CreditCard size={18} /> Confirmar Venta
          </button>
        </div>
      </div>
    </div>
  );
};

export default POS;