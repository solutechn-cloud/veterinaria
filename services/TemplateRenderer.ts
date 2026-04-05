
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { LabelTemplate, LabelElement, InvoiceColumn, SummaryRow, EmpresaConfig, Venta, DetalleVenta, Cliente, Reparacion, ProductoUnified } from '../types';
import { getLogoSync } from './logoLoader';

// ─── Scale constants ──────────────────────────────────────────────────────────
const MM_TO_PX = 3.7795;
const CM_TO_PX = 37.795;

// ─── Data context passed to the renderer ─────────────────────────────────────
export interface PrintDataContext {
  empresa?: Partial<EmpresaConfig>;
  venta?: Partial<Venta> & { detalles?: Partial<DetalleVenta>[] };
  cliente?: Partial<Cliente>;
  reparacion?: Partial<Reparacion>;
  producto?: Partial<ProductoUnified>;
  [key: string]: any;
}

// ─── Variable Resolution ──────────────────────────────────────────────────────

/** Flatten a nested object to dot-notation keys. Arrays are skipped (handled separately for tables). */
function flattenObject(obj: any, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  if (!obj || typeof obj !== 'object') return result;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val !== null && val !== undefined && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val, fullKey));
    } else if (!Array.isArray(val)) {
      result[fullKey] = val != null ? String(val) : '';
    }
  }
  return result;
}

/** Fields whose values should be formatted as DD/MM/YYYY (Spanish date). */
const DATE_FIELD_RE = /\b(fechaLimite|fechaVenta|fechaIngreso|fechaCreacion|fechaSalida|fecha_limite|fecha_venta|fechaFactura)\b/i;

/** Convert ISO / JS date string to DD/MM/YYYY. Returns original string if not a valid date. */
function formatSpanishDate(val: string): string {
  if (!val) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  // Use UTC getters for date-only strings (YYYY-MM-DD or with T00:00:00Z) to avoid timezone shift
  const isDateOnly = /^\d{4}-\d{2}-\d{2}(T00:00:00)?/.test(val);
  const day   = String(isDateOnly ? d.getUTCDate()        : d.getDate()).padStart(2, '0');
  const month = String(isDateOnly ? d.getUTCMonth() + 1   : d.getMonth() + 1).padStart(2, '0');
  const year  =        isDateOnly ? d.getUTCFullYear()     : d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Replace all {{key}} occurrences in content with values from the flattened context. */
export function resolveContent(content: string, ctx: PrintDataContext): string {
  const flat = flattenObject(ctx);
  return content.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const trimmed = path.trim();
    const val = flat[trimmed];
    if (val === undefined) return `{{${trimmed}}}`;
    // Format date fields as DD/MM/YYYY in Spanish
    if (DATE_FIELD_RE.test(trimmed)) return formatSpanishDate(val) || val;
    return val;
  });
}

// ─── Value Formatting ─────────────────────────────────────────────────────────

function formatValue(val: string, format: 'TEXT' | 'CURRENCY' | 'NUMBER'): string {
  if (!val && val !== '0') return '';
  if (format === 'CURRENCY') {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return `L. ${num.toFixed(2)}`;
  }
  if (format === 'NUMBER') {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return num.toLocaleString('es-HN');
  }
  return val;
}

// ─── Media Pre-rendering (barcodes and QR to data URLs) ───────────────────────

type MediaCache = Map<string, string>;

async function preRenderMedia(template: LabelTemplate, ctx: PrintDataContext): Promise<MediaCache> {
  const cache: MediaCache = new Map();

  for (const el of template.elements) {
    if (el.visible === false) continue;
    if (el.type === 'BARCODE') {
      const resolved = resolveContent(el.content || '123456', ctx);
      const safeContent = /{{.*?}}/.test(resolved) ? '123456' : resolved;
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, safeContent || '123456', {
          format: (el.barcodeFormat as any) || 'CODE128',
          displayValue: el.displayValue ?? true,
          margin: 0, width: 2, height: 50, fontSize: 20,
          lineColor: el.barcodeFgColor || '#000000',
          background: el.barcodeBgColor || '#ffffff',
        });
        cache.set(el.id, canvas.toDataURL('image/png'));
      } catch { /* element will render as placeholder */ }
    }

    if (el.type === 'QR') {
      const resolved = resolveContent(el.content || 'QR', ctx);
      const safeContent = /{{.*?}}/.test(resolved) ? 'DEMO-QR' : resolved;
      try {
        const url = await QRCode.toDataURL(safeContent || 'QR', {
          margin: 0,
          color: {
            dark: el.qrFgColor || '#000000',
            light: el.qrBgColor || '#ffffff',
          }
        });
        cache.set(el.id, url);
      } catch { /* element will render as placeholder */ }
    }
  }

  return cache;
}

