import React, { useEffect, useMemo, useState } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { useParams, useNavigate } = ReactRouterDOM as any;
import { CitasService, ClientService, ConsultasService, ConsultorioService, QuoteService, VacunasService } from '../services/api';
import { Cliente, ConsultorioBusquedaItem, ConsultorioEvento, ConsultorioPacienteDetalle, ConsultorioTipo, DetalleVenta, Paciente } from '../types';
import {
  ChevronLeft, ChevronRight, PawPrint,
  FileDown, Plus, Printer, RefreshCw, Search, Send,
  Users, X, Pencil, Trash2, Receipt,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { ClinicalHistoryExportModal, printClinicalEvent } from '../components/consultorio/ClinicalHistoryExportModal';
import { AttachmentList, AttachmentUploader, type ClinicalAttachment } from '../components/consultorio/ClinicalAttachments';
import { LaboratoryTestsEditor } from '../components/consultorio/LaboratoryTestsEditor';
import { MedicationItemsEditor, type MedicationItem } from '../components/consultorio/MedicationItemsEditor';
import { ServiceItemsEditor, type ServiceItem } from '../components/consultorio/ServiceItemsEditor';
import { VaccineItemsEditor, type VaccineCartItem } from '../components/consultorio/VaccineItemsEditor';
import { DesparasitacionItemsEditor, type DesparasitacionItem } from '../components/consultorio/DesparasitacionItemsEditor';
import { CLINICAL_DOC_LABEL_TO_ID, printClinicalDocumentTemplate } from '../components/consultorio/clinicalDocumentTemplates';
import { ProfessionalSelect, type ProfessionalValue } from '../components/consultorio/ProfessionalSelect';
import { FieldDef, MODULES, fieldsFor, fmtDate, initials, moduleFor, nowLocal, patientSubtitle } from '../components/consultorio/consultorioConfig';

const PAGE_SIZE = 20;
const INPUT_CLASS = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300';

type EventForm = {
  tipo: ConsultorioTipo;
  fecha_evento: string;
  titulo: string;
  resumen: string;
  detalle: string;
  enviar_correo: boolean;
  payload: Record<string, any>;
  adjuntos: ClinicalAttachment[];
};

// Convierte una fecha del backend al formato de <input type="datetime-local"> (hora local).
function toLocalInput(v?: string): string {
  if (!v) return nowLocal();
  const d = new Date(v);
  if (isNaN(d.getTime())) return nowLocal();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const money = (value?: number) => Number(value || 0).toLocaleString('es-HN', { style: 'currency', currency: 'HNL' });

function toDateOnly(v?: string) {
  return (v || nowLocal()).slice(0, 10);
}

// El timeline combinado (/consultorio/pacientes/:id/timeline) alias-ea el PK real
// a "id" para todas las fuentes y mezcla dos sistemas: los registros genéricos
// (paciente_eventos_clinicos, source "evento") y las consultas antiguas de la
// tabla dedicada "consultas" (source "consulta"), que tienen su propio PUT
// /consultas/:id. Vacunas/citas/recordatorios tienen sus propios flujos y no se
// editan por aquí. id_evento/id_consulta son BIGSERIAL, así que pg los devuelve
// como string, no como number.
function getEditableSource(item: ConsultorioEvento): 'evento' | 'consulta' | null {
  if (!item.source || item.source === 'evento') return 'evento';
  if (item.source === 'consulta') return 'consulta';
  return null;
}

function getEventoId(item: ConsultorioEvento): number | null {
  if (!getEditableSource(item)) return null;
  const raw = item.id_evento ?? item.id;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function professionalName(value?: ProfessionalValue | string | null) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.nombre || value.usuario || '';
}

function normalizeVaccinePayloadItems(payload: Record<string, any>): VaccineCartItem[] {
  const items = Array.isArray(payload.vacunas) ? payload.vacunas : [];
  if (items.length) return items;
  if (!payload.nombre_vacuna) return [];
  return [{
    id: 'legacy-vaccine',
    nombre_vacuna: payload.nombre_vacuna,
    id_medicamento: payload.id_medicamento,
    id_presentacion: payload.id_presentacion,
    presentacion: payload.presentacion,
    cantidad: Number(payload.cantidad || 1),
    precio_unitario: Number(payload.precio_unitario || 0),
    tipo_isv: payload.tipo_isv || 'exento',
    proxima_dosis: payload.proxima_dosis,
    notas: payload.observaciones || payload.notas,
  }];
}

// Agrega las líneas a la cotización ("prefactura") abierta de HOY para este
// paciente; si no existe, crea una nueva. Así cualquier cargo generado desde
// el expediente clínico (servicios de consulta, recetas, vacunas,
// desparasitaciones, etc.) de una misma visita queda en UNA sola cotización.
async function pushVisitaQuote(patient: Paciente, detalles: any[], observaciones: string) {
  if (!detalles.length) return null;
  const clienteId = patient.id_tutor || (patient as any).tutorId;
  const result = await QuoteService.agregarItemsVisita(patient.id_paciente, clienteId, detalles, observaciones);
  return result.codigo || result.codCotizacion || null;
}

async function createMedicationQuoteFromPayload(patient: Paciente, payload: Record<string, any>, eventId?: number) {
  const rows = (Array.isArray(payload.medicamentos) ? payload.medicamentos : []) as MedicationItem[];
  const billable = rows.filter(row => row.id_medicamento && row.id_presentacion && Number(row.precioVenta || 0) > 0);
  if (!billable.length) return null;

  const detalles: any[] = billable.map(row => ({
    tipoProducto: 'MEDICAMENTO',
    id_medicamento: row.id_medicamento,
    id_presentacion: row.id_presentacion,
    descripcionProducto: [row.medicamento, row.presentacion].filter(Boolean).join(' - '),
    cantidad: Number(row.cantidad || 1),
    precioVenta: Number(row.precioVenta || 0),
    tipoIsv: row.tipoIsv || 'exento',
  }));
  return pushVisitaQuote(patient, detalles, `Medicamentos indicados para ${patient.nombre}${eventId ? ` en registro clinico ${eventId}` : ''}. Pendiente de cobro en recepcion.`);
}

async function createServiceQuoteFromPayload(patient: Paciente, payload: Record<string, any>, eventId?: number) {
  const rows = (Array.isArray(payload.servicios) ? payload.servicios : []) as ServiceItem[];
  const billable = rows.filter(row => row.id_servicio && Number(row.precio || 0) > 0);
  if (!billable.length) return null;

  const detalles: any[] = billable.map(row => ({
    tipoProducto: 'SERVICIO',
    id_servicio: row.id_servicio,
    descripcionProducto: row.nombre,
    cantidad: Number(row.cantidad || 1),
    precioVenta: Number(row.precio || 0),
    tipoIsv: row.tipoIsv || 'exento',
  }));
  return pushVisitaQuote(patient, detalles, `Servicios de consulta para ${patient.nombre}${eventId ? ` en registro clinico ${eventId}` : ''}. Pendiente de cobro en recepcion.`);
}

async function createDesparasitacionQuoteFromPayload(patient: Paciente, payload: Record<string, any>, eventId?: number) {
  const rows = (Array.isArray(payload.productos) ? payload.productos : []) as DesparasitacionItem[];
  const billable = rows.filter(row => row.id_medicamento && row.id_presentacion && Number(row.precio || 0) > 0);
  if (!billable.length) return null;

  const detalles: any[] = billable.map(row => ({
    tipoProducto: 'MEDICAMENTO',
    id_medicamento: row.id_medicamento,
    id_presentacion: row.id_presentacion,
    descripcionProducto: [row.nombre, row.presentacion].filter(Boolean).join(' - '),
    cantidad: Number(row.cantidad || 1),
    precioVenta: Number(row.precio || 0),
    tipoIsv: row.tipoIsv || 'exento',
  }));
  return pushVisitaQuote(patient, detalles, `Desparasitación de ${patient.nombre}${eventId ? ` en registro clinico ${eventId}` : ''}. Pendiente de cobro en recepcion.`);
}

export default function Expediente() {
  const { idPaciente } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ConsultorioBusquedaItem[]>([]);
  const [detail, setDetail] = useState<ConsultorioPacienteDetalle | null>(null);
  const [items, setItems] = useState<ConsultorioEvento[]>([]);
  const [active, setActive] = useState<ConsultorioTipo>('historia');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [modal, setModal] = useState<EventForm | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSource, setEditingSource] = useState<'evento' | 'consulta' | null>(null);
  const [initialProximoControl, setInitialProximoControl] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  const patient = detail?.paciente;
  const activeModule = useMemo(() => moduleFor(active), [active]);
  const ActiveIcon = activeModule.icon;

  const searchConsultorio = async (term = search) => {
    setLoadingSearch(true);
    try {
      setResults(await ConsultorioService.search({ q: term, limit: 30, offset: 0 }));
    } finally {
      setLoadingSearch(false);
    }
  };

  const loadPatient = async (id: number, nextActive = active, nextPage = 0, term = q) => {
    setLoadingRecord(true);
    try {
      const [nextDetail, nextItems] = await Promise.all([
        ConsultorioService.getPaciente(id),
        ConsultorioService.getTimeline(id, { tipo: nextActive, q: term, limit: PAGE_SIZE, offset: nextPage * PAGE_SIZE }),
      ]);
      setDetail(nextDetail);
      setItems(nextItems);
      setPage(nextPage);
      navigate(`/consultorio/${id}`, { replace: true });
    } finally {
      setLoadingRecord(false);
    }
  };

  useEffect(() => {
    if (idPaciente) loadPatient(Number(idPaciente), 'historia', 0, '');
    else searchConsultorio('');
  }, []);

  const changeModule = (tipo: ConsultorioTipo) => {
    setActive(tipo);
    setQ('');
    if (patient) loadPatient(patient.id_paciente, tipo, 0, '');
  };

  const refreshSection = (nextPage = page) => {
    if (patient) loadPatient(patient.id_paciente, active, nextPage, q);
  };

  const openCreate = (tipo: ConsultorioTipo = active === 'historia' ? 'consulta' : active) => {
    if (!patient) return;
    const mod = moduleFor(tipo);
    setEditingId(null);
    setEditingSource(null);
    setInitialProximoControl('');
    setModal({
      tipo,
      fecha_evento: nowLocal(),
      titulo: mod.label,
      resumen: '',
      detalle: '',
      enviar_correo: tipo === 'mensaje',
      payload: {},
      adjuntos: [],
    });
  };

  const openEdit = (item: ConsultorioEvento) => {
    const eventoId = getEventoId(item);
    const source = getEditableSource(item);
    if (!patient || !eventoId || !source) return;
    setEditingId(eventoId);
    setEditingSource(source);
    setInitialProximoControl(item.payload?.proximo_control || '');
    setModal({
      tipo: item.tipo,
      fecha_evento: toLocalInput(item.fecha_evento),
      titulo: item.titulo || moduleFor(item.tipo).label,
      resumen: item.resumen || '',
      detalle: (item as any).detalle || '',
      enviar_correo: false,
      payload: (item.payload && typeof item.payload === 'object') ? item.payload : {},
      adjuntos: Array.isArray(item.adjuntos) ? item.adjuntos as ClinicalAttachment[] : [],
    });
  };

  const deleteEvent = async (item: ConsultorioEvento) => {
    const eventoId = getEventoId(item);
    if (!patient || !eventoId || getEditableSource(item) !== 'evento') return;
    const r = await Swal.fire({
      title: '¿Eliminar este registro?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Eliminar', confirmButtonColor: '#dc2626', cancelButtonText: 'Cancelar',
    });
    if (!r.isConfirmed) return;
    try {
      await ConsultorioService.deleteEvento(eventoId);
      await loadPatient(patient.id_paciente, active, page, q);
      Swal.fire({ icon: 'success', title: 'Registro eliminado', timer: 1200, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo eliminar el registro', 'error');
    }
  };

  const saveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal || !patient) return;
    const payload = modal.payload || {};
    const resumen = modal.resumen || payloadSummary(modal.tipo, payload);
    const detalle = modal.detalle || payload.contenido || payload.descripcion || payload.plan || payload.notas || payload.observaciones || '';
    const data = {
      tipo: modal.tipo,
      titulo: modal.titulo,
      fecha_evento: modal.fecha_evento,
      resumen,
      detalle,
      payload,
      adjuntos: modal.adjuntos || [],
      enviar_correo: modal.enviar_correo,
    };
    const editing = editingId;
    // Las consultas legado (tabla "consultas") solo aceptan el motivo/SOAP/vitales;
    // no tienen proximo_control, así que la creación de cita no aplica al editarlas.
    // El mismo campo "proximo_control" existe en consulta y desparasitación.
    const proximoControlChanged = (modal.tipo === 'consulta' || modal.tipo === 'desparasitacion') && editingSource !== 'consulta'
      && !!payload.proximo_control && payload.proximo_control !== initialProximoControl;
    const citasAAgendar: Array<{ fecha: string; motivo: string }> = [];
    if (proximoControlChanged) {
      citasAAgendar.push({ fecha: payload.proximo_control, motivo: `Próximo control: ${payload.motivo || moduleFor(modal.tipo).label}` });
    }
    try {
      let quoteCode: string | null = null;
      if (editing && editingSource === 'consulta') {
        await ConsultasService.update(editing, {
          motivo: payload.motivo, subjetivo: payload.subjetivo, objetivo: payload.objetivo,
          evaluacion: payload.evaluacion, plan: payload.plan, peso: payload.peso,
          temperatura: payload.temperatura, frecuencia_cardiaca: payload.frecuencia_cardiaca,
          frecuencia_respiratoria: payload.frecuencia_respiratoria, condicion_corporal: payload.condicion_corporal,
        });
      } else if (editing) {
        await ConsultorioService.updateEvento(editing, data);
      } else if (modal.tipo === 'vacuna') {
        const vaccineItems = normalizeVaccinePayloadItems(payload).filter(item => (item.nombre_vacuna || '').trim());
        if (!vaccineItems.length) throw new Error('Agregue al menos una vacuna al carrito.');
        const fechaAplicacion = payload.fecha_aplicacion || toDateOnly(modal.fecha_evento);
        const result = await VacunasService.aplicar({
          id_paciente: patient.id_paciente,
          fecha_aplicacion: fechaAplicacion,
          veterinario: professionalName(payload.veterinario) || undefined,
          notas: payload.observaciones || payload.notas || detalle || undefined,
          generar_cotizacion: Boolean(payload.generar_cotizacion),
          observaciones_cotizacion: payload.observaciones_cotizacion || undefined,
          vacunas: vaccineItems.map(item => ({
            nombre_vacuna: (item.nombre_vacuna || '').trim(),
            id_medicamento: item.id_medicamento || undefined,
            id_presentacion: item.id_presentacion || undefined,
            presentacion: item.presentacion || undefined,
            cantidad: Number(item.cantidad || 1),
            precio_unitario: Number(item.precio_unitario || 0),
            tipo_isv: item.tipo_isv || 'exento',
            proxima_dosis: item.proxima_dosis || undefined,
            notas: item.notas || payload.observaciones || payload.notas || undefined,
          })),
        } as any);
        quoteCode = result.codigo_cotizacion || null;
        // Si la aplicación quedó agendada para otro día, se refleja en la agenda general.
        if (fechaAplicacion && fechaAplicacion !== toDateOnly()) {
          citasAAgendar.push({ fecha: fechaAplicacion, motivo: `Aplicación de vacuna: ${vaccineItems.map(v => v.nombre_vacuna).filter(Boolean).join(', ')}` });
        }
        // Cada próxima dosis programada también queda como cita en la agenda.
        vaccineItems.forEach(item => {
          if (item.proxima_dosis) citasAAgendar.push({ fecha: item.proxima_dosis, motivo: `Próxima dosis: ${item.nombre_vacuna}` });
        });
      } else {
        const created = await ConsultorioService.createEvento(patient.id_paciente, data);
        if (modal.tipo === 'formula' && payload.generar_cotizacion) {
          quoteCode = await createMedicationQuoteFromPayload(patient, payload, created.id_evento);
        } else if (modal.tipo === 'consulta' && payload.generar_cotizacion) {
          quoteCode = await createServiceQuoteFromPayload(patient, payload, created.id_evento);
        } else if (modal.tipo === 'desparasitacion' && payload.generar_cotizacion) {
          quoteCode = await createDesparasitacionQuoteFromPayload(patient, payload, created.id_evento);
        }
      }
      let citaCreada = false;
      let citaError = '';
      for (const cita of citasAAgendar) {
        try {
          await CitasService.create({
            id_paciente: patient.id_paciente,
            id_tutor: patient.id_tutor,
            id_veterinario: user?.codUsuario || undefined,
            fecha_inicio: `${cita.fecha}T09:00:00`,
            fecha_fin: `${cita.fecha}T09:30:00`,
            motivo: cita.motivo,
          } as any);
          citaCreada = true;
        } catch (citaErr: any) {
          citaError = citaErr.message || 'Cree la cita manualmente desde la Agenda.';
        }
      }
      setModal(null);
      setEditingId(null);
      setEditingSource(null);
      await loadPatient(patient.id_paciente, active, editing ? page : 0, q);
      if (citaError) {
        await Swal.fire('Registro guardado, pero no se pudo crear la cita', citaError, 'warning');
      } else {
        Swal.fire({
          icon: 'success',
          title: editing ? 'Registro actualizado' : 'Registro guardado',
          text: quoteCode
            ? `Cotizacion pendiente generada: ${quoteCode}`
            : citaCreada ? 'Se creó una cita para el próximo control en la agenda general.' : undefined,
          timer: (quoteCode || citaCreada) ? undefined : 1300,
          showConfirmButton: Boolean(quoteCode || citaCreada),
        });
      }
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo guardar el registro clínico', 'error');
    }
  };

  const goToBilling = async () => {
    if (!patient) return;
    const clienteId = patient.id_tutor || (patient as any).tutorId;
    if (!clienteId) { Swal.fire('Sin tutor', 'Este paciente no tiene un tutor asociado para facturar.', 'info'); return; }
    try {
      const hoy = new Date();
      const hasta = hoy.toISOString().slice(0, 10);
      const desdeD = new Date(hoy); desdeD.setDate(desdeD.getDate() - 180);
      const desde = desdeD.toISOString().slice(0, 10);
      const list = await QuoteService.list(desde, hasta, 'Emitida');
      const propias = (list || [])
        .filter(c => String(c.identidadCliente || '') === String(clienteId))
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      if (!propias.length) {
        const r = await Swal.fire({
          icon: 'info',
          title: 'Sin cobros pendientes',
          text: 'No hay cotizaciones pendientes para este cliente. Marca "Preparar cobro pendiente en recepción" al registrar la consulta o la receta.',
          showCancelButton: true, confirmButtonText: 'Ir a POS', cancelButtonText: 'Cerrar',
        });
        if (r.isConfirmed) navigate('/pos');
        return;
      }
      if (propias.length === 1) { navigate(`/pos?cotizacion=${propias[0].codigo}`); return; }
      const { value } = await Swal.fire({
        title: 'Cotizaciones pendientes',
        input: 'select',
        inputOptions: propias.reduce((acc, c) => { acc[c.codigo] = `${c.codigo} — ${money(c.total)}`; return acc; }, {} as Record<string, string>),
        inputPlaceholder: 'Seleccione la cotización a cobrar',
        showCancelButton: true, confirmButtonText: 'Cobrar en POS',
      });
      if (value) navigate(`/pos?cotizacion=${value}`);
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudieron cargar las cotizaciones', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Header patient={patient} onBack={() => { setDetail(null); setItems([]); navigate('/consultorio', { replace: true }); searchConsultorio(''); }} onBill={goToBilling} />

      {!patient ? (
        <SearchPanel
          search={search}
          setSearch={setSearch}
          loading={loadingSearch}
          results={results}
          onSearch={() => searchConsultorio()}
          onOpen={p => loadPatient(p.id_paciente, 'historia', 0, '')}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
          <PatientSidebar patient={patient} conteos={detail?.conteos || {}} active={active} onChange={changeModule} />
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
            <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`w-11 h-11 rounded-2xl bg-slate-50 grid place-items-center ${activeModule.accent}`}>
                  <ActiveIcon size={22} />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{activeModule.label} de <span className="text-teal-600">{patient.nombre}</span></h3>
                  <p className="text-xs text-slate-500">Historia clínica con filtros y paginación por sección.</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && refreshSection(0)} placeholder="Buscar en esta sección" className="w-full sm:w-64 pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm" />
                </div>
                <button onClick={() => refreshSection(0)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"><RefreshCw size={16} /> Filtrar</button>
                <button onClick={() => setExportOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 px-3 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"><FileDown size={16} /> Exportar</button>
                {activeModule.creatable && (
                  <button onClick={() => openCreate()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
                    <Plus size={17} /> Registrar
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 md:p-5 min-h-[420px]">
              {loadingRecord ? (
                <div className="p-16 text-center text-slate-400 font-bold">Cargando historia clínica...</div>
              ) : items.length === 0 ? (
                <EmptyState label={activeModule.label} onCreate={activeModule.creatable ? () => openCreate() : undefined} />
              ) : (
                <div className="space-y-3">
                  {items.map(item => <TimelineCard key={`${item.source || 'event'}-${item.id_evento || item.id}`} item={item} patient={patient} onEdit={openEdit} onDelete={deleteEvent} />)}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm">
              <span className="text-slate-500">Página {page + 1} - {items.length} registros</span>
              <div className="flex gap-2">
                <button disabled={page === 0 || loadingRecord} onClick={() => refreshSection(page - 1)} className="px-3 py-2 rounded-xl border disabled:opacity-40"><ChevronLeft size={16} /></button>
                <button disabled={items.length < PAGE_SIZE || loadingRecord} onClick={() => refreshSection(page + 1)} className="px-3 py-2 rounded-xl border disabled:opacity-40"><ChevronRight size={16} /></button>
              </div>
            </div>
          </section>
        </div>
      )}

      {modal && patient && (
        <EventModal form={modal} patient={patient} editing={!!editingId} legacyConsulta={editingSource === 'consulta'} setForm={setModal} onClose={() => { setModal(null); setEditingId(null); setEditingSource(null); }} onSubmit={saveEvent} />
      )}
      {exportOpen && patient && (
        <ClinicalHistoryExportModal patient={patient} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}

function Header({ patient, onBack, onBill }: { patient?: Paciente; onBack: () => void; onBill: () => void }) {
  if (!patient) return null;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button onClick={onBill} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 shadow-sm">
        <Receipt size={16} /> Facturar / Cobrar
      </button>
      <button onClick={onBack} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white">Volver al buscador</button>
    </div>
  );
}

function SearchPanel({ search, setSearch, loading, results, onSearch, onOpen }: {
  search: string; setSearch: (v: string) => void; loading: boolean; results: ConsultorioBusquedaItem[];
  onSearch: () => void; onOpen: (p: Paciente) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSearch()} placeholder="Buscar por tutor, teléfono, correo, mascota, especie, raza o código paciente" className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <button onClick={onSearch} className="rounded-2xl bg-slate-900 px-6 py-4 text-sm font-semibold text-white">{loading ? 'Buscando...' : 'Buscar'}</button>
        </div>
      </div>
      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {results.map(owner => (
          <article key={owner.identidad} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 grid place-items-center font-semibold">{initials(owner.nombre)}</div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 truncate">{owner.nombre}</h3>
                  <p className="text-xs text-slate-500 truncate">{owner.telefono || 'Sin teléfono'} {owner.correo ? `- ${owner.correo}` : ''}</p>
                  <p className="text-xs text-slate-400">{owner.totalPacientes} paciente(s) registrados</p>
                </div>
              </div>
              <Users className="text-slate-300 shrink-0" size={22} />
            </div>
            <div className="mt-4 space-y-2">
              {(owner.pacientes || []).map(p => (
                <button key={p.id_paciente} onClick={() => onOpen(p)} className="w-full rounded-xl bg-white border border-slate-200 p-3 text-left hover:border-teal-300 hover:bg-teal-50 transition-colors">
                  <div className="flex items-center gap-3">
                    {p.foto_base64 ? <img src={p.foto_base64} alt={p.nombre} className="w-11 h-11 rounded-xl object-cover" /> : <div className="w-11 h-11 rounded-xl bg-teal-100 text-teal-700 grid place-items-center font-semibold">{initials(p.nombre)}</div>}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{p.nombre}</p>
                      <p className="text-xs text-slate-500 truncate">{patientSubtitle(p)}</p>
                    </div>
                  </div>
                </button>
              ))}
              {owner.totalPacientes === 0 && <p className="text-sm text-slate-400 bg-white rounded-xl p-3 border border-dashed border-slate-200">Tutor sin pacientes registrados.</p>}
            </div>
          </article>
        ))}
        {!loading && results.length === 0 && <div className="lg:col-span-2 p-12 text-center text-slate-400 font-medium">Sin resultados. Busque por tutor o mascota para abrir el consultorio.</div>}
      </div>
    </div>
  );
}

function PatientSidebar({ patient, conteos, active, onChange }: { patient: any; conteos: Record<string, number>; active: ConsultorioTipo; onChange: (tipo: ConsultorioTipo) => void }) {
  return (
    <aside className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex gap-4">
          {patient.foto_base64 ? <img src={patient.foto_base64} alt={patient.nombre} className="h-20 w-20 rounded-2xl object-cover" /> : <div className="h-20 w-20 rounded-2xl bg-teal-100 text-teal-700 grid place-items-center font-semibold text-xl">{initials(patient.nombre)}</div>}
          <div className="min-w-0">
            <h3 className="font-bold text-xl text-slate-900 truncate">{patient.nombre}</h3>
            <p className="text-sm text-slate-500">{patientSubtitle(patient)}</p>
            <p className="text-xs text-slate-400 mt-1">Peso: {patient.peso_actual ? `${patient.peso_actual} kg` : 'No registrado'}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
          <Info label="Tutor" value={patient.tutorNombre} />
          <Info label="Teléfono" value={patient.tutorTelefono} />
          <Info label="Correo" value={patient.tutorCorreo || (patient.tutorSinCorreo ? 'Sin correo' : 'No registrado')} />
          <Info label="Código paciente" value={patient.microchip} />
        </div>
        {(patient.alergias || patient.condiciones_cronicas) && (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-800">
            <b>Alertas clínicas</b>
            <p className="mt-1">{patient.alergias || patient.condiciones_cronicas}</p>
          </div>
        )}
      </div>
      <nav className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2 max-h-[70vh] overflow-auto">
        {MODULES.map(m => {
          const Icon = m.icon;
          const selected = active === m.tipo;
          return (
            <button key={m.tipo} onClick={() => onChange(m.tipo)} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${selected ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon size={18} className={selected ? 'text-teal-600' : m.accent} />
              <span className="flex-1 truncate">{m.label}</span>
              <span className={`text-[11px] rounded-full px-2 py-0.5 font-semibold ${selected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{conteos[m.tipo] || 0}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function TimelineCard({ item, patient, onEdit, onDelete }: {
  item: ConsultorioEvento; patient?: Paciente;
  onEdit?: (item: ConsultorioEvento) => void; onDelete?: (item: ConsultorioEvento) => void;
}) {
  const mod = moduleFor(item.tipo);
  const Icon = mod.icon;
  const payload = item.payload || {};
  const chips = Object.entries(payload).filter(([, v]) => v !== null && v !== undefined && displayPayloadValue(v).trim() !== '').slice(0, 6);
  const attachments = Array.isArray(item.adjuntos) ? item.adjuntos as ClinicalAttachment[] : [];
  const docTemplateId = item.tipo === 'documento' ? CLINICAL_DOC_LABEL_TO_ID[payload.tipo_documento] : undefined;
  const canPrintSingle = item.tipo === 'formula' || !!docTemplateId;
  const eventoId = getEventoId(item);
  const canDelete = eventoId != null && getEditableSource(item) === 'evento';
  const printThis = async () => {
    if (!patient) return;
    try {
      if (docTemplateId) {
        const clientes = await ClientService.getAll().catch(() => [] as Cliente[]);
        const cliente = clientes.find(c => c.identidad === patient.id_tutor) || null;
        await printClinicalDocumentTemplate(docTemplateId, patient, cliente, payload);
      } else {
        await printClinicalEvent(patient, item);
      }
    } catch (err: any) {
      Swal.fire('No se pudo imprimir', err.message || 'Intente de nuevo.', 'error');
    }
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-teal-200 transition-colors">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <span className={`w-10 h-10 rounded-2xl bg-slate-50 grid place-items-center ${mod.accent}`}><Icon size={20} /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold text-slate-900">{item.titulo || mod.label}</h4>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{item.tipoLabel || mod.label}</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{fmtDate(item.fecha_evento)} {item.estado ? `- ${item.estado}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {item.correo_enviado && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><Send size={12} /> Enviado</span>}
          {canPrintSingle && (
            <button type="button" onClick={printThis} className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
              <Printer size={13} /> Imprimir
            </button>
          )}
          {eventoId && onEdit && (
            <button type="button" onClick={() => onEdit(item)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" title="Editar">
              <Pencil size={13} /> Editar
            </button>
          )}
          {canDelete && onDelete && (
            <button type="button" onClick={() => onDelete(item)} className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50" title="Eliminar">
              <Trash2 size={13} /> Eliminar
            </button>
          )}
        </div>
      </div>
      {(item.resumen || item.detalle) && <p className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">{item.resumen || item.detalle}</p>}
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map(([k, v]) => <span key={k} className="rounded-full bg-slate-50 border border-slate-100 px-2.5 py-1 text-xs text-slate-500"><b>{k.replace(/_/g, ' ')}:</b> {displayPayloadValue(v).slice(0, 45)}</span>)}
        </div>
      )}
      {attachments.length > 0 && (
        <AttachmentList attachments={attachments} compact />
      )}
    </article>
  );
}

function EventModal({ form, patient, editing, legacyConsulta, setForm, onClose, onSubmit }: {
  form: EventForm; patient: Paciente; editing?: boolean; legacyConsulta?: boolean; setForm: (f: EventForm) => void; onClose: () => void; onSubmit: (e: React.FormEvent) => void;
}) {
  const mod = moduleFor(form.tipo);
  const Icon = mod.icon;
  const fields = fieldsFor(form.tipo);
  const docTemplateId = form.tipo === 'documento' ? CLINICAL_DOC_LABEL_TO_ID[form.payload.tipo_documento] : undefined;
  const visibleFields = form.tipo === 'vacuna' ? [] : form.tipo === 'laboratorio' ? fields.filter(field => field.key === 'diagnostico')
    : docTemplateId ? fields.filter(field => field.key === 'tipo_documento' || field.key === 'archivo_documento')
    : fields;
  const hasFileField = form.tipo === 'vacuna' || form.tipo === 'laboratorio' || visibleFields.some(field => field.type === 'file');
  const fieldByKey = (key: string) => fields.find(f => f.key === key);
  const updatePayload = (key: string, value: any) => setForm({ ...form, payload: { ...form.payload, [key]: value } });
  const updateAttachments = (adjuntos: ClinicalAttachment[]) => setForm({ ...form, adjuntos });
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between">
          <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2"><Icon className={mod.accent} size={22} /> {editing ? 'Editar' : 'Registro de'} {mod.label} - {patient.nombre}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-5">
          {legacyConsulta && (
            <p className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-800">
              Esta consulta es de un registro anterior: la fecha de la consulta no se puede modificar (puedes editar motivo, signos vitales y notas SOAP).
            </p>
          )}
          {!legacyConsulta && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Label label="Fecha y hora">
              <input type="datetime-local" value={form.fecha_evento} onChange={e => setForm({ ...form, fecha_evento: e.target.value })} className={INPUT_CLASS} />
            </Label>
            <Label label="Título">
              <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className={INPUT_CLASS} />
            </Label>
            <label className="flex items-center gap-3 rounded-xl bg-white border border-slate-200 px-4 py-3 mt-5">
              <input type="checkbox" checked={form.enviar_correo} onChange={e => setForm({ ...form, enviar_correo: e.target.checked })} className="h-4 w-4" />
              <span className="text-sm font-semibold text-slate-700">Enviar correo al tutor</span>
            </label>
          </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {form.tipo === 'laboratorio' && (
              <LaboratoryTestsEditor
                value={Array.isArray(form.payload.pruebas) ? form.payload.pruebas : []}
                onChange={value => updatePayload('pruebas', value)}
                patientId={patient.id_paciente}
                tipo={form.tipo}
                attachments={form.adjuntos}
                onAttachmentsChange={updateAttachments}
              />
            )}
            {form.tipo === 'vacuna' && (
              <VaccineApplicationEditor
                patient={patient}
                payload={form.payload}
                onChange={patch => setForm({ ...form, payload: { ...form.payload, ...patch } })}
              />
            )}
            {form.tipo === 'formula' && (
              <MedicationItemsEditor
                value={Array.isArray(form.payload.medicamentos) ? form.payload.medicamentos : []}
                onChange={value => updatePayload('medicamentos', value)}
                cobroPendiente={!!form.payload.generar_cotizacion}
                onCobroPendienteChange={v => updatePayload('generar_cotizacion', v)}
              />
            )}
            {form.tipo === 'desparasitacion' && (
              <DesparasitacionItemsEditor
                value={Array.isArray(form.payload.productos) ? form.payload.productos : []}
                onChange={value => updatePayload('productos', value)}
                cobroPendiente={!!form.payload.generar_cotizacion}
                onCobroPendienteChange={v => updatePayload('generar_cotizacion', v)}
              />
            )}
            {form.tipo === 'documento' && (
              <DocumentTemplateBlock patient={patient} payload={form.payload} onChange={updatePayload} />
            )}
            {form.tipo !== 'consulta' && visibleFields.map(field => (
              <Field
                key={field.key}
                field={field}
                value={form.payload[field.key] || ''}
                onChange={v => updatePayload(field.key, v)}
                patientId={patient.id_paciente}
                tipo={form.tipo}
                attachments={form.adjuntos}
                onAttachmentsChange={updateAttachments}
              />
            ))}
          </div>
          {form.tipo === 'consulta' && (
            <ConsultaFields
              fieldByKey={fieldByKey}
              payload={form.payload}
              onChange={updatePayload}
              patientId={patient.id_paciente}
              tipo={form.tipo}
              attachments={form.adjuntos}
              onAttachmentsChange={updateAttachments}
              showProximoControl={!legacyConsulta}
            />
          )}
          {!hasFileField && form.tipo !== 'formula' && (
            <AttachmentUploader
              label="Adjuntos del expediente"
              helper="Agregue imagenes, resultados, PDF o documentos relacionados con este registro."
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.dcm"
              patientId={patient.id_paciente}
              tipo={form.tipo}
              categoria="adjunto"
              attachments={form.adjuntos}
              onChange={updateAttachments}
            />
          )}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-5 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 font-semibold text-slate-600">Cancelar</button>
          <button className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 font-semibold text-white shadow-lg shadow-indigo-600/20"><Plus size={16} /> Guardar registro</button>
        </div>
      </form>
    </div>
  );
}

function VaccineApplicationEditor({ patient, payload, onChange }: {
  patient: Paciente;
  payload: Record<string, any>;
  onChange: (patch: Record<string, any>) => void;
}) {
  useEffect(() => {
    const patch: Record<string, any> = {};
    if (!payload.fecha_aplicacion) patch.fecha_aplicacion = toDateOnly();
    if (payload.generar_cotizacion === undefined) patch.generar_cotizacion = true;
    if (!Array.isArray(payload.vacunas)) patch.vacunas = normalizeVaccinePayloadItems(payload);
    if (Object.keys(patch).length) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="md:col-span-2 grid grid-cols-1 gap-5 md:grid-cols-2">
      <div className="md:col-span-2 rounded-2xl border border-teal-100 bg-teal-50/60 p-4">
        <p className="text-sm font-medium text-slate-800">Paciente seleccionado</p>
        <p className="mt-1 text-sm text-slate-600">
          {patient.nombre} - {patient.especie || 'Sin especie'} {patient.tutorNombre ? `- Tutor: ${patient.tutorNombre}` : ''}
        </p>
      </div>

      <Label label="Fecha aplicacion">
        <input type="date" value={payload.fecha_aplicacion || toDateOnly()} onChange={e => onChange({ fecha_aplicacion: e.target.value })} className={INPUT_CLASS} />
      </Label>

      <Label label="Veterinario que aplica">
        <ProfessionalSelect value={payload.veterinario} onChange={veterinario => onChange({ veterinario })} />
      </Label>

      <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 text-sm font-normal text-slate-700">
        <input
          type="checkbox"
          checked={payload.generar_cotizacion !== false}
          onChange={e => onChange({ generar_cotizacion: e.target.checked })}
          className="mt-1 h-4 w-4"
        />
        <span>
          <span className="block font-medium text-slate-800">Preparar cobro pendiente en recepcion</span>
          <span className="text-xs text-slate-500">La vacuna aplicada quedara en una cotizacion para que caja la cobre al salir del consultorio.</span>
        </span>
      </label>

      <VaccineItemsEditor
        value={Array.isArray(payload.vacunas) ? payload.vacunas : []}
        onChange={vacunas => onChange({ vacunas })}
      />

      <Label label="Observaciones" wide>
        <textarea value={payload.observaciones || ''} onChange={e => onChange({ observaciones: e.target.value })} placeholder="Observaciones" className={`${INPUT_CLASS} min-h-[100px]`} />
      </Label>
    </div>
  );
}

function DocumentTemplateBlock({ patient, payload, onChange }: {
  patient: Paciente;
  payload: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  const { user } = useAuth();
  const [printing, setPrinting] = useState(false);
  const templateId = CLINICAL_DOC_LABEL_TO_ID[payload.tipo_documento];

  useEffect(() => {
    if (templateId && !payload.medico_nombre && user?.nombreEmpleado) {
      onChange('medico_nombre', user.nombreEmpleado);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  if (!templateId) return null;

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const clientes = await ClientService.getAll().catch(() => [] as Cliente[]);
      const cliente = clientes.find(c => c.identidad === patient.id_tutor) || null;
      await printClinicalDocumentTemplate(templateId, patient, cliente, {
        medico_nombre: payload.medico_nombre,
        diagnostico: payload.diagnostico,
        tratamiento: payload.tratamiento,
        notas_dr: payload.notas_dr,
        motivo_hospitalizacion: payload.motivo_hospitalizacion,
        procedimiento_menor: payload.procedimiento_menor,
        procedimiento_mayor: payload.procedimiento_mayor,
      });
    } catch (err: any) {
      Swal.fire('No se pudo imprimir', err.message || 'Intente de nuevo.', 'error');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="md:col-span-2 grid grid-cols-1 gap-5 md:grid-cols-2">
      <div className="md:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-slate-700">
        Los datos del paciente y del tutor se completan automáticamente desde el expediente. Solo complete la información clínica que no
        está registrada; la firma queda en blanco para que el tutor/responsable firme al imprimir.
      </div>
      {templateId === 'alta_voluntaria' && (
        <>
          <Label label="Médico veterinario">
            <input value={payload.medico_nombre || ''} onChange={e => onChange('medico_nombre', e.target.value)} className={INPUT_CLASS} />
          </Label>
          <Label label="Diagnóstico">
            <input value={payload.diagnostico || ''} onChange={e => onChange('diagnostico', e.target.value)} className={INPUT_CLASS} />
          </Label>
          <Label label="Tratamiento y/o exámenes recomendados" wide>
            <textarea value={payload.tratamiento || ''} onChange={e => onChange('tratamiento', e.target.value)} className={`${INPUT_CLASS} min-h-[80px]`} />
          </Label>
          <Label label="Notas del Dr." wide>
            <textarea value={payload.notas_dr || ''} onChange={e => onChange('notas_dr', e.target.value)} className={`${INPUT_CLASS} min-h-[80px]`} />
          </Label>
        </>
      )}
      {templateId === 'autorizacion_sedacion' && (
        <>
          <Label label="Procedimiento menor">
            <input value={payload.procedimiento_menor || ''} onChange={e => onChange('procedimiento_menor', e.target.value)} className={INPUT_CLASS} placeholder="Ej. sutura, limpieza dental..." />
          </Label>
          <Label label="Procedimiento mayor">
            <input value={payload.procedimiento_mayor || ''} onChange={e => onChange('procedimiento_mayor', e.target.value)} className={INPUT_CLASS} placeholder="Ej. esterilización, cirugía..." />
          </Label>
        </>
      )}
      {templateId === 'consentimiento_hospitalizacion' && (
        <Label label="Motivo de la hospitalización" wide>
          <textarea value={payload.motivo_hospitalizacion || ''} onChange={e => onChange('motivo_hospitalizacion', e.target.value)} className={`${INPUT_CLASS} min-h-[80px]`} />
        </Label>
      )}
      <div className="md:col-span-2">
        <button type="button" onClick={handlePrint} disabled={printing} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60">
          <Printer size={16} /> {printing ? 'Generando...' : 'Vista previa e imprimir'}
        </button>
      </div>
    </div>
  );
}

function ConsultaFields({ fieldByKey, payload, onChange, patientId, tipo, attachments, onAttachmentsChange, showProximoControl = true }: {
  fieldByKey: (key: string) => FieldDef | undefined;
  payload: Record<string, any>;
  onChange: (key: string, value: any) => void;
  patientId: number;
  tipo: ConsultorioTipo;
  attachments: ClinicalAttachment[];
  onAttachmentsChange: (items: ClinicalAttachment[]) => void;
  showProximoControl?: boolean;
}) {
  const renderField = (key: string) => {
    const field = fieldByKey(key);
    if (!field) return null;
    return (
      <Field
        key={key}
        field={field}
        value={payload[key] || ''}
        onChange={v => onChange(key, v)}
        patientId={patientId}
        tipo={tipo}
        attachments={attachments}
        onAttachmentsChange={onAttachmentsChange}
      />
    );
  };
  return (
    <div className="space-y-5 md:col-span-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {renderField('motivo')}
        {renderField('peso')}
        {renderField('temperatura')}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {renderField('frecuencia_cardiaca')}
        {renderField('frecuencia_respiratoria')}
        {renderField('condicion_corporal')}
      </div>
      <div className="grid grid-cols-1 gap-5">
        {renderField('subjetivo')}
      </div>
      <ServiceItemsEditor
        value={Array.isArray(payload.servicios) ? payload.servicios : []}
        onChange={v => onChange('servicios', v)}
        cobroPendiente={!!payload.generar_cotizacion}
        onCobroPendienteChange={v => onChange('generar_cotizacion', v)}
      />
      <div className="grid grid-cols-1 gap-5">
        {renderField('objetivo')}
        {renderField('evaluacion')}
        {renderField('plan')}
      </div>
      {showProximoControl && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            {renderField('proximo_control')}
            <p className="mt-1.5 text-xs text-slate-400">Al guardar con esta fecha se crea automáticamente una cita en la agenda general.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ field, value, onChange, patientId, tipo, attachments, onAttachmentsChange }: {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
  patientId: number;
  tipo: ConsultorioTipo;
  attachments: ClinicalAttachment[];
  onAttachmentsChange: (items: ClinicalAttachment[]) => void;
}) {
  if (field.type === 'file') {
    return (
      <div className={field.wide ? 'md:col-span-2' : ''}>
        <AttachmentUploader
          label={field.label}
          helper={field.helper}
          accept={field.accept}
          patientId={patientId}
          tipo={tipo}
          categoria={field.key}
          attachments={attachments}
          onChange={onAttachmentsChange}
        />
      </div>
    );
  }
  if (field.type === 'professional') {
    return (
      <Label label={field.label} wide={field.wide}>
        <ProfessionalSelect value={value} onChange={onChange} />
      </Label>
    );
  }
  return (
    <Label label={field.label} wide={field.wide}>
      {field.type === 'textarea' ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || field.label} className={`${INPUT_CLASS} min-h-[110px]`} />
      ) : field.type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} className={INPUT_CLASS}>
          <option value="">Seleccione una opción</option>
          {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? '0.01' : undefined} value={value} onChange={e => onChange(field.type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value)} placeholder={field.placeholder || field.label} className={INPUT_CLASS} />
      )}
    </Label>
  );
}

function Label({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`block text-sm font-normal text-indigo-900/70 ${wide ? 'md:col-span-2' : ''}`}><span>{label}</span><div className="mt-2">{children}</div></label>;
}

function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  return <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 min-w-0"><p className="text-xs font-semibold text-slate-400 uppercase">{label}</p><p className="mt-1 font-medium text-slate-800 truncate">{value || 'No registrado'}</p></div>;
}

function EmptyState({ label, onCreate }: { label: string; onCreate?: () => void }) {
  return (
    <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60">
      <PawPrint className="mx-auto text-slate-300" size={44} />
      <h4 className="mt-3 font-semibold text-slate-700">No hay registros de {label.toLowerCase()}</h4>
      <p className="text-sm text-slate-400 mt-1">Cuando se registre información clínica, aparecerá aquí con fecha, estado y detalle.</p>
      {onCreate && <button onClick={onCreate} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Registrar</button>}
    </div>
  );
}

function payloadSummary(tipo: ConsultorioTipo, payload: Record<string, any>) {
  if (tipo === 'laboratorio' && Array.isArray(payload.pruebas)) {
    const pruebas = payload.pruebas.map((item: any) => item.prueba).filter(Boolean).join(', ');
    if (pruebas) return `Pruebas solicitadas: ${pruebas}`;
  }
  if (tipo === 'formula' && Array.isArray(payload.medicamentos)) {
    const medicamentos = payload.medicamentos.map((item: any) => item.medicamento).filter(Boolean).join(', ');
    if (medicamentos) return `Recetado: ${medicamentos}`;
  }
  return payload.mensaje || payload.motivo || payload.diagnostico || payload.observaciones || payload.detalles || '';
}

function displayPayloadValue(value: any): string {
  if (Array.isArray(value)) return value.map(displayPayloadValue).filter(Boolean).join('; ');
  if (value && typeof value === 'object') return value.nombre || value.prueba || value.medicamento || value.titulo || JSON.stringify(value);
  return String(value ?? '');
}
