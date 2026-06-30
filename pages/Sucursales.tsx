import React, { useState, useEffect } from 'react';
import { SucursalesService } from '../services/api';
import { Sucursal } from '../types';
import { Building2, Plus, Edit2, X, Phone, MapPin, User, FileText, Activity, AlertTriangle, DollarSign } from 'lucide-react';
import Swal from 'sweetalert2';

const btn = 'bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors';
const btnSecondary = 'bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2 text-sm font-medium transition-colors';
const inputCls = 'w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm';

const emptyForm = {
  nombre: '',
  direccion: '',
  telefono: '',
  ciudad: '',
  regente_farmacia: '',
  numero_licencia: '',
  estado: 'Activa' as 'Activa' | 'Inactiva',
};

type FormState = typeof emptyForm;

export default function Sucursales() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [summaries, setSummaries] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Sucursal | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const list = await SucursalesService.getAll();
      setSucursales(list);
      const results = await Promise.all(
        list.map(s =>
          SucursalesService.getSummary(s.id_sucursal).catch(() => null)
        )
      );
      const map: Record<number, any> = {};
      list.forEach((s, i) => { map[s.id_sucursal] = results[i]; });
      setSummaries(map);
    } catch {
      /* silently fail */
    }
    setLoading(false);
  }

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(s: Sucursal) {
    setEditTarget(s);
    setForm({
      nombre: s.nombre,
      direccion: s.direccion || '',
      telefono: s.telefono || '',
      ciudad: s.ciudad || '',
      regente_farmacia: s.regente_farmacia || '',
      numero_licencia: s.numero_licencia || '',
      estado: s.estado,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditTarget(null);
    setForm(emptyForm);
  }

  function setField(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.nombre.trim()) {
      Swal.fire('Campo requerido', 'El nombre de la sucursal es obligatorio.', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await SucursalesService.update(editTarget.id_sucursal, form);
        Swal.fire({ icon: 'success', title: 'Sucursal actualizada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
      } else {
        await SucursalesService.create(form);
        Swal.fire({ icon: 'success', title: 'Sucursal creada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
      }
      closeModal();
      loadAll();
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudo guardar la sucursal.', 'error');
    }
    setSaving(false);
  }

  return (
    <div className="p-6 bg-[#f8fafc] min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 className="text-indigo-600" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Sucursales</h1>
            <p className="text-sm text-slate-500">{sucursales.length} sucursal{sucursales.length !== 1 ? 'es' : ''} registrada{sucursales.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={openCreate} className={btn}>
          <Plus size={16} className="inline mr-1.5" />
          Nueva Sucursal
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
        </div>
      ) : sucursales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Building2 size={48} className="opacity-30" />
          <p className="text-base">No hay sucursales registradas aún.</p>
          <button onClick={openCreate} className={btn}>Crear primera sucursal</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {sucursales.map(s => {
            const sum = summaries[s.id_sucursal];
            const ventasHoy = sum?.ventasHoy?.total_ventas ?? 0;
            const stockCritico = sum?.stockCritico ?? 0;
            const cajaActiva = sum?.cajaActiva ?? null;
            return (
              <div key={s.id_sucursal} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-50 rounded-xl p-2.5">
                      <Building2 size={22} className="text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-800 leading-tight">{s.nombre}</h2>
                      <span className="text-xs text-slate-400 font-mono">{s.codigo}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={s.estado === 'Activa'
                      ? 'bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium'
                      : 'bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-xs font-medium'}>
                      {s.estado}
                    </span>
                    <button
                      onClick={() => openEdit(s)}
                      className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                      title="Editar sucursal"
                    >
                      <Edit2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm text-slate-600">
                  {s.ciudad && (
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-slate-400 flex-shrink-0" />
                      <span>{s.ciudad}{s.direccion ? ` — ${s.direccion}` : ''}</span>
                    </div>
                  )}
                  {!s.ciudad && s.direccion && (
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-slate-400 flex-shrink-0" />
                      <span>{s.direccion}</span>
                    </div>
                  )}
                  {s.telefono && (
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-slate-400 flex-shrink-0" />
                      <span>{s.telefono}</span>
                    </div>
                  )}
                  {s.regente_farmacia && (
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-slate-400 flex-shrink-0" />
                      <span>{s.regente_farmacia}</span>
                    </div>
                  )}
                  {s.numero_licencia && (
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="font-mono text-xs">{s.numero_licencia}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-green-50 rounded-xl p-2">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <DollarSign size={12} className="text-green-600" />
                      <span className="text-xs text-green-600 font-medium">Ventas hoy</span>
                    </div>
                    <p className="text-sm font-bold text-green-700">L {Number(ventasHoy).toFixed(2)}</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-2">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <AlertTriangle size={12} className="text-red-500" />
                      <span className="text-xs text-red-500 font-medium">Stock crit.</span>
                    </div>
                    <p className="text-sm font-bold text-red-600">{stockCritico}</p>
                  </div>
                  <div className="bg-indigo-50 rounded-xl p-2">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <Activity size={12} className="text-indigo-600" />
                      <span className="text-xs text-indigo-600 font-medium">Caja</span>
                    </div>
                    <p className="text-xs font-semibold text-indigo-700 truncate" title={cajaActiva?.nombreCaja ?? ''}>
                      {cajaActiva ? cajaActiva.nombreCaja : '—'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-800">
                {editTarget ? 'Editar Sucursal' : 'Nueva Sucursal'}
              </h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.nombre}
                  onChange={e => setField('nombre', e.target.value)}
                  placeholder="Ej: Sucursal Centro"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Ciudad</label>
                  <input
                    value={form.ciudad}
                    onChange={e => setField('ciudad', e.target.value)}
                    placeholder="Tegucigalpa"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                  <input
                    value={form.telefono}
                    onChange={e => setField('telefono', e.target.value)}
                    placeholder="2222-0000"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Dirección</label>
                <input
                  value={form.direccion}
                  onChange={e => setField('direccion', e.target.value)}
                  placeholder="Colonia, calle, número"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Responsable Sanitario</label>
                  <input
                    value={form.regente_farmacia}
                    onChange={e => setField('regente_farmacia', e.target.value)}
                    placeholder="Nombre del regente"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Número de Licencia</label>
                  <input
                    value={form.numero_licencia}
                    onChange={e => setField('numero_licencia', e.target.value)}
                    placeholder="Ej: LF-0001-2024"
                    className={inputCls}
                  />
                </div>
              </div>

              {editTarget && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
                  <select
                    value={form.estado}
                    onChange={e => setField('estado', e.target.value)}
                    className={inputCls}
                  >
                    <option value="Activa">Activa</option>
                    <option value="Inactiva">Inactiva</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={closeModal} className={btnSecondary} disabled={saving}>
                Cancelar
              </button>
              <button onClick={handleSave} className={btn} disabled={saving}>
                {saving ? 'Guardando...' : editTarget ? 'Guardar Cambios' : 'Crear Sucursal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
