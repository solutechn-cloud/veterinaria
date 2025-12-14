
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, ClientService, SalesService, CashService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, EmpresaConfig, VentaPayload } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Smartphone, Headphones, Zap, RefreshCw, List, LayoutGrid, Save, User, X, Check, FileText } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import 'jspdf-autotable';

// Helper robusto para números a letras (Soporta miles y millones)
const numeroALetras = (num: number): string => {
    const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const diez_veinte = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const convertGroup = (n: number): string => {
        if (n === 0) return '';
        if (n === 100) return 'CIEN';
        
        let output = '';
        
        // Centenas
        if (n >= 100) {
            output += centenas[Math.floor(n / 100)] + ' ';
            n %= 100;
        }

        // Decenas y Unidades
        if (n >= 10 && n <= 19) {
            output += diez_veinte[n - 10];
        } else if (n >= 20) {
            output += decenas[Math.floor(n / 10)];
            if (n % 10 > 0) output += ' Y ' + unidades[n % 10];
        } else if (n > 0) {
            output += unidades[n];
        }
        
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
        if (remainder > 0) text += ' ' + convertGroup(Math.floor(remainder / 1000)) + ' MIL ' + convertGroup(remainder % 1000);
    } 
    else if (integerPart >= 1000) {
        const thousands = Math.floor(integerPart / 1000);
        const remainder = integerPart % 1000;
        text += (thousands === 1 ? 'MIL' : convertGroup(thousands) + ' MIL');
        if (remainder > 0) text += ' ' + convertGroup(remainder);
    } 
    else {
        text = convertGroup(integerPart);
    }

    return `${text} CON ${decimalPart}/100 LEMPIRAS`;
};

