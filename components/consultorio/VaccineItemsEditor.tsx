import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PackageSearch, PencilLine, Plus, Search, Syringe, Trash2 } from 'lucide-react';
import { MedicamentosService } from '../../services/api';
import { Medicamento, PresentacionVenta } from '../../types';

export type VaccineCartItem = {
  id: string;
  nombre_vacuna?: string;
  id_medicamento?: string;
  id_presentacion?: number;
  presentacion?: string;
  cantidad?: number;
  precio_unitario?: number;
  tipo_isv?: 'exento' | '15' | '18';
  proxima_dosis?: string;
  notas?: string;
};

type VaccineItemsEditorProps = {
  value?: VaccineCartItem[];
  onChange: (value: VaccineCartItem[]) => void;
};

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100';
const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const nombreProducto = (p: Medicamento) => p.nombre_comercial || p.nombre_generico || p.codigo;
const money = (value?: number) => `L. ${Number(value || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function isVaccineProduct(product: Medicamento) {
  return String(product.tipo_producto || '').toLowerCase() === 'vacuna';
}

export function VaccineItemsEditor({ value = [], onChange }: VaccineItemsEditorProps) {
  const items = value;
  const [productos, setProductos] = useState<Medicamento[]>([]);
  const [presCache, setPresCache] = useState<Record<string, PresentacionVenta[]>>({});
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    let alive = true;
    MedicamentosService.getAll({ estado_catalogo: 'Listo para venta' } as any)
      .then(list => { if (alive) setProductos(list || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    items.forEach(item => {
      if (item.id_medicamento && !presCache[item.id_medicamento]) void loadPres(item.id_medicamento);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
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
    } catch {
      return [];
    }
  };

  const productosVacunas = useMemo(() => {
    const onlyVaccines = productos.filter(isVaccineProduct);
    return onlyVaccines.length ? onlyVaccines : productos;
  }, [productos]);

  const sugerencias = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? productosVacunas.filter(p =>
          (p.nombre_comercial || '').toLowerCase().includes(q) ||
          (p.nombre_generico || '').toLowerCase().includes(q) ||
          (p.codigo || '').toLowerCase().includes(q) ||
          (p.laboratorio || '').toLowerCase().includes(q))
      : productosVacunas;
    return base.slice(0, 8);
  }, [productosVacunas, query]);

  const patchItem = (id: string, patch: Partial<VaccineCartItem>) => {
    onChange(items.map(item => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => onChange(items.filter(item => item.id !== id));

  const addProducto = async (product: Medicamento) => {
    setQuery('');
    setOpen(false);
    const pres = await loadPres(product.codigo);
    const vendibles = pres.filter(item => item.activo !== false && item.es_unidad_venta !== false);
    const first = vendibles[0] || pres[0];
    onChange([
      ...itemsRef.current,
      {
        id: newId(),
        nombre_vacuna: nombreProducto(product),
        id_medicamento: product.codigo,
        id_presentacion: first?.id_presentacion,
        presentacion: first?.nombre || '',
        cantidad: 1,
        precio_unitario: first ? Number(first.precio_venta || 0) : undefined,
        tipo_isv: product.tipo_isv || 'exento',
      },
    ]);
  };

  const addManual = () => {
    const nombre = query.trim();
    if (!nombre) return;
    onChange([...itemsRef.current, { id: newId(), nombre_vacuna: nombre, cantidad: 1, tipo_isv: 'exento' }]);
    setQuery('');
    setOpen(false);
  };

  const addEmptyManual = () => {
    onChange([...itemsRef.current, { id: newId(), nombre_vacuna: '', cantidad: 1, tipo_isv: 'exento' }]);
    setOpen(false);
  };

  const selectPresentacion = (item: VaccineCartItem, idValue: string) => {
    const pres = (item.id_medicamento ? presCache[item.id_medicamento] : []) || [];
    const selected = pres.find(p => String(p.id_presentacion) === idValue);
    patchItem(item.id, {
      id_presentacion: selected?.id_presentacion,
      presentacion: selected?.nombre || '',
      precio_unitario: selected ? Number(selected.precio_venta || 0) : item.precio_unitario,
    });
  };

  const total = items.reduce((sum, item) => sum + Number(item.precio_unitario || 0) * Number(item.cantidad || 0), 0);

  return (
    <div className="md:col-span-2 rounded-2xl border border-teal-200 bg-teal-50/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-teal-700">
        <Syringe size={17} />
        <span>Vacunas aplicadas</span>
        {items.length > 0 && (
          <span className="ml-auto rounded-full bg-teal-600 px-2 py-0.5 text-xs font-bold text-white">{items.length}</span>
        )}
      </div>

      <div className="relative" ref={boxRef}>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
          <Search size={17} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={event => { setQuery(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar vacuna por nombre, codigo o laboratorio..."
            className="w-full bg-transparent text-sm outline-none"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onMouseDown={event => { event.preventDefault(); addManual(); }}
              className="shrink-0 whitespace-nowrap rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
            >
              + Manual
            </button>
          )}
        </div>

        {open && sugerencias.length > 0 && (
          <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            {sugerencias.map(product => (
              <li key={product.codigo}>
                <button
                  type="button"
                  onMouseDown={event => { event.preventDefault(); void addProducto(product); }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-teal-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600"><Syringe size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{nombreProducto(product)}</span>
                    <span className="block truncate text-xs text-slate-400">{[product.laboratorio, product.concentracion].filter(Boolean).join(' - ') || product.nombre_generico}</span>
                  </span>
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{product.codigo}</span>
                  <Plus size={15} className="shrink-0 text-teal-500" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {open && query.trim() && sugerencias.length === 0 && (
          <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl">
            <p className="text-slate-500">No se encontro en inventario.</p>
            <button
              type="button"
              onMouseDown={event => { event.preventDefault(); addManual(); }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              <PencilLine size={13} /> Agregar "{query.trim()}" manual
            </button>
          </div>
        )}
      </div>

      <button type="button" onClick={addEmptyManual} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
        <PencilLine size={13} /> Agregar vacuna manual
      </button>

      {items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 py-8 text-center">
          <PackageSearch size={26} className="mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Busca una vacuna arriba o agregala manualmente.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item, idx) => {
            const pres = (item.id_medicamento ? presCache[item.id_medicamento] : []) || [];
            const subtotal = Number(item.precio_unitario || 0) * Number(item.cantidad || 0);
            // Precio e ISV solo aplican a vacunas del inventario; en las manuales
            // no se piden (el ISV se define al registrar el producto en inventario).
            const isInventory = !!item.id_medicamento;
            return (
              <article key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">{idx + 1}</span>
                    <div className="min-w-0">
                      <input
                        value={item.nombre_vacuna || ''}
                        onChange={event => patchItem(item.id, { nombre_vacuna: event.target.value })}
                        placeholder="Nombre de la vacuna"
                        className="w-full truncate border-none p-0 text-sm font-semibold text-slate-800 outline-none"
                      />
                      {item.id_medicamento && <span className="text-[11px] text-slate-400">Cod: {item.id_medicamento}</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => removeItem(item.id)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600">
                    <Trash2 size={14} /> Quitar
                  </button>
                </div>

                <div className={`grid grid-cols-1 gap-3 ${isInventory ? 'md:grid-cols-[1.4fr_88px_120px_120px]' : 'md:grid-cols-[1fr_120px]'}`}>
                  <label className="block text-xs font-medium text-slate-500">
                    Presentacion
                    {pres.length > 0 ? (
                      <select value={item.id_presentacion || ''} onChange={event => selectPresentacion(item, event.target.value)} className={`${inputCls} mt-1`}>
                        <option value="">Seleccione...</option>
                        {pres.filter(p => p.activo !== false).map(p => (
                          <option key={p.id_presentacion} value={p.id_presentacion}>
                            {p.nombre} - {money(Number(p.precio_venta || 0))}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={item.presentacion || ''} onChange={event => patchItem(item.id, { presentacion: event.target.value })} placeholder="Manual" className={`${inputCls} mt-1`} />
                    )}
                  </label>

                  <label className="block text-xs font-medium text-slate-500">
                    Cantidad
                    <input type="number" min="1" value={item.cantidad || 1} onChange={event => patchItem(item.id, { cantidad: Number(event.target.value || 1) })} className={`${inputCls} mt-1`} />
                  </label>

                  {isInventory && (
                    <label className="block text-xs font-medium text-slate-500">
                      Precio
                      <input type="number" min="0" step="0.01" value={item.precio_unitario ?? ''} onChange={event => patchItem(item.id, { precio_unitario: event.target.value ? Number(event.target.value) : undefined })} className={`${inputCls} mt-1`} />
                    </label>
                  )}

                  {isInventory && (
                    <label className="block text-xs font-medium text-slate-500">
                      ISV
                      <select value={item.tipo_isv || 'exento'} onChange={event => patchItem(item.id, { tipo_isv: event.target.value as VaccineCartItem['tipo_isv'] })} className={`${inputCls} mt-1`}>
                        <option value="exento">Exento</option>
                        <option value="15">15%</option>
                        <option value="18">18%</option>
                      </select>
                    </label>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr_auto]">
                  <label className="block text-xs font-medium text-slate-500">
                    Proxima dosis
                    <input type="date" value={item.proxima_dosis || ''} onChange={event => patchItem(item.id, { proxima_dosis: event.target.value })} className={`${inputCls} mt-1`} />
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    Notas
                    <input value={item.notas || ''} onChange={event => patchItem(item.id, { notas: event.target.value })} placeholder="Observacion de esta vacuna" className={`${inputCls} mt-1`} />
                  </label>
                  <div className="flex items-end justify-end pb-2 text-sm font-semibold text-slate-700">{isInventory ? money(subtotal) : ''}</div>
                </div>
              </article>
            );
          })}
          <div className="flex justify-end rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            Total estimado: <span className="ml-2 text-teal-700">{money(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
