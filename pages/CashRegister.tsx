
import React, { useState, useEffect } from 'react';
import { CashService, SalesService, PackagesService, ConfigService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Venta, Saldo, Paquete, EmpresaConfig } from '../types';
import { 
  Lock, PlusCircle, Smartphone, Ban, ShoppingCart, ArrowDownCircle, ArrowUpCircle, Wallet, Edit2, Trash2, X, CloudLightning, FileText, Printer
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

type TabType = 'INGRESOS' | 'EGRESOS' | 'VENTAS' | 'RECARGAS';

// Helper robusto para números a letras (Soporta miles y millones)
const numeroALetras = (num: number): string => {
    const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CUARENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
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
        if (remainder > 0) text += ' ' + convertGroup(Math.floor(remainder / 100)) + ' MIL ' + convertGroup(remainder % 1000);
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

const CashRegister: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('INGRESOS');
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [companyConfig, setCompanyConfig] = useState<EmpresaConfig | null>(null);
  
  // Data Lists
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);

  // Open Box Logic
  const [existingBalances, setExistingBalances] = useState({ tigo: false, claro: false });
  const [openForm, setOpenForm] = useState({ monto: '', tigo: '', claro: '' });
  
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  // Modals Forms
  const [showIngresoModal, setShowIngresoModal] = useState(false);
  const [ingresoForm, setIngresoForm] = useState({ id: '', descripcion: '', monto: '', costo: '', irAPos: true });
  const [isEditingIngreso, setIsEditingIngreso] = useState(false);
  
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [egresoForm, setEgresoForm] = useState({ id: '', descripcion: '', monto: '' });
  const [isEditingEgreso, setIsEditingEgreso] = useState(false);

  const [showSaldoModal, setShowSaldoModal] = useState(false);
  const [saldoForm, setSaldoForm] = useState({ red: 'TIGO', montoPagado: '', montoRecibido: '' });

  const [showRecargaModal, setShowRecargaModal] = useState<{red: 'TIGO' | 'CLARO', tipo: 'RECARGA' | 'PAQUETE'} | null>(null);
  const [recargaForm, setRecargaForm] = useState({ tipo: 'RECARGA', monto: '', precio: '', paqueteId: '' });

  // Obtener fecha local en formato YYYY-MM-DD garantizando hora de Honduras
  const getLocalDate = () => {
    const options: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Tegucigalpa',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(new Date());
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  };

  // Obtener Timestamp exacto (YYYY-MM-DD HH:mm:ss) para enviar a BD garantizando hora de Honduras
  const getFullLocalTimestamp = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Tegucigalpa',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
    
    // Construcción manual YYYY-MM-DD HH:mm:ss
    return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  };

  useEffect(() => {
    if (user) {
        loadData();
        loadCatalogos();
        loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
      try {
          const cfg = await ConfigService.get();
          setCompanyConfig(cfg);
      } catch (e) { console.error(e); }
  };

  const loadCatalogos = async () => {
      try {
        const paqs = await PackagesService.getAll();
        setPaquetes(paqs || []);
      } catch(e) {
        console.error("Error cargando paquetes:", e);
      }
  };

  const loadData = async () => {
    if (!user?.idCaja) return; 

    try {
      const active = await CashService.getActiveArqueo();
      const localDate = getLocalDate();

      if (!active) {
        setArqueo(null);
        const status = await CashService.getSaldosStatus(localDate);
        setExistingBalances(status);
        setIngresos([]);
        setEgresos([]);
        setVentas([]);
        setSaldos([]);
      } else {
        setArqueo(active);
        const [ing, egr, vts, slds] = await Promise.all([
           CashService.getIngresos(user.idCaja, localDate),
           CashService.getEgresos(user.idCaja, localDate),
           SalesService.getVentasDiDaily(localDate),
           CashService.getSaldosToday(localDate)
        ]);
        setIngresos(ing || []);
        setEgresos(egr || []);
        setVentas(vts || []);
        setSaldos(slds || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
        setIsLoading(false);
    }
  };

  const handleOpenBox = async () => {
     if(!openForm.monto) return Swal.fire('Error', 'Ingrese monto inicial', 'error');
     try {
       await CashService.openCaja({
         montoInicial: Number(openForm.monto),
         saldoTigoInicial: existingBalances.tigo ? 0 : Number(openForm.tigo || 0),
         saldoClaroInicial: existingBalances.claro ? 0 : Number(openForm.claro || 0),
         fechaLocal: getLocalDate()
       });
       Swal.fire('Éxito', 'Caja Aperturada', 'success');
       loadData();
     } catch (err: any) {
       Swal.fire('Error', err.message, 'error');
     }
  };

  // --- PDF REPORT GENERATOR (CIERRE) ---
  const generateClosingReportPDF = (resumen: any, ingresosList: Ingreso[], egresosList: Egreso[], user: any) => {
      const doc = new jsPDF();
      const isAdmin = user.rol === 'Administrador' || hasPermission('VER_ADMIN');
      const date = new Date().toLocaleString();

      // HEADER
      doc.setFillColor(30, 41, 59); // Slate 800
      doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text("REPORTE DE CIERRE DE CAJA", 105, 12, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Fecha: ${date} | Cajero: ${user.nombreEmpleado} | Caja: ${user.idCaja}`, 105, 22, { align: 'center' });

      // SUMMARY SECTION
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text("RESUMEN FINANCIERO", 14, 40);
      
      const mInicial = Number(resumen.montoInicial) || 0;
      const tVentas = Number(resumen.totalVentas) || 0;
      const tGastos = Number(resumen.TotalGastos) || 0;
      const mFinal = Number(resumen.montoFinal) || 0;
      const ganancia = Number(resumen.ganancia) || 0;
      const sTigo = Number(resumen.saldoTigoFinal) || 0;
      const sClaro = Number(resumen.saldoClaroFinal) || 0;

      const summaryData = [
          ['Monto Inicial', `L. ${mInicial.toFixed(2)}`],
          ['(+) Total Ingresos', `L. ${tVentas.toFixed(2)}`],
          ['(-) Total Gastos', `L. ${tGastos.toFixed(2)}`],
          ['(=) Efectivo Calculado', `L. ${mFinal.toFixed(2)}`]
      ];
      
      if(isAdmin) {
          summaryData.push(['Ganancia Estimada', `L. ${ganancia.toFixed(2)}`]);
      }

      // @ts-ignore
      doc.autoTable({
          startY: 45,
          head: [['Concepto', 'Monto']],
          body: summaryData,
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
          margin: { right: 110 } 
      });
      
      const yAfterSummary = (doc as any).lastAutoTable.finalY;

      // @ts-ignore
      doc.autoTable({
          startY: 45,
          head: [['Plataforma', 'Saldo Final']],
          body: [
              ['TIGO', `L. ${sTigo.toFixed(2)}`],
              ['CLARO', `L. ${sClaro.toFixed(2)}`]
          ],
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255 },
          columnStyles: { 1: { halign: 'right', textColor: [0, 100, 0], fontStyle: 'bold' } },
          margin: { left: 110 } 
      });
      
      const yAfterSaldos = (doc as any).lastAutoTable.finalY;
      let finalY = Math.max(yAfterSummary, yAfterSaldos) + 15;

      doc.setFontSize(11);
      doc.text("DETALLE DE INGRESOS", 14, finalY);
      
      const incomeColumns = isAdmin ? ['Hora', 'Descripción', 'Costo', 'Monto'] : ['Hora', 'Descripción', 'Monto'];
      const incomeRows = ingresosList.map(i => {
          const time = i.fechaCreacion ? new Date(i.fechaCreacion).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-';
          return isAdmin 
            ? [time, i.descripcion, `L. ${(Number(i.costo)||0).toFixed(2)}`, `L. ${(Number(i.monto)||0).toFixed(2)}`]
            : [time, i.descripcion, `L. ${(Number(i.monto)||0).toFixed(2)}`];
      });

      // @ts-ignore
      doc.autoTable({
          startY: finalY + 3,
          head: [incomeColumns],
          body: incomeRows,
          theme: 'striped',
          headStyles: { fillColor: [16, 185, 129] },
          columnStyles: { 
              2: { halign: 'right' }, 
              3: isAdmin ? { halign: 'right', fontStyle: 'bold' } : undefined 
          }
      });

      finalY = (doc as any).lastAutoTable.finalY + 10;

      doc.setFontSize(11);
      doc.text("DETALLE DE GASTOS / SALIDAS", 14, finalY);
      
      const expenseRows = egresosList.map(e => {
          const time = e.fechaCreacion ? new Date(e.fechaCreacion).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-';
          return [time, e.descripcion, `L. ${(Number(e.monto)||0).toFixed(2)}`];
      });

      // @ts-ignore
      doc.autoTable({
          startY: finalY + 3,
          head: [['Hora', 'Descripción', 'Monto']],
          body: expenseRows,
          theme: 'striped',
          headStyles: { fillColor: [239, 68, 68] },
          columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } }
      });

      doc.save(`Cierre_Caja_${user.idCaja}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // --- GENERAR FACTURA INDIVIDUAL (REIMPRESIÓN MEJORADA) ---
  const handleReprintInvoice = async (idVenta: string) => {
      try {
          const sale = await SalesService.getVenta(idVenta);
          const details = await SalesService.getDetallesVenta(idVenta);
          
          if (!sale) return Swal.fire('Error', 'Venta no encontrada', 'error');

          const doc = new jsPDF();
          const config = companyConfig || { nombreEmpresa: 'SMARTCLOUD', rtn: '', direccion: '', isv: 15 } as any;
          const pageWidth = doc.internal.pageSize.width;
          const pageHeight = doc.internal.pageSize.height;
          const primaryColor = "#1e3a8a";   
          const accentColor = "#3b82f6";    
          const grayColor = "#64748b";      
          const lightGray = "#f1f5f9";      

          // Header geométrico (IGUAL AL POS)
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
          doc.text(`NO. ${sale.codVenta}`, pageWidth - 15, 28, { align: "right" });

          const topInfoY = 60;
          doc.setFillColor(lightGray);
          doc.roundedRect(14, topInfoY, 90, 35, 3, 3, 'F');
          
          // INFO CLIENTE (Ahora con dirección gracias a la actualización del backend)
          doc.setTextColor(primaryColor);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("FACTURAR A:", 18, topInfoY + 6);
          
          doc.setTextColor(0, 0, 0);
          doc.setFont("helvetica", "bold");
          doc.text(sale.nombreCliente || "CONSUMIDOR FINAL", 18, topInfoY + 12);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(grayColor);
          doc.text(`RTN/DNI: ${sale.identidadCliente || "N/A"}`, 18, topInfoY + 17);
          doc.text(`${sale.direccionCliente || "N/A"}`, 18, topInfoY + 22); // NUEVO CAMPO

          const rightColX = 115;
          doc.setFont("helvetica", "bold"); doc.setTextColor(grayColor);
          doc.text("FECHA EMISIÓN:", rightColX, topInfoY + 5);
          doc.setTextColor(0,0,0);
          doc.text(new Date(sale.fecha).toLocaleDateString(), rightColX + 45, topInfoY + 5);
          
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
          doc.text(sale.nombreVendedor || "Cajero", rightColX + 45, topInfoY + 30);

          // Tabla con Columnas Centradas
          // @ts-ignore
          doc.autoTable({
              startY: topInfoY + 40,
              head: [['CANT.', 'DESCRIPCIÓN', 'PRECIO UNIT.', 'TOTAL']],
              body: details.map(item => [
                  item.cantidad,
                  item.descripcionProducto,
                  `L. ${Number(item.precioVenta).toFixed(2)}`,
                  `L. ${(Number(item.cantidad) * Number(item.precioVenta)).toFixed(2)}`
              ]),
              theme: 'striped',
              styles: { fontSize: 9, cellPadding: 3, textColor: [50, 50, 50] },
              headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' }, // Headers centrados
              columnStyles: { 
                  0: { halign: 'center' }, // Cantidad centrada
                  1: { halign: 'center' }, // Descripción centrada (SOLICITUD USUARIO)
                  2: { halign: 'right' }, 
                  3: { halign: 'right', fontStyle: 'bold' } 
              },
              margin: { left: 14, right: 14 }
          });

          // @ts-ignore
          let finalY = doc.lastAutoTable.finalY + 5;
          const totalsX = 130;

          // Totals
          const total = Number(sale.total);
          const isv = Number(sale.isv || 0);
          const discount = Number(sale.descuento || 0);
          // Recalcular subtotal
          const subtotal = (total + discount) - isv;

          doc.text("Subtotal:", totalsX, finalY);
          doc.text(`L. ${subtotal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 6;
          if(discount > 0) {
              doc.text("Descuentos:", totalsX, finalY);
              doc.text(`L. ${discount.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
              finalY += 6;
          }
          doc.text("ISV:", totalsX, finalY);
          doc.text(`L. ${isv.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 2;
          
          // Linea separadora total
          doc.setDrawColor(primaryColor);
          doc.setLineWidth(0.5);
          doc.line(totalsX, finalY, pageWidth - 14, finalY);
          finalY += 5;

          doc.setFont("helvetica", "bold");
          doc.setTextColor(primaryColor);
          doc.text("TOTAL A PAGAR:", totalsX, finalY);
          doc.text(`L. ${total.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});

          // Letras (Función Robusta)
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

          doc.save(`Factura_${idVenta}_reimpresion.pdf`);

      } catch (e:any) {
          Swal.fire('Error', 'No se pudo generar la factura: ' + e.message, 'error');
      }
  };

  const handleCloseBox = async () => {
     if(!arqueo) return;
     const result = await Swal.fire({ 
         title: '¿Cerrar Caja?', text: 'Se calcularán ganancias y se cerrará el turno.', 
         icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Cerrar Caja', confirmButtonText: 'Sí, Cerrar Caja', confirmButtonColor: '#ef4444'
     });
     if(result.isConfirmed) {
       try {
         const response = await CashService.closeCaja(arqueo.idArqueo);
         Swal.fire({ title: 'Cierre Exitoso', icon: 'success', showCancelButton: true, confirmButtonText: 'Descargar Reporte' })
             .then((res) => { if (res.isConfirmed) generateClosingReportPDF(response.resumen, ingresos, egresos, user); });
         loadData(); 
       } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
     }
  };

  const handleIngresoAction = async () => {
     if (isEditingIngreso) {
         try {
             await CashService.updateIngreso(ingresoForm.id, {
                 descripcion: ingresoForm.descripcion,
                 monto: Number(ingresoForm.monto),
                 costo: Number(ingresoForm.costo)
             });
             setShowIngresoModal(false);
             await loadData();
             Swal.fire('Actualizado', 'Ingreso modificado', 'success');
         } catch(err:any) { Swal.fire('Error', err.message, 'error'); }
     } else {
         if (ingresoForm.irAPos) {
             navigate('/pos', { state: { customItem: { descripcion: ingresoForm.descripcion, precio: Number(ingresoForm.monto) } } });
             return;
         }
         try {
             await CashService.createIngreso({
                 descripcion: ingresoForm.descripcion,
                 monto: Number(ingresoForm.monto),
                 costo: Number(ingresoForm.costo),
                 fechaCreacion: getFullLocalTimestamp()
             });
             setShowIngresoModal(false);
             setIngresoForm({ id: '', descripcion: '', monto: '', costo: '', irAPos: true });
             await loadData();
             Swal.fire('Guardado', 'Ingreso registrado', 'success');
         } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
     }
  };

  const handleEgresoAction = async () => {
     try {
         if(isEditingEgreso) {
             await CashService.updateEgreso(egresoForm.id, { descripcion: egresoForm.descripcion, monto: Number(egresoForm.monto) });
             Swal.fire('Actualizado', 'Gasto modificado', 'success');
         } else {
             await CashService.createEgreso({ descripcion: egresoForm.descripcion, monto: Number(egresoForm.monto), fechaCreacion: getFullLocalTimestamp() });
             Swal.fire('Guardado', 'Gasto registrado', 'success');
         }
         setShowEgresoModal(false);
         setEgresoForm({ id: '', descripcion: '', monto: '' });
         await loadData();
     } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleDeleteItem = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      const result = await Swal.fire({ title: '¿Eliminar Registro?', text: 'Se revertirá el monto de la caja.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar' });
      if(result.isConfirmed) {
          try {
              if(type === 'INGRESO') await CashService.deleteIngreso(id);
              else await CashService.deleteEgreso(id);
              await loadData();
              Swal.fire('Eliminado', 'Registro eliminado', 'success');
          } catch(err:any) { Swal.fire('Error', err.message, 'error'); }
      }
  };

  const handleAnularVenta = async (idVenta: string) => {
      const result = await Swal.fire({ title: `¿Anular Venta #${idVenta}?`, text: 'Se devolverán los productos al inventario y se descontará el dinero de la caja.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, Anular Venta' });
      if(result.isConfirmed) {
          try {
              await SalesService.anularVenta(idVenta);
              loadData();
              Swal.fire('Anulada', 'Venta anulada correctamente', 'success');
          } catch(err:any) { Swal.fire('Error', err.message, 'error'); }
      }
  };
  
  const handleEditVenta = (venta: Venta) => {
      navigate('/pos', { state: { editSaleId: venta.codVenta, saleData: venta } });
  };

  const handleBuySaldo = async () => {
      try {
          await CashService.buySaldo({ red: saldoForm.red, montoPagado: Number(saldoForm.montoPagado), montoRecibido: Number(saldoForm.montoRecibido), fechaLocal: getLocalDate() });
          setShowSaldoModal(false);
          setSaldoForm({ red: 'TIGO', montoPagado: '', montoRecibido: '' });
          loadData();
          Swal.fire('Éxito', 'Compra de Saldo registrada', 'success');
      } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleRecargaSubmit = async () => {
    if (!arqueo || !showRecargaModal) return;
    let montoCobrado = 0, montoPagado = 0, desc = '';
    
    if (showRecargaModal.tipo === 'PAQUETE') {
       const pq = paquetes.find(p => p.idPaquete === recargaForm.paqueteId);
       if(!pq) return Swal.fire('Error', 'Seleccione paquete', 'error');
       montoCobrado = Number(pq.precio); montoPagado = Number(pq.costo); desc = pq.nombre;
    } else {
       if(!recargaForm.monto || !recargaForm.precio) return Swal.fire('Error', 'Ingrese montos', 'error');
       montoCobrado = Number(recargaForm.precio); montoPagado = Number(recargaForm.monto); desc = `SALDO ${montoPagado}`;
    }

    try {
      await CashService.createRecarga({ red: showRecargaModal.red, tipo: showRecargaModal.tipo, descripcion: desc, precioCobrado: montoCobrado, precioPagado: montoPagado, fechaLocal: getLocalDate() });
      setShowRecargaModal(null);
      setRecargaForm({ tipo: 'RECARGA', monto: '', precio: '', paqueteId: '' });
      loadData();
      Swal.fire('Éxito', 'Recarga procesada', 'success');
    } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const totalIngresos = ingresos.reduce((a,b) => a + Number(b.monto), 0);
  const totalGastos = egresos.reduce((a,b) => a + Number(b.monto), 0);
  const cashInBoxCalculated = arqueo ? (Number(arqueo.montoInicial) + totalIngresos) - totalGastos : 0;

  const getSaldoRed = (red: string) => {
    const s = saldos.find(x => x.red === red);
    return s ? Number(s.saldoFinal) : 0;
  };
  
  const paquetesFiltrados = showRecargaModal ? paquetes.filter(p => p.red === showRecargaModal.red && p.estado === 'Activo') : [];

  const openEditIngreso = (item: Ingreso) => {
      setIngresoForm({ id: item.idIngreso, descripcion: item.descripcion, monto: String(item.monto), costo: String(item.costo), irAPos: false });
      setIsEditingIngreso(true);
      setShowIngresoModal(true);
  };

  const openEditEgreso = (item: Egreso) => {
      setEgresoForm({ id: item.idegresos, descripcion: item.descripcion, monto: String(item.monto) });
      setIsEditingEgreso(true);
      setShowEgresoModal(true);
  };

  if (isLoading) return <div className="flex justify-center items-center h-full text-slate-400">Cargando datos de caja...</div>;

  if (!arqueo) {
      return (
          <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6 animate-fade-in">
              <div className="bg-white max-w-lg w-full rounded-3xl shadow-xl p-8 border border-slate-100">
                  <div className="flex flex-col items-center mb-8">
                      <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4"><CloudLightning className="text-white" size={32} /></div>
                      <h2 className="text-3xl font-bold text-slate-800">Apertura de Caja</h2>
                      <p className="text-slate-500 mt-2 text-center">Inicia tu turno registrando el efectivo inicial y los saldos de recargas disponibles.</p>
                  </div>
                  <div className="space-y-6">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Efectivo en Caja</label>
                          <input type="number" className="w-full p-4 text-2xl font-bold text-center border-2 border-slate-200 rounded-2xl outline-none" placeholder="0.00" value={openForm.monto} onChange={e => setOpenForm({...openForm, monto: e.target.value})} autoFocus/>
                      </div>
                      {(existingBalances.tigo || existingBalances.claro) && (
                          <div className="bg-blue-50 p-3 rounded-xl flex items-center gap-3 text-blue-800 text-sm"><Wallet size={20}/><span>Saldos ya registrados hoy.</span></div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                          {!existingBalances.tigo && (<div><label className="text-xs font-bold text-blue-500 uppercase mb-2 block">Saldo Tigo</label><input type="number" className="w-full p-3 border-2 border-blue-100 bg-blue-50/50 rounded-xl" placeholder="0.00" value={openForm.tigo} onChange={e => setOpenForm({...openForm, tigo: e.target.value})} /></div>)}
                          {!existingBalances.claro && (<div><label className="text-xs font-bold text-red-500 uppercase mb-2 block">Saldo Claro</label><input type="number" className="w-full p-3 border-2 border-red-100 bg-red-50/50 rounded-xl" placeholder="0.00" value={openForm.claro} onChange={e => setOpenForm({...openForm, claro: e.target.value})} /></div>)}
                      </div>
                      <button onClick={handleOpenBox} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-xl flex items-center justify-center gap-3 text-lg"><Lock size={20}/> APERTURAR TURNO</button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6 min-h-[80vh] flex flex-col pb-10">
      <div className="bg-slate-800 rounded-2xl p-6 text-white shadow-lg">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
             <div><h2 className="text-xl font-bold uppercase tracking-wider">Caja: {user?.idCaja}</h2><p className="text-slate-400 text-sm">Usuario: {user?.nombreEmpleado}</p></div>
             <button onClick={handleCloseBox} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg border border-red-500"><Lock size={16}/> CIERRE DE CAJA</button>
         </div>
         <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/5"><p className="text-xs text-slate-400 mb-1 font-bold uppercase">Efectivo en Caja</p><h3 className="text-3xl font-bold tracking-tight">L. {cashInBoxCalculated.toFixed(2)}</h3></div>
              <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/5"><p className="text-xs text-emerald-400 mb-1 font-bold uppercase">Ingresos Hoy</p><h3 className="text-xl font-bold">L. {totalIngresos.toFixed(2)}</h3></div>
              <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/5"><p className="text-xs text-red-300 mb-1 font-bold uppercase">Gastos Hoy</p><h3 className="text-xl font-bold text-red-200">L. {totalGastos.toFixed(2)}</h3></div>
              <div className="bg-blue-600/20 border border-blue-500/30 p-4 rounded-xl"><p className="text-xs text-blue-200 mb-1 font-bold uppercase">Saldo Tigo</p><h3 className="text-xl font-bold">L. {getSaldoRed('TIGO').toFixed(2)}</h3></div>
              <div className="bg-red-600/20 border border-red-500/30 p-4 rounded-xl"><p className="text-xs text-red-200 mb-1 font-bold uppercase">Saldo Claro</p><h3 className="text-xl font-bold">L. {getSaldoRed('CLARO').toFixed(2)}</h3></div>
         </div>
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-slate-200">
         {[{ id: 'INGRESOS', label: 'Ingresos', icon: <ArrowUpCircle size={18}/> }, { id: 'EGRESOS', label: 'Gastos/Compras', icon: <ArrowDownCircle size={18}/> }, { id: 'RECARGAS', label: 'Recargas', icon: <Smartphone size={18}/> }, { id: 'VENTAS', label: 'Historial Ventas', icon: <ShoppingCart size={18}/> }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-6 py-3 font-bold text-sm whitespace-nowrap transition-all border-b-2 flex items-center gap-2 ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{tab.icon} {tab.label}</button>
         ))}
      </div>

      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
         {activeTab === 'INGRESOS' && (
           <div className="space-y-4">
              <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                 <div><h3 className="font-bold text-emerald-800">Registrar Ingreso Manual</h3><p className="text-xs text-emerald-600">Para productos fuera de inventario o servicios.</p></div>
                 <button onClick={() => { setIsEditingIngreso(false); setIngresoForm({id:'', descripcion:'', monto:'', costo:'', irAPos:true}); setShowIngresoModal(true); }} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 shadow-md flex items-center gap-2 font-bold text-sm"><PlusCircle size={18}/> Nuevo Ingreso</button>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 uppercase text-xs"><tr><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3">Costo</th><th className="p-3 text-right">Acciones</th></tr></thead><tbody>{ingresos.map(i => (<tr key={i.idIngreso} className="border-b hover:bg-slate-50"><td className="p-3 font-medium text-slate-700">{i.descripcion}</td><td className="p-3 font-bold text-emerald-600">L. {Number(i.monto).toFixed(2)}</td><td className="p-3 text-slate-500">L. {Number(i.costo).toFixed(2)}</td><td className="p-3 text-right flex justify-end gap-2">{hasPermission('EDITAR_MOVIMIENTOS') && (<button onClick={() => openEditIngreso(i)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={16}/></button>)}{hasPermission('ELIMINAR_MOVIMIENTOS') && (<button onClick={() => handleDeleteItem(i.idIngreso, 'INGRESO')} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16}/></button>)}</td></tr>))}</tbody></table></div>
           </div>
         )}

         {activeTab === 'EGRESOS' && (
           <div className="space-y-4">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex justify-between items-center bg-red-50 p-4 rounded-xl border border-red-100"><div><h3 className="font-bold text-red-800">Registrar Gasto</h3><p className="text-xs text-red-600">Salidas de dinero.</p></div><button onClick={() => { setIsEditingEgreso(false); setEgresoForm({id:'', descripcion:'', monto:''}); setShowEgresoModal(true); }} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shadow-md flex items-center gap-2 font-bold text-sm"><ArrowDownCircle size={18}/> Nuevo</button></div>
                    <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100"><div><h3 className="font-bold text-blue-800">Compra Saldo</h3><p className="text-xs text-blue-600">Reabastecer.</p></div><button onClick={() => setShowSaldoModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-md flex items-center gap-2 font-bold text-sm"><Wallet size={18}/> Comprar</button></div>
               </div>
              <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 uppercase text-xs"><tr><th className="p-3">Descripción</th><th className="p-3">Monto</th><th className="p-3 text-right">Acciones</th></tr></thead><tbody>{egresos.map(e => (<tr key={e.idegresos} className="border-b hover:bg-slate-50"><td className="p-3 font-medium text-slate-700">{e.descripcion}</td><td className="p-3 font-bold text-red-600">L. {Number(e.monto).toFixed(2)}</td><td className="p-3 text-right flex justify-end gap-2">{hasPermission('EDITAR_MOVIMIENTOS') && (<button onClick={() => openEditEgreso(e)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={16}/></button>)}{hasPermission('ELIMINAR_MOVIMIENTOS') && (<button onClick={() => handleDeleteItem(e.idegresos, 'EGRESO')} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16}/></button>)}</td></tr>))}</tbody></table></div>
           </div>
         )}

         {activeTab === 'RECARGAS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
               {['TIGO', 'CLARO'].map(red => (
                  <div key={red} className={`bg-white rounded-xl border shadow-sm flex flex-col ${red === 'TIGO' ? 'border-blue-100' : 'border-red-100'}`}>
                    <div className={`${red === 'TIGO' ? 'bg-blue-600' : 'bg-red-600'} text-white p-4 rounded-t-xl flex justify-between items-center`}><h3 className="font-bold text-lg">{red}</h3><span className="text-xs bg-white/20 px-2 py-1 rounded">Saldo: {getSaldoRed(red)}</span></div>
                    <div className="p-6 flex-1 flex flex-col gap-4">
                        <button onClick={() => { setShowRecargaModal({ red: red as any, tipo: 'RECARGA' }); setRecargaForm({ tipo: 'RECARGA', monto:'', precio:'', paqueteId:''}); }} className={`w-full py-4 bg-slate-50 font-bold rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${red === 'TIGO' ? 'text-blue-700 border-blue-100 hover:bg-blue-600 hover:text-white' : 'text-red-700 border-red-100 hover:bg-red-600 hover:text-white'}`}><Smartphone/> RECARGA NORMAL</button>
                        <button onClick={() => { setShowRecargaModal({ red: red as any, tipo: 'PAQUETE' }); setRecargaForm({ tipo: 'PAQUETE', monto:'', precio:'', paqueteId:''}); }} className={`w-full py-4 bg-slate-50 font-bold rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${red === 'TIGO' ? 'text-blue-700 border-blue-100 hover:bg-blue-600 hover:text-white' : 'text-red-700 border-red-100 hover:bg-red-600 hover:text-white'}`}><Smartphone/> PAQUETES</button>
                    </div>
                  </div>
               ))}
            </div>
         )}
         
         {activeTab === 'VENTAS' && (
           <div className="space-y-4">
              <h3 className="font-bold text-slate-700">Historial Ventas POS (Hoy)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs"><tr><th className="p-3">Factura</th><th className="p-3">Cliente</th><th className="p-3">Total</th><th className="p-3">Estado</th><th className="p-3 text-right">Acción</th></tr></thead>
                    <tbody>
                        {ventas.length === 0 ? (<tr><td colSpan={5} className="p-4 text-center text-slate-400">No hay ventas registradas hoy.</td></tr>) : ventas.map(v => (
                        <tr key={v.codVenta} className={`border-b hover:bg-slate-50 ${v.estado === 'Anulada' ? 'opacity-50 bg-slate-100' : ''}`}>
                            <td className="p-3 font-mono text-xs">{v.codVenta}</td><td className="p-3 text-xs">{v.nombreCliente}</td><td className={`p-3 font-bold ${v.estado === 'Anulada' ? 'line-through text-slate-400' : ''}`}>L. {Number(v.total).toFixed(2)}</td><td className="p-3"><span className={`text-xs px-2 py-1 rounded-full ${v.estado === 'Anulada' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{v.estado}</span></td>
                            <td className="p-3 text-right flex justify-end gap-2">
                                <button onClick={() => handleReprintInvoice(v.codVenta)} className="text-slate-500 hover:bg-slate-100 p-1.5 rounded text-xs font-bold border border-slate-300 flex items-center gap-1" title="Reimprimir Factura"><Printer size={14}/></button>
                                {v.estado !== 'Anulada' && hasPermission('VER_POS') && (<button onClick={() => handleEditVenta(v)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded text-xs font-bold border border-blue-200 flex items-center gap-1"><Edit2 size={12}/> EDITAR</button>)}
                                {v.estado !== 'Anulada' && (hasPermission('ANULAR_VENTA') || hasPermission('VER_ADMIN')) && (<button onClick={() => handleAnularVenta(v.codVenta)} className="text-red-500 hover:bg-red-50 p-1.5 rounded text-xs font-bold border border-red-200">ANULAR</button>)}
                            </td>
                        </tr>
                        ))}
                    </tbody>
                </table>
              </div>
           </div>
         )}
      </div>

      {showRecargaModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl animate-fade-in">
               <div className="flex justify-between items-center mb-4 border-b pb-2"><h3 className="font-bold text-lg">{showRecargaModal.tipo} {showRecargaModal.red}</h3><button onClick={() => setShowRecargaModal(null)}><X size={20} className="text-slate-400 hover:text-red-500"/></button></div>
               {showRecargaModal.tipo === 'PAQUETE' ? (<select className="w-full p-3 border rounded-xl bg-slate-50" value={recargaForm.paqueteId} onChange={e => setRecargaForm({...recargaForm, paqueteId: e.target.value})}><option value="">-- Seleccionar Paquete --</option>{paquetesFiltrados.map(p => (<option key={p.idPaquete} value={p.idPaquete}>{p.nombre} - L.{p.precio} (Costo: L.{p.costo})</option>))}</select>) : (<div className="space-y-4"><div><label className="text-xs font-bold text-slate-500 uppercase">Monto a Enviar (Saldo/Costo)</label><input type="number" className="w-full p-3 border-2 rounded-xl text-xl font-mono" placeholder="0.00" value={recargaForm.monto} onChange={e => setRecargaForm({...recargaForm, monto: e.target.value})} autoFocus /></div><div><label className="text-xs font-bold text-slate-500 uppercase">Precio a Cobrar (Venta)</label><input type="number" className="w-full p-3 border-2 rounded-xl text-xl font-bold text-emerald-600" placeholder="0.00" value={recargaForm.precio} onChange={e => setRecargaForm({...recargaForm, precio: e.target.value})} /></div></div>)}
               <button onClick={handleRecargaSubmit} className="w-full mt-6 py-4 rounded-xl font-bold text-white shadow-lg bg-slate-800 hover:bg-slate-700 transition-colors">PROCESAR</button>
            </div>
         </div>
      )}

      {showSaldoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-fade-in">
                <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg text-slate-800">Comprar Saldo</h3><button onClick={() => setShowSaldoModal(false)}><X size={20} className="text-slate-400"/></button></div>
                <div className="space-y-4"><select className="w-full p-3 border rounded-xl bg-slate-50" value={saldoForm.red} onChange={e => setSaldoForm({...saldoForm, red: e.target.value})}><option value="TIGO">TIGO</option><option value="CLARO">CLARO</option></select><div><label className="text-xs font-bold text-slate-500 uppercase">Dinero Pagado (Egreso)</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-red-600" placeholder="L. Pagados" value={saldoForm.montoPagado} onChange={e => setSaldoForm({...saldoForm, montoPagado: e.target.value})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase">Saldo Recibido</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-blue-600" placeholder="Saldo Recibido" value={saldoForm.montoRecibido} onChange={e => setSaldoForm({...saldoForm, montoRecibido: e.target.value})} /></div><button onClick={handleBuySaldo} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg">Registrar Compra</button></div>
            </div>
         </div>
      )}

      {showIngresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-fade-in">
               <h3 className="font-bold text-lg mb-4">{isEditingIngreso ? 'Editar Ingreso' : 'Registrar Ingreso'}</h3>
               <div className="space-y-4"><div><label className="text-xs font-bold text-slate-500">Descripción</label><input className="w-full p-3 border rounded-xl" placeholder="Producto/Servicio" value={ingresoForm.descripcion} onChange={e => setIngresoForm({...ingresoForm, descripcion:e.target.value})} /></div><div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-bold text-slate-500">Precio Venta</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-emerald-600" placeholder="0.00" value={ingresoForm.monto} onChange={e => setIngresoForm({...ingresoForm, monto:e.target.value})} /></div><div><label className="text-xs font-bold text-slate-500">Costo</label><input type="number" className="w-full p-3 border rounded-xl" placeholder="0.00" value={ingresoForm.costo} onChange={e => setIngresoForm({...ingresoForm, costo:e.target.value})} /></div></div>{!isEditingIngreso && (<div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200"><input type="checkbox" id="irAPos" checked={ingresoForm.irAPos} onChange={e => setIngresoForm({...ingresoForm, irAPos: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"/><label htmlFor="irAPos" className="text-sm font-medium text-slate-700 cursor-pointer select-none">Facturar en Punto de Venta<p className="text-xs text-slate-400 font-normal">Genera ticket formal</p></label></div>)}<div className="flex gap-2 mt-4"><button onClick={() => setShowIngresoModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancelar</button><button onClick={handleIngresoAction} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg">Guardar</button></div></div>
            </div>
         </div>
      )}
      
      {showEgresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-fade-in">
               <h3 className="font-bold text-lg mb-4">{isEditingEgreso ? 'Editar Gasto' : 'Registrar Gasto'}</h3>
               {/* fix: Changed setEditEgresoForm to setEgresoForm which is the correct state setter */}
               <div className="space-y-4"><input className="w-full p-3 border rounded-xl" placeholder="Descripción del gasto" value={egresoForm.descripcion} onChange={e => setEgresoForm({...egresoForm, descripcion:e.target.value})} /><input type="number" className="w-full p-3 border rounded-xl font-bold text-red-600" placeholder="Monto" value={egresoForm.monto} onChange={e => setEgresoForm({...egresoForm, monto:e.target.value})} /><div className="flex gap-2 mt-4"><button onClick={() => setShowEgresoModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancelar</button><button onClick={handleEgresoAction} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg">Guardar</button></div></div>
            </div>
         </div>
      )}
    </div>
  );
};

export default CashRegister;
