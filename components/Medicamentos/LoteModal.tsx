import React, { useEffect, useState } from 'react';
import { X, TrendingUp, AlertTriangle } from 'lucide-react';
import { PresentacionVenta } from '../../types';
import { inp, btnPrimary, btnSecondary, btnIcon, FieldLabel, LoteFormData } from './shared';

interface Props {
  show: boolean;
  medNombre?: string;
  medMargenDefault?: number;
  form: LoteFormData;
  presentaciones: PresentacionVenta[];
  proveedores: any[];
  onChange: (form: LoteFormData) => void;
  onSave: () => void;
  onClose: () => void;
  onApplySuggestedPrice: (idPresentacion: number, precio: number) => void;
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export default function LoteModal({ show, medNombre, medMargenDefault, form, presentaciones, proveedores, onChange, onSave, onClose, onApplySuggestedPrice }: Props) {
  const [margen, setMargen] = useState(medMargenDefault ?? 30);

  useEffect(() => {
    if (show) setMargen(medMargenDefault ?? 30);
  }, [show, medMargenDefault]);

  if (!show) return null;

  const set = (patch: Partial<LoteFormData>) => onChange({ ...form, ...patch });

  const selectedPres = presentaciones.find(p => p.id_presentacion === form.id_presentacion);
  const costo = Number(form.precio_compra_presentacion) || 0;
  const precioSugerido = costo > 0 ? Math.round(costo * (1 + margen / 100) * 100) / 100 : 0;
  const precioActualBajoCosto = !!selectedPres && costo > 0 && Number(selectedPres.precio_venta) < costo;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Ingresar Lote</h2>
            {medNombre && <p className="text-xs text-slate-400 mt-0.5">{medNombre}</p>}
          </div>
          <button onClick={onClose} className={`${btnIcon} text-slate-400 hover:bg-slate-100`}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <FieldLabel>Número de Lote *</FieldLabel>
            <input className={inp} value={form.numero_lote} onChange={e => set({ numero_lote: e.target.value })} placeholder="Ej. LOT-2025-001" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Mes Vencimiento</FieldLabel>
              <select className={inp} value={form.mes_vencimiento} onChange={e => set({ mes_vencimiento: Number(e.target.value) })}>
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Año Vencimiento</FieldLabel>
              <input type="number" className={inp} value={form.anio_vencimiento} onChange={e => set({ anio_vencimiento: Number(e.target.value) })} />
            </div>
            <div>
              <FieldLabel>Cantidad</FieldLabel>
              <input type="number" min="1" className={inp} value={form.cantidad} onChange={e => set({ cantidad: Number(e.target.value) })} />
            </div>
            <div>
              <FieldLabel>Precio Compra (L)</FieldLabel>
              <input type="number" min="0" step="0.01" className={inp} value={form.precio_compra_presentacion || ''} onChange={e => set({ precio_compra_presentacion: Number(e.target.value) })} placeholder="0.00" />
            </div>
          </div>
          <div>
            <FieldLabel>Presentación</FieldLabel>
            <select className={inp} value={form.id_presentacion} onChange={e => set({ id_presentacion: Number(e.target.value) })}>
              <option value={0}>Sin presentación específica</option>
              {presentaciones.map(p => <option key={p.id_presentacion} value={p.id_presentacion}>{p.nombre}</option>)}
            </select>
          </div>

          {selectedPres && costo > 0 && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-indigo-700">
                <TrendingUp size={13} />
                <span className="text-xs font-bold">Sugerencia de precio de venta</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Ganancia</span>
                <input
                  type="number" min="0" step="1"
                  className="w-16 text-sm bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-300"
                  value={margen} onChange={e => setMargen(Number(e.target.value))}
                />
                <span className="text-xs text-slate-500">% sobre L {costo.toFixed(2)} =</span>
                <span className="text-sm font-bold text-indigo-700">L {precioSugerido.toFixed(2)}</span>
              </div>
              <button
                type="button"
                onClick={() => onApplySuggestedPrice(selectedPres.id_presentacion, precioSugerido)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
              >
                Aplicar como precio de venta de "{selectedPres.nombre}"
              </button>
              <p className="text-[10px] text-slate-400">Es solo una sugerencia — puedes editar el precio de venta libremente en la presentación.</p>
            </div>
          )}

          {precioActualBajoCosto && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                El precio de venta actual de "{selectedPres!.nombre}" (L {Number(selectedPres!.precio_venta).toFixed(2)}) está por debajo del costo de este lote (L {costo.toFixed(2)}).
              </p>
            </div>
          )}

          <div>
            <FieldLabel>Proveedor</FieldLabel>
            <select className={inp} value={form.id_proveedor} onChange={e => set({ id_proveedor: e.target.value })}>
              <option value="">Sin asignar</option>
              {proveedores.map(p => <option key={p.codProveedor} value={p.codProveedor}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Notas</FieldLabel>
            <textarea className={inp} rows={2} value={form.notas} onChange={e => set({ notas: e.target.value })} placeholder="Observaciones opcionales…" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className={btnSecondary}>Cancelar</button>
          <button onClick={onSave} className={btnPrimary}>Ingresar Lote</button>
        </div>
      </div>
    </div>
  );
}
