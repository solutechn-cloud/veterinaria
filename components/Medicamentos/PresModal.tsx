import React, { useState } from 'react';
import { X, TrendingUp } from 'lucide-react';
import { PresentacionVenta } from '../../types';
import { inp, btnPrimary, btnSecondary, btnIcon, FieldLabel } from './shared';

interface Props {
  show: boolean;
  editingId: number | null;
  form: Partial<PresentacionVenta>;
  costoBaseUnitario?: number;
  medMargenGanancia?: number;
  onChange: (form: Partial<PresentacionVenta>) => void;
  onSave: () => void;
  onClose: () => void;
}

export default function PresModal({ show, editingId, form, costoBaseUnitario, medMargenGanancia, onChange, onSave, onClose }: Props) {
  const [margen, setMargen] = useState(medMargenGanancia ?? 30);

  if (!show) return null;

  const set = (patch: Partial<PresentacionVenta>) => onChange({ ...form, ...patch });

  const costoBase = Number(costoBaseUnitario) || 0;
  const factor = Number(form.factor_conversion) || 1;
  const costoPresentacion = costoBase * factor;
  const precioSugerido = costoPresentacion > 0 ? Math.round(costoPresentacion * (1 + margen / 100) * 100) / 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">{editingId ? 'Editar Presentación' : 'Nueva Presentación'}</h2>
          <button onClick={onClose} className={`${btnIcon} text-slate-400 hover:bg-slate-100`}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <FieldLabel>Nombre *</FieldLabel>
            <input className={inp} placeholder="Ej. Caja x 12, Tableta, Frasco" value={form.nombre || ''} onChange={e => set({ nombre: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Factor Conversión</FieldLabel>
              <input type="number" min="0.001" step="0.001" className={inp} value={form.factor_conversion ?? 1} onChange={e => set({ factor_conversion: Number(e.target.value) })} />
            </div>
            <div>
              <FieldLabel>Precio Venta (L)</FieldLabel>
              <input type="number" min="0" step="0.01" className={inp} value={form.precio_venta ?? 0} onChange={e => set({ precio_venta: Number(e.target.value) })} />
            </div>
            <div>
              <FieldLabel>Precio 3a Edad (L)</FieldLabel>
              <input type="number" min="0" step="0.01" className={inp} value={form.precio_tercera_edad || ''} onChange={e => set({ precio_tercera_edad: Number(e.target.value) })} placeholder="Opcional" />
            </div>
            <div>
              <FieldLabel>Código de Barras</FieldLabel>
              <input className={inp} value={form.codigo_barras_presentacion || ''} onChange={e => set({ codigo_barras_presentacion: e.target.value })} />
            </div>
          </div>

          {costoPresentacion > 0 ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-indigo-700">
                <TrendingUp size={13} />
                <span className="text-xs font-bold">Sugerencia de precio de venta</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Ganancia</span>
                <input
                  type="number" min="0" step="1"
                  className="w-16 text-sm bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-300"
                  value={margen} onChange={e => setMargen(Number(e.target.value))}
                />
                <span className="text-xs text-slate-500">% sobre L {costoPresentacion.toFixed(2)} =</span>
                <span className="text-sm font-bold text-indigo-700">L {precioSugerido.toFixed(2)}</span>
              </div>
              <button
                type="button"
                onClick={() => set({ precio_venta: precioSugerido })}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
              >
                Usar precio sugerido
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-slate-400">Aún no hay ningún lote registrado con costo de compra para este medicamento — no se puede sugerir un precio todavía.</p>
          )}

          <div className="flex gap-5 pt-1">
            {(['es_unidad_venta', 'es_unidad_compra', 'permite_fraccion'] as const).map(key => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={(form as any)[key] || false} onChange={e => set({ [key]: e.target.checked } as any)} className="accent-indigo-600 w-4 h-4" />
                {key === 'es_unidad_venta' ? 'Unidad de Venta' : key === 'es_unidad_compra' ? 'Unidad de Compra' : 'Permite Fracción'}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className={btnSecondary}>Cancelar</button>
          <button onClick={onSave} className={btnPrimary}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