const POS: React.FC = () => {
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [cart, setCart] = useState<DetalleVenta[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  
  // Mobile View State
  const [mobileTab, setMobileTab] = useState<'CATALOG' | 'CART'>('CATALOG');

  const [clients, setClients] = useState<Cliente[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [companyConfig, setCompanyConfig] = useState<EmpresaConfig | null>(null);
  
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
          navigate(location.pathname, { replace: true, state: {} });
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
      ClientService.getAll(),
      ConfigService.get()
    ]).then(([prodData, clientData, configData]) => {
      setProducts(prodData || []);
      setClients(clientData || []);
      setCompanyConfig(configData);
    }).catch(err => console.error(err))
      .finally(() => setIsLoading(false));
  };

  const loadSaleToEdit = async (saleId: string) => {
      try {
          setIsLoading(true);
          setIsEditing(true);
          setEditingSaleId(saleId);
          
          const details = await SalesService.getDetallesVenta(saleId);
          const cleanDetails = details.map(d => ({
              ...d,
              cantidad: Number(d.cantidad),
              precioVenta: Number(d.precioVenta)
          }));
          setCart(cleanDetails);

          const header = await SalesService.getVenta(saleId);
          if (header) {
              setSelectedClientId(header.identidadCliente);
              setPaymentType(header.tipoCompra as any || 'Contado');
              setDiscount(Number(header.descuento) || 0);
          }
          
          Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: `Editando Venta #${saleId}`, showConfirmButton: false, timer: 2000 });

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
    
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Agregado', showConfirmButton: false, timer: 1000 });
  };

  const removeFromCart = (tempId: string) => {
    setCart(prev => prev.filter(item => item.codDetalleVenta !== tempId));
  };

  // Cálculo Monetario
  const calculateTotal = () => {
    const totalVenta = cart.reduce((acc, item) => acc + (item.cantidad * item.precioVenta), 0);
    const totalConDescuento = Math.max(0, totalVenta - discount);
    
    const isvRate = (companyConfig?.isv || 15) / 100;
    const subtotal = totalConDescuento / (1 + isvRate);
    const tax = totalConDescuento - subtotal;

    return { 
      subtotal, 
      tax, 
      total: totalConDescuento 
    };
  };

  const { subtotal, tax, total } = calculateTotal();

  // --- GENERACIÓN PDF FACTURA MODERNA (Estilo Azul/Corporativo) ---
  const generateInvoicePDF = (codVenta: string, date: Date) => {
    try {
      const doc = new jsPDF();
      const client = getClientDetails();
      const config = companyConfig || { nombreEmpresa: 'SMARTCLOUD', rtn: '', direccion: '', isv: 15 } as any;
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const primaryColor = "#1e3a8a";   
      const accentColor = "#3b82f6";    
      const grayColor = "#64748b";      
      const lightGray = "#f1f5f9";      

      // Header geométrico
      doc.setFillColor(primaryColor);
      doc.triangle(0, 0, pageWidth, 0, pageWidth, 35, 'F');
      doc.triangle(0, 0, pageWidth, 35, 0, 50, 'F');
      doc.setFillColor(accentColor);
      doc.triangle(0, 0, 100, 0, 0, 50, 'F');

      // Info Empresa
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(config.nombreEmpresa.toUpperCase(), 35, 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(config.direccion || '', 35, 24);
      doc.text(`Tel: ${config.telefono} | ${config.correo || ''}`, 35, 29);

      // Título
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text("FACTURA", pageWidth - 15, 20, { align: "right" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`NO. ${codVenta}`, pageWidth - 15, 28, { align: "right" });

      const topInfoY = 60;
      doc.setFillColor(lightGray);
      doc.roundedRect(14, topInfoY, 90, 35, 3, 3, 'F');
      
      doc.setTextColor(primaryColor);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("CLIENTE:", 18, topInfoY + 6);
      
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(client?.nombre ? `${client.nombre} ${client.apellido}` : "CONSUMIDOR FINAL", 18, topInfoY + 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(grayColor);
      doc.text(`ID: ${client?.identidad || "N/A"}`, 18, topInfoY + 17);
      doc.text(`Dir: ${client?.direccion || "N/A"}`, 18, topInfoY + 22);

      const rightColX = 115;
      doc.text("FECHA:", rightColX, topInfoY + 5);
      doc.setTextColor(0,0,0);
      doc.text(date.toLocaleDateString(), rightColX + 40, topInfoY + 5);
      
      doc.setTextColor(grayColor);
      doc.text("VENCIMIENTO:", rightColX, topInfoY + 10);
      doc.setTextColor(0,0,0);
      doc.text(config.fechaLimite ? new Date(config.fechaLimite).toLocaleDateString() : 'N/A', rightColX + 40, topInfoY + 10);

      doc.setTextColor(grayColor);
      doc.text("CAI:", rightColX, topInfoY + 15);
      doc.setTextColor(0,0,0);
      doc.text(config.cai || '', rightColX + 40, topInfoY + 15);

      // Tabla
      // @ts-ignore
      doc.autoTable({
          startY: topInfoY + 40,
          head: [['CANT.', 'DESCRIPCIÓN', 'PRECIO UNIT.', 'TOTAL']],
          body: cart.map(item => [
              item.cantidad,
              item.descripcionProducto,
              `L. ${Number(item.precioVenta).toFixed(2)}`,
              `L. ${(Number(item.cantidad) * Number(item.precioVenta)).toFixed(2)}`
          ]),
          theme: 'striped',
          styles: { fontSize: 9, cellPadding: 3, textColor: [50, 50, 50] },
          headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
          columnStyles: { 0: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
          margin: { left: 14, right: 14 }
      });

      // @ts-ignore
      let finalY = doc.lastAutoTable.finalY + 5;
      const totalsX = 130;

      // Totals
      doc.text("Subtotal:", totalsX, finalY);
      doc.text(`L. ${subtotal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
      finalY += 6;
      doc.text("ISV:", totalsX, finalY);
      doc.text(`L. ${tax.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
      finalY += 6;
      if(discount > 0) {
          doc.text("Descuento:", totalsX, finalY);
          doc.text(`L. ${discount.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 6;
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryColor);
      doc.text("TOTAL:", totalsX, finalY);
      doc.text(`L. ${total.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});

      // Letras
      doc.setTextColor(grayColor);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("SON: " + numeroALetras(total), 14, finalY);

      // Footer
      doc.setFillColor(lightGray);
      doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
      doc.setTextColor(primaryColor);
      doc.text(config.mensajeFinal || "GRACIAS POR SU COMPRA", pageWidth / 2, pageHeight - 6, { align: "center" });

      doc.save(`Factura_${codVenta}.pdf`);

    } catch (e:any) {
        Swal.fire('Error', 'No se pudo generar la factura: ' + e.message, 'error');
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return Swal.fire('Carrito Vacío', 'Agregue productos antes de facturar.', 'warning');
    if (!selectedClientId) return Swal.fire('Cliente Requerido', 'Seleccione un cliente para la factura.', 'warning');

    const payload: VentaPayload = {
        identidadCliente: selectedClientId,
        tipoCompra: paymentType,
        total: total,
        isv: tax,
        descuento: discount,
        detalles: cart.map(item => ({
            idTelefono: item.idTelefono,
            idInventario: item.idInventario,
            cantidad: item.cantidad,
            precioVenta: item.precioVenta,
            tipoProducto: item.tipoProducto
        })),
        fecha: isEditing && (location.state as any)?.saleData?.fecha ? (location.state as any).saleData.fecha : undefined
    };

    try {
        setIsLoading(true);
        let result;
        if (isEditing && editingSaleId) {
             result = await SalesService.updateVenta(editingSaleId, payload);
        } else {
             result = await SalesService.createVenta(payload);
        }
        
        const codVenta = result.codVenta || editingSaleId;
        
        // PDF Generation
        generateInvoicePDF(codVenta!, new Date());

        Swal.fire({
            title: isEditing ? 'Venta Actualizada' : 'Venta Procesada',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
        });

        // Reset
        setCart([]);
        setPaymentType('Contado');
        setDiscount(0);
        setSelectedClientId('');
        setIsEditing(false);
        setEditingSaleId(null);
        navigate(location.pathname, { replace: true, state: {} });

    } catch (err: any) {
        console.error(err);
        Swal.fire('Error', err.message, 'error');
    } finally {
        setIsLoading(false);
    }
  };

  const filteredProducts = products.filter(p => {
      const matchSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.codigo && p.codigo.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (p.imei && p.imei.includes(searchTerm));
      const matchCat = selectedCategory === 'ALL' || p.tipo === selectedCategory;
      return matchSearch && matchCat;
  });

  return (
    <div className="flex flex-col md:flex-row h-full gap-4 pb-20 md:pb-0">
        {/* --- LEFT: CATALOG --- */}
        <div className={`flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden ${mobileTab === 'CART' ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 border-b border-slate-100 space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar producto, IMEI, código..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {['ALL', 'TELEFONO', 'ACCESORIO'].map(cat => (
                        <button 
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${selectedCategory === cat ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                            {cat === 'ALL' ? 'Todos' : cat}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredProducts.map(p => (
                        <div key={p.id} onClick={() => addToCart(p)} className="border border-slate-100 rounded-xl p-3 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all group relative bg-white">
                            <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${p.tipo === 'TELEFONO' ? 'bg-blue-500' : 'bg-orange-500'}`}></div>
                            <div className="mb-2 flex justify-center">
                                {p.tipo === 'TELEFONO' ? <Smartphone className="text-slate-300 group-hover:text-blue-500 transition-colors" size={32}/> : <Headphones className="text-slate-300 group-hover:text-orange-500 transition-colors" size={32}/>}
                            </div>
                            <h4 className="font-bold text-sm text-slate-700 leading-tight mb-1 line-clamp-2">{p.nombre}</h4>
                            <p className="text-xs text-slate-400 mb-2 truncate">{p.codigo} {p.imei && `| ${p.imei.substring(0,8)}...`}</p>
                            <div className="flex justify-between items-center mt-auto">
                                <span className="font-bold text-indigo-600">L. {Number(p.precioVenta).toFixed(0)}</span>
                                <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">Stock: {p.stock}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* --- RIGHT: CART & CHECKOUT --- */}
        <div className={`w-full md:w-[400px] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden ${mobileTab === 'CATALOG' ? 'hidden md:flex' : 'flex'}`}>
            {/* Client Selector */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2 mb-2">
                    <User size={16} className="text-indigo-600"/>
                    <label className="text-xs font-bold text-slate-500 uppercase">Cliente</label>
                </div>
                <select 
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500"
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                >
                    <option value="">-- Seleccionar Cliente --</option>
                    {clients.map(c => (
                        <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido}</option>
                    ))}
                </select>
                {selectedClientId && (
                    <div className="mt-2 text-xs text-slate-500 px-2 flex justify-between">
                        <span>RTN/ID: {selectedClientId}</span>
                        {/* Short logic to show discount if client has logic, currently manual */}
                    </div>
                )}
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                        <ShoppingCart size={48} strokeWidth={1} className="mb-2"/>
                        <p className="text-sm">Carrito vacío</p>
                    </div>
                ) : (
                    cart.map(item => (
                        <div key={item.codDetalleVenta} className="flex gap-3 p-2 bg-white border border-slate-100 rounded-lg group hover:border-indigo-100 transition-colors">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${item.tipoProducto === 'TELEFONO' ? 'bg-blue-50 text-blue-500' : 'bg-orange-50 text-orange-500'}`}>
                                {item.tipoProducto === 'TELEFONO' ? <Smartphone size={18}/> : <Headphones size={18}/>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-700 truncate">{item.descripcionProducto}</p>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs font-mono bg-slate-100 px-1.5 rounded">{item.cantidad} x L.{item.precioVenta}</span>
                                    {item.tipoProducto === 'ACCESORIO' && (
                                        <div className="flex items-center gap-1">
                                            {/* Logic to change quantity could be added here */}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col items-end justify-between">
                                <span className="font-bold text-sm text-slate-800">L.{(item.cantidad * item.precioVenta).toFixed(0)}</span>
                                <button onClick={() => removeFromCart(item.codDetalleVenta!)} className="text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Totals & Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200">
                {/* Payment Settings */}
                <div className="flex gap-2 mb-4">
                    <button 
                        onClick={() => setPaymentType('Contado')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${paymentType === 'Contado' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200'}`}
                    >
                        Contado
                    </button>
                    <button 
                        onClick={() => setPaymentType('Credito')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${paymentType === 'Credito' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-slate-500 border-slate-200'}`}
                    >
                        Crédito
                    </button>
                </div>
                
                <div className="space-y-1 mb-4 text-sm">
                    <div className="flex justify-between text-slate-500">
                        <span>Subtotal</span>
                        <span>L. {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                        <span>ISV ({(companyConfig?.isv || 15)}%)</span>
                        <span>L. {tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500">
                        <span>Descuento</span>
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded px-1 w-20">
                            <span className="text-xs">L.</span>
                            <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))} className="w-full text-right outline-none text-xs py-1" />
                        </div>
                    </div>
                    <div className="flex justify-between text-lg font-bold text-slate-800 pt-2 border-t border-slate-200 mt-2">
                        <span>Total</span>
                        <span>L. {total.toFixed(2)}</span>
                    </div>
                </div>

                <button 
                    onClick={handleCheckout}
                    disabled={isLoading || cart.length === 0}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                >
                    {isLoading ? <RefreshCw className="animate-spin" size={20}/> : <CreditCard size={20}/>}
                    {isEditing ? 'ACTUALIZAR VENTA' : 'COBRAR'}
                </button>
                
                {isEditing && (
                    <button onClick={() => { setIsEditing(false); setCart([]); setEditingSaleId(null); setSelectedClientId(''); navigate(location.pathname, { replace: true, state: {} }); }} className="w-full mt-2 py-2 text-slate-500 text-xs font-bold hover:bg-slate-200 rounded-lg">
                        CANCELAR EDICIÓN
                    </button>
                )}
            </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-2 flex gap-2 z-30 pb-safe">
            <button 
                onClick={() => setMobileTab('CATALOG')} 
                className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${mobileTab === 'CATALOG' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
                <LayoutGrid size={18}/> Catálogo
            </button>
            <button 
                onClick={() => setMobileTab('CART')} 
                className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${mobileTab === 'CART' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
                <ShoppingCart size={18}/> 
                <span>Carrito ({cart.length})</span>
            </button>
        </div>
    </div>
  );
};

export default POS;
