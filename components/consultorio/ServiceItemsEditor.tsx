import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stethoscope, Plus, Search, Trash2, PackageSearch, PencilLine } from 'lucide-react';
import { ServiciosVeterinariosService } from '../../services/api';
import { ServicioVeterinario } from '../../types';

export type ServiceItem = {
  id: string;
  id_servicio?: number;
  nombre?: string;
  cantidad?: number;
  precio?: number;
  tipoIsv?: 'exento' | '15' | '18';
};

type ServiceItemsEditorProps = {
  value?: ServiceItem[];
  onChange: (value: ServiceItem[]) => void;
  cobroPendiente?: boolean;
  onCobroPendienteChange?: (value: boolean) => void;
};

const money = (value?: number) => `L. ${Number(value || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100';

export function ServiceItemsEditor({ value = [], onChange, cobroPendiente, onCobroPendienteChange }: ServiceItemsEditorProps) {
  const items = value;
  const [servicios, setServicios] = useState<ServicioVeterinario[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    let alive = true;
    ServiciosVeterinariosService.getAll({ activo: 'true' })
      .then(list => { if (alive) setServicios((list || []).filter(s => s.activo !== false)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const sugerencias = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? servicios.filter(s =>
          (s.nombre || '').toLowerCase().includes(q) ||
          (s.categoria || '').toLowerCase().includes(q) ||
          (s.codigo || '').toLowerCase().includes(q))
      : servicios;
    return base.slice(0, 8);
  }, [servicios, query]);

  const patchItem = (id: string, patch: Partial<ServiceItem>) =>
    onChange(items.map(it => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id: string) => onChange(items.filter(it => it.id !== id));

  const addServicio = (s: ServicioVeterinario) => {
    onChange([...itemsRef.current, {
      id: newId(),
      id_servicio: s.id_servicio,
      nombre: s.nombre,
      cantidad: 1,
      precio: Number(s.precio || 0),
      tipoIsv: s.tipo_isv || 'exento',
    }]);
    setQuery('');
    setOpen(false);
  };

  const addManual = () => {
    const nombre = query.trim();
    if (!nombre) return;
    onChange([...itemsRef.current, { id: newId(), nombre, cantidad: 1, precio: undefined, tipoIsv: 'exento' }]);
    setQuery('');
    setOpen(false);
  };

  const addEmptyManual = () => {
    onChange([...itemsRef.current, { id: newId(), nombre: '', cantidad: 1, tipoIsv: 'exento' }]);
    setOpen(false);
  };

  const total = items.reduce((s, it) => s + Number(it.precio || 0) * Number(it.cantidad || 0), 0);

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-teal-700">
        <Stethoscope size={17} />
        <span>Servicios realizados</span>
        {items.length > 0 && (
          <span className="ml-auto rounded-full bg-teal-600 px-2 py-0.5 text-xs font-bold text-white">{items.length}</span>
        )}
      </div>

      {onCobroPendienteChange && (
        <label className="mb-3 flex items-start gap-3 rounded-xl border border-teal-100 bg-white p-3 text-sm text-slate-700">
          <input type="checkbox" checked={!!cobroPendiente} onChange={e => onCobroPendienteChange(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            <span className="block font-semibold text-slate-800">Preparar cobro pendiente en recepción</span>
            <span className="text-xs text-slate-500">Los servicios quedarán en una cotización para que caja los cobre al tutor.</span>
          </span>
        </label>
      )}

      <div className="relative" ref={boxRef}>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-teal-300 focus-within:ring-2 focus-within:ring-teal-100">
          <Search size={17} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar servicio por nombre, categoría o código..."
            className="w-full bg-transparent text-sm outline-none"
            autoComplete="off"
          />
          {query && (
            <button type="button" onMouseDown={e => { e.preventDefault(); addManual(); }} className="shrink-0 whitespace-nowrap rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200">
              + Manual
            </button>
          )}
        </div>

        {open && sugerencias.length > 0 && (
          <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            {sugerencias.map(s => (
              <li key={s.id_servicio}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); addServicio(s); }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-teal-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-500"><Stethoscope size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{s.nombre}</span>
                    <span className="block truncate text-xs text-slate-400">{s.categoria}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-slate-600">{money(Number(s.precio || 0))}</span>
                  <Plus size={15} className="shrink-0 text-teal-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && query.trim() && sugerencias.length === 0 && (
          <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl">
            <p className="text-slate-500">Sin coincidencias en el catálogo.</p>
            <button type="button" onMouseDown={e => { e.preventDefault(); addManual(); }} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500">
              <PencilLine size={13} /> Agregar "{query.trim()}" manual
            </button>
          </div>
        )}
      </div>

      <button type="button" onClick={addEmptyManual} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700">
        <PencilLine size={13} /> Agregar servicio manual (fuera del catálogo)
      </button>

      {items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 py-8 text-center">
          <PackageSearch size={26} className="mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Busca un servicio arriba y agrégalo a la consulta.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item, idx) => {
            const subtotal = Number(item.precio || 0) * Number(item.cantidad || 0);
            return (
              <article key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-600">{idx + 1}</span>
                    <input
                      value={item.nombre || ''}
                      onChange={e => patchItem(item.id, { nombre: e.target.value })}
                      placeholder="Nombre del servicio"
                      className="w-full truncate border-none p-0 text-sm font-semibold text-slate-800 outline-none"
                    />
                  </div>
                  <button type="button" onClick={() => removeItem(item.id)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600">
                    <Trash2 size={14} /> Quitar
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[90px_130px_1fr]">
                  <label className="block text-xs font-medium text-slate-500">
                    Cantidad
                    <input type="number" min="1" value={item.cantidad ?? ''} onChange={e => patchItem(item.id, { cantidad: e.target.value ? Number(e.target.value) : undefined })} className={`${inputCls} mt-1`} />
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    Precio unit.
                    <input type="number" min="0" step="0.01" value={item.precio ?? ''} onChange={e => patchItem(item.id, { precio: e.target.value ? Number(e.target.value) : undefined })} placeholder="0.00" className={`${inputCls} mt-1`} />
                  </label>
                  <div className="flex items-end justify-end pb-1 text-sm">
                    <span className="text-slate-500">Subtotal:&nbsp;</span><span className="font-bold text-slate-700">{money(subtotal)}</span>
                  </div>
                </div>
              </article>
            );
          })}

          {total > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
              <span className="text-sm font-medium text-slate-300">Total servicios</span>
              <span className="text-lg font-bold">{money(total)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
