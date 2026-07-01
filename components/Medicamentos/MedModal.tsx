import React, { useRef, useState } from 'react';
import {
  X, Pill, Upload, AlertTriangle, ChevronRight, ChevronLeft,
  Camera, FlaskConical, ShieldCheck, Sparkles,
} from 'lucide-react';
import {
  Medicamento, FormaFarmaceutica, CategoriaTerapeutica,
  AIMedicationAnalysisResult, AIMedicationImagePayload, AIFieldSuggestion,
} from '../../types';
import { AIService } from '../../services/api';
import { btnPrimary, btnSecondary, VIAS, ALMACENAMIENTO } from './shared';

type StepNum = 1 | 2 | 3;

interface StepImage {
  dataUrl: string;
  filename: string;
  mime: string;
  base64: string;
}

interface Props {
  show: boolean;
  editingId: string | null;
  form: Partial<Medicamento>;
  formas: FormaFarmaceutica[];
  categorias: CategoriaTerapeutica[];
  onChange: (form: Partial<Medicamento>) => void;
  onSave: () => void;
  onClose: () => void;
  onAIImagesReady?: (images: Array<AIMedicationImagePayload & { dataUrl: string }>) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfBadge({ s }: { s?: AIFieldSuggestion<any> }) {
  if (!s || s.confidence <= 0) return null;
  const c = s.confidence;
  const cls = c >= 0.75
    ? 'bg-emerald-100 text-emerald-700'
    : c >= 0.45 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400';
  return (
    <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>
      {c >= 0.75 ? '● Alta' : c >= 0.45 ? '◑ Media' : '○ Baja'}
    </span>
  );
}

function FieldCard({ label, value, onChange, suggestion, type = 'text', options = [], required, placeholder }: {
  label: string;
  value: string | number | undefined | null;
  onChange: (v: string | number) => void;
  suggestion?: AIFieldSuggestion<any>;
  type?: 'text' | 'select';
  options?: { value: string | number; label: string }[];
  required?: boolean;
  placeholder?: string;
}) {
  const c = suggestion?.confidence ?? -1;
  const wrapCls = c >= 0.75
    ? 'border-emerald-300 bg-emerald-50/20'
    : c >= 0.45 ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-xl border p-3 transition-all ${wrapCls}`}>
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </span>
        <ConfBadge s={suggestion} />
      </div>
      {type === 'select' ? (
        <select
          className="w-full text-sm text-slate-700 font-medium bg-transparent border-none outline-none"
          value={String(value ?? '')}
          onChange={e => {
            const v = e.target.value;
            onChange(v === '' ? '' : (isNaN(Number(v)) ? v : Number(v)));
          }}
        >
          <option value="">Sin definir</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          className="w-full text-sm text-slate-700 font-medium bg-transparent border-none outline-none placeholder:text-slate-300 placeholder:font-normal"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? (required ? 'Requerido' : 'Opcional')}
        />
      )}
    </div>
  );
}

function TextareaCard({ label, value, onChange, suggestion, placeholder }: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  suggestion?: AIFieldSuggestion<any>;
  placeholder?: string;
}) {
  const c = suggestion?.confidence ?? -1;
  const wrapCls = c >= 0.75
    ? 'border-emerald-300 bg-emerald-50/20'
    : c >= 0.45 ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-xl border p-3 transition-all ${wrapCls}`}>
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
        <ConfBadge s={suggestion} />
      </div>
      <textarea
        rows={3}
        className="w-full text-sm text-slate-700 bg-transparent border-none outline-none resize-none placeholder:text-slate-300"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Opcional'}
      />
    </div>
  );
}

