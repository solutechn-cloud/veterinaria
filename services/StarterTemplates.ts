
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
    // Company header — decomposed: background + triangle + company info + title
    el('st_hbg',   'SHAPE',          0,   0,   8,   2.8, { shapeType: 'RECTANGLE',   fill: '#1e3a8a', stroke: 'transparent', strokeWidth: 0 }),
    el('st_htri',  'SHAPE',          0,   0,   3.5, 2.8, { shapeType: 'TRIANGLE_TL', fill: '#3b82f6', stroke: 'transparent', strokeWidth: 0 }),
    el('st_ch',    'COMPANY_HEADER', 3.3, 0,   4.7, 2.8, { fontSize: 8, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('st_title', 'TEXT',           0.2, 1.0, 2.8, 1.0, { content: 'FACTURA', fontSize: 13, fontWeight: '900', color: '#ffffff', textAlign: 'left', letterSpacing: 2 }),
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
    // ── HEADER — decomposed: background + triangle + company info + title ────
    el('a4_hbg',   'SHAPE',          0,    0,   21,  4,   { shapeType: 'RECTANGLE',   fill: '#1e3a8a', stroke: 'transparent', strokeWidth: 0 }),
    el('a4_htri',  'SHAPE',          0,    0,   9,   4,   { shapeType: 'TRIANGLE_TL', fill: '#3b82f6', stroke: 'transparent', strokeWidth: 0 }),
    el('a4_ch',    'COMPANY_HEADER', 8.5,  0,   12,  4,   { fontSize: 11, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: true }),
    el('a4_title', 'TEXT',           14.5, 0.8,  6,  2.4, { content: 'FACTURA', fontSize: 26, fontWeight: '900', color: '#ffffff', textAlign: 'right', letterSpacing: 4, fontFamily: "'Montserrat', sans-serif" }),

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
    // ── HEADER — decomposed: background + triangle + company info + title ────
    el('or_hbg',   'SHAPE',          0,    0,   21,  4,   { shapeType: 'RECTANGLE',   fill: '#1e3a8a', stroke: 'transparent', strokeWidth: 0 }),
    el('or_htri',  'SHAPE',          0,    0,   7,   4,   { shapeType: 'TRIANGLE_TL', fill: '#3b82f6', stroke: 'transparent', strokeWidth: 0 }),
    el('or_ch',    'COMPANY_HEADER', 6.5,  0,   14,  4,   { fontSize: 10, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('or_title', 'TEXT',           11.5, 0.8,  9,  2.4, { content: 'ORDEN DE\nREPARACIÓN', fontSize: 18, fontWeight: '900', color: '#ffffff', textAlign: 'right', letterSpacing: 2, fontFamily: "'Montserrat', sans-serif", isMultiline: true }),

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

// ─── New Invoice Templates ────────────────────────────────────────────────────

/** Minimalista Índigo — clean white with indigo accents */
export const FACTURA_MINIMALISTA: Omit<LabelTemplate, 'id'> = {
  name: 'Minimalista Índigo', type: 'DOCUMENT', category: 'INVOICE', dataSource: 'SALES',
  isDefault: false, width: 21, height: 29.7, snapEnabled: false, gridSize: 0.5, showGrid: false, backgroundColor: '#ffffff',
  elements: [
    // Thin top accent bar
    el('mi_bar',   'SHAPE',          0,    0,   21,  0.5,  { shapeType: 'RECTANGLE', fill: '#4f46e5', stroke: 'transparent', strokeWidth: 0 }),
    // Company info + title row
    el('mi_ch',    'COMPANY_HEADER', 1,    0.8, 12,  2.8,  { fontSize: 10, color: '#1e293b', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('mi_title', 'TEXT',           14,   0.8, 6.5, 1.5,  { content: 'FACTURA', fontSize: 28, fontWeight: '900', color: '#4f46e5', textAlign: 'right', letterSpacing: 3, fontFamily: "'Poppins', sans-serif" }),
    el('mi_sub',   'TEXT',           14,   2.4, 6.5, 0.7,  { content: '{{venta.codVenta}}', fontSize: 10, color: '#94a3b8', textAlign: 'right' }),
    // Thin indigo divider
    el('mi_div1',  'SHAPE',          1,    3.9, 19,  0.06, { shapeType: 'LINE', stroke: '#4f46e5', strokeWidth: 1.5 }),
    // Meta
    el('mi_m1',    'TEXT',           1,    4.2, 5,   0.55, { content: 'Fecha:',         fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('mi_m2',    'TEXT',           6,    4.2, 7,   0.55, { content: '{{venta.fecha}}', fontSize: 9 }),
    el('mi_m3',    'TEXT',           13,   4.2, 4,   0.55, { content: 'CAI:', fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('mi_m4',    'TEXT',           17,   4.2, 3.7, 0.55, { content: '{{empresa.cai}}', fontSize: 8 }),
    el('mi_m5',    'TEXT',           1,    4.9, 5,   0.55, { content: 'Rango:', fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('mi_m6',    'TEXT',           6,    4.9, 14,  0.55, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 8 }),
    // Client
    el('mi_cl',    'TEXT',           1,    5.8, 19,  0.5,  { content: 'FACTURAR A', fontSize: 8, fontWeight: 'bold', color: '#4f46e5' }),
    el('mi_cn',    'TEXT',           1,    6.3, 19,  0.75, { content: '{{cliente.nombre}}', fontSize: 13, fontWeight: 'bold', color: '#1e293b' }),
    el('mi_ci',    'TEXT',           1,    7.1, 10,  0.55, { content: 'RTN: {{cliente.identidad}}', fontSize: 9, color: '#64748b' }),
    el('mi_ca',    'TEXT',           1,    7.7, 10,  0.55, { content: '{{cliente.direccion}}', fontSize: 9, color: '#64748b' }),
    // Table
    el('mi_tb',    'INVOICE_TABLE',  1,    8.6, 19,  12,   { tableColumns: a4Cols, tableHeaderBg: '#4f46e5', tableHeaderColor: '#ffffff', tableRowHeight: 0.9, tableAlternateRows: true, tableAlternateBg: '#eef2ff', tableFontSize: 9 }),
    // Summary
    el('mi_sb',    'SUMMARY_BOX',    13,   22,  7,   3,    { summaryRows: invoiceSummaryRows, summaryFontSize: 10, summaryLabelColor: '#1e293b', summaryValueColor: '#4f46e5', summaryBg: '#f8faff' }),
    // Footer
    el('mi_div2',  'SHAPE',          1,    26.5, 19, 0.06, { shapeType: 'LINE', stroke: '#4f46e5', strokeWidth: 1 }),
    el('mi_ft',    'TEXT',           1,    26.7, 19, 1,    { content: '{{empresa.mensajeFinal}} · Límite: {{empresa.fechaLimite}}', textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true }),
  ],
};

/** Noche Corporativa — dark professional with gold accents */
export const FACTURA_NOCHE: Omit<LabelTemplate, 'id'> = {
  name: 'Noche Corporativa', type: 'DOCUMENT', category: 'INVOICE', dataSource: 'SALES',
  isDefault: false, width: 21, height: 29.7, snapEnabled: false, gridSize: 0.5, showGrid: false, backgroundColor: '#ffffff',
  elements: [
    // Dark header
    el('nc_hbg',   'SHAPE',          0,    0,   21,  5,   { shapeType: 'RECTANGLE',   fill: '#0f172a', stroke: 'transparent', strokeWidth: 0 }),
    el('nc_htri',  'SHAPE',          13,   0,   8,   5,   { shapeType: 'TRIANGLE_BR', fill: '#f59e0b', stroke: 'transparent', strokeWidth: 0 }),
    el('nc_ch',    'COMPANY_HEADER', 1,    0.5, 11,  4,   { fontSize: 10, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('nc_title', 'TEXT',           1,    1.2, 19,  1.5, { content: 'FACTURA', fontSize: 32, fontWeight: '900', color: '#f59e0b', textAlign: 'right', letterSpacing: 5, fontFamily: "'Oswald', sans-serif" }),
    el('nc_num',   'TEXT',           1,    2.9, 19,  0.7, { content: '{{venta.codVenta}}', fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'right' }),
    // Meta row on white
    el('nc_m1',    'TEXT',           1,    5.5, 4.5, 0.55, { content: 'Fecha:',      fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('nc_m2',    'TEXT',           5.5,  5.5, 6,   0.55, { content: '{{venta.fecha}}', fontSize: 9 }),
    el('nc_m3',    'TEXT',           12,   5.5, 4.5, 0.55, { content: 'CAI:', fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('nc_m4',    'TEXT',           16.5, 5.5, 4.2, 0.55, { content: '{{empresa.cai}}', fontSize: 8 }),
    el('nc_m5',    'TEXT',           1,    6.2, 4.5, 0.55, { content: 'Rango:',      fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('nc_m6',    'TEXT',           5.5,  6.2, 15,  0.55, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 8 }),
    // Gold divider
    el('nc_div',   'SHAPE',          1,    7,   19,  0.06, { shapeType: 'LINE', stroke: '#f59e0b', strokeWidth: 2 }),
    // Client
    el('nc_cb',    'SHAPE',          1,    7.2, 19,  3,   { shapeType: 'RECTANGLE', fill: '#f8fafc', stroke: '#e2e8f0', strokeWidth: 1, borderRadius: 4 }),
    el('nc_cl',    'TEXT',           1.4,  7.4, 18,  0.5, { content: 'CLIENTE', fontSize: 8, fontWeight: 'bold', color: '#0f172a' }),
    el('nc_cn',    'TEXT',           1.4,  7.9, 18,  0.75, { content: '{{cliente.nombre}}', fontSize: 13, fontWeight: 'bold', color: '#0f172a' }),
    el('nc_ci',    'TEXT',           1.4,  8.7, 10,  0.55, { content: 'RTN: {{cliente.identidad}}', fontSize: 9, color: '#64748b' }),
    el('nc_ca',    'TEXT',           1.4,  9.3, 10,  0.55, { content: '{{cliente.direccion}}', fontSize: 9, color: '#64748b' }),
    // Table
    el('nc_tb',    'INVOICE_TABLE',  1,    10.5, 19, 11,  { tableColumns: a4Cols, tableHeaderBg: '#0f172a', tableHeaderColor: '#f59e0b', tableRowHeight: 0.9, tableAlternateRows: true, tableAlternateBg: '#f8fafc', tableFontSize: 9 }),
    // Summary
    el('nc_sb',    'SUMMARY_BOX',    13,   22,  7,   3,   { summaryRows: invoiceSummaryRows, summaryFontSize: 10, summaryLabelColor: '#0f172a', summaryValueColor: '#f59e0b', summaryBg: '#fafafa' }),
    // Footer
    el('nc_ft',    'TEXT',           1,    26.5, 19, 1,   { content: '{{empresa.mensajeFinal}} · Límite: {{empresa.fechaLimite}}', textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true }),
  ],
};

/** Brisa Marina — teal gradient header */
export const FACTURA_MARINA: Omit<LabelTemplate, 'id'> = {
  name: 'Brisa Marina', type: 'DOCUMENT', category: 'INVOICE', dataSource: 'SALES',
  isDefault: false, width: 21, height: 29.7, snapEnabled: false, gridSize: 0.5, showGrid: false, backgroundColor: '#ffffff',
  elements: [
    // Gradient header
    el('bm_hbg',   'SHAPE',          0,    0,   21,  4.5, { shapeType: 'RECTANGLE', fill: '#0891b2', stroke: 'transparent', strokeWidth: 0, gradientEnabled: true, gradientType: 'linear', gradientColor1: '#0891b2', gradientColor2: '#1d4ed8', gradientAngle: 135 }),
    // Rhombus decorative accents
    el('bm_rh1',   'SHAPE',          17.5, 0.3, 2.5, 2.5, { shapeType: 'RHOMBUS', fill: 'rgba(255,255,255,0.15)', stroke: 'transparent', strokeWidth: 0 }),
    el('bm_rh2',   'SHAPE',          16,   1.5, 1.5, 1.5, { shapeType: 'RHOMBUS', fill: 'rgba(255,255,255,0.1)',  stroke: 'transparent', strokeWidth: 0 }),
    // Company info + title
    el('bm_ch',    'COMPANY_HEADER', 1,    0.3, 14,  4,   { fontSize: 10, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('bm_title', 'TEXT',           1,    0.5, 19,  1.5, { content: 'FACTURA', fontSize: 30, fontWeight: '900', color: '#ffffff', textAlign: 'right', letterSpacing: 4, fontFamily: "'Raleway', sans-serif" }),
    el('bm_num',   'TEXT',           1,    2.2, 19,  0.7, { content: '{{venta.codVenta}}', fontSize: 10, color: 'rgba(255,255,255,0.75)', textAlign: 'right' }),
    // Meta
    el('bm_m1',    'TEXT',           1,    5.2, 5,   0.55, { content: 'Fecha:',      fontSize: 9, color: '#0891b2', fontWeight: 'bold' }),
    el('bm_m2',    'TEXT',           6,    5.2, 6,   0.55, { content: '{{venta.fecha}}', fontSize: 9 }),
    el('bm_m3',    'TEXT',           1,    5.9, 5,   0.55, { content: 'CAI:', fontSize: 9, color: '#0891b2', fontWeight: 'bold' }),
    el('bm_m4',    'TEXT',           6,    5.9, 14,  0.55, { content: '{{empresa.cai}}', fontSize: 8 }),
    el('bm_m5',    'TEXT',           1,    6.6, 5,   0.55, { content: 'Rango:', fontSize: 9, color: '#0891b2', fontWeight: 'bold' }),
    el('bm_m6',    'TEXT',           6,    6.6, 14,  0.55, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 8 }),
    // Client
    el('bm_cb',    'SHAPE',          1,    7.5, 19,  3,   { shapeType: 'RECTANGLE', fill: '#f0fdff', stroke: '#a5f3fc', strokeWidth: 1, borderRadius: 6 }),
    el('bm_cl',    'TEXT',           1.4,  7.7, 18,  0.5, { content: 'FACTURAR A', fontSize: 8, fontWeight: 'bold', color: '#0891b2' }),
    el('bm_cn',    'TEXT',           1.4,  8.2, 18,  0.75, { content: '{{cliente.nombre}}', fontSize: 13, fontWeight: 'bold', color: '#0c4a6e' }),
    el('bm_ci',    'TEXT',           1.4,  9,   10,  0.55, { content: 'RTN: {{cliente.identidad}}', fontSize: 9, color: '#0891b2' }),
    el('bm_ca',    'TEXT',           1.4,  9.6, 10,  0.55, { content: '{{cliente.direccion}}', fontSize: 9, color: '#0891b2' }),
    // Table
    el('bm_tb',    'INVOICE_TABLE',  1,    10.8, 19, 11,  { tableColumns: a4Cols, tableHeaderBg: '#0891b2', tableHeaderColor: '#ffffff', tableRowHeight: 0.9, tableAlternateRows: true, tableAlternateBg: '#f0fdff', tableFontSize: 9 }),
    // Summary
    el('bm_sb',    'SUMMARY_BOX',    13,   22.3, 7,  3,   { summaryRows: invoiceSummaryRows, summaryFontSize: 10, summaryLabelColor: '#0c4a6e', summaryValueColor: '#0891b2', summaryBg: '#f0fdff' }),
    // Footer
    el('bm_ft',    'TEXT',           1,    26.5, 19, 1,   { content: '{{empresa.mensajeFinal}} · Límite: {{empresa.fechaLimite}}', textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true }),
  ],
};

/** Atardecer Naranja — warm orange gradient accents */
export const FACTURA_NARANJA: Omit<LabelTemplate, 'id'> = {
  name: 'Atardecer Naranja', type: 'DOCUMENT', category: 'INVOICE', dataSource: 'SALES',
  isDefault: false, width: 21, height: 29.7, snapEnabled: false, gridSize: 0.5, showGrid: false, backgroundColor: '#ffffff',
  elements: [
    // Gradient header
    el('ao_hbg',   'SHAPE',          0,    0,   21,  4.5, { shapeType: 'RECTANGLE', fill: '#f97316', stroke: 'transparent', strokeWidth: 0, gradientEnabled: true, gradientType: 'linear', gradientColor1: '#f97316', gradientColor2: '#ef4444', gradientAngle: 135 }),
    // Triangle accent (top-right)
    el('ao_tri',   'SHAPE',          14,   0,   7,   4.5, { shapeType: 'TRIANGLE_TR', fill: 'rgba(0,0,0,0.15)', stroke: 'transparent', strokeWidth: 0 }),
    // Company + title
    el('ao_ch',    'COMPANY_HEADER', 1,    0.3, 12,  4,   { fontSize: 10, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('ao_title', 'TEXT',           1,    0.8, 19,  1.6, { content: 'FACTURA', fontSize: 30, fontWeight: '900', color: '#ffffff', textAlign: 'right', letterSpacing: 4, fontFamily: "'Montserrat', sans-serif" }),
    el('ao_num',   'TEXT',           1,    2.6, 19,  0.7, { content: '{{venta.codVenta}}', fontSize: 10, color: 'rgba(255,255,255,0.8)', textAlign: 'right' }),
    // Meta
    el('ao_m1',    'TEXT',           1,    5.2, 5,   0.55, { content: 'Fecha:',      fontSize: 9, color: '#f97316', fontWeight: 'bold' }),
    el('ao_m2',    'TEXT',           6,    5.2, 6,   0.55, { content: '{{venta.fecha}}', fontSize: 9 }),
    el('ao_m3',    'TEXT',           1,    5.9, 5,   0.55, { content: 'CAI:', fontSize: 9, color: '#f97316', fontWeight: 'bold' }),
    el('ao_m4',    'TEXT',           6,    5.9, 14,  0.55, { content: '{{empresa.cai}}', fontSize: 8 }),
    el('ao_m5',    'TEXT',           1,    6.6, 5,   0.55, { content: 'Rango:', fontSize: 9, color: '#f97316', fontWeight: 'bold' }),
    el('ao_m6',    'TEXT',           6,    6.6, 14,  0.55, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 8 }),
    // Client
    el('ao_cb',    'SHAPE',          1,    7.5, 19,  3,   { shapeType: 'RECTANGLE', fill: '#fff7ed', stroke: '#fed7aa', strokeWidth: 1, borderRadius: 6 }),
    el('ao_cl',    'TEXT',           1.4,  7.7, 18,  0.5, { content: 'FACTURAR A', fontSize: 8, fontWeight: 'bold', color: '#ea580c' }),
    el('ao_cn',    'TEXT',           1.4,  8.2, 18,  0.75, { content: '{{cliente.nombre}}', fontSize: 13, fontWeight: 'bold', color: '#7c2d12' }),
    el('ao_ci',    'TEXT',           1.4,  9,   10,  0.55, { content: 'RTN: {{cliente.identidad}}', fontSize: 9, color: '#9a3412' }),
    el('ao_ca',    'TEXT',           1.4,  9.6, 10,  0.55, { content: '{{cliente.direccion}}', fontSize: 9, color: '#9a3412' }),
    // Table
    el('ao_tb',    'INVOICE_TABLE',  1,    10.8, 19, 11,  { tableColumns: a4Cols, tableHeaderBg: '#f97316', tableHeaderColor: '#ffffff', tableRowHeight: 0.9, tableAlternateRows: true, tableAlternateBg: '#fff7ed', tableFontSize: 9 }),
    // Summary
    el('ao_sb',    'SUMMARY_BOX',    13,   22.3, 7,  3,   { summaryRows: invoiceSummaryRows, summaryFontSize: 10, summaryLabelColor: '#7c2d12', summaryValueColor: '#f97316', summaryBg: '#fff7ed' }),
    // Footer
    el('ao_ft',    'TEXT',           1,    26.5, 19, 1,   { content: '{{empresa.mensajeFinal}} · Límite: {{empresa.fechaLimite}}', textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true }),
  ],
};

/** Royal Violeta — deep purple luxury */
export const FACTURA_VIOLETA: Omit<LabelTemplate, 'id'> = {
  name: 'Royal Violeta', type: 'DOCUMENT', category: 'INVOICE', dataSource: 'SALES',
  isDefault: false, width: 21, height: 29.7, snapEnabled: false, gridSize: 0.5, showGrid: false, backgroundColor: '#ffffff',
  elements: [
    // Header base
    el('rv_hbg',   'SHAPE',          0,    0,   21,  4.5, { shapeType: 'RECTANGLE',   fill: '#7c3aed', stroke: 'transparent', strokeWidth: 0 }),
    el('rv_hsub',  'SHAPE',          0,    0,   21,  4.5, { shapeType: 'TRIANGLE_BL', fill: '#5b21b6', stroke: 'transparent', strokeWidth: 0 }),
    // Gold rhombus decorative accents
    el('rv_rh1',   'SHAPE',          18.5, 0.4, 1.8, 1.8, { shapeType: 'RHOMBUS', fill: '#f59e0b', stroke: 'transparent', strokeWidth: 0 }),
    el('rv_rh2',   'SHAPE',          17,   1.8, 1.2, 1.2, { shapeType: 'RHOMBUS', fill: 'rgba(245,158,11,0.5)', stroke: 'transparent', strokeWidth: 0 }),
    el('rv_rh3',   'SHAPE',          19.5, 2.2, 0.9, 0.9, { shapeType: 'RHOMBUS', fill: 'rgba(245,158,11,0.35)', stroke: 'transparent', strokeWidth: 0 }),
    // Company + title
    el('rv_ch',    'COMPANY_HEADER', 1,    0.3, 14,  4,   { fontSize: 10, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('rv_title', 'TEXT',           1,    0.6, 19,  1.8, { content: 'FACTURA', fontSize: 30, fontWeight: '900', color: '#f59e0b', textAlign: 'right', letterSpacing: 5, fontFamily: "'Playfair Display', serif" }),
    el('rv_num',   'TEXT',           1,    2.6, 19,  0.7, { content: '{{venta.codVenta}}', fontSize: 10, color: 'rgba(255,255,255,0.7)', textAlign: 'right' }),
    // Gold thin divider
    el('rv_div1',  'SHAPE',          1,    5,   19,  0.06, { shapeType: 'LINE', stroke: '#f59e0b', strokeWidth: 1.5 }),
    // Meta
    el('rv_m1',    'TEXT',           1,    5.3, 5,   0.55, { content: 'Fecha:',      fontSize: 9, color: '#7c3aed', fontWeight: 'bold' }),
    el('rv_m2',    'TEXT',           6,    5.3, 6,   0.55, { content: '{{venta.fecha}}', fontSize: 9 }),
    el('rv_m3',    'TEXT',           1,    6.0, 5,   0.55, { content: 'CAI:', fontSize: 9, color: '#7c3aed', fontWeight: 'bold' }),
    el('rv_m4',    'TEXT',           6,    6.0, 14,  0.55, { content: '{{empresa.cai}}', fontSize: 8 }),
    el('rv_m5',    'TEXT',           1,    6.7, 5,   0.55, { content: 'Rango:', fontSize: 9, color: '#7c3aed', fontWeight: 'bold' }),
    el('rv_m6',    'TEXT',           6,    6.7, 14,  0.55, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 8 }),
    // Client
    el('rv_cb',    'SHAPE',          1,    7.6, 19,  3,   { shapeType: 'RECTANGLE', fill: '#faf5ff', stroke: '#ddd6fe', strokeWidth: 1, borderRadius: 6 }),
    el('rv_cl',    'TEXT',           1.4,  7.8, 18,  0.5, { content: 'FACTURAR A', fontSize: 8, fontWeight: 'bold', color: '#7c3aed' }),
    el('rv_cn',    'TEXT',           1.4,  8.3, 18,  0.75, { content: '{{cliente.nombre}}', fontSize: 13, fontWeight: 'bold', color: '#4c1d95' }),
    el('rv_ci',    'TEXT',           1.4,  9.1, 10,  0.55, { content: 'RTN: {{cliente.identidad}}', fontSize: 9, color: '#6d28d9' }),
    el('rv_ca',    'TEXT',           1.4,  9.7, 10,  0.55, { content: '{{cliente.direccion}}', fontSize: 9, color: '#6d28d9' }),
    // Table
    el('rv_tb',    'INVOICE_TABLE',  1,    10.9, 19, 11,  { tableColumns: a4Cols, tableHeaderBg: '#7c3aed', tableHeaderColor: '#ffffff', tableRowHeight: 0.9, tableAlternateRows: true, tableAlternateBg: '#faf5ff', tableFontSize: 9 }),
    // Summary
    el('rv_sb',    'SUMMARY_BOX',    13,   22.4, 7,  3,   { summaryRows: invoiceSummaryRows, summaryFontSize: 10, summaryLabelColor: '#4c1d95', summaryValueColor: '#f59e0b', summaryBg: '#faf5ff' }),
    // Gold footer divider
    el('rv_div2',  'SHAPE',          1,    26.5, 19, 0.06, { shapeType: 'LINE', stroke: '#f59e0b', strokeWidth: 1 }),
    el('rv_ft',    'TEXT',           1,    26.7, 19, 1,   { content: '{{empresa.mensajeFinal}} · Límite: {{empresa.fechaLimite}}', textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true }),
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
  {
    id: 'factura_minimalista',
    name: 'Minimalista Índigo',
    description: 'Diseño limpio y moderno con acento índigo, tipografía Poppins y líneas finas.',
    icon: '🔷',
    type: 'DOCUMENT',
    category: 'INVOICE',
    template: FACTURA_MINIMALISTA,
  },
  {
    id: 'factura_noche',
    name: 'Noche Corporativa',
    description: 'Cabecera oscura con acento dorado y triángulo decorativo. Estilo ejecutivo.',
    icon: '🌑',
    type: 'DOCUMENT',
    category: 'INVOICE',
    template: FACTURA_NOCHE,
  },
  {
    id: 'factura_marina',
    name: 'Brisa Marina',
    description: 'Degradado azul-teal con rombos decorativos y paleta fresca de color.',
    icon: '🌊',
    type: 'DOCUMENT',
    category: 'INVOICE',
    template: FACTURA_MARINA,
  },
  {
    id: 'factura_naranja',
    name: 'Atardecer Naranja',
    description: 'Cabecera con degradado naranja-rojo, triángulo oscuro y tipografía Montserrat.',
    icon: '🌅',
    type: 'DOCUMENT',
    category: 'INVOICE',
    template: FACTURA_NARANJA,
  },
  {
    id: 'factura_violeta',
    name: 'Royal Violeta',
    description: 'Lujoso violeta oscuro con rombos dorados, fuente Playfair Display y detalles gold.',
    icon: '👑',
    type: 'DOCUMENT',
    category: 'INVOICE',
    template: FACTURA_VIOLETA,
  },
];
