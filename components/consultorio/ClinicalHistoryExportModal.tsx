import React, { useState } from 'react';
import { FileDown, Printer, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { ConfigService, ConsultorioService } from '../../services/api';
import type { ConsultorioEvento, EmpresaConfig, Paciente } from '../../types';

type ClinicalHistoryExportModalProps = {
  patient: Paciente & Record<string, any>;
  onClose: () => void;
};

type ReportData = {
  company: Partial<EmpresaConfig>;
  events: ConsultorioEvento[];
};

const TYPE_COLORS: Record<string, string> = {
  consulta: '#2563eb',
  vacuna: '#16a34a',
  formula: '#7c3aed',
  desparasitacion: '#0d9488',
  laboratorio: '#9333ea',
  imagenologia: '#0284c7',
  cirugia: '#dc2626',
  hospitalizacion: '#ea580c',
  documento: '#475569',
  remision: '#0891b2',
  seguimiento: '#0f766e',
  cita: '#4f46e5',
  mensaje: '#64748b',
};

const LABELS: Record<string, string> = {
  fecha_fin: 'Fecha fin',
  proxima_dosis: 'Proxima dosis',
  id_lote: 'Lote',
  correo_destino: 'Correo destino',
  fecha_envio: 'Fecha envio',
  tipo_recordatorio: 'Tipo recordatorio',
  pruebas: 'Pruebas de laboratorio',
  medicamentos: 'Medicamentos recetados',
  profesional: 'Profesional',
  diagnostico: 'Diagnostico',
  observaciones: 'Observaciones',
  resumen_historial: 'Resumen',
};

export async function printClinicalEvent(patient: Paciente & Record<string, any>, event: ConsultorioEvento) {
  const company = (await ConfigService.get().catch(() => ({}))) || {};
  const printWindow = window.open('', '_blank', 'width=920,height=780');
  if (!printWindow) throw new Error('El navegador bloqueo la ventana de impresion.');
  printWindow.document.write(buildSingleEventPrintHtml(patient, event, company));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 450);
}

