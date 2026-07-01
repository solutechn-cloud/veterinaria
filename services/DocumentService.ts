
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

import { LabelTemplate } from '../types';
import { LabelService, SalesService, ConfigService } from './api';
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

    const ctx: PrintDataContext = {
      empresa,
      venta: { ...venta, detalles, numeroFactura: (venta as any).numeroFactura || venta.codVenta },
      cliente: {
        nombre:    (venta as any).nombreCliente    || '',
        identidad: (venta as any).identidadCliente || '',
        direccion: (venta as any).direccionCliente || '',
      },
    };

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

    const ctx: PrintDataContext = {
      empresa,
      venta: { ...venta, detalles, numeroFactura: (venta as any).numeroFactura || venta.codVenta },
      cliente: {
        nombre:    (venta as any).nombreCliente    || '',
        identidad: (venta as any).identidadCliente || '',
        direccion: (venta as any).direccionCliente || '',
      },
    };

    await downloadAsPDF(template, ctx, `Factura_${ventaId}`);
    return { success: true, message: '' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error al generar la factura.' };
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
