import { LabelElement, LabelTemplate } from '../types';

const PACKAGE_ID = 'smartcloud-label-template';
const PACKAGE_VERSION = 1;

const ELEMENT_TYPES = new Set<LabelElement['type']>([
  'TEXT',
  'BARCODE',
  'QR',
  'IMAGE',
  'SHAPE',
  'INVOICE_TABLE',
  'SUMMARY_BOX',
  'COMPANY_HEADER',
  'RECEIPT_ITEMS',
]);

type TemplatePackage = {
  app: 'SmartCloudERP';
  kind: 'label-template';
  version: number;
  exportedAt: string;
  template: LabelTemplate;
};

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeId(prefix = 'el'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeImportedTemplate(raw: unknown, sourceName = 'plantilla'): LabelTemplate {
  const candidate = (raw && typeof raw === 'object' && 'template' in raw)
    ? (raw as { template?: unknown }).template
    : raw;

  if (!candidate || typeof candidate !== 'object') {
    throw new Error('El archivo no contiene una plantilla valida.');
  }

  const tpl = candidate as Partial<LabelTemplate>;
  const elements = Array.isArray(tpl.elements) ? tpl.elements : null;
  if (!elements) throw new Error('La plantilla no contiene elementos editables.');

  const type = tpl.type === 'DOCUMENT' ? 'DOCUMENT' : 'LABEL';
  const width = asNumber(tpl.width, type === 'DOCUMENT' ? 21 : 50);
  const height = asNumber(tpl.height, type === 'DOCUMENT' ? 29.7 : 25);
  if (width <= 0 || height <= 0 || width > 1000 || height > 1000) {
    throw new Error('Las dimensiones de la plantilla no son validas.');
  }

  const normalizedElements = elements.map((item, index) => {
    const el = item as Partial<LabelElement>;
    if (!ELEMENT_TYPES.has(el.type as LabelElement['type'])) {
      throw new Error(`Elemento ${index + 1}: tipo no soportado.`);
    }
    const normalized: LabelElement = {
      ...el,
      id: typeof el.id === 'string' && el.id.trim() ? el.id : safeId('import'),
      type: el.type as LabelElement['type'],
      x: asNumber(el.x, 0),
      y: asNumber(el.y, 0),
      width: Math.max(0.1, asNumber(el.width, 10)),
      height: Math.max(0.1, asNumber(el.height, 5)),
      rotation: asNumber(el.rotation, 0),
      content: typeof el.content === 'string' ? el.content : '',
    };
    return normalized;
  });

  const seen = new Set<string>();
  const uniqueElements = normalizedElements.map(el => {
    if (!seen.has(el.id)) {
      seen.add(el.id);
      return el;
    }
    const next = { ...el, id: safeId('import') };
    seen.add(next.id);
    return next;
  });

  return {
    id: '',
    name: `Importado: ${String(tpl.name || sourceName).replace(/\.[^.]+$/, '').slice(0, 80)}`,
    category: tpl.category || 'GENERAL',
    type,
    dataSource: tpl.dataSource || 'NONE',
    isDefault: false,
    width,
    height,
    elements: uniqueElements,
    margins: tpl.margins,
    backgroundColor: tpl.backgroundColor || '#ffffff',
    snapEnabled: tpl.snapEnabled,
    gridSize: tpl.gridSize,
    showGrid: tpl.showGrid,
  };
}

export function createTemplatePackage(template: LabelTemplate): TemplatePackage {
  const normalized = sanitizeImportedTemplate({ ...template, id: '' }, template.name);
  return {
    app: 'SmartCloudERP',
    kind: 'label-template',
    version: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    template: {
      ...normalized,
      name: template.name || normalized.name,
      category: template.category || normalized.category,
      dataSource: template.dataSource || normalized.dataSource,
    },
  };
}

export function embedTemplatePackage(html: string, template: LabelTemplate): string {
  const payload = encodeBase64Utf8(JSON.stringify(createTemplatePackage(template)));
  const tag = `<script id="${PACKAGE_ID}" type="application/json" data-encoding="base64">${payload}</script>`;
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function extractHtmlPackage(text: string): unknown | null {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const node = doc.getElementById(PACKAGE_ID);
  if (!node) return null;
  const raw = node.textContent?.trim();
  if (!raw) return null;
  if (node.getAttribute('data-encoding') === 'base64') {
    return JSON.parse(decodeBase64Utf8(raw));
  }
  return JSON.parse(raw);
}

export function importTemplateFromText(text: string, sourceName = 'plantilla'): LabelTemplate {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('El archivo esta vacio.');

  const isHtml = /^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed) || /<script[^>]+smartcloud-label-template/i.test(trimmed);
  if (isHtml) {
    const packaged = extractHtmlPackage(trimmed);
    if (!packaged) {
      throw new Error('Este HTML no contiene datos editables de plantilla. Exportalo nuevamente desde esta version del sistema.');
    }
    return sanitizeImportedTemplate(packaged, sourceName);
  }

  try {
    return sanitizeImportedTemplate(JSON.parse(trimmed), sourceName);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('El archivo no es JSON valido ni HTML exportado por el disenador.');
    }
    throw err;
  }
}
