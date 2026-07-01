import React from 'react';
import { Pill, Plus, Trash2 } from 'lucide-react';

export type MedicationItem = {
  id: string;
  medicamento?: string;
  presentacion?: string;
  cantidad?: number;
  posologia?: string;
};

type MedicationItemsEditorProps = {
  value?: MedicationItem[];
  onChange: (value: MedicationItem[]) => void;
};

export function MedicationItemsEditor({ value = [], onChange }: MedicationItemsEditorProps) {
  const rows = value.length ? value : [newMedicationRow()];

  const updateRow = (id: string, patch: Partial<MedicationItem>) => {
    onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  const addRow = () => onChange([...rows, newMedicationRow()]);

  const removeRow = (id: string) => {
    onChange(rows.length === 1 ? [newMedicationRow()] : rows.filter(row => row.id !== id));
  };

  return (
    <div className="md:col-span-2 rounded-2xl border border-violet-200 bg-violet-50/20 p-3">
      <div className="mb-3 flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
          <Pill size={17} />
          <span>Medicamentos recetados</span>
        </div>
      </div>
      <div className="space-y-4">
        {rows.map(row => (
          <article key={row.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
                <Pill size={17} />
                <span>Medicamento</span>
              </div>
              <button type="button" onClick={() => removeRow(row.id)} className="inline-flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-600">
                <Trash2 size={14} /> Eliminar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr_90px]">
              <FieldShell label="Medicamento">
                <input
                  value={row.medicamento || ''}
                  onChange={event => updateRow(row.id, { medicamento: event.target.value })}
                  placeholder="Ej. Amoxicilina 250mg"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
                />
              </FieldShell>
              <FieldShell label="Presentación">
                <input
                  value={row.presentacion || ''}
                  onChange={event => updateRow(row.id, { presentacion: event.target.value })}
                  placeholder="Tableta, jarabe, ampolla..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
                />
              </FieldShell>
              <FieldShell label="Cantidad">
                <input
                  type="number"
                  min="1"
                  value={row.cantidad || ''}
                  onChange={event => updateRow(row.id, { cantidad: event.target.value ? Number(event.target.value) : undefined })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
                />
              </FieldShell>
            </div>
            <div className="mt-4">
              <FieldShell label="Posología / cada cuándo tomarlo">
                <textarea
                  value={row.posologia || ''}
                  onChange={event => updateRow(row.id, { posologia: event.target.value })}
                  placeholder="Ej. 1 tableta cada 12 horas por 7 días, vía oral"
                  className="w-full min-h-[80px] rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
                />
              </FieldShell>
            </div>
          </article>
        ))}
      </div>
      <button type="button" onClick={addRow} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
        <Plus size={17} /> Agregar medicamento
      </button>
    </div>
  );
}

function newMedicationRow(): MedicationItem {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, cantidad: 1 };
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-normal text-indigo-900/70">
      <span className="mb-2 flex items-center justify-between gap-3">
        <span>{label}</span>
      </span>
      {children}
    </label>
  );
}
