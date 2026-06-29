import { LabelTemplate, DetalleVenta } from '../types';
import { PrintDataContext, resolveContent } from './templateRendererUtils';
import { MediaCache, preRenderMedia } from './templateRendererMedia';
import { GrowthInfo, computeInvoiceTableGrowth, computeReceiptItemsGrowth, computeSummaryBoxGrowth, computeTextGrowth } from './templateRendererGrowth';
import { elementToHTML } from './templateElementRenderer';
import { embedTemplatePackage } from './labelTemplatePackage';

export type { PrintDataContext };
export { resolveContent };

const MM_TO_PX = 3.7795;
const CM_TO_PX = 37.795;

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number): string {
  return `L. ${value.toFixed(2)}`;
}

function numberToSpanishWords(n: number): string {
  const units = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const tens = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const under100 = (x: number): string => {
    if (x < 10) return units[x];
    if (x < 20) return teens[x - 10];
    if (x === 20) return 'VEINTE';
    if (x < 30) return `VEINTI${units[x - 20]}`;
    const t = Math.floor(x / 10), u = x % 10;
    return `${tens[t]}${u ? ` Y ${units[u]}` : ''}`;
  };
  const under1000 = (x: number): string => {
    if (x === 100) return 'CIEN';
    const h = Math.floor(x / 100), r = x % 100;
    return `${hundreds[h]}${r ? ` ${under100(r)}` : ''}`.trim();
  };
  if (n === 0) return 'CERO';
  if (n < 100) return under100(n);
  if (n < 1000) return under1000(n);
  if (n < 1000000) {
    const th = Math.floor(n / 1000), r = n % 1000;
    const prefix = th === 1 ? 'MIL' : `${under1000(th)} MIL`;
    return `${prefix}${r ? ` ${under1000(r)}` : ''}`;
  }
  return String(n);
}

function totalInWords(total: number): string {
  const entero = Math.floor(total);
  const cents = Math.round((total - entero) * 100);
  return `${numberToSpanishWords(entero)} LEMPIRAS CON ${String(cents).padStart(2, '0')}/100`;
}

function buildFiscalSummary(venta: any, items: any[]) {
  const subtotalExento = items.reduce((s, item) => s + toNumber(item.subtotalExento), 0);
  const subtotalGravado15 = items.reduce((s, item) => s + (String(item.tipoIsv) === '15' ? toNumber(item.subtotalGravado) : 0), 0);
  const subtotalGravado18 = items.reduce((s, item) => s + (String(item.tipoIsv) === '18' ? toNumber(item.subtotalGravado) : 0), 0);
  const isv15 = items.reduce((s, item) => s + (String(item.tipoIsv) === '15' ? toNumber(item.isvLinea ?? item.isv) : 0), 0);
  const isv18 = items.reduce((s, item) => s + (String(item.tipoIsv) === '18' ? toNumber(item.isvLinea ?? item.isv) : 0), 0);
  const descuento = toNumber(venta?.descuento);
  const total = toNumber(venta?.total) || items.reduce((s, item) => s + toNumber(item.total), 0);
  const subtotal = Math.max(0, total - isv15 - isv18 + descuento);
  const rows: [string, number][] = [
    ['SUB TOTAL', subtotal],
    ['DESCUENTO', descuento],
    ['IMPORTE EXENTO', subtotalExento],
    ['IMPORTE EXONERADO', 0],
    ['IMPORTE GRAVADO 15%', subtotalGravado15],
    ['IMPORTE GRAVADO 18%', subtotalGravado18],
    ['ISV 15%', isv15 || toNumber(venta?.isv)],
    ['ISV 18%', isv18],
    ['TOTAL', total],
  ];
  const width = 42;
  return {
    subtotal: money(subtotal),
    subtotalExento: money(subtotalExento),
    subtotalExonerado: money(0),
    subtotalGravado15: money(subtotalGravado15),
    subtotalGravado18: money(subtotalGravado18),
    isv15: money(isv15 || toNumber(venta?.isv)),
    isv18: money(isv18),
    descuento: money(descuento),
    total: money(total),
    totalLetras: totalInWords(total),
    numeroItems: String(items.length),
    resumenFiscal: rows.map(([label, value]) => `${label.padEnd(25, ' ')}${money(value).padStart(width - 25, ' ')}`).join('\n'),
  };
}

