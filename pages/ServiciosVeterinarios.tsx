import React, { useEffect, useState } from 'react';
import { ServiciosVeterinariosService } from '../services/api';
import { ServicioVeterinario } from '../types';
import { Plus, X, Ban, History, RotateCcw } from 'lucide-react';
import Swal from 'sweetalert2';

const blank: Partial<ServicioVeterinario> = { categoria: 'Consulta', duracion_minutos: 30, precio: 0, tipo_isv: 'exento', requiere_paciente: true, activo: true };

interface PrecioHistorialItem {
  id: number;
  precio_anterior: number;
  precio_nuevo: number;
  created_at: string;
  cambiado_por: string | null;
}

export default function ServiciosVeterinarios() {
  const [services, setServices] = useState<ServicioVeterinario[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ServicioVeterinario | null>(null);
  const [form, setForm] = useState<Partial<ServicioVeterinario>>(blank);
  const [historial, setHistorial] = useState<PrecioHistorialItem[] | null>(null);
  const [showHistorial, setShowHistorial] = useState(false);

  const load = async () => setServices(await ServiciosVeterinariosService.getAll({ activo: 'all' }));
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(blank); setShowModal(true); };
  const openEdit = (s: ServicioVeterinario) => { setEditing(s); setForm(s); setHistorial(null); setShowHistorial(false); setShowModal(true); };

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

  const anular = async (s: ServicioVeterinario) => {
    const confirm = await Swal.fire({
      title: '¿Anular servicio?',
      text: `"${s.nombre}" dejará de estar disponible para nuevas consultas o ventas. Podrás reactivarlo cuando quieras.`,
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, anular',
      confirmButtonColor: '#d33',
    });
    if (!confirm.isConfirmed) return;
    try {
      await ServiciosVeterinariosService.anular(s.id_servicio);
      await load();
      Swal.fire({ title: 'Servicio anulado', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudo anular', 'error');
    }
  };

  const reactivar = async (s: ServicioVeterinario) => {
    try {
      await ServiciosVeterinariosService.reactivar(s.id_servicio);
      await load();
      Swal.fire({ title: 'Servicio reactivado', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudo reactivar', 'error');
    }
  };

  const verHistorial = async () => {
    if (!editing) return;
    setShowHistorial(true);
    try {
      setHistorial(await ServiciosVeterinariosService.getPrecioHistorial(editing.id_servicio));
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudo cargar el historial', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white"><Plus size={18} /> Nuevo servicio</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
            <tr><th className="p-4">Servicio</th><th className="p-4">Categoria</th><th className="p-4">Duracion</th><th className="p-4">Precio</th><th className="p-4">Estado</th><th className="p-4">Acciones</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {services.map(s => (
              <tr key={s.id_servicio} className="hover:bg-teal-50">
                <td onClick={() => openEdit(s)} className="p-4 font-semibold text-slate-800 cursor-pointer">{s.nombre}<p className="text-xs text-slate-400">{s.descripcion}</p></td>
                <td onClick={() => openEdit(s)} className="p-4 text-sm text-slate-600 cursor-pointer">{s.categoria}</td>
                <td onClick={() => openEdit(s)} className="p-4 text-sm cursor-pointer">{s.duracion_minutos} min</td>
                <td onClick={() => openEdit(s)} className="p-4 font-semibold text-teal-700 cursor-pointer">L. {Number(s.precio).toFixed(2)}</td>
                <td onClick={() => openEdit(s)} className="p-4 cursor-pointer"><span className={`text-xs font-semibold rounded-full px-2 py-1 ${s.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      title="Editar"
                      onClick={() => openEdit(s)}
                      className="rounded-lg px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                    >
                      Editar
                    </button>
                    {s.activo ? (
                      <button
                        type="button"
                        title="Anular servicio"
                        onClick={() => anular(s)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100"
                      >
                        <Ban size={14} /> Anular
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Reactivar servicio"
                        onClick={() => reactivar(s)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                      >
                        <RotateCcw size={14} /> Reactivar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={save} className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <h3 className="text-xl font-bold text-slate-800">{editing ? 'Editar servicio' : 'Nuevo servicio'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
            </div>
            <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">
            <label className="block text-sm font-semibold text-indigo-900/70 md:col-span-2">Nombre
              <input required value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
            </label>
              <label className="text-sm font-semibold text-indigo-900/70">Categoria
                <input value={form.categoria || ''} onChange={e => setForm({ ...form, categoria: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
              <label className="text-sm font-semibold text-indigo-900/70">Codigo
                <input value={form.codigo || ''} onChange={e => setForm({ ...form, codigo: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
              <label className="text-sm font-semibold text-indigo-900/70">Duracion minutos
                <input type="number" value={form.duracion_minutos || 0} onChange={e => setForm({ ...form, duracion_minutos: Number(e.target.value) })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
              <label className="text-sm font-semibold text-indigo-900/70">Precio
                <input type="number" step="0.01" value={form.precio || 0} onChange={e => setForm({ ...form, precio: Number(e.target.value) })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
                {editing && (
                  <p className="mt-1 text-xs text-slate-400">
                    Precio actual: L. {Number(editing.precio).toFixed(2)}. Al guardar un precio distinto, el anterior queda en el historial.
                  </p>
                )}
              </label>
            <label className="block text-sm font-semibold text-indigo-900/70 md:col-span-2">Descripcion
              <textarea value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="mt-2 w-full p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-200" />
            </label>
              {editing && (
                <div className="md:col-span-2">
                  <button type="button" onClick={verHistorial} className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                    <History size={16} /> Ver historial de precios
                  </button>
                  {showHistorial && (
                    <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                      {historial === null ? (
                        <p className="p-3 text-sm text-slate-400">Cargando...</p>
                      ) : historial.length === 0 ? (
                        <p className="p-3 text-sm text-slate-400">Sin cambios de precio registrados.</p>
                      ) : (
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                            <tr><th className="p-2">Fecha</th><th className="p-2">Anterior</th><th className="p-2">Nuevo</th><th className="p-2">Usuario</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {historial.map(h => (
                              <tr key={h.id}>
                                <td className="p-2">{new Date(h.created_at).toLocaleString()}</td>
                                <td className="p-2">L. {Number(h.precio_anterior).toFixed(2)}</td>
                                <td className="p-2 font-semibold text-teal-700">L. {Number(h.precio_nuevo).toFixed(2)}</td>
                                <td className="p-2">{h.cambiado_por || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t border-slate-100 p-6">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 font-semibold text-slate-600">Cancelar</button>
              <button className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 font-semibold text-white shadow-lg shadow-indigo-600/20">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
