import { LabelTemplate } from '../types';
import { pharmaCols, pharmaSummaryRows, el } from './starterTemplateUtils';

export const ETIQUETA_MEDICAMENTO: Omit<LabelTemplate, 'id'> = {
  name: 'Etiqueta Medicamento',
  type: 'LABEL',
  category: 'MEDICAMENTO',
  dataSource: 'MEDICAMENTOS',
  isDefault: false,
  width: 50, height: 30,
  snapEnabled: true, gridSize: 2, showGrid: false,
  backgroundColor: '#ffffff',
  elements: [
    el('em_bar', 'SHAPE',   0,  0,  50,  2,  { shapeType: 'RECTANGLE', fill: '#059669', stroke: 'transparent', strokeWidth: 0 }),
    el('em_n',   'TEXT',    1,  2.5, 48,  7,  { content: '{{medicamento.nombre}}', fontWeight: 'bold', fontSize: 8, textAlign: 'center', color: '#1e293b' }),
    el('em_p',   'TEXT',    1,  9,  48,  5,  { content: '{{presentacion.nombre}}', fontSize: 6, textAlign: 'center', color: '#64748b' }),
    el('em_pr',  'TEXT',    1,  14, 48,  7,  { content: 'L. {{presentacion.precioVenta}}', fontWeight: 'bold', fontSize: 12, textAlign: 'center', color: '#059669' }),
    el('em_b',   'BARCODE', 3,  22, 44,  7,  { content: '{{medicamento.codigo}}', barcodeFormat: 'CODE128', displayValue: true, fontSize: 6 }),
  ],
};

export const ETIQUETA_LOTE: Omit<LabelTemplate, 'id'> = {
  name: 'Etiqueta Lote / Vencimiento',
  type: 'LABEL',
  category: 'LOTE',
  dataSource: 'LOTES_MED',
  isDefault: false,
  width: 70, height: 40,
  snapEnabled: true, gridSize: 2, showGrid: false,
  backgroundColor: '#ffffff',
  elements: [
    el('el_bar', 'SHAPE',   0,   0,   70,  3,  { shapeType: 'RECTANGLE', fill: '#7c3aed', stroke: 'transparent', strokeWidth: 0 }),
    el('el_n',   'TEXT',    2,   3.5, 66,  7,  { content: '{{medicamento.nombre}}', fontWeight: 'bold', fontSize: 9, textAlign: 'center', color: '#1e293b' }),
    el('el_sep', 'SHAPE',   2,   11,  66,  0.05, { shapeType: 'LINE', stroke: '#e2e8f0', strokeWidth: 1 }),
    el('el_ll',  'TEXT',    2,   12,  20,  5,  { content: 'LOTE:', fontSize: 7, fontWeight: 'bold', color: '#64748b' }),
    el('el_lv',  'TEXT',    22,  12,  46,  5,  { content: '{{lote.numeroLote}}', fontSize: 7, color: '#1e293b' }),
    el('el_fl',  'TEXT',    2,   18,  20,  5,  { content: 'VENCE:', fontSize: 7, fontWeight: 'bold', color: '#dc2626' }),
    el('el_fv',  'TEXT',    22,  18,  46,  5,  { content: '{{lote.fechaVencimiento}}', fontSize: 8, fontWeight: 'bold', color: '#dc2626' }),
    el('el_ql',  'TEXT',    2,   24,  20,  5,  { content: 'CANT:', fontSize: 7, fontWeight: 'bold', color: '#64748b' }),
    el('el_qv',  'TEXT',    22,  24,  46,  5,  { content: '{{lote.cantidadDisponible}}', fontSize: 7, color: '#1e293b' }),
    el('el_b',   'BARCODE', 4,   30,  62,  9,  { content: '{{lote.numeroLote}}', barcodeFormat: 'CODE128', displayValue: true, fontSize: 6 }),
  ],
};

