import type React from 'react';
import {
  Activity, Baby, Building2, CalendarDays, ClipboardList, FileHeart,
  FileText, FlaskConical, HeartPulse, Mail, Microscope, PawPrint,
  Pill, Scissors, ShieldCheck, Stethoscope, Syringe,
} from 'lucide-react';
import { ConsultorioTipo, Paciente } from '../../types';

export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'number' | 'file' | 'professional' | 'lab_tests';
export type FieldDef = {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[];
  wide?: boolean;
  placeholder?: string;
  accept?: string;
  helper?: string;
};
export type ConsultorioModule = { tipo: ConsultorioTipo; label: string; icon: React.ElementType; accent: string; creatable?: boolean };

export const MODULES: ConsultorioModule[] = [
  { tipo: 'historia', label: 'Historia', icon: FileHeart, accent: 'text-teal-600' },
  { tipo: 'consulta', label: 'Consultas', icon: Stethoscope, accent: 'text-blue-600', creatable: true },
  { tipo: 'vacuna', label: 'Vacunaciones', icon: Syringe, accent: 'text-indigo-600', creatable: true },
  { tipo: 'formula', label: 'Recetas', icon: Pill, accent: 'text-violet-600', creatable: true },
  { tipo: 'desparasitacion', label: 'Desparasitaciones', icon: ShieldCheck, accent: 'text-cyan-600', creatable: true },
  { tipo: 'hospitalizacion', label: 'Hospitalizaciones', icon: Building2, accent: 'text-rose-600', creatable: true },
  { tipo: 'cirugia', label: 'Cirugías/procedimientos', icon: HeartPulse, accent: 'text-red-600', creatable: true },
  { tipo: 'orden', label: 'Órdenes', icon: ClipboardList, accent: 'text-slate-700', creatable: true },
  { tipo: 'laboratorio', label: 'Laboratorio', icon: FlaskConical, accent: 'text-purple-600', creatable: true },
  { tipo: 'imagenologia', label: 'Imagenología', icon: Microscope, accent: 'text-sky-600', creatable: true },
  { tipo: 'grooming', label: 'Peluquería y spa', icon: Scissors, accent: 'text-pink-600', creatable: true },
  { tipo: 'guarderia', label: 'Guardería', icon: Baby, accent: 'text-amber-600', creatable: true },
  { tipo: 'seguimiento', label: 'Seguimientos', icon: Activity, accent: 'text-emerald-600', creatable: true },
  { tipo: 'documento', label: 'Documentos', icon: FileText, accent: 'text-blue-700', creatable: true },
  { tipo: 'remision', label: 'Remisiones', icon: Building2, accent: 'text-orange-600', creatable: true },
  { tipo: 'cita', label: 'Citas', icon: CalendarDays, accent: 'text-indigo-600' },
  { tipo: 'mensaje', label: 'Mensajes al tutor', icon: Mail, accent: 'text-teal-700', creatable: true },
];

export function moduleFor(tipo: ConsultorioTipo) {
  return MODULES.find(m => m.tipo === tipo) || MODULES[0];
}

export function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function fmtDate(value?: string) {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function initials(name?: string) {
  return (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export function ageLabel(p?: Paciente) {
  if (!p?.fecha_nacimiento) return 'Edad no registrada';
  const birth = new Date(p.fecha_nacimiento);
  const diff = Date.now() - birth.getTime();
  const months = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24 * 30.44)));
  if (months < 24) return `${months} meses`;
  return `${Math.floor(months / 12)} años`;
}

export function patientSubtitle(p?: Paciente) {
  if (!p) return '';
  return [p.especie, p.raza, p.sexo, ageLabel(p)].filter(Boolean).join(' - ');
}

