import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { SalesService, QuoteService } from '../services/api';
import { printSaleInvoice, downloadSaleInvoicePDF, printQuote, downloadQuotePDF } from '../services/DocumentService';
import { VentaResumen, CotizacionResumen, CotizacionEstado } from '../types';
import { FileText, ReceiptText, Printer, Download, RefreshCw, Search, ArrowRightLeft, Repeat } from 'lucide-react';
import Swal from 'sweetalert2';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const money = (n: number) => `L ${Number(n || 0).toFixed(2)}`;
const fmtFecha = (f: string) => { try { return new Date(f).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' }); } catch { return f; } };

const DOC_LABEL: Record<string, string> = { factura_fiscal: 'Fiscal', factura_no_fiscal: 'No fiscal', cotizacion: 'Cotización' };
const ESTADO_COT: Record<CotizacionEstado, string> = {
  Emitida: 'bg-slate-100 text-slate-600',
  Aceptada: 'bg-emerald-100 text-emerald-700',
  Vencida: 'bg-amber-100 text-amber-700',
  Convertida: 'bg-indigo-100 text-indigo-700',
};

const Historial: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'facturas' | 'cotizaciones'>('facturas');
  const hoy = new Date();
  const hace7 = new Date(Date.now() - 6 * 86400000);
  const [desde, setDesde] = useState(ymd(hace7));
  const [hasta, setHasta] = useState(ymd(hoy));
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [ventas, setVentas] = useState<VentaResumen[]>([]);
  const [cotizaciones, setCotizaciones] = useState<CotizacionResumen[]>([]);

  const buscar = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'facturas') setVentas(await SalesService.buscar(desde, hasta, q.trim() || undefined));
      else setCotizaciones(await QuoteService.list(desde, hasta, undefined, q.trim() || undefined));
    } catch (e: any) {
      Swal.fire('Error', e?.message || 'No se pudo cargar el historial', 'error');
    } finally { setLoading(false); }
  }, [tab, desde, hasta, q]);

  useEffect(() => { buscar(); /* eslint-disable-next-line */ }, [tab]);

  const runDoc = async (key: string, fn: () => Promise<{ success: boolean; message: string }>) => {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.success) Swal.fire('Aviso', r.message, 'warning');
    } catch (e: any) {
      Swal.fire('Error', e?.message || 'No se pudo generar el documento', 'error');
    } finally { setBusy(null); }
  };

  const cambiarEstado = async (cot: CotizacionResumen) => {
    const { value } = await Swal.fire<CotizacionEstado>({
      title: `Estado de ${cot.codigo}`,
      input: 'select',
      inputOptions: { Emitida: 'Emitida', Aceptada: 'Aceptada', Vencida: 'Vencida' },
      inputValue: cot.estado === 'Convertida' ? 'Aceptada' : cot.estado,
      showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar',
    });
    if (!value) return;
    try {
      await QuoteService.updateEstado(cot.codigo, value);
      await buscar();
    } catch (e: any) { Swal.fire('Error', e?.message || 'No se pudo actualizar', 'error'); }
  };

  const convertir = (cot: CotizacionResumen) => {
    navigate(`/pos?cotizacion=${encodeURIComponent(cot.codigo)}`);
  };

  const inp = 'px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Historial de Documentos</h1>
        <p className="text-sm text-slate-500">Consulta y reimprime facturas y cotizaciones por fecha.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 rounded-xl bg-slate-100 p-1 w-fit">
        {([['facturas', 'Facturas', <ReceiptText size={15} key="f" />], ['cotizaciones', 'Cotizaciones', <FileText size={15} key="c" />]] as const).map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Desde</label>
          <input type="date" className={inp} value={desde} onChange={e => setDesde(e.target.value)} /></div>
        <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Hasta</label>
          <input type="date" className={inp} value={hasta} onChange={e => setHasta(e.target.value)} /></div>
        <div className="flex-1 min-w-[180px]"><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Buscar</label>
          <input className={`${inp} w-full`} placeholder="N° documento o cliente" value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} /></div>
        <button onClick={buscar} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />} Buscar
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">Documento</th>
                <th className="px-4 py-2.5 text-left">Fecha</th>
                <th className="px-4 py-2.5 text-left">Cliente</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-left">Estado</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tab === 'facturas' && ventas.map(v => (
                <tr key={v.codVenta} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-slate-700">{v.numeroDocumento || v.codVenta}</span>
                    <span className="ml-2 text-[10px] font-bold text-indigo-500">{DOC_LABEL[v.tipoDocumento || 'factura_fiscal']}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtFecha(v.fecha)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{v.nombreCliente}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{money(v.total)}</td>
                  <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full ${v.estado === 'Anulada' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>{v.estado}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => runDoc(`p-${v.codVenta}`, () => printSaleInvoice(v.codVenta))} disabled={busy === `p-${v.codVenta}`}
                        className="p-1.5 text-slate-400 hover:text-indigo-600" title="Imprimir"><Printer size={16} /></button>
                      <button onClick={() => runDoc(`d-${v.codVenta}`, () => downloadSaleInvoicePDF(v.codVenta))} disabled={busy === `d-${v.codVenta}`}
                        className="p-1.5 text-slate-400 hover:text-sky-600" title="Descargar PDF"><Download size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {tab === 'cotizaciones' && cotizaciones.map(c => (
                <tr key={c.codigo} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-slate-700">{c.codigo}</span>
                    {c.ventaCodigo && <span className="ml-2 text-[10px] text-slate-400">→ {c.ventaCodigo}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtFecha(c.fecha)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{c.nombreCliente}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{money(c.total)}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => cambiarEstado(c)} disabled={c.estado === 'Convertida'}
                      className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_COT[c.estado]} ${c.estado === 'Convertida' ? 'cursor-default' : 'hover:ring-1 hover:ring-slate-300'}`}
                      title={c.estado === 'Convertida' ? 'Ya convertida' : 'Cambiar estado'}>
                      {c.estado}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {c.estado !== 'Convertida' && (
                        <button onClick={() => convertir(c)} className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Cargar en el POS y cobrar">
                          <ArrowRightLeft size={14} /> Convertir
                        </button>
                      )}
                      <button onClick={() => runDoc(`p-${c.codigo}`, () => printQuote(c.codigo))} disabled={busy === `p-${c.codigo}`}
                        className="p-1.5 text-slate-400 hover:text-indigo-600" title="Imprimir"><Printer size={16} /></button>
                      <button onClick={() => runDoc(`d-${c.codigo}`, () => downloadQuotePDF(c.codigo))} disabled={busy === `d-${c.codigo}`}
                        className="p-1.5 text-slate-400 hover:text-sky-600" title="Descargar PDF"><Download size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && ((tab === 'facturas' && ventas.length === 0) || (tab === 'cotizaciones' && cotizaciones.length === 0)) && (
          <div className="px-4 py-10 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
            <Repeat size={22} className="text-slate-300" />
            No hay {tab === 'facturas' ? 'facturas' : 'cotizaciones'} en el rango seleccionado.
          </div>
        )}
      </div>
    </div>
  );
};

export default Historial;