export function ClinicalHistoryExportModal({ patient, onClose }: ClinicalHistoryExportModalProps) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [loading, setLoading] = useState(false);

  const loadEvents = async () => {
    const pageSize = 120;
    const collected: ConsultorioEvento[] = [];
    for (let offset = 0; offset < 1200; offset += pageSize) {
      const page = await ConsultorioService.getTimeline(patient.id_paciente, { tipo: 'historia', limit: pageSize, offset });
      collected.push(...page);
      if (page.length < pageSize) break;
    }
    const start = desde ? new Date(`${desde}T00:00:00`).getTime() : null;
    const end = hasta ? new Date(`${hasta}T23:59:59`).getTime() : null;
    return collected.filter(event => {
      const ts = new Date(event.fecha_evento).getTime();
      return (!start || ts >= start) && (!end || ts <= end);
    });
  };

  const loadReportData = async (): Promise<ReportData> => {
    const [events, company] = await Promise.all([
      loadEvents(),
      ConfigService.get().catch(() => ({})),
    ]);
    return { events, company: company || {} };
  };

  const exportPdf = async () => {
    setLoading(true);
    try {
      const report = await loadReportData();
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      writePdf(doc, patient, report, { desde, hasta });
      doc.save(`historia-clinica-${safeName(patient.nombre)}.pdf`);
    } catch (error: any) {
      Swal.fire('No se pudo exportar', error.message || 'Intente de nuevo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const printHistory = async () => {
    setLoading(true);
    try {
      const report = await loadReportData();
      const printWindow = window.open('', '_blank', 'width=1120,height=780');
      if (!printWindow) throw new Error('El navegador bloqueo la ventana de impresion.');
      printWindow.document.write(buildPrintHtml(patient, report, { desde, hasta }));
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => printWindow.print(), 450);
    } catch (error: any) {
      Swal.fire('No se pudo imprimir', error.message || 'Intente de nuevo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <section className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">{patient.nombre} <span className="text-sm font-normal text-slate-400">Exportar historia clínica</span></h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </header>
        <div className="space-y-5 px-6 py-5">
          <label className="block text-sm font-normal text-indigo-900/70">
            Formato
            <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200">
              <option>PDF profesional / impresión</option>
            </select>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-normal text-indigo-900/70">
              Registros desde
              <input type="date" value={desde} onChange={event => setDesde(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" />
              <span className="mt-1 block text-xs text-slate-400">Opcional</span>
            </label>
            <label className="block text-sm font-normal text-indigo-900/70">
              Registros hasta
              <input type="date" value={hasta} onChange={event => setHasta(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200" />
              <span className="mt-1 block text-xs text-slate-400">Opcional</span>
            </label>
          </div>
        </div>
        <footer className="flex flex-col gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600">Cancelar</button>
          <button type="button" disabled={loading} onClick={printHistory} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60">
            <Printer size={16} /> Imprimir
          </button>
          <button type="button" disabled={loading} onClick={exportPdf} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 disabled:opacity-60">
            <FileDown size={16} /> {loading ? 'Generando...' : 'Generar'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function writePdf(doc: any, patient: any, report: ReportData, range: { desde?: string; hasta?: string }) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 38;
  let y = drawPdfCoverHeader(doc, patient, report.company, range);
  y = drawPdfPatientSummary(doc, patient, report.company, y);
  y = drawPdfStats(doc, report.events, y);
  y = drawPdfTimeline(doc, report.events, y, margin, width, height, patient);
  drawPdfFooters(doc, report.company);
}

function drawPdfCoverHeader(doc: any, patient: any, company: Partial<EmpresaConfig>, range: any) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...rgb('#111827')); doc.rect(0, 0, width, 114, 'F');
  doc.setFillColor(...rgb('#14b8a6')); doc.rect(0, 110, width, 4, 'F');
  if (company.logoBase64) addImageSafe(doc, company.logoBase64, 38, 26, 70, 52);
  else drawInitialBadge(doc, company.nombreEmpresa || 'VetCare ERP', 38, 26, 52, '#14b8a6');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text(company.nombreEmpresa || 'Clínica veterinaria', 122, 42);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  wrap(doc, [company.direccion, company.telefono, company.correo, company.rtn ? `RTN: ${company.rtn}` : ''].filter(Boolean).join('  |  '), 122, 58, 300, 10);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('Historia clínica veterinaria', width - 38, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`Paciente: ${patient.nombre || 'N/D'}`, width - 38, 60, { align: 'right' });
  doc.text(`Rango: ${range.desde || 'inicio'} al ${range.hasta || 'actualidad'}`, width - 38, 75, { align: 'right' });
  doc.text(`Generado: ${formatDate(new Date().toISOString())}`, width - 38, 90, { align: 'right' });
  doc.setTextColor(15, 23, 42);
  return 138;
}

function drawPdfPatientSummary(doc: any, patient: any, company: Partial<EmpresaConfig>, y: number) {
  const x = 38;
  const w = 536;
  drawCard(doc, x, y, w, 180, '#f8fafc', '#dbeafe');
  if (patient.foto_base64) addImageSafe(doc, patient.foto_base64, x + 18, y + 22, 86, 86);
  else drawInitialBadge(doc, patient.nombre || 'P', x + 18, y + 22, 86, '#ccfbf1');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...rgb('#0f172a'));
  doc.text(patient.nombre || 'Paciente sin nombre', x + 120, y + 36);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...rgb('#64748b'));
  doc.text([patient.especie, patient.raza, patient.sexo].filter(Boolean).join('  ·  ') || 'Datos de especie no registrados', x + 120, y + 54);
  drawMiniField(doc, 'Edad', ageText(patient.fecha_nacimiento), x + 120, y + 78);
  drawMiniField(doc, 'Peso', patient.peso_actual ? `${patient.peso_actual} kg` : 'N/D', x + 235, y + 78);
  drawMiniField(doc, 'Codigo paciente', patient.microchip || 'N/D', x + 350, y + 78);
  drawMiniField(doc, 'Estado reproductivo', patient.estado_reproductivo || 'N/D', x + 120, y + 117);
  drawMiniField(doc, 'Color', patient.color || 'N/D', x + 300, y + 117);
  drawPdfInfoBlock(doc, 'Tutor principal', [
    ['Nombre', patient.tutorNombre],
    ['Teléfono', patient.tutorTelefono],
    ['Correo', patient.tutorSinCorreo ? 'Sin correo' : patient.tutorCorreo],
    ['Dirección', [patient.tutorCiudad, patient.tutorDepartamento, patient.tutorDireccion].filter(Boolean).join(', ')],
  ], x + 18, y + 128, 245);
  drawPdfInfoBlock(doc, 'Datos clínicos clave', [
    ['Alergias', patient.alergias],
    ['Condiciones crónicas', patient.condiciones_cronicas],
    ['Contacto autorizado', [patient.contactoAutorizadoNombre, patient.contactoAutorizadoTelefono].filter(Boolean).join(' - ')],
    ['Empresa', company.nombreEmpresa],
  ], x + 282, y + 128, 236);
  return y + 202;
}

function drawPdfStats(doc: any, events: ConsultorioEvento[], y: number) {
  const counts = eventCounts(events);
  const entries = Object.entries(counts).slice(0, 6);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...rgb('#0f172a'));
  doc.text('Resumen clínico del periodo', 38, y);
  y += 12;
  const labels: Array<[string, number]> = entries.length ? entries : [['registros', events.length]];
  labels.forEach(([key, total], i) => {
    const x = 38 + i * 88;
    doc.setFillColor(...rgb(i % 2 ? '#eef2ff' : '#ecfeff')); doc.roundedRect(x, y, 78, 42, 10, 10, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...rgb('#312e81'));
    doc.text(String(total), x + 12, y + 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...rgb('#64748b'));
    doc.text(labelize(key), x + 12, y + 32, { maxWidth: 56 });
  });
  return y + 66;
}

function drawPdfTimeline(doc: any, events: ConsultorioEvento[], y: number, margin: number, width: number, height: number, patient: any) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...rgb('#0f172a'));
  doc.text('Línea de tiempo clínica', margin, y);
  y += 18;
  if (!events.length) {
    drawCard(doc, margin, y, width - margin * 2, 82, '#f8fafc', '#e2e8f0');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...rgb('#64748b'));
    doc.text('No hay registros clínicos en el rango seleccionado.', margin + 20, y + 42);
    return y + 98;
  }
  events.forEach(event => {
    const details = eventLines(event);
    const lines = details.flatMap(line => doc.splitTextToSize(line, 438)).slice(0, 22);
    const cardH = Math.max(78, 55 + lines.length * 10 + attachmentLines(event).length * 10);
    if (y + cardH > height - 58) {
      doc.addPage();
      drawPageMiniHeader(doc, patient);
      y = 68;
    }
    const color = TYPE_COLORS[event.tipo] || '#4f46e5';
    drawCard(doc, margin, y, width - margin * 2, cardH, '#ffffff', '#e2e8f0');
    doc.setFillColor(...rgb(color)); doc.roundedRect(margin, y, 5, cardH, 4, 4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...rgb(color));
    doc.text(event.tipoLabel || labelize(event.tipo), margin + 18, y + 20);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...rgb('#64748b'));
    doc.text(formatDate(event.fecha_evento), width - margin - 14, y + 20, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...rgb('#0f172a'));
    wrap(doc, event.titulo || event.tipoLabel || 'Registro clínico', margin + 18, y + 37, 360, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3); doc.setTextColor(...rgb('#475569'));
    let lineY = y + 56;
    lines.forEach(line => { doc.text(line, margin + 18, lineY); lineY += 10; });
    attachmentLines(event).forEach(line => {
      doc.setTextColor(...rgb('#2563eb'));
      doc.text(line, margin + 18, lineY);
      lineY += 10;
    });
    y += cardH + 12;
  });
  return y;
}