function ImageDropZone({ images, loading, onAdd, onRemove }: {
  images: StepImage[];
  loading: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (idx: number) => void;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef  = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = Array.from(e.target.files || []);
    e.target.value = '';
    if (f.length) onAdd(f);
  };

  const remaining = 5 - images.length;

  return (
    <div className="space-y-3">
      {/* Gallery picker (multiple) */}
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handleChange} />
      {/* Camera picker — capture attribute opens native camera on mobile */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChange} />

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault(); setDragging(false);
          const f = Array.from(e.dataTransfer.files).filter(fi => fi.type.startsWith('image/'));
          if (f.length) onAdd(f);
        }}
        className={`relative border-2 border-dashed rounded-2xl p-5 flex flex-col items-center gap-2.5 transition-all select-none ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
        }`}
      >
        {loading && (
          <div className="absolute inset-0 bg-white/85 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-2 z-10">
            <div className="w-7 h-7 rounded-full border-[2.5px] border-indigo-200 border-t-indigo-600 animate-spin" />
            <p className="text-xs font-bold text-indigo-600">Analizando con IA…</p>
            <p className="text-[10px] text-slate-400">Extrayendo información del medicamento</p>
          </div>
        )}
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
          <Camera size={22} className="text-indigo-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700">Sube fotos del medicamento</p>
          <p className="text-xs text-slate-400 mt-0.5">Caja · blíster · etiqueta · frasco · hasta {5} imágenes</p>
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-50 rounded-lg px-3 py-1.5">
          <Sparkles size={11} className="text-indigo-500 shrink-0" />
          <span className="text-[11px] text-indigo-600 font-semibold">La IA completará el formulario automáticamente</span>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <button
            type="button"
            disabled={loading || remaining <= 0}
            onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 border border-indigo-600 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Camera size={12} /> Tomar foto
          </button>
          <button
            type="button"
            disabled={loading || remaining <= 0}
            onClick={() => galleryRef.current?.click()}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Upload size={12} /> Galería / archivos
          </button>
        </div>
        {remaining <= 0 && !loading && (
          <p className="text-[10px] text-amber-600 font-bold">Máximo 5 imágenes alcanzado</p>
        )}
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img.dataUrl}
                alt={img.filename}
                className="w-[68px] h-[68px] rounded-xl object-contain bg-slate-100 border border-slate-200"
              />
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {remaining > 0 && !loading && (
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="w-[68px] h-[68px] rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-300 flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-indigo-400 transition-colors"
            >
              <Upload size={16} />
              <span className="text-[9px] font-bold">+{remaining}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MedModal({ show, editingId, form, formas, categorias, onChange, onSave, onClose, onAIImagesReady }: Props) {
  const [step, setStep]       = useState<StepNum>(1);
  const [images, setImages]   = useState<StepImage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult]   = useState<AIMedicationAnalysisResult | null>(null);

  if (!show) return null;

  const set = (patch: Partial<Medicamento>) => onChange({ ...form, ...patch });
  const ai  = (key: keyof AIMedicationAnalysisResult['fields']) => aiResult?.fields?.[key];

  const readFile = (file: File): Promise<StepImage> => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result || '');
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return rej(new Error('Imagen inválida'));
      res({ dataUrl, mime: m[1], base64: m[2], filename: file.name });
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const handleAddImages = async (files: File[]) => {
    const available = 5 - images.length;
    if (available <= 0) return;
    setAiLoading(true);
    try {
      const toAdd  = await Promise.all(files.slice(0, available).map(readFile));
      const allImgs = [...images, ...toAdd];
      setImages(allImgs);
      onAIImagesReady?.(allImgs.map(i => ({ mime: i.mime as any, base64: i.base64, filename: i.filename, dataUrl: i.dataUrl })));

      const result = await AIService.analyzeMedicationImages({
        images: allImgs.map(i => ({ mime: i.mime as any, base64: i.base64, filename: i.filename })),
        context: form,
      });
      setAiResult(result);

      const f = result.fields;
      const patch: Partial<Medicamento> = {};
      const tryStr = (key: keyof typeof f, target: keyof Medicamento, skip?: boolean) => {
        const fld = f[key] as AIFieldSuggestion<any>;
        if (!skip && fld?.confidence >= 0.45 && fld.value != null && fld.value !== '')
          (patch as any)[target] = String(fld.value);
      };
      tryStr('nombre_generico',        'nombre_generico',         !!form.nombre_generico);
      tryStr('nombre_comercial',       'nombre_comercial',        !!form.nombre_comercial);
      tryStr('concentracion',          'concentracion',           !!form.concentracion);
      tryStr('laboratorio',            'laboratorio',             !!form.laboratorio);
      tryStr('pais_origen',            'pais_origen',             !!form.pais_origen);
      tryStr('registro_sanitario',     'registro_sanitario',      !!form.registro_sanitario);
      tryStr('codigo_ean13',           'codigo_ean13',            !!form.codigo_ean13);
      tryStr('indicaciones',           'indicaciones',            !!form.indicaciones);
      tryStr('advertencias',           'advertencias',            !!form.advertencias);
      tryStr('contraindicaciones',     'contraindicaciones',      !!form.contraindicaciones);
      tryStr('clase_controlado',       'clase_controlado',        !!form.clase_controlado);
      tryStr('via_administracion',     'via_administracion');
      tryStr('condicion_almacenamiento','condicion_almacenamiento');

      const fldForma = f.id_forma_sugerida;
      if (fldForma?.confidence >= 0.45 && fldForma.value != null) patch.id_forma = Number(fldForma.value);
      const fldCat = f.id_categoria_sugerida;
      if (fldCat?.confidence >= 0.45 && fldCat.value != null) patch.id_categoria = Number(fldCat.value);

      const fldIsv = f.tipo_isv;
      if (fldIsv?.confidence >= 0.45) patch.tipo_isv = fldIsv.value;
      if (f.requiere_receta?.confidence >= 0.45) patch.requiere_receta = Boolean(f.requiere_receta.value);
      if (f.es_controlado?.confidence  >= 0.45)  patch.es_controlado   = Boolean(f.es_controlado.value);

      if (Object.keys(patch).length > 0) set(patch);
    } catch (err: any) {
      alert(err.message || 'No se pudo analizar la imagen con IA.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleRemoveImage = (idx: number) => {
    const updated = images.filter((_, i) => i !== idx);
    setImages(updated);
    onAIImagesReady?.(updated.map(i => ({ mime: i.mime as any, base64: i.base64, filename: i.filename, dataUrl: i.dataUrl })));
  };

  const formaOptions = formas.map(f => ({ value: f.id_forma, label: f.nombre }));
  const catOptions   = categorias.map(c => ({ value: c.id_categoria, label: c.nombre }));
  const viaOptions   = VIAS.map(v => ({ value: v, label: v }));
  const almOptions   = ALMACENAMIENTO.map(a => ({ value: a, label: a }));

  const STEPS = [
    { id: 1 as StepNum, label: 'Básico',      icon: <Pill size={12} />,         required: true },
    { id: 2 as StepNum, label: 'Clínico',     icon: <FlaskConical size={12} />, required: false },
    { id: 3 as StepNum, label: 'Regulatorio', icon: <ShieldCheck size={12} />,  required: false },
  ];

  const canSave = !!form.nombre_generico?.trim();

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-30 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[93vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Pill className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                {editingId ? 'Editar medicamento' : 'Nuevo medicamento'}
              </h2>
              <p className="text-xs text-slate-400">
                {editingId ? `Código: ${editingId}` : 'Solo el Paso 1 es obligatorio'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex items-center gap-1 px-5 py-2.5 border-b border-slate-100 bg-slate-50/60">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button
                type="button"
                onClick={() => setStep(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  step === s.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-white'
                }`}
              >
                {s.icon}
                <span>{s.id}. {s.label}</span>
                {!s.required && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                    step === s.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    Opcional
                  </span>
                )}
              </button>
              {i < STEPS.length - 1 && <ChevronRight size={11} className="text-slate-200 shrink-0" />}
            </React.Fragment>
          ))}
          {aiResult && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
              <Sparkles size={10} /> IA activa
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── Step 1: Básico ─────────────────────────────────── */}
          {step === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-slate-100">
              {/* Left: images */}
              <div className="p-5 border-b lg:border-b-0 border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Imágenes del medicamento
                </p>
                <ImageDropZone
                  images={images}
                  loading={aiLoading}
                  onAdd={handleAddImages}
                  onRemove={handleRemoveImage}
                />
                {aiResult?.possibleDuplicates && aiResult.possibleDuplicates.length > 0 && (
                  <div className="mt-3 flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>
                      <strong>Posible duplicado:</strong>{' '}
                      {aiResult.possibleDuplicates.map(d =>
                        `${d.nombre_generico}${d.concentracion ? ' ' + d.concentracion : ''}`
                      ).join(', ')}. Verifique antes de guardar.
                    </span>
                  </div>
                )}
              </div>

              {/* Right: basic fields */}
              <div className="p-5 space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                  Datos básicos
                </p>
                <FieldCard
                  label="Nombre genérico" required
                  value={form.nombre_generico}
                  onChange={v => set({ nombre_generico: String(v) })}
                  suggestion={ai('nombre_generico')}
                  placeholder="Ej. Amoxicilina"
                />
                <FieldCard
                  label="Nombre comercial / Marca"
                  value={form.nombre_comercial}
                  onChange={v => set({ nombre_comercial: String(v) })}
                  suggestion={ai('nombre_comercial')}
                  placeholder="Ej. Amoxil"
                />
                <FieldCard
                  label="Concentración"
                  value={form.concentracion}
                  onChange={v => set({ concentracion: String(v) })}
                  suggestion={ai('concentracion')}
                  placeholder="Ej. 500 mg"
                />
                <FieldCard
                  label="Forma farmacéutica"
                  value={form.id_forma}
                  onChange={v => set({ id_forma: v ? Number(v) : undefined })}
                  suggestion={ai('id_forma_sugerida')}
                  type="select"
                  options={formaOptions}
                />
                <FieldCard
                  label="Categoría terapéutica"
                  value={form.id_categoria}
                  onChange={v => set({ id_categoria: v ? Number(v) : undefined })}
                  suggestion={ai('id_categoria_sugerida')}
                  type="select"
                  options={catOptions}
                />
                <FieldCard
                  label="Laboratorio"
                  value={form.laboratorio}
                  onChange={v => set({ laboratorio: String(v) })}
                  suggestion={ai('laboratorio')}
                  placeholder="Ej. Bayer, Roche"
                />
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Tipo ISV</span>
                    <ConfBadge s={ai('tipo_isv')} />
                  </div>
                  <div className="flex items-center gap-5">
                    {(['exento', '15', '18'] as const).map(v => (
                      <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                        <input
                          type="radio"
                          name="tipo_isv_wiz"
                          value={v}
                          checked={(form.tipo_isv || 'exento') === v}
                          onChange={() => set({ tipo_isv: v })}
                          className="accent-indigo-600"
                        />
                        <span className="text-slate-700 font-medium">{v === 'exento' ? 'Exento' : `${v}%`}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">% Ganancia Sugerida</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="0" step="1"
                      className="w-24 text-sm text-slate-700 font-medium bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300"
                      value={form.margen_ganancia ?? 30}
                      onChange={e => set({ margen_ganancia: Number(e.target.value) })}
                    />
                    <span className="text-sm text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">Se usa junto con el costo del último lote registrado para sugerir el precio de venta en cada presentación.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Clínico ────────────────────────────────── */}
          {step === 2 && (
            <div className="p-5 space-y-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Datos clínicos — todos opcionales
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldCard
                  label="Vía de administración"
                  value={form.via_administracion}
                  onChange={v => set({ via_administracion: String(v) })}
                  suggestion={ai('via_administracion')}
                  type="select"
                  options={viaOptions}
                />
                <FieldCard
                  label="Condición de almacenamiento"
                  value={form.condicion_almacenamiento}
                  onChange={v => set({ condicion_almacenamiento: String(v) })}
                  suggestion={ai('condicion_almacenamiento')}
                  type="select"
                  options={almOptions}
                />
              </div>
              <TextareaCard
                label="Indicaciones"
                value={form.indicaciones}
                onChange={v => set({ indicaciones: v })}
                suggestion={ai('indicaciones')}
                placeholder="Usos terapéuticos del medicamento…"
              />
              <TextareaCard
                label="Advertencias"
                value={form.advertencias}
                onChange={v => set({ advertencias: v })}
                suggestion={ai('advertencias')}
                placeholder="Precauciones de uso…"
              />
              <TextareaCard
                label="Contraindicaciones"
                value={form.contraindicaciones}
                onChange={v => set({ contraindicaciones: v })}
                suggestion={ai('contraindicaciones')}
                placeholder="Situaciones en que no debe usarse…"
              />
            </div>
          )}

          {/* ── Step 3: Regulatorio ────────────────────────────── */}
          {step === 3 && (
            <div className="p-5 space-y-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Datos regulatorios — todos opcionales
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldCard
                  label="País de origen"
                  value={form.pais_origen}
                  onChange={v => set({ pais_origen: String(v) })}
                  suggestion={ai('pais_origen')}
                  placeholder="Ej. Honduras"
                />
                <FieldCard
                  label="Registro sanitario"
                  value={form.registro_sanitario}
                  onChange={v => set({ registro_sanitario: String(v) })}
                  suggestion={ai('registro_sanitario')}
                  placeholder="Nº de registro"
                />
                <FieldCard
                  label="Código de barras EAN-13"
                  value={form.codigo_ean13}
                  onChange={v => set({ codigo_ean13: String(v) })}
                  suggestion={ai('codigo_ean13')}
                  placeholder="13 dígitos"
                />
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                <label className="flex items-center justify-between cursor-pointer gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Requiere receta médica</p>
                    <p className="text-xs text-slate-400 mt-0.5">El cliente debe presentar receta para comprarlo</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ConfBadge s={ai('requiere_receta')} />
                    <button
                      type="button"
                      onClick={() => set({ requiere_receta: !form.requiere_receta })}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                        form.requiere_receta ? 'bg-indigo-600' : 'bg-slate-200'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                        form.requiere_receta ? 'left-[22px]' : 'left-0.5'
                      }`} />
                    </button>
                  </div>
                </label>
                <div className="border-t border-slate-100" />
                <label className="flex items-center justify-between cursor-pointer gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Medicamento controlado</p>
                    <p className="text-xs text-slate-400 mt-0.5">Sujeto a fiscalización y control de autoridades</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ConfBadge s={ai('es_controlado')} />
                    <button
                      type="button"
                      onClick={() => set({ es_controlado: !form.es_controlado })}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                        form.es_controlado ? 'bg-indigo-600' : 'bg-slate-200'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                        form.es_controlado ? 'left-[22px]' : 'left-0.5'
                      }`} />
                    </button>
                  </div>
                </label>
                {form.es_controlado && (
                  <FieldCard
                    label="Clase de controlado"
                    value={form.clase_controlado}
                    onChange={v => set({ clase_controlado: String(v) })}
                    suggestion={ai('clase_controlado')}
                    placeholder="Ej. Lista I, Lista II, Lista III…"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
          <button onClick={onClose} className={btnSecondary}>Cancelar</button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(s => (s - 1) as StepNum)}
                className={btnSecondary}
              >
                <ChevronLeft size={14} /> Anterior
              </button>
            )}
            {step < 3 && (
              <button
                type="button"
                onClick={() => setStep(s => (s + 1) as StepNum)}
                className={btnSecondary}
              >
                Siguiente <ChevronRight size={14} />
              </button>
            )}
            <button
              onClick={onSave}
              disabled={!canSave}
              className={`${btnPrimary} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {editingId ? 'Guardar cambios' : 'Crear medicamento'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
