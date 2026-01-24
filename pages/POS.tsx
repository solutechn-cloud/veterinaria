
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, ClientService, SalesService, ConfigService, CashService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, VentaPayload, Arqueo } from '../types';
import { Search, ShoppingCart, RefreshCw, User, X, Check, Plus, Minus, UserPlus, Zap, LayoutGrid, Tag, Save, Wallet, Lock, Smartphone, Package, ChevronRight, Filter, DollarSign, ArrowLeft } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
// Fix para el entorno de ejecución
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate, useLocation } = ReactRouterDOM as any;

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
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  
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
      const [prodData, clientData, configData, activeArqueo] = await Promise.all([
        InventoryService.getUnifiedProducts(),
        ClientService.getAll(),
        ConfigService.get(),
        CashService.getActiveArqueo()
      ]);
      setProducts(prodData || []);
      setClients(clientData || []);
      setCompanyConfig(configData);
      setArqueo(activeArqueo);
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
          precioVenta: Number(d.precioVenta),
          idInventario: d.tipoProducto === 'ACCESORIO' ? d.idAccesorio : undefined
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

  const updatePrice = (id: string, newPrice: number) => {
    setCart(prev => prev.map(item => 
      item.codDetalleVenta === id ? { ...item, precioVenta: Math.max(0, newPrice) } : item
    ));
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
  const generateInvoicePDF = async (saleId: string) => {
      try {
          const [sale, details, cfg] = await Promise.all([
              SalesService.getVenta(saleId),
              SalesService.getDetallesVenta(saleId),
              ConfigService.get()
          ]);
          if (!sale) return;
          const LOGO_BASE64 = ""; 
          const doc = new jsPDF();
          const nombreEmpresa = (cfg.nombreempresa || cfg.nombreEmpresa || 'SMARTCLOUD ERP').toUpperCase();
          const rtnEmpresa = cfg.rtn || 'N/A';
          const direccionEmpresa = cfg.direccion || 'N/A';
          const telefonoEmpresa = cfg.telefono || 'N/A';
          const correoEmpresa = cfg.correo || 'N/A';
          const caiEmpresa = cfg.cai || 'N/A';
          const rangoInic = cfg.rangoinicial || cfg.rangoInicial || 'N/A';
          const rangoFin = cfg.rangofinal || cfg.rangoFinal || 'N/A';
          const fechaLim = (cfg.fechalimite || cfg.fechaLimite) ? new Date(cfg.fechalimite || cfg.fechaLimite).toLocaleDateString('es-HN') : 'N/A';
          const isvConfig = cfg.isv || 15;
          const mensajeFinal = cfg.mensajefinal || cfg.mensajeFinal || "LA FACTURA ES BENEFICIO DE TODOS, EXIJALA";
          const pageWidth = doc.internal.pageSize.width;
          const pageHeight = doc.internal.pageSize.height;
          const primaryColor = "#1e3a8a";   
          const accentColor = "#3b82f6";    
          const grayColor = "#64748b";      
          const lightGray = "#f1f5f9";      
          doc.setFillColor(primaryColor);
          doc.triangle(0, 0, pageWidth, 0, pageWidth, 35, 'F');
          doc.triangle(0, 0, pageWidth, 35, 0, 50, 'F');
          doc.setFillColor(accentColor);
          doc.triangle(0, 0, 100, 0, 0, 50, 'F');
          if (LOGO_BASE64) doc.addImage(LOGO_BASE64, 'PNG', 15, 12, 18, 18);
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.text(nombreEmpresa, 38, 18);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(direccionEmpresa, 38, 25);
          doc.text(`Tel: ${telefonoEmpresa} | ${correoEmpresa}`, 38, 30);
          doc.setFontSize(26);
          doc.setFont("helvetica", "bold");
          doc.text("FACTURA", pageWidth - 15, 20, { align: "right" });
          doc.setFontSize(10);
          doc.text(`NO. ${sale.codVenta}`, pageWidth - 15, 29, { align: "right" });
          const topInfoY = 60;
          doc.setFillColor(lightGray);
          doc.roundedRect(14, topInfoY, 95, 38, 3, 3, 'F');
          doc.setTextColor(primaryColor);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("FACTURAR A:", 18, topInfoY + 8);
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(13);
          doc.text((sale.nombreCliente || "CONSUMIDOR FINAL").toUpperCase(), 18, topInfoY + 18);
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(grayColor);
          doc.text(`RTN/DNI: ${sale.identidadCliente || "99999999999999"}`, 18, topInfoY + 26);
          doc.text(`${sale.direccionCliente || "CHOLUTECA, HONDURAS"}`, 18, topInfoY + 32);
          const rightColX = 120;
          const metaY = topInfoY + 5;
          const spacing = 6;
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(grayColor);
          const labels = ["FECHA EMISIÓN:", "FECHA VENCIMIENTO:", "R.T.N. EMISOR:", "CAI:", "VENDEDOR:"];
          const values = [new Date(sale.fecha).toLocaleDateString('es-HN'), fechaLim, rtnEmpresa, caiEmpresa, sale.nombreVendedor?.toUpperCase() || "ADMINISTRADOR"];
          labels.forEach((label, i) => {
              doc.text(label, rightColX, metaY + (i * spacing));
              doc.setTextColor(0, 0, 0);
              doc.text(String(values[i]), rightColX + 45, metaY + (i * spacing));
              doc.setTextColor(grayColor);
          });
          // @ts-ignore
          doc.autoTable({
              startY: topInfoY + 45,
              head: [['COD.', 'CANT.', 'DESCRIPCIÓN', 'PRECIO UNIT.', 'TOTAL']],
              body: details.map(item => [item.idTelefono || item.idInventario || 'N/A', item.cantidad, item.descripcionProducto?.toUpperCase() || 'PRODUCTO', `L. ${Number(item.precioVenta).toFixed(2)}`, `L. ${(Number(item.cantidad) * Number(item.precioVenta)).toFixed(2)}`]),
              theme: 'striped',
              styles: { fontSize: 9, cellPadding: 3, textColor: [0, 0, 0], halign: 'center' },
              headStyles: { fillColor: [30, 58, 138], fontStyle: 'bold', halign: 'center', textColor: [255, 255, 255] },
              columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 15 }, 2: { halign: 'left' }, 3: { cellWidth: 30 }, 4: { cellWidth: 30, fontStyle: 'bold' } },
              margin: { left: 14, right: 14 }
          });
          // @ts-ignore
          let finalY = doc.lastAutoTable.finalY + 10;
          const totalsX = 135;
          const isvRateNum = isvConfig / 100;
          const totalVal = Number(sale.total);
          const subtotalVal = totalVal / (1 + isvRateNum);
          const isvVal = totalVal - subtotalVal;
          const descuentVal = Number(sale.descuento || 0);
          doc.setFontSize(10);
          doc.setTextColor(grayColor);
          doc.setFont("helvetica", "normal");
          doc.text("Subtotal:", totalsX, finalY); doc.text(`L. ${subtotalVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 7;
          doc.text("Descuentos:", totalsX, finalY); doc.text(`L. ${descuentVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 7;
          doc.text(`ISV (${isvConfig}%):`, totalsX, finalY); doc.text(`L. ${isvVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 3;
          doc.setDrawColor(primaryColor); doc.setLineWidth(0.5); doc.line(totalsX, finalY, pageWidth - 14, finalY);
          finalY += 6;
          doc.setFont("helvetica", "bold"); doc.setTextColor(primaryColor); doc.setFontSize(13); doc.text("TOTAL A PAGAR:", totalsX, finalY); doc.text(`L. ${totalVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          doc.setTextColor(grayColor); doc.setFontSize(9); doc.text("SON: " + numeroALetras(totalVal), 14, finalY + 12);
          let footerY = pageHeight - 40;
          doc.setFontSize(8); doc.setTextColor(grayColor); doc.setFont("helvetica", "normal");
          doc.text(`Rango Autorizado: ${rangoInic} al ${rangoFin}`, 14, footerY);
          doc.text(`Fecha Límite de Emisión: ${fechaLim}`, 14, footerY + 5);
          doc.text(`Original: Cliente | Copia: Emisor`, 14, footerY + 10);
          doc.setFillColor(lightGray); doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
          doc.setTextColor(primaryColor); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(mensajeFinal, pageWidth / 2, pageHeight - 6, { align: "center" });
          doc.save(`Factura_${sale.codVenta}.pdf`);
      } catch (err) {
          console.error(err);
          Swal.fire('Error PDF', 'No se pudo generar la factura legal. Verifique configuración de empresa.', 'error');
      }
  };

  const handleSaveSale = async () => {
    if (!selectedClientId) return Swal.fire('Error', 'Seleccione un cliente', 'warning');
    if (cart.length === 0) return Swal.fire('Error', 'El carrito está vacío', 'warning');
    if (paymentType === 'KrediYa' && primaAmount <= 0) return Swal.fire('Error', 'Ingrese monto de prima para KrediYa', 'warning');

    setIsLoading(true);
    try {
      const payload: VentaPayload = {
        identidadCliente: selectedClientId,
        tipoCompra: paymentType,
        total: totals.total,
        isv: totals.isv,
        descuento: discount,
        montoPrima: primaAmount,
        montoFinanciado: totals.financiado,
        detalles: cart.map(item => ({
          idTelefono: item.idTelefono,
          idInventario: item.idInventario,
          cantidad: item.cantidad,
          precioVenta: item.precioVenta,
          tipoProducto: item.tipoProducto
        }))
      };

      let result;
      if (isEditing && editingSaleId) {
        result = await SalesService.updateVenta(editingSaleId, payload);
        Swal.fire('Éxito', 'Venta actualizada correctamente', 'success');
      } else {
        result = await SalesService.createVenta(payload);
        Swal.fire({
          title: 'Venta Realizada',
          text: `Factura: ${result.codVenta}`,
          icon: 'success',
          showCancelButton: true,
          confirmButtonText: 'Imprimir Factura',
          cancelButtonText: 'Nueva Venta'
        }).then((r) => {
          if (r.isConfirmed) generateInvoicePDF(result.codVenta);
        });
      }

      // Reset
      setCart([]);
      setSelectedClientId('');
      setDiscount(0);
      setPrimaAmount(0);
      setPaymentType('Contado');
      setIsEditing(false);
      setEditingSaleId(null);
      loadInitialData();
    } catch (err: any) {
      Swal.fire('Error', err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || (p.imei && p.imei.includes(searchTerm));
      const matchType = selectedType === 'ALL' || p.tipo === selectedType;
      const matchBrand = selectedBrand === 'ALL' || p.marca === selectedBrand;
      const matchCat = selectedCategory === 'ALL' || p.categoria === selectedCategory;
      return matchSearch && matchType && matchBrand && matchCat;
    });
  }, [products, searchTerm, selectedType, selectedBrand, selectedCategory]);

  const brands = useMemo(() => ['ALL', ...new Set(products.map(p => p.marca).filter(Boolean))], [products]);
  const categories = useMemo(() => ['ALL', ...new Set(products.map(p => p.categoria).filter(Boolean))], [products]);

  if (!arqueo && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] text-slate-500 gap-4">
        <Lock size={64} className="text-slate-300"/>
        <h2 className="text-2xl font-bold">Caja Cerrada</h2>
        <p>Debe abrir la caja desde el panel de movimientos antes de facturar.</p>
        <button onClick={() => navigate('/cash')} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold">Ir a Caja</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] overflow-hidden animate-fade-in pb-4">
      {/* MOBILE TABS */}
      <div className="md:hidden flex bg-white border-b p-1 gap-1 shrink-0">
        <button onClick={() => setMobileTab('CATALOG')} className={`flex-1 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 ${mobileTab === 'CATALOG' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}><LayoutGrid size={18}/> Catálogo</button>
        <button onClick={() => setMobileTab('CART')} className={`flex-1 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 ${mobileTab === 'CART' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}><ShoppingCart size={18}/> Carrito ({cart.length})</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* CATALOG PANEL */}
        <div className={`flex-1 flex flex-col bg-slate-50 border-r border-slate-200 overflow-hidden ${mobileTab === 'CART' ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 bg-white border-b space-y-4 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="Búsqueda por nombre o IMEI..." className="w-full pl-10 pr-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <select className="px-3 py-1.5 bg-slate-50 border rounded-lg text-xs font-bold" value={selectedType} onChange={e => setSelectedType(e.target.value as any)}>
                <option value="ALL">Todos los Tipos</option>
                <option value="TELEFONO">Teléfonos</option>
                <option value="ACCESORIO">Accesorios</option>
              </select>
              <select className="px-3 py-1.5 bg-slate-50 border rounded-lg text-xs font-bold" value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)}>
                {brands.map(b => <option key={b} value={b}>{b === 'ALL' ? 'Todas las Marcas' : b}</option>)}
              </select>
              <select className="px-3 py-1.5 bg-slate-50 border rounded-lg text-xs font-bold" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                {categories.map(c => <option key={c} value={c}>{c === 'ALL' ? 'Todas las Categorías' : c}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {isLoading ? (
              <div className="flex justify-center items-center h-40 text-slate-400 gap-2"><RefreshCw className="animate-spin" /> Cargando catálogo...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map(p => (
                  <div key={p.id} onClick={() => addToCart(p)} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-400 transition-all cursor-pointer group flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${p.tipo === 'TELEFONO' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{p.tipo}</span>
                        <span className="text-[10px] font-bold text-slate-400 font-mono">{p.codigo}</span>
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm leading-tight group-hover:text-indigo-600 transition-colors">{p.nombre}</h4>
                      {p.imei && <p className="text-[9px] text-slate-400 font-mono mt-1">IMEI: {p.imei}</p>}
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                      <span className="text-lg font-black text-indigo-600">L. {Number(p.precioVenta).toLocaleString()}</span>
                      <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-all"><Plus size={18}/></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CART & CHECKOUT PANEL */}
        <div className={`w-full md:w-[400px] xl:w-[450px] bg-white flex flex-col shadow-2xl z-10 overflow-hidden ${mobileTab === 'CATALOG' ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><ShoppingCart size={20}/> Carrito de Venta</h3>
            {isEditing && <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">EDITANDO: {editingSaleId}</span>}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4">
                <Package size={64} strokeWidth={1} className="opacity-20"/>
                <p className="font-bold text-sm uppercase tracking-widest">El carrito está vacío</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.codDetalleVenta} className="bg-slate-50 border rounded-2xl p-3 flex flex-col gap-3 group relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${item.tipoProducto === 'TELEFONO' ? 'bg-blue-500' : item.tipoProducto === 'SERVICIO' ? 'bg-purple-500' : 'bg-orange-500'}`}/>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h5 className="text-xs font-bold text-slate-800 leading-tight pr-4">{item.descripcionProducto}</h5>
                      <span className="text-[9px] text-slate-400 font-bold uppercase">{item.idTelefono || item.idInventario || 'Servicio'}</span>
                    </div>
                    <button onClick={() => removeFromCart(item.codDetalleVenta!)} className="text-slate-300 hover:text-red-500 transition-colors"><X size={16}/></button>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 bg-white border rounded-lg p-1">
                      <button disabled={item.tipoProducto === 'TELEFONO'} onClick={() => updateQty(item.codDetalleVenta!, -1)} className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30"><Minus size={14}/></button>
                      <span className="text-xs font-black w-6 text-center">{item.cantidad}</span>
                      <button disabled={item.tipoProducto === 'TELEFONO'} onClick={() => updateQty(item.codDetalleVenta!, 1)} className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-30"><Plus size={14}/></button>
                    </div>
                    <div className="flex flex-col items-end">
                      <input type="number" className="w-24 text-right font-black text-indigo-600 bg-transparent outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1" value={item.precioVenta} onChange={e => updatePrice(item.codDetalleVenta!, Number(e.target.value))} />
                      <span className="text-[10px] text-slate-400 font-bold">L. {(item.cantidad * item.precioVenta).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-6 bg-slate-50 border-t space-y-4 shrink-0">
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cliente</label>
                <div className="flex gap-2">
                  <select className="flex-1 p-2.5 bg-white border rounded-xl text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/20" value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}>
                    <option value="">-- Seleccionar Cliente --</option>
                    {clients.map(c => <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido} ({c.identidad})</option>)}
                  </select>
                  <button onClick={() => navigate('/clients')} className="p-2.5 bg-white border rounded-xl text-indigo-600 hover:bg-indigo-50 shadow-sm"><UserPlus size={20}/></button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Método Pago</label>
                  <select className="p-2.5 bg-white border rounded-xl text-xs font-bold shadow-sm" value={paymentType} onChange={e => setPaymentType(e.target.value as any)}>
                    <option value="Contado">Contado</option>
                    <option value="Credito">Crédito Empresa</option>
                    <option value="KrediYa">KrediYa (Externo)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descuento (L.)</label>
                  <input type="number" className="p-2.5 bg-white border rounded-xl text-xs font-bold shadow-sm" value={discount} onChange={e => setDiscount(Number(e.target.value))} />
                </div>
              </div>

              {paymentType === 'KrediYa' && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl animate-fade-in">
                  <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-1">Monto Prima / Anticipo (L.)</label>
                  <input type="number" className="w-full p-2.5 bg-white border border-blue-200 rounded-xl text-sm font-black text-blue-700 outline-none focus:ring-2 focus:ring-blue-500/20" value={primaAmount} onChange={e => setPrimaAmount(Number(e.target.value))} />
                  <p className="text-[9px] text-blue-400 font-bold mt-1 uppercase">Financiado: L. {totals.financiado.toLocaleString()}</p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="flex justify-between text-slate-500 font-bold text-xs"><span>Subtotal:</span><span>L. {totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-slate-500 font-bold text-xs"><span>ISV ({(companyConfig?.isv || 15)}%):</span><span>L. {totals.isv.toFixed(2)}</span></div>
              <div className="flex justify-between items-center text-slate-800">
                <span className="font-black uppercase tracking-tighter">Total a Pagar</span>
                <span className="text-3xl font-black text-indigo-600 tracking-tighter">L. {totals.total.toLocaleString()}</span>
              </div>
            </div>

            <button disabled={isLoading || cart.length === 0} onClick={handleSaveSale} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:grayscale disabled:opacity-50">
              {isLoading ? <RefreshCw className="animate-spin" size={20}/> : <Check size={20} strokeWidth={3}/>}
              {isEditing ? 'ACTUALIZAR FACTURA' : 'FINALIZAR VENTA'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POS;