function drawPdfFooters(doc: any, company: Partial<EmpresaConfig>) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...rgb('#e2e8f0')); doc.line(38, height - 36, width - 38, height - 36);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...rgb('#64748b'));
    doc.text(company.nombreEmpresa || 'Clínica veterinaria', 38, height - 20);
    doc.text(`Página ${page} de ${pages}`, width - 38, height - 20, { align: 'right' });
  }
}

function buildPrintHtml(patient: any, report: ReportData, range: { desde?: string; hasta?: string }) {
  const company = report.company || {};
  const counts = eventCounts(report.events);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Historia clínica ${escapeHtml(patient.nombre)}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:Inter,Arial,sans-serif;color:#172033;margin:0;background:#eef6fb}
    .page{width:920px;margin:24px auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.12)}
    .hero{background:linear-gradient(135deg,#101827,#274072);color:#fff;padding:28px 36px;display:grid;grid-template-columns:1fr auto;gap:20px;border-bottom:5px solid #14b8a6}
    .brand{display:flex;gap:16px;align-items:center}.logo,.pet{width:76px;height:76px;border-radius:18px;background:#e0f2fe;display:grid;place-items:center;color:#0f766e;font-weight:800;font-size:24px}
    .pet{object-fit:cover}.logo{object-fit:contain;padding:8px}
    .hero h1{font-size:26px;margin:0 0 8px}.hero p{margin:3px 0;color:#dbeafe;font-size:12px}.doc{text-align:right}
    .content{padding:30px 36px}.section{margin-bottom:22px}.section-title{font-size:16px;font-weight:800;margin:0 0 12px;color:#0f172a}
    .patient-card{border:1px solid #dbeafe;background:#f8fafc;border-radius:22px;padding:20px;display:grid;grid-template-columns:96px 1fr;gap:18px}
    .patient-card h2{margin:0;font-size:24px}.muted{color:#64748b;font-size:12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}
    .metric,.info{border:1px solid #e2e8f0;background:#fff;border-radius:15px;padding:11px}.label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:700}.value{font-size:13px;color:#172033;margin-top:3px}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.alert{border-color:#fde68a;background:#fffbeb}.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
    .stat{border-radius:16px;background:#eef2ff;padding:12px}.stat b{display:block;font-size:20px;color:#3730a3}.stat span{font-size:11px;color:#64748b}
    .event{position:relative;border:1px solid #e2e8f0;border-radius:18px;padding:16px 18px 16px 24px;margin:12px 0;break-inside:avoid;background:#fff}
    .event:before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;border-radius:18px 0 0 18px;background:var(--c,#4f46e5)}
    .event-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.pill{color:var(--c,#4f46e5);font-size:11px;font-weight:800;text-transform:uppercase}.date{color:#64748b;font-size:11px}
    .event h3{font-size:15px;margin:6px 0 10px}.event pre{white-space:pre-wrap;font-family:inherit;margin:0;color:#475569;font-size:12px;line-height:1.45}
    .event .field{margin:0 0 8px;font-size:12px;color:#475569;line-height:1.5}
    .meds{width:100%;border-collapse:collapse;margin:6px 0 10px}.meds th,.meds td{border:1px solid #e2e8f0;padding:7px 9px;font-size:11.5px;text-align:left}.meds th{background:#f1f5f9;color:#334155;font-weight:700}
    .attachments{margin-top:10px;color:#2563eb;font-size:12px}.empty{padding:28px;border:1px dashed #cbd5e1;border-radius:18px;color:#64748b;text-align:center;background:#f8fafc}
    @media print{body{background:#fff}.page{width:auto;margin:0;border-radius:0;box-shadow:none}.hero,.event,.patient-card,.metric,.info,.stat{break-inside:avoid}}
  </style></head><body><main class="page">
    <header class="hero">
      <div class="brand">${imageOrInitial(company.logoBase64, company.nombreEmpresa || 'VetCare', 'logo')}
        <div><h1>${escapeHtml(company.nombreEmpresa || 'Clínica veterinaria')}</h1>
          <p>${escapeHtml([company.direccion, company.telefono, company.correo].filter(Boolean).join(' · '))}</p>
          <p>${company.rtn ? `RTN: ${escapeHtml(company.rtn)}` : ''}</p>
        </div>
      </div>
      <div class="doc"><h1>Historia clínica</h1><p>${escapeHtml(patient.nombre || 'Paciente')}</p><p>Rango: ${escapeHtml(range.desde || 'inicio')} al ${escapeHtml(range.hasta || 'actualidad')}</p><p>Generado: ${escapeHtml(formatDate(new Date().toISOString()))}</p></div>
    </header>
    <section class="content">
      <section class="section patient-card">${imageOrInitial(patient.foto_base64, patient.nombre || 'P', 'pet')}
        <div><h2>${escapeHtml(patient.nombre || 'Paciente sin nombre')}</h2><div class="muted">${escapeHtml([patient.especie, patient.raza, patient.sexo].filter(Boolean).join(' · ') || 'Datos generales no registrados')}</div>
          <div class="grid">${printField('Edad', ageText(patient.fecha_nacimiento))}${printField('Peso', patient.peso_actual ? `${patient.peso_actual} kg` : 'N/D')}${printField('Codigo paciente', patient.microchip || 'N/D')}${printField('Color', patient.color || 'N/D')}${printField('Estado reproductivo', patient.estado_reproductivo || 'N/D')}${printField('Estado', patient.estado || 'Activo')}</div>
        </div>
      </section>
      <section class="section two">
        <div class="info"><h3 class="section-title">Tutor principal</h3>${infoRows([['Nombre', patient.tutorNombre], ['Teléfono', patient.tutorTelefono], ['Correo', patient.tutorSinCorreo ? 'Sin correo' : patient.tutorCorreo], ['Dirección', [patient.tutorCiudad, patient.tutorDepartamento, patient.tutorDireccion].filter(Boolean).join(', ')], ['Contacto autorizado', [patient.contactoAutorizadoNombre, patient.contactoAutorizadoTelefono].filter(Boolean).join(' - ')]])}</div>
        <div class="info alert"><h3 class="section-title">Alertas clínicas</h3>${infoRows([['Alergias', patient.alergias], ['Condiciones crónicas', patient.condiciones_cronicas], ['Observaciones', patient.condiciones_cronicas || patient.alergias ? 'Revisar antes de medicar o programar procedimientos.' : 'Sin alertas registradas.']])}</div>
      </section>
      <section class="section"><h3 class="section-title">Resumen del periodo</h3><div class="stats">${statsHtml(counts, report.events.length)}</div></section>
      <section class="section"><h3 class="section-title">Registros clínicos</h3>${report.events.length ? report.events.map(eventHtml).join('') : '<div class="empty">No hay registros clínicos en el rango seleccionado.</div>'}</section>
    </section>
  </main></body></html>`;
}

function buildSingleEventPrintHtml(patient: any, event: ConsultorioEvento, company: Partial<EmpresaConfig>) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(event.tipoLabel || labelize(event.tipo))} - ${escapeHtml(patient.nombre)}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:Inter,Arial,sans-serif;color:#172033;margin:0;background:#eef6fb}
    .page{width:720px;margin:24px auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.12)}
    .hero{background:linear-gradient(135deg,#101827,#274072);color:#fff;padding:26px 32px;display:grid;grid-template-columns:1fr auto;gap:20px;border-bottom:5px solid #14b8a6}
    .brand{display:flex;gap:16px;align-items:center}.logo{width:64px;height:64px;border-radius:16px;background:#e0f2fe;object-fit:contain;padding:6px;display:grid;place-items:center;color:#0f766e;font-weight:800;font-size:20px}
    .hero h1{font-size:20px;margin:0 0 6px}.hero p{margin:2px 0;color:#dbeafe;font-size:11px}.doc{text-align:right}
    .content{padding:26px 32px}
    .patient-strip{display:flex;justify-content:space-between;gap:16px;border:1px solid #dbeafe;background:#f8fafc;border-radius:18px;padding:14px 18px;margin-bottom:20px}
    .patient-strip h2{margin:0;font-size:18px}.muted{color:#64748b;font-size:12px;margin-top:2px}
    .event{position:relative;border:1px solid #e2e8f0;border-radius:18px;padding:20px 22px 20px 28px;background:#fff}
    .event:before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;border-radius:18px 0 0 18px;background:var(--c,#4f46e5)}
    .event-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.pill{color:var(--c,#4f46e5);font-size:12px;font-weight:800;text-transform:uppercase}.date{color:#64748b;font-size:12px}
    .event h3{font-size:17px;margin:8px 0 12px}.event pre{white-space:pre-wrap;font-family:inherit;margin:0;color:#334155;font-size:13px;line-height:1.55}
    .event .field{margin:0 0 10px;font-size:13px;color:#334155;line-height:1.5}
    .meds{width:100%;border-collapse:collapse;margin:6px 0 12px}.meds th,.meds td{border:1px solid #e2e8f0;padding:8px 10px;font-size:12.5px;text-align:left}.meds th{background:#f1f5f9;color:#334155;font-weight:700}
    .attachments{margin-top:12px;color:#2563eb;font-size:12px}
    .sign{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:24px;text-align:center}.sign div{border-top:1px solid #94a3b8;padding-top:6px;font-size:11px;color:#64748b}
    @media print{body{background:#fff}.page{width:auto;margin:0;border-radius:0;box-shadow:none}}
  </style></head><body><main class="page">
    <header class="hero">
      <div class="brand">${imageOrInitial(company.logoBase64, company.nombreEmpresa || 'VetCare', 'logo')}
        <div><h1>${escapeHtml(company.nombreEmpresa || 'Clínica veterinaria')}</h1>
          <p>${escapeHtml([company.direccion, company.telefono, company.correo].filter(Boolean).join(' · '))}</p>
          <p>${company.rtn ? `RTN: ${escapeHtml(company.rtn)}` : ''}</p>
        </div>
      </div>
      <div class="doc"><p>Generado: ${escapeHtml(formatDate(new Date().toISOString()))}</p></div>
    </header>
    <section class="content">
      <div class="patient-strip">
        <div><h2>${escapeHtml(patient.nombre || 'Paciente sin nombre')}</h2><div class="muted">${escapeHtml([patient.especie, patient.raza, patient.sexo].filter(Boolean).join(' · ') || 'Datos generales no registrados')}</div></div>
        <div class="muted" style="text-align:right">Tutor: ${escapeHtml(patient.tutorNombre || 'N/D')}<br>${escapeHtml(patient.tutorTelefono || '')}</div>
      </div>
      ${eventHtml(event)}
      <div class="sign"><div>Firma del médico veterinario</div><div>Sello</div></div>
    </section>
  </main></body></html>`;
}

function eventHtml(event: ConsultorioEvento) {
  const attachments = attachmentLines(event).join('<br>');
  const color = TYPE_COLORS[event.tipo] || '#4f46e5';
  const titleLine = event.tipo === 'formula'
    ? `<h3>${escapeHtml(event.tipoLabel || 'Recetas')}</h3>`
    : `<div class="pill">${escapeHtml(event.tipoLabel || labelize(event.tipo))}</div><h3>${escapeHtml(event.titulo || 'Registro clínico')}</h3>`;
  const head = `<div class="event-head"><div>${titleLine}</div><div class="date">${escapeHtml(formatDate(event.fecha_evento))}</div></div>`;
  if (event.tipo === 'formula') {
    const payload = event.payload || {};
    const diagnostico = payload.diagnostico ? `<p class="field"><b>Diagnóstico:</b> ${escapeHtml(payload.diagnostico)}</p>` : '';
    const table = formulaTableHtml(payload);
    const observaciones = payload.observaciones ? `<p class="field"><b>Observaciones:</b> ${escapeHtml(payload.observaciones)}</p>` : '';
    return `<article class="event" style="--c:${color}">${head}${diagnostico}${table || '<p class="field">Sin medicamentos registrados.</p>'}${observaciones}${attachments ? `<div class="attachments">${attachments}</div>` : ''}</article>`;
  }
  const lines = eventLines(event).join('\n');
  return `<article class="event" style="--c:${color}">${head}<pre>${escapeHtml(lines || 'Sin detalle registrado.')}</pre>${attachments ? `<div class="attachments">${attachments}</div>` : ''}</article>`;
}

function formulaTableHtml(payload: Record<string, any>) {
  const meds = Array.isArray(payload?.medicamentos) ? payload.medicamentos : [];
  if (!meds.length) return '';
  const rows = meds.map((item: any) => `<tr>
    <td>${escapeHtml(item.medicamento || 'N/D')}</td>
    <td>${escapeHtml(item.presentacion || 'N/D')}</td>
    <td>${escapeHtml(item.cantidad != null && item.cantidad !== '' ? String(item.cantidad) : 'N/D')}</td>
    <td>${escapeHtml(item.frecuencia || 'N/D')}</td>
  </tr>`).join('');
  return `<table class="meds"><thead><tr><th>Medicamento</th><th>Presentación</th><th>Cantidad</th><th>Frecuencia</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function eventLines(event: ConsultorioEvento) {
  const lines = [event.resumen, event.detalle].filter(Boolean) as string[];
  payloadRows(event.payload).forEach(row => lines.push(`${row.label}: ${row.value}`));
  return lines.filter(Boolean);
}

function payloadRows(payload?: Record<string, any>) {
  if (!payload) return [] as Array<{ label: string; value: string }>;
  return Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined && displayValue(value).trim() !== '')
    .map(([key, value]) => ({ label: LABELS[key] || labelize(key), value: displayValue(value) }));
}

function displayValue(value: any): string {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (item && typeof item === 'object') {
        const name = item.prueba || item.nombre || item.medicamento || `Item ${index + 1}`;
        const professional = item.profesional?.nombre || item.profesional || '';
        const presentacion = item.presentacion ? `Presentación: ${item.presentacion}` : '';
        const quantity = item.cantidad ? `Cantidad ${item.cantidad}` : '';
        const frecuencia = item.frecuencia ? `Frecuencia: ${item.frecuencia}` : '';
        return [name, professional && `Profesional: ${professional}`, presentacion, quantity, frecuencia].filter(Boolean).join(' | ');
      }
      return displayValue(item);
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    if (value.nombre || value.prueba || value.titulo) return value.nombre || value.prueba || value.titulo;
    return Object.entries(value).filter(([, v]) => v).map(([k, v]) => `${labelize(k)}: ${displayValue(v)}`).join(' | ');
  }
  return String(value ?? '');
}

function attachmentLines(event: ConsultorioEvento) {
  const attachments = Array.isArray(event.adjuntos) ? event.adjuntos : [];
  return attachments.map((att: any, index) => `Adjunto ${index + 1}: ${att.filename || att.nombre || att.categoria || 'archivo clínico'}`);
}

function drawPdfInfoBlock(doc: any, title: string, rows: Array<[string, any]>, x: number, y: number, width: number) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...rgb('#0f172a')); doc.text(title, x, y);
  let yy = y + 12;
  rows.slice(0, 4).forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...rgb('#64748b')); doc.text(`${label}:`, x, yy);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...rgb('#334155'));
    wrap(doc, String(value || 'N/D'), x + 64, yy, width - 64, 8);
    yy += 10;
  });
}

function drawMiniField(doc: any, label: string, value: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...rgb('#64748b')); doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...rgb('#0f172a')); doc.text(value || 'N/D', x, y + 13, { maxWidth: 120 });
}

function drawCard(doc: any, x: number, y: number, w: number, h: number, fill: string, stroke: string) {
  doc.setFillColor(...rgb(fill)); doc.setDrawColor(...rgb(stroke)); doc.roundedRect(x, y, w, h, 14, 14, 'FD');
}

function drawPageMiniHeader(doc: any, patient: any) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...rgb('#f8fafc')); doc.rect(0, 0, width, 38, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...rgb('#334155'));
  doc.text(`Historia clínica - ${patient.nombre || 'Paciente'}`, 38, 24);
  doc.setDrawColor(...rgb('#e2e8f0')); doc.line(38, 38, width - 38, 38);
}

function drawInitialBadge(doc: any, value: string, x: number, y: number, size: number, color: string) {
  doc.setFillColor(...rgb(color)); doc.roundedRect(x, y, size, size, 14, 14, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(size > 60 ? 24 : 18); doc.setTextColor(...rgb('#0f766e'));
  doc.text(initials(value), x + size / 2, y + size / 2 + 7, { align: 'center' });
}

function addImageSafe(doc: any, src: string, x: number, y: number, w: number, h: number) {
  try {
    const format = imageFormat(src);
    if (format) doc.addImage(src, format, x, y, w, h);
  } catch {
    drawInitialBadge(doc, 'IMG', x, y, Math.min(w, h), '#e0f2fe');
  }
}

function imageFormat(src: string) {
  const match = String(src).match(/^data:image\/(png|jpe?g|webp)/i);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  return ext === 'png' ? 'PNG' : ext === 'webp' ? 'WEBP' : 'JPEG';
}

function wrap(doc: any, text: string, x: number, y: number, width: number, lineHeight: number) {
  const lines = doc.splitTextToSize(text || '', width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function eventCounts(events: ConsultorioEvento[]) {
  return events.reduce<Record<string, number>>((acc, event) => {
    acc[event.tipo] = (acc[event.tipo] || 0) + 1;
    return acc;
  }, {});
}

function statsHtml(counts: Record<string, number>, total: number) {
  const entries = Object.entries(counts).slice(0, 6);
  const data: Array<[string, number]> = entries.length ? entries : [['registros', total]];
  return data.map(([key, value]) => `<div class="stat"><b>${value}</b><span>${escapeHtml(labelize(key))}</span></div>`).join('');
}

function printField(label: string, value: string) {
  return `<div class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value || 'N/D')}</div></div>`;
}

function infoRows(rows: Array<[string, any]>) {
  return rows.map(([label, value]) => `<p><span class="label">${escapeHtml(label)}</span><br><span class="value">${escapeHtml(value || 'N/D')}</span></p>`).join('');
}

function imageOrInitial(src: string | undefined, text: string, className: string) {
  return src ? `<img class="${className}" src="${escapeAttr(src)}" alt="${escapeAttr(text)}">` : `<div class="${className}">${escapeHtml(initials(text))}</div>`;
}

function labelize(value: string) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function ageText(date?: string) {
  if (!date) return 'N/D';
  const birth = new Date(date);
  if (Number.isNaN(birth.getTime())) return 'N/D';
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  return years > 0 ? `${years} años ${months} meses` : `${Math.max(months, 0)} meses`;
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha';
}

function initials(value?: string) {
  return String(value || 'P').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'P';
}

function escapeHtml(value: any) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));
}

function escapeAttr(value: any) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function safeName(value?: string) {
  return String(value || 'paciente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
}

function rgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}
