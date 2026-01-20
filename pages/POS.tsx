
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, ClientService, SalesService, CashService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, EmpresaConfig, VentaPayload } from '../types';
import { Search, ShoppingCart, Trash2, Smartphone, Zap, RefreshCw, User, X, Check, Plus, Minus, UserPlus, Grid, Filter, Tag, LayoutGrid, Wallet, CreditCard, Save, Printer, Ban, Ticket, Eye } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

const numeroALetras = (num: number): string => {
    const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const diez_veinte = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const convertGroup = (n: number): string => {
        if (n === 0) return '';
        if (n === 100) return 'CIEN';
        let output = '';
        if (n >= 100) { output += centenas[Math.floor(n / 100)] + ' '; n %= 100; }
        if (n >= 10 && n <= 19) { output += diez_veinte[n - 10]; } 
        else if (n >= 20) { 
            output += decenas[Math.floor(n / 10)]; 
            if (n % 10 > 0) output += ' Y ' + unidades[n % 10]; 
        } 
        else if (n > 0) { output += unidades[n]; }
        return output.trim();
    };

    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);
    let text = '';

    if (integerPart === 0) text = 'CERO';
    else if (integerPart >= 1000000) {
        const millions = Math.floor(integerPart / 1000000);
        const remainder = integerPart % 1000000;
        text += (millions === 1 ? 'UN MILLON' : convertGroup(millions) + ' MILLONES');
        if (remainder > 0) {
            if (remainder >= 1000) {
                text += ' ' + convertGroup(Math.floor(remainder / 1000)) + ' MIL ' + convertGroup(remainder % 1000);
            } else {
                text += ' ' + convertGroup(remainder);
            }
        }
    } 
    else if (integerPart >= 1000) {
        const thousands = Math.floor(integerPart / 1000);
        const remainder = integerPart % 1000;
        text += (thousands === 1 ? 'MIL' : convertGroup(thousands) + ' MIL');
        if (remainder > 0) text += ' ' + convertGroup(remainder);
    } 
    else { text = convertGroup(integerPart); }

    return `${text} CON ${decimalPart.toString().padStart(2, '0')}/100 LEMPIRAS`.toUpperCase();
};

