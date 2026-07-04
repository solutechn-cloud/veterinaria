import React from 'react';
import { ImagePlus } from 'lucide-react';
import { Paciente } from '../types';
import Swal from 'sweetalert2';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-normal outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300';

function initials(name?: string) {
  return (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Formulario completo de una mascota (sin selector de tutor). Reutilizable en el
// alta de pacientes y en el asistente de registro de tutor + mascotas.
export function PatientFields({ value, onChange }: { value: Partial<Paciente>; onChange: (patch: Partial<Paciente>) => void }) {
  const setPhoto = async (file?: File) => {
    if (!file) return;
    if (file.size > 900_000) {
      Swal.fire('Imagen muy grande', 'Use una foto menor a 900 KB para mantener la app rapida.', 'warning');
      return;
    }
    onChange({ foto_base64: await fileToBase64(file) });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-center">
        {value.foto_base64
          ? <img src={value.foto_base64} alt="Paciente" className="h-16 w-16 rounded-xl object-cover border" />
          : <div className="h-16 w-16 rounded-xl bg-slate-100 grid place-items-center font-semibold text-slate-400">{initials(value.nombre)}</div>}
        <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <ImagePlus size={16} /> Agregar foto
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => setPhoto(e.target.files?.[0])} />
        </label>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="Nombre"><input value={value.nombre || ''} onChange={e => onChange({ nombre: e.target.value })} className={inputClass} placeholder="Nombre de la mascota" /></Field>
        <Field label="Especie"><input value={value.especie || ''} onChange={e => onChange({ especie: e.target.value })} className={inputClass} placeholder="Canino, Felino..." /></Field>
        <Field label="Raza"><input value={value.raza || ''} onChange={e => onChange({ raza: e.target.value })} className={inputClass} /></Field>
        <Field label="Sexo">
          <select value={value.sexo || ''} onChange={e => onChange({ sexo: e.target.value })} className={inputClass}>
            <option value="">No especificado</option><option>Macho</option><option>Hembra</option>
          </select>
        </Field>
        <Field label="Color"><input value={value.color || ''} onChange={e => onChange({ color: e.target.value })} className={inputClass} /></Field>
        <Field label="Peso actual kg"><input type="number" step="0.001" value={value.peso_actual ?? ''} onChange={e => onChange({ peso_actual: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></Field>
        <Field label="Nacimiento"><input type="date" value={value.fecha_nacimiento || ''} onChange={e => onChange({ fecha_nacimiento: e.target.value })} className={inputClass} /></Field>
        <Field label="Codigo paciente"><input value={value.microchip || ''} onChange={e => onChange({ microchip: e.target.value })} className={inputClass} /></Field>
        <Field label="Estado reproductivo"><input value={value.estado_reproductivo || ''} onChange={e => onChange({ estado_reproductivo: e.target.value })} className={inputClass} /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TextArea label="Alergias" value={value.alergias || ''} onChange={v => onChange({ alergias: v })} />
        <TextArea label="Condiciones cronicas" value={value.condiciones_cronicas || ''} onChange={v => onChange({ condiciones_cronicas: v })} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-xs font-semibold text-indigo-900/70">{label}<div className="mt-1">{children}</div></label>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold text-indigo-900/70">{label}<textarea value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm min-h-[56px] outline-none focus:ring-2 focus:ring-teal-200" /></label>;
}