// ─── Growing Container (Can Grow) ─────────────────────────────────────────────

interface GrowthInfo {
  overflowUnits: number;      // extra units beyond designed height
  actualHeightUnits: number;  // total actual height in document units
}

/**
 * Estimates the actual rendered height for a canGrow INVOICE_TABLE element.
 * Uses font size + padding to approximate each row's pixel height, then converts
 * back to document units (cm for DOCUMENT, mm for LABEL).
 */
function computeInvoiceTableGrowth(el: LabelElement, numRows: number, scale: number): GrowthInfo | null {
  const fSize     = el.tableFontSize || 8;   // px
  const rowHPx    = Math.ceil(fSize * 1.35) + 8; // line-height + top/bottom padding
  const actualPx  = rowHPx * (numRows + 1);  // +1 for header row
  const designedPx = el.height * scale;
  const overflowPx = Math.max(0, actualPx - designedPx);
  if (overflowPx === 0) return null;
  return {
    overflowUnits:      overflowPx / scale,
    actualHeightUnits:  el.height + overflowPx / scale,
  };
}

function computeSummaryBoxGrowth(el: LabelElement, scale: number): GrowthInfo | null {
  const numRows  = (el.summaryRows || []).length;
  const fSize    = el.summaryFontSize || 9;
  const rowHPx   = Math.ceil(fSize * 1.35) + 6;
  const actualPx  = rowHPx * numRows;
  const designedPx = el.height * scale;
  const overflowPx = Math.max(0, actualPx - designedPx);
  if (overflowPx === 0) return null;
  return {
    overflowUnits:      overflowPx / scale,
    actualHeightUnits:  el.height + overflowPx / scale,
  };
}

// ─── Element HTML Rendering ───────────────────────────────────────────────────

