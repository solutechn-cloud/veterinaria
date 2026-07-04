import { ConfigService } from '../../services/api';
import type { Cliente, EmpresaConfig, Paciente } from '../../types';
import { ageLabel } from './consultorioConfig';

export type ClinicalDocTemplateId =
  | 'alta_voluntaria'
  | 'autorizacion_eutanasia'
  | 'autorizacion_sedacion'
  | 'consentimiento_hospitalizacion';

export const CLINICAL_DOC_TEMPLATES: { id: ClinicalDocTemplateId; label: string }[] = [
  { id: 'alta_voluntaria', label: 'Alta voluntaria' },
  { id: 'autorizacion_eutanasia', label: 'Autorización de eutanasia' },
  { id: 'autorizacion_sedacion', label: 'Autorización de sedación/cirugía' },
  { id: 'consentimiento_hospitalizacion', label: 'Consentimiento informado de hospitalización' },
];

export const CLINICAL_DOC_TEMPLATE_LABEL: Record<ClinicalDocTemplateId, string> = CLINICAL_DOC_TEMPLATES.reduce(
  (acc, t) => ({ ...acc, [t.id]: t.label }),
  {} as Record<ClinicalDocTemplateId, string>
);

export const CLINICAL_DOC_LABEL_TO_ID: Record<string, ClinicalDocTemplateId> = CLINICAL_DOC_TEMPLATES.reduce(
  (acc, t) => ({ ...acc, [t.label]: t.id }),
  {} as Record<string, ClinicalDocTemplateId>
);

export type ClinicalDocManualFields = {
  medico_nombre?: string;
  diagnostico?: string;
  tratamiento?: string;
  notas_dr?: string;
  motivo_hospitalizacion?: string;
  procedimiento_menor?: string;
  procedimiento_mayor?: string;
};

function escapeHtml(value?: string | number | null) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function orBlank(value?: string | number | null, len = 24) {
  const v = String(value ?? '').trim();
  return v ? escapeHtml(v) : '_'.repeat(len);
}