export function fieldsFor(tipo: ConsultorioTipo): FieldDef[] {
  const commonObs: FieldDef = { key: 'observaciones', label: 'Observaciones', type: 'textarea', wide: true };
  const byType: Record<string, FieldDef[]> = {
    consulta: [
      { key: 'motivo', label: 'Motivo', type: 'select', options: ['Consulta general', 'Urgencia', 'Control', 'Revisión postoperatoria', 'Otro'] },
      { key: 'peso', label: 'Peso kg', type: 'number' },
      { key: 'temperatura', label: 'Temperatura C', type: 'number' },
      { key: 'frecuencia_cardiaca', label: 'Frecuencia cardiaca', type: 'number' },
      { key: 'frecuencia_respiratoria', label: 'Frecuencia respiratoria', type: 'number' },
      { key: 'condicion_corporal', label: 'Condición corporal' },
      { key: 'subjetivo', label: 'S: Subjetivo / anamnesis', type: 'textarea', wide: true },
      { key: 'objetivo', label: 'O: Objetivo / examen', type: 'textarea', wide: true },
      { key: 'evaluacion', label: 'A: Evaluación / diagnóstico', type: 'textarea', wide: true },
      { key: 'plan', label: 'P: Plan terapéutico/diagnóstico', type: 'textarea', wide: true },
      { key: 'proximo_control', label: 'Próximo control', type: 'date', helper: 'Al guardar con esta fecha se crea automáticamente una cita en la agenda general.' },
    ],
    vacuna: [
      { key: 'nombre_vacuna', label: 'Vacuna', placeholder: 'Rabia, múltiple, triple felina...' },
      { key: 'laboratorio', label: 'Laboratorio' },
      { key: 'lote', label: 'Lote' },
      { key: 'proxima_dosis', label: 'Próxima vacunación', type: 'date' },
      commonObs,
    ],
    formula: [
      { key: 'diagnostico', label: 'Diagnóstico presuntivo/final', type: 'textarea', wide: true },
      commonObs,
    ],
    desparasitacion: [
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Interna', 'Externa', 'Mixta'] },
      { key: 'dosis', label: 'Dosis' },
      { key: 'ultima_desparasitacion', label: 'Última desparasitación', type: 'date' },
      { key: 'proximo_control', label: 'Próximo control', type: 'date' },
      commonObs,
    ],
    hospitalizacion: [
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Hospitalización', 'Ambulatorio', 'Observación'] },
      { key: 'razon', label: 'Razón de ingreso', type: 'textarea', wide: true },
      { key: 'fecha_salida', label: 'Fecha de salida', type: 'date' },
      { key: 'motivo_salida', label: 'Motivo de salida' },
      commonObs,
    ],
    cirugia: [
      { key: 'procedimiento', label: 'Cirugía/procedimiento' },
      { key: 'descripcion', label: 'Descripción quirúrgica', type: 'textarea', wide: true },
      { key: 'preanestesico', label: 'Preanestésico', type: 'textarea', wide: true },
      { key: 'anestesico', label: 'Anestésico', type: 'textarea', wide: true },
      { key: 'tratamiento', label: 'Tratamiento', type: 'textarea', wide: true },
      { key: 'complicaciones', label: 'Complicaciones', type: 'textarea', wide: true },
    ],
    orden: [
      { key: 'tipo_orden', label: 'Tipo de orden', type: 'select', options: ['Laboratorio', 'Imagen diagnóstica', 'Procedimiento', 'Hospitalización', 'Otro'] },
      { key: 'orden', label: 'Orden solicitada' },
      { key: 'cantidad', label: 'Cantidad', type: 'number' },
      { key: 'prioridad', label: 'Prioridad', type: 'select', options: ['Rutina', 'Prioritario', 'Urgente'] },
      { key: 'motivo', label: 'Motivo de la orden', type: 'textarea', wide: true },
      { key: 'notas', label: 'Notas', type: 'textarea', wide: true },
    ],
    laboratorio: [
      { key: 'profesional', label: 'Profesional', type: 'professional' },
      { key: 'prueba', label: 'Prueba/examen' },
      { key: 'cantidad', label: 'Cantidad', type: 'number' },
      {
        key: 'resultado_adjunto',
        label: 'Resultado/adjunto',
        type: 'file',
        wide: true,
        accept: '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt',
        helper: 'Suba resultados de laboratorio, fotografias, PDF o documentos del examen.',
      },
      { key: 'diagnostico', label: 'Diagnóstico presuntivo', type: 'textarea', wide: true },
    ],
    imagenologia: [
      { key: 'profesional', label: 'Profesional', type: 'professional' },
      { key: 'ayuda_diagnostica', label: 'Ayuda diagnóstica', type: 'select', options: ['Ecografía', 'Radiografía', 'Tomografía', 'Endoscopia', 'Otro'] },
      { key: 'modalidad', label: 'Protocolo/modalidad' },
      { key: 'requiere_sedacion', label: 'Requiere sedación', type: 'select', options: ['No', 'Sí'] },
      { key: 'signos_clinicos', label: 'Signos clínicos', type: 'textarea', wide: true },
      { key: 'diagnostico', label: 'Diagnóstico presuntivo', type: 'textarea', wide: true },
      { key: 'tipo_estudio', label: 'Tipo de estudio', type: 'textarea', wide: true },
      {
        key: 'imagenes_resultados',
        label: 'Adjuntos/resultados',
        type: 'file',
        wide: true,
        accept: '.pdf,.jpg,.jpeg,.png,.webp,.dcm,.doc,.docx',
        helper: 'Adjunte radiografias, ecografias, imagenes diagnosticas, DICOM o informe PDF.',
      },
    ],
    seguimiento: [
      { key: 'tipo_seguimiento', label: 'Tipo de seguimiento', type: 'select', options: ['Revisión de consulta', 'Postoperatorio', 'Tratamiento', 'Vacuna', 'Otro'] },
      { key: 'motivo', label: 'Motivo' },
      { key: 'detalles', label: 'Detalles del seguimiento', type: 'textarea', wide: true },
      { key: 'proximo_control', label: 'Próximo control', type: 'date' },
      { key: 'mensaje', label: 'Mensaje para enviar al tutor', type: 'textarea', wide: true },
    ],
    documento: [
      {
        key: 'tipo_documento',
        label: 'Tipo de documento',
        type: 'select',
        options: ['Alta voluntaria', 'Autorización de eutanasia', 'Autorización de sedación/cirugía', 'Consentimiento informado de hospitalización', 'Otro'],
      },
      { key: 'nombre_documento', label: 'Nombre del documento' },
      { key: 'requiere_firma', label: 'Requiere firma', type: 'select', options: ['Sí', 'No'] },
      { key: 'contenido', label: 'Contenido', type: 'textarea', wide: true },
      {
        key: 'archivo_documento',
        label: 'Documento firmado/soporte',
        type: 'file',
        wide: true,
        accept: '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx',
        helper: 'Suba consentimientos firmados, altas medicas o documentos externos.',
      },
    ],
    remision: [
      { key: 'profesional', label: 'Profesional que remite', type: 'professional' },
      { key: 'centro_destino', label: 'Centro veterinario destino' },
      { key: 'procedimiento', label: 'Procedimiento/razón', type: 'textarea', wide: true },
      commonObs,
    ],
    mensaje: [
      { key: 'mensaje', label: 'Texto de la notificación', type: 'textarea', wide: true },
      { key: 'proximo_control', label: 'Próximo control', type: 'date' },
    ],
    grooming: [
      { key: 'servicio', label: 'Servicio', type: 'select', options: ['Baño', 'Corte', 'Limpieza dental', 'Peluquería completa', 'Otro'] },
      { key: 'estado_piel', label: 'Estado de piel/pelaje', type: 'textarea', wide: true },
      commonObs,
    ],
    guarderia: [
      { key: 'fecha_salida', label: 'Fecha de salida', type: 'date' },
      { key: 'alimentacion', label: 'Alimentación/cuidados', type: 'textarea', wide: true },
      commonObs,
    ],
  };
  return byType[tipo] || [commonObs];
}
