
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, ClientService, SalesService, CashService, ConfigService } from '../services/api';
import { ProductoUnified, DetalleVenta, Cliente, EmpresaConfig, VentaPayload } from '../types';
import { Search, ShoppingCart, Trash2, CreditCard, Smartphone, Headphones, Zap, RefreshCw, List, LayoutGrid, Save, User, X, Check, FileText, Plus, Minus, UserPlus, Grid } from 'lucide-react';
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
          // Clean state but stay on page
          navigate(location.pathname, { replace: true, state: {} });
          // Switch to cart view on mobile if added
          setMobileTab('CART');
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

  const updateQuantity = (tempId: string, delta: number) => {
      setCart(prev => prev.map(item => {
          if (item.codDetalleVenta === tempId) {
              if (item.tipoProducto === 'TELEFONO') return item; // Phone quantity fixed to 1
              const newQty = item.cantidad + delta;
              // Check max stock if increasing
              if (delta > 0) {
                  const productInStock = products.find(p => p.id === item.idInventario);
                  if (productInStock && newQty > productInStock.stock) {
                      Swal.fire({ toast: true, icon: 'warning', title: 'Stock máximo alcanzado', position: 'top-end', showConfirmButton: false, timer: 1500 });
                      return item;
                  }
              }
              return newQty > 0 ? { ...item, cantidad: newQty } : item;
          }
          return item;
      }));
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
      doc.text("FACTURAR A:", 18, topInfoY + 6);
      
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(client?.nombre ? `${client.nombre} ${client.apellido}` : "CONSUMIDOR FINAL", 18, topInfoY + 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(grayColor);
      doc.text(`RTN/DNI: ${client?.identidad || "N/A"}`, 18, topInfoY + 17);
      doc.text(`${client?.direccion || "N/A"}`, 18, topInfoY + 22);

      const rightColX = 115;
      
      doc.setFont("helvetica", "bold"); doc.setTextColor(grayColor);
      doc.text("FECHA EMISIÓN:", rightColX, topInfoY + 5);
      doc.setTextColor(0,0,0); doc.text(date.toLocaleDateString(), rightColX + 45, topInfoY + 5);
      
      doc.setTextColor(grayColor);
      doc.text("FECHA VENCIMIENTO:", rightColX, topInfoY + 10);
      doc.setTextColor(0,0,0);
      doc.text(config.fechaLimite ? new Date(config.fechaLimite).toLocaleDateString() : 'N/A', rightColX + 45, topInfoY + 10);

      doc.setTextColor(grayColor);
      doc.text("R.T.N. EMISOR:", rightColX, topInfoY + 15);
      doc.setTextColor(0,0,0);
      doc.text(config.rtn || 'N/A', rightColX + 45, topInfoY + 15);

      doc.setTextColor(grayColor);
      doc.text("CAI:", rightColX, topInfoY + 20);
      doc.setTextColor(0,0,0);
      doc.text(config.cai || 'N/A', rightColX + 45, topInfoY + 20);

      doc.setTextColor(grayColor);
      doc.text("ORDEN DE COMPRA:", rightColX, topInfoY + 25);
      doc.setTextColor(0,0,0);
      doc.text("N/A", rightColX + 45, topInfoY + 25);

      doc.setTextColor(grayColor);
      doc.text("VENDEDOR:", rightColX, topInfoY + 30);
      doc.setTextColor(0,0,0);
      doc.text(user?.nombreEmpleado || "Cajero", rightColX + 45, topInfoY + 30);

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
          headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
          columnStyles: { 
              0: { halign: 'center' }, 
              1: { halign: 'center' }, 
              2: { halign: 'right' }, 
              3: { halign: 'right', fontStyle: 'bold' } 
          },
          margin: { left: 14, right: 14 }
      });

      // @ts-ignore
      let finalY = doc.lastAutoTable.finalY + 5;
      const totalsX = 130;

      // Totals
      doc.text("Subtotal:", totalsX, finalY);
      doc.text(`L. ${subtotal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
      finalY += 6;
      if(discount > 0) {
          doc.text("Descuentos:", totalsX, finalY);
          doc.text(`L. ${discount.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 6;
      }
      doc.text("ISV:", totalsX, finalY);
      doc.text(`L. ${tax.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
      finalY += 2;
      
      doc.setDrawColor(primaryColor);
      doc.setLineWidth(0.5);
      doc.line(totalsX, finalY, pageWidth - 14, finalY);
      finalY += 5;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryColor);
      doc.text("TOTAL A PAGAR:", totalsX, finalY);
      doc.text(`L. ${total.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});

      // Letras
      doc.setTextColor(grayColor);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("SON: " + numeroALetras(total), 14, finalY);

      // Footer
      const pageHeightFinal = doc.internal.pageSize.height;
      let footerY = pageHeightFinal - 40;
      
      doc.setFont("helvetica", "normal");
      doc.setTextColor(grayColor);
      doc.setFontSize(8);
      
      doc.text(`Rango Autorizado: ${config.rangoInicial || '000-001-01-00000001'} al ${config.rangoFinal || '000-001-01-00002000'}`, 14, footerY);
      doc.text(`Fecha Límite de Emisión: ${config.fechaLimite ? new Date(config.fechaLimite).toLocaleDateString() : 'N/A'}`, 14, footerY + 4);
      doc.text(`Original: Cliente | Copia: Emisor`, 14, footerY + 8);

      doc.setFillColor(lightGray);
      doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
      doc.setTextColor(primaryColor);
      doc.setFontSize(10);
      doc.text(config.mensajeFinal || "LA FACTURA ES BENEFICIO DE TODOS, EXIJALA", pageWidth / 2, pageHeight - 6, { align: "center" });

      doc.save(`Factura_${codVenta}.pdf`);
    } catch (e:any) {
        Swal.fire('Error', 'No se pudo generar la factura: ' + e.message, 'error');
    }
  };

  const handleProcessSale = async () => {
      if (cart.length === 0) return Swal.fire('Carrito Vacío', 'Agrega productos antes de facturar.', 'warning');
      
      // Validar cliente
      if (!selectedClientId) {
           const result = await Swal.fire({
               title: 'Cliente no seleccionado',
               text: '¿Desea facturar como Consumidor Final?',
               icon: 'question',
               showCancelButton: true,
               confirmButtonText: 'Sí, continuar'
           });
           if (!result.isConfirmed) return;
      }

      try {
          setIsLoading(true);
          const payload: VentaPayload = {
              identidadCliente: selectedClientId || '9999999999999', // Consumidor Final default
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
              }))
          };

          let saleId = '';
          const saleDate = new Date();

          if (isEditing && editingSaleId) {
               const res = await SalesService.updateVenta(editingSaleId, payload);
               saleId = res.codVenta;
               Swal.fire('Venta Actualizada', `Factura #${saleId} modificada con éxito`, 'success');
          } else {
               const res = await SalesService.createVenta(payload);
               saleId = res.codVenta;
               Swal.fire({
                   title: 'Venta Procesada',
                   text: `Factura #${saleId} generada con éxito`,
                   icon: 'success',
                   showCancelButton: true,
                   confirmButtonText: 'Imprimir Factura',
                   cancelButtonText: 'Nueva Venta'
               }).then((result) => {
                   if (result.isConfirmed) {
                       generateInvoicePDF(saleId, saleDate);
                   }
               });
          }

          // Reset Logic
          if (!isEditing) {
              setCart([]);
              setSelectedClientId('');
              setDiscount(0);
              setPaymentType('Contado');
          } else {
              // Leave editing mode
              setIsEditing(false);
              setEditingSaleId(null);
              setCart([]);
              setSelectedClientId('');
              setDiscount(0);
          }
          
      } catch (error: any) {
          Swal.fire('Error', error.message, 'error');
      } finally {
          setIsLoading(false);
      }
  };

  const handleCancel = () => {
      setCart([]);
      setSelectedClientId('');
      setDiscount(0);
      setPaymentType('Contado');
      setIsEditing(false);
      setEditingSaleId(null);
  };

  // Filter Logic
  const filteredProducts = useMemo(() => {
      return products.filter(p => {
          const matchesTerm = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              (p.imei && p.imei.includes(searchTerm)) || 
                              p.codigo.toLowerCase().includes(searchTerm);
          const matchesCat = selectedCategory === 'ALL' || p.tipo === selectedCategory;
          return matchesTerm && matchesCat;
      });
  }, [products, searchTerm, selectedCategory]);

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-theme(spacing.24))] gap-4">
      {/* LEFT: Catalog */}
      <div className={`flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden ${mobileTab === 'CART' ? 'hidden md:flex' : 'flex'}`}>
          {/* Search & Filters */}
          <div className="p-4 border-b border-slate-100 space-y-4">
              <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                      type="text" 
                      placeholder="Buscar producto, IMEI o código..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  />
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  <button onClick={() => setSelectedCategory('ALL')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${selectedCategory === 'ALL' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Todos</button>
                  <button onClick={() => setSelectedCategory('TELEFONO')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${selectedCategory === 'TELEFONO' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Teléfonos</button>
                  <button onClick={() => setSelectedCategory('ACCESORIO')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${selectedCategory === 'ACCESORIO' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Accesorios</button>
              </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
              {isLoading ? (
                  <div className="flex justify-center items-center h-full text-slate-400">Cargando catálogo...</div>
              ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredProducts.map(product => (
                          <button 
                              key={product.id} 
                              onClick={() => addToCart(product)}
                              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-indigo-300 transition-all flex flex-col items-start text-left group active:scale-95"
                          >
                              <div className={`p-2 rounded-lg mb-3 ${product.tipo === 'TELEFONO' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                  {product.tipo === 'TELEFONO' ? <Smartphone size={20}/> : <Headphones size={20}/>}
                              </div>
                              <h3 className="font-bold text-slate-800 text-sm line-clamp-2 min-h-[2.5em]">{product.nombre}</h3>
                              {product.tipo === 'TELEFONO' && <p className="text-[10px] text-slate-400 font-mono mb-2 truncate w-full">{product.imei}</p>}
                              <div className="mt-auto w-full pt-2 border-t border-slate-100 flex justify-between items-center">
                                  <span className="font-bold text-indigo-600">L. {Number(product.precioVenta).toLocaleString()}</span>
                                  <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">Stock: {product.stock}</span>
                              </div>
                          </button>
                      ))}
                      {filteredProducts.length === 0 && (
                          <div className="col-span-full flex flex-col items-center justify-center p-8 text-slate-400">
                              <RefreshCw size={32} className="mb-2 opacity-50"/>
                              <p>No se encontraron productos.</p>
                          </div>
                      )}
                  </div>
              )}
          </div>
      </div>

      {/* RIGHT: Cart */}
      <div className={`w-full md:w-96 flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden ${mobileTab === 'CATALOG' ? 'hidden md:flex' : 'flex'}`}>
          {/* Header & Client */}
          <div className="p-4 bg-slate-800 text-white shrink-0">
              <div className="flex justify-between items-center mb-4">
                  <h2 className="font-bold text-lg flex items-center gap-2">
                      <ShoppingCart size={20}/> {isEditing ? `Editando #${editingSaleId}` : 'Carrito de Venta'}
                  </h2>
                  <button onClick={handleCancel} className="text-slate-400 hover:text-white" title="Limpiar"><Trash2 size={18}/></button>
              </div>
              <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <select 
                      className="w-full pl-9 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                      value={selectedClientId}
                      onChange={e => setSelectedClientId(e.target.value)}
                  >
                      <option value="">Consumidor Final</option>
                      {clients.map(c => <option key={c.identidad} value={c.identidad}>{c.nombre} {c.apellido}</option>)}
                  </select>
                  <button 
                    onClick={() => navigate('/clients')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-slate-600 hover:bg-slate-500 rounded text-xs" 
                    title="Nuevo Cliente"
                  >
                      <UserPlus size={14}/>
                  </button>
              </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50">
              {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                      <ShoppingCart size={48} className="mb-4 opacity-20"/>
                      <p>El carrito está vacío</p>
                      <p className="text-xs mt-1">Selecciona productos del catálogo</p>
                  </div>
              ) : cart.map(item => (
                  <div key={item.codDetalleVenta} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                          <div className="flex-1">
                              <p className="font-bold text-slate-800 text-sm line-clamp-1">{item.descripcionProducto}</p>
                              <p className="text-xs text-slate-500">{item.tipoProducto} {item.idTelefono ? `(IMEI: ${products.find(p=>p.id===item.idTelefono)?.imei?.slice(-4)})` : ''}</p>
                          </div>
                          <button onClick={() => removeFromCart(item.codDetalleVenta!)} className="text-red-400 hover:text-red-600 p-1"><X size={16}/></button>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                          <div className="flex items-center gap-3 bg-slate-100 rounded-lg p-1">
                              <button 
                                onClick={() => updateQuantity(item.codDetalleVenta!, -1)} 
                                disabled={item.tipoProducto === 'TELEFONO'}
                                className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-indigo-600 disabled:opacity-50"
                              ><Minus size={12}/></button>
                              <span className="font-bold text-sm w-4 text-center">{item.cantidad}</span>
                              <button 
                                onClick={() => updateQuantity(item.codDetalleVenta!, 1)} 
                                disabled={item.tipoProducto === 'TELEFONO'}
                                className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-indigo-600 disabled:opacity-50"
                              ><Plus size={12}/></button>
                          </div>
                          <p className="font-bold text-indigo-600">L. {(item.cantidad * item.precioVenta).toLocaleString()}</p>
                      </div>
                  </div>
              ))}
          </div>

          {/* Footer & Totals */}
          <div className="bg-white p-4 border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
              <div className="space-y-2 mb-4 text-sm">
                  <div className="flex justify-between text-slate-500">
                      <span>Subtotal</span>
                      <span>L. {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                      <span>Descuento</span>
                      <div className="flex items-center gap-1 w-24">
                          <span className="text-xs">L.</span>
                          <input 
                              type="number" 
                              className="w-full border-b border-slate-300 text-right outline-none focus:border-indigo-500 p-0 text-sm"
                              value={discount} 
                              onChange={e => setDiscount(Number(e.target.value))}
                              onFocus={e => e.target.select()}
                          />
                      </div>
                  </div>
                  <div className="flex justify-between text-slate-500">
                      <span>ISV ({companyConfig?.isv || 15}%)</span>
                      <span>L. {tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-slate-800 pt-2 border-t border-slate-100">
                      <span>Total</span>
                      <span>L. {total.toFixed(2)}</span>
                  </div>
              </div>

              <div className="flex gap-2 mb-3">
                  <button onClick={() => setPaymentType('Contado')} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${paymentType === 'Contado' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}>CONTADO</button>
                  <button onClick={() => setPaymentType('Credito')} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${paymentType === 'Credito' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}>CRÉDITO</button>
              </div>

              <button 
                  onClick={handleProcessSale}
                  disabled={isLoading || cart.length === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex justify-center items-center gap-2"
              >
                  {isLoading ? <RefreshCw className="animate-spin" size={20}/> : <Check size={20}/>}
                  {isEditing ? 'ACTUALIZAR VENTA' : 'COBRAR'}
              </button>
          </div>
      </div>

      {/* Mobile Tabs */}
      <div className="md:hidden fixed bottom-4 left-4 right-4 bg-white rounded-full shadow-2xl border border-slate-200 p-1 flex z-50">
          <button 
              onClick={() => setMobileTab('CATALOG')} 
              className={`flex-1 py-3 rounded-full flex items-center justify-center gap-2 font-bold text-sm transition-all ${mobileTab === 'CATALOG' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500'}`}
          >
              <Grid size={18}/> Catálogo
          </button>
          <button 
              onClick={() => setMobileTab('CART')} 
              className={`flex-1 py-3 rounded-full flex items-center justify-center gap-2 font-bold text-sm transition-all ${mobileTab === 'CART' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500'}`}
          >
              <ShoppingCart size={18}/> 
              Carrito
              {cart.length > 0 && <span className="bg-white text-indigo-600 text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-sm">{cart.reduce((a,b)=>a+b.cantidad,0)}</span>}
          </button>
      </div>
    </div>
  );
};

export default POS;
