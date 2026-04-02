
import { LabelTemplate, LabelElement, InvoiceColumn, SummaryRow } from '../types';

// ─── Shared column definitions ────────────────────────────────────────────────

const thermalCols: InvoiceColumn[] = [
  { id: 'c1', header: 'Descripción', field: '{{item.descripcion}}',  widthPct: 48, align: 'left',   format: 'TEXT'     },
  { id: 'c2', header: 'Cant',        field: '{{item.cantidad}}',     widthPct: 12, align: 'center', format: 'NUMBER'   },
  { id: 'c3', header: 'Precio',      field: '{{item.precioVenta}}',  widthPct: 20, align: 'right',  format: 'CURRENCY' },
  { id: 'c4', header: 'Total',       field: '{{item.total}}',        widthPct: 20, align: 'right',  format: 'CURRENCY' },
];

const a4Cols: InvoiceColumn[] = [
  { id: 'c1', header: 'Descripción',  field: '{{item.descripcion}}', widthPct: 45, align: 'left',   format: 'TEXT'     },
  { id: 'c2', header: 'Cantidad',     field: '{{item.cantidad}}',    widthPct: 10, align: 'center', format: 'NUMBER'   },
  { id: 'c3', header: 'P. Unitario',  field: '{{item.precioVenta}}', widthPct: 15, align: 'right',  format: 'CURRENCY' },
  { id: 'c4', header: 'ISV (15%)',    field: '{{item.isv}}',         widthPct: 10, align: 'right',  format: 'CURRENCY' },
  { id: 'c5', header: 'Total',        field: '{{item.total}}',       widthPct: 20, align: 'right',  format: 'CURRENCY' },
];

const invoiceSummaryRows: SummaryRow[] = [
  { id: 's1', label: 'Descuento:',  field: '{{venta.descuento}}', format: 'CURRENCY', bold: false },
  { id: 's2', label: 'ISV (15%):',  field: '{{venta.isv}}',       format: 'CURRENCY', bold: false },
  { id: 's3', label: 'TOTAL:',      field: '{{venta.total}}',     format: 'CURRENCY', bold: true, separator: true },
];

// ─── Helper to create an element with defaults ────────────────────────────────

function el(id: string, type: LabelElement['type'], x: number, y: number, w: number, h: number, extra: Partial<LabelElement> = {}): LabelElement {
  return {
    id, type, x, y, width: w, height: h,
    rotation: 0, content: '', opacity: 1,
    fontSize: 9, color: '#000000', textAlign: 'left', fontWeight: 'normal',
    fontFamily: 'helvetica', barcodeFormat: 'CODE128', displayValue: true,
    shapeType: 'RECTANGLE', isStretchWithOverflow: false,
    ...extra,
  };
}

// ─── STARTER TEMPLATES ────────────────────────────────────────────────────────

