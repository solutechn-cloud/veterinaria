import React, { useCallback, useEffect, useState } from 'react';
import { ConsultorioService, RecordatoriosService, VacunasService } from '../services/api';
import { ConsultorioBusquedaItem, Paciente, RecordatorioVet, VacunaAplicada } from '../types';
import { Bell, Plus, Syringe, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { SearchableOption, SearchableSelect } from '../components/consultorio/SearchableSelect';
import { ProfessionalSelect, type ProfessionalValue } from '../components/consultorio/ProfessionalSelect';
import { VaccineItemsEditor, type VaccineCartItem } from '../components/consultorio/VaccineItemsEditor';

const inputCls = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200';

const today = () => new Date().toISOString().slice(0, 10);
const professionalName = (value?: ProfessionalValue | string | null) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.nombre || value.usuario || '';
};

type VaccineForm = {
  id_paciente?: number;
  fecha_aplicacion: string;
  veterinario?: ProfessionalValue | string | null;
  generar_cotizacion: boolean;
  notas?: string;
  vacunas: VaccineCartItem[];
};

function patientOption(owner: ConsultorioBusquedaItem, patient: Paciente): SearchableOption<Paciente> {
  return {
    id: patient.id_paciente,
    label: `${patient.nombre} - ${owner.nombre}`,
    description: [patient.especie, patient.raza, owner.telefono, owner.correo].filter(Boolean).join(' - '),
    raw: {
      ...patient,
      tutorNombre: patient.tutorNombre || owner.nombre,
      tutorTelefono: patient.tutorTelefono || owner.telefono,
      tutorCorreo: patient.tutorCorreo || owner.correo,
    },
  };
}

