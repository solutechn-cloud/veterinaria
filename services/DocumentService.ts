
/**
 * DocumentService — Bridge between the ERP modules and the Label/Document Designer.
 *
 * Provides high-level print functions that:
 *   1. Find the right template for a given use case (default or best-match)
 *   2. Fetch the necessary data from the API
 *   3. Build the render context
 *   4. Trigger the print dialog via TemplateRenderer
 *
 * IMPORTANT: This service does NOT modify any existing static invoice generation.
 * It is an independent, additive service. The POS / Repairs modules will be
 * connected to this service in a future sprint.
 */

import { LabelTemplate, DetalleVenta, Venta } from '../types';
import { LabelService, SalesService, ConfigService, QuoteService } from './api';
import { printTemplate, downloadAsPDF, PrintDataContext } from './TemplateRenderer';

// ─── Empresa config cache (one fetch per session) ─────────────────────────────

let _empresaCache: any = null;

async function getEmpresa(): Promise<any> {
  if (!_empresaCache) {
    try { _empresaCache = await ConfigService.get(); } catch { _empresaCache = {}; }
  }
  return _empresaCache;
}

/** Clear the empresa cache (call when config changes) */
export function clearEmpresaCache(): void {
  _empresaCache = null;
}

type PrintableDocumentType = 'factura_fiscal' | 'factura_no_fiscal' | 'cotizacion';

function documentLabels(tipoDocumento: PrintableDocumentType) {
  if (tipoDocumento === 'cotizacion') {
    return { titulo: 'COTIZACION', tituloCorto: 'Cotizacion', esFiscal: false, esCotizacion: true };
  }
  if (tipoDocumento === 'factura_no_fiscal') {
    // Conserva el título "FACTURA" (sin la leyenda "no fiscal"); esFiscal:false
    // solo sirve para ocultar los datos SAR en la impresión.
    return { titulo: 'FACTURA', tituloCorto: 'Factura', esFiscal: false, esCotizacion: false };
  }
  return { titulo: 'FACTURA', tituloCorto: 'Factura', esFiscal: true, esCotizacion: false };
}

function buildCommercialDocumentContext(
  empresa: any,
  venta: Partial<Venta> & Record<string, any>,
  detalles: Partial<DetalleVenta>[],
  tipoDocumento: PrintableDocumentType,
): PrintDataContext {
  const labels = documentLabels(tipoDocumento);
  const numero = venta.numeroFactura || venta.numeroDocumento || venta.codVenta || venta.codigo || '';
  // El CAI usado para numerar esta venta queda guardado en la propia venta
  // (ver generateFacturaCorrelativo / INSERT INTO ventas en salesRoutes.js).
  // Se prioriza ese snapshot sobre el CAI "actual" de Configuración, que
  // puede haber rotado desde que se emitió esta factura. Ventas emitidas
  // antes de que existiera el snapshot (sin venta.cai) caen al valor de
  // empresa como antes.
  const empresaImpresion = labels.esFiscal
    ? {
        ...empresa,
        cai: venta.cai || empresa.cai,
        rangoInicial: venta.rangoInicial || empresa.rangoInicial,
        rangoFinal: venta.rangoFinal || empresa.rangoFinal,
        fechaLimite: venta.fechaLimite || empresa.fechaLimite,
      }
    : { ...empresa, cai: '', rangoInicial: '', rangoFinal: '', fechaLimite: '' };

  return {
    empresa: empresaImpresion,
    documento: {
      tipoDocumento,
      titulo: labels.titulo,
      tituloCorto: labels.tituloCorto,
      esFiscal: labels.esFiscal,
      esCotizacion: labels.esCotizacion,
      numero,
    },
    venta: {
      ...venta,
      detalles,
      tipoDocumento,
      documentoFiscal: labels.esFiscal,
      numeroFactura: numero,
      numeroDocumento: numero,
    },
    cliente: {
      nombre:    venta.nombreCliente    || '',
      identidad: venta.identidadCliente || '',
      direccion: venta.direccionCliente || '',
    },
  };
}

// ─── Template Resolution ──────────────────────────────────────────────────────

interface TemplateMatch {
  template: LabelTemplate | null;
  message: string;
}

/**
 * Find the best template for the given categories and type.
 * Priority: 1) isDefault in category, 2) any in category, 3) fallback message.
 */
