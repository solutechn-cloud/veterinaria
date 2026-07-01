import { LabelTemplate } from '../types';
import { a4Cols, invoiceSummaryRows, el } from './starterTemplateUtils';

const MI_FONT = "'Poppins', sans-serif";

export const FACTURA_MINIMALISTA: Omit<LabelTemplate, 'id'> = {
  name: 'Minimalista Índigo', type: 'DOCUMENT', category: 'INVOICE', dataSource: 'SALES',
  isDefault: false, width: 21, height: 29.7, snapEnabled: false, gridSize: 0.5, showGrid: false, backgroundColor: '#ffffff',
  elements: [
    el('mi_bar',   'SHAPE',          0,    0,   21,  0.5,  { shapeType: 'RECTANGLE', fill: '#4f46e5', stroke: 'transparent', strokeWidth: 0 }),
    el('mi_ch',    'COMPANY_HEADER', 1,    0.8, 12,  2.8,  { fontSize: 10, color: '#1e293b', fontFamily: MI_FONT, companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('mi_title', 'TEXT',           14,   0.8, 6.5, 1.5,  { content: 'FACTURA', fontSize: 28, fontWeight: '900', color: '#4f46e5', textAlign: 'right', letterSpacing: 3, fontFamily: MI_FONT }),
    el('mi_sub',   'TEXT',           14,   2.4, 6.5, 0.7,  { content: '{{venta.numeroFactura}}', fontSize: 10, color: '#94a3b8', textAlign: 'right', fontFamily: MI_FONT }),
    el('mi_div1',  'SHAPE',          1,    3.9, 19,  0.06, { shapeType: 'LINE', stroke: '#4f46e5', strokeWidth: 1.5 }),

    // Columna izquierda: Facturar a
    el('mi_cl',    'TEXT',           1,    4.3, 9,   0.5,  { content: 'FACTURAR A', fontSize: 8, fontWeight: 'bold', color: '#4f46e5', fontFamily: MI_FONT }),
    el('mi_cn',    'TEXT',           1,    4.9, 9,   0.75, { content: '{{cliente.nombre}}', fontSize: 13, fontWeight: 'bold', color: '#1e293b', fontFamily: MI_FONT }),
    el('mi_ci',    'TEXT',           1,    5.7, 9,   0.55, { content: 'RTN/DNI: {{cliente.identidad}}', fontSize: 9, color: '#64748b', fontFamily: MI_FONT }),
    el('mi_ca',    'TEXT',           1,    6.3, 9,   0.55, { content: '{{cliente.direccion}}', fontSize: 9, color: '#64748b', fontFamily: MI_FONT }),

    // Columna derecha: datos del comprobante
    el('mi_m1',    'TEXT',           11.5, 4.3, 8.5, 0.55, { content: 'Fecha Emisión: {{venta.fecha}}',        fontSize: 9, color: '#1e293b', fontFamily: MI_FONT }),
    el('mi_m2',    'TEXT',           11.5, 4.9, 8.5, 0.55, { content: 'RTN Emisor: {{empresa.rtn}}',           fontSize: 9, color: '#1e293b', fontFamily: MI_FONT }),
    el('mi_m3',    'TEXT',           11.5, 5.5, 8.5, 0.55, { content: 'CAI: {{empresa.cai}}',                  fontSize: 8, color: '#1e293b', fontFamily: MI_FONT }),
    el('mi_m4',    'TEXT',           11.5, 6.1, 8.5, 0.55, { content: 'Vendedor: {{venta.nombreVendedor}}',    fontSize: 9, color: '#1e293b', fontFamily: MI_FONT }),

    el('mi_tb',    'INVOICE_TABLE',  1,    7.4, 19,  13,   { tableColumns: a4Cols, tableHeaderBg: '#4f46e5', tableHeaderColor: '#ffffff', tableRowHeight: 1.1, tableAlternateRows: true, tableAlternateBg: '#eef2ff', tableFontSize: 12, fontFamily: MI_FONT }),
    el('mi_sb',    'SUMMARY_BOX',    13,   20.8, 7,   3.2,  { summaryRows: invoiceSummaryRows, summaryFontSize: 11, summaryLabelColor: '#1e293b', summaryValueColor: '#4f46e5', summaryBg: '#f8faff', fontFamily: MI_FONT }),

    // Pie fiscal: rango autorizado, fecha límite, original/copia y código de barras
    el('mi_div2',  'SHAPE',          1,    24.4, 19, 0.06, { shapeType: 'LINE', stroke: '#4f46e5', strokeWidth: 1 }),
    el('mi_b1',    'TEXT',           1,    24.8, 11, 0.5,  { content: 'Rango Autorizado: {{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 8, color: '#64748b', fontFamily: MI_FONT }),
    el('mi_b2',    'TEXT',           1,    25.3, 11, 0.5,  { content: 'Fecha Límite de Emisión: {{empresa.fechaLimite}}', fontSize: 8, color: '#64748b', fontFamily: MI_FONT }),
    el('mi_b3',    'TEXT',           1,    25.8, 11, 0.5,  { content: 'Original Cliente | Copia Emisor', fontSize: 8, color: '#94a3b8', fontFamily: MI_FONT }),
    el('mi_bc',    'BARCODE',        13,   24.7, 7,  2,    { content: '{{venta.numeroFactura}}', fontSize: 8 }),

    el('mi_ft',    'TEXT',           1,    27,   19, 0.7,  { content: '{{empresa.mensajeFinal}}', textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true, fontFamily: MI_FONT }),

    // Redes sociales: icono (a subir por el usuario) + texto editable, uno por red
    el('mi_ic1',   'IMAGE',          6,    27.9, 0.5, 0.5,  { content: '', imageObjectFit: 'contain', elementLabel: 'Icono WhatsApp' }),
    el('mi_tx1',   'TEXT',           6.6,  27.9, 4.5, 0.5,  { content: '+504 0000-0000', fontSize: 8, color: '#64748b', fontFamily: MI_FONT, elementLabel: 'Texto WhatsApp' }),
    el('mi_ic2',   'IMAGE',          11.5, 27.9, 0.5, 0.5,  { content: '', imageObjectFit: 'contain', elementLabel: 'Icono Facebook' }),
    el('mi_tx2',   'TEXT',           12.1, 27.9, 4.5, 0.5,  { content: 'Tu Empresa', fontSize: 8, color: '#64748b', fontFamily: MI_FONT, elementLabel: 'Texto Facebook' }),
    el('mi_ic3',   'IMAGE',          17,   27.9, 0.5, 0.5,  { content: '', imageObjectFit: 'contain', elementLabel: 'Icono Instagram' }),
    el('mi_tx3',   'TEXT',           17.6, 27.9, 2.4, 0.5,  { content: '@tuempresa', fontSize: 8, color: '#64748b', fontFamily: MI_FONT, elementLabel: 'Texto Instagram' }),
  ],
};

export const FACTURA_NOCHE: Omit<LabelTemplate, 'id'> = {
  name: 'Noche Corporativa', type: 'DOCUMENT', category: 'INVOICE', dataSource: 'SALES',
  isDefault: false, width: 21, height: 29.7, snapEnabled: false, gridSize: 0.5, showGrid: false, backgroundColor: '#ffffff',
  elements: [
    el('nc_hbg',   'SHAPE',          0,    0,   21,  5,   { shapeType: 'RECTANGLE',   fill: '#0f172a', stroke: 'transparent', strokeWidth: 0 }),
    el('nc_htri',  'SHAPE',          13,   0,   8,   5,   { shapeType: 'TRIANGLE_BR', fill: '#f59e0b', stroke: 'transparent', strokeWidth: 0 }),
    el('nc_ch',    'COMPANY_HEADER', 1,    0.5, 11,  4,   { fontSize: 10, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('nc_title', 'TEXT',           1,    1.2, 19,  1.5, { content: 'FACTURA', fontSize: 32, fontWeight: '900', color: '#f59e0b', textAlign: 'right', letterSpacing: 5, fontFamily: "'Oswald', sans-serif" }),
    el('nc_num',   'TEXT',           1,    2.9, 19,  0.7, { content: '{{venta.numeroFactura}}', fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'right' }),
    el('nc_m1',    'TEXT',           1,    5.5, 4.5, 0.55, { content: 'Fecha:',      fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('nc_m2',    'TEXT',           5.5,  5.5, 6,   0.55, { content: '{{venta.fecha}}', fontSize: 9 }),
    el('nc_m3',    'TEXT',           12,   5.5, 4.5, 0.55, { content: 'CAI:', fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('nc_m4',    'TEXT',           16.5, 5.5, 4.2, 0.55, { content: '{{empresa.cai}}', fontSize: 8 }),
    el('nc_m5',    'TEXT',           1,    6.2, 4.5, 0.55, { content: 'Rango:',      fontSize: 9, color: '#64748b', fontWeight: 'bold' }),
    el('nc_m6',    'TEXT',           5.5,  6.2, 15,  0.55, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 8 }),
    el('nc_div',   'SHAPE',          1,    7,   19,  0.06, { shapeType: 'LINE', stroke: '#f59e0b', strokeWidth: 2 }),
    el('nc_cb',    'SHAPE',          1,    7.2, 19,  3,   { shapeType: 'RECTANGLE', fill: '#f8fafc', stroke: '#e2e8f0', strokeWidth: 1, borderRadius: 4 }),
    el('nc_cl',    'TEXT',           1.4,  7.4, 18,  0.5, { content: 'CLIENTE', fontSize: 8, fontWeight: 'bold', color: '#0f172a' }),
    el('nc_cn',    'TEXT',           1.4,  7.9, 18,  0.75, { content: '{{cliente.nombre}}', fontSize: 13, fontWeight: 'bold', color: '#0f172a' }),
    el('nc_ci',    'TEXT',           1.4,  8.7, 10,  0.55, { content: 'RTN: {{cliente.identidad}}', fontSize: 9, color: '#64748b' }),
    el('nc_ca',    'TEXT',           1.4,  9.3, 10,  0.55, { content: '{{cliente.direccion}}', fontSize: 9, color: '#64748b' }),
    el('nc_tb',    'INVOICE_TABLE',  1,    10.5, 19, 11,  { tableColumns: a4Cols, tableHeaderBg: '#0f172a', tableHeaderColor: '#f59e0b', tableRowHeight: 0.9, tableAlternateRows: true, tableAlternateBg: '#f8fafc', tableFontSize: 9 }),
    el('nc_sb',    'SUMMARY_BOX',    13,   22,  7,   3,   { summaryRows: invoiceSummaryRows, summaryFontSize: 10, summaryLabelColor: '#0f172a', summaryValueColor: '#f59e0b', summaryBg: '#fafafa' }),
    el('nc_ft',    'TEXT',           1,    26.5, 19, 1,   { content: '{{empresa.mensajeFinal}} · Límite: {{empresa.fechaLimite}}', textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true }),
  ],
};

export const FACTURA_MARINA: Omit<LabelTemplate, 'id'> = {
  name: 'Brisa Marina', type: 'DOCUMENT', category: 'INVOICE', dataSource: 'SALES',
  isDefault: false, width: 21, height: 29.7, snapEnabled: false, gridSize: 0.5, showGrid: false, backgroundColor: '#ffffff',
  elements: [
    el('bm_hbg',   'SHAPE',          0,    0,   21,  4.5, { shapeType: 'RECTANGLE', fill: '#0891b2', stroke: 'transparent', strokeWidth: 0, gradientEnabled: true, gradientType: 'linear', gradientColor1: '#0891b2', gradientColor2: '#1d4ed8', gradientAngle: 135 }),
    el('bm_rh1',   'SHAPE',          17.5, 0.3, 2.5, 2.5, { shapeType: 'RHOMBUS', fill: 'rgba(255,255,255,0.15)', stroke: 'transparent', strokeWidth: 0 }),
    el('bm_rh2',   'SHAPE',          16,   1.5, 1.5, 1.5, { shapeType: 'RHOMBUS', fill: 'rgba(255,255,255,0.1)',  stroke: 'transparent', strokeWidth: 0 }),
    el('bm_ch',    'COMPANY_HEADER', 1,    0.3, 14,  4,   { fontSize: 10, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('bm_title', 'TEXT',           1,    0.5, 19,  1.5, { content: 'FACTURA', fontSize: 30, fontWeight: '900', color: '#ffffff', textAlign: 'right', letterSpacing: 4, fontFamily: "'Raleway', sans-serif" }),
    el('bm_num',   'TEXT',           1,    2.2, 19,  0.7, { content: '{{venta.numeroFactura}}', fontSize: 10, color: 'rgba(255,255,255,0.75)', textAlign: 'right' }),
    el('bm_m1',    'TEXT',           1,    5.2, 5,   0.55, { content: 'Fecha:',      fontSize: 9, color: '#0891b2', fontWeight: 'bold' }),
    el('bm_m2',    'TEXT',           6,    5.2, 6,   0.55, { content: '{{venta.fecha}}', fontSize: 9 }),
    el('bm_m3',    'TEXT',           1,    5.9, 5,   0.55, { content: 'CAI:', fontSize: 9, color: '#0891b2', fontWeight: 'bold' }),
    el('bm_m4',    'TEXT',           6,    5.9, 14,  0.55, { content: '{{empresa.cai}}', fontSize: 8 }),
    el('bm_m5',    'TEXT',           1,    6.6, 5,   0.55, { content: 'Rango:', fontSize: 9, color: '#0891b2', fontWeight: 'bold' }),
    el('bm_m6',    'TEXT',           6,    6.6, 14,  0.55, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 8 }),
    el('bm_cb',    'SHAPE',          1,    7.5, 19,  3,   { shapeType: 'RECTANGLE', fill: '#f0fdff', stroke: '#a5f3fc', strokeWidth: 1, borderRadius: 6 }),
    el('bm_cl',    'TEXT',           1.4,  7.7, 18,  0.5, { content: 'FACTURAR A', fontSize: 8, fontWeight: 'bold', color: '#0891b2' }),
    el('bm_cn',    'TEXT',           1.4,  8.2, 18,  0.75, { content: '{{cliente.nombre}}', fontSize: 13, fontWeight: 'bold', color: '#0c4a6e' }),
    el('bm_ci',    'TEXT',           1.4,  9,   10,  0.55, { content: 'RTN: {{cliente.identidad}}', fontSize: 9, color: '#0891b2' }),
    el('bm_ca',    'TEXT',           1.4,  9.6, 10,  0.55, { content: '{{cliente.direccion}}', fontSize: 9, color: '#0891b2' }),
    el('bm_tb',    'INVOICE_TABLE',  1,    10.8, 19, 11,  { tableColumns: a4Cols, tableHeaderBg: '#0891b2', tableHeaderColor: '#ffffff', tableRowHeight: 0.9, tableAlternateRows: true, tableAlternateBg: '#f0fdff', tableFontSize: 9 }),
    el('bm_sb',    'SUMMARY_BOX',    13,   22.3, 7,  3,   { summaryRows: invoiceSummaryRows, summaryFontSize: 10, summaryLabelColor: '#0c4a6e', summaryValueColor: '#0891b2', summaryBg: '#f0fdff' }),
    el('bm_ft',    'TEXT',           1,    26.5, 19, 1,   { content: '{{empresa.mensajeFinal}} · Límite: {{empresa.fechaLimite}}', textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true }),
  ],
};

export const FACTURA_NARANJA: Omit<LabelTemplate, 'id'> = {
  name: 'Atardecer Naranja', type: 'DOCUMENT', category: 'INVOICE', dataSource: 'SALES',
  isDefault: false, width: 21, height: 29.7, snapEnabled: false, gridSize: 0.5, showGrid: false, backgroundColor: '#ffffff',
  elements: [
    el('ao_hbg',   'SHAPE',          0,    0,   21,  4.5, { shapeType: 'RECTANGLE', fill: '#f97316', stroke: 'transparent', strokeWidth: 0, gradientEnabled: true, gradientType: 'linear', gradientColor1: '#f97316', gradientColor2: '#ef4444', gradientAngle: 135 }),
    el('ao_tri',   'SHAPE',          14,   0,   7,   4.5, { shapeType: 'TRIANGLE_TR', fill: 'rgba(0,0,0,0.15)', stroke: 'transparent', strokeWidth: 0 }),
    el('ao_ch',    'COMPANY_HEADER', 1,    0.3, 12,  4,   { fontSize: 10, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('ao_title', 'TEXT',           1,    0.8, 19,  1.6, { content: 'FACTURA', fontSize: 30, fontWeight: '900', color: '#ffffff', textAlign: 'right', letterSpacing: 4, fontFamily: "'Montserrat', sans-serif" }),
    el('ao_num',   'TEXT',           1,    2.6, 19,  0.7, { content: '{{venta.numeroFactura}}', fontSize: 10, color: 'rgba(255,255,255,0.8)', textAlign: 'right' }),
    el('ao_m1',    'TEXT',           1,    5.2, 5,   0.55, { content: 'Fecha:',      fontSize: 9, color: '#f97316', fontWeight: 'bold' }),
    el('ao_m2',    'TEXT',           6,    5.2, 6,   0.55, { content: '{{venta.fecha}}', fontSize: 9 }),
    el('ao_m3',    'TEXT',           1,    5.9, 5,   0.55, { content: 'CAI:', fontSize: 9, color: '#f97316', fontWeight: 'bold' }),
    el('ao_m4',    'TEXT',           6,    5.9, 14,  0.55, { content: '{{empresa.cai}}', fontSize: 8 }),
    el('ao_m5',    'TEXT',           1,    6.6, 5,   0.55, { content: 'Rango:', fontSize: 9, color: '#f97316', fontWeight: 'bold' }),
    el('ao_m6',    'TEXT',           6,    6.6, 14,  0.55, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 8 }),
    el('ao_cb',    'SHAPE',          1,    7.5, 19,  3,   { shapeType: 'RECTANGLE', fill: '#fff7ed', stroke: '#fed7aa', strokeWidth: 1, borderRadius: 6 }),
    el('ao_cl',    'TEXT',           1.4,  7.7, 18,  0.5, { content: 'FACTURAR A', fontSize: 8, fontWeight: 'bold', color: '#ea580c' }),
    el('ao_cn',    'TEXT',           1.4,  8.2, 18,  0.75, { content: '{{cliente.nombre}}', fontSize: 13, fontWeight: 'bold', color: '#7c2d12' }),
    el('ao_ci',    'TEXT',           1.4,  9,   10,  0.55, { content: 'RTN: {{cliente.identidad}}', fontSize: 9, color: '#9a3412' }),
    el('ao_ca',    'TEXT',           1.4,  9.6, 10,  0.55, { content: '{{cliente.direccion}}', fontSize: 9, color: '#9a3412' }),
    el('ao_tb',    'INVOICE_TABLE',  1,    10.8, 19, 11,  { tableColumns: a4Cols, tableHeaderBg: '#f97316', tableHeaderColor: '#ffffff', tableRowHeight: 0.9, tableAlternateRows: true, tableAlternateBg: '#fff7ed', tableFontSize: 9 }),
    el('ao_sb',    'SUMMARY_BOX',    13,   22.3, 7,  3,   { summaryRows: invoiceSummaryRows, summaryFontSize: 10, summaryLabelColor: '#7c2d12', summaryValueColor: '#f97316', summaryBg: '#fff7ed' }),
    el('ao_ft',    'TEXT',           1,    26.5, 19, 1,   { content: '{{empresa.mensajeFinal}} · Límite: {{empresa.fechaLimite}}', textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true }),
  ],
};

export const FACTURA_VIOLETA: Omit<LabelTemplate, 'id'> = {
  name: 'Royal Violeta', type: 'DOCUMENT', category: 'INVOICE', dataSource: 'SALES',
  isDefault: false, width: 21, height: 29.7, snapEnabled: false, gridSize: 0.5, showGrid: false, backgroundColor: '#ffffff',
  elements: [
    el('rv_hbg',   'SHAPE',          0,    0,   21,  4.5, { shapeType: 'RECTANGLE',   fill: '#7c3aed', stroke: 'transparent', strokeWidth: 0 }),
    el('rv_hsub',  'SHAPE',          0,    0,   21,  4.5, { shapeType: 'TRIANGLE_BL', fill: '#5b21b6', stroke: 'transparent', strokeWidth: 0 }),
    el('rv_rh1',   'SHAPE',          18.5, 0.4, 1.8, 1.8, { shapeType: 'RHOMBUS', fill: '#f59e0b', stroke: 'transparent', strokeWidth: 0 }),
    el('rv_rh2',   'SHAPE',          17,   1.8, 1.2, 1.2, { shapeType: 'RHOMBUS', fill: 'rgba(245,158,11,0.5)', stroke: 'transparent', strokeWidth: 0 }),
    el('rv_rh3',   'SHAPE',          19.5, 2.2, 0.9, 0.9, { shapeType: 'RHOMBUS', fill: 'rgba(245,158,11,0.35)', stroke: 'transparent', strokeWidth: 0 }),
    el('rv_ch',    'COMPANY_HEADER', 1,    0.3, 14,  4,   { fontSize: 10, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('rv_title', 'TEXT',           1,    0.6, 19,  1.8, { content: 'FACTURA', fontSize: 30, fontWeight: '900', color: '#f59e0b', textAlign: 'right', letterSpacing: 5, fontFamily: "'Playfair Display', serif" }),
    el('rv_num',   'TEXT',           1,    2.6, 19,  0.7, { content: '{{venta.numeroFactura}}', fontSize: 10, color: 'rgba(255,255,255,0.7)', textAlign: 'right' }),
    el('rv_div1',  'SHAPE',          1,    5,   19,  0.06, { shapeType: 'LINE', stroke: '#f59e0b', strokeWidth: 1.5 }),
    el('rv_m1',    'TEXT',           1,    5.3, 5,   0.55, { content: 'Fecha:',      fontSize: 9, color: '#7c3aed', fontWeight: 'bold' }),
    el('rv_m2',    'TEXT',           6,    5.3, 6,   0.55, { content: '{{venta.fecha}}', fontSize: 9 }),
    el('rv_m3',    'TEXT',           1,    6.0, 5,   0.55, { content: 'CAI:', fontSize: 9, color: '#7c3aed', fontWeight: 'bold' }),
    el('rv_m4',    'TEXT',           6,    6.0, 14,  0.55, { content: '{{empresa.cai}}', fontSize: 8 }),
    el('rv_m5',    'TEXT',           1,    6.7, 5,   0.55, { content: 'Rango:', fontSize: 9, color: '#7c3aed', fontWeight: 'bold' }),
    el('rv_m6',    'TEXT',           6,    6.7, 14,  0.55, { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 8 }),
    el('rv_cb',    'SHAPE',          1,    7.6, 19,  3,   { shapeType: 'RECTANGLE', fill: '#faf5ff', stroke: '#ddd6fe', strokeWidth: 1, borderRadius: 6 }),
    el('rv_cl',    'TEXT',           1.4,  7.8, 18,  0.5, { content: 'FACTURAR A', fontSize: 8, fontWeight: 'bold', color: '#7c3aed' }),
    el('rv_cn',    'TEXT',           1.4,  8.3, 18,  0.75, { content: '{{cliente.nombre}}', fontSize: 13, fontWeight: 'bold', color: '#4c1d95' }),
    el('rv_ci',    'TEXT',           1.4,  9.1, 10,  0.55, { content: 'RTN: {{cliente.identidad}}', fontSize: 9, color: '#6d28d9' }),
    el('rv_ca',    'TEXT',           1.4,  9.7, 10,  0.55, { content: '{{cliente.direccion}}', fontSize: 9, color: '#6d28d9' }),
    el('rv_tb',    'INVOICE_TABLE',  1,    10.9, 19, 11,  { tableColumns: a4Cols, tableHeaderBg: '#7c3aed', tableHeaderColor: '#ffffff', tableRowHeight: 0.9, tableAlternateRows: true, tableAlternateBg: '#faf5ff', tableFontSize: 9 }),
    el('rv_sb',    'SUMMARY_BOX',    13,   22.4, 7,  3,   { summaryRows: invoiceSummaryRows, summaryFontSize: 10, summaryLabelColor: '#4c1d95', summaryValueColor: '#f59e0b', summaryBg: '#faf5ff' }),
    el('rv_div2',  'SHAPE',          1,    26.5, 19, 0.06, { shapeType: 'LINE', stroke: '#f59e0b', strokeWidth: 1 }),
    el('rv_ft',    'TEXT',           1,    26.7, 19, 1,   { content: '{{empresa.mensajeFinal}} · Límite: {{empresa.fechaLimite}}', textAlign: 'center', fontSize: 8, color: '#94a3b8', isMultiline: true }),
  ],
};