const POS: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [cart, setCart] = useState<DetalleVenta[]>([]);
  const [companyConfig, setCompanyConfig] = useState<any>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'ALL' | 'TELEFONO' | 'ACCESORIO'>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [mobileTab, setMobileTab] = useState<'CATALOG' | 'CART'>('CATALOG');

  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'Contado' | 'Credito' | 'KrediYa'>('Contado');
  const [discount, setDiscount] = useState<number>(0);
  const [primaAmount, setPrimaAmount] = useState<number>(0);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  useEffect(() => { loadInitialData(); }, []);

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
      navigate(location.pathname, { replace: true, state: {} });
      setMobileTab('CART');
    }
  }, [location.state]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [prodData, clientData, configData] = await Promise.all([
        InventoryService.getUnifiedProducts(),
        ClientService.getAll(),
        ConfigService.get()
      ]);
      setProducts(prodData || []);
      setClients(clientData || []);
      setCompanyConfig(configData);
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  const loadSaleToEdit = async (saleId: string) => {
    try {
      setIsLoading(true);
      const [details, header] = await Promise.all([
        SalesService.getDetallesVenta(saleId),
        SalesService.getVenta(saleId)
      ]);

      if (header) {
        setIsEditing(true);
        setEditingSaleId(saleId);
        setSelectedClientId(header.identidadCliente);
        setPaymentType(header.tipoCompra);
        setDiscount(Number(header.descuento) || 0);
        setPrimaAmount(Number(header.montoPrima) || 0);
        setCart(details.map(d => ({
          ...d,
          cantidad: Number(d.cantidad),
          precioVenta: Number(d.precioVenta)
        })));
      }
    } catch (e) {
      Swal.fire('Error', 'No se pudo cargar la factura para editar', 'error');
    } finally { setIsLoading(false); }
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

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.codDetalleVenta !== id));
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.codDetalleVenta === id) {
        if (item.tipoProducto === 'TELEFONO') return item;
        const newQty = item.cantidad + delta;
        const product = products.find(p => p.id === item.idInventario);
        if (delta > 0 && product && newQty > product.stock) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Límite de stock', showConfirmButton: false, timer: 1000 });
            return item;
        }
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
    const financiado = paymentType === 'KrediYa' ? Math.max(0, conDescuento - primaAmount) : 0;
    return { bruto, subtotal, isv, total: conDescuento, financiado };
  }, [cart, discount, companyConfig, paymentType, primaAmount]);

  // --- GENERACIÓN DE FACTURA ---
  const generateInvoicePDF = (saleId: string) => {
      try {
          const doc = new jsPDF();
          doc.text(`Factura: ${saleId}`, 10, 10);
          doc.save(`Factura_${saleId}.pdf`);
      } catch (error) {
          console.error(error);
          Swal.fire('Error', 'No se pudo generar la factura en PDF.', 'error');
      }
  };

  const handleProcessSale = async () => {
    if (!selectedClientId) return Swal.fire('Error', 'Seleccione un cliente', 'warning');
    if (cart.length === 0) return Swal.fire('Error', 'Carrito vacío', 'warning');

    try {
      setIsLoading(true);
      const payload: VentaPayload = {
        identidadCliente: selectedClientId,
        tipoCompra: paymentType,
        total: totals.total,
        isv: totals.isv,
        descuento: discount,
        montoPrima: paymentType === 'KrediYa' ? primaAmount : 0,
        montoFinanciado: totals.financiado,
        detalles: cart.map(i => ({
          idTelefono: i.idTelefono,
          idInventario: i.idInventario,
          cantidad: i.cantidad,
          precioVenta: i.precioVenta
        }))
      };

      let res;
      if (isEditing && editingSaleId) {
        res = await SalesService.updateVenta(editingSaleId, payload);
      } else {
        res = await SalesService.createVenta(payload);
      }

      Swal.fire({
        title: '¡Venta Exitosa!',
        text: `Se ha registrado la factura ${res.codVenta}`,
        icon: 'success',
        showCancelButton: true,
        confirmButtonText: 'Imprimir Factura',
        cancelButtonText: 'Nueva Venta'
      }).then((result) => {
        if (result.isConfirmed) {
          generateInvoicePDF(res.codVenta);
        }
        setCart([]);
        setSelectedClientId('');
        setDiscount(0);
        setPrimaAmount(0);
        setIsEditing(false);
        setEditingSaleId(null);
        loadInitialData();
      });
    } catch (err: any) {
      Swal.fire('Error', err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.imei?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'ALL' || p.tipo === selectedType;
    return matchesSearch && matchesType;
  });

  // Fix: POS must return a JSX Element
  return (
    <div className="flex flex-col h-full gap-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row gap-6 h-full">
        {/* Left: Product Selection */}
        <div className={`flex-1 flex flex-col space-y-4 ${mobileTab === 'CART' ? 'hidden lg:flex' : ''}`}>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex gap-4">
             <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar producto o IMEI..." 
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>
             <select 
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm font-bold text-slate-600 outline-none"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as any)}
             >
                <option value="ALL">Todos</option>
                <option value="TELEFONO">Teléfonos</option>
                <option value="ACCESORIO">Accesorios</option>
             </select>
          </div>

          <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
            {filteredProducts.map(p => (
              <div 
                key={p.id} 
                onClick={() => addToCart(p)}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group relative overflow-hidden"
              >
                <div className={`absolute top-0 right-0 p-2 rounded-bl-xl text-[10px] font-black uppercase ${p.tipo === 'TELEFONO' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {p.tipo}
                </div>
                <h3 className="font-bold text-slate-800 pr-12 line-clamp-1">{p.nombre}</h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">{p.imei || p.codigo}</p>
                <div className="mt-4 flex justify-between items-end">
                   <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Precio</p>
                      <p className="text-lg font-black text-indigo-600">L. {Number(p.precioVenta).toLocaleString()}</p>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Stock</p>
                      <p className={`text-sm font-bold ${p.stock > 0 ? 'text-slate-700' : 'text-red-500'}`}>{p.stock} ud</p>
                   </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-indigo-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"/>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Cart and Totals */}
        <div className={`w-full lg:w-[400px] flex flex-col gap-6 ${mobileTab === 'CATALOG' ? 'hidden lg:flex' : ''}`}>
           <div className="bg-white rounded-3xl shadow-xl border border-slate-200 flex-1 flex flex-col overflow-hidden">
              <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                 <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <ShoppingCart size={20} className="text-indigo-600"/> CARRITO
                    {isEditing && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px]">EDITANDO</span>}
                 </h2>
                 <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-full text-xs font-bold">{cart.length} items</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {cart.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50 space-y-2">
                    <ShoppingCart size={48} />
                    <p className="font-bold">Carrito Vacío</p>
                  </div>
                )}
                {cart.map(item => (
                  <div key={item.codDetalleVenta} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex gap-3 group animate-slide-in">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-slate-700 truncate">{item.descripcionProducto}</h4>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs font-bold text-indigo-600">L. {item.precioVenta.toLocaleString()}</span>
                        {item.tipoProducto !== 'TELEFONO' && (
                          <div className="flex items-center gap-2 bg-white border rounded-lg px-1">
                            <button onClick={() => updateQty(item.codDetalleVenta!, -1)} className="p-1 hover:text-indigo-600"><Minus size={14}/></button>
                            <span className="text-xs font-black w-4 text-center">{item.cantidad}</span>
                            <button onClick={() => updateQty(item.codDetalleVenta!, 1)} className="p-1 hover:text-indigo-600"><Plus size={14}/></button>
                          </div>
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeFromCart(item.codDetalleVenta!)} className="text-slate-300 hover:text-red-500 transition-colors"><X size={18}/></button>
                  </div>
                ))}
              </div>

              <div className="p-6 bg-slate-900 text-white space-y-3">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</label>
                    <select 
                      className="w-full bg-white/10 border border-white/10 rounded-xl p-3 text-sm font-bold outline-none focus:border-indigo-500"
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                    >
                      <option value="" className="text-slate-900">Seleccionar Cliente...</option>
                      {clients.map(c => <option key={c.identidad} value={c.identidad} className="text-slate-900">{c.nombre} {c.apellido}</option>)}
                    </select>
                 </div>

                 <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo Pago</label>
                      <select 
                        className="w-full bg-white/10 border border-white/10 rounded-xl p-2.5 text-xs font-bold outline-none"
                        value={paymentType}
                        onChange={(e) => setPaymentType(e.target.value as any)}
                      >
                        <option value="Contado" className="text-slate-900">Contado</option>
                        <option value="Credito" className="text-slate-900">Crédito</option>
                        <option value="KrediYa" className="text-slate-900">KrediYa</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descuento (L.)</label>
                      <input 
                        type="number" 
                        className="w-full bg-white/10 border border-white/10 rounded-xl p-2.5 text-xs font-bold outline-none"
                        value={discount}
                        onChange={(e) => setDiscount(Number(e.target.value))}
                      />
                    </div>
                 </div>

                 {paymentType === 'KrediYa' && (
                    <div className="animate-fade-in">
                      <label className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Monto Prima (L.)</label>
                      <input 
                        type="number" 
                        className="w-full bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm font-black text-amber-400 outline-none"
                        value={primaAmount}
                        onChange={(e) => setPrimaAmount(Number(e.target.value))}
                      />
                    </div>
                 )}

                 <div className="pt-4 border-t border-white/10 space-y-1">
                    <div className="flex justify-between text-xs text-slate-400 font-bold"><span>SUBTOTAL</span><span>L. {totals.subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                    <div className="flex justify-between text-xs text-slate-400 font-bold"><span>ISV ({(companyConfig?.isv || 15)}%)</span><span>L. {totals.isv.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                    <div className="flex justify-between text-2xl font-black text-emerald-400 pt-2"><span>TOTAL</span><span>L. {totals.total.toLocaleString()}</span></div>
                    {paymentType === 'KrediYa' && <div className="flex justify-between text-xs text-amber-400 font-black pt-1"><span>FINANCIADO</span><span>L. {totals.financiado.toLocaleString()}</span></div>}
                 </div>

                 <button 
                  onClick={handleProcessSale}
                  disabled={isLoading || cart.length === 0}
                  className={`w-full py-4 rounded-2xl font-black text-sm tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl mt-4
                    ${isLoading || cart.length === 0 ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'}`}
                 >
                    {isLoading ? <RefreshCw className="animate-spin" size={20}/> : <Save size={20}/>}
                    {isEditing ? 'ACTUALIZAR VENTA' : 'FINALIZAR VENTA'}
                 </button>
              </div>
           </div>
        </div>
      </div>

      {/* Mobile Floating Action Buttons */}
      <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 flex bg-white rounded-full shadow-2xl p-1 border border-slate-200 z-40">
         <button onClick={() => setMobileTab('CATALOG')} className={`px-6 py-2.5 rounded-full text-xs font-black transition-all flex items-center gap-2 ${mobileTab === 'CATALOG' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><LayoutGrid size={16}/> CATÁLOGO</button>
         <button onClick={() => setMobileTab('CART')} className={`px-6 py-2.5 rounded-full text-xs font-black transition-all flex items-center gap-2 ${mobileTab === 'CART' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><ShoppingCart size={16}/> CARRITO ({cart.length})</button>
      </div>
    </div>
  );
};

export default POS;
