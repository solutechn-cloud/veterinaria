import React, { useEffect, useState } from 'react';
import { Pill, Plus, Trash2 } from 'lucide-react';
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
};

const nombreProducto = (p: Medicamento) => p.nombre_comercial || p.nombre_generico || p.codigo;
const money = (value?: number) => Number(value || 0).toLocaleString('es-HN', { style: 'currency', currency: 'HNL' });

export function MedicationItemsEditor({ value = [], onChange }: MedicationItemsEditorProps) {
  const rows = value.length ? value : [newMedicationRow()];
  const [productos, setProductos] = useState<Medicamento[]>([]);
  const [presCache, setPresCache] = useState<Record<string, PresentacionVenta[]>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    MedicamentosService.getAll({ estado_catalogo: 'Listo para venta' } as any)
      .then(list => { if (alive) setProductos(list || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const updateRow = (id: string, patch: Partial<MedicationItem>) => {
    onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  const loadPres = async (codigo?: string) => {
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

  useEffect(() => {
    rows.forEach(row => { if (row.id_medicamento) void loadPres(row.id_medicamento); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const addRow = () => onChange([...rows, newMedicationRow()]);
  const removeRow = (id: string) => onChange(rows.length === 1 ? [newMedicationRow()] : rows.filter(row => row.id !== id));

  const selectPresentation = (rowId: string, presentaciones: PresentacionVenta[], idValue: string) => {
    const selected = presentaciones.find(p => String(p.id_presentacion) === idValue);
    updateRow(rowId, {
      id_presentacion: selected?.id_presentacion,
      presentacion: selected?.nombre || '',
      precioVenta: selected ? Number(selected.precio_venta || 0) : undefined,
    });
  };

  const selectProducto = async (rowId: string, p: Medicamento) => {
    const presentaciones = await loadPres(p.codigo);
    const vendibles = presentaciones.filter(item => item.activo !== false && item.es_unidad_venta !== false);
    const first = vendibles[0] || presentaciones[0];
    updateRow(rowId, {
      medicamento: nombreProducto(p),
      id_medicamento: p.codigo,
      id_presentacion: first?.id_presentacion,
      presentacion: first?.nombre || '',
      precioVenta: first ? Number(first.precio_venta || 0) : undefined,
      tipoIsv: p.tipo_isv || 'exento',
    });
    setOpenRow(null);
  };

  const sugerencias = (query = '') => {
    const q = query.trim().toLowerCase();
    const base = q
      ? productos.filter(p =>
          (p.nombre_comercial || '').toLowerCase().includes(q) ||
          (p.nombre_generico || '').toLowerCase().includes(q) ||
          (p.codigo || '').toLowerCase().includes(q))
      : productos;
    return base.slice(0, 8);
  };

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200';

  return (
    <div className="md:col-span-2 rounded-2xl border border-violet-200 bg-violet-50/20 p-3">
      <div className="mb-3 flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
          <Pill size={17} />
          <span>Medicamentos recetados</span>
        </div>
      </div>
      <div className="space-y-4">
        {rows.map(row => {
          const opciones = sugerencias(row.medicamento);
          const presentaciones = row.id_medicamento ? (presCache[row.id_medicamento] || []) : [];
          const selectedPresentation = presentaciones.find(p => p.id_presentacion === row.id_presentacion);
          return (
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
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr_90px_120px]">
                <FieldShell label="Medicamento">
                  <div className="relative">
                    <input
                      value={row.medicamento || ''}
                      onChange={event => {
                        updateRow(row.id, {
                          medicamento: event.target.value,
                          id_medicamento: undefined,
                          id_presentacion: undefined,
                          presentacion: '',
                          precioVenta: undefined,
                        });
                        setOpenRow(row.id);
                      }}
                      onFocus={() => setOpenRow(row.id)}
                      onBlur={() => setTimeout(() => setOpenRow(prev => (prev === row.id ? null : prev)), 150)}
                      placeholder="Buscar por nombre o codigo, o escribir..."
                      className={inputCls}
                      autoComplete="off"
                    />
                    {openRow === row.id && opciones.length > 0 && (
                      <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                        {opciones.map(p => (
                          <li key={p.codigo}>
                            <button
                              type="button"
                              onMouseDown={event => { event.preventDefault(); void selectProducto(row.id, p); }}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50"
                            >
                              <span className="truncate text-slate-700">{nombreProducto(p)}</span>
                              <span className="shrink-0 text-xs font-medium text-slate-400">{p.codigo}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </FieldShell>
                <FieldShell label="Presentacion">
                  {presentaciones.length > 0 ? (
                    <select
                      value={row.id_presentacion || ''}
                      onChange={event => selectPresentation(row.id, presentaciones, event.target.value)}
                      className={inputCls}
                    >
                      <option value="">Seleccione presentacion</option>
                      {presentaciones.filter(p => p.activo !== false).map(p => (
                        <option key={p.id_presentacion} value={p.id_presentacion}>
                          {p.nombre} - {money(Number(p.precio_venta || 0))}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={row.presentacion || ''}
                      onChange={event => updateRow(row.id, { presentacion: event.target.value })}
                      placeholder="Tableta, jarabe, ampolla..."
                      className={inputCls}
                      autoComplete="off"
                    />
                  )}
                </FieldShell>
                <FieldShell label="Cantidad">
                  <input
                    type="number"
                    min="1"
                    value={row.cantidad || ''}
                    onChange={event => updateRow(row.id, { cantidad: event.target.value ? Number(event.target.value) : undefined })}
                    className={inputCls}
                  />
                </FieldShell>
                <FieldShell label="Precio">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.precioVenta ?? ''}
                    onChange={event => updateRow(row.id, { precioVenta: event.target.value ? Number(event.target.value) : undefined })}
                    placeholder="0.00"
                    className={inputCls}
                  />
                </FieldShell>
              </div>
              {selectedPresentation && (
                <p className="mt-2 text-xs text-slate-400">
                  Esta presentacion quedara lista para una cotizacion pendiente en recepcion.
                </p>
              )}
              <div className="mt-4">
                <FieldShell label="Frecuencia / indicaciones">
                  <textarea
                    value={row.frecuencia || ''}
                    onChange={event => updateRow(row.id, { frecuencia: event.target.value })}
                    placeholder="Ej. 1 tableta cada 12 horas por 7 dias, via oral"
                    className="w-full min-h-[80px] rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
                  />
                </FieldShell>
              </div>
            </article>
          );
        })}
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
