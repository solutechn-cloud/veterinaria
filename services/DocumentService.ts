
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

import { LabelTemplate, Reparacion } from '../types';
import { LabelService, SalesService, ConfigService, InventoryService } from './api';
import { printTemplate, PrintDataContext } from './TemplateRenderer';

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
      venta: { ...venta, detalles },
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
 * Print a repair order.
 * Accepts the Reparacion object directly (caller already has it loaded).
 *
 * @param reparacion - full Reparacion object from the Repairs page
 */
export async function printRepairOrder(reparacion: Reparacion): Promise<DocResult> {
  const { template, message } = await resolveTemplate(
    ['REPORT', 'INVOICE'],
    'DOCUMENT',
  );

  if (!template) return { success: false, message };

  try {
    const empresa = await getEmpresa();

    const ctx: PrintDataContext = {
      empresa,
      reparacion,
      cliente: {
        nombre:    reparacion.nombre_cliente    || '',
        identidad: reparacion.identidad_cliente || '',
      },
    };

    await printTemplate(template, ctx);
    return { success: true, message: 'Imprimiendo orden de reparación...' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error al generar la orden de reparación.' };
  }
}

/**
 * Print a product price label.
 * Accepts the product data directly (caller already has it loaded).
 *
 * @param producto  - telefono or inventario/accesorio object
 * @param tipo      - 'TELEFONO' | 'ACCESORIO'
 */
export async function printProductLabel(
  producto: Record<string, any>,
  tipo: 'TELEFONO' | 'ACCESORIO',
): Promise<DocResult> {
  const categories = tipo === 'TELEFONO'
    ? ['TELEPHONE', 'GENERAL']
    : ['ACCESSORY', 'GENERAL'];

  const { template, message } = await resolveTemplate(categories, 'LABEL');

  if (!template) return { success: false, message };

  try {
    const empresa = await getEmpresa();

    // Spread product fields to top level so {{marca}}, {{modelo}}, {{precioVenta}} etc. resolve
    const ctx: PrintDataContext = {
      empresa,
      producto: producto as any,
      ...producto,
    };

    await printTemplate(template, ctx);
    return { success: true, message: 'Imprimiendo etiqueta...' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error al generar la etiqueta.' };
  }
}

/**
 * Print multiple product labels in sequence (one print dialog per label).
 * For batch printing, prefer generating a multi-page HTML and printing once.
 */
export async function printMultipleLabels(
  productos: Array<{ data: Record<string, any>; tipo: 'TELEFONO' | 'ACCESORIO' }>,
): Promise<DocResult> {
  const categories = ['TELEPHONE', 'ACCESSORY', 'GENERAL'];
  const { template, message } = await resolveTemplate(categories, 'LABEL');

  if (!template) return { success: false, message };

  try {
    const empresa = await getEmpresa();
    // For now print them one by one; a future version can generate a multi-up sheet
    for (const item of productos) {
      const ctx: PrintDataContext = {
        empresa,
        producto: item.data as any,
        ...item.data,
      };
      await printTemplate(template, ctx);
    }
    return { success: true, message: `${productos.length} etiqueta(s) enviadas a imprimir.` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error al imprimir etiquetas.' };
  }
}
