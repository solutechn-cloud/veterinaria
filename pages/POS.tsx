
import React, { useState, useEffect } from 'react';
import { InventoryService, ClientService, SalesService, CashService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, EmpresaConfig } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Smartphone, Headphones, Zap, RefreshCw, List, LayoutGrid, Save } from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import 'jspdf-autotable';

// Helper básico para números a letras (Simplificado para Lempiras)
const numeroALetras = (num: number): string => {
    const unidades = ['CERO', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);
    
    let text = '';
    if (integerPart === 100) text = 'CIEN';
    else if (integerPart > 100 && integerPart < 1000) {
        text = centenas[Math.floor(integerPart / 100)];
        const rest = integerPart % 100;
        if (rest > 0) text += ' ' + convertTwoDigits(rest);
    } else {
        text = convertTwoDigits(integerPart);
    }

    return `${text} CON ${decimalPart}/100 LEMPIRAS`;

    function convertTwoDigits(n: number) {
        if (n < 10) return unidades[n];
        if (n < 20) return ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'][n-10];
        const dec = Math.floor(n/10);
        const uni = n % 10;
        return decenas[dec] + (uni > 0 ? ' Y ' + unidades[uni] : '');
    }
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

  // Obtener fecha local en formato YYYY-MM-DD
  const getLocalDate = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

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

      // --- LOGO PLACEHOLDER (Reemplazar con tu Base64 real) ---
      // Para poner tu logo: Convierte tu imagen a Base64 en https://www.base64-image.de/
      // y pega el string completo dentro de las comillas.
      const logoBase64 = "data:image/png;base64,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";
      // Colores Corporativos
      const primaryColor = "#1e3a8a";   // Azul oscuro corporativo
      const accentColor = "#3b82f6";    // Azul brillante
      const grayColor = "#64748b";      // Gris texto
      const lightGray = "#f1f5f9";      // Gris fondo

      // --- ENCABEZADO ---
      
      // Fondo superior geométrico
      doc.setFillColor(primaryColor);
      // Replace polygon with triangles for compatibility
      // doc.polygon([0, 0, pageWidth, 0, pageWidth, 35, 0, 50], 'F');
      doc.triangle(0, 0, pageWidth, 0, pageWidth, 35, 'F');
      doc.triangle(0, 0, pageWidth, 35, 0, 50, 'F');
      
      doc.setFillColor(accentColor);
      // doc.polygon([0, 0, 100, 0, 0, 50], 'F');
      doc.triangle(0, 0, 100, 0, 0, 50, 'F');

      // Logo (Lado Izquierdo)
      try {
          doc.addImage(logoBase64, 'PNG', 10, 10, 20, 20); // Ajusta X, Y, W, H según tu logo
      } catch (e) {
          // Fallback si no hay logo
          doc.setFillColor(255, 255, 255);
          doc.circle(20, 20, 10, 'F');
          doc.setFontSize(8);
          doc.setTextColor(primaryColor);
          doc.text("LOGO", 16, 21);
      }

      // Información Empresa (Lado Izquierdo, sobre fondo oscuro => Texto blanco)
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(config.nombreEmpresa.toUpperCase(), 35, 18);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(config.direccion || '', 35, 24);
      doc.text(`Tel: ${config.telefono} | ${config.correo || ''}`, 35, 29);

      // Título FACTURA (Lado Derecho)
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text("FACTURA", pageWidth - 15, 20, { align: "right" });
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`NO. ${codVenta}`, pageWidth - 15, 28, { align: "right" });

      // --- DETALLES DE FACTURACIÓN (Debajo del header) ---
      const topInfoY = 60;
      
      // Columna Izquierda: Cliente (Caja Gris Estilizada)
      doc.setFillColor(lightGray);
      doc.roundedRect(14, topInfoY, 90, 35, 3, 3, 'F');
      
      doc.setTextColor(primaryColor);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("FACTURAR A:", 18, topInfoY + 6);
      
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(client ? `${client.nombre} ${client.apellido}` : "CONSUMIDOR FINAL", 18, topInfoY + 12);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(grayColor);
      doc.text(`RTN/DNI: ${client?.identidad || "N/A"}`, 18, topInfoY + 17);
      
      const direccion = doc.splitTextToSize(client?.direccion || "Ciudad", 80);
      doc.text(direccion, 18, topInfoY + 22);

      // Columna Derecha: Datos Fiscales & Fechas
      const rightColX = 115;
      
      const addDetailRow = (label: string, value: string, y: number, isBold: boolean = false) => {
          doc.setFontSize(9);
          doc.setTextColor(grayColor);
          doc.setFont("helvetica", "bold");
          doc.text(label, rightColX, y);
          
          doc.setTextColor(0,0,0);
          doc.setFont("helvetica", isBold ? "bold" : "normal");
          doc.text(value, rightColX + 40, y); // Offset value
      };

      const currentDateStr = new Date().toLocaleDateString(); // FECHA ACTUAL AUTOMÁTICA

      addDetailRow("FECHA EMISIÓN:", currentDateStr, topInfoY + 5, true);
      addDetailRow("FECHA VENCIMIENTO:", config.fechaLimite ? new Date(config.fechaLimite).toLocaleDateString() : 'N/A', topInfoY + 10);
      addDetailRow("R.T.N. EMISOR:", config.rtn || '', topInfoY + 15);
      addDetailRow("CAI:", config.cai || '', topInfoY + 20);
      addDetailRow("ORDEN DE COMPRA:", "N/A", topInfoY + 25);
      addDetailRow("VENDEDOR:", user?.nombreEmpleado || "Cajero", topInfoY + 30);

      // --- TABLA DE PRODUCTOS ---
      // @ts-ignore
      doc.autoTable({
          startY: topInfoY + 40,
          head: [['CANT.', 'DESCRIPCIÓN', 'PRECIO UNIT.', 'TOTAL']],
          body: cart.map(item => [
              item.cantidad,
              item.descripcionProducto,
              `L. ${Number(item.precioVenta).toFixed(2)}`,
              `L. ${(item.cantidad * item.precioVenta).toFixed(2)}`
          ]),
          theme: 'striped',
          styles: { 
              fontSize: 9, 
              cellPadding: 3,
              textColor: [50, 50, 50] 
          },
          headStyles: { 
              fillColor: primaryColor, // Azul corporativo
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              halign: 'left'
          },
          columnStyles: {
              0: { halign: 'center', fontStyle: 'bold' }, // Cant
              2: { halign: 'right' }, // Precio
              3: { halign: 'right', fontStyle: 'bold' }  // Total
          },
          margin: { left: 14, right: 14 },
          alternateRowStyles: {
              fillColor: [248, 250, 252] // Very light gray blue
          }
      });

      // @ts-ignore
      const finalY = doc.lastAutoTable.finalY + 5;

      // --- TOTALES (Derecha) ---
      const totalsX = 130;
      let currentY = finalY;

      const addTotalRow = (label: string, value: string, isTotal: boolean = false) => {
          doc.setFontSize(isTotal ? 11 : 9);
          doc.setTextColor(isTotal ? primaryColor : grayColor);
          doc.setFont("helvetica", isTotal ? "bold" : "normal");
          doc.text(label, totalsX, currentY);
          
          doc.setTextColor(isTotal ? primaryColor : "#000000");
          doc.text(value, pageWidth - 14, currentY, { align: "right" });
          currentY += 6;
      };

      addTotalRow("Subtotal:", `L. ${subtotal.toFixed(2)}`);
      addTotalRow("Descuentos:", `L. ${discount.toFixed(2)}`);
      addTotalRow(`ISV (${config.isv}%):`, `L. ${tax.toFixed(2)}`);
      currentY += 2; // Spacer
      
      // Línea separadora total
      doc.setDrawColor(primaryColor);
      doc.setLineWidth(0.5);
      doc.line(totalsX, currentY - 4, pageWidth - 14, currentY - 4);
      
      addTotalRow("TOTAL A PAGAR:", `L. ${total.toFixed(2)}`, true);

      // --- INFORMACIÓN LEGAL Y MONTO EN LETRAS (Izquierda) ---
      const legalY = finalY;
      const legalWidth = 100;

      doc.setFontSize(8);
      doc.setTextColor(grayColor);
      doc.setFont("helvetica", "bold");
      doc.text("SON:", 14, legalY + 30); // Bajamos un poco para no chocar con tabla si es larga
      doc.setFont("helvetica", "normal");
      doc.text(numeroALetras(total), 22, legalY + 30);

      // Bloque Legal SAR
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      let legalTextY = legalY + 40;
      
      const legalLines = [
          `Rango Autorizado: ${config.rangoInicial || ''} al ${config.rangoFinal || ''}`,
          `Fecha Límite de Emisión: ${config.fechaLimite ? new Date(config.fechaLimite).toLocaleDateString() : ''}`,
          `Original: Cliente | Copia: Emisor`
      ];

      legalLines.forEach(line => {
          doc.text(line, 14, legalTextY);
          legalTextY += 4;
      });

      // --- PIE DE PÁGINA ---
      // Barra inferior
      doc.setFillColor(lightGray);
      doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
      
      doc.setTextColor(primaryColor);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(config.mensajeFinal || "LA FACTURA ES BENEFICIO DE TODOS, EXIJALA", pageWidth / 2, pageHeight - 6, { align: "center" });

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
            detalles: cart,
            fecha: getLocalDate() 
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
        navigate(location.pathname, { replace: true, state: {} });
        
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
      navigate(location.pathname, { replace: true, state: {} });
      Swal.fire('Edición Cancelada', 'Se ha limpiado el punto de venta.', 'info');
  };

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = p.nombre.toLowerCase().includes(term) || 
                          p.codigo.toLowerCase().includes(term) ||
                          p.id.toLowerCase().includes(term) || 
                          (p.imei && p.imei.toLowerCase().includes(term));
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
                <span>ISV ({companyConfig?.isv || 15}%)</span>
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