export const ETIQUETA_DISPENSACION: Omit<LabelTemplate, 'id'> = {
  name: 'Etiqueta Dispensación',
  type: 'LABEL',
  category: 'DISPENSACION',
  dataSource: 'DISPENSACION',
  isDefault: false,
  width: 90, height: 55,
  snapEnabled: true, gridSize: 2, showGrid: false,
  backgroundColor: '#ffffff',
  elements: [
    el('ed_hbg', 'SHAPE',  0,   0,   90,  9,  { shapeType: 'RECTANGLE', fill: '#0f766e', stroke: 'transparent', strokeWidth: 0 }),
    el('ed_hn',  'TEXT',   2,   1,   86,  7,  { content: '{{empresa.nombreEmpresa}}', fontWeight: 'bold', fontSize: 9, textAlign: 'center', color: '#ffffff' }),
    el('ed_pl',  'TEXT',   2,   10.5, 16,  5,  { content: 'Paciente:', fontSize: 7, fontWeight: 'bold', color: '#64748b' }),
    el('ed_pn',  'TEXT',   18,  10.5, 70,  5,  { content: '{{paciente.nombre}}', fontSize: 8, fontWeight: 'bold', color: '#1e293b' }),
    el('ed_rx',  'TEXT',   2,   16,  44,  5,  { content: 'Formula: {{item.dosis}}', fontSize: 7, color: '#64748b' }),
    el('ed_fe',  'TEXT',   46,  16,  42,  5,  { content: 'Fecha: {{venta.fecha}}', fontSize: 7, color: '#64748b' }),
    el('ed_div', 'SHAPE',  2,   22,  86,  0.05, { shapeType: 'LINE', stroke: '#0f766e', strokeWidth: 1.5 }),
    el('ed_mn',  'TEXT',   2,   23.5, 86,  7,  { content: '{{medicamento.nombre}}', fontWeight: 'bold', fontSize: 10, color: '#0f766e' }),
    el('ed_mp',  'TEXT',   2,   31,  44,  5,  { content: '{{presentacion.nombre}}', fontSize: 7, color: '#475569' }),
    el('ed_dos', 'TEXT',   2,   37,  86,  5,  { content: 'Dosis: {{item.dosis}}', fontSize: 7, color: '#1e293b' }),
    el('ed_ind', 'TEXT',   2,   43,  86,  5,  { content: 'Indicaciones: {{item.indicaciones}}', fontSize: 7, color: '#475569' }),
    el('ed_lt',  'TEXT',   2,   49,  44,  5,  { content: 'Lote: {{lote.numeroLote}}', fontSize: 7, color: '#64748b' }),
    el('ed_exp', 'TEXT',   46,  49,  42,  5,  { content: 'Vence: {{lote.fechaVencimiento}}', fontSize: 7, fontWeight: 'bold', color: '#dc2626' }),
  ],
};

export const DESPACHO_TERMICO: Omit<LabelTemplate, 'id'> = {
  name: 'Recibo Despacho Veterinaria',
  type: 'DOCUMENT',
  category: 'INVOICE',
  dataSource: 'DISPENSACION',
  isDefault: false,
  width: 8, height: 23,
  snapEnabled: false, gridSize: 0.5, showGrid: false,
  backgroundColor: '#ffffff',
  elements: [
    el('dt_hbg',   'SHAPE',          0,    0,   8,   2.8, { shapeType: 'RECTANGLE',   fill: '#0f766e', stroke: 'transparent', strokeWidth: 0 }),
    el('dt_htri',  'SHAPE',          0,    0,   3.5, 2.8, { shapeType: 'TRIANGLE_TL', fill: '#14b8a6', stroke: 'transparent', strokeWidth: 0 }),
    el('dt_ch',    'COMPANY_HEADER', 3.3,  0,   4.7, 2.8, { fontSize: 8, color: '#ffffff', companyStyle: 'PLAIN', companyAlign: 'left', companyShowRTN: true, companyShowPhone: true, companyShowEmail: false }),
    el('dt_title', 'TEXT',           0.2,  1.0, 2.8, 1.0, { content: 'VETERINARIA', fontSize: 11, fontWeight: '900', color: '#ffffff', textAlign: 'left', letterSpacing: 1 }),
    el('dt_t1', 'TEXT', 0.2, 3.0,  7.6, 0.55, { content: 'Recibo: {{venta.codVenta}}', fontSize: 9 }),
    el('dt_t2', 'TEXT', 0.2, 3.6,  7.6, 0.55, { content: 'Fecha: {{venta.fecha}}', fontSize: 9 }),
    el('dt_t3', 'TEXT', 0.2, 4.2,  7.6, 0.55, { content: 'Paciente: {{paciente.nombre}}', fontSize: 8, fontWeight: 'bold' }),
    el('dt_t4', 'TEXT', 0.2, 4.75, 7.6, 0.5,  { content: 'Identidad: {{paciente.identidad}}', fontSize: 7, color: '#555555' }),
    el('dt_t5', 'TEXT', 0.2, 5.3,  7.6, 0.5,  { content: 'CAI: {{empresa.cai}}', fontSize: 7, color: '#555555' }),
    el('dt_t6', 'TEXT', 0.2, 5.85, 7.6, 0.5,  { content: '{{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 7, color: '#555555' }),
    el('dt_l1', 'SHAPE', 0, 6.45, 8, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    el('dt_tb', 'INVOICE_TABLE', 0, 6.6, 8, 8.5, {
      tableColumns: pharmaCols, tableHeaderBg: '#0f766e', tableHeaderColor: '#ffffff',
      tableRowHeight: 0.75, tableAlternateRows: true, tableAlternateBg: '#f0fdfa', tableFontSize: 8,
    }),
    el('dt_l2', 'SHAPE', 0, 15.2, 8, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    el('dt_sb', 'SUMMARY_BOX', 3.5, 15.4, 4.5, 2.8, {
      summaryRows: pharmaSummaryRows, summaryFontSize: 9,
      summaryLabelColor: '#1e293b', summaryValueColor: '#0f766e',
    }),
    el('dt_l3', 'SHAPE', 0, 18.3, 8, 0.05, { shapeType: 'LINE', stroke: '#000', strokeWidth: 1 }),
    el('dt_ft', 'TEXT', 0.2, 18.5, 7.6, 2, {
      content: '{{empresa.mensajeFinal}}\nFecha límite: {{empresa.fechaLimite}}\nMantenga los medicamentos fuera del alcance de los niños.',
      textAlign: 'center', fontSize: 7, color: '#555555', isMultiline: true,
    }),
  ],
};