function buildHTML(
  template: LabelTemplate,
  ctx: PrintDataContext,
  media: MediaCache,
): string {
  const scale   = template.type === 'DOCUMENT' ? CM_TO_PX : MM_TO_PX;
  const pageW   = template.width  * scale;
  const pageH   = template.height * scale;
  const bgColor = template.backgroundColor || '#ffffff';
  const m       = template.margins;
  const padStyle = m
    ? `padding:${m.top * scale}px ${m.right * scale}px ${m.bottom * scale}px ${m.left * scale}px;`
    : '';

  const rawItems = ctx.venta?.detalles as Partial<DetalleVenta>[] | undefined;
  const items = rawItems?.map(item => ({
    ...item,
    codigo:       item.id_medicamento || item.codDetalleVenta || '',
    descripcion:  item.descripcionProducto || '',
    subtotalItem: toNumber((item as any).subtotalGravado || (item as any).subtotalExento) || (toNumber(item.cantidad) * (toNumber(item.precioVenta) / 1.15)),
    isv:          toNumber((item as any).isvLinea) || (String((item as any).tipoIsv) === 'exento' ? 0 : toNumber(item.cantidad) * (toNumber(item.precioVenta) - toNumber(item.precioVenta) / 1.15)),
    total:        toNumber(item.cantidad) * toNumber(item.precioVenta),
  }));
  const renderCtx = {
    ...ctx,
    fiscal: buildFiscalSummary(ctx.venta, items || []),
  };

  const growthMap = new Map<string, GrowthInfo>();
  const visibleEls = template.elements.filter(e => e.visible !== false);

  for (const el of visibleEls) {
    const structuralCanGrow = (
      el.type === 'INVOICE_TABLE' ||
      el.type === 'SUMMARY_BOX' ||
      el.type === 'RECEIPT_ITEMS'
    ) && el.canGrow !== false;
    const textCanGrow = el.type === 'TEXT' && (el.canGrow || el.isStretchWithOverflow);
    if (!structuralCanGrow && !textCanGrow) continue;
    let info: GrowthInfo | null = null;
    if (el.type === 'INVOICE_TABLE') {
      info = computeInvoiceTableGrowth(el, items || 0, scale, renderCtx);
    } else if (el.type === 'RECEIPT_ITEMS') {
      info = computeReceiptItemsGrowth(el, items, scale);
    } else if (el.type === 'TEXT' && textCanGrow) {
      info = computeTextGrowth(el, scale, renderCtx);
    } else if (el.type === 'SUMMARY_BOX') {
      info = computeSummaryBoxGrowth(el, scale);
    }
    if (info) growthMap.set(el.id, info);
  }

  const growersSorted = [...growthMap.entries()]
    .map(([id, info]) => ({ id, info, el: visibleEls.find(e => e.id === id)! }))
    .filter(g => g.el)
    .sort((a, b) => a.el.y - b.el.y);

  const yOffsets = new Map<string, number>();
  for (const { id: growerId, info, el: growerEl } of growersSorted) {
    const growerBottom = growerEl.y + growerEl.height;
    for (const el of visibleEls) {
      if (el.id === growerId) continue;
      if (el.y >= growerBottom) {
        yOffsets.set(el.id, (yOffsets.get(el.id) || 0) + info.overflowUnits);
      }
    }
  }

  const actualPageUnits = visibleEls.reduce((max, el) => {
    const yOffset = yOffsets.get(el.id) || 0;
    const height = growthMap.get(el.id)?.actualHeightUnits ?? el.height;
    return Math.max(max, el.y + yOffset + height);
  }, template.height);
  const actualPageH = Math.ceil(Math.max(pageH, actualPageUnits * scale));

  const elementsHTML = visibleEls
    .map(el => elementToHTML(
      el, scale, renderCtx, media, items,
      yOffsets.get(el.id) || 0,
      growthMap.get(el.id)?.actualHeightUnits,
    ))
    .join('\n');

  const runtimeLayoutScript = `
<script>
(function () {
  function pxVar(el, name) {
    var raw = getComputedStyle(el).getPropertyValue(name);
    var n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function measuredHeight(el, baseHeight) {
    var rootRect = el.getBoundingClientRect();
    var actual = Math.max(baseHeight, el.scrollHeight, el.offsetHeight);
    Array.prototype.forEach.call(el.children || [], function (child) {
      var childRect = child.getBoundingClientRect();
      actual = Math.max(actual, childRect.bottom - rootRect.top);
    });
    return Math.ceil(actual + 4);
  }

  function layoutLabelTemplate() {
    var page = document.querySelector('.page');
    if (!page) return;
    var elements = Array.prototype.slice.call(page.children)
      .filter(function (el) {
        return el instanceof HTMLElement && getComputedStyle(el).position === 'absolute';
      })
      .map(function (el) {
        return {
          el: el,
          baseTop: pxVar(el, '--ld-base-top'),
          baseHeight: pxVar(el, '--ld-base-height'),
          canGrow: pxVar(el, '--ld-can-grow') === 1
        };
      })
      .sort(function (a, b) { return a.baseTop - b.baseTop; });

    var growers = [];
    elements.forEach(function (item) {
      var offset = growers.reduce(function (sum, grower) {
        return item.baseTop >= grower.baseBottom - 0.5 ? sum + grower.overflow : sum;
      }, 0);
      var top = item.baseTop + offset;
      item.el.style.top = top + 'px';
      item.el.style.height = item.baseHeight + 'px';
      if (item.canGrow) {
        var actualHeight = measuredHeight(item.el, item.baseHeight);
        item.el.style.height = actualHeight + 'px';
        var overflow = Math.max(0, actualHeight - item.baseHeight);
        if (overflow > 0.5) {
          growers.push({
            baseBottom: item.baseTop + item.baseHeight,
            overflow: overflow
          });
        }
      }
    });

    var maxBottom = elements.reduce(function (max, item) {
      var top = parseFloat(item.el.style.top || '0') || 0;
      var height = measuredHeight(item.el, parseFloat(item.el.style.height || '0') || item.baseHeight);
      return Math.max(max, top + height);
    }, page.clientHeight);
    page.style.height = Math.ceil(maxBottom + 8) + 'px';
  }

  window.__layoutLabelTemplate = layoutLabelTemplate;
  function scheduleLayout() {
    requestAnimationFrame(function () {
      requestAnimationFrame(layoutLabelTemplate);
    });
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleLayout);
  } else {
    scheduleLayout();
  }
  window.addEventListener('load', scheduleLayout);
})();
</script>`;

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
  ${runtimeLayoutScript}
</body>
</html>`;
}

export async function renderToHTML(template: LabelTemplate, ctx: PrintDataContext = {}): Promise<string> {
  const media = await preRenderMedia(template, ctx);
  return buildHTML(template, ctx, media);
}

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
  win.onload = () => { win.focus(); win.print(); };
}

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

export async function downloadAsPDF(
  template: LabelTemplate,
  ctx: PrintDataContext = {},
  filename?: string,
): Promise<void> {
  const media  = await preRenderMedia(template, ctx);
  const html   = buildHTML(template, ctx, media);
  const scale  = template.type === 'DOCUMENT' ? CM_TO_PX : MM_TO_PX;
  const pageW  = template.width  * scale;
  const pageH  = template.height * scale;

  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = `position:fixed;left:-9999px;top:0;width:${pageW + 60}px;height:${pageH * 3 + 1200}px;border:none;visibility:hidden;`;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      setTimeout(async () => {
        try {
          const iframeDoc = iframe.contentDocument;
          if (!iframeDoc) throw new Error('No se pudo acceder al iframe');
          const fontReady = (iframeDoc as any).fonts?.ready;
          if (fontReady) await fontReady;
          const runtimeLayout = (iframe.contentWindow as any).__layoutLabelTemplate;
          if (typeof runtimeLayout === 'function') {
            runtimeLayout();
            await new Promise<void>((rafResolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => rafResolve()));
            });
          }
          const pageEl = iframeDoc.querySelector('.page') as HTMLElement;
          if (!pageEl) throw new Error('Elemento .page no encontrado en la plantilla');
          const captureHeight = Math.max(pageEl.offsetHeight, pageEl.scrollHeight);
          const html2canvas = (await import('html2canvas')).default;
          const canvas = await html2canvas(pageEl, {
            scale: 2, useCORS: true, allowTaint: true, logging: false,
            backgroundColor: template.backgroundColor || '#ffffff',
            width: pageEl.offsetWidth, height: captureHeight,
          });
          const imgData = canvas.toDataURL('image/jpeg', 0.95);
          const unitToPt = template.type === 'DOCUMENT' ? 28.3465 : 2.8346;
          const widthPt  = template.width  * unitToPt;
          const heightPt = (canvas.height / 2) / scale * unitToPt;
          const { jsPDF } = await import('jspdf');
          const pdf = new jsPDF({
            orientation: widthPt >= heightPt ? 'landscape' : 'portrait',
            unit: 'pt',
            format: [widthPt, heightPt],
          });
          pdf.addImage(imgData, 'JPEG', 0, 0, widthPt, heightPt, undefined, 'FAST');
          const safeName = (filename || template.name || 'documento').replace(/[^a-zA-Z0-9-_]/g, '_');
          pdf.save(`${safeName}.pdf`);
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          document.body.removeChild(iframe);
        }
      }, 250);
    };

    iframe.onerror = () => {
      document.body.removeChild(iframe);
      reject(new Error('Error al cargar la plantilla en el iframe'));
    };

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    iframe.src = blobUrl;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  });
}

export async function downloadHTML(template: LabelTemplate, ctx: PrintDataContext = {}): Promise<void> {
  const media = await preRenderMedia(template, ctx);
  const html  = embedTemplatePackage(buildHTML(template, ctx, media), template);
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
