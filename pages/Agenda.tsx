import React, { useEffect, useState } from 'react';
import { CitasService, PacientesService } from '../services/api';
import { Cita, Paciente, TipoCita } from '../types';
import { CalendarDays, CheckCircle2, Clock, Plus, RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';

const today = () => new Date().toISOString().slice(0, 10);
const toLocalInput = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function Agenda() {
  const [date, setDate] = useState(today());
  const [appointments, setAppointments] = useState<Cita[]>([]);
  const [patients, setPatients] = useState<Paciente[]>([]);
  const [types, setTypes] = useState<TipoCita[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Cita>>({ estado: 'Programada', fecha_inicio: toLocalInput(), fecha_fin: toLocalInput(new Date(Date.now() + 30 * 60000)) });

  const load = async () => {
    setLoading(true);
    try {
      const [citas, pacientes, tipos] = await Promise.all([
        CitasService.getAll({ fecha_desde: date, fecha_hasta: date }),
        PacientesService.getAll(),
        CitasService.getTipos(),
      ]);
      setAppointments(citas);
      setPatients(pacientes);
      setTypes(tipos);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [date]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const patient = patients.find(p => p.id_paciente === Number(form.id_paciente));
      await CitasService.create({ ...form, id_paciente: Number(form.id_paciente), id_tutor: patient?.id_tutor });
      setShowModal(false);
      await load();
      Swal.fire({ icon: 'success', title: 'Cita programada', timer: 1300, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo programar la cita', 'error');
    }
  };

  const statusTone: Record<string, string> = {
    Programada: 'bg-blue-50 text-blue-700',
    Confirmada: 'bg-emerald-50 text-emerald-700',
    'En espera': 'bg-amber-50 text-amber-700',
    'En consulta': 'bg-indigo-50 text-indigo-700',
    Completada: 'bg-slate-100 text-slate-700',
    Cancelada: 'bg-red-50 text-red-700',
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2"><CalendarDays className="text-teal-600" /> Agenda</h2>
          <p className="text-sm text-slate-500">Citas por dia, check-in y estados del flujo clinico.</p>
        </div>
        <div className="flex gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white" />
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 text-slate-500"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-black text-white"><Plus size={18} /> Nueva cita</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-black text-slate-800">Citas de {date}</div>
          <div className="divide-y divide-slate-100">
            {appointments.map(c => (
              <div key={c.id_cita} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-slate-400" />
                    <span className="font-black text-slate-900">{new Date(c.fecha_inicio).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={`text-[10px] font-black px-2 py-1 rounded-full ${statusTone[c.estado] || 'bg-slate-100'}`}>{c.estado}</span>
                  </div>
                  <p className="mt-1 font-bold text-slate-700">{c.pacienteNombre || 'Paciente no asignado'} · {c.tipoCitaNombre || 'Cita'}</p>
                  <p className="text-xs text-slate-500">{c.tutorNombre || 'Sin tutor'}{c.motivo ? ` · ${c.motivo}` : ''}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => CitasService.updateEstado(c.id_cita, 'Confirmada').then(load)} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-black">Confirmar</button>
                  <button onClick={() => CitasService.checkIn(c.id_cita).then(load)} className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-black">Check-in</button>
                  <button onClick={() => CitasService.updateEstado(c.id_cita, 'Completada').then(load)} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black"><CheckCircle2 size={13} className="inline mr-1" />Completar</button>
                </div>
              </div>
            ))}
            {!loading && appointments.length === 0 && <div className="p-10 text-center text-slate-400 font-bold">No hay citas para este dia.</div>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-black text-slate-900 mb-4">Resumen</h3>
          {['Programada', 'Confirmada', 'En espera', 'En consulta', 'Completada'].map(status => (
            <div key={status} className="flex justify-between py-2 text-sm">
              <span className="text-slate-500">{status}</span>
              <b>{appointments.filter(a => a.estado === status).length}</b>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4">
            <h3 className="font-black text-lg text-slate-900">Programar cita</h3>
            <label className="block text-xs font-bold text-slate-500">Paciente
              <select required value={form.id_paciente || ''} onChange={e => setForm({ ...form, id_paciente: Number(e.target.value) })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50">
                <option value="">Seleccione paciente</option>
                {patients.map(p => <option key={p.id_paciente} value={p.id_paciente}>{p.nombre} · {p.tutorNombre}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-500">Tipo
                <select value={form.id_tipo_cita || ''} onChange={e => setForm({ ...form, id_tipo_cita: Number(e.target.value) })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50">
                  <option value="">General</option>
                  {types.map(t => <option key={t.id_tipo_cita} value={t.id_tipo_cita}>{t.nombre}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-500">Veterinario / usuario
                <input value={form.id_veterinario || ''} onChange={e => setForm({ ...form, id_veterinario: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
              <label className="text-xs font-bold text-slate-500">Inicio
                <input type="datetime-local" required value={form.fecha_inicio || ''} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
              <label className="text-xs font-bold text-slate-500">Fin
                <input type="datetime-local" required value={form.fecha_fin || ''} onChange={e => setForm({ ...form, fecha_fin: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-500">Motivo
              <textarea value={form.motivo || ''} onChange={e => setForm({ ...form, motivo: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-slate-600">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-teal-600 font-black text-white">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
