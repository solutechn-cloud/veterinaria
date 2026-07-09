import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PackageSearch, PencilLine, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { MedicamentosService } from '../../services/api';
import { Medicamento, PresentacionVenta } from '../../types';

export type DesparasitacionItem = {
  id: string;
  nombre?: string;
  id_medicamento?: string;
  id_presentacion?: number;
  presentacion?: string;
  cantidad?: number;
  precio?: number;
  tipoIsv?: 'exento' | '15' | '18';
};

type DesparasitacionItemsEditorProps = {
  value?: DesparasitacionItem[];
  onChange: (value: DesparasitacionItem[]) => void;
  cobroPendiente?: boolean;
  onCobroPendienteChange?: (value: boolean) => void;
};

const nombreProducto = (p: Medicamento) => p.nombre_generico || p.nombre_comercial || p.codigo;
const money = (value?: number) => `L. ${Number(value || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const compactInputCls = 'rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100';

// Solo antiparasitarios (internos y externos); ambos vienen del mismo
// tipo_producto en inventario, la subcategoria queda en categoriaNombre.
function isDewormingProduct(product: Medicamento) {
  return String(product.tipo_producto || '').toLowerCase() === 'antiparasitario'
    || /antiparasitari/i.test(product.categoriaNombre || '');
}

export function DesparasitacionItemsEditor({ value = [], onChange, cobroPendiente, onCobroPendienteChange }: DesparasitacionItemsEditorProps) {
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
    // Para APLICAR un antiparasitario no se exige que este "Listo para venta":
    // se cargan todos los productos activos y se prioriza el filtro mas abajo.
    MedicamentosService.getAll({} as any)
      .then(list => { if (alive) setProductos(list || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    items.forEach(it => { if (it.id_medicamento && !presCache[it.id_medicamento]) void loadPres(it.id_medicamento); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
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

  // Prioriza antiparasitarios; si el tenant no los etiqueta asi, cae a todos los
  // productos para que igual se puedan encontrar y aplicar.
  const productosDeworming = useMemo(() => {
    const dew = productos.filter(isDewormingProduct);
    return dew.length ? dew : productos;
  }, [productos]);

  const sugerencias = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? productosDeworming.filter(p =>
          (p.nombre_comercial || '').toLowerCase().includes(q) ||
          (p.nombre_generico || '').toLowerCase().includes(q) ||
          (p.codigo || '').toLowerCase().includes(q))
      : productosDeworming;
    return base.slice(0, 8);
  }, [productosDeworming, query]);

  const patchItem = (id: string, patch: Partial<DesparasitacionItem>) =>
    onChange(items.map(it => (it.id === id ? { ...it, ...patch } : it)));

  const removeItem = (id: string) => onChange(items.filter(it => it.id !== id));

  const addProducto = async (p: Medicamento) => {
    setQuery('');
    setOpen(false);
    const pres = await loadPres(p.codigo);
    const vendibles = pres.filter(x => x.activo !== false && x.es_unidad_venta !== false);
    const first = vendibles[0] || pres[0];
    const item: DesparasitacionItem = {
      id: newId(),
      nombre: nombreProducto(p),
      id_medicamento: p.codigo,
      id_presentacion: first?.id_presentacion,
      presentacion: first?.nombre || '',
      precio: first ? Number(first.precio_venta || 0) : undefined,
      cantidad: 1,
      tipoIsv: p.tipo_isv || 'exento',
    };
    onChange([...itemsRef.current, item]);
  };

  const addManual = () => {
    const nombre = query.trim();
    if (!nombre) return;
    onChange([...itemsRef.current, { id: newId(), nombre, cantidad: 1, tipoIsv: 'exento' }]);
    setQuery('');
    setOpen(false);
  };

  const addEmptyManual = () => {
    onChange([...itemsRef.current, { id: newId(), nombre: '', cantidad: 1, tipoIsv: 'exento' }]);
    setOpen(false);
  };

  const selectPresentacion = (item: DesparasitacionItem, idValue: string) => {
    const pres = (item.id_medicamento ? presCache[item.id_medicamento] : []) || [];
    const selected = pres.find(p => String(p.id_presentacion) === idValue);
    patchItem(item.id, {
      id_presentacion: selected?.id_presentacion,
      presentacion: selected?.nombre || '',
      precio: selected ? Number(selected.precio_venta || 0) : item.precio,
    });
  };

  const total = items.reduce((s, it) => s + Number(it.precio || 0) * Number(it.cantidad || 0), 0);

  return (
    <div className="md:col-span-2 rounded-2xl border border-cyan-200 bg-cyan-50/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-700">
        <ShieldCheck size={17} />
        <span>Productos aplicados</span>
        {items.length > 0 && (
          <span className="ml-auto rounded-full bg-cyan-600 px-2 py-0.5 text-xs font-bold text-white">{items.length}</span>
        )}
      </div>

      {onCobroPendienteChange && (
        <label className="mb-3 flex items-start gap-3 rounded-xl border border-cyan-100 bg-white p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={!!cobroPendiente}
            onChange={e => onCobroPendienteChange(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="block font-semibold text-slate-800">Preparar cobro pendiente en recepción</span>
            <span className="text-xs text-slate-500">Los productos quedarán en una cotización para que caja los cobre al tutor.</span>
          </span>
        </label>
      )}

      <div className="relative" ref={boxRef}>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-cyan-300 focus-within:ring-2 focus-within:ring-cyan-100">
          <Search size={17} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            placeholder="Buscar antiparasitario por nombre o código..."
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
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-cyan-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600"><ShieldCheck size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{nombreProducto(p)}</span>
                    {[
                      p.nombre_comercial && p.nombre_comercial !== p.nombre_generico ? p.nombre_comercial : null,
                      p.categoriaNombre,
                    ].filter(Boolean).length > 0 && (
                      <span className="block truncate text-xs text-slate-400">{[
                        p.nombre_comercial && p.nombre_comercial !== p.nombre_generico ? p.nombre_comercial : null,
                        p.categoriaNombre,
                      ].filter(Boolean).join(' · ')}</span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{p.codigo}</span>
                  <Plus size={15} className="shrink-0 text-cyan-500" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && query.trim() && sugerencias.length === 0 && (
          <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl">
            <p className="text-slate-500">Sin coincidencias en el catálogo de antiparasitarios.</p>
            <button type="button" onMouseDown={e => { e.preventDefault(); addManual(); }} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500">
              <PencilLine size={13} /> Agregar "{query.trim()}" manual
            </button>
          </div>
        )}
      </div>

      <button type="button" onClick={addEmptyManual} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700 hover:text-cyan-800">
        <PencilLine size={13} /> Agregar producto manual (fuera de inventario)
      </button>

      {items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 py-8 text-center">
          <PackageSearch size={26} className="mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Busca un antiparasitario arriba y agrégalo.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span className="w-7 shrink-0" />
            <span className="min-w-[110px] flex-1">Producto</span>
            <span className="w-32 shrink-0">Presentación</span>
            <span className="w-14 shrink-0 text-center">Cantidad</span>
            <span className="w-24 shrink-0 text-right">Total</span>
            <span className="w-[22px] shrink-0" />
          </div>
          {items.map((item, idx) => {
            const pres = (item.id_medicamento ? presCache[item.id_medicamento] : []) || [];
            const subtotal = Number(item.precio || 0) * Number(item.cantidad || 0);
            const isInventory = !!item.id_medicamento;
            return (
              <article key={item.id} className="rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-700">{idx + 1}</span>
                  <input
                    value={item.nombre || ''}
                    onChange={e => patchItem(item.id, { nombre: e.target.value })}
                    placeholder="Nombre del producto"
                    className="min-w-[110px] flex-1 truncate border-none p-0 text-sm font-semibold text-slate-800 outline-none"
                  />
                  {pres.length > 0 ? (
                    <select
                      value={item.id_presentacion || ''}
                      onChange={e => selectPresentacion(item, e.target.value)}
                      title="Presentación" aria-label="Presentación"
                      className={`${compactInputCls} w-32 shrink-0 px-2 py-1.5`}
                    >
                      <option value="">Seleccione…</option>
                      {pres.filter(p => p.activo !== false).map(p => (
                        <option key={p.id_presentacion} value={p.id_presentacion}>{p.nombre}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={item.presentacion || ''}
                      onChange={e => patchItem(item.id, { presentacion: e.target.value })}
                      placeholder="Presentación"
                      title="Presentación" aria-label="Presentación"
                      className={`${compactInputCls} w-32 shrink-0 px-2 py-1.5`}
                      autoComplete="off"
                    />
                  )}
                  <input
                    type="number" min="1" value={item.cantidad ?? ''}
                    onChange={e => patchItem(item.id, { cantidad: e.target.value ? Number(e.target.value) : undefined })}
                    title="Cantidad" aria-label="Cantidad"
                    className={`${compactInputCls} w-14 shrink-0 px-2 py-1.5 text-center`}
                  />
                  {isInventory ? (
                    <span className="w-24 shrink-0 text-right text-sm font-bold text-slate-700">{money(subtotal)}</span>
                  ) : (
                    <input
                      type="number" min="0" step="0.01" value={item.precio ?? ''}
                      onChange={e => patchItem(item.id, { precio: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="0.00" title="Precio" aria-label="Precio"
                      className={`${compactInputCls} w-24 shrink-0 px-2 py-1.5 text-right`}
                    />
                  )}
                  <button type="button" onClick={() => removeItem(item.id)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600">
                    <Trash2 size={14} />
                  </button>
                </div>
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