function elementToHTML(
  el: LabelElement,
  scale: number,
  ctx: PrintDataContext,
  media: MediaCache,
  tableItems?: Partial<DetalleVenta>[],
  yOffsetUnits: number = 0,
  heightOverrideUnits?: number,
): string {
  // Evaluate visibilityCondition if present
  if (el.visibilityCondition) {
    try {
      const expr = resolveContent(el.visibilityCondition, ctx);
      // Simple evaluation: replace == with === and eval
      const result = Function('"use strict"; return (' + expr.replace(/==/g, '===').replace(/!=/g, '!==') + ')')();
      if (!result) return '';
    } catch { /* if eval fails, show the element */ }
  }

  const left = el.x * scale;
  const top  = (el.y + yOffsetUnits) * scale;
  const w    = el.width * scale;
  const h    = (heightOverrideUnits ?? el.height) * scale;
  const rot  = el.rotation ? `rotate(${el.rotation}deg)` : '';
  const opa  = el.opacity ?? 1;

  const shadow = el.shadowEnabled
    ? `filter:drop-shadow(${el.shadowOffsetX ?? 2}px ${el.shadowOffsetY ?? 2}px ${el.shadowBlur ?? 4}px ${el.shadowColor ?? 'rgba(0,0,0,0.3)'});`
    : '';
  const base = `position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;transform:${rot};opacity:${opa};overflow:hidden;box-sizing:border-box;${shadow}`;

  // ── TEXT ─────────────────────────────────────────────────────────────────
  if (el.type === 'TEXT') {
    const resolved = resolveContent(el.content || '', ctx);
    const justifyMap: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
    const inner = `font-size:${el.fontSize || 10}pt;font-family:${el.fontFamily || 'Arial,sans-serif'};` +
      `font-weight:${el.fontWeight || 'normal'};font-style:${el.italic ? 'italic' : 'normal'};` +
      `text-decoration:${el.underline ? 'underline' : 'none'};color:${el.color || '#000'};` +
      `text-align:${el.textAlign || 'left'};white-space:${el.isMultiline ? 'pre-wrap' : 'nowrap'};` +
      `line-height:${el.lineHeight || 1.2};letter-spacing:${el.letterSpacing ? el.letterSpacing + 'px' : 'normal'};` +
      `background-color:${el.backgroundColor || 'transparent'};` +
      `width:100%;height:100%;display:flex;align-items:center;padding:0 2px;` +
      `justify-content:${justifyMap[el.textAlign || 'left'] || 'flex-start'};`;
    return `<div style="${base}"><div style="${inner}">${resolved}</div></div>`;
  }

  // ── SHAPE ────────────────────────────────────────────────────────────────
  if (el.type === 'SHAPE') {
    if (el.shapeType === 'LINE') {
      const lineH = el.strokeWidth || 1;
      return `<div style="${base}display:flex;align-items:center;">` +
        `<div style="width:100%;height:${lineH}px;background-color:${el.stroke || '#000'};"></div></div>`;
    }
    const clipPaths: Record<string, string> = {
      TRIANGLE_TL: 'polygon(0 0, 100% 0, 0 100%)',
      TRIANGLE_TR: 'polygon(0 0, 100% 0, 100% 100%)',
      TRIANGLE_BL: 'polygon(0 0, 0 100%, 100% 100%)',
      TRIANGLE_BR: 'polygon(100% 0, 100% 100%, 0 100%)',
      RHOMBUS: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
    };
    const clip = clipPaths[el.shapeType || ''];
    const radius = el.shapeType === 'CIRCLE' ? '50%' : (el.borderRadius ? `${el.borderRadius}px` : '0');
    const bg = el.gradientEnabled && el.gradientColor1 && el.gradientColor2
      ? (el.gradientType === 'radial'
          ? `radial-gradient(circle, ${el.gradientColor1}, ${el.gradientColor2})`
          : `linear-gradient(${el.gradientAngle ?? 135}deg, ${el.gradientColor1}, ${el.gradientColor2})`)
      : (el.fill === 'transparent' ? 'transparent' : (el.fill || 'transparent'));
    const inner = `width:100%;height:100%;background:${bg};` +
      (clip
        ? `clip-path:${clip};`
        : `border:${el.strokeWidth || 1}px solid ${el.stroke || '#000'};border-radius:${radius};`) +
      `box-sizing:border-box;`;
    return `<div style="${base}"><div style="${inner}"></div></div>`;
  }

  // ── IMAGE ────────────────────────────────────────────────────────────────
  if (el.type === 'IMAGE') {
    // Resolve variable references (e.g. {{empresa.logoBase64}})
    const imgSrc = /\{\{/.test(el.content || '') ? resolveContent(el.content || '', ctx) : (el.content || '');
    if (!imgSrc || /\{\{/.test(imgSrc)) return ''; // unresolved variable → skip
    return `<div style="${base}"><img src="${imgSrc}" style="width:100%;height:100%;object-fit:${el.imageObjectFit || 'contain'};" /></div>`;
  }

  // ── COMPANY_HEADER ────────────────────────────────────────────────────────
  if (el.type === 'COMPANY_HEADER') {
    const emp = ctx.empresa || {};
    const fs  = el.fontSize || 9;

    if (el.companyStyle === 'GEOMETRIC') {
      const logoSrc   = emp.logoBase64 || getLogoSync();
      const logoHtml  = logoSrc
        ? `<img src="${logoSrc}" style="height:72%;max-height:56px;max-width:56px;object-fit:contain;margin-right:12px;flex-shrink:0;" />`
        : '';

      const companyInfo =
        `<div style="font-weight:bold;font-size:${fs + 4}pt;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.5px;">${emp.nombreEmpresa || 'EMPRESA'}</div>` +
        (el.companyShowRTN !== false && emp.rtn ? `<div style="font-size:${fs}pt;color:rgba(255,255,255,0.88);">RTN: ${emp.rtn}</div>` : '') +
        (emp.direccion ? `<div style="font-size:${fs}pt;color:rgba(255,255,255,0.88);">${emp.direccion}</div>` : '') +
        (el.companyShowPhone !== false && emp.telefono ? `<div style="font-size:${fs}pt;color:rgba(255,255,255,0.88);">Tel: ${emp.telefono}${el.companyShowEmail && emp.correo ? ' | ' + emp.correo : ''}</div>` : '');

      const docTitle = el.companyDocTitle || '';
      const titleHtml = docTitle
        ? `<div style="text-align:right;color:#fff;flex-shrink:0;padding-left:10px;line-height:1;">
             <div style="font-size:${fs + 12}pt;font-weight:900;letter-spacing:3px;">${docTitle}</div>
           </div>`
        : '';

      return `<div style="${base}overflow:hidden;background:#1e3a8a;">` +
        `<div style="position:absolute;inset:0;background:#3b82f6;clip-path:polygon(0 0, 48% 0, 0 100%);"></div>` +
        `<div style="position:absolute;inset:0;display:flex;align-items:center;padding:8px 16px;box-sizing:border-box;">` +
          logoHtml +
          `<div style="flex:1;min-width:0;">${companyInfo}</div>` +
          titleHtml +
        `</div>` +
      `</div>`;
    }

    // PLAIN (default)
    const align = el.companyAlign || 'center';
    const col   = el.color || '#000000';
    const inner =
      `<div style="font-weight:bold;font-size:${fs + 2}pt;color:${col};">${emp.nombreEmpresa || ''}</div>` +
      (el.companyShowRTN !== false && emp.rtn ? `<div style="font-size:${fs}pt;color:${col};">RTN: ${emp.rtn}</div>` : '') +
      (emp.direccion ? `<div style="font-size:${fs}pt;color:${col};">${emp.direccion}</div>` : '') +
      (el.companyShowPhone !== false && emp.telefono ? `<div style="font-size:${fs}pt;color:${col};">Tel: ${emp.telefono}</div>` : '') +
      (el.companyShowEmail && emp.correo ? `<div style="font-size:${fs}pt;color:${col};">${emp.correo}</div>` : '');
    return `<div style="${base}text-align:${align};line-height:1.5;padding:2px;">${inner}</div>`;
  }

  // ── SUMMARY_BOX ───────────────────────────────────────────────────────────
  if (el.type === 'SUMMARY_BOX') {
    const rows  = el.summaryRows || [];
    const fSize = el.summaryFontSize || 9;
    const lCol  = el.summaryLabelColor || '#000';
    const vCol  = el.summaryValueColor || '#000';
    const bgCol = el.summaryBg || 'transparent';
    const rowsHTML = rows.map((row: SummaryRow) => {
      const sepLine = row.separator ? `<div style="border-top:1px solid #cbd5e1;margin:2px 0;"></div>` : '';
      const resolved = resolveContent(row.field, ctx);
      const formatted = formatValue(resolved, row.format);
      return sepLine +
        `<div style="display:flex;justify-content:space-between;padding:1px 4px;font-weight:${row.bold ? 'bold' : 'normal'};font-size:${fSize}pt;">` +
        `<span style="color:${lCol};">${row.label}</span>` +
        `<span style="color:${vCol};font-family:monospace;">${formatted}</span>` +
        `</div>`;
    }).join('');
    return `<div style="${base}background-color:${bgCol};">${rowsHTML}</div>`;
  }

  // ── BARCODE ──────────────────────────────────────────────────────────────
  if (el.type === 'BARCODE') {
    const src = media.get(el.id) || '';
    return `<div style="${base}display:flex;align-items:center;justify-content:center;">` +
      (src ? `<img src="${src}" style="width:100%;height:100%;object-fit:fill;" />` :
        `<span style="font-family:monospace;font-size:8pt;color:#555;">[BARCODE]</span>`) +
      `</div>`;
  }

  // ── QR ───────────────────────────────────────────────────────────────────
  if (el.type === 'QR') {
    const src = media.get(el.id) || '';
    return `<div style="${base}display:flex;align-items:center;justify-content:center;">` +
      (src ? `<img src="${src}" style="width:100%;height:100%;object-fit:contain;" />` :
        `<span style="font-size:7pt;color:#555;">[QR]</span>`) +
      `</div>`;
  }

  // ── INVOICE_TABLE ────────────────────────────────────────────────────────
  if (el.type === 'INVOICE_TABLE') {
    const cols  = el.tableColumns || [];
    const hBg   = el.tableHeaderBg || '#1e293b';
    const hCol  = el.tableHeaderColor || '#ffffff';
    const fSize = el.tableFontSize || 8;
    const altBg = el.tableAlternateBg || '#f8fafc';

    const thCells = cols.map(col =>
      `<th style="width:${col.widthPct}%;text-align:${col.align};padding:2px 4px;font-size:${fSize}px;font-weight:bold;overflow:hidden;border-right:1px solid rgba(255,255,255,0.2);">${col.header}</th>`
    ).join('');

    const rows = tableItems && tableItems.length > 0
      ? tableItems.map((item: any, ri) => {
          const bg = el.tableAlternateRows && ri % 2 === 1 ? altBg : '#fff';
          const tdCells = cols.map(col => {
            const fieldMatch = col.field.match(/\{\{item\.([^}]+)\}\}/);
            const rawVal    = fieldMatch ? String(item[fieldMatch[1]] ?? '') : resolveContent(col.field, ctx);
            const formatted = formatValue(rawVal, col.format);
            return `<td style="width:${col.widthPct}%;text-align:${col.align};padding:2px 4px;font-size:${fSize}px;overflow:hidden;">${formatted}</td>`;
          }).join('');
          return `<tr style="background-color:${bg};border-top:1px solid #e2e8f0;">${tdCells}</tr>`;
        }).join('')
      : [0, 1, 2].map((ri) => {
          const bg = el.tableAlternateRows && ri % 2 === 1 ? altBg : '#fff';
          const tdCells = cols.map(col =>
            `<td style="width:${col.widthPct}%;text-align:${col.align};padding:2px 4px;font-size:${fSize}px;color:#94a3b8;">` +
            `${col.format === 'CURRENCY' ? 'L. 0.00' : col.format === 'NUMBER' ? '0' : '···'}</td>`
          ).join('');
          return `<tr style="background-color:${bg};border-top:1px solid #e2e8f0;">${tdCells}</tr>`;
        }).join('');

    const tableStr = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;">` +
      `<thead><tr style="background-color:${hBg};color:${hCol};">${thCells}</tr></thead>` +
      `<tbody>${rows}</tbody></table>`;

    return `<div style="${base}overflow:visible;">${tableStr}</div>`;
  }

  return '';
}

// ─── Full Template → HTML ─────────────────────────────────────────────────────

function buildHTML(
  template: LabelTemplate,
  ctx: PrintDataContext,
  media: MediaCache,
): string {
  const scale    = template.type === 'DOCUMENT' ? CM_TO_PX : MM_TO_PX;
  const pageW    = template.width  * scale;
  const pageH    = template.height * scale;
  const bgColor  = template.backgroundColor || '#ffffff';
  const m        = template.margins;
  const padStyle = m
    ? `padding:${m.top * scale}px ${m.right * scale}px ${m.bottom * scale}px ${m.left * scale}px;`
    : '';
  const sizeCSS  = template.type === 'DOCUMENT'
    ? `${template.width}cm ${template.height}cm`
    : `${template.width}mm ${template.height}mm`;

  // Enrich sale items with computed fields for table rendering
  const rawItems = ctx.venta?.detalles as Partial<DetalleVenta>[] | undefined;
  const items = rawItems?.map(item => ({
    ...item,
    descripcion:    item.descripcionProducto || '',
    subtotalItem:   (item.cantidad || 0) * ((item.precioVenta || 0) / 1.15),
    isv:            (item.cantidad || 0) * ((item.precioVenta || 0) - (item.precioVenta || 0) / 1.15),
    total:          (item.cantidad || 0) * (item.precioVenta || 0),
  }));

  // ── PASS 1: Compute growth for canGrow elements ────────────────────────────
  const growthMap = new Map<string, GrowthInfo>();
  const visibleEls = template.elements.filter(e => e.visible !== false);

  for (const el of visibleEls) {
    if (!el.canGrow) continue;
    let info: GrowthInfo | null = null;
    if (el.type === 'INVOICE_TABLE') {
      info = computeInvoiceTableGrowth(el, items?.length || 0, scale);
    } else if (el.type === 'SUMMARY_BOX') {
      info = computeSummaryBoxGrowth(el, scale);
    }
    if (info) growthMap.set(el.id, info);
  }

  // ── PASS 2: Compute Y-offsets for elements below growers ──────────────────
  // Sort growers top-to-bottom so offsets accumulate correctly for stacked growers
  const growersSorted = [...growthMap.entries()]
    .map(([id, info]) => ({ id, info, el: visibleEls.find(e => e.id === id)! }))
    .filter(g => g.el)
    .sort((a, b) => a.el.y - b.el.y);

  const yOffsets = new Map<string, number>(); // elementId → extra Y in document units
  for (const { id: growerId, info, el: growerEl } of growersSorted) {
    const growerBottom = growerEl.y + growerEl.height;
    for (const el of visibleEls) {
      if (el.id === growerId) continue;
      // Push down any element whose top edge is at or below the grower's bottom edge
      if (el.y >= growerBottom) {
        yOffsets.set(el.id, (yOffsets.get(el.id) || 0) + info.overflowUnits);
      }
    }
  }

  // ── PASS 3: Total page height expansion ───────────────────────────────────
  const totalGrowthUnits = [...growthMap.values()].reduce((sum, g) => sum + g.overflowUnits, 0);
  const actualPageH = pageH + totalGrowthUnits * scale;

  // ── PASS 4: Render elements with growth-adjusted positions ────────────────
  const elementsHTML = visibleEls
    .map(el => elementToHTML(
      el, scale, ctx, media, items,
      yOffsets.get(el.id) || 0,
      growthMap.get(el.id)?.actualHeightUnits,
    ))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${template.name}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#e5e7eb; display:flex; justify-content:center; align-items:flex-start; min-height:100vh; padding:24px; font-family:Arial,sans-serif; }
    .page {
      width:${pageW}px;
      height:${actualPageH}px;
      background:${bgColor};
      position:relative;
      overflow:hidden;
      box-shadow:0 4px 24px rgba(0,0,0,0.18);
      ${padStyle}
    }
    @page { size: ${(template.width * scale).toFixed(1)}px ${actualPageH.toFixed(1)}px; margin: 0; }
    @media print {
      * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
      html, body { margin: 0; padding: 0; background: white !important; }
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; display:block; }
      .page { box-shadow: none !important; }
    }
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&family=Poppins:wght@400;600;700&family=Playfair+Display:wght@400;700&family=Raleway:wght@400;700&family=Oswald:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="page">
    ${elementsHTML}
  </div>
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render the template to an HTML string (for preview iframe).
 */
export async function renderToHTML(template: LabelTemplate, ctx: PrintDataContext = {}): Promise<string> {
  const media = await preRenderMedia(template, ctx);
  return buildHTML(template, ctx, media);
}

/**
 * Open a new browser window with the rendered template and trigger print dialog.
 */
export async function printTemplate(template: LabelTemplate, ctx: PrintDataContext = {}): Promise<void> {
  const media = await preRenderMedia(template, ctx);
  const html  = buildHTML(template, ctx, media);

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('Por favor permite ventanas emergentes para imprimir. (Busca el ícono de ventana bloqueada en la barra de tu navegador)');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
}

/**
 * Print multiple copies of the rendered template.
 */
export async function printMultipleCopies(template: LabelTemplate, ctx: PrintDataContext, copies: number): Promise<void> {
  const html = await renderToHTML(template, ctx);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : '';
  const head = html.replace(/<body[\s\S]*$/i, '</head>');
  const repeated = Array(copies).fill(bodyContent).join('<div style="page-break-after:always;"></div>');
  const multiHtml = `${head}<body style="margin:0;padding:0;">${repeated}</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(multiHtml);
  w.document.close();
  setTimeout(() => { w.print(); }, 600);
}

/**
 * Download the rendered template as an HTML file.
 * The user can open it in a browser and use Ctrl+P → "Save as PDF".
 */
export async function downloadHTML(template: LabelTemplate, ctx: PrintDataContext = {}): Promise<void> {
  const media = await preRenderMedia(template, ctx);
  const html  = buildHTML(template, ctx, media);
  const blob  = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `${(template.name || 'documento').replace(/[^a-zA-Z0-9-_]/g, '_')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
