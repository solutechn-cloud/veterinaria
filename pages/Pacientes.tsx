import React, { useEffect, useMemo, useState } from 'react';
import { ClientService, PacientesService } from '../services/api';
import { Cliente, Paciente } from '../types';
import { Plus, RefreshCw, Search, PawPrint, UserRound, Weight } from 'lucide-react';
import Swal from 'sweetalert2';

const emptyPatient: Partial<Paciente> = { especie: 'Canino', estado: 'Activo' };

function ageLabel(date?: string) {
  if (!date) return 'Edad no registrada';
  const birth = new Date(date);
  const months = Math.max(0, Math.floor((Date.now() - birth.getTime()) / 2629800000));
  if (months < 24) return `${months} meses`;
  return `${Math.floor(months / 12)} años`;
}

export default function Pacientes() {
  const [patients, setPatients] = useState<Paciente[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Paciente | null>(null);
  const [form, setForm] = useState<Partial<Paciente>>(emptyPatient);

  const load = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([PacientesService.getAll({ q: query }), ClientService.getAll()]);
      setPatients(p);
      setClients(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const clientOptions = useMemo(() => clients.map(c => ({ id: c.identidad, name: `${c.nombre} ${c.apellido || ''}`.trim() })), [clients]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyPatient);
    setShowModal(true);
  };

  const openEdit = (patient: Paciente) => {
    setEditing(patient);
    setForm(patient);
    setShowModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await PacientesService.update(editing.id_paciente, form);
      else await PacientesService.create(form);
      setShowModal(false);
      await load();
      Swal.fire({ icon: 'success', title: 'Paciente guardado', timer: 1300, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo guardar', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2"><PawPrint className="text-teal-600" /> Pacientes</h2>
          <p className="text-sm text-slate-500">Mascotas vinculadas a tutores, expediente, citas y medicina preventiva.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-black text-white hover:bg-teal-700">
          <Plus size={18} /> Nuevo paciente
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="Buscar por nombre, especie, raza o microchip" className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-teal-200" />
          </div>
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-teal-600"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
          {patients.map(p => (
            <button key={p.id_paciente} onClick={() => openEdit(p)} className="text-left rounded-2xl border border-slate-100 bg-slate-50 hover:bg-teal-50 hover:border-teal-200 p-4 transition-colors">
              <div className="flex justify-between gap-3">
                <div>
                  <h3 className="font-black text-slate-900">{p.nombre}</h3>
                  <p className="text-xs text-slate-500">{p.especie}{p.raza ? ` · ${p.raza}` : ''} · {ageLabel(p.fecha_nacimiento)}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-teal-700 border border-teal-100">{p.estado}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white p-3 border border-slate-100"><UserRound size={13} className="text-slate-400 mb-1" />{p.tutorNombre || 'Sin tutor'}</div>
                <div className="rounded-xl bg-white p-3 border border-slate-100"><Weight size={13} className="text-slate-400 mb-1" />{p.peso_actual ? `${p.peso_actual} kg` : 'Sin peso'}</div>
              </div>
              {(p.alergias || p.condiciones_cronicas) && <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 line-clamp-2">{p.alergias || p.condiciones_cronicas}</p>}
            </button>
          ))}
          {!loading && patients.length === 0 && <div className="col-span-full p-10 text-center text-slate-400 font-bold">Sin pacientes registrados.</div>}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-black text-lg text-slate-900">{editing ? 'Editar paciente' : 'Nuevo paciente'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500">Cerrar</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-500">Tutor
                <select required value={form.id_tutor || ''} onChange={e => setForm({ ...form, id_tutor: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50">
                  <option value="">Seleccione tutor</option>
                  {clientOptions.map(c => <option key={c.id} value={c.id}>{c.name} · {c.id}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-500">Nombre
                <input required value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
              <label className="text-xs font-bold text-slate-500">Especie
                <input required value={form.especie || ''} onChange={e => setForm({ ...form, especie: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
              <label className="text-xs font-bold text-slate-500">Raza
                <input value={form.raza || ''} onChange={e => setForm({ ...form, raza: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
              <label className="text-xs font-bold text-slate-500">Sexo
                <select value={form.sexo || ''} onChange={e => setForm({ ...form, sexo: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50">
                  <option value="">No especificado</option><option>Macho</option><option>Hembra</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-500">Peso actual kg
                <input type="number" step="0.001" value={form.peso_actual || ''} onChange={e => setForm({ ...form, peso_actual: Number(e.target.value) })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
              <label className="text-xs font-bold text-slate-500">Nacimiento
                <input type="date" value={form.fecha_nacimiento || ''} onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
              <label className="text-xs font-bold text-slate-500">Microchip
                <input value={form.microchip || ''} onChange={e => setForm({ ...form, microchip: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-500">Alergias
              <textarea value={form.alergias || ''} onChange={e => setForm({ ...form, alergias: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
            </label>
            <label className="block text-xs font-bold text-slate-500">Condiciones cronicas
              <textarea value={form.condiciones_cronicas || ''} onChange={e => setForm({ ...form, condiciones_cronicas: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-slate-600">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-teal-600 font-black text-white">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
