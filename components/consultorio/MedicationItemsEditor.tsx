import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pill, Plus, Search, Trash2, PackageSearch, PencilLine } from 'lucide-react';
import { MedicamentosService } from '../../services/api';
import { Medicamento, PresentacionVenta } from '../../types';

export type MedicationItem = {
  id: string;
  medicamento?: string;
  id_medicamento?: string;
  id_presentacion?: number;
  presentacion?: string;
  cantidad?: number;
  frecuencia?: string;
  precioVenta?: number;
  tipoIsv?: 'exento' | '15' | '18';
};

type MedicationItemsEditorProps = {
  value?: MedicationItem[];
  onChange: (value: MedicationItem[]) => void;
  cobroPendiente?: boolean;
  onCobroPendienteChange?: (value: boolean) => void;
};

const nombreProducto = (p: Medicamento) => p.nombre_comercial || p.nombre_generico || p.codigo;
const money = (value?: number) => `L. ${Number(value || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100';

export function MedicationItemsEditor({ value = [], onChange, cobroPendiente, onCobroPendienteChange }: MedicationItemsEditorProps) {
  const items = value;
  const [productos, setProductos] = useState<Medicamento[]>([]);
  const [presCache, setPresCache] = useState<Record<string, PresentacionVenta[]>>({});
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Siempre apunta a la lista más reciente, para appends seguros tras un await.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    let alive = true;
    MedicamentosService.getAll({ estado_catalogo: 'Listo para venta' } as any)
      .then(list => { if (alive) setProductos(list || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Precarga presentaciones de productos ya seleccionados (modo edición).
  useEffect(() => {
    items.forEach(it => { if (it.id_medicamento && !presCache[it.id_medicamento]) void loadPres(it.id_medicamento); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Cerrar el dropdown al hacer click fuera.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const loadPres = async (codigo?: string): Promise<PresentacionVenta[]> => {
    if (!codigo) return [];
    if (presCache[codigo]) return presCache[codigo];
    try {
      const list = await MedicamentosService.getPresentaciones(codigo);
      setPresCache(prev => ({ ...prev, [codigo]: list || [] }));
      return list || [];
    } catch { return []; }
  };

  const sugerencias = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? productos.filter(p =>
          (p.nombre_comercial || '').toLowerCase().includes(q) ||
          (p.nombre_generico || '').toLowerCase().includes(q) ||
          (p.codigo || '').toLowerCase().includes(q))
      : productos;
    return base.slice(0, 8);
  }, [productos, query]);

  const patchItem = (id: string, patch: Partial<MedicationItem>) =>
    onChange(items.map(it => (it.id === id ? { ...it, ...patch } : it)));

  const removeItem = (id: string) => onChange(items.filter(it => it.id !== id));

  const addProducto = async (p: Medicamento) => {
    setQuery('');
    setOpen(false);
    // Cargar presentación + precio ANTES de agregar, para insertar el item ya completo.
    const pres = await loadPres(p.codigo);
    const vendibles = pres.filter(x => x.activo !== false && x.es_unidad_venta !== false);
    const first = vendibles[0] || pres[0];
    const item: MedicationItem = {
      id: newId(),
      medicamento: nombreProducto(p),
      id_medicamento: p.codigo,
      id_presentacion: first?.id_presentacion,
      presentacion: first?.nombre || '',
      precioVenta: first ? Number(first.precio_venta || 0) : undefined,
      cantidad: 1,
      tipoIsv: p.tipo_isv || 'exento',
    };
    onChange([...itemsRef.current, item]);
  };

  const addManual = () => {
    const nombre = query.trim();
    if (!nombre) return;
    onChange([...itemsRef.current, { id: newId(), medicamento: nombre, cantidad: 1, tipoIsv: 'exento' }]);
    setQuery('');
    setOpen(false);
  };

  // Agrega una línea vacía y editable para un medicamento que no está en inventario.
  const addEmptyManual = () => {
    onChange([...itemsRef.current, { id: newId(), medicamento: '', cantidad: 1, tipoIsv: 'exento' }]);
    setOpen(false);
  };

  const selectPresentacion = (item: MedicationItem, idValue: string) => {
    const pres = (item.id_medicamento ? presCache[item.id_medicamento] : []) || [];
    const selected = pres.find(p => String(p.id_presentacion) === idValue);
    patchItem(item.id, {
      id_presentacion: selected?.id_presentacion,
      presentacion: selected?.nombre || '',
      precioVenta: selected ? Number(selected.precio_venta || 0) : item.precioVenta,
    });
  };

  const total = items.reduce((s, it) => s + Number(it.precioVenta || 0) * Number(it.cantidad || 0), 0);

  return (
    <div className="md:col-span-2 rounded-2xl border border-violet-200 bg-violet-50/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-violet-700">
        <Pill size={17} />
        <span>Medicamentos recetados</span>
        {items.length > 0 && (
          <span className="ml-auto rounded-full bg-violet-600 px-2 py-0.5 text-xs font-bold text-white">{items.length}</span>
        )}
      </div>

      {/* Cobro pendiente al inicio de la sección de medicamentos */}
      {onCobroPendienteChange && (
        <label className="mb-3 flex items-start gap-3 rounded-xl border border-indigo-100 bg-white p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={!!cobroPendiente}
            onChange={e => onCobroPendienteChange(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="block font-semibold text-slate-800">Preparar cobro pendiente en recepción</span>
            <span className="text-xs text-slate-500">Los medicamentos del inventario quedarán en una cotización para que caja los cobre al tutor.</span>
          </span>
        </label>
      )}

      {/* Buscador tipo carrito */}
      <div className="relative" ref={boxRef}>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
          <Search size={17} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar por nombre comercial, genérico o código..."
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
            {sugerencias.map(p => (
              <li key={p.codigo}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); void addProducto(p); }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-indigo-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500"><Pill size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{nombreProducto(p)}</span>
                    {p.nombre_comercial && p.nombre_generico && (
                      <span className="block truncate text-xs text-slate-400">{p.nombre_generico}</span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{p.codigo}</span>
                  <Plus size={15} className="shrink-0 text-indigo-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && query.trim() && sugerencias.length === 0 && (
          <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl">
            <p className="text-slate-500">Sin coincidencias en inventario.</p>
            <button type="button" onMouseDown={e => { e.preventDefault(); addManual(); }} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500">
              <PencilLine size={13} /> Agregar "{query.trim()}" manual
            </button>
          </div>
        )}
      </div>

      <button type="button" onClick={addEmptyManual} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
        <PencilLine size={13} /> Agregar medicamento manual (fuera de inventario)
      </button>

      {/* Lista / carrito */}
      {items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 py-8 text-center">
          <PackageSearch size={26} className="mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Busca un medicamento arriba y agrégalo a la receta.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item, idx) => {
            const pres = (item.id_medicamento ? presCache[item.id_medicamento] : []) || [];
            const subtotal = Number(item.precioVenta || 0) * Number(item.cantidad || 0);
            return (
              <article key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-600">{idx + 1}</span>
                    <div className="min-w-0">
                      <input
                        value={item.medicamento || ''}
                        onChange={e => patchItem(item.id, { medicamento: e.target.value })}
                        className="w-full truncate border-none p-0 text-sm font-semibold text-slate-800 outline-none"
                      />
                      {item.id_medicamento && <span className="text-[11px] text-slate-400">Cód: {item.id_medicamento}</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => removeItem(item.id)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600">
                    <Trash2 size={14} /> Quitar
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.5fr_80px_110px]">
                  <label className="block text-xs font-medium text-slate-500">
                    Presentación
                    {pres.length > 0 ? (
                      <select
                        value={item.id_presentacion || ''}
                        onChange={e => selectPresentacion(item, e.target.value)}
                        className={`${inputCls} mt-1`}
                      >
                        <option value="">Seleccione…</option>
                        {pres.filter(p => p.activo !== false).map(p => (
                          <option key={p.id_presentacion} value={p.id_presentacion}>
                            {p.nombre} — {money(Number(p.precio_venta || 0))}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={item.presentacion || ''}
                        onChange={e => patchItem(item.id, { presentacion: e.target.value })}
                        placeholder="Tableta, jarabe…"
                        className={`${inputCls} mt-1`}
                        autoComplete="off"
                      />
                    )}
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    Cantidad
                    <input
                      type="number"
                      min="1"
                      value={item.cantidad ?? ''}
                      onChange={e => patchItem(item.id, { cantidad: e.target.value ? Number(e.target.value) : undefined })}
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    Precio unit.
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.precioVenta ?? ''}
                      onChange={e => patchItem(item.id, { precioVenta: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="0.00"
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                </div>

                <label className="mt-3 block text-xs font-medium text-slate-500">
                  Frecuencia / indicaciones
                  <textarea
                    value={item.frecuencia || ''}
                    onChange={e => patchItem(item.id, { frecuencia: e.target.value })}
                    placeholder="Ej. 1 tableta cada 12 horas por 7 días, vía oral"
                    className={`${inputCls} mt-1 min-h-[60px]`}
                  />
                </label>

                {subtotal > 0 && (
                  <div className="mt-2 text-right text-xs text-slate-500">
                    Subtotal: <span className="font-bold text-slate-700">{money(subtotal)}</span>
                  </div>
                )}
              </article>
            );
          })}

          {total > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
              <span className="text-sm font-medium text-slate-300">Total estimado</span>
              <span className="text-lg font-bold">{money(total)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
