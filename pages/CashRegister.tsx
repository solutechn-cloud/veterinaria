
import React, { useState, useEffect } from 'react';
import { CashService, SalesService, PackagesService, ConfigService, AccountingService } from '../services/api';
import { Arqueo, Ingreso, Egreso, Venta, Saldo, Paquete, EmpresaConfig, SubtipoIngreso, SubtipoEgreso, Socio } from '../types';
import { 
  Lock, PlusCircle, Smartphone, Ban, ShoppingCart, ArrowDownCircle, ArrowUpCircle, Wallet, Edit2, Trash2, X, CloudLightning, FileText, Printer, UserCheck, RefreshCw, Package
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate } = ReactRouterDOM as any;
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

type TabType = 'INGRESOS' | 'EGRESO' | 'VENTAS' | 'RECHARGES';

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

const CashRegister: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('INGRESOS');
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [partners, setPartners] = useState<Socio[]>([]);
  const [companyConfig, setCompanyConfig] = useState<any>(null);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);

  const [existingBalances, setExistingBalances] = useState({ tigo: false, claro: false });
  const [openForm, setOpenForm] = useState({ monto: '', tigo: '', claro: '' });
  
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  const [showIngresoModal, setShowIngresoModal] = useState(false);
  const [isEditingIngreso, setIsEditingIngreso] = useState(false);
  const [ingresoForm, setIngresoForm] = useState({ id: '', descripcion: '', monto: '', costo: '', subtipo: 'Reparacion' as SubtipoIngreso, irAPos: true });
  const [showEgresoModal, setShowEgresoModal] = useState(false);
  const [isEditingEgreso, setIsEditingEgreso] = useState(false);
  const [egresoForm, setEditForm] = useState({ id: '', descripcion: '', monto: '', subtipo: 'Gasto Operativo' as SubtipoEgreso, idSocio: '' });
  const [showSaldoModal, setShowSaldoModal] = useState(false);
  const [saldoForm, setSaldoForm] = useState({ red: 'TIGO', montoPagado: '', montoRecibido: '' });
  const [showRecargaModal, setShowRecargaModal] = useState<{red: 'TIGO' | 'CLARO', tipo: 'RECARGA' | 'PAQUETE'} | null>(null);
  const [recargaForm, setRecargaForm] = useState({ tipo: 'RECARGA', monto: '', precio: '', paqueteId: '' });

  const getHndDateOnly = () => {
    const options: Intl.DateTimeFormatOptions = { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(new Date());
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  };

  const getFullHndTimestamp = () => {
    const options: Intl.DateTimeFormatOptions = { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(new Date());
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  };

  useEffect(() => { if (user) { loadData(); loadCatalogos(); loadConfig(); } }, [user]);
  const loadConfig = async () => { try { const cfg = await ConfigService.get(); setCompanyConfig(cfg); } catch (e) { console.error(e); } };
  const loadCatalogos = async () => { try { const [p, s] = await Promise.all([PackagesService.getAll(), AccountingService.getSocios()]); setPaquetes(p || []); setPartners(s || []); } catch(e) { console.error(e); } };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const hndDate = getHndDateOnly();
      const active = await CashService.getActiveArqueo();
      const status = await CashService.getSaldosStatus(hndDate);
      setExistingBalances(status);

      if (active) {
        setArqueo(active);
        const [ing, egr, vts, slds] = await Promise.all([
           CashService.getIngresos(user!.idCaja, hndDate),
           CashService.getEgresos(user!.idCaja, hndDate),
           SalesService.getVentasDiDaily(hndDate),
           CashService.getSaldosToday(hndDate)
        ]);
        setIngresos(ing || []);
        setEgresos(egr || []);
        setVentas(vts || []);
        setSaldos(slds || []);
      } else { setArqueo(null); }
    } catch (error) { console.error(error); } finally { setIsLoading(false); }
  };

  const handleOpenBox = async () => {
     if(!openForm.monto) return Swal.fire('Error', 'Ingrese monto inicial', 'error');
     try {
       await CashService.openCaja({ montoInicial: Number(openForm.monto), saldoTigoInicial: existingBalances.tigo ? 0 : Number(openForm.tigo || 0), saldoClaroInicial: existingBalances.claro ? 0 : Number(openForm.claro || 0) });
       Swal.fire('Éxito', 'Apertura Completa', 'success');
       loadData();
     } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleCloseBox = async () => {
     if(!arqueo) return;
     const result = await Swal.fire({ title: '¿Cerrar Caja?', text: 'Se cerrará el turno y generará reporte.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Cerrar', confirmButtonColor: '#ef4444' });
     if(result.isConfirmed) {
       try {
         const res = await CashService.closeCaja(arqueo.idArqueo);
         Swal.fire({ title: 'Cierre Exitoso', icon: 'success', showCancelButton: true, confirmButtonText: 'Descargar Reporte' })
            .then(r => { if(r.isConfirmed) generateClosingReportPDF(res.resumen, ingresos, egresos, user); });
         loadData(); 
       } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
     }
  };

  const generateClosingReportPDF = (resumen: any, ingresosList: Ingreso[], egresosList: Egreso[], user: any) => {
    const doc = new jsPDF();
    const isAdmin = user.rol === 'Administrador' || hasPermission('VER_ADMIN');
    const date = new Date().toLocaleString();

    const mInicial = Number(resumen.montoinicial || resumen.montoInicial || 0);
    const tVentas = Number(resumen.totalventas || resumen.totalVentas || 0);
    const tGastos = Number(resumen.totalgastos || resumen.TotalGastos || 0);
    const mFinal = Number(resumen.montofinal || resumen.montoFinal || 0);
    const ganancia = Number(resumen.ganancia || 0);
    const sTigo = Number(resumen.saldotigofinal || resumen.saldoTigoFinal || 0);
    const sClaro = Number(resumen.saldoclarofinal || resumen.saldoClaroFinal || 0);

    doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text("REPORTE DE CIERRE DE CAJA", 105, 12, { align: 'center' });
    doc.setFontSize(10); doc.text(`Fecha: ${date} | Cajero: ${user.nombreEmpleado} | Caja: ${user.idCaja}`, 105, 22, { align: 'center' });

    doc.setTextColor(0); doc.setFontSize(12); doc.text("RESUMEN FINANCIERO", 14, 40);
    const summaryData = [['Monto Inicial', `L. ${mInicial.toFixed(2)}`], ['(+) Total Ingresos', `L. ${tVentas.toFixed(2)}`], ['(-) Total Gastos', `L. ${tGastos.toFixed(2)}`], ['(=) Efectivo Calculado', `L. ${mFinal.toFixed(2)}`]];
    if(isAdmin) summaryData.push(['Ganancia Estimada', `L. ${ganancia.toFixed(2)}`]);
    // @ts-ignore
    doc.autoTable({ startY: 45, head: [['Concepto', 'Monto']], body: summaryData, theme: 'grid', headStyles: { fillColor: [79, 70, 229] }, columnStyles: { 1: { halign: 'right' } }, margin: { right: 110 } });
    // @ts-ignore
    doc.autoTable({ startY: 45, head: [['Plataforma', 'Saldo Final']], body: [['TIGO', `L. ${sTigo.toFixed(2)}`], ['CLARO', `L. ${sClaro.toFixed(2)}`]], theme: 'grid', headStyles: { fillColor: [15, 23, 42] }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold', textColor: [0, 128, 0] } }, margin: { left: 110 } });
    // @ts-ignore
    let finalY = Math.max(doc.lastAutoTable.finalY, 45 + (summaryData.length * 8)) + 15;
    doc.text("DETALLE DE INGRESOS", 14, finalY);
    // @ts-ignore
    doc.autoTable({ startY: finalY + 3, head: [['Hora', 'Descripción', 'Monto']], body: ingresosList.map(i => [i.fechaCreacion?.split(' ')[1] || '', i.descripcion, `L. ${Number(i.monto).toFixed(2)}`]), theme: 'striped', headStyles: { fillColor: [16, 185, 129] } });
    // @ts-ignore
    doc.autoTable({ startY: doc.lastAutoTable.finalY + 10, head: [['Hora', 'Descripción', 'Monto']], body: egresosList.map(e => [e.fechaCreacion?.split(' ')[1] || '', e.descripcion, `L. ${Number(e.monto).toFixed(2)}`]), theme: 'striped', headStyles: { fillColor: [239, 68, 68] } });
    doc.save(`Cierre_${user.idCaja}_${getHndDateOnly()}.pdf`);
  };

  const handleReprintInvoice = async (saleId: string) => {
      try {
          const [sale, details, cfg] = await Promise.all([
              SalesService.getVenta(saleId),
              SalesService.getDetallesVenta(saleId),
              ConfigService.get()
          ]);
          if (!sale) return;
          const LOGO_BASE64 = ""; 
          const doc = new jsPDF();
          const nombreEmpresa = (cfg.nombreEmpresa || 'SMARTCLOUD ERP').toUpperCase();
          const rtnEmpresa = cfg.rtn || 'N/A';
          const direccionEmpresa = cfg.direccion || 'N/A';
          const telefonoEmpresa = cfg.telefono || 'N/A';
          const correoEmpresa = cfg.correo || 'N/A';
          const caiEmpresa = cfg.cai || 'N/A';
          const rangoInic = cfg.rangoInicial || 'N/A';
          const rangoFin = cfg.rangoFinal || 'N/A';
          const fechaLim = cfg.fechaLimite ? new Date(cfg.fechaLimite).toLocaleDateString('es-HN') : 'N/A';
          const isvConfig = cfg.isv || 15;
          const mensajeFinal = cfg.mensajeFinal || "LA FACTURA ES BENEFICIO DE TODOS, EXIJALA";
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
          doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
          doc.text(nombreEmpresa, 38, 18); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
          doc.text(direccionEmpresa, 38, 25); doc.text(`Tel: ${telefonoEmpresa} | ${correoEmpresa}`, 38, 30);
          doc.setFontSize(26); doc.setFont("helvetica", "bold");
          doc.text("FACTURA", pageWidth - 15, 20, { align: "right" }); doc.setFontSize(10);
          doc.text(`NO. ${sale.codVenta}`, pageWidth - 15, 29, { align: "right" });
          const topInfoY = 60; doc.setFillColor(lightGray); doc.roundedRect(14, topInfoY, 95, 38, 3, 3, 'F');
          doc.setTextColor(primaryColor); doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("FACTURAR A:", 18, topInfoY + 8);
          doc.setTextColor(0, 0, 0); doc.setFontSize(13); doc.text((sale.nombreCliente || "CONSUMIDOR FINAL").toUpperCase(), 18, topInfoY + 18);
          doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(grayColor);
          doc.text(`RTN/DNI: ${sale.identidadCliente || "99999999999999"}`, 18, topInfoY + 26);
          doc.text(`${sale.direccionCliente || "CHOLUTECA, HONDURAS"}`, 18, topInfoY + 32);
          const rightColX = 120; const metaY = topInfoY + 5; const spacing = 6; doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(grayColor);
          const labels = ["FECHA EMISIÓN:", "FECHA VENCIMIENTO:", "R.T.N. EMISOR:", "CAI:", "VENDEDOR:"];
          const values = [new Date(sale.fecha).toLocaleDateString('es-HN'), fechaLim, rtnEmpresa, caiEmpresa, sale.nombreVendedor?.toUpperCase() || "ADMINISTRADOR"];
          labels.forEach((label, i) => { doc.text(label, rightColX, metaY + (i * spacing)); doc.setTextColor(0, 0, 0); doc.text(String(values[i]), rightColX + 45, metaY + (i * spacing)); doc.setTextColor(grayColor); });
          // @ts-ignore
          doc.autoTable({ startY: topInfoY + 45, head: [['COD.', 'CANT.', 'DESCRIPCIÓN', 'PRECIO UNIT.', 'TOTAL']], body: details.map(item => [item.idTelefono || item.idInventario || 'N/A', item.cantidad, item.descripcionProducto?.toUpperCase() || 'PRODUCTO', `L. ${Number(item.precioVenta).toFixed(2)}`, `L. ${(Number(item.cantidad) * Number(item.precioVenta)).toFixed(2)}`]), theme: 'striped', styles: { fontSize: 9, cellPadding: 3, textColor: [0, 0, 0], halign: 'center' }, headStyles: { fillColor: [30, 58, 138], fontStyle: 'bold', halign: 'center', textColor: [255, 255, 255] }, columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 15 }, 2: { halign: 'left' }, 3: { cellWidth: 30 }, 4: { cellWidth: 30, fontStyle: 'bold' } }, margin: { left: 14, right: 14 } });
          // @ts-ignore
          let finalY = doc.lastAutoTable.finalY + 10; const totalsX = 135; const isvRateNum = isvConfig / 100; const totalVal = Number(sale.total); const subtotalVal = totalVal / (1 + isvRateNum); const isvVal = totalVal - subtotalVal; const descuentVal = Number(sale.descuento || 0);
          doc.setFontSize(10); doc.setTextColor(grayColor); doc.setFont("helvetica", "normal"); doc.text("Subtotal:", totalsX, finalY); doc.text(`L. ${subtotalVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 7; doc.text("Descuentos:", totalsX, finalY); doc.text(`L. ${descuentVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 7; doc.text(`ISV (${isvConfig}%):`, totalsX, finalY); doc.text(`L. ${isvVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          finalY += 3; doc.setDrawColor(primaryColor); doc.setLineWidth(0.5); doc.line(totalsX, finalY, pageWidth - 14, finalY);
          finalY += 6; doc.setFont("helvetica", "bold"); doc.setTextColor(primaryColor); doc.setFontSize(13); doc.text("TOTAL A PAGAR:", totalsX, finalY); doc.text(`L. ${totalVal.toFixed(2)}`, pageWidth - 14, finalY, {align: "right"});
          doc.setTextColor(grayColor); doc.setFontSize(9); doc.text("SON: " + numeroALetras(totalVal), 14, finalY + 12);
          let footerY = pageHeight - 40; doc.setFontSize(8); doc.setTextColor(grayColor); doc.setFont("helvetica", "normal"); doc.text(`Rango Autorizado: ${rangoInic} al ${rangoFin}`, 14, footerY); doc.text(`Fecha Límite de Emisión: ${fechaLim}`, 14, footerY + 5); doc.text(`Original: Cliente | Copia: Emisor`, 14, footerY + 10);
          doc.setFillColor(lightGray); doc.rect(0, pageHeight - 15, pageWidth, 15, 'F'); doc.setTextColor(primaryColor); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(mensajeFinal, pageWidth / 2, pageHeight - 6, { align: "center" });
          doc.save(`Factura_${sale.codVenta}.pdf`);
      } catch (err) { console.error(err); Swal.fire('Error PDF', 'No se pudo generar la factura legal. Verifique configuración de empresa.', 'error'); }
  };

  const handleIngresoAction = async () => {
    if (!ingresoForm.descripcion || !ingresoForm.monto) return Swal.fire('Error', 'Complete campos', 'warning');
    try {
        if (ingresoForm.irAPos && !isEditingIngreso) {
            navigate('/pos', { state: { customItem: { descripcion: ingresoForm.descripcion, precio: Number(ingresoForm.monto) } } });
            return;
        }
        if (isEditingIngreso) await CashService.updateIngreso(ingresoForm.id, { descripcion: ingresoForm.descripcion, monto: Number(ingresoForm.monto), costo: Number(ingresoForm.costo) });
        else await CashService.createIngreso({ descripcion: ingresoForm.descripcion, monto: Number(ingresoForm.monto), costo: Number(ingresoForm.costo), subtipo_movimiento: ingresoForm.subtipo, fechaCreacion: getFullHndTimestamp() });
        setShowIngresoModal(false); loadData();
    } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleEgresoAction = async () => {
     if (!egresoForm.descripcion || !egresoForm.monto) return Swal.fire('Error', 'Complete campos', 'warning');
     const needsPartner = (egresoForm.subtipo === 'Retiro Personal' || egresoForm.subtipo === 'Nomina');
     if (needsPartner && !egresoForm.idSocio) return Swal.fire('Error', 'Socio Requerido', 'warning');
     try {
         const payload = { descripcion: egresoForm.descripcion, monto: Number(egresoForm.monto), subtipo_egreso: egresoForm.subtipo, id_socio_asignado: needsPartner ? Number(egresoForm.idSocio) : null, fechaCreacion: getFullHndTimestamp() };
         if (isEditingEgreso) await CashService.updateEgreso(egresoForm.id, payload);
         else await CashService.createEgreso(payload);
         setShowEgresoModal(false); loadData();
     } catch(err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleDeleteItem = async (id: string, type: 'INGRESO' | 'EGRESO') => {
      const result = await Swal.fire({ title: '¿Eliminar?', icon: 'warning', showCancelButton: true });
      if(result.isConfirmed) { try { if(type === 'INGRESO') await CashService.deleteIngreso(id); else await CashService.deleteEgreso(id); loadData(); } catch(e:any) { Swal.fire('Error', e.message, 'error'); } }
  };

  const handleAnularVenta = async (id: string) => {
      const result = await Swal.fire({ title: '¿Anular Venta?', text: 'Se eliminará el ingreso asociado y devolverá stock.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' });
      if(result.isConfirmed) { try { await SalesService.anularVenta(id); loadData(); Swal.fire('Éxito', 'Venta anulada e ingreso eliminado', 'success'); } catch(e:any) { Swal.fire('Error', e.message, 'error'); } }
  };

  const handleBuySaldo = async () => {
      if(!saldoForm.montoPagado || !saldoForm.montoRecibido) return Swal.fire('Error', 'Complete montos', 'warning');
      try { await CashService.buySaldo({ red: saldoForm.red, montoPagado: Number(saldoForm.montoPagado), montoRecibido: Number(saldoForm.montoRecibido), fechaLocal: getHndDateOnly() }); setShowSaldoModal(false); loadData(); } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const handleRecargaSubmit = async () => {
    if (!arqueo || !showRecargaModal) return;
    let montoVenta = 0, costo = 0, desc = '';
    if (showRecargaModal.tipo === 'PAQUETE') {
       const pq = paquetes.find(p => p.idPaquete === recargaForm.paqueteId);
       if(!pq) return; montoVenta = Number(pq.precio); costo = Number(pq.costo); desc = pq.nombre;
    } else {
       if(!recargaForm.monto || !recargaForm.precio) return;
       montoVenta = Number(recargaForm.precio); costo = Number(recargaForm.monto); desc = `SALDO ${costo}`;
    }
    try { await CashService.createRecarga({ red: showRecargaModal.red, tipo: showRecargaModal.tipo, descripcion: desc, precioCobrado: montoVenta, precioPagado: costo, fechaLocal: getHndDateOnly() }); setShowRecargaModal(null); loadData(); } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const openNewIngreso = () => { setIsEditingIngreso(false); setIngresoForm({ id: '', descripcion: '', monto: '', costo: '', subtipo: 'Reparacion', irAPos: true }); setShowIngresoModal(true); };
  const openEditIngreso = (item: Ingreso) => { setIsEditingIngreso(true); setIngresoForm({ id: item.idIngreso, descripcion: item.descripcion, monto: String(item.monto), costo: String(item.costo), subtipo: item.subtipo_movimiento || 'Reparacion', irAPos: false }); setShowIngresoModal(true); };
  const openNewEgreso = () => { setIsEditingEgreso(false); setEditForm({ id: '', descripcion: '', monto: '', subtipo: 'Gasto Operativo', idSocio: '' }); setShowEgresoModal(true); };
  const openEditEgreso = (item: Egreso) => { setIsEditingEgreso(true); setEditForm({ id: item.idegresos, descripcion: item.descripcion, monto: String(item.monto), subtipo: item.subtipo_egreso || 'Gasto Operativo', idSocio: item.id_socio_asignado ? String(item.id_socio_asignado) : '' }); setShowEgresoModal(true); };

  const totalIngresos = ingresos.reduce((a,b) => a + Number(b.monto), 0);
  const totalGastos = egresos.reduce((a,b) => a + Number(b.monto), 0);
  const cashCalculated = arqueo ? (Number(arqueo.montoInicial) + totalIngresos) - totalGastos : 0;
  
  // FIX: Se agregó verificación de nulos y redondeo para evitar NaN en el UI
  const getSaldoRed = (red: string) => {
      const s = saldos.find(x => x.red === red);
      return s ? Number(s.saldoFinal || 0) : 0;
  };

  if (isLoading) return <div className="flex justify-center items-center h-full text-slate-400 gap-3"><RefreshCw className="animate-spin"/> Cargando...</div>;

  if (!arqueo) {
      return (
          <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6 animate-fade-in">
              <div className="bg-white max-w-lg w-full rounded-3xl shadow-xl p-8 border border-slate-100">
                  <div className="flex flex-col items-center mb-8">
                      <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4"><CloudLightning className="text-white" size={32} /></div>
                      <h2 className="text-3xl font-bold text-slate-800">Apertura</h2>
                  </div>
                  <div className="space-y-6">
                      <div><label className="text-xs font-bold text-slate-500 uppercase block mb-2">Efectivo Inicial</label><input type="number" className="w-full p-4 text-2xl font-bold text-center border-2 border-slate-200 rounded-2xl" placeholder="0.00" value={openForm.monto} onChange={e => setOpenForm({...openForm, monto: e.target.value})} autoFocus/></div>
                      <div className="grid grid-cols-2 gap-4">
                          {!existingBalances.tigo && (<div><label className="text-xs font-bold text-blue-500 uppercase mb-2 block">Saldo Tigo</label><input type="number" className="w-full p-3 border-2 border-blue-100 rounded-xl" value={openForm.tigo} onChange={e => setOpenForm({...openForm, tigo: e.target.value})} /></div>)}
                          {!existingBalances.claro && (<div><label className="text-xs font-bold text-red-500 uppercase mb-2 block">Saldo Claro</label><input type="number" className="w-full p-3 border-2 border-red-100 rounded-xl" value={openForm.claro} onChange={e => setOpenForm({...openForm, claro: e.target.value})} /></div>)}
                      </div>
                      <button onClick={handleOpenBox} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-xl flex items-center justify-center gap-3 text-lg"><Lock size={20}/> INICIAR TURNO</button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6 min-h-[80vh] flex flex-col pb-10 animate-fade-in">
      <div className="bg-slate-800 rounded-2xl p-6 text-white shadow-lg">
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
             <div><h2 className="text-xl font-bold uppercase tracking-wider">Caja: {user?.idCaja}</h2><p className="text-slate-400 text-xs">Abierto el: {new Date(arqueo.fechaApertura).toLocaleString()}</p></div>
             <button onClick={handleCloseBox} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 border border-red-500 shadow-lg shadow-red-500/20"><Lock size={16}/> CERRAR CAJA</button>
         </div>
         <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              <div className="bg-white/10 p-4 rounded-xl border border-white/5"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Efectivo Actual</p><h3 className="text-2xl font-bold tracking-tight">L. {Number(cashCalculated || 0).toLocaleString()}</h3></div>
              <div className="bg-white/10 p-4 rounded-xl border border-white/5"><p className="text-[10px] text-emerald-400 font-bold uppercase mb-1">Ingresos</p><h3 className="text-lg font-bold">L. {Number(totalIngresos || 0).toLocaleString()}</h3></div>
              <div className="bg-white/10 p-4 rounded-xl border border-white/5"><p className="text-[10px] text-red-300 font-bold uppercase mb-1">Egresos</p><h3 className="text-lg font-bold">L. {Number(totalGastos || 0).toLocaleString()}</h3></div>
              {/* FIX: Se agregó verificación de NaN en las tarjetas superiores */}
              <div className="bg-blue-600/20 border border-blue-500/30 p-4 rounded-xl"><p className="text-[10px] text-blue-200 font-bold uppercase mb-1">Tigo</p><h3 className="text-lg font-bold">L. {getSaldoRed('TIGO').toLocaleString()}</h3></div>
              <div className="bg-red-600/20 border border-red-500/30 p-4 rounded-xl"><p className="text-[10px] text-red-200 font-bold uppercase mb-1">Claro</p><h3 className="text-lg font-bold">L. {getSaldoRed('CLARO').toLocaleString()}</h3></div>
         </div>
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-slate-200">
         {[{ id: 'INGRESOS', label: 'Ingresos', icon: <ArrowUpCircle size={18}/> }, { id: 'EGRESO', label: 'Gastos/Compras', icon: <ArrowDownCircle size={18}/> }, { id: 'RECHARGES', label: 'Recargas', icon: <Smartphone size={18}/> }, { id: 'VENTAS', label: 'Historial Ventas', icon: <ShoppingCart size={18}/> }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{tab.icon} {tab.label}</button>
         ))}
      </div>

      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
         {activeTab === 'INGRESOS' && (
           <div className="space-y-4">
              <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                 <div><h3 className="font-bold text-emerald-800">Nuevo Ingreso</h3><p className="text-xs text-emerald-600">Servicios técnicos, reparaciones o ventas externas.</p></div>
                 <button onClick={openNewIngreso} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 shadow-md flex items-center gap-2 font-bold text-sm transition-all active:scale-95"><PlusCircle size={18}/> Registrar</button>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-xs md:text-sm text-left"><thead className="bg-slate-50 text-slate-500 uppercase font-bold"><tr><th className="p-3">Categoría</th><th className="p-3">Descripción</th><th className="p-3 text-right">Monto</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>{ingresos.length === 0 ? (<tr><td colSpan={4} className="p-10 text-center text-slate-400 italic">Sin registros hoy.</td></tr>) : ingresos.map(i => (<tr key={i.idIngreso} className="border-b hover:bg-slate-50 group"><td className="p-3"><span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600 uppercase">{i.subtipo_movimiento || 'Venta'}</span></td><td className="p-3 font-medium text-slate-700">{i.descripcion}</td><td className="p-3 font-bold text-emerald-600 text-right">L. {Number(i.monto).toFixed(2)}</td><td className="p-3 text-right flex justify-end gap-1"><button onClick={() => openEditIngreso(i)} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={16}/></button><button onClick={() => handleDeleteItem(i.idIngreso, 'INGRESO')} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
           </div>
         )}

         {activeTab === 'EGRESO' && (
           <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex justify-between items-center bg-red-50 p-4 rounded-xl border border-red-100"><div><h3 className="font-bold text-red-800 text-sm">Gasto General</h3><p className="text-[10px] text-red-600">Pagos, nómina o retiros.</p></div><button onClick={openNewEgreso} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shadow-md font-bold text-xs transition-all active:scale-95">Registrar Gasto</button></div>
                  <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100"><div><h3 className="font-bold text-blue-800 text-sm">Compra Saldo</h3><p className="text-[10px] text-blue-600">Reabastecimiento.</p></div><button onClick={() => { setSaldoForm({red:'TIGO', montoPagado:'', montoRecibido:''}); setShowSaldoModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-md font-bold text-xs transition-all active:scale-95"><Wallet size={16}/> Comprar</button></div>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-xs md:text-sm text-left"><thead className="bg-slate-50 text-slate-500 uppercase font-bold"><tr><th className="p-3">Categoría</th><th className="p-3">Descripción</th><th className="p-3 text-right">Monto</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>{egresos.length === 0 ? (<tr><td colSpan={4} className="p-10 text-center text-slate-400 italic">Sin egresos hoy.</td></tr>) : egresos.map(e => (<tr key={e.idegresos} className="border-b hover:bg-slate-50 group"><td className="p-3"><span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600 uppercase">{e.subtipo_egreso || 'Gasto'}</span></td><td className="p-3 font-medium text-slate-700">{e.descripcion}{e.id_socio_asignado && <span className="block text-[10px] text-indigo-500 font-bold flex items-center gap-1"><UserCheck size={10}/> Socio: {partners.find(p=>p.idSocio===e.id_socio_asignado)?.nombre}</span>}</td><td className="p-3 font-bold text-red-600 text-right">L. {Number(e.monto).toFixed(2)}</td><td className="p-3 text-right flex justify-end gap-1"><button onClick={() => openEditEgreso(e)} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={16}/></button><button onClick={() => handleDeleteItem(e.idegresos, 'EGRESO')} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
           </div>
         )}

         {activeTab === 'RECHARGES' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
               {['TIGO', 'CLARO'].map(red => (
                  <div key={red} className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col ${red === 'TIGO' ? 'border-blue-100' : 'border-red-100'}`}>
                    <div className={`${red === 'TIGO' ? 'bg-blue-600' : 'bg-red-600'} text-white p-4 flex justify-between items-center`}><h3 className="font-bold text-lg">{red}</h3><span className="text-xs bg-white/20 px-3 py-1 rounded-full font-bold">Saldo: L. {getSaldoRed(red).toFixed(2)}</span></div>
                    <div className="p-6 grid grid-cols-1 gap-4">
                        <button onClick={() => { setShowRecargaModal({ red: red as any, tipo: 'RECARGA' }); setRecargaForm({tipo:'RECARGA', monto:'', precio:'', paqueteId:''}); }} className={`w-full py-4 bg-slate-50 font-black rounded-2xl border-2 transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest ${red==='TIGO'?'text-blue-700 border-blue-50 hover:bg-blue-600 hover:text-white':'text-red-700 border-red-50 hover:bg-red-600 hover:text-white'}`}><Smartphone size={20}/> Recarga Saldo</button>
                        <button onClick={() => { setShowRecargaModal({ red: red as any, tipo: 'PAQUETE' }); setRecargaForm({tipo:'PAQUETE', monto:'', precio:'', paqueteId:''}); }} className={`w-full py-4 bg-slate-50 font-black rounded-2xl border-2 transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest ${red==='TIGO'?'text-blue-700 border-blue-50 hover:bg-blue-600 hover:text-white':'text-red-700 border-red-50 hover:bg-red-600 hover:text-white'}`}><Package size={20}/> Comprar Paquete</button>
                    </div>
                  </div>
               ))}
            </div>
         )}

         {activeTab === 'VENTAS' && (
           <div className="space-y-4 animate-fade-in">
              <div className="overflow-x-auto"><table className="w-full text-xs md:text-sm text-left"><thead className="bg-slate-50 text-slate-500 uppercase font-bold"><tr><th className="p-3">Factura</th><th className="p-3">Cliente</th><th className="p-3 text-right">Total</th><th className="p-3">Estado</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>
                  {ventas.length === 0 ? (<tr><td colSpan={5} className="p-10 text-center text-slate-400 italic">No hay ventas registradas hoy.</td></tr>) : ventas.map(v => (
                  <tr key={v.codVenta} className={`border-b hover:bg-slate-50 transition-colors ${v.estado === 'Anulada' ? 'opacity-40 bg-slate-50' : ''}`}><td className="p-3 font-mono text-xs">{v.codVenta}</td><td className="p-3">{v.nombreCliente}</td><td className={`p-3 font-bold text-right ${v.estado === 'Anulada' ? 'line-through text-slate-400' : ''}`}>L. {Number(v.total).toFixed(2)}</td><td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.estado === 'Anulada' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{v.estado}</span></td>
                  <td className="p-3 text-right flex justify-end gap-1">
                      <button onClick={() => handleReprintInvoice(v.codVenta)} className="p-1.5 text-slate-500 hover:text-indigo-600 transition-colors" title="Reimprimir"><Printer size={16}/></button>
                      {v.estado !== 'Anulada' && (<><button onClick={() => navigate('/pos', { state: { editSaleId: v.codVenta } })} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded" title="Editar"><Edit2 size={16}/></button><button onClick={() => handleAnularVenta(v.codVenta)} className="p-1.5 text-red-400 hover:text-red-600" title="Anular"><Ban size={16}/></button></>)}
                  </td></tr>))}</tbody></table></div>
           </div>
         )}
      </div>

      {/* MODALES */}
      {showIngresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
               <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-2"><h3 className="font-bold text-xl text-slate-800">{isEditingIngreso ? 'Editar Ingreso' : 'Registrar Ingreso'}</h3><button onClick={() => setShowIngresoModal(false)}><X className="text-slate-400"/></button></div>
               <div className="space-y-4">
                  {!isEditingIngreso && (
                      <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Clasificación</label>
                        <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={ingresoForm.subtipo} onChange={e => setIngresoForm({...ingresoForm, subtipo: e.target.value as any})}>
                          <option value="Reparacion">Servicio de Reparación</option>
                          <option value="Venta">Venta Producto</option>
                          <option value="KrediYa_Prima">KrediYa (Pago de Prima)</option>
                          <option value="Cobros Venta a Negocios Externos">Cobros Venta a Negocios Externos</option>
                        </select>
                      </div>
                  )}
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción</label><input className="w-full p-3 border rounded-xl outline-none focus:border-indigo-500" placeholder="Ej: Reparación Pantalla S20" value={ingresoForm.descripcion} onChange={e => setIngresoForm({...ingresoForm, descripcion:e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Precio Cobrado</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-emerald-600 outline-none focus:border-emerald-500" value={ingresoForm.monto} onChange={e => setIngresoForm({...ingresoForm, monto:e.target.value})} /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Costo Base</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-slate-400 outline-none focus:border-slate-400" value={ingresoForm.costo} onChange={e => setIngresoForm({...ingresoForm, costo:e.target.value})} /></div>
                  </div>
                  {!isEditingIngreso && (
                    <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                        <input type="checkbox" id="irAPosIn" checked={ingresoForm.irAPos} onChange={e => setIngresoForm({...ingresoForm, irAPos: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded"/><label htmlFor="irAPosIn" className="text-xs font-bold text-indigo-700 cursor-pointer">Facturar en Punto de Venta</label>
                    </div>
                  )}
                  <button onClick={handleIngresoAction} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-lg hover:bg-emerald-700 transition-all text-sm tracking-widest mt-4 uppercase active:scale-[0.98]">GUARDAR MOVIMIENTO</button>
               </div>
            </div>
         </div>
      )}

      {showEgresoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
               <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-2"><h3 className="font-bold text-xl text-slate-800">{isEditingEgreso ? 'Editar Gasto' : 'Registrar Salida'}</h3><button onClick={() => setShowEgresoModal(false)}><X className="text-slate-400"/></button></div>
               <div className="space-y-4">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Tipo de Salida</label>
                    <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={egresoForm.subtipo} onChange={e => setEditForm({...egresoForm, subtipo: e.target.value as any, idSocio: ''})}>
                      <option value="Gasto Operativo">Gasto Operativo</option>
                      <option value="Pago Servicio de Reparación">Pago Servicio de Reparación</option>
                      <option value="Pago Inventario Externo">Pago Inventario Externo</option>
                      <option value="Retiro Personal">Retiro Personal</option>
                      <option value="Nomina">Pago de Empleado (Nómina)</option>
                      <option value="Compra Inventario">Compra de Mercadería</option>
                    </select>
                  </div>
                  {(egresoForm.subtipo === 'Retiro Personal' || egresoForm.subtipo === 'Nomina') && (
                      <div className="animate-fade-in"><label className="text-[10px] font-black text-indigo-500 uppercase mb-1 block">Vincular a Socio</label>
                        <select className="w-full p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-bold text-indigo-700" value={egresoForm.idSocio} onChange={e => setEditForm({...egresoForm, idSocio: e.target.value})}>
                          <option value="">-- Seleccionar Socio --</option>
                          {partners.map(p => <option key={p.idSocio} value={p.idSocio}>{p.nombre}</option>)}
                        </select>
                      </div>
                  )}
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Descripción</label><input className="w-full p-3 border rounded-xl outline-none focus:border-red-500" placeholder="Ej: Pago de alquiler" value={egresoForm.descripcion} onChange={e => setEditForm({...egresoForm, descripcion:e.target.value})} /></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Monto a Retirar</label><input type="number" className="w-full p-3 border rounded-xl font-bold text-red-600 outline-none focus:border-red-600" value={egresoForm.monto} onChange={e => setEditForm({...egresoForm, monto:e.target.value})} /></div>
                  <button onClick={handleEgresoAction} className="w-full py-4 bg-red-600 text-white rounded-2xl font-black shadow-lg hover:bg-red-700 transition-all text-sm tracking-widest mt-4 uppercase active:scale-[0.98]">PROCESAR SALIDA</button>
               </div>
            </div>
         </div>
      )}

      {showRecargaModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
               <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-xl text-slate-800">{showRecargaModal.tipo} {showRecargaModal.red}</h3><button onClick={() => setShowRecargaModal(null)}><X className="text-slate-400"/></button></div>
               <div className="space-y-4">
                  {showRecargaModal.tipo === 'PAQUETE' ? (
                      <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Seleccionar Paquete</label>
                        <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={recargaForm.paqueteId} onChange={e => setRecargaForm({...recargaForm, paqueteId: e.target.value})}>
                          <option value="">-- Paquetes {showRecargaModal.red} --</option>
                          {paquetes.filter(p=>p.red===showRecargaModal.red && p.estado === 'Activo').map(p=>(<option key={p.idPaquete} value={p.idPaquete}>{p.nombre} - L.{p.precio}</option>))}
                        </select>
                      </div>
                  ) : (
                      <div className="grid grid-cols-1 gap-4">
                        <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Monto Saldo (Costo)</label><input type="number" className="w-full p-3 border rounded-xl font-mono text-xl" value={recargaForm.monto} onChange={e => setRecargaForm({...recargaForm, monto:e.target.value})} autoFocus/></div>
                        <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Precio Cobrado (Venta)</label><input type="number" className="w-full p-3 border rounded-xl font-black text-emerald-600 text-xl" value={recargaForm.precio} onChange={e => setRecargaForm({...recargaForm, precio:e.target.value})} /></div>
                      </div>
                  )}
                  <button onClick={handleRecargaSubmit} className={`w-full py-4 ${showRecargaModal.red==='TIGO'?'bg-blue-600':'bg-red-600'} text-white rounded-2xl font-black shadow-lg hover:brightness-110 transition-all text-sm tracking-widest mt-4 uppercase`}>PROCESAR RECARGA</button>
               </div>
            </div>
         </div>
      )}

      {showSaldoModal && (
         <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-2"><h3 className="font-bold text-xl text-slate-800">Comprar Saldo</h3><button onClick={() => setShowSaldoModal(false)}><X size={20} className="text-slate-400"/></button></div>
                <div className="space-y-4">
                    <select className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 font-bold" value={saldoForm.red} onChange={e => setSaldoForm({...saldoForm, red: e.target.value as any})}><option value="TIGO">TIGO</option><option value="CLARO">CLARO</option></select>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Efectivo Pagado (Egreso de Caja)</label><input type="number" className="w-full p-3 border border-slate-200 rounded-xl font-bold text-red-600" value={saldoForm.montoPagado} onChange={e => setSaldoForm({...saldoForm, montoPagado: e.target.value})} /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Saldo Recibido en App</label><input type="number" className="w-full p-3 border border-slate-200 rounded-xl font-bold text-blue-600" value={saldoForm.montoRecibido} onChange={e => setSaldoForm({...saldoForm, montoRecibido: e.target.value})} /></div>
                    <button onClick={handleBuySaldo} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg hover:bg-indigo-700 transition-all text-sm tracking-widest mt-4 uppercase">REGISTRAR COMPRA</button>
                </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default CashRegister;
