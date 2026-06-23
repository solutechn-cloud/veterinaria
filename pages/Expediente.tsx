import React, { useEffect, useMemo, useState } from 'react';
import { ConsultasService, PacientesService } from '../services/api';
import { Consulta, Paciente } from '../types';
import { ClipboardPlus, FileHeart, Plus, Save } from 'lucide-react';
import Swal from 'sweetalert2';

export default function Expediente() {
  const [patients, setPatients] = useState<Paciente[]>([]);
  const [patientId, setPatientId] = useState<number | ''>('');
  const [patient, setPatient] = useState<Paciente | null>(null);
  const [consultations, setConsultations] = useState<Consulta[]>([]);
  const [form, setForm] = useState<Partial<Consulta>>({ estado: 'Abierta' });
  const [showForm, setShowForm] = useState(false);

  const selectedPatient = useMemo(() => patients.find(p => p.id_paciente === Number(patientId)), [patients, patientId]);

  const loadPatients = async () => setPatients(await PacientesService.getAll());
  const loadRecord = async (id: number) => {
    const [detail, list] = await Promise.all([PacientesService.getById(id), ConsultasService.getAll({ id_paciente: id })]);
    setPatient(detail);
    setConsultations(list);
  };

  useEffect(() => { loadPatients(); }, []);
  useEffect(() => { if (patientId) loadRecord(Number(patientId)); }, [patientId]);

  const openNew = () => {
    if (!patientId) return Swal.fire('Seleccione paciente', 'Debe elegir un paciente para abrir consulta.', 'warning');
    setForm({ id_paciente: Number(patientId), estado: 'Abierta', motivo: '', subjetivo: '', objetivo: '', evaluacion: '', plan: '' });
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ConsultasService.create({ ...form, id_paciente: Number(patientId) });
      setShowForm(false);
      await loadRecord(Number(patientId));
      Swal.fire({ icon: 'success', title: 'Consulta guardada', timer: 1300, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error', err.message || 'No se pudo guardar consulta', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2"><FileHeart className="text-teal-600" /> Expediente Clinico</h2>
          <p className="text-sm text-slate-500">Historial, SOAP, signos vitales, tratamientos y seguimiento del paciente.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-black text-white"><Plus size={18} /> Nueva consulta</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <label className="text-xs font-bold text-slate-500">Paciente
          <select value={patientId} onChange={e => setPatientId(e.target.value ? Number(e.target.value) : '')} className="mt-1 w-full max-w-xl p-2.5 rounded-xl border bg-slate-50">
            <option value="">Seleccione paciente</option>
            {patients.map(p => <option key={p.id_paciente} value={p.id_paciente}>{p.nombre} · {p.especie} · {p.tutorNombre}</option>)}
          </select>
        </label>
      </div>

      {patient && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <aside className="bg-white rounded-2xl border border-slate-200 p-5 h-fit">
            <h3 className="font-black text-xl text-slate-900">{patient.nombre}</h3>
            <p className="text-sm text-slate-500">{patient.especie}{patient.raza ? ` · ${patient.raza}` : ''}</p>
            <div className="mt-5 space-y-3 text-sm">
              <Info label="Tutor" value={patient.tutorNombre} />
              <Info label="Telefono" value={patient.tutorTelefono} />
              <Info label="Peso actual" value={patient.peso_actual ? `${patient.peso_actual} kg` : 'Sin peso'} />
              <Info label="Microchip" value={patient.microchip || 'No registrado'} />
            </div>
            {(patient.alergias || patient.condiciones_cronicas) && (
              <div className="mt-5 rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800">
                <b>Alertas clinicas</b>
                <p className="mt-1">{patient.alergias || patient.condiciones_cronicas}</p>
              </div>
            )}
          </aside>

          <section className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 font-black text-slate-800">Historial de consultas</div>
            <div className="divide-y divide-slate-100">
              {consultations.map(c => (
                <article key={c.id_consulta} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-black text-slate-900">{c.motivo || 'Consulta veterinaria'}</h3>
                    <span className="text-xs font-black rounded-full bg-slate-100 px-3 py-1">{new Date(c.fecha).toLocaleString('es-HN')}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <Soap label="S" value={c.subjetivo} />
                    <Soap label="O" value={c.objetivo} />
                    <Soap label="A" value={c.evaluacion} />
                    <Soap label="P" value={c.plan} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {c.peso && <span>Peso: <b>{c.peso} kg</b></span>}
                    {c.temperatura && <span>Temp: <b>{c.temperatura} C</b></span>}
                    {c.frecuencia_cardiaca && <span>FC: <b>{c.frecuencia_cardiaca}</b></span>}
                    {c.frecuencia_respiratoria && <span>FR: <b>{c.frecuencia_respiratoria}</b></span>}
                  </div>
                </article>
              ))}
              {consultations.length === 0 && <div className="p-10 text-center text-slate-400 font-bold">Sin consultas registradas.</div>}
            </div>
          </section>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-6 space-y-4 max-h-[90vh] overflow-auto">
            <h3 className="font-black text-lg text-slate-900 flex items-center gap-2"><ClipboardPlus className="text-teal-600" /> Nueva consulta para {selectedPatient?.nombre}</h3>
            <label className="block text-xs font-bold text-slate-500">Motivo
              <input value={form.motivo || ''} onChange={e => setForm({ ...form, motivo: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ['subjetivo', 'Subjetivo'],
                ['objetivo', 'Objetivo'],
                ['evaluacion', 'Evaluacion'],
                ['plan', 'Plan'],
              ].map(([key, label]) => (
                <label key={key} className="text-xs font-bold text-slate-500">{label}
                  <textarea value={(form as any)[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50 min-h-[110px]" />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Num label="Peso kg" value={form.peso} onChange={v => setForm({ ...form, peso: v })} />
              <Num label="Temp C" value={form.temperatura} onChange={v => setForm({ ...form, temperatura: v })} />
              <Num label="FC" value={form.frecuencia_cardiaca} onChange={v => setForm({ ...form, frecuencia_cardiaca: v })} />
              <Num label="FR" value={form.frecuencia_respiratoria} onChange={v => setForm({ ...form, frecuencia_respiratoria: v })} />
              <label className="text-xs font-bold text-slate-500">Cond. corporal
                <input value={form.condicion_corporal || ''} onChange={e => setForm({ ...form, condicion_corporal: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-500">Notas de alta
              <textarea value={form.notas_alta || ''} onChange={e => setForm({ ...form, notas_alta: e.target.value })} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-slate-100 font-bold text-slate-600">Cancelar</button>
              <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 font-black text-white"><Save size={16} /> Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  return <div><p className="text-xs font-black text-slate-400 uppercase">{label}</p><p className="font-bold text-slate-800">{value || 'No registrado'}</p></div>;
}

function Soap({ label, value }: { label: string; value?: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><b className="text-teal-700">{label}</b><p className="mt-1 text-slate-600">{value || 'Sin datos'}</p></div>;
}

function Num({ label, value, onChange }: { label: string; value?: number; onChange: (n: number | undefined) => void }) {
  return <label className="text-xs font-bold text-slate-500">{label}<input type="number" step="0.01" value={value || ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)} className="mt-1 w-full p-2.5 rounded-xl border bg-slate-50" /></label>;
}
