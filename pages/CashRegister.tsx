
import React, { useState, useEffect } from 'react';
import { CashService, SalesService, ConfigService } from '../services/api';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { printSaleInvoice, downloadSaleInvoicePDF } from '../services/DocumentService';
import { Arqueo, Venta } from '../types';
import {
  Lock, ShoppingCart, CloudLightning, Printer, RefreshCw, Ban, Edit2,
  DollarSign, TrendingUp, Calculator, CheckCircle2
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate } = ReactRouterDOM as any;
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const fmt = (n: number) => `L. ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hasAssignedCashRegister = (idCaja?: string | null) => !!idCaja && idCaja !== 'Sin Caja';

const CashRegister: React.FC = () => {
  const [arqueo, setArqueo]         = useState<Arqueo | null>(null);
  const [ventas, setVentas]         = useState<Venta[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [companyConfig, setConfig]  = useState<any>(null);
  const [montoInicial, setMontoInicial] = useState('');

  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  const getHndDateOnly = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const p = (t: string) => parts.find(x => x.type === t)?.value || '00';
    return `${p('year')}-${p('month')}-${p('day')}`;
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const active = await CashService.getActiveArqueo();
      setArqueo(active);
      if (active) {
        const vts = await SalesService.getVentasDiDaily(getHndDateOnly());
        setVentas(vts || []);
      } else {
        setVentas([]);
      }
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  };

  const loadConfig = async () => {
    try { setConfig(await ConfigService.get()); } catch { /* ignore */ }
  };

  useEffect(() => { if (user) { loadData(); loadConfig(); } }, [user]);
  useOfflineSync(loadData);

  /* ── Apertura ── */
  const handleOpenBox = async () => {
    if (!hasAssignedCashRegister(user?.idCaja)) {
      return Swal.fire({
        icon: 'warning',
        title: 'Caja no asignada',
        text: 'Tu usuario no tiene una caja asignada. Solicita a un administrador que te asigne una caja activa antes de iniciar turno.',
        confirmButtonText: 'Entendido',
      });
    }
    if (!montoInicial) return Swal.fire('Error', 'Ingrese el monto inicial de caja', 'error');
    try {
      await CashService.openCaja({ montoInicial: Number(montoInicial) });
      setMontoInicial('');
      await Swal.fire({ title: 'Apertura Exitosa', icon: 'success', timer: 1500, showConfirmButton: false });
      loadData();
    } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  /* ── Cierre ── */
  const handleCloseBox = async () => {
    if (!arqueo) return;
    const confirm = await Swal.fire({
      title: '¿Cerrar Caja?', text: 'Se cerrará el turno actual y se generará el reporte.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Cerrar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
    });
    if (!confirm.isConfirmed) return;
    try {
      const res = await CashService.closeCaja(arqueo.idArqueo);
      const { value: descargar } = await Swal.fire({
        title: 'Cierre Exitoso', icon: 'success', showCancelButton: true,
        confirmButtonText: 'Descargar Reporte', cancelButtonText: 'Cerrar',
      });
      if (descargar) generateClosingPDF(res.resumen, ventas);
      loadData();
    } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  /* ── PDF Cierre ── */
  const generateClosingPDF = (resumen: any, ventasList: Venta[]) => {
    const doc = new jsPDF();
    const now = new Date().toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' });
    const mInicial  = Number(resumen?.montoInicial   || resumen?.montoinicial   || arqueo?.montoInicial || 0);
    const tVentas   = Number(resumen?.totalVentas    || resumen?.totalventas    || 0);
    const mFinal    = mInicial + tVentas;

    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('REPORTE DE CIERRE DE CAJA', 105, 13, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${now}  |  Cajero: ${user?.nombreEmpleado || user?.usuario}  |  Caja: ${user?.idCaja}`, 105, 22, { align: 'center' });
    if (companyConfig?.nombreEmpresa) doc.text(companyConfig.nombreEmpresa.toUpperCase(), 105, 29, { align: 'center' });

    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN FINANCIERO', 14, 45);

    // @ts-ignore
    doc.autoTable({
      startY: 50,
      head: [['Concepto', 'Monto']],
      body: [
        ['Monto Inicial en Caja', fmt(mInicial)],
        ['(+) Total Ventas del Turno', fmt(tVentas)],
        ['(=) Efectivo Esperado', fmt(mFinal)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });

    // @ts-ignore
    const afterSummary = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`VENTAS DEL TURNO (${ventasList.filter(v => v.estado !== 'Anulada').length} facturas)`, 14, afterSummary);

    // @ts-ignore
    doc.autoTable({
      startY: afterSummary + 5,
      head: [['Factura', 'Cliente', 'Forma Pago', 'Total']],
      body: ventasList.map(v => [
        v.codVenta,
        v.nombreCliente || 'Consumidor Final',
        v.tipoCompra || 'Contado',
        v.estado === 'Anulada' ? 'ANULADA' : fmt(Number(v.total)),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 3: { halign: 'right' } },
      margin: { left: 14, right: 14 },
      didParseCell: (data: any) => {
        if (data.section === 'body' && ventasList[data.row.index]?.estado === 'Anulada') {
          data.cell.styles.textColor = [200, 0, 0];
        }
      },
    });

    doc.save(`Cierre_${user?.idCaja}_${getHndDateOnly()}.pdf`);
  };

  /* ── Reimprimir Factura ── */
  const handleReprintInvoice = async (saleId: string) => {
    const { isConfirmed, isDenied } = await Swal.fire({
      title: 'Reimprimir Factura',
      text: `Factura ${saleId}`,
      icon: 'question',
      confirmButtonText: 'Imprimir (vista previa)',
      confirmButtonColor: '#4f46e5',
      showDenyButton: true,
      denyButtonText: 'Descargar PDF',
      denyButtonColor: '#0ea5e9',
      showCancelButton: true,
      cancelButtonText: 'Cerrar',
      cancelButtonColor: '#64748b',
    });
    if (!isConfirmed && !isDenied) return;
    try {
      const result = isConfirmed
        ? await printSaleInvoice(saleId)
        : await downloadSaleInvoicePDF(saleId);
      if (!result.success) Swal.fire('Sin plantilla', result.message, 'warning');
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo generar la factura.', 'error');
    }
  };

  /* ── Anular Venta ── */
  const handleAnularVenta = async (id: string) => {
    const confirm = await Swal.fire({
      title: '¿Anular Venta?', text: 'Se repondrá el stock de medicamentos afectados.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Anular',
      confirmButtonColor: '#d33',
    });
    if (!confirm.isConfirmed) return;
    try {
      await SalesService.anularVenta(id);
      loadData();
      Swal.fire({ title: 'Venta Anulada', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  /* ── Cálculos ── */
  const ventasCompletadas = ventas.filter(v => v.estado === 'Completada');
  const totalVentas       = ventasCompletadas.reduce((a, v) => a + Number(v.total), 0);
  const efectivoCalculado = arqueo ? Number(arqueo.montoInicial) + totalVentas : 0;

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full text-slate-400 gap-3">
        <RefreshCw className="animate-spin" size={20} /> Cargando...
      </div>
    );
  }

  /* ── Apertura de caja ── */
  if (!hasAssignedCashRegister(user?.idCaja)) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6 animate-fade-in">
        <div className="bg-white max-w-md w-full rounded-3xl shadow-xl p-8 border border-amber-100">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-4">
              <Lock className="text-amber-600" size={30} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Caja no asignada</h2>
            <p className="text-slate-500 text-sm mt-3 leading-relaxed">
              Tu usuario puede iniciar sesion, pero no puede abrir turno porque no tiene una caja activa asignada.
            </p>
          </div>
          <div className="mt-6 rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-800">
            Un administrador debe ir a Administracion &gt; Usuarios y asignarte una caja de tu sucursal.
          </div>
          <button
            onClick={loadData}
            className="mt-6 w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCw size={16} /> Verificar de nuevo
          </button>
        </div>
      </div>
    );
  }

  if (!arqueo) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6 animate-fade-in">
        <div className="bg-white max-w-sm w-full rounded-3xl shadow-xl p-8 border border-slate-100">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4">
              <CloudLightning className="text-white" size={32} />
            </div>
            <h2 className="text-3xl font-bold text-slate-800">Apertura de Caja</h2>
            <p className="text-slate-400 text-sm mt-1">Caja: <span className="font-bold text-indigo-600">{user?.idCaja}</span></p>
          </div>
          <div className="space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Efectivo Inicial</label>
              <input
                type="number" min="0" step="0.01"
                className="w-full p-4 text-2xl font-bold text-center border-2 border-slate-200 rounded-2xl focus:border-indigo-400 outline-none transition"
                placeholder="0.00"
                value={montoInicial}
                onChange={e => setMontoInicial(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleOpenBox()}
                autoFocus
              />
            </div>
            <button
              onClick={handleOpenBox}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-xl flex items-center justify-center gap-3 text-lg transition-colors"
            >
              <Lock size={20} /> INICIAR TURNO
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Caja Abierta ── */
  return (
    <div className="space-y-5 flex flex-col pb-10 animate-fade-in">
      {/* ── Header del turno ── */}
      <div className="bg-slate-800 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold uppercase tracking-wider">Caja: {user?.idCaja}</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Turno abierto el {new Date(arqueo.fechaApertura).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' })}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadData} className="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
              <RefreshCw size={16} /> Actualizar
            </button>
            <button onClick={handleCloseBox} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 border border-red-500 shadow-lg shadow-red-500/20 transition-colors">
              <Lock size={16} /> CERRAR CAJA
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 p-4 rounded-xl border border-white/10">
            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-1">
              <DollarSign size={12} /> Efectivo Inicial
            </p>
            <h3 className="text-2xl font-bold">{fmt(Number(arqueo.montoInicial))}</h3>
          </div>
          <div className="bg-emerald-600/20 border border-emerald-500/30 p-4 rounded-xl">
            <p className="text-[10px] text-emerald-300 font-bold uppercase mb-1 flex items-center gap-1">
              <TrendingUp size={12} /> Ventas del Turno
            </p>
            <h3 className="text-2xl font-bold text-emerald-300">{fmt(totalVentas)}</h3>
            <p className="text-[10px] text-emerald-400 mt-1">{ventasCompletadas.length} facturas completadas</p>
          </div>
          <div className="bg-indigo-600/30 border border-indigo-400/40 p-4 rounded-xl">
            <p className="text-[10px] text-indigo-200 font-bold uppercase mb-1 flex items-center gap-1">
              <Calculator size={12} /> Efectivo Esperado
            </p>
            <h3 className="text-2xl font-bold text-indigo-100">{fmt(efectivoCalculado)}</h3>
          </div>
        </div>
      </div>

      {/* ── Tabla de Ventas ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <ShoppingCart size={18} className="text-indigo-500" />
          <h3 className="font-semibold text-slate-800">Ventas del Turno</h3>
          <span className="ml-auto text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
            {ventas.length} registros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Factura</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Hora</th>
                <th className="px-5 py-3">Forma Pago</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ventas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-400">
                    <ShoppingCart size={32} className="mx-auto mb-3 text-slate-200" />
                    <p className="text-sm">No hay ventas registradas en este turno.</p>
                  </td>
                </tr>
              ) : ventas.map(v => (
                <tr key={v.codVenta} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${v.estado === 'Anulada' ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{v.codVenta}</td>
                  <td className="px-5 py-3 text-slate-700">{v.nombreCliente || 'Consumidor Final'}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">
                    {v.fecha ? new Date(v.fecha).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-medium text-slate-500">{v.tipoCompra || 'Contado'}</span>
                  </td>
                  <td className={`px-5 py-3 text-right font-bold ${v.estado === 'Anulada' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {fmt(Number(v.total))}
                  </td>
                  <td className="px-5 py-3">
                    {v.estado === 'Anulada' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Anulada</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <CheckCircle2 size={11} /> Completada
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleReprintInvoice(v.codVenta)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Reimprimir factura"
                      >
                        <Printer size={15} />
                      </button>
                      {v.estado !== 'Anulada' && (
                        <>
                          {(v as any).codVendedor === user?.codUsuario && (
                            <>
                              <button
                                onClick={() => navigate('/pos', { state: { editSaleId: v.codVenta } })}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Editar venta"
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                onClick={() => handleAnularVenta(v.codVenta)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Anular venta"
                              >
                                <Ban size={15} />
                              </button>
                            </>
                          )}
                          {hasPermission('VER_ADMIN') && (v as any).codVendedor !== user?.codUsuario && (
                            <button
                              onClick={() => handleAnularVenta(v.codVenta)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Anular venta (admin)"
                            >
                              <Ban size={15} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {ventas.length > 0 && (
          <div className="flex justify-end items-center gap-6 px-5 py-3 bg-slate-50 rounded-b-2xl border-t border-slate-100 text-sm">
            <span className="text-slate-500">Total facturado del turno:</span>
            <span className="font-bold text-slate-800 text-base">{fmt(totalVentas)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CashRegister;