/** Factura Térmica 80mm — ideal for POS thermal printers */
export const FACTURA_TERMICA: Omit<LabelTemplate, 'id'> = {
  name:       'Factura Térmica 80mm',
  type:       'DOCUMENT',
  category:   'INVOICE',
  dataSource: 'SALES',
  isDefault:  false,
  width:      8,   // cm
  height:     23,  // cm (cuts dynamically when printed)
  snapEnabled: false,
  gridSize:   0.5,
  showGrid:   false,
  backgroundColor: '#ffffff',
  elements: [
    // Company header (geometric banner)
    el('st_ch', 'COMPANY_HEADER', 0, 0, 8, 2.8, {
      fontSize: 8, companyStyle: 'GEOMETRIC', companyDocTitle: 'FACTURA',
      companyShowRTN: true, companyShowPhone: true, companyShowEmail: false,
    }),
    // Invoice number + date
    el('st_t2', 'TEXT', 0.2, 3.0, 7.6, 0.55, { content: 'No.: {{venta.codVenta}}', fontSize: 9 }),
    el('st_t3', 'TEXT', 0.2, 3.6, 7.6, 0.55, { content: 'Fecha: {{venta.fecha}}', fontSize: 9 }),
    // CAI + range
    el('st_t4', 'TEXT', 0.2, 4.2, 7.6, 0.5, { content: 'CAI: {{empresa.cai}}', fontSize: 7, color: '#555555' }),
    el('st_t5', 'TEXT', 0.2, 4.75, 7.6, 0.5, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 7, color: '#555555' }),
    // Client section
    el('st_t6', 'TEXT', 0.2, 5.4, 7.6, 0.55, { content: 'Cliente: {{cliente.nombre}}', fontSize: 9, fontWeight: 'bold' }),
    el('st_t7', 'TEXT', 0.2, 6.0, 7.6, 0.5,  { content: 'RTN: {{cliente.identidad}}', fontSize: 8 }),
    // Divider
    el('st_l2', 'SHAPE', 0, 6.65, 8, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    // Invoice table
    el('st_tb', 'INVOICE_TABLE', 0, 6.8, 8, 8.5, {
      tableColumns: thermalCols, tableHeaderBg: '#1e3a8a', tableHeaderColor: '#ffffff',
      tableRowHeight: 0.75, tableAlternateRows: true, tableAlternateBg: '#f8fafc', tableFontSize: 8,
    }),
    // Divider
    el('st_l3', 'SHAPE', 0, 15.4, 8, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    // Summary box
    el('st_sb', 'SUMMARY_BOX', 3.5, 15.55, 4.5, 2.5, {
      summaryRows: invoiceSummaryRows, summaryFontSize: 9,
      summaryLabelColor: '#1e293b', summaryValueColor: '#1e293b',
    }),
    // Divider
    el('st_l4', 'SHAPE', 0, 18.15, 8, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    // Footer message
    el('st_ft', 'TEXT', 0.2, 18.3, 7.6, 1.5, {
      content: '{{empresa.mensajeFinal}}\nFecha límite emisión: {{empresa.fechaLimite}}',
      textAlign: 'center', fontSize: 7, color: '#555555', isMultiline: true,
    }),
  ],
};

/** Factura A4 — formal invoice for full-page printing (matches jsPDF static design) */
export const FACTURA_A4: Omit<LabelTemplate, 'id'> = {
  name:       'Factura A4',
  type:       'DOCUMENT',
  category:   'INVOICE',
  dataSource: 'SALES',
  isDefault:  false,
  width:      21,
  height:     29.7,
  snapEnabled: false,
  gridSize:   0.5,
  showGrid:   false,
  backgroundColor: '#ffffff',
  elements: [
    // ── GEOMETRIC HEADER (full-bleed, matches jsPDF static invoice) ──────────
    el('a4_ch', 'COMPANY_HEADER', 0, 0, 21, 4, {
      fontSize: 11, companyStyle: 'GEOMETRIC', companyDocTitle: 'FACTURA',
      companyShowRTN: true, companyShowPhone: true, companyShowEmail: true,
    }),

    // ── INVOICE META (left: labels | right: values) ───────────────────────────
    el('a4_m1', 'TEXT', 1,    4.4, 5.5, 0.6, { content: 'No. Factura:',     fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('a4_m2', 'TEXT', 6.5,  4.4, 7,   0.6, { content: '{{venta.codVenta}}', fontSize: 9 }),
    el('a4_m3', 'TEXT', 1,    5.1, 5.5, 0.6, { content: 'Fecha Emisión:',   fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('a4_m4', 'TEXT', 6.5,  5.1, 7,   0.6, { content: '{{venta.fecha}}',  fontSize: 9 }),
    el('a4_m5', 'TEXT', 14,   4.4, 3.5, 0.6, { content: 'Tipo Venta:',      fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('a4_m6', 'TEXT', 17.5, 4.4, 3.2, 0.6, { content: '{{venta.tipoCompra}}', fontSize: 9 }),
    el('a4_m7', 'TEXT', 1,    5.8, 2.5, 0.6, { content: 'CAI:',             fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('a4_m8', 'TEXT', 3.5,  5.8, 17,  0.6, { content: '{{empresa.cai}}',  fontSize: 9 }),
    el('a4_m9', 'TEXT', 1,    6.5, 5.5, 0.6, { content: 'Rango Aut.:',      fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('a4_ma', 'TEXT', 6.5,  6.5, 14,  0.6, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 9 }),

    // ── BLUE DIVIDER ─────────────────────────────────────────────────────────
    el('a4_ld', 'SHAPE', 1, 7.3, 19, 0.08, { shapeType: 'LINE', stroke: '#1e3a8a', strokeWidth: 2 }),

    // ── CLIENT BOX (matches jsPDF lightGray rounded rect) ────────────────────
    el('a4_cb', 'SHAPE', 1, 7.5, 11, 3.2, { shapeType: 'RECTANGLE', fill: '#f1f5f9', stroke: '#e2e8f0', strokeWidth: 1, borderRadius: 4 }),
    el('a4_cl', 'TEXT', 1.4, 7.65, 10, 0.55, { content: 'FACTURAR A:', fontSize: 8, fontWeight: 'bold', color: '#1e3a8a' }),
    el('a4_cn', 'TEXT', 1.4, 8.25, 10, 0.8,  { content: '{{cliente.nombre}}', fontSize: 13, fontWeight: 'bold', color: '#1e293b' }),
    el('a4_ci', 'TEXT', 1.4, 9.1,  10, 0.6,  { content: 'RTN/DNI: {{cliente.identidad}}', fontSize: 9, color: '#64748b' }),
    el('a4_ca', 'TEXT', 1.4, 9.7,  10, 0.6,  { content: '{{cliente.direccion}}', fontSize: 9, color: '#64748b' }),

    // ── FISCAL DATA (right column, beside client box) ─────────────────────────
    el('a4_fl', 'TEXT', 12.5, 7.65, 4.5, 0.6, { content: 'FECHA EMISIÓN:',    fontSize: 8, fontWeight: 'bold', color: '#64748b' }),
    el('a4_fv', 'TEXT', 17,   7.65, 3.7, 0.6, { content: '{{venta.fecha}}',   fontSize: 8 }),
    el('a4_rl', 'TEXT', 12.5, 8.35, 4.5, 0.6, { content: 'R.T.N. EMISOR:',   fontSize: 8, fontWeight: 'bold', color: '#64748b' }),
    el('a4_rv', 'TEXT', 17,   8.35, 3.7, 0.6, { content: '{{empresa.rtn}}',   fontSize: 8 }),
    el('a4_vl', 'TEXT', 12.5, 9.05, 4.5, 0.6, { content: 'VENDEDOR:',         fontSize: 8, fontWeight: 'bold', color: '#64748b' }),
    el('a4_vv', 'TEXT', 17,   9.05, 3.7, 0.6, { content: '{{venta.codVendedor}}', fontSize: 8 }),
    el('a4_el', 'TEXT', 12.5, 9.75, 4.5, 0.6, { content: 'F. VENCIMIENTO:',  fontSize: 8, fontWeight: 'bold', color: '#64748b' }),
    el('a4_ev', 'TEXT', 17,   9.75, 3.7, 0.6, { content: '{{empresa.fechaLimite}}', fontSize: 8 }),

    // ── PRODUCTS TABLE ────────────────────────────────────────────────────────
    el('a4_tb', 'INVOICE_TABLE', 1, 11.0, 19, 11, {
      tableColumns: a4Cols, tableHeaderBg: '#1e3a8a', tableHeaderColor: '#ffffff',
      tableRowHeight: 0.9, tableAlternateRows: true, tableAlternateBg: '#f8fafc', tableFontSize: 9,
    }),

    // ── TOTALS DIVIDER + SUMMARY BOX ─────────────────────────────────────────
    el('a4_ls', 'SHAPE', 1, 22.2, 19, 0.05, { shapeType: 'LINE', stroke: '#e2e8f0', strokeWidth: 1 }),
    el('a4_sb', 'SUMMARY_BOX', 13, 22.4, 7, 3.2, {
      summaryRows: invoiceSummaryRows, summaryFontSize: 10,
      summaryLabelColor: '#1e293b', summaryValueColor: '#1e3a8a', summaryBg: '#f8fafc',
    }),

    // ── FOOTER ───────────────────────────────────────────────────────────────
    el('a4_ls2', 'SHAPE', 1, 26.8, 19, 0.08, { shapeType: 'LINE', stroke: '#1e3a8a', strokeWidth: 2 }),
    el('a4_ft', 'TEXT', 1, 27.0, 19, 1.2, {
      content: '{{empresa.mensajeFinal}}\nFecha límite de emisión: {{empresa.fechaLimite}}',
      textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true,
    }),
  ],
};

/** Orden de Reparación — repair order for the service module */
export const ORDEN_REPARACION: Omit<LabelTemplate, 'id'> = {
  name:       'Orden de Reparación',
  type:       'DOCUMENT',
  category:   'REPORT',
  dataSource: 'NONE',
  isDefault:  false,
  width:      21,
  height:     29.7,
  snapEnabled: false,
  gridSize:   0.5,
  showGrid:   false,
  backgroundColor: '#ffffff',
  elements: [
    // ── GEOMETRIC HEADER ────────────────────────────────────────────────────
    el('rp_ch', 'COMPANY_HEADER', 0, 0, 21, 4, {
      fontSize: 10, companyStyle: 'GEOMETRIC', companyDocTitle: 'ORDEN DE REPARACIÓN',
      companyShowRTN: true, companyShowPhone: true, companyShowEmail: false,
    }),

    // ── ORDER META ───────────────────────────────────────────────────────────
    el('rp_i1', 'TEXT', 1,    4.4, 4.5, 0.6, { content: 'No. Orden:',         fontWeight: 'bold', fontSize: 9, color: '#64748b' }),
    el('rp_i2', 'TEXT', 5.5,  4.4, 5,   0.6, { content: '{{reparacion.id_reparacion}}', fontSize: 9 }),
    el('rp_i3', 'TEXT', 11,   4.4, 4.5, 0.6, { content: 'Fecha Ingreso:',     fontWeight: 'bold', fontSize: 9, color: '#64748b' }),
    el('rp_i4', 'TEXT', 15.5, 4.4, 5,   0.6, { content: '{{reparacion.fecha_ingreso}}', fontSize: 9 }),
    el('rp_i5', 'TEXT', 1,    5.1, 4.5, 0.6, { content: 'Entrega Estim.:',    fontWeight: 'bold', fontSize: 9, color: '#64748b' }),
    el('rp_i6', 'TEXT', 5.5,  5.1, 5,   0.6, { content: '{{reparacion.fecha_entrega_estimada}}', fontSize: 9 }),

    // ── BLUE DIVIDER ─────────────────────────────────────────────────────────
    el('rp_ld', 'SHAPE', 1, 5.9, 19, 0.08, { shapeType: 'LINE', stroke: '#1e3a8a', strokeWidth: 2 }),

    // ── CLIENT SECTION ───────────────────────────────────────────────────────
    el('rp_cb', 'SHAPE', 1, 6.1, 19, 2.5, { shapeType: 'RECTANGLE', fill: '#f1f5f9', stroke: '#e2e8f0', strokeWidth: 1, borderRadius: 4 }),
    el('rp_cl', 'TEXT', 1.4, 6.25, 18, 0.5,  { content: 'DATOS DEL CLIENTE', fontSize: 8, fontWeight: 'bold', color: '#1e3a8a' }),
    el('rp_cn', 'TEXT', 1.4, 6.8,  18, 0.75, { content: '{{reparacion.nombre_cliente}}', fontSize: 12, fontWeight: 'bold' }),
    el('rp_ci', 'TEXT', 1.4, 7.6,  18, 0.6,  { content: 'Identidad: {{reparacion.identidad_cliente}}', fontSize: 9, color: '#64748b' }),

    // ── DEVICE SECTION ───────────────────────────────────────────────────────
    el('rp_db', 'SHAPE', 1, 8.8, 19, 2.5, { shapeType: 'RECTANGLE', fill: '#f1f5f9', stroke: '#e2e8f0', strokeWidth: 1, borderRadius: 4 }),
    el('rp_dl', 'TEXT', 1.4, 8.95, 18, 0.5,  { content: 'DATOS DEL EQUIPO', fontSize: 8, fontWeight: 'bold', color: '#1e3a8a' }),
    el('rp_dm', 'TEXT', 1.4, 9.5,  9,  0.6,  { content: 'Marca/Modelo: {{reparacion.marca}} {{reparacion.modelo}}', fontSize: 9 }),
    el('rp_di', 'TEXT', 11,  9.5,  9,  0.6,  { content: 'IMEI: {{reparacion.imei_equipo}}', fontSize: 9 }),
    el('rp_dc', 'TEXT', 1.4, 10.1, 18, 0.6,  { content: 'Complementos: {{reparacion.complementos}}', fontSize: 9, color: '#64748b' }),

    // ── FAULT DESCRIPTION ────────────────────────────────────────────────────
    el('rp_fl', 'TEXT', 1, 11.5, 19, 0.55, { content: 'DESCRIPCIÓN DE FALLA:', fontSize: 9, fontWeight: 'bold', color: '#64748b' }),
    el('rp_fb', 'SHAPE', 1, 12.1, 19, 2.8, { shapeType: 'RECTANGLE', fill: '#fffbeb', stroke: '#fcd34d', strokeWidth: 1, borderRadius: 4 }),
    el('rp_fd', 'TEXT', 1.3, 12.2, 18.4, 2.6, { content: '{{reparacion.descripcion_falla}}', fontSize: 9, isMultiline: true }),

    // ── TECHNICIAN + PRICE ───────────────────────────────────────────────────
    el('rp_tl', 'TEXT', 1,  15.2, 4.5, 0.55, { content: 'Técnico:',       fontWeight: 'bold', fontSize: 9, color: '#64748b' }),
    el('rp_tn', 'TEXT', 5.5, 15.2, 8,  0.55, { content: '{{reparacion.nombre_tecnico}}', fontSize: 9 }),
    el('rp_pl', 'TEXT', 1,  15.9, 4.5, 0.55, { content: 'Total Estimado:', fontWeight: 'bold', fontSize: 9, color: '#64748b' }),
    el('rp_pv', 'TEXT', 5.5, 15.9, 4,  0.55, { content: 'L. {{reparacion.precio_cliente}}', fontSize: 10, fontWeight: 'bold', color: '#1e3a8a' }),

    // ── TERMS ────────────────────────────────────────────────────────────────
    el('rp_tc', 'TEXT', 1, 17.2, 19, 2, {
      content: 'TÉRMINOS Y CONDICIONES: El equipo será retenido por 30 días una vez finalizada la reparación. Pasado este tiempo la empresa no se hace responsable. Los precios pueden variar según diagnóstico técnico.',
      fontSize: 7, color: '#94a3b8', isMultiline: true,
    }),

    // ── SIGNATURES ───────────────────────────────────────────────────────────
    el('rp_sl1', 'SHAPE', 1,    23,   8.5, 0.05, { shapeType: 'LINE', stroke: '#1e3a8a', strokeWidth: 1 }),
    el('rp_st1', 'TEXT',  1,    23.3, 8.5, 0.6,  { content: 'Firma Técnico', textAlign: 'center', fontSize: 8, color: '#555' }),
    el('rp_sl2', 'SHAPE', 11.5, 23,   8.5, 0.05, { shapeType: 'LINE', stroke: '#1e3a8a', strokeWidth: 1 }),
    el('rp_st2', 'TEXT',  11.5, 23.3, 8.5, 0.6,  { content: 'Firma Cliente', textAlign: 'center', fontSize: 8, color: '#555' }),
  ],
};

/** Etiqueta de Precio — for phone/accessory price tags */
export const ETIQUETA_PRECIO: Omit<LabelTemplate, 'id'> = {
  name:       'Etiqueta de Precio',
  type:       'LABEL',
  category:   'TELEPHONE',
  dataSource: 'TELEPHONES',
  isDefault:  false,
  width:      50,  // mm
  height:     25,  // mm
  snapEnabled: true,
  gridSize:   2,
  showGrid:   false,
  backgroundColor: '#ffffff',
  elements: [
    // Product name
    el('ep_n', 'TEXT', 2, 1, 46, 7, { content: '{{marca}} {{modelo}}', fontWeight: 'bold', fontSize: 8, textAlign: 'center' }),
    // Price - large
    el('ep_p', 'TEXT', 2, 8, 46, 8, { content: 'L. {{precioVenta}}', fontWeight: 'bold', fontSize: 14, textAlign: 'center', color: '#1e293b' }),
    // Barcode
    el('ep_b', 'BARCODE', 3, 16, 44, 7, { content: '{{codigo}}', barcodeFormat: 'CODE128', displayValue: true, fontSize: 6 }),
  ],
};

/** Etiqueta IMEI — for phones with IMEI traceability */
export const ETIQUETA_IMEI: Omit<LabelTemplate, 'id'> = {
  name:       'Etiqueta IMEI',
  type:       'LABEL',
  category:   'TELEPHONE',
  dataSource: 'TELEPHONES',
  isDefault:  false,
  width:      60,
  height:     30,
  snapEnabled: true,
  gridSize:   2,
  showGrid:   false,
  backgroundColor: '#ffffff',
  elements: [
    el('ei_n', 'TEXT',    2,  1,  56, 6,  { content: '{{marca}} {{modelo}}', fontWeight: 'bold', fontSize: 9, textAlign: 'center' }),
    el('ei_p', 'TEXT',    2,  7,  56, 5,  { content: 'L. {{precioVenta}}', fontWeight: 'bold', fontSize: 12, textAlign: 'center', color: '#1e293b' }),
    el('ei_i', 'TEXT',    2,  12, 56, 4,  { content: 'IMEI: {{imei1}}', fontSize: 6, textAlign: 'center', color: '#555' }),
    el('ei_b', 'BARCODE', 3,  16, 35, 10, { content: '{{imei1}}', barcodeFormat: 'CODE128', displayValue: false }),
    el('ei_q', 'QR',      40, 16, 18, 12, { content: '{{imei1}}' }),
  ],
};

// ─── Catalog for the UI ───────────────────────────────────────────────────────

export interface StarterTemplateEntry {
  id: string;
  name: string;
  description: string;
  icon: string;       // emoji
  type: 'LABEL' | 'DOCUMENT';
  category: string;
  template: Omit<LabelTemplate, 'id'>;
}

export const STARTER_TEMPLATES: StarterTemplateEntry[] = [
  {
    id: 'factura_termica',
    name: 'Factura Térmica 80mm',
    description: 'Ticket para impresora térmica. Incluye datos de empresa, tabla de ítems y totales.',
    icon: '🧾',
    type: 'DOCUMENT',
    category: 'INVOICE',
    template: FACTURA_TERMICA,
  },
  {
    id: 'factura_a4',
    name: 'Factura A4',
    description: 'Factura formal tamaño carta/A4 con todos los campos fiscales requeridos.',
    icon: '📄',
    type: 'DOCUMENT',
    category: 'INVOICE',
    template: FACTURA_A4,
  },
  {
    id: 'orden_reparacion',
    name: 'Orden de Reparación',
    description: 'Formulario para ordenes de servicio técnico con datos del equipo y firmas.',
    icon: '🔧',
    type: 'DOCUMENT',
    category: 'REPORT',
    template: ORDEN_REPARACION,
  },
  {
    id: 'etiqueta_precio',
    name: 'Etiqueta de Precio',
    description: 'Etiqueta compacta 50x25mm con nombre, precio y código de barras.',
    icon: '🏷️',
    type: 'LABEL',
    category: 'TELEPHONE',
    template: ETIQUETA_PRECIO,
  },
  {
    id: 'etiqueta_imei',
    name: 'Etiqueta IMEI',
    description: 'Etiqueta 60x30mm con IMEI en código de barras y QR para trazabilidad.',
    icon: '📱',
    type: 'LABEL',
    category: 'TELEPHONE',
    template: ETIQUETA_IMEI,
  },
];
