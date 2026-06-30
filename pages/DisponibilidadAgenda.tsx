import React, { useEffect, useMemo, useState } from 'react';
import { CitasService } from '../services/api';
import { AgendaDisponibilidad, AgendaSlot, AgendaVeterinario } from '../types';
import { CalendarClock, ChevronLeft, ChevronRight, Clock, Plus, RefreshCw, Trash2, UserRound } from 'lucide-react';
import Swal from 'sweetalert2';

const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const weekLabels = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const hours = Array.from({ length: 17 }, (_, i) => i + 6);
const today = () => new Date().toISOString().slice(0, 10);
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
const timeLabel = (hour: number) => hour < 12 ? `${hour} a.m.` : hour === 12 ? '12 p.m.' : `${hour - 12} p.m.`;
const normalizeTime = (value?: string) => String(value || '').slice(0, 5);

export default function DisponibilidadAgenda() {
  const [date, setDate] = useState(today());
  const [vets, setVets] = useState<AgendaVeterinario[]>([]);
  const [vetFilter, setVetFilter] = useState('');
  const [blocks, setBlocks] = useState<AgendaDisponibilidad[]>([]);
  const [slots, setSlots] = useState<AgendaSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [restrict, setRestrict] = useState(true);
  const [form, setForm] = useState<Partial<AgendaDisponibilidad>>({
    dia_semana: 1,
    hora_inicio: '08:00',
    hora_fin: '17:00',
    intervalo_minutos: 30,
    tipo: 'Disponible',
  });

  const weekStart = useMemo(() => startOfWeek(date), [date]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const load = async () => {
    setLoading(true);
    try {
      const veterinarios = await CitasService.getVeterinarios();
      setVets(veterinarios);
      const selectedVet = vetFilter || veterinarios[0]?.id_veterinario || '';
      if (!vetFilter && selectedVet) setVetFilter(selectedVet);
      const disponibilidad = await CitasService.getDisponibilidad({ id_veterinario: selectedVet || undefined });
      setBlocks(disponibilidad);
      if (selectedVet) {
        const result = await CitasService.getSlots({ fecha: date, id_veterinario: selectedVet, duracion: Number(form.intervalo_minutos || 30) });
        setSlots(result.slots);
      } else {
        setSlots([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [date, vetFilter]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await CitasService.createDisponibilidad({
        ...form,
        id_veterinario: form.id_veterinario || vetFilter,
        dia_semana: Number(form.dia_semana),
        intervalo_minutos: Number(form.intervalo_minutos || 30),
      });
      await load();
      Swal.fire({ icon: 'success', title: 'Disponibilidad registrada', timer: 1300, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo registrar la disponibilidad', 'error');
    }
  };

  const remove = async (id: number) => {
    const ok = await Swal.fire({ icon: 'warning', title: 'Desactivar disponibilidad', text: 'Este bloque dejará de usarse para nuevos horarios.', showCancelButton: true, confirmButtonText: 'Desactivar' });
    if (!ok.isConfirmed) return;
    await CitasService.deleteDisponibilidad(id);
    await load();
  };

  const blocksFor = (dateStr: string, hour: number) => {
    const day = new Date(`${dateStr}T12:00:00`).getDay();
    return blocks.filter(b => {
      const start = Number(normalizeTime(b.hora_inicio).split(':')[0]);
      const end = Number(normalizeTime(b.hora_fin).split(':')[0]);
      return b.dia_semana === day && hour >= start && hour < end;
    });
  };

  const activeVet = vets.find(v => v.id_veterinario === vetFilter);

  return (
    <div className="space-y-5 font-sans">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <CalendarClock className="text-cyan-500" /> Disponibilidad / programación
          </h2>
          <p className="text-sm text-slate-500">Establece la disponibilidad de agenda para cada profesional encargado y visualiza cupos libres.</p>
        </div>
        <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm">
          Restringir disponibilidad
          <input type="checkbox" checked={restrict} onChange={e => setRestrict(e.target.checked)} className="h-5 w-5 rounded border-slate-300" />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <form onSubmit={save} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-black text-slate-800">Registrar disponibilidad</h3>
              <Plus size={18} className="text-indigo-600" />
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-black uppercase text-slate-500">Usuario
                <select required value={form.id_veterinario || vetFilter} onChange={e => { setVetFilter(e.target.value); setForm({ ...form, id_veterinario: e.target.value }); }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Seleccione veterinario</option>
                  {vets.map(v => <option key={v.id_veterinario} value={v.id_veterinario}>{v.nombre}</option>)}
                </select>
              </label>
              <label className="block text-xs font-black uppercase text-slate-500">Día
                <select value={form.dia_semana} onChange={e => setForm({ ...form, dia_semana: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  {days.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-black uppercase text-slate-500">Inicio
                  <input type="time" required value={normalizeTime(form.hora_inicio)} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs font-black uppercase text-slate-500">Fin
                  <input type="time" required value={normalizeTime(form.hora_fin)} onChange={e => setForm({ ...form, hora_fin: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-black uppercase text-slate-500">Intervalo
                  <select value={form.intervalo_minutos} onChange={e => setForm({ ...form, intervalo_minutos: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    {[15, 20, 30, 45, 60].map(v => <option key={v} value={v}>{v} min</option>)}
                  </select>
                </label>
                <label className="block text-xs font-black uppercase text-slate-500">Tipo
                  <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as any })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option value="Disponible">Disponible</option>
                    <option value="Bloqueado">Bloqueado</option>
                  </select>
                </label>
              </div>
              <textarea value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Notas internas" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <button className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white">Guardar bloque</button>
            </div>
          </form>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-black text-slate-800">Cupos del día</h3>
            <div className="max-h-80 space-y-2 overflow-auto">
              {slots.map(slot => (
                <div key={`${slot.inicio}-${slot.fin}`} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${slot.disponible ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
                  <span><Clock size={14} className="mr-1 inline" />{new Date(slot.inicio).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}</span>
                  <b>{slot.disponible ? 'Libre' : slot.motivo || 'Ocupado'}</b>
                </div>
              ))}
              {!slots.length && <p className="text-sm text-slate-400">Seleccione un veterinario para ver cupos.</p>}
            </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <label className="text-xs font-black uppercase text-slate-500">Usuarios</label>
                <select value={vetFilter} onChange={e => setVetFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm xl:w-72">
                  <option value="">Filtrar usuarios</option>
                  {vets.map(v => <option key={v.id_veterinario} value={v.id_veterinario}>{v.nombre}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setDate(addDays(date, -7))} className="rounded-xl border border-slate-200 p-2 text-slate-500"><ChevronLeft size={18} /></button>
                <button onClick={() => setDate(addDays(date, 7))} className="rounded-xl border border-slate-200 p-2 text-slate-500"><ChevronRight size={18} /></button>
                <button onClick={() => setDate(today())} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-500">Hoy</button>
                <button onClick={load} className="rounded-xl border border-slate-200 p-2 text-slate-500"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
              </div>
            </div>
            <div className="mt-4 text-center text-sm font-black text-indigo-700">
              {new Date(`${weekDates[0]}T12:00:00`).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' }).toUpperCase()} AL {new Date(`${weekDates[6]}T12:00:00`).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {weekDates.map((d, i) => {
              const dayBlocks = blocks.filter(b => b.dia_semana === new Date(`${d}T12:00:00`).getDay());
              return (
                <div key={d} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-slate-800">{weekLabels[i]} {new Date(`${d}T12:00:00`).getDate()}</h4>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">{dayBlocks.length} bloques</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {dayBlocks.map(b => (
                      <div key={b.id_disponibilidad} className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold ${b.tipo === 'Disponible' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        <span>{normalizeTime(b.hora_inicio)} - {normalizeTime(b.hora_fin)} · {b.tipo}</span>
                        <button onClick={() => remove(b.id_disponibilidad)}><Trash2 size={13} /></button>
                      </div>
                    ))}
                    {!dayBlocks.length && <p className="text-sm text-slate-400">Sin disponibilidad registrada.</p>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm md:block">
            <div>
              <div className="grid border-b border-slate-100 bg-slate-50/70" style={{ gridTemplateColumns: 'minmax(54px, .45fr) repeat(7, minmax(0, 1fr))' }}>
                <div className="p-3 text-xs font-bold text-slate-400">{activeVet ? <UserRound size={16} /> : null}</div>
                {weekDates.map((d, i) => (
                  <div key={d} className="border-l border-slate-100 p-3 text-center font-black text-slate-600">
                    {weekLabels[i]} {new Date(`${d}T12:00:00`).getDate()}
                  </div>
                ))}
              </div>
              {hours.map(hour => (
                <div key={hour} className="grid min-h-[62px] border-b border-slate-100 last:border-b-0" style={{ gridTemplateColumns: 'minmax(54px, .45fr) repeat(7, minmax(0, 1fr))' }}>
                  <div className="bg-slate-50 p-2 text-right text-xs font-bold text-slate-500">{timeLabel(hour)}</div>
                  {weekDates.map(d => {
                    const cellBlocks = blocksFor(d, hour);
                    const hasAvailable = cellBlocks.some(b => b.tipo === 'Disponible');
                    const hasBlocked = cellBlocks.some(b => b.tipo === 'Bloqueado');
                    return (
                      <div key={`${d}-${hour}`} className={`border-l border-slate-100 p-1 ${hasBlocked ? 'bg-red-50' : hasAvailable ? 'bg-emerald-50' : restrict ? 'bg-slate-50' : 'bg-white'}`}>
                        {cellBlocks.map(b => (
                          <div key={b.id_disponibilidad} className={`mb-1 flex items-center justify-between rounded-lg px-2 py-1 text-[11px] font-bold ${b.tipo === 'Disponible' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            <span>{normalizeTime(b.hora_inicio)}-{normalizeTime(b.hora_fin)}</span>
                            <button onClick={() => remove(b.id_disponibilidad)}><Trash2 size={12} /></button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
