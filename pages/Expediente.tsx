import React, { useEffect, useMemo, useState } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { useParams, useNavigate } = ReactRouterDOM as any;
import { ConsultorioService } from '../services/api';
import { ConsultorioBusquedaItem, ConsultorioEvento, ConsultorioPacienteDetalle, ConsultorioTipo, Paciente } from '../types';
import {
  ChevronLeft, ChevronRight, PawPrint,
  FileDown, Plus, RefreshCw, Search, Send,
  Users, X,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { ClinicalHistoryExportModal } from '../components/consultorio/ClinicalHistoryExportModal';
import { AttachmentList, AttachmentUploader, type ClinicalAttachment } from '../components/consultorio/ClinicalAttachments';
import { LaboratoryTestsEditor } from '../components/consultorio/LaboratoryTestsEditor';
import { MedicationItemsEditor } from '../components/consultorio/MedicationItemsEditor';
import { ProfessionalSelect } from '../components/consultorio/ProfessionalSelect';
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

export default function Expediente() {
  const { idPaciente } = useParams();
  const navigate = useNavigate();
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

  const saveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal || !patient) return;
    const payload = modal.payload || {};
    const resumen = modal.resumen || payloadSummary(modal.tipo, payload);
    const detalle = modal.detalle || payload.contenido || payload.descripcion || payload.plan || payload.notas || payload.observaciones || '';
    try {
      await ConsultorioService.createEvento(patient.id_paciente, {
        tipo: modal.tipo,
        titulo: modal.titulo,
        fecha_evento: modal.fecha_evento,
        resumen,
        detalle,
        payload,
        adjuntos: modal.adjuntos || [],
        enviar_correo: modal.enviar_correo,
      });
      setModal(null);
      await loadPatient(patient.id_paciente, active, 0, q);
      Swal.fire({ icon: 'success', title: 'Registro guardado', timer: 1300, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo guardar el registro clínico', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <Header patient={patient} onBack={() => { setDetail(null); setItems([]); navigate('/consultorio', { replace: true }); searchConsultorio(''); }} />

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
                  {items.map(item => <TimelineCard key={`${item.source || 'event'}-${item.id_evento || item.id}`} item={item} />)}
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
        <EventModal form={modal} patient={patient} setForm={setModal} onClose={() => setModal(null)} onSubmit={saveEvent} />
      )}
      {exportOpen && patient && (
        <ClinicalHistoryExportModal patient={patient} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}

function Header({ patient, onBack }: { patient?: Paciente; onBack: () => void }) {
  if (!patient) return null;
  return (
    <div className="flex justify-end">
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
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSearch()} placeholder="Buscar por tutor, teléfono, correo, mascota, especie, raza o microchip" className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-teal-500" />
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
          <Info label="Microchip" value={patient.microchip} />
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

function TimelineCard({ item }: { item: ConsultorioEvento }) {
  const mod = moduleFor(item.tipo);
  const Icon = mod.icon;
  const payload = item.payload || {};
  const chips = Object.entries(payload).filter(([, v]) => v !== null && v !== undefined && displayPayloadValue(v).trim() !== '').slice(0, 6);
  const attachments = Array.isArray(item.adjuntos) ? item.adjuntos as ClinicalAttachment[] : [];
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
        {item.correo_enviado && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><Send size={12} /> Enviado</span>}
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

function EventModal({ form, patient, setForm, onClose, onSubmit }: {
  form: EventForm; patient: Paciente; setForm: (f: EventForm) => void; onClose: () => void; onSubmit: (e: React.FormEvent) => void;
}) {
  const mod = moduleFor(form.tipo);
  const Icon = mod.icon;
  const fields = fieldsFor(form.tipo);
  const visibleFields = form.tipo === 'laboratorio' ? fields.filter(field => field.key === 'diagnostico') : fields;
  const hasFileField = form.tipo === 'laboratorio' || visibleFields.some(field => field.type === 'file');
  const updatePayload = (key: string, value: any) => setForm({ ...form, payload: { ...form.payload, [key]: value } });
  const updateAttachments = (adjuntos: ClinicalAttachment[]) => setForm({ ...form, adjuntos });
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between">
          <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2"><Icon className={mod.accent} size={22} /> Registro de {mod.label} - {patient.nombre}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-5">
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
            {form.tipo === 'formula' && (
              <MedicationItemsEditor
                value={Array.isArray(form.payload.medicamentos) ? form.payload.medicamentos : []}
                onChange={value => updatePayload('medicamentos', value)}
              />
            )}
            {visibleFields.map(field => (
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
          {!hasFileField && (
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
