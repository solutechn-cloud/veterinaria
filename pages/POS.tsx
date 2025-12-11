
import React, { useState, useEffect } from 'react';
import { InventoryService, ClientService, SalesService, CashService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Smartphone, Headphones, Zap, RefreshCw, List, LayoutGrid, Save } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

const POS: React.FC = () => {
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [cart, setCart] = useState<DetalleVenta[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  
  // Mobile View State
  const [mobileTab, setMobileTab] = useState<'CATALOG' | 'CART'>('CATALOG');

  const [clients, setClients] = useState<Cliente[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  
  const [paymentType, setPaymentType] = useState<'Contado' | 'Credito'>('Contado');
  const [discount, setDiscount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  
  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    checkRegisterStatus();
    loadInitialData();
  }, []);

  // Handle Custom Item passed from Cash Register OR Edit Mode
  useEffect(() => {
      const state = location.state as any;
      
      // 1. Ingreso Manual desde Caja (Custom Item)
      if (state && state.customItem) {
          const { descripcion, precio } = state.customItem;
          const newItem: DetalleVenta = {
              codDetalleVenta: `MANUAL-${Date.now()}`,
              cantidad: 1,
              precioVenta: Number(precio),
              descripcionProducto: descripcion,
              tipoProducto: 'SERVICIO'
          };
          setCart(prev => [...prev, newItem]);
          // Clean state
          window.history.replaceState({}, document.title);
      }

      // 2. Modo Edición (Edit Sale)
      if (state && state.editSaleId) {
          loadSaleToEdit(state.editSaleId);
      }

  }, [location]);

  const checkRegisterStatus = async () => {
     try {
       const activeArqueo = await CashService.getActiveArqueo();
       if (!activeArqueo) {
         await Swal.fire({
           title: 'Caja Cerrada',
           text: 'Debes aperturar la caja antes de facturar.',
           icon: 'warning',
           confirmButtonText: 'Ir a Caja'
         });
         navigate('/cash');
       }
     } catch (error) {
       console.error("Error checking register", error);
     }
  };

  const loadInitialData = () => {
    setIsLoading(true);
    Promise.all([
      InventoryService.getUnifiedProducts(),
      ClientService.getAll()
    ]).then(([prodData, clientData]) => {
      setProducts(prodData || []);
      setClients(clientData || []);
    }).catch(err => console.error(err))
      .finally(() => setIsLoading(false));
  };

  const loadSaleToEdit = async (saleId: string) => {
      try {
          setIsLoading(true);
          setIsEditing(true);
          setEditingSaleId(saleId);
          
          // 1. Obtener detalles de productos (Items)
          const details = await SalesService.getDetallesVenta(saleId);
          setCart(details);

          // 2. Obtener cabecera de la venta (Total, Cliente, Estado)
          const header = await SalesService.getVenta(saleId);
          
          if (header) {
              // Asegurar el seteo del cliente
              setSelectedClientId(header.identidadCliente);

              // Calcular descuento inverso: (Suma Productos) - (Total Pagado)
              const subtotalCalculado = details.reduce((sum, item) => sum + (Number(item.cantidad) * Number(item.precioVenta)), 0);
              const totalGuardado = Number(header.total);
              // Si el total guardado es menor que la suma de productos, hubo descuento
              const descuentoAplicado = subtotalCalculado - totalGuardado;
              
              setDiscount(descuentoAplicado > 0.01 ? descuentoAplicado : 0);
          }
          
          const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000
          });
          Toast.fire({ icon: 'info', title: `Editando Venta #${saleId}` });

      } catch (error) {
          console.error(error);
          Swal.fire('Error', 'No se pudo cargar la venta para edición', 'error');
          setIsEditing(false);
          setEditingSaleId(null);
      } finally {
          setIsLoading(false);
      }
  };

  const getClientDetails = () => {
    return clients.find(c => c.identidad === selectedClientId);
  };

  const addToCart = (product: ProductoUnified) => {
    setCart(prev => {
      const existing = prev.find(item => 
        (item.idTelefono === product.id) || (item.idInventario === product.id)
      );

      if (existing) {
        if(product.tipo === 'TELEFONO') {
           Swal.fire('Error', 'Los teléfonos son únicos (por IMEI) y no se pueden sumar.', 'error');
           return prev;
        }
        if (existing.cantidad + 1 > product.stock) {
           Swal.fire('Stock Insuficiente', 'No hay más unidades disponibles.', 'warning');
           return prev;
        }
        return prev.map(item => {
           const isMatch = (item.idTelefono === product.id) || (item.idInventario === product.id);
           return isMatch ? { ...item, cantidad: item.cantidad + 1 } : item;
        });
      }

      const newItem: DetalleVenta = {
        codDetalleVenta: `TEMP-${Date.now()}`,
        idTelefono: product.tipo === 'TELEFONO' ? product.id : undefined,
        idInventario: product.tipo === 'ACCESORIO' ? product.id : undefined,
        cantidad: 1,
        precioVenta: Number(product.precioVenta),
        descripcionProducto: product.nombre,
        tipoProducto: product.tipo
      };
      return [...prev, newItem];
    });
    // Feedback
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 1000,
      timerProgressBar: true
    });
    Toast.fire({ icon: 'success', title: 'Agregado' });
  };

  const removeFromCart = (tempId: string) => {
    setCart(prev => prev.filter(item => item.codDetalleVenta !== tempId));
  };

  const calculateTotal = () => {
    const grossTotal = cart.reduce((acc, item) => acc + (item.cantidad * item.precioVenta), 0);
    const finalTotal = grossTotal - discount;
    const isv = finalTotal * 0.15; // Estimado, backend calcula si es necesario
    const subtotal = finalTotal - isv;

    return { 
      subtotal: subtotal > 0 ? subtotal : 0, 
      tax: isv > 0 ? isv : 0, 
      total: finalTotal > 0 ? finalTotal : 0 
    };
  };

  const { subtotal, tax, total } = calculateTotal();

  // --- PDF GENERATION ---
  const generateInvoicePDF = (codVenta: string, date: Date) => {
    try {
      const doc = new jsPDF();
      const client = getClientDetails();

      doc.setFont("helvetica", "normal");
      
      doc.setDrawColor(0);
      doc.rect(10, 10, 90, 30);
      doc.rect(110, 10, 90, 30);

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("SMARTCLOUD", 55, 18, { align: "center" });
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Mercado Nuevo-Avenida Valle", 55, 23, { align: "center" });
      doc.text("Telefono:+504-96676374", 55, 27, { align: "center" });

      doc.setFontSize(12);
      doc.text("FACTURA", 155, 18, { align: "center" });
      doc.setFontSize(10);
      doc.text(codVenta, 155, 23, { align: "center" });
      
      doc.setFontSize(8);
      doc.text(`FECHA: ${date.toLocaleDateString()}`, 115, 30);
      
      doc.rect(10, 45, 190, 20);
      doc.line(10, 55, 200, 55); 
      doc.line(110, 45, 110, 65); 

      doc.setFont("helvetica", "bold");
      doc.text("CLIENTE:", 12, 60);
      doc.setFont("helvetica", "normal");
      doc.text(client ? `${client.nombre} ${client.apellido}`.toUpperCase() : "CONSUMIDOR FINAL", 40, 60);

      let y = 70;
      doc.setFillColor(240, 240, 240);
      doc.rect(10, y, 190, 8, 'F');
      
      doc.setFont("helvetica", "bold");
      doc.text("DESCRIPCION", 15, y+5);
      doc.text("TOTAL", 190, y+5, { align: "center" });

      y += 8;
      doc.setFont("helvetica", "normal");
      cart.forEach(item => {
        const itemTotal = item.cantidad * item.precioVenta;
        doc.text(item.descripcionProducto?.substring(0, 40) || "", 15, y+5);
        doc.text(itemTotal.toFixed(2), 190, y+5, { align: "center" });
        y += 6;
      });

      doc.text(`TOTAL: ${total.toFixed(2)}`, 190, y + 10, { align: "right" });
      doc.save(`Factura_${codVenta}.pdf`);
    } catch (err) {
      console.error(err);
      Swal.fire("Error PDF", "No se pudo generar el PDF", "error");
    }
  };

  const handleProcessSale = async () => {
    if (cart.length === 0) return Swal.fire('Carrito Vacío', 'Agrega productos para facturar.', 'warning');
    if (!selectedClientId) return Swal.fire('Cliente Requerido', 'Selecciona un cliente para la factura.', 'warning');

    const result = await Swal.fire({
      title: isEditing ? '¿Actualizar Venta?' : '¿Procesar Venta?',
      text: `Total: L. ${total.toFixed(2)}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: isEditing ? 'Sí, Actualizar' : 'Sí, Facturar',
      confirmButtonColor: '#4f46e5'
    });

    if (result.isConfirmed) {
      try {
        const payload = {
            identidadCliente: selectedClientId,
            tipoCompra: paymentType,
            total: total,
            isv: tax,
            descuento: discount,
            detalles: cart
        };

        let response;
        if (isEditing && editingSaleId) {
            response = await SalesService.updateVenta(editingSaleId, payload);
        } else {
            response = await SalesService.createVenta(payload);
        }
        
        Swal.fire({
          title: 'Éxito',
          text: isEditing ? 'Venta actualizada correctamente' : 'Venta registrada',
          icon: 'success',
          showCancelButton: true,
          confirmButtonText: 'Imprimir',
          cancelButtonText: 'Cerrar'
        }).then((res) => {
          if (res.isConfirmed) {
            generateInvoicePDF(response.codVenta || 'NEW', new Date());
          }
        });

        // Reset
        setCart([]);
        setDiscount(0);
        setSelectedClientId('');
        setIsEditing(false);
        setEditingSaleId(null);
        // Remove location state
        window.history.replaceState({}, document.title);
        
        loadInitialData();
      } catch (error: any) {
        Swal.fire('Error', error.message, 'error');
      }
    }
  };

  const cancelEdit = () => {
      setIsEditing(false);
      setEditingSaleId(null);
      setCart([]);
      setSelectedClientId('');
      setDiscount(0);
      window.history.replaceState({}, document.title);
      Swal.fire('Edición Cancelada', 'Se ha limpiado el punto de venta.', 'info');
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.imei && p.imei.includes(searchTerm));
    const matchesCategory = selectedCategory === 'ALL' || p.tipo === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const clientInfo = getClientDetails();

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-140px)] relative">
      
      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex bg-white rounded-xl mb-4 p-1 border border-slate-200 shadow-sm shrink-0">
         <button 
           onClick={() => setMobileTab('CATALOG')}
           className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 ${mobileTab === 'CATALOG' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}
         >
           <LayoutGrid size={18} /> Catálogo
         </button>
         <button 
           onClick={() => setMobileTab('CART')}
           className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 ${mobileTab === 'CART' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}
         >
           <ShoppingCart size={18} /> Carrito ({cart.reduce((a,b) => a + b.cantidad, 0)})
         </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        
        {/* LEFT: Product Selector (Visible if Tab is CATALOG or screen is LG) */}
        <div className={`flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 ${mobileTab === 'CATALOG' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-4 border-b border-slate-100 flex flex-col gap-4 shrink-0">
            <div className="flex gap-3">
               <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Buscar (Nombre, Código, IMEI)..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm md:text-base font-medium placeholder:text-slate-400"
                />
              </div>
              <button onClick={loadInitialData} className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-3 rounded-xl transition-colors">
                <RefreshCw size={20}/>
              </button>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
               <button onClick={() => setSelectedCategory('ALL')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase whitespace-nowrap ${selectedCategory === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>Todos</button>
               <button onClick={() => setSelectedCategory('TELEFONO')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase whitespace-nowrap flex gap-2 ${selectedCategory === 'TELEFONO' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Smartphone size={14}/> Teléfonos</button>
               <button onClick={() => setSelectedCategory('ACCESORIO')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase whitespace-nowrap flex gap-2 ${selectedCategory === 'ACCESORIO' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Headphones size={14}/> Accesorios</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 custom-scrollbar">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-slate-400">Cargando inventario...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map(product => (
                  <button 
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={product.stock === 0}
                    className={`flex flex-col items-start p-4 bg-white rounded-xl border transition-all text-left relative overflow-hidden group active:scale-95
                      ${product.stock === 0 ? 'opacity-60 border-slate-100 grayscale' : 'border-slate-200/60 hover:border-indigo-500 hover:shadow-lg'}`}
                  >
                    <div className="w-full flex justify-between items-start mb-2">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-500 tracking-wider uppercase`}>
                        {product.tipo.substring(0,3)}
                      </span>
                      <span className={`text-[10px] font-bold ${product.stock > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'} px-2 py-1 rounded-md`}>
                        Stock: {product.stock}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm line-clamp-2 mb-auto leading-snug">{product.nombre}</h4>
                    <div className="mt-4 w-full pt-3 border-t border-slate-50">
                      <span className="block text-lg font-bold text-indigo-600">L. {Number(product.precioVenta).toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 block mt-1 truncate">Ubic: {product.ubicacion}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Cart & Checkout (Visible if Tab is CART or screen is LG) */}
        <div className={`w-full lg:w-[380px] xl:w-[420px] flex-col bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 h-full ${mobileTab === 'CART' ? 'flex' : 'hidden lg:flex'}`}>
          
          {/* Header: Sales Config */}
          <div className={`p-4 border-b border-slate-100 space-y-3 shrink-0 ${isEditing ? 'bg-amber-50' : 'bg-slate-50/50'}`}>
            <h3 className="font-bold text-slate-800 flex items-center justify-between gap-2">
               <span className="flex items-center gap-2">
                   <Zap className={isEditing ? 'text-amber-500' : 'text-yellow-500'} size={18} /> 
                   {isEditing ? `EDITANDO #${editingSaleId}` : 'VENTA'}
               </span>
               {isEditing && (
                   <button onClick={cancelEdit} className="text-xs bg-white border border-amber-200 text-amber-600 px-2 py-1 rounded">Cancelar</button>
               )}
            </h3>

            <div className="flex gap-2">
               <button 
                 onClick={() => setPaymentType('Contado')}
                 className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${paymentType === 'Contado' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white border text-slate-500'}`}
               >
                 Contado
               </button>
               <button 
                 onClick={() => setPaymentType('Credito')}
                 className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${paymentType === 'Credito' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white border text-slate-500'}`}
               >
                 Crédito
               </button>
            </div>

            <select 
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Cliente --</option>
                {clients.map(c => (
                  <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido}</option>
                ))}
            </select>

            {clientInfo && (
              <div className="p-2 bg-indigo-50 rounded border border-indigo-100 text-xs">
                 <p className="font-bold text-indigo-900">{clientInfo.nombre} {clientInfo.apellido}</p>
                 <p className="text-indigo-600 truncate">{clientInfo.direccion}</p>
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-slate-50/30">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
                <ShoppingCart size={32} className="opacity-30 mb-2" />
                <p className="font-medium text-sm">Carrito vacío</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.codDetalleVenta} className="flex gap-3 items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs font-bold text-slate-800 truncate">{item.descripcionProducto}</h5>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-500 font-medium">{item.cantidad} x L. {Number(item.precioVenta).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end min-w-[60px]">
                    <span className="font-bold text-slate-800 text-xs">L. {(item.cantidad * item.precioVenta).toFixed(2)}</span>
                    <button 
                      onClick={() => removeFromCart(item.codDetalleVenta!)}
                      className="text-red-400 hover:text-red-600 mt-1 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals & Action */}
          <div className="p-5 bg-white border-t border-slate-200 shrink-0">
            <div className="space-y-1 mb-4">
              <div className="flex justify-between text-slate-500 text-xs">
                <span>Subtotal</span>
                <span>L. {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-xs">
                <span>ISV (15%)</span>
                <span>L. {tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500 text-xs py-1">
                <span>Desc.</span>
                <input 
                   type="number" 
                   value={discount} 
                   onChange={(e) => setDiscount(Number(e.target.value))}
                   className="w-16 text-right p-0.5 border rounded bg-slate-50 text-xs"
                />
              </div>
              <div className="flex justify-between items-end pt-2 border-t border-slate-100 mt-1">
                <span className="font-bold text-base text-slate-800">Total</span>
                <span className="font-bold text-xl text-indigo-600 font-mono">L. {total.toFixed(2)}</span>
              </div>
            </div>

            <button 
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-bold hover:opacity-90 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm active:scale-95 ${isEditing ? 'bg-amber-600 shadow-amber-600/30' : 'bg-indigo-600 shadow-indigo-600/30'}`}
              disabled={cart.length === 0 || !selectedClientId}
              onClick={handleProcessSale}
            >
              {isEditing ? <Save size={18}/> : <CreditCard size={18} />} 
              {isEditing ? 'ACTUALIZAR VENTA' : 'FACTURAR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POS;
