import { LabelTemplate } from '../types';
import { FACTURA_TERMICA, FACTURA_TERMICA_FISCAL, FACTURA_A4 } from './starterTemplatesInvoice';
import { FACTURA_MINIMALISTA, FACTURA_NOCHE, FACTURA_MARINA, FACTURA_NARANJA, FACTURA_VIOLETA } from './starterTemplatesStyled';
import { ETIQUETA_MEDICAMENTO, ETIQUETA_LOTE, ETIQUETA_DISPENSACION, DESPACHO_TERMICO } from './starterTemplatesPharmacy';

export {
  FACTURA_TERMICA, FACTURA_TERMICA_FISCAL, FACTURA_A4,
  FACTURA_MINIMALISTA, FACTURA_NOCHE, FACTURA_MARINA, FACTURA_NARANJA, FACTURA_VIOLETA,
  ETIQUETA_MEDICAMENTO, ETIQUETA_LOTE, ETIQUETA_DISPENSACION, DESPACHO_TERMICO,
};

export interface StarterTemplateEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: 'LABEL' | 'DOCUMENT';
  category: string;
  template: Omit<LabelTemplate, 'id'>;
}

export const STARTER_TEMPLATES: StarterTemplateEntry[] = [
  {
    id: 'etiqueta_medicamento',
    name: 'Etiqueta Medicamento',
    description: 'Etiqueta 50×30mm con nombre, presentación, precio y código de barras.',
    icon: '💊',
    type: 'LABEL',
    category: 'MEDICAMENTO',
    template: ETIQUETA_MEDICAMENTO,
  },
  {
    id: 'etiqueta_lote',
    name: 'Etiqueta Lote / Vencimiento',
    description: 'Etiqueta 70×40mm con número de lote, fecha de vencimiento y código de barras.',
    icon: '📦',
    type: 'LABEL',
    category: 'LOTE',
    template: ETIQUETA_LOTE,
  },
  {
    id: 'etiqueta_dispensacion',
    name: 'Etiqueta Dispensación',
    description: 'Etiqueta 90×55mm para bolsa de medicamentos con paciente, dosis e indicaciones.',
    icon: '🏷️',
    type: 'LABEL',
    category: 'DISPENSACION',
    template: ETIQUETA_DISPENSACION,
  },
  {
    id: 'despacho_termico',
    name: 'Recibo Despacho Veterinaria',
    description: 'Ticket térmico 80mm para despacho de medicamentos con paciente, tabla y totales.',
    icon: '🏥',
    type: 'DOCUMENT',
    category: 'INVOICE',
    template: DESPACHO_TERMICO,
  },
  {
    id: 'factura_termica',
    name: 'Factura Térmica 80mm',
    description: 'Ticket para impresora térmica. Incluye datos de empresa, tabla de ítems y totales.',
    icon: '🧾',
    type: 'DOCUMENT',
    category: 'INVOICE',
    template: FACTURA_TERMICA_FISCAL,
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