function fmtDateHN(v?: string) {
  const d = v ? new Date(v) : new Date();
  if (isNaN(d.getTime())) return escapeHtml(v);
  return d.toLocaleDateString('es-HN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function tutorNombreCompleto(patient: Paciente, cliente?: Cliente | null) {
  if (cliente) return [cliente.nombre, cliente.apellido].filter(Boolean).join(' ');
  return patient.tutorNombre || '';
}

function imageOrInitial(base64?: string, label?: string) {
  if (base64) return `<img class="logo" src="${base64}" alt="logo">`;
  return `<div class="logo">${escapeHtml((label || 'V').slice(0, 2).toUpperCase())}</div>`;
}

function baseStyles() {
  return `
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:Inter,Arial,sans-serif;color:#172033;margin:0;background:#eef6fb}
    .page{width:760px;margin:24px auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.12)}
    .hero{background:linear-gradient(135deg,#101827,#274072);color:#fff;padding:26px 32px;display:grid;grid-template-columns:1fr auto;gap:20px;border-bottom:5px solid #14b8a6}
    .brand{display:flex;gap:16px;align-items:center}.logo{width:60px;height:60px;border-radius:14px;background:#e0f2fe;object-fit:contain;padding:6px;display:grid;place-items:center;color:#0f766e;font-weight:800;font-size:18px}
    .hero h1{font-size:19px;margin:0 0 6px}.hero p{margin:2px 0;color:#dbeafe;font-size:11px}.doc{text-align:right}
    .content{padding:28px 34px;font-size:13px;line-height:1.6;color:#1e293b}
    table.datos{width:100%;border-collapse:collapse;margin:0 0 18px}
    table.datos th,table.datos td{border:1px solid #cbd5e1;padding:8px 10px;font-size:12.5px;text-align:left;vertical-align:top}
    table.datos th{background:#f1f5f9;color:#334155;font-weight:700;width:34%}
    h2.section{font-size:14px;margin:22px 0 8px;color:#0f172a}
    p{margin:0 0 12px}
    .blank{border-bottom:1px solid #64748b;padding:0 2px}
    .sign-block{margin-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:24px;text-align:center}
    .sign-block div{border-top:1px solid #94a3b8;padding-top:6px;font-size:11px;color:#64748b}
    .sign-single{margin-top:44px;text-align:left}
    .sign-single .line{border-top:1px solid #94a3b8;width:340px;padding-top:6px;font-size:11px;color:#64748b;margin-top:36px}
    ul.checklist{list-style:none;padding:0;margin:0 0 12px}
    ul.checklist li{margin-bottom:6px}
    .compact-tables table.datos{margin:0 0 10px}
    .compact-tables table.datos th,.compact-tables table.datos td{padding:4px 9px;font-size:11.5px;line-height:1.3}
    .compact-tables h2.section{margin:12px 0 6px;font-size:13px}
    .compact-tables p{margin:0 0 9px;font-size:12px;line-height:1.45}
    .compact-tables .content{padding:22px 30px}
    .compact-tables .sign-single{margin-top:24px}
    .compact-tables .sign-single .line{margin-top:22px}
    .break-before{page-break-before:always;break-before:page}
    @media print{body{background:#fff}.page{width:auto;margin:0;border-radius:0;box-shadow:none}}
  `;
}

function header(company: Partial<EmpresaConfig>, docTitle: string) {
  return `<header class="hero">
    <div class="brand">${imageOrInitial(company.logoBase64, company.nombreEmpresa)}
      <div><h1>${escapeHtml(company.nombreEmpresa || 'Clínica veterinaria')}</h1>
        <p>${escapeHtml([company.direccion, company.telefono, company.correo].filter(Boolean).join(' · '))}</p>
      </div>
    </div>
    <div class="doc"><h1>${escapeHtml(docTitle)}</h1><p>Generado: ${escapeHtml(fmtDateHN())}</p></div>
  </header>`;
}

function altaVoluntariaBody(patient: Paciente, cliente: Cliente | null | undefined, company: Partial<EmpresaConfig>, manual: ClinicalDocManualFields) {
  const empresa = company.nombreEmpresa || 'la clínica';
  const tutor = tutorNombreCompleto(patient, cliente);
  return `
    <table class="datos">
      <tr><th>Fecha</th><td>${fmtDateHN()}</td></tr>
      <tr><th>Mascota</th><td>${escapeHtml(patient.nombre)}</td></tr>
      <tr><th>Tutor/Responsable</th><td>${orBlank(tutor)}</td></tr>
      <tr><th>Médico veterinario</th><td>${orBlank(manual.medico_nombre)}</td></tr>
      <tr><th>Diagnóstico</th><td>${orBlank(manual.diagnostico, 0) || '&nbsp;'}</td></tr>
      <tr><th>Tratamiento y/o exámenes recomendados</th><td>${orBlank(manual.tratamiento, 0) || '&nbsp;'}</td></tr>
    </table>
    <p>Yo <span class="blank">${orBlank(tutor)}</span> propietario de la mascota <span class="blank">${escapeHtml(patient.nombre)}</span>
    entiendo y asumo todos los riesgos y consecuencias explicadas por el Dr. <span class="blank">${orBlank(manual.medico_nombre)}</span>
    al no dejar hospitalizada la mascota y/o no aceptar tratamiento y/o exámenes recomendados en <b>${escapeHtml(empresa)}</b>.
    Liberando a ${escapeHtml(empresa)} por todos los reclamos, consecuencias que surjan a raíz de no dejar a la mascota con el cuidado
    profesional y/o seguir el tratamiento requerido a pesar de la recomendación del Dr.</p>
    <p><b>Exoneración:</b> por medio de la presente libero y eximo de toda responsabilidad legal, indemnización y me comprometo a no
    establecer demanda(s), propia o de terceros, en contra de <b>${escapeHtml(empresa)}</b>, sus representantes, agentes, voluntarios,
    colaboradores, contratistas y personas que trabajan para la empresa, de reclamos, demandas, acciones, responsabilidades, pérdidas,
    sentencias, costos y gastos de cualquier naturaleza, incluyendo los reclamos por muerte de la mascota.</p>
    <h2 class="section">Notas del Dr.</h2>
    <p style="white-space:pre-wrap">${manual.notas_dr ? escapeHtml(manual.notas_dr) : '<br><br><br>'}</p>
    <p>Bajo mi firma certifico que he entendido los riesgos y acepto de manera consciente los términos antes expuestos.</p>
    <div class="sign-single">
      <div class="line">Firma del tutor/responsable</div>
      <p style="margin-top:14px">Número de identidad/Pasaporte: <span class="blank">${orBlank(cliente?.identidad)}</span></p>
    </div>
  `;
}

function eutanasiaBody(patient: Paciente, cliente: Cliente | null | undefined, company: Partial<EmpresaConfig>) {
  const tutor = tutorNombreCompleto(patient, cliente);
  return `
    <h2 class="section">Datos del propietario / representante legal</h2>
    <table class="datos">
      <tr><th>Nombre completo</th><td>${orBlank(tutor)}</td></tr>
      <tr><th>Identificación (DNI/Pasaporte)</th><td>${orBlank(cliente?.identidad)}</td></tr>
      <tr><th>Teléfono</th><td>${orBlank(cliente?.telefono || patient.tutorTelefono)}</td></tr>
      <tr><th>Correo</th><td>${orBlank(cliente?.correo || patient.tutorCorreo)}</td></tr>
    </table>
    <h2 class="section">Datos del animal</h2>
    <table class="datos">
      <tr><th>Nombre</th><td>${escapeHtml(patient.nombre)}</td></tr>
      <tr><th>Especie</th><td>${orBlank(patient.especie)}</td></tr>
      <tr><th>Raza</th><td>${orBlank(patient.raza)}</td></tr>
      <tr><th>Sexo</th><td>${orBlank(patient.sexo)}</td></tr>
      <tr><th>Edad</th><td>${escapeHtml(ageLabel(patient))}</td></tr>
      <tr><th>Color / señales particulares</th><td>${orBlank(patient.color)}</td></tr>
    </table>
    <h2 class="section">Declaración y consentimiento informado</h2>
    <p>Yo, <span class="blank">${orBlank(tutor)}</span>, en mi calidad de <b>propietario(a) o responsable legal</b> del animal
    anteriormente descrito, <b>AUTORIZO DE MANERA VOLUNTARIA, EXPRESA E INFORMADA</b> al Médico Veterinario responsable y al personal
    autorizado a realizar el <b>procedimiento de EUTANASIA</b>.</p>
    <h2 class="section">Información médica</h2>
    <p>Declaro que el Médico Veterinario me ha explicado claramente el diagnóstico y estado actual del animal, el pronóstico y
    alternativas terapéuticas disponibles (si las hubiera), que la eutanasia es un procedimiento humanitario realizado con métodos
    clínicamente aceptados, y que su objetivo principal es evitar dolor, sufrimiento innecesario y agonía. Comprendo que la eutanasia
    implica el cese irreversible de la vida del animal.</p>
    <h2 class="section">Declaraciones adicionales</h2>
    <p>Certifico que soy el legítimo propietario o responsable legal del animal. Eximo de responsabilidad civil, penal y
    administrativa al Médico Veterinario y a <b>${escapeHtml(company.nombreEmpresa || 'la clínica')}</b> por las consecuencias derivadas
    de este procedimiento, siempre que se realice conforme a la ley veterinaria. Autorizo la administración previa de sedación o
    anestesia para garantizar el bienestar del animal durante el procedimiento.</p>
    <div class="sign-single">
      <div class="line">Firma del propietario / representante legal</div>
      <p style="margin-top:14px">Fecha: ${fmtDateHN()}</p>
    </div>
  `;
}

function sedacionBody(patient: Paciente, cliente: Cliente | null | undefined, company: Partial<EmpresaConfig>, manual: ClinicalDocManualFields) {
  const tutor = tutorNombreCompleto(patient, cliente);
  const empresa = company.nombreEmpresa || 'la clínica';
  return `
    <h2 class="section">Propietario / representante legal</h2>
    <table class="datos">
      <tr><th>Nombre completo</th><td>${orBlank(tutor)}</td></tr>
      <tr><th>Identificación (DNI/Pasaporte)</th><td>${orBlank(cliente?.identidad)}</td></tr>
      <tr><th>Teléfono</th><td>${orBlank(cliente?.telefono || patient.tutorTelefono)}</td></tr>
      <tr><th>Correo</th><td>${orBlank(cliente?.correo || patient.tutorCorreo)}</td></tr>
    </table>
    <h2 class="section">Datos del animal</h2>
    <table class="datos">
      <tr><th>Nombre</th><td>${escapeHtml(patient.nombre)}</td></tr>
      <tr><th>Especie</th><td>${orBlank(patient.especie)}</td></tr>
      <tr><th>Raza</th><td>${orBlank(patient.raza)}</td></tr>
      <tr><th>Sexo</th><td>${orBlank(patient.sexo)}</td></tr>
      <tr><th>Edad</th><td>${escapeHtml(ageLabel(patient))}</td></tr>
      <tr><th>Color / identificación</th><td>${orBlank(patient.color)}</td></tr>
    </table>
    <h2 class="section">Autorización de sedación y procedimiento</h2>
    <p>Yo, <span class="blank">${orBlank(tutor)}</span>, identificado(a) como aparece arriba y en mi calidad de propietario(a) o
    representante legal del animal descrito, autorizo expresamente a <b>${escapeHtml(empresa)}</b> y al equipo profesional a realizar
    lo siguiente:</p>
    <ul class="checklist">
      <li><b>Procedimiento menor:</b> ${orBlank(manual.procedimiento_menor, 40)}</li>
      <li><b>Procedimiento mayor:</b> ${orBlank(manual.procedimiento_mayor, 40)}</li>
    </ul>
    <p>Autorizo la administración de sedación y/o anestesia necesaria antes y durante el procedimiento, así como los cuidados pre y
    post-anestésicos indicados por el médico veterinario a cargo. Entiendo que la sedación y la anestesia implican riesgos
    inherentes (reacciones medicamentosas, depresión respiratoria, hipoxia, entre otros) y que el profesional actuará conforme a la
    práctica veterinaria estándar para mitigarlos. He recibido explicación clara y completa del procedimiento, de los beneficios
    esperados, de las alternativas disponibles y de los riesgos asociados.</p>
    <h2 class="section">Exoneración de responsabilidad</h2>
    <p>Exonero a <b>${escapeHtml(empresa)}</b>, a sus médicos, personal auxiliar y administrativo de cualquier responsabilidad civil o
    penal derivada de complicaciones médicas no atribuibles a negligencia profesional demostrada, y de reacciones adversas
    imprevisibles a tratamientos o procedimientos aplicados conforme a criterio clínico profesional. Esta exoneración aplica siempre
    que se haya actuado conforme a las normas y buenas prácticas veterinarias vigentes en Honduras.</p>
    <h2 class="section">Costos, pagos y devoluciones</h2>
    <p>Declaro haber recibido estimación de costos de hospitalización, tratamientos y posibles procedimientos adicionales. Me
    comprometo a cubrir todos los gastos generados. Entiendo que no se efectuarán devoluciones por servicios ya prestados, aun en
    caso de alta anticipada, traslado del paciente o fallecimiento.</p>
    <div class="sign-single">
      <div class="line">Firma del propietario / representante legal</div>
      <p style="margin-top:14px">Fecha: ${fmtDateHN()}</p>
    </div>
  `;
}

function hospitalizacionBody(patient: Paciente, cliente: Cliente | null | undefined, company: Partial<EmpresaConfig>, manual: ClinicalDocManualFields) {
  const tutor = tutorNombreCompleto(patient, cliente);
  const empresa = company.nombreEmpresa || 'la clínica';
  return `
    <p>Yo, el/la abajo firmante, identificado/a con Documento de Identidad No. <span class="blank">${orBlank(cliente?.identidad)}</span>,
    en mi carácter de tutor/a, propietario/a o responsable legal del paciente veterinario, autorizo de manera voluntaria la
    hospitalización y atención médica de mi mascota bajo los términos y condiciones expuestos a continuación.</p>
    <h2 class="section">I. Datos del paciente (mascota)</h2>
    <table class="datos">
      <tr><th>Nombre</th><td>${escapeHtml(patient.nombre)}</td></tr>
      <tr><th>Especie</th><td>${orBlank(patient.especie)}</td></tr>
      <tr><th>Raza</th><td>${orBlank(patient.raza)}</td></tr>
      <tr><th>Sexo</th><td>${orBlank(patient.sexo)}</td></tr>
      <tr><th>Edad</th><td>${escapeHtml(ageLabel(patient))}</td></tr>
      <tr><th>Color / señales particulares</th><td>${orBlank(patient.color)}</td></tr>
      <tr><th>Código paciente / microchip</th><td>${orBlank(patient.microchip)}</td></tr>
      <tr><th>Motivo de la hospitalización</th><td>${orBlank(manual.motivo_hospitalizacion, 0) || '&nbsp;'}</td></tr>
    </table>
    <h2 class="section">II. Datos del tutor / responsable</h2>
    <table class="datos">
      <tr><th>Nombre completo</th><td>${orBlank(tutor)}</td></tr>
      <tr><th>Documento de identidad</th><td>${orBlank(cliente?.identidad)}</td></tr>
      <tr><th>Teléfono(s)</th><td>${orBlank(cliente?.telefono || patient.tutorTelefono)}</td></tr>
      <tr><th>Correo electrónico</th><td>${orBlank(cliente?.correo || patient.tutorCorreo)}</td></tr>
      <tr><th>Domicilio</th><td>${orBlank(cliente?.direccion)}</td></tr>
    </table>
    <h2 class="section">III. Autorización de hospitalización y atención médica</h2>
    <p>Autorizo al personal profesional médico veterinario debidamente calificado y colegiado a hospitalizar a mi mascota y proveer
    tratamiento médico, procedimientos de diagnóstico, cuidados clínicos, administración de medicamentos, fluidoterapia e
    intervenciones necesarias durante la estancia; ejecutar procedimientos adicionales que el criterio médico considere necesarios
    para la seguridad, bienestar y salud del paciente; y tomar decisiones clínicas pertinentes en caso de urgencia cuando no sea
    posible contactar al tutor inmediatamente.</p>
    <h2 class="section">IV. Riesgos, pronóstico y resultados</h2>
    <p>Declaro haber sido informado/a de que la medicina veterinaria no garantiza resultados ni recuperación total, y que pueden
    surgir complicaciones inherentes al estado clínico del paciente o respuesta individual al tratamiento, incluyendo empeoramiento
    de la condición, reacciones inesperadas o fallecimiento del paciente, pese a la atención brindada. Acepto estos riesgos de
    manera consciente y voluntaria.</p>
    <h2 class="section break-before">V. Exoneración de responsabilidad</h2>
    <p>Exonero a <b>${escapeHtml(empresa)}</b>, a sus médicos, personal auxiliar y administrativo de cualquier responsabilidad civil o
    penal derivada de complicaciones médicas no atribuibles a negligencia profesional demostrada, y de reacciones adversas
    imprevisibles a tratamientos o procedimientos aplicados conforme a criterio clínico profesional, siempre que se haya actuado
    conforme a las normas y buenas prácticas veterinarias establecidas en Honduras.</p>
    <h2 class="section">VI. Costos, pagos y devoluciones</h2>
    <p>Declaro haber recibido estimación de costos de hospitalización, tratamientos y posibles procedimientos adicionales. Me
    comprometo a cubrir todos los gastos generados durante la hospitalización. Entiendo que no se efectuarán devoluciones por
    servicios ya prestados, aun en caso de alta anticipada, traslado del paciente o fallecimiento.</p>
    <h2 class="section">VII. Horario de visita y condiciones</h2>
    <p>El horario de visita será de <b>10:00 AM a 3:00 PM</b> (salvo circunstancias médicas especiales que lo impidan). Las visitas
    deberán ser breves y respetar las indicaciones del personal médico, evitando estrés al paciente o interferencia en
    procedimientos clínicos. ${escapeHtml(empresa)} se reserva el derecho de modificar estos horarios por razones médicas, urgencias
    o situaciones que afecten la salud de los pacientes hospitalizados.</p>
    <h2 class="section">VIII. Contacto y abandono</h2>
    <p>Me comprometo a mantener actualizados mis datos de contacto y estar localizable durante toda la hospitalización. Autorizo a
    ${escapeHtml(empresa)} a proceder conforme a la legislación vigente en caso de abandono del paciente o imposibilidad de contacto,
    incluido el manejo responsable de la mascota según las normas aplicables.</p>
    <h2 class="section">IX. Aceptación y firma</h2>
    <p>Habiendo leído y comprendido completamente este documento, otorgo mi consentimiento informado sin coacción alguna,
    comprometiéndome a cumplir con las condiciones aquí establecidas.</p>
    <div class="sign-single">
      <div class="line">Firma del tutor / responsable</div>
      <p style="margin-top:14px">Nombre completo: ${orBlank(tutor)}<br>Cédula/identificación: ${orBlank(cliente?.identidad)}</p>
    </div>
  `;
}

export function buildClinicalDocumentHtml(
  templateId: ClinicalDocTemplateId,
  patient: Paciente,
  cliente: Cliente | null | undefined,
  company: Partial<EmpresaConfig>,
  manual: ClinicalDocManualFields
) {
  const title = CLINICAL_DOC_TEMPLATE_LABEL[templateId];
  const body =
    templateId === 'alta_voluntaria' ? altaVoluntariaBody(patient, cliente, company, manual)
    : templateId === 'autorizacion_eutanasia' ? eutanasiaBody(patient, cliente, company)
    : templateId === 'autorizacion_sedacion' ? sedacionBody(patient, cliente, company, manual)
    : hospitalizacionBody(patient, cliente, company, manual);
  const pageClass = templateId === 'autorizacion_eutanasia' || templateId === 'consentimiento_hospitalizacion' ? 'page compact-tables' : 'page';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} - ${escapeHtml(patient.nombre)}</title>
    <style>${baseStyles()}</style></head><body><main class="${pageClass}">
      ${header(company, title)}
      <section class="content">${body}</section>
    </main></body></html>`;
}

export async function printClinicalDocumentTemplate(
  templateId: ClinicalDocTemplateId,
  patient: Paciente,
  cliente: Cliente | null | undefined,
  manual: ClinicalDocManualFields
) {
  const company = (await ConfigService.get().catch(() => ({}))) || {};
  const printWindow = window.open('', '_blank', 'width=920,height=780');
  if (!printWindow) throw new Error('El navegador bloqueó la ventana de impresión.');
  printWindow.document.write(buildClinicalDocumentHtml(templateId, patient, cliente, company, manual));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 450);
}
