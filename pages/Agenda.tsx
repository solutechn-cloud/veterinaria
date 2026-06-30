import React, { useEffect, useMemo, useState } from 'react';
import { CitasService, PacientesService } from '../services/api';
import { AgendaVeterinario, Cita, EstadoCita, Paciente, TipoCita } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  Mail, Plus, RefreshCw, Search, UserRound, X,
} from 'lucide-react';
import Swal from 'sweetalert2';

const hours = Array.from({ length: 14 }, (_, i) => i + 6);
const statuses: EstadoCita[] = ['Programada', 'Confirmada', 'En espera', 'En consulta', 'Completada', 'No asistio', 'Cancelada'];
const views = ['Programador', 'Semana', 'Dia', 'Lista'] as const;
type AgendaView = typeof views[number];

const today = () => new Date().toISOString().slice(0, 10);
const toLocalInput = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const addDays = (date: string, amount: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
};
const startOfWeek = (date: string) => {
  const d = new Date(`${date}T12:00:00`);
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
};
const formatTime = (value: string) => new Date(value).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
const formatLong = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();

function monthDays(date: string) {
  const base = new Date(`${date}T12:00:00`);
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const offset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const statusTone: Record<string, string> = {
  Programada: 'bg-blue-50 text-blue-700 border-blue-100',
  Confirmada: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  'En espera': 'bg-amber-50 text-amber-700 border-amber-100',
  'En consulta': 'bg-indigo-50 text-indigo-700 border-indigo-100',
  Completada: 'bg-slate-100 text-slate-700 border-slate-200',
  'No asistio': 'bg-orange-50 text-orange-700 border-orange-100',
  Cancelada: 'bg-red-50 text-red-700 border-red-100',
};

interface AgendaBoardProps {
  personal?: boolean;
}

export function AgendaBoard({ personal = false }: AgendaBoardProps) {
  const { user } = useAuth();
  const [date, setDate] = useState(today());
  const [view, setView] = useState<AgendaView>(personal ? 'Lista' : 'Programador');
  const [appointments, setAppointments] = useState<Cita[]>([]);
  const [patients, setPatients] = useState<Paciente[]>([]);
  const [types, setTypes] = useState<TipoCita[]>([]);
  const [vets, setVets] = useState<AgendaVeterinario[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [vetFilter, setVetFilter] = useState(personal ? user?.codUsuario || '' : '');
  const [showModal, setShowModal] = useState(false);
  const [reserveOnly, setReserveOnly] = useState(false);
  const [form, setForm] = useState<Partial<Cita>>({
    estado: 'Programada',
    fecha_inicio: toLocalInput(),
    fecha_fin: toLocalInput(new Date(Date.now() + 30 * 60000)),
  });

  const visibleDates = useMemo(() => {
    if (view === 'Semana') {
      const start = startOfWeek(date);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    return [date];
  }, [date, view]);

  const load = async () => {
    setLoading(true);
    try {
      const desde = view === 'Semana' ? startOfWeek(date) : date;
      const hasta = view === 'Semana' ? addDays(desde, 6) : date;
      const veterinarian = personal ? (user?.codUsuario || vetFilter) : vetFilter;
      const [citas, pacientes, tipos, veterinarios] = await Promise.all([
        CitasService.getAll({ fecha_desde: desde, fecha_hasta: hasta, estado: status || undefined, id_veterinario: veterinarian || undefined }),
        PacientesService.getAll({ limit: 200 }),
        CitasService.getTipos(),
        CitasService.getVeterinarios(),
      ]);
      setAppointments(citas);
      setPatients(pacientes);
      setTypes(tipos);
      setVets(veterinarios.length ? veterinarios : user ? [{ id_veterinario: user.codUsuario, nombre: user.nombreEmpleado || user.usuario }] : []);
      if (personal && user?.codUsuario) setVetFilter(user.codUsuario);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [date, view, status, vetFilter, personal, user?.codUsuario]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return appointments;
    return appointments.filter(c => [
      c.pacienteNombre, c.tutorNombre, c.tutorTelefono, c.tipoCitaNombre, c.veterinarioNombre, c.motivo,
    ].some(v => String(v || '').toLowerCase().includes(q)));
  }, [appointments, query]);

  const schedulerVets = useMemo(() => {
    const source = personal ? vets.filter(v => v.id_veterinario === (user?.codUsuario || vetFilter)) : vets;
    const rows = source.length ? source : [{ id_veterinario: 'sin-asignar', nombre: 'Sin asignar' }];
    if (vetFilter && !personal) return rows.filter(v => v.id_veterinario === vetFilter);
    return rows;
  }, [personal, user?.codUsuario, vetFilter, vets]);

  const openNew = (slot?: { date: string; hour: number; vet?: string }) => {
    const start = slot ? new Date(`${slot.date}T${String(slot.hour).padStart(2, '0')}:00:00`) : new Date();
    const end = new Date(start.getTime() + 30 * 60000);
    setForm({
      estado: 'Programada',
      fecha_inicio: toLocalInput(start),
      fecha_fin: toLocalInput(end),
      id_veterinario: slot?.vet && slot.vet !== 'sin-asignar' ? slot.vet : (personal ? user?.codUsuario : vetFilter) || undefined,
    });
    setReserveOnly(false);
    setShowModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const patient = patients.find(p => String(p.id_paciente) === String(form.id_paciente));
      await CitasService.create({
        ...form,
        id_paciente: reserveOnly ? undefined : form.id_paciente ? Number(form.id_paciente) : undefined,
        id_tutor: reserveOnly ? form.id_tutor : (patient?.id_tutor || form.id_tutor),
      });
      setShowModal(false);
      await load();
      Swal.fire({ icon: 'success', title: 'Cita programada', text: 'Los recordatorios por correo quedaron en cola si el tutor tiene email.', timer: 1800, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo programar la cita', 'error');
    }
  };

  const changeStatus = async (cita: Cita, next: EstadoCita) => {
    await CitasService.updateEstado(cita.id_cita, next);
    await load();
  };

  const renderMiniCalendar = () => (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm font-black text-slate-700">
        <button onClick={() => setDate(addDays(date, -30))} className="p-1 rounded-lg hover:bg-slate-100">«</button>
        {new Date(`${date}T12:00:00`).toLocaleDateString('es-HN', { month: 'long', year: 'numeric' })}
        <button onClick={() => setDate(addDays(date, 30))} className="p-1 rounded-lg hover:bg-slate-100">»</button>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
        {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map(d => <span key={d} className="font-bold">{d}</span>)}
        {monthDays(date).map(d => {
          const value = d.toISOString().slice(0, 10);
          const active = value === date;
          const muted = d.getMonth() !== new Date(`${date}T12:00:00`).getMonth();
          return (
            <button key={value} onClick={() => setDate(value)} className={`h-8 rounded-lg text-xs ${active ? 'bg-indigo-600 text-white font-black' : muted ? 'text-slate-300 hover:bg-slate-50' : 'text-slate-600 hover:bg-indigo-50'}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mt-4 space-y-2">
        <select value={vetFilter} disabled={personal} onChange={e => setVetFilter(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todos los veterinarios</option>
          {vets.map(v => <option key={v.id_veterinario} value={v.id_veterinario}>{v.nombre}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todos los estados</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );

  const renderScheduler = () => (
    <div className="overflow-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="min-w-[1100px]">
        <div className="grid border-b border-slate-100" style={{ gridTemplateColumns: `260px repeat(${hours.length}, 92px)` }}>
          <div className="sticky left-0 z-10 bg-white p-3 text-sm font-black text-slate-700">Usuarios</div>
          {hours.map(h => <div key={h} className="border-l border-slate-100 p-3 text-center text-sm font-black text-slate-500">{h <= 12 ? `${h} a.m.` : `${h - 12} p.m.`}</div>)}
        </div>
        {schedulerVets.map(vet => (
          <div key={vet.id_veterinario} className="grid min-h-[92px] border-b border-slate-100" style={{ gridTemplateColumns: `260px repeat(${hours.length}, 92px)` }}>
            <div className="sticky left-0 z-10 flex items-center gap-3 bg-white p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><UserRound size={18} /></div>
              <div>
                <p className="font-black text-slate-800">{vet.nombre}</p>
                <p className="text-xs text-slate-400">{vet.sucursalNombre || 'Agenda clinica'}</p>
              </div>
            </div>
            {hours.map(hour => {
              const cellCitas = filtered.filter(c => {
                const d = new Date(c.fecha_inicio);
                const sameDate = d.toISOString().slice(0, 10) === date;
                const sameVet = vet.id_veterinario === 'sin-asignar' ? !c.id_veterinario : String(c.id_veterinario) === String(vet.id_veterinario);
                return sameDate && sameVet && d.getHours() === hour;
              });
              return (
                <button key={hour} onClick={() => openNew({ date, hour, vet: vet.id_veterinario })} className="min-h-[92px] border-l border-slate-100 bg-slate-50/40 p-1 text-left hover:bg-indigo-50">
                  {cellCitas.map(c => (
                    <div key={c.id_cita} className={`mb-1 rounded-lg border px-2 py-1 text-[11px] shadow-sm ${statusTone[c.estado] || statusTone.Programada}`}>
                      <b>{formatTime(c.fecha_inicio)}</b> {c.pacienteNombre || c.motivo || 'Reserva'}
                    </div>
                  ))}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const renderAgendaList = () => (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="divide-y divide-slate-100">
        {filtered.map(c => (
          <div key={c.id_cita} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-sm font-black text-slate-900"><Clock size={14} />{formatTime(c.fecha_inicio)} - {formatTime(c.fecha_fin)}</span>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusTone[c.estado] || statusTone.Programada}`}>{c.estado}</span>
                {c.tutorCorreo && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-700"><Mail size={12} />Recordatorios</span>}
              </div>
              <p className="mt-1 font-black text-slate-800">{c.pacienteNombre || 'Reserva sin paciente'} · {c.tipoCitaNombre || 'Cita medica'}</p>
              <p className="text-xs text-slate-500">{c.tutorNombre || 'Sin tutor'} · {c.veterinarioNombre || 'Sin veterinario'}{c.motivo ? ` · ${c.motivo}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => changeStatus(c, 'Confirmada')} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Confirmar</button>
              <button onClick={() => CitasService.checkIn(c.id_cita).then(load)} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">Check-in</button>
              <button onClick={() => changeStatus(c, 'Completada')} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"><CheckCircle2 size={13} className="mr-1 inline" />Completar</button>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && <div className="p-10 text-center font-bold text-slate-400">No hay eventos para mostrar.</div>}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <CalendarDays className="text-cyan-500" /> {personal ? 'Agenda personal' : 'Agenda general'}
          </h2>
          <p className="text-sm text-slate-500">Programacion clinica, busqueda de pacientes, recordatorios por correo y estados de atencion.</p>
        </div>
        <button onClick={() => openNew()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-100">
          <Plus size={18} /> Crear
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          {renderMiniCalendar()}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-black uppercase text-slate-400">Resumen del dia</p>
            {statuses.slice(0, 5).map(s => (
              <div key={s} className="flex justify-between py-2 text-sm">
                <span className="text-slate-500">{s}</span>
                <b>{appointments.filter(a => a.estado === s).length}</b>
              </div>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setDate(addDays(date, view === 'Semana' ? -7 : -1))} className="rounded-xl border border-slate-200 p-2 text-slate-500"><ChevronLeft size={18} /></button>
                <button onClick={() => setDate(addDays(date, view === 'Semana' ? 7 : 1))} className="rounded-xl border border-slate-200 p-2 text-slate-500"><ChevronRight size={18} /></button>
                <button onClick={() => setDate(today())} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-500">Hoy</button>
              </div>
              <div className="text-center text-sm font-black text-indigo-700">
                {view === 'Semana' ? `${formatLong(visibleDates[0])} AL ${formatLong(visibleDates[6])}` : formatLong(date)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex overflow-hidden rounded-xl border border-slate-200">
                  {views.map(v => (
                    <button key={v} onClick={() => setView(v)} className={`px-4 py-2 text-sm font-bold ${view === v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'}`}>{v}</button>
                  ))}
                </div>
                <button onClick={load} className="rounded-xl border border-slate-200 p-2 text-slate-500"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={18} className="text-slate-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por documento, nombre, mascota, telefono, encargado o motivo" className="w-full bg-transparent text-sm outline-none" />
            </div>
          </div>

          {view === 'Programador' || view === 'Dia' ? renderScheduler() : renderAgendaList()}
        </section>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/60 p-4">
          <form onSubmit={save} className="my-6 w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <h3 className="text-xl font-black text-slate-800">Crear evento</h3>
              <button type="button" onClick={() => setShowModal(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="grid gap-5 p-6 md:grid-cols-2">
              <label className="md:col-span-2 flex items-center gap-3 text-sm font-bold text-slate-600">
                <input type="checkbox" checked={reserveOnly} onChange={e => setReserveOnly(e.target.checked)} className="h-5 w-5 rounded border-slate-300" />
                Solo reservar el espacio
              </label>
              {!reserveOnly && (
                <label className="text-sm font-bold text-slate-600">Mascota
                  <select required={!reserveOnly} value={form.id_paciente || ''} onChange={e => setForm({ ...form, id_paciente: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                    <option value="">Seleccione una mascota</option>
                    {patients.map(p => <option key={p.id_paciente} value={p.id_paciente}>{p.nombre} - {p.tutorNombre || p.tutorTelefono}</option>)}
                  </select>
                </label>
              )}
              <label className="text-sm font-bold text-slate-600">Tipo
                <select value={form.id_tipo_cita || ''} onChange={e => {
                  const type = types.find(t => t.id_tipo_cita === Number(e.target.value));
                  const start = form.fecha_inicio ? new Date(form.fecha_inicio) : new Date();
                  const end = new Date(start.getTime() + (type?.duracion_minutos || 30) * 60000);
                  setForm({ ...form, id_tipo_cita: Number(e.target.value), fecha_fin: toLocalInput(end) });
                }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <option value="">Cita general</option>
                  {types.map(t => <option key={t.id_tipo_cita} value={t.id_tipo_cita}>{t.nombre} ({t.duracion_minutos} min)</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-600">Encargado
                <select value={form.id_veterinario || ''} onChange={e => setForm({ ...form, id_veterinario: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <option value="">Sin asignar</option>
                  {vets.map(v => <option key={v.id_veterinario} value={v.id_veterinario}>{v.nombre}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-600">Inicia
                <input type="datetime-local" required value={form.fecha_inicio || ''} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" />
              </label>
              <label className="text-sm font-bold text-slate-600">Finaliza
                <input type="datetime-local" required value={form.fecha_fin || ''} onChange={e => setForm({ ...form, fecha_fin: e.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-600">Titulo / motivo
                <input value={form.motivo || ''} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Consulta, vacuna, control, cirugia, grooming..." className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3" />
              </label>
              <label className="md:col-span-2 text-sm font-bold text-slate-600">Descripcion
                <textarea value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Detalles visibles para el equipo clinico" className="mt-2 min-h-[110px] w-full rounded-xl border border-slate-200 px-3 py-3" />
              </label>
              <div className="md:col-span-2 rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-700">
                <Mail size={16} className="mr-2 inline" />
                Al guardar, el sistema programa recordatorios por correo 24 horas y 2 horas antes si el tutor tiene email registrado.
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 p-6">
              <button type="button" onClick={() => setShowModal(false)} className="rounded-xl bg-slate-100 px-5 py-3 font-bold text-slate-600">Cancelar</button>
              <button className="rounded-xl bg-indigo-600 px-6 py-3 font-black text-white">Guardar evento</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function Agenda() {
  return <AgendaBoard />;
}