async function resolveTemplate(
  categories: string[],
  docType?: 'LABEL' | 'DOCUMENT',
  dataSource?: string,
): Promise<TemplateMatch> {
  let all: LabelTemplate[] = [];
  try {
    all = await LabelService.getAll();
  } catch {
    return { template: null, message: 'No se pudo cargar la lista de plantillas.' };
  }

  // Filter by type if specified
  let pool = docType ? all.filter(t => t.type === docType) : all;

  // Try dataSource match first (most specific)
  if (dataSource) {
    const bySource = pool.filter(t => t.dataSource === dataSource);
    const defaultBySource = bySource.find(t => t.isDefault);
    if (defaultBySource) return { template: defaultBySource, message: '' };
    if (bySource.length) return { template: bySource[0], message: '' };
  }

  // Try each category in order
  for (const cat of categories) {
    const byCat = pool.filter(t => t.category === cat);
    const defaultByCat = byCat.find(t => t.isDefault);
    if (defaultByCat) return { template: defaultByCat, message: '' };
    if (byCat.length) return { template: byCat[0], message: '' };
  }

  // Fallback: any template of the right type
  if (pool.length) return { template: pool[0], message: '' };

  const catList = categories.join(' / ');
  return {
    template: null,
    message: `No se encontró ninguna plantilla para "${catList}". Crea una plantilla de este tipo en el Diseñador y márcala como predeterminada.`,
  };
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface DocResult {
  success: boolean;
  message: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Print a sale invoice.
 * Fetches venta + detalles + empresa, then renders the default INVOICE template.
 *
 * @param ventaId - codVenta from the Venta object
 */
export async function printSaleInvoice(ventaId: string): Promise<DocResult> {
  const { template, message } = await resolveTemplate(
    ['INVOICE'],
    'DOCUMENT',
    'SALES',
  );

  if (!template) return { success: false, message };

  try {
    const [empresa, venta, detalles] = await Promise.all([
      getEmpresa(),
      SalesService.getVenta(ventaId),
      SalesService.getDetallesVenta(ventaId),
    ]);

    const ctx = buildCommercialDocumentContext(
      empresa,
      venta as any,
      detalles,
      ((venta as any).tipoDocumento || 'factura_fiscal') as PrintableDocumentType,
    );

    await printTemplate(template, ctx);
    return { success: true, message: 'Imprimiendo factura...' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error al generar la factura.' };
  }
}

/**
 * Download a sale invoice as PDF using the designer template.
 * Falls back with an error message if no INVOICE template is configured.
 *
 * @param ventaId - codVenta from the Venta object
 */
export async function downloadSaleInvoicePDF(ventaId: string): Promise<DocResult> {
  const { template, message } = await resolveTemplate(['INVOICE'], 'DOCUMENT', 'SALES');
  if (!template) return { success: false, message };

  try {
    const [empresa, venta, detalles] = await Promise.all([
      getEmpresa(),
      SalesService.getVenta(ventaId),
      SalesService.getDetallesVenta(ventaId),
    ]);

    const ctx = buildCommercialDocumentContext(
      empresa,
      venta as any,
      detalles,
      ((venta as any).tipoDocumento || 'factura_fiscal') as PrintableDocumentType,
    );

    const prefix = (ctx.documento?.esFiscal === false) ? String(ctx.documento.tituloCorto).replace(/\s+/g, '_') : 'Factura';
    await downloadAsPDF(template, ctx, `${prefix}_${ventaId}`);
    return { success: true, message: '' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error al generar la factura.' };
  }
}

export async function printQuote(codigo: string): Promise<DocResult> {
  const { template, message } = await resolveTemplate(['INVOICE'], 'DOCUMENT', 'SALES');
  if (!template) return { success: false, message };

  try {
    const [empresa, cotizacion, detalles] = await Promise.all([
      getEmpresa(),
      QuoteService.get(codigo),
      QuoteService.getDetalles(codigo),
    ]);

    const ctx = buildCommercialDocumentContext(empresa, cotizacion as any, detalles, 'cotizacion');
    await printTemplate(template, ctx);
    return { success: true, message: 'Imprimiendo cotizacion...' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error al generar la cotizacion.' };
  }
}

export async function downloadQuotePDF(codigo: string): Promise<DocResult> {
  const { template, message } = await resolveTemplate(['INVOICE'], 'DOCUMENT', 'SALES');
  if (!template) return { success: false, message };

  try {
    const [empresa, cotizacion, detalles] = await Promise.all([
      getEmpresa(),
      QuoteService.get(codigo),
      QuoteService.getDetalles(codigo),
    ]);

    const ctx = buildCommercialDocumentContext(empresa, cotizacion as any, detalles, 'cotizacion');
    await downloadAsPDF(template, ctx, `Cotizacion_${codigo}`);
    return { success: true, message: '' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error al generar la cotizacion.' };
  }
}

/**
 * Print a medication label using the label designer template.
 */
export async function printMedicamentoLabel(medicamento: Record<string, any>): Promise<DocResult> {
  const { template, message } = await resolveTemplate(['MEDICAMENTO', 'GENERAL'], 'LABEL', 'MEDICAMENTOS');
  if (!template) return { success: false, message };

  try {
    const empresa = await getEmpresa();
    const ctx: PrintDataContext = {
      empresa,
      medicamento,
      ...medicamento,
    };
    await printTemplate(template, ctx);
    return { success: true, message: 'Imprimiendo etiqueta...' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error al generar la etiqueta.' };
  }
}
