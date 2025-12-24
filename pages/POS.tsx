
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, ClientService, SalesService, CashService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, EmpresaConfig, VentaPayload } from '../types';
import { Search, ShoppingCart, Trash2, Smartphone, Zap, RefreshCw, User, X, Check, Plus, Minus, UserPlus, Grid, Filter, Tag, LayoutGrid, Wallet, CreditCard, Save } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

// Helper robusto para números a letras (Soporta miles y millones correctamente)
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
  const [companyConfig, setCompanyConfig] = useState<EmpresaConfig | null>(null);
  
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

  // --- GENERACIÓN DE FACTURA (DISEÑO GEOMÉTRICO RESTAURADO) ---
  const generateInvoicePDF = (saleId: string) => {
      try {
          const client = clients.find(c => c.identidad === selectedClientId);
          const doc = new jsPDF();
          const config = companyConfig || { nombreEmpresa: 'SMARTCLOUD', rtn: '', direccion: '', isv: 15, cai: '', rangoInicial: '', rangoFinal: '', fechaLimite: '', mensajeFinal: '' } as any;
          const pageWidth = doc.internal.pageSize.width;
          const pageHeight = doc.internal.pageSize.height;
          
          const primaryColor = "#1e3a8a";   
          const accentColor = "#3b82f6";    
          const grayColor = "#64748b";      
          const lightGray = "#f1f5f9";      

          // Header geométrico (Triángulos)
          doc.setFillColor(primaryColor);
          doc.triangle(0, 0, pageWidth, 0, pageWidth, 35, 'F');
          doc.triangle(0, 0, pageWidth, 35, 0, 50, 'F');
          doc.setFillColor(accentColor);
          doc.triangle(0, 0, 100, 0, 0, 50, 'F');

          // Info Empresa
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(18);
          doc.text(config.nombreEmpresa.toUpperCase(), 35, 18);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(config.direccion || '', 35, 24);
          doc.text(`Tel: ${config.telefono} | ${config.correo || ''}`, 35, 29);

          // Título Factura
          doc.setFontSize(24);
          doc.setFont("helvetica", "bold");
          doc.text("FACTURA", pageWidth - 15, 20, { align: "right" });
          doc.setFontSize(11);
          doc.text(`NO. ${saleId}`, pageWidth - 15, 29, { align: "right" });

          // Bloque de Cliente
          const topInfoY = 60;
          doc.setFillColor(lightGray);
          doc.roundedRect(14, topInfoY, 90, 38, 3, 3, 'F');
          
          doc.setTextColor(primaryColor);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("FACTURAR A:", 18, topInfoY + 8);
          
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(12);
          doc.text(client ? `${client.nombre} ${client.apellido}`.toUpperCase() : "CONSUMIDOR FINAL", 18, topInfoY + 16);
          
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(grayColor);
          doc.text(`RTN/DNI: ${selectedClientId || "99999999999999"}`, 18, topInfoY + 23);
          doc.text(`${client?.direccion || "CHOLUTECA, HONDURAS"}`, 18, topInfoY + 28);

          // Metadatos derecha
          const rightColX = 115;
          const metaY = topInfoY + 5;
          doc.setFont("helvetica", "bold");
          doc.text("FECHA EMISIÓN:", rightColX, metaY);
          doc.text("FECHA VENC.:", rightColX, metaY + 6);
          doc.text("R.T.N. EMISOR:", rightColX, metaY + 12);
          doc.text("CAI:", rightColX, metaY + 18);
          doc.text("VENDEDOR:", rightColX, metaY + 24);

          const emissionDate = new Date();
          const dueDate = new Date(); dueDate.setDate(emissionDate.getDate() + 30);
          
          doc.setFont("helvetica", "normal");
          doc.setTextColor(0,0,0);
          doc.text(emissionDate.toLocaleDateString('es-HN'), rightColX + 45, metaY);
          doc.text(dueDate.toLocaleDateString('es-HN'), rightColX + 45, metaY + 6);
          doc.text(config.rtn || 'N/A', rightColX + 45, metaY + 12);
          doc.text(config.cai || 'N/A', rightColX + 45, metaY + 18);
          doc.text(user?.nombreEmpleado?.toUpperCase() || "ADMIN", rightColX + 45, metaY + 24);

          // Tabla de Productos
          // @ts-ignore
          doc.autoTable({
              startY: topInfoY + 45,
              head: [['CANT.', 'DESCRIPCIÓN', 'PRECIO UNIT.', 'TOTAL']],
              body: cart.map(item => [
                  item.cantidad, 
                  item.descripcionProducto?.toUpperCase(), 
                  `L. ${Number(item.precioVenta).toFixed(2)}`, 
                  `L. ${(Number(item.cantidad) * Number(item.precioVenta)).toFixed(2)}`
              ]),
              theme: 'striped',
              styles: { fontSize: 9, cellPadding: 3, textColor: [0, 0, 0] },
              headStyles: { fillColor: [30, 58, 138], fontStyle: 'bold', halign: 'center', textColor: [255, 255, 255] },
              columnStyles: { 
                  0: { halign: 'center', cellWidth: 20 }, 
                  1: { halign: 'left' },
                  2: { halign: 'right', cellWidth: 40 }, 
                  3: { halign: 'right', fontStyle: 'bold', cellWidth: 40 } 
              },
              margin: { left: 14, right: 14 }
          });

          // Totales
          // @ts-ignore
          let finalY = doc.lastAutoTable.finalY + 10;
          const totalsX = 135;
          doc.setFontSize(10);
          doc.setTextColor(grayColor);
          doc.setFont("helvetica", "normal");
          
          doc.text("Subtotal:", totalsX, finalY); 
          doc.text(`L. ${totals.subtotal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          
          finalY += 7;
          doc.text("Descuentos:", totalsX, finalY); 
          doc.text(`L. ${discount.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          
          finalY += 7;
          doc.text(`ISV (${config.isv || 15}%):`, totalsX, finalY); 
          doc.text(`L. ${totals.isv.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          
          finalY += 3;
          doc.setDrawColor(primaryColor);
          doc.setLineWidth(0.5);
          doc.line(totalsX, finalY, pageWidth - 14, finalY);
          
          finalY += 6;
          doc.setFont("helvetica", "bold"); 
          doc.setTextColor(primaryColor);
          doc.setFontSize(13);
          doc.text("TOTAL A PAGAR:", totalsX, finalY);
          doc.text(`L. ${totals.total.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});

          // Cantidad en letras
          doc.setTextColor(grayColor);
          doc.setFontSize(9);
          doc.text("SON: " + numeroALetras(totals.total), 14, finalY + 12);

          // Pie Legal
          let footerY = pageHeight - 40;
          doc.setFontSize(8); 
          doc.setTextColor(grayColor);
          doc.setFont("helvetica", "normal");
          doc.text(`Rango Autorizado: ${config.rangoInicial || 'N/A'} al ${config.rangoFinal || 'N/A'}`, 14, footerY);
          doc.text(`Fecha Límite de Emisión: ${config.fechaLimite || 'N/A'}`, 14, footerY + 5);
          doc.text(`Original: Cliente | Copia: Emisor`, 14, footerY + 10);
          
          // Banda Inferior
          doc.setFillColor(lightGray);
          doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
          doc.setTextColor(primaryColor);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text("LA FACTURA ES BENEFICIO DE TODOS, EXIJALA", pageWidth / 2, pageHeight - 6, { align: "center" });

          doc.save(`Factura_${saleId}.pdf`);
      } catch (err) {
          console.error(err);
          Swal.fire('Error PDF', 'No se pudo generar la factura legal', 'error');
      }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!selectedClientId) return Swal.fire('Cliente Requerido', 'Seleccione un cliente.', 'warning');
    
    if (paymentType === 'KrediYa') {
        if (primaAmount <= 0) return Swal.fire('Prima Requerida', 'La venta KrediYa requiere un pago inicial.', 'warning');
        if (primaAmount >= totals.total) return Swal.fire('Monto Inválido', 'La prima no puede ser mayor o igual al total.', 'error');
    }

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
        detalles: cart
      };

      let saleId = "";
      if (isEditing && editingSaleId) {
        await SalesService.updateVenta(editingSaleId, payload);
        saleId = editingSaleId;
        Swal.fire('Actualizado', 'Venta modificada con éxito', 'success');
      } else {
        const response = await SalesService.createVenta(payload);
        saleId = response.codVenta;
        Swal.fire({
            title: '¡Venta Exitosa!',
            text: `Factura #${saleId} generada.`,
            icon: 'success',
            showCancelButton: true,
            confirmButtonText: 'Imprimir Factura',
            cancelButtonText: 'Cerrar',
            confirmButtonColor: '#1e3a8a'
        }).then(res => {
            if(res.isConfirmed) generateInvoicePDF(saleId);
        });
      }

      resetPOS();
    } catch (e: any) {
      Swal.fire('Error', e.message, 'error');
    } finally { setIsLoading(false); }
  };

  const resetPOS = () => {
    setCart([]);
    setDiscount(0);
    setPrimaAmount(0);
    setSelectedClientId('');
    setIsEditing(false);
    setEditingSaleId(null);
    setPaymentType('Contado');
    navigate('/pos', { state: {} });
    loadInitialData();
  };

  const brands = useMemo(() => ['ALL', ...new Set(products.filter(p => p.tipo === 'TELEFONO').map(p => p.marca!))].sort(), [products]);
  const categories = useMemo(() => ['ALL', ...new Set(products.filter(p => p.tipo === 'ACCESORIO').map(p => p.categoria!))].sort(), [products]);

  const filteredProducts = products.filter(p => {
    const matchSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || p.imei?.includes(searchTerm) || p.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = selectedType === 'ALL' || p.tipo === selectedType;
    const matchBrand = selectedType !== 'TELEFONO' || selectedBrand === 'ALL' || p.marca === selectedBrand;
    const matchCat = selectedType !== 'ACCESORIO' || selectedCategory === 'ALL' || p.categoria === selectedCategory;
    return matchSearch && matchType && matchBrand && matchCat;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] gap-6 overflow-hidden">
      <div className="lg:hidden flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm shrink-0">
         <button onClick={() => setMobileTab('CATALOG')} className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 ${mobileTab === 'CATALOG' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}><LayoutGrid size={16} /> Catálogo</button>
         <button onClick={() => setMobileTab('CART')} className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 ${mobileTab === 'CART' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}><ShoppingCart size={16} /> Carrito ({cart.reduce((a,b)=>a+b.cantidad,0)})</button>
      </div>
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        <div className={`flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex-1 ${mobileTab === 'CATALOG' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-4 border-b border-slate-100 space-y-4">
            <div className="flex gap-3">
               <div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="Buscar Producto, IMEI o Código..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500/30 outline-none text-sm font-medium" /></div>
               <button onClick={loadInitialData} className="bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 p-2.5 rounded-xl transition-all active:scale-95"><RefreshCw size={20} className={isLoading ? 'animate-spin' : ''}/></button>
            </div>
            <div className="flex flex-col gap-3">
               <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  <button onClick={() => {setSelectedType('ALL'); setSelectedBrand('ALL'); setSelectedCategory('ALL');}} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${selectedType === 'ALL' ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}>TODOS</button>
                  <button onClick={() => setSelectedType('TELEFONO')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap flex items-center gap-2 transition-all ${selectedType === 'TELEFONO' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}><Smartphone size={14}/> TELÉFONOS</button>
                  <button onClick={() => setSelectedType('ACCESORIO')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap flex items-center gap-2 transition-all ${selectedType === 'ACCESORIO' ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}><Zap size={14}/> ACCESORIOS</button>
               </div>
               {selectedType === 'TELEFONO' && (
                   <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1 animate-fade-in">
                       {brands.map(b => (
                           <button key={b} onClick={() => setSelectedBrand(b)} className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase transition-all border ${selectedBrand === b ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white text-slate-400 border-slate-200'}`}>{b === 'ALL' ? 'Todas las Marcas' : b}</button>
                       ))}
                   </div>
               )}
               {selectedType === 'ACCESORIO' && (
                   <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1 animate-fade-in">
                       {categories.map(c => (
                           <button key={c} onClick={() => setSelectedCategory(c)} className={`px-3 py-1 rounded-md text-[9px] font-bold uppercase transition-all border ${selectedCategory === c ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-white text-slate-400 border-slate-200'}`}>{c === 'ALL' ? 'Todas las Categorías' : c}</button>
                       ))}
                   </div>
               )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 custom-scrollbar">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map(p => (
                <button key={p.id} onClick={() => addToCart(p)} disabled={p.stock === 0} className={`flex flex-col items-start p-3 bg-white rounded-2xl border transition-all text-left relative group active:scale-95 shadow-sm ${p.stock === 0 ? 'opacity-50 grayscale' : 'border-slate-200/60 hover:border-indigo-500 hover:shadow-md'}`}>
                  <div className="w-full flex justify-between items-start mb-2"><span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase bg-slate-100 text-slate-500`}>{p.tipo.substring(0,3)}</span><span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${p.stock > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>Stock: {p.stock}</span></div>
                  <h4 className="font-bold text-slate-800 text-[11px] line-clamp-2 leading-tight min-h-[2.2rem]">{p.nombre}</h4>
                  <div className="mt-2 w-full pt-2 border-t border-slate-50"><span className="block text-sm font-black text-indigo-600">L. {Number(p.precioVenta).toLocaleString()}</span></div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={`w-full lg:w-[400px] flex-col bg-white rounded-3xl shadow-xl border border-slate-200 h-full ${mobileTab === 'CART' ? 'flex' : 'hidden lg:flex'}`}>
          <div className={`p-5 border-b space-y-4 shrink-0 bg-[#1e293b] text-white rounded-t-3xl`}>
            <div className="flex justify-between items-center"><h3 className="font-black text-sm uppercase tracking-wider flex items-center gap-2"><Zap className={isEditing ? 'text-amber-400' : 'text-indigo-400'} size={18} /> {isEditing ? `EDITANDO #${editingSaleId}` : 'VENTA ACTUAL'}</h3>{isEditing && <button onClick={resetPOS} className="text-[10px] font-black uppercase bg-red-500/20 text-red-400 px-2 py-1 rounded">Cancelar</button>}</div>
            <div className="grid grid-cols-3 gap-1">
               {['Contado', 'KrediYa', 'Credito'].map(type => (
                   <button key={type} onClick={() => setPaymentType(type as any)} className={`py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border-2 ${paymentType === type ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-transparent border-slate-700 text-slate-500'}`}>{type}</button>
               ))}
            </div>
            <div className="relative"><User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="w-full pl-9 pr-10 py-2.5 bg-slate-800 border-none rounded-xl text-xs font-bold text-white focus:ring-2 focus:ring-indigo-500 transition-all appearance-none"><option value="">CONSUMIDOR FINAL</option>{clients.map(c => <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido}</option>)}</select><button onClick={() => navigate('/clients')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg"><UserPlus size={14}/></button></div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-slate-50/30">
            {cart.length === 0 ? (<div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-30"><ShoppingCart size={64} strokeWidth={1} className="mb-2" /><p className="font-black text-xs uppercase">Carrito Vacío</p></div>) : (cart.map((item) => (
                <div key={item.codDetalleVenta} className="flex flex-col bg-white p-3 rounded-2xl border border-slate-100 shadow-sm animate-fade-in group"><div className="flex justify-between items-start mb-2"><div className="flex-1 min-w-0 pr-2"><h5 className="text-[11px] font-bold text-slate-800 leading-tight truncate">{item.descripcionProducto}</h5><p className="text-[9px] font-black text-indigo-600 mt-0.5">L. {Number(item.precioVenta).toLocaleString()}</p></div><button onClick={() => removeFromCart(item.codDetalleVenta!)} className="text-slate-300 hover:text-red-500 p-1"><X size={14}/></button></div><div className="flex justify-between items-center pt-2 border-t border-slate-50"><div className="flex items-center bg-slate-100 p-1 rounded-lg"><button disabled={item.tipoProducto === 'TELEFONO'} onClick={() => updateQty(item.codDetalleVenta!, -1)} className="w-6 h-6 flex items-center justify-center bg-white rounded-md text-slate-600 hover:text-indigo-600 disabled:opacity-30 shadow-sm"><Minus size={10}/></button><span className="text-[11px] font-black w-7 text-center">{item.cantidad}</span><button disabled={item.tipoProducto === 'TELEFONO'} onClick={() => updateQty(item.codDetalleVenta!, 1)} className="w-6 h-6 flex items-center justify-center bg-white rounded-md text-slate-600 hover:text-indigo-600 disabled:opacity-30 shadow-sm"><Plus size={10}/></button></div><span className="font-black text-slate-800 text-[11px]">L. {(item.cantidad * item.precioVenta).toLocaleString()}</span></div></div>
              ))
            )}
          </div>
          <div className="p-5 bg-white border-t border-slate-100 rounded-b-3xl">
            <div className="space-y-1.5 mb-4">
              <div className="flex justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider"><span>Subtotal</span><span>L. {totals.subtotal.toFixed(2)}</span></div>
              {paymentType === 'KrediYa' && (
                  <div className="animate-fade-in space-y-2 pt-1 bg-emerald-50 p-2 rounded-xl border border-emerald-100 mb-2">
                      <div className="flex justify-between items-center"><div className="flex items-center gap-2"><Wallet size={12} className="text-emerald-600"/><span className="text-[10px] font-black text-emerald-600 uppercase">Pago Prima</span></div><input type="number" value={primaAmount} onChange={(e) => setPrimaAmount(Math.max(0, Number(e.target.value)))} className="w-24 text-right py-1 px-2 border border-emerald-200 rounded-lg bg-white text-[12px] font-black text-emerald-700 outline-none" onFocus={e => e.target.select()} /></div>
                      <div className="flex justify-between text-slate-500 text-[10px] font-black uppercase px-1"><span>A Financiar:</span><span className="text-slate-800 font-bold">L. {totals.financiado.toFixed(2)}</span></div>
                  </div>
              )}
              <div className="flex justify-between items-center py-1 border-y border-slate-50"><div className="flex items-center gap-2"><Tag size={12} className="text-red-500"/><span className="text-[10px] font-black text-red-500 uppercase">Descuento</span></div><input type="number" value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} className="w-20 text-right py-1 px-2 border border-slate-100 rounded-lg bg-slate-50 text-[11px] font-black text-slate-800 outline-none" onFocus={e => e.target.select()} /></div>
              <div className="flex justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider"><span>ISV ({companyConfig?.isv || 15}%)</span><span>L. {totals.isv.toFixed(2)}</span></div>
              <div className="flex justify-between items-end pt-3"><span className="font-black text-xs text-slate-800 uppercase tracking-widest">Total Neto</span><span className="font-black text-2xl text-indigo-600 tracking-tighter">L. {totals.total.toFixed(2)}</span></div>
            </div>
            <button className={`w-full flex items-center justify-center gap-3 px-4 py-4 rounded-2xl text-white font-black transition-all shadow-xl disabled:bg-slate-200 disabled:shadow-none text-xs tracking-[0.2em] active:scale-95 ${isEditing ? 'bg-amber-600 shadow-amber-600/20' : (paymentType === 'KrediYa' ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-indigo-600 shadow-indigo-600/20 hover:bg-indigo-700')}`} disabled={cart.length === 0 || isLoading} onClick={handleCheckout}>{isLoading ? <RefreshCw className="animate-spin" size={18}/> : <Check size={18} strokeWidth={3}/>} {isEditing ? 'ACTUALIZAR VENTA' : 'FACTURAR'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POS;
