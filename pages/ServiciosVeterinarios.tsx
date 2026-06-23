import React, { useEffect, useState } from 'react';
import { ServiciosVeterinariosService } from '../services/api';
import { ServicioVeterinario } from '../types';
import { Plus, Stethoscope } from 'lucide-react';
import Swal from 'sweetalert2';

const blank: Partial<ServicioVeterinario> = { categoria: 'Consulta', duracion_minutos: 30, precio: 0, tipo_isv: 'exento', requiere_paciente: true, activo: true };

export default function ServiciosVeterinarios() {
  const [services, setServices] = useState<ServicioVeterinario[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ServicioVeterinario | null>(null);
  const [form, setForm] = useState<Partial<ServicioVeterinario>>(blank);

  const load = async () => setServices(await ServiciosVeterinariosService.getAll());
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(blank); setShowModal(true); };
  const openEdit = (s: ServicioVeterinario) => { setEditing(s); setForm(s); setShowModal(true); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await ServiciosVeterinariosService.update(editing.id_servicio, form);
      else await ServiciosVeterinariosService.create(form);
      setShowModal(false);
      await load();
      Swal.fire({ icon: 'success', title: 'Servicio guardado', timer: 1200, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo guardar', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2"><Stethoscope className="text-teal-600" /> Servicios Veterinarios</h2>
          <p className="text-sm text-slate-500">Consultas, cirugias, grooming, laboratorio y servicios facturables en POS.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-black text-white"><Plus size={18} /> Nuevo servicio</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs font-black text-slate-500 uppercase">
            <tr><th className="p-4">Servicio</th><th className="p-4">Categoria</th><th className="p-4">Duracion</th><th className="p-4">Precio</th><th className="p-4">Estado</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {services.map(s => (
              <tr key={s.id_servicio} onClick={() => openEdit(s)} className="hover:bg-teal-50 cursor-pointer">
                <td className="p-4 font-bold text-slate-800">{s.nombre}<p className="text-xs text-slate-400">{s.descripcion}</p></td>
                <td className="p-4 text-sm text-slate-600">{s.categoria}</td>
                <td className="p-4 text-sm">{s.duracion_minutos} min</td>
                <td className="p-4 font-black text-teal-700">L. {Number(s.precio).toFixed(2)}</td>
                <td className="p-4"><span className={`text-xs font-black rounded-full px-2 py-1 ${s.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.activo ? 'Activo' : 'Inactivo'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4">
            <h3 className="font-black text-lg text-slate-900">{editing ? 'Editar servicio' : 'Nuevo servicio'}</h3>
            <label className="block text-xs font-bold text-slate-500">Nombre
              <input required value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-500">Categoria
                <input value={form.categoria || ''} onChange={e => setForm({ ...form, categoria: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
              <label className="text-xs font-bold text-slate-500">Codigo
                <input value={form.codigo || ''} onChange={e => setForm({ ...form, codigo: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
              <label className="text-xs font-bold text-slate-500">Duracion minutos
                <input type="number" value={form.duracion_minutos || 0} onChange={e => setForm({ ...form, duracion_minutos: Number(e.target.value) })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
              <label className="text-xs font-bold text-slate-500">Precio
                <input type="number" step="0.01" value={form.precio || 0} onChange={e => setForm({ ...form, precio: Number(e.target.value) })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-500">Descripcion
              <textarea value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
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