export default function Vacunas() {
  const [vaccines, setVaccines] = useState<VacunaAplicada[]>([]);
  const [reminders, setReminders] = useState<RecordatorioVet[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<SearchableOption<Paciente> | null>(null);
  const [form, setForm] = useState<VaccineForm>(initialForm());

  const load = async () => {
    const [v, r] = await Promise.all([
      VacunasService.getAplicadas(),
      RecordatoriosService.getAll({ tipo: 'vacuna_proxima' }),
    ]);
    setVaccines(v || []);
    setReminders(r || []);
  };

  useEffect(() => { void load(); }, []);

  const searchPatients = useCallback(async (term: string): Promise<SearchableOption<Paciente>[]> => {
    const owners = await ConsultorioService.search({ q: term, limit: 30, offset: 0 });
    return owners.flatMap(owner => (owner.pacientes || []).map(patient => patientOption(owner, patient)));
  }, []);

  const openModal = () => {
    setSelectedPatient(null);
    setForm(initialForm());
    setShowModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const patientId = selectedPatient?.raw?.id_paciente || form.id_paciente;
    if (!patientId) {
      Swal.fire('Paciente requerido', 'Seleccione la mascota antes de registrar la vacuna.', 'warning');
      return;
    }
    const vacunas = (form.vacunas || []).filter(item => (item.nombre_vacuna || '').trim());
    if (!vacunas.length) {
      Swal.fire('Vacuna requerida', 'Agregue al menos una vacuna al carrito.', 'warning');
      return;
    }

    try {
      const result = await VacunasService.aplicar({
        id_paciente: Number(patientId),
        fecha_aplicacion: form.fecha_aplicacion,
        veterinario: professionalName(form.veterinario) || undefined,
        notas: form.notas || undefined,
        generar_cotizacion: form.generar_cotizacion,
        vacunas: vacunas.map(item => ({
          nombre_vacuna: (item.nombre_vacuna || '').trim(),
          id_medicamento: item.id_medicamento || undefined,
          id_presentacion: item.id_presentacion || undefined,
          presentacion: item.presentacion || undefined,
          cantidad: Number(item.cantidad || 1),
          precio_unitario: Number(item.precio_unitario || 0),
          tipo_isv: item.tipo_isv || 'exento',
          proxima_dosis: item.proxima_dosis || undefined,
          notas: item.notas || form.notas || undefined,
        })),
      } as any);
      setShowModal(false);
      setForm(initialForm());
      setSelectedPatient(null);
      await load();
      Swal.fire({
        icon: 'success',
        title: 'Vacuna registrada',
        text: result.codigo_cotizacion ? `Cotizacion pendiente generada: ${result.codigo_cotizacion}` : undefined,
        timer: result.codigo_cotizacion ? undefined : 1300,
        showConfirmButton: Boolean(result.codigo_cotizacion),
      });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo registrar vacuna', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={openModal} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700">
          <Plus size={18} /> Registrar vacuna
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-100 p-4 text-slate-800">
            <Syringe size={18} className="text-indigo-600" />
            <span className="font-semibold">Historial de aplicaciones</span>
          </div>
          <div className="divide-y divide-slate-100">
            {vaccines.map(v => (
              <div key={v.id_vacuna_aplicada} className="flex gap-3 p-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Syringe size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row">
                    <div>
                      <p className="font-semibold text-slate-900">{v.nombre_vacuna}</p>
                      <p className="text-xs text-slate-500">
                        {v.pacienteNombre || `Paciente ${v.id_paciente}`} - {new Date(v.fecha_aplicacion).toLocaleDateString('es-HN')}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">{v.veterinario || ''}</span>
                  </div>
                  {v.proxima_dosis && (
                    <p className="mt-2 text-xs font-semibold text-teal-700">
                      Proxima dosis: {new Date(v.proxima_dosis).toLocaleDateString('es-HN')}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {vaccines.length === 0 && <div className="p-10 text-center text-slate-400 font-semibold">Sin vacunas registradas.</div>}
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Bell size={16} className="text-amber-500" /> Recordatorios</h3>
          <div className="mt-4 space-y-3">
            {reminders.slice(0, 8).map(r => (
              <div key={r.id_recordatorio} className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">{r.asunto}</p>
                <p className="mt-1 text-[11px] text-amber-700">{new Date(r.fecha_programada).toLocaleString('es-HN')} - {r.estado}</p>
              </div>
            ))}
            {reminders.length === 0 && <p className="text-sm text-slate-400">Sin recordatorios de vacuna.</p>}
          </div>
        </aside>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={save} className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <h3 className="flex items-center gap-2 text-xl font-bold text-slate-800"><Syringe size={22} className="text-indigo-600" /> Registrar vacuna</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
            </div>
            <div className="grid max-h-[72vh] grid-cols-1 gap-5 overflow-auto p-6 md:grid-cols-2">
              <label className="block text-sm font-normal text-indigo-900/70">
                <span>Paciente</span>
                <div className="mt-2">
                  <SearchableSelect
                    value={selectedPatient}
                    placeholder="Buscar mascota o tutor"
                    emptyText="No hay pacientes que coincidan"
                    onSearch={searchPatients}
                    onChange={option => {
                      setSelectedPatient(option);
                      setForm(prev => ({ ...prev, id_paciente: Number(option.raw?.id_paciente || option.id) }));
                    }}
                  />
                </div>
              </label>

              <label className="text-sm font-normal text-indigo-900/70">Fecha aplicacion
                <input type="date" value={form.fecha_aplicacion || ''} onChange={e => setForm({ ...form, fecha_aplicacion: e.target.value })} className={inputCls} />
              </label>

              <label className="text-sm font-normal text-indigo-900/70">Veterinario que aplica
                <div className="mt-2">
                  <ProfessionalSelect value={form.veterinario} onChange={veterinario => setForm(prev => ({ ...prev, veterinario }))} />
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 text-sm font-normal text-slate-700 md:col-span-2">
                <input type="checkbox" checked={form.generar_cotizacion} onChange={e => setForm({ ...form, generar_cotizacion: e.target.checked })} className="mt-1 h-4 w-4" />
                <span>
                  <span className="block font-medium text-slate-800">Preparar cobro pendiente en recepcion</span>
                  <span className="text-xs text-slate-500">Se creara una cotizacion para que recepcion pueda convertirla en venta cuando el tutor pague.</span>
                </span>
              </label>

              <VaccineItemsEditor value={form.vacunas} onChange={vacunas => setForm(prev => ({ ...prev, vacunas }))} />

              <label className="block text-sm font-normal text-indigo-900/70 md:col-span-2">Notas
                <textarea value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} className={`${inputCls} min-h-[90px]`} />
              </label>
            </div>
            <div className="flex gap-3 border-t border-slate-100 p-6">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-600">Cancelar</button>
              <button className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-600/20">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function initialForm(): VaccineForm {
  return {
    fecha_aplicacion: today(),
    generar_cotizacion: true,
    vacunas: [],
  };
}
