
import React, { useState, useEffect, memo } from 'react';
import {
  Trash2, AlignLeft, AlignCenter, AlignRight, FileCog, Database, Check, ArrowDownToLine, Grid, Magnet, Lock, Unlock
} from 'lucide-react';
import { LabelTemplate, LabelElement, InvoiceColumn, SummaryRow } from '../../types';

const FONTS = [
    { name: 'Predeterminada', value: 'helvetica' },
    { name: 'Roboto', value: "'Roboto', sans-serif" },
    { name: 'Open Sans', value: "'Open Sans', sans-serif" },
    { name: 'Montserrat', value: "'Montserrat', sans-serif" },
    { name: 'Poppins', value: "'Poppins', sans-serif" },
    { name: 'Playfair Display', value: "'Playfair Display', serif" },
    { name: 'Raleway', value: "'Raleway', sans-serif" },
    { name: 'Oswald', value: "'Oswald', sans-serif" },
    { name: 'Courier (Code)', value: "'Courier Prime', monospace" },
];

const defaultCols: InvoiceColumn[] = [
  { id: 'c1', header: 'Descripción', field: '{{item.descripcion}}', widthPct: 45, align: 'left', format: 'TEXT' },
  { id: 'c2', header: 'Cant.', field: '{{item.cantidad}}', widthPct: 10, align: 'center', format: 'NUMBER' },
  { id: 'c3', header: 'P. Unit.', field: '{{item.precioVenta}}', widthPct: 15, align: 'right', format: 'CURRENCY' },
  { id: 'c4', header: 'ISV', field: '{{item.isv}}', widthPct: 10, align: 'right', format: 'CURRENCY' },
  { id: 'c5', header: 'Total', field: '{{item.total}}', widthPct: 20, align: 'right', format: 'CURRENCY' },
];

const PropertyInput = memo(({ label, value, onChange, type = "text", step, min, className, disabled, placeholder }: any) => {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => { setLocalValue(value); }, [value]);

    const handleBlur = () => {
        let finalVal = localValue;
        if (type === 'number') {
            finalVal = parseFloat(localValue);
            if (isNaN(finalVal)) finalVal = 0;
        }
        if (finalVal !== value) onChange(finalVal);
    };

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</label>}
            <div className={`flex items-center gap-1 bg-white border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all overflow-hidden h-9 ${disabled ? 'bg-slate-100' : ''}`}>
                <input
                    type={type} step={step} min={min} disabled={disabled} placeholder={placeholder}
                    className="w-full px-2 text-sm font-medium outline-none bg-transparent h-full text-slate-700"
                    value={localValue}
                    onChange={e => setLocalValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                />
            </div>
        </div>
    );
});

interface DesignerPropertiesProps {
    selectedId: string | null;
    selectedIds?: string[];
    template: LabelTemplate;
    setTemplate: (t: LabelTemplate | Partial<LabelTemplate>) => void;
    updateElement: (id: string, updates: Partial<LabelElement>) => void;
    updateMultipleElements?: (ids: string[], updates: Partial<LabelElement>) => void;
    deleteSelected: () => void;
    setShowVarModal: (show: boolean) => void;
}

const DesignerProperties: React.FC<DesignerPropertiesProps> = ({
    selectedId, selectedIds = [], template, setTemplate, updateElement, updateMultipleElements, deleteSelected, setShowVarModal
}) => {
    const sel = template.elements.find((e: any) => e.id === selectedId);
    const unit = template.type === 'DOCUMENT' ? 'cm' : 'mm';
    const multiSel = selectedIds.length > 1
        ? template.elements.filter(e => selectedIds.includes(e.id))
        : [];

    // Batch update all selected elements
    const updateAll = (updates: Partial<LabelElement>) => {
        if (updateMultipleElements && selectedIds.length > 1) {
            updateMultipleElements(selectedIds, updates);
        } else if (sel) {
            updateElement(sel.id, updates);
        }
    };

    const setTpl = (updates: Partial<LabelTemplate>) => {
        setTemplate({ ...template, ...updates } as LabelTemplate);
    };

    if (!sel) {
        // Page Settings
        return (
            <div className="p-6 space-y-6 overflow-y-auto h-full">
                <div className="flex items-center gap-2 text-slate-800 border-b pb-2">
                    <FileCog size={18} className="text-indigo-600"/>
                    <h3 className="font-bold text-sm uppercase">Configuración {template.type === 'DOCUMENT' ? 'Documento' : 'Etiqueta'}</h3>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <PropertyInput label={`Ancho (${unit})`} value={template.width} onChange={(v:any) => setTpl({width:v})} type="number" step={0.1} />
                        <PropertyInput label={`Alto (${unit})`} value={template.height} onChange={(v:any) => setTpl({height:v})} type="number" step={0.1} />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Contexto de Datos</label>
                        <select className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" value={template.dataSource} onChange={e => setTpl({dataSource:e.target.value as any})}>
                            <option value="NONE">Sin Conexión</option>
                            <option disabled>--- ETIQUETAS ---</option>
                            <option value="TELEPHONES">Inventario Teléfonos (IMEI)</option>
                            <option value="INVENTORY_ACCESSORIES">Inventario Accesorios</option>
                            <option disabled>--- DOCUMENTOS ---</option>
                            <option value="SALES">Ventas / Facturación</option>
                            <option value="CLIENTS">Reporte Clientes</option>
                            <option value="FULL_DB">Base de Datos Completa</option>
                        </select>
                    </div>

                    {template.dataSource && template.dataSource !== 'NONE' && (
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Categoría Uso</label>
                            <select className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" value={template.category} onChange={e => setTpl({category:e.target.value as any})}>
                                {template.type === 'LABEL' ? (
                                    <>
                                        <option value="GENERAL">General</option>
                                        <option value="TELEPHONE">Teléfonos</option>
                                        <option value="ACCESSORY">Accesorios</option>
                                    </>
                                ) : (
                                    <>
                                        <option value="INVOICE">Factura</option>
                                        <option value="REPORT">Reporte</option>
                                    </>
                                )}
                            </select>
                        </div>
                    )}

                    {/* Margins */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase">Márgenes ({unit})</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <PropertyInput label="Superior" value={template.margins?.top ?? 0} onChange={(v: any) => setTpl({ margins: { ...(template.margins || {top:0,bottom:0,left:0,right:0}), top: v }})} type="number" step={0.1}/>
                            <PropertyInput label="Inferior" value={template.margins?.bottom ?? 0} onChange={(v: any) => setTpl({ margins: { ...(template.margins || {top:0,bottom:0,left:0,right:0}), bottom: v }})} type="number" step={0.1}/>
                            <PropertyInput label="Izquierdo" value={template.margins?.left ?? 0} onChange={(v: any) => setTpl({ margins: { ...(template.margins || {top:0,bottom:0,left:0,right:0}), left: v }})} type="number" step={0.1}/>
                            <PropertyInput label="Derecho" value={template.margins?.right ?? 0} onChange={(v: any) => setTpl({ margins: { ...(template.margins || {top:0,bottom:0,left:0,right:0}), right: v }})} type="number" step={0.1}/>
                        </div>
                    </div>

                    {/* Grid / Snap controls */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase">Cuadrícula y Ajuste</h4>

                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-2">
                                <Grid size={16} className="text-slate-500"/>
                                <span className="text-sm font-medium text-slate-600">Mostrar Cuadrícula</span>
                            </div>
                            <button onClick={() => setTpl({showGrid: !template.showGrid})} className={`w-10 h-5 rounded-full transition-colors relative ${template.showGrid ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${template.showGrid ? 'translate-x-5' : 'translate-x-0.5'}`}/>
                            </button>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-2">
                                <Magnet size={16} className="text-slate-500"/>
                                <span className="text-sm font-medium text-slate-600">Ajuste a Cuadrícula</span>
                            </div>
                            <button onClick={() => setTpl({snapEnabled: !template.snapEnabled})} className={`w-10 h-5 rounded-full transition-colors relative ${template.snapEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${template.snapEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}/>
                            </button>
                        </div>

                        <PropertyInput
                            label={`Tamaño Cuadrícula (${unit})`}
                            value={template.gridSize || (template.type === 'DOCUMENT' ? 1 : 5)}
                            onChange={(v:any) => setTpl({gridSize: v})}
                            type="number" step={0.5}
                        />

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Color de Fondo</label>
                            <div className="flex gap-2 items-center">
                                <input type="color" value={template.backgroundColor || '#ffffff'} onChange={e => setTpl({backgroundColor: e.target.value})} className="h-8 w-12 rounded border cursor-pointer"/>
                                <button onClick={() => setTpl({backgroundColor: '#ffffff'})} className="text-xs px-2 py-1 bg-slate-100 rounded border">Blanco</button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer" onClick={() => setTpl({isDefault: !template.isDefault})}>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${template.isDefault ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                            {template.isDefault && <Check size={14} className="text-white"/>}
                        </div>
                        <span className="text-sm font-medium text-slate-600">Usar como Predeterminado</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Multi-select panel ───────────────────────────────────────────────────
    if (multiSel.length > 1) {
        const types = [...new Set(multiSel.map(e => e.type))];
        const allText  = types.every(t => t === 'TEXT');
        const allShape = types.every(t => t === 'SHAPE');
        const hasSizes = types.some(t => ['TEXT','SHAPE','IMAGE','BARCODE','QR'].includes(t));

        // Derive common values (show mixed if different)
        const firstEl = multiSel[0];

        return (
            <div className="p-4 space-y-4 overflow-y-auto h-full">
                <div className="flex justify-between items-center border-b pb-2">
                    <div>
                        <div className="text-xs font-bold text-slate-700">{multiSel.length} elementos seleccionados</div>
                        <div className="text-[10px] text-slate-400">{types.join(', ')}</div>
                    </div>
                    <button
                        onClick={() => { if (updateMultipleElements) { const newEls = template.elements.filter(e => !selectedIds.includes(e.id)); setTemplate({ ...template, elements: newEls }); } }}
                        className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar seleccionados"
                    ><Trash2 size={16}/></button>
                </div>

                {/* Geometry — apply to all */}
                {hasSizes && (
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase">Tamaño (aplica a todos)</h4>
                        <div className="grid grid-cols-2 gap-2">
                            <PropertyInput label={`Ancho (${unit})`} value="" placeholder="Mixto" type="number" step={0.1}
                                onChange={(v: any) => updateAll({ width: v })}/>
                            <PropertyInput label={`Alto (${unit})`} value="" placeholder="Mixto" type="number" step={0.1}
                                onChange={(v: any) => updateAll({ height: v })}/>
                        </div>
                    </div>
                )}

                {/* Opacity */}
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Opacidad (todos)</label>
                    <input type="range" min={0} max={1} step={0.05} defaultValue={1}
                        onChange={e => updateAll({ opacity: parseFloat(e.target.value) })}
                        className="w-full accent-indigo-600"
                    />
                </div>

                {/* Text properties */}
                {allText && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase">Tipografía (todos los textos)</h4>
                        <select className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                            defaultValue={firstEl.fontFamily}
                            onChange={e => updateAll({ fontFamily: e.target.value })}>
                            {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                        </select>
                        <div className="flex gap-2">
                            <PropertyInput value="" placeholder="pt" type="number" className="flex-1"
                                onChange={(v: any) => updateAll({ fontSize: v })}/>
                            <button onClick={() => updateAll({ fontWeight: 'bold' })} className="px-3 border rounded-lg font-bold bg-white text-slate-600 border-slate-200 hover:bg-slate-100">B</button>
                            <button onClick={() => updateAll({ fontWeight: 'normal' })} className="px-3 border rounded-lg bg-white text-slate-600 border-slate-200 hover:bg-slate-100">N</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Texto</label>
                                <input type="color" defaultValue={firstEl.color || '#000000'}
                                    onChange={e => updateAll({ color: e.target.value })}
                                    className="h-9 w-full rounded-lg border border-slate-200 cursor-pointer"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fondo</label>
                                <div className="flex gap-1">
                                    <input type="color" defaultValue={firstEl.backgroundColor || '#ffffff'}
                                        onChange={e => updateAll({ backgroundColor: e.target.value })}
                                        className="h-9 flex-1 rounded-lg border border-slate-200 cursor-pointer"/>
                                    <button onClick={() => updateAll({ backgroundColor: 'transparent' })}
                                        className="text-[10px] px-1.5 bg-slate-100 rounded border border-slate-200">None</button>
                                </div>
                            </div>
                        </div>
                        {/* Align */}
                        <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                            {(['left','center','right'] as const).map(a => (
                                <button key={a} onClick={() => updateAll({ textAlign: a })}
                                    className="flex-1 py-1 rounded flex justify-center text-slate-400 hover:text-indigo-600">
                                    {a === 'left' ? <AlignLeft size={16}/> : a === 'center' ? <AlignCenter size={16}/> : <AlignRight size={16}/>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Shape properties */}
                {allShape && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase">Color de Relleno (todas las formas)</h4>
                        <div className="flex gap-2 items-center">
                            <input type="color" defaultValue={firstEl.fill || '#ffffff'}
                                onChange={e => updateAll({ fill: e.target.value })}
                                className="h-9 w-14 rounded-lg border border-slate-200 cursor-pointer"/>
                            <button onClick={() => updateAll({ fill: 'transparent' })}
                                className="text-xs px-2 py-1.5 bg-slate-100 rounded border border-slate-200">Sin relleno</button>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Borde</label>
                            <input type="color" defaultValue={firstEl.stroke || '#000000'}
                                onChange={e => updateAll({ stroke: e.target.value })}
                                className="h-9 w-full rounded-lg border border-slate-200 cursor-pointer"/>
                        </div>
                    </div>
                )}

                <p className="text-[10px] text-slate-400 text-center pt-2 border-t border-slate-100">
                    Shift+click para agregar/quitar de la selección.<br/>
                    Arrastra sobre el fondo para seleccionar por área.
                </p>
            </div>
        );
    }

    // ── Element Properties ───────────────────────────────────────────────────
    return (
        <div className="p-6 space-y-5 overflow-y-auto h-full">
            <div className="flex justify-between items-center border-b pb-2">
                <div className="flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-bold uppercase">{sel.type}</span>
                    {sel.locked && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1"><Lock size={10}/>Bloqueado</span>}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => updateElement(sel.id, {locked: !sel.locked})}
                        title={sel.locked ? 'Desbloquear' : 'Bloquear'}
                        className={`p-1.5 rounded transition-colors ${sel.locked ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    >
                        {sel.locked ? <Lock size={16}/> : <Unlock size={16}/>}
                    </button>
                    <button onClick={deleteSelected} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"><Trash2 size={18}/></button>
                </div>
            </div>

            {/* Element label */}
            <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Nombre del Elemento</label>
                <input
                    className="mt-1 w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 transition-colors"
                    value={sel.elementLabel || ''}
                    onChange={e => updateElement(sel.id, { elementLabel: e.target.value })}
                    placeholder={sel.type}
                />
            </div>

            {/* Common Geometry */}
            <div className="grid grid-cols-2 gap-3">
                <PropertyInput label={`X (${unit})`} value={sel.x} onChange={(v:any) => updateElement(sel.id, {x:v})} type="number" step={0.1}/>
                <PropertyInput label={`Y (${unit})`} value={sel.y} onChange={(v:any) => updateElement(sel.id, {y:v})} type="number" step={0.1}/>
                <PropertyInput label="Ancho" value={sel.width} onChange={(v:any) => updateElement(sel.id, {width:v})} type="number" step={0.1}/>
                <PropertyInput label="Alto" value={sel.height} onChange={(v:any) => updateElement(sel.id, {height:v})} type="number" step={0.1}/>
                <PropertyInput label="Rotación (°)" value={Math.round(sel.rotation ?? 0)} onChange={(v:any) => updateElement(sel.id, {rotation: v})} type="number" step={1}/>
            </div>

            {/* Opacity for all elements */}
            <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Opacidad: {Math.round((sel.opacity ?? 1) * 100)}%</label>
                <input type="range" min={0} max={1} step={0.05} value={sel.opacity ?? 1}
                    onChange={e => updateElement(sel.id, { opacity: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-600"
                />
            </div>

            {/* Visibility Condition */}
            <div className="space-y-1 pt-2 border-t border-slate-100">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Condición de Visibilidad</label>
                <input
                    className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-orange-400 font-mono transition-colors"
                    value={sel.visibilityCondition || ''}
                    onChange={e => updateElement(sel.id, { visibilityCondition: e.target.value || undefined })}
                    placeholder='ej. {{venta.tipoCompra}} == "Credito"'
                />
                <p className="text-[10px] text-slate-400">Ocultar elemento si la condición no se cumple al imprimir.</p>
            </div>

            {/* IMAGE Specific */}
            {sel.type === 'IMAGE' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Ajuste de Imagen</h4>
                    <div className="grid grid-cols-2 gap-1">
                        {([
                            { value: 'contain', label: 'Contener' },
                            { value: 'cover',   label: 'Cubrir' },
                            { value: 'fill',    label: 'Estirar' },
                            { value: 'none',    label: 'Original' },
                        ] as const).map(opt => (
                            <button key={opt.value}
                                onClick={() => updateElement(sel.id, { imageObjectFit: opt.value })}
                                className={`py-2 text-xs rounded-lg border font-bold transition-all ${(sel.imageObjectFit || 'contain') === opt.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Content Logic (Text/Barcode) */}
            {(sel.type === 'TEXT' || sel.type === 'BARCODE' || sel.type === 'QR') && (
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Contenido / Datos</label>
                        <button onClick={() => setShowVarModal(true)} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded hover:bg-indigo-100 flex items-center gap-1">
                            <Database size={10}/> + Variable
                        </button>
                    </div>
                    <textarea
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors font-mono"
                        rows={3}
                        value={sel.content}
                        onChange={e => updateElement(sel.id, {content: e.target.value})}
                        placeholder="Texto estático o {{VARIABLE}}"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Usa {"{{VARIABLE}}"} para datos dinámicos.</p>
                </div>
            )}

            {/* BARCODE Specific */}
            {sel.type === 'BARCODE' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Código de Barras</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Líneas</label>
                            <input type="color" value={sel.barcodeFgColor || '#000000'} onChange={e => updateElement(sel.id, {barcodeFgColor: e.target.value})} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fondo</label>
                            <input type="color" value={sel.barcodeBgColor || '#ffffff'} onChange={e => updateElement(sel.id, {barcodeBgColor: e.target.value})} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Formato</label>
                        <select className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" value={sel.barcodeFormat || 'CODE128'} onChange={e => updateElement(sel.id, {barcodeFormat: e.target.value})}>
                            {['CODE128','CODE39','EAN13','EAN8','UPC','ITF14','MSI','pharmacode'].map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="dispval" checked={sel.displayValue ?? true} onChange={e => updateElement(sel.id, {displayValue: e.target.checked})} className="rounded text-indigo-600"/>
                        <label htmlFor="dispval" className="text-xs font-medium text-slate-600">Mostrar número</label>
                    </div>
                </div>
            )}

            {/* QR Specific */}
            {sel.type === 'QR' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Código QR</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color</label>
                            <input type="color" value={sel.qrFgColor || '#000000'} onChange={e => updateElement(sel.id, {qrFgColor: e.target.value})} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fondo</label>
                            <input type="color" value={sel.qrBgColor || '#ffffff'} onChange={e => updateElement(sel.id, {qrBgColor: e.target.value})} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                    </div>
                </div>
            )}

            {/* Text Specific */}
            {sel.type === 'TEXT' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Tipografía</h4>
                    <select className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" value={sel.fontFamily} onChange={e => updateElement(sel.id, {fontFamily:e.target.value})}>
                        {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                        <PropertyInput value={sel.fontSize} onChange={(v:any) => updateElement(sel.id, {fontSize:v})} type="number" className="flex-1"/>
                        <button
                            onClick={() => updateElement(sel.id, {fontWeight: sel.fontWeight === 'bold' ? 'normal' : 'bold'})}
                            className={`px-3 border rounded-lg font-bold ${sel.fontWeight === 'bold' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
                        >B</button>
                        <button
                            onClick={() => updateElement(sel.id, {italic: !sel.italic})}
                            className={`px-3 border rounded-lg italic ${sel.italic ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
                        >I</button>
                        <button
                            onClick={() => updateElement(sel.id, {underline: !sel.underline})}
                            className={`px-3 border rounded-lg underline ${sel.underline ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}
                        >U</button>
                    </div>
                    <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                        {(['left','center','right'] as const).map((a) => (
                            <button key={a} onClick={() => updateElement(sel.id, {textAlign:a})} className={`flex-1 py-1 rounded flex justify-center ${sel.textAlign===a ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>
                                {a==='left'?<AlignLeft size={16}/>:a==='center'?<AlignCenter size={16}/>:<AlignRight size={16}/>}
                            </button>
                        ))}
                    </div>

                    {/* Text color */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Texto</label>
                            <input type="color" value={sel.color || '#000000'} onChange={e => updateElement(sel.id, {color: e.target.value})} className="h-9 w-full rounded-lg border border-slate-200 cursor-pointer"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fondo</label>
                            <div className="flex gap-1">
                                <input type="color" value={sel.backgroundColor || '#ffffff'} onChange={e => updateElement(sel.id, {backgroundColor: e.target.value})} className="h-9 w-full rounded-lg border border-slate-200 cursor-pointer"/>
                                <button onClick={() => updateElement(sel.id, {backgroundColor: 'transparent'})} className="text-[10px] px-1.5 bg-slate-100 rounded border border-slate-200 whitespace-nowrap">None</button>
                            </div>
                        </div>
                    </div>

                    <PropertyInput label="Interlineado" value={sel.lineHeight || 1.2} onChange={(v:any) => updateElement(sel.id, {lineHeight:v})} type="number" step={0.1}/>
                    <PropertyInput label="Espaciado Letras (px)" value={sel.letterSpacing || 0} onChange={(v:any) => updateElement(sel.id, {letterSpacing:v})} type="number" step={0.5}/>

                    <div className="flex flex-col gap-2 mt-2">
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked={sel.isMultiline} onChange={e => updateElement(sel.id, {isMultiline: e.target.checked})} className="rounded text-indigo-600"/>
                            <label className="text-xs font-medium text-slate-600">Multilínea (Ajuste)</label>
                        </div>
                        {sel.isMultiline && (
                            <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-lg border border-indigo-100 cursor-pointer" onClick={() => updateElement(sel.id, {isStretchWithOverflow: !sel.isStretchWithOverflow})}>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${sel.isStretchWithOverflow ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                    {sel.isStretchWithOverflow && <Check size={12} className="text-white"/>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <ArrowDownToLine size={14} className="text-indigo-600"/>
                                    <span className="text-xs font-medium text-slate-600">Estirar con Desbordamiento</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Shadow — applies to TEXT and SHAPE */}
            {(sel.type === 'TEXT' || sel.type === 'SHAPE') && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={sel.shadowEnabled || false}
                            onChange={e => updateElement(sel.id, {shadowEnabled: e.target.checked})}
                            className="rounded text-indigo-600"/>
                        <label className="text-xs font-medium text-slate-600">Sombra</label>
                    </div>
                    {sel.shadowEnabled && (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color</label>
                                    <input type="color" value={sel.shadowColor || '#000000'}
                                        onChange={e => updateElement(sel.id, {shadowColor: e.target.value})}
                                        className="h-8 w-full rounded cursor-pointer border-0"/>
                                </div>
                                <PropertyInput label="Desenfoque (px)" value={sel.shadowBlur ?? 4} onChange={(v:any) => updateElement(sel.id, {shadowBlur:v})} type="number" step={1}/>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <PropertyInput label="Offset X (px)" value={sel.shadowOffsetX ?? 2} onChange={(v:any) => updateElement(sel.id, {shadowOffsetX:v})} type="number" step={1}/>
                                <PropertyInput label="Offset Y (px)" value={sel.shadowOffsetY ?? 2} onChange={(v:any) => updateElement(sel.id, {shadowOffsetY:v})} type="number" step={1}/>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Shape Specific */}
            {sel.type === 'SHAPE' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Estilo</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Relleno</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={sel.fill === 'transparent' ? '#ffffff' : (sel.fill || '#ffffff')} onChange={e => updateElement(sel.id, {fill: e.target.value})} className="h-8 w-8 rounded cursor-pointer border-0"/>
                                <button onClick={() => updateElement(sel.id, {fill:'transparent'})} className="text-[10px] px-2 py-1 bg-slate-100 rounded border">None</button>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Borde</label>
                            <input type="color" value={sel.stroke || '#000000'} onChange={e => updateElement(sel.id, {stroke: e.target.value})} className="h-8 w-full rounded cursor-pointer border-0"/>
                        </div>
                    </div>
                    <PropertyInput label="Grosor Borde" value={sel.strokeWidth || 0.5} onChange={(v:any) => updateElement(sel.id, {strokeWidth:v})} type="number" step={0.5}/>
                    <PropertyInput label="Radio Esquinas (px)" value={sel.borderRadius || 0} onChange={(v:any) => updateElement(sel.id, {borderRadius:v})} type="number"/>

                    {/* Gradient */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                            <input type="checkbox" checked={sel.gradientEnabled || false}
                                onChange={e => updateElement(sel.id, {gradientEnabled: e.target.checked})}
                                className="rounded text-indigo-600"/>
                            <label className="text-xs font-medium text-slate-600">Usar degradado</label>
                        </div>
                        {sel.gradientEnabled && (
                            <>
                                <div className="flex gap-1">
                                    {(['linear','radial'] as const).map(t => (
                                        <button key={t} onClick={() => updateElement(sel.id, {gradientType: t})}
                                            className={`flex-1 py-1 text-[11px] rounded-lg border font-bold transition-all ${(sel.gradientType||'linear')===t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                                            {t==='linear' ? 'Lineal' : 'Radial'}
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color 1</label>
                                        <input type="color" value={sel.gradientColor1||'#4f46e5'}
                                            onChange={e => updateElement(sel.id, {gradientColor1: e.target.value})}
                                            className="h-8 w-full rounded cursor-pointer border-0"/>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color 2</label>
                                        <input type="color" value={sel.gradientColor2||'#818cf8'}
                                            onChange={e => updateElement(sel.id, {gradientColor2: e.target.value})}
                                            className="h-8 w-full rounded cursor-pointer border-0"/>
                                    </div>
                                </div>
                                {(sel.gradientType||'linear')==='linear' && (
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Ángulo ({sel.gradientAngle??135}°)</label>
                                        <input type="range" min={0} max={360} value={sel.gradientAngle??135}
                                            onChange={e => updateElement(sel.id, {gradientAngle: parseInt(e.target.value)})}
                                            className="w-full accent-indigo-600"/>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* COMPANY_HEADER Specific */}
            {sel.type === 'COMPANY_HEADER' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Encabezado Empresa</h4>

                    {/* Style selector */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Estilo</label>
                        <div className="flex gap-2">
                            {(['PLAIN', 'GEOMETRIC'] as const).map(s => (
                                <button key={s} onClick={() => updateElement(sel.id, { companyStyle: s })}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                                        (sel.companyStyle || 'PLAIN') === s
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                                    }`}>
                                    {s === 'PLAIN' ? 'Simple' : '🎨 Geométrico'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Document title (geometric only) */}
                    {sel.companyStyle === 'GEOMETRIC' && (
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Título del Documento</label>
                            <input
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                                value={sel.companyDocTitle || ''}
                                onChange={e => updateElement(sel.id, { companyDocTitle: e.target.value })}
                                placeholder="ej. FACTURA"
                            />
                        </div>
                    )}

                    {/* Plain style controls */}
                    {sel.companyStyle !== 'GEOMETRIC' && (
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Alineación</label>
                            <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                                {(['left','center','right'] as const).map(a => (
                                    <button key={a} onClick={() => updateElement(sel.id, {companyAlign: a})}
                                        className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${sel.companyAlign===a ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>
                                        {a==='left'?'Izq':a==='center'?'Centro':'Der'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <PropertyInput label="Tamaño Fuente (pt)" value={sel.fontSize || 9} onChange={(v:any) => updateElement(sel.id, {fontSize:v})} type="number" step={0.5}/>

                    {sel.companyStyle !== 'GEOMETRIC' && (
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Texto</label>
                            <input type="color" value={sel.color || '#000000'} onChange={e => updateElement(sel.id, {color: e.target.value})} className="h-9 w-full rounded-lg border border-slate-200 cursor-pointer"/>
                        </div>
                    )}

                    <div className="space-y-2">
                        {[
                            { key: 'companyShowRTN', label: 'Mostrar RTN' },
                            { key: 'companyShowPhone', label: 'Mostrar Teléfono' },
                            { key: 'companyShowEmail', label: 'Mostrar Correo' },
                        ].map(item => (
                            <div key={item.key} className="flex items-center gap-2">
                                <input type="checkbox" checked={(sel as any)[item.key] ?? true}
                                    onChange={e => updateElement(sel.id, {[item.key]: e.target.checked})}
                                    className="rounded text-indigo-600"/>
                                <label className="text-xs font-medium text-slate-600">{item.label}</label>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* SUMMARY_BOX Specific */}
            {sel.type === 'SUMMARY_BOX' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Caja de Totales</h4>
                    <PropertyInput label="Tamaño Fuente (pt)" value={sel.summaryFontSize || 9} onChange={(v:any) => updateElement(sel.id, {summaryFontSize:v})} type="number" step={0.5}/>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Etiqueta</label>
                            <input type="color" value={sel.summaryLabelColor || '#000000'} onChange={e => updateElement(sel.id, {summaryLabelColor: e.target.value})} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Valor</label>
                            <input type="color" value={sel.summaryValueColor || '#000000'} onChange={e => updateElement(sel.id, {summaryValueColor: e.target.value})} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fondo</label>
                        <div className="flex gap-2">
                            <input type="color" value={sel.summaryBg === 'transparent' ? '#ffffff' : (sel.summaryBg || '#ffffff')} onChange={e => updateElement(sel.id, {summaryBg: e.target.value})} className="h-8 w-12 rounded cursor-pointer border border-slate-200"/>
                            <button onClick={() => updateElement(sel.id, {summaryBg:'transparent'})} className="text-xs px-2 py-1 bg-slate-100 rounded border">Ninguno</button>
                        </div>
                    </div>
                    {/* Row editor */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h5 className="font-bold text-xs text-slate-700">Filas</h5>
                            <button onClick={() => {
                                const rows = sel.summaryRows || [];
                                const newRow: SummaryRow = { id: `sr${Date.now()}`, label: 'Fila:', field: '', format: 'CURRENCY', bold: false };
                                updateElement(sel.id, { summaryRows: [...rows, newRow] });
                            }} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100">+ Fila</button>
                        </div>
                        {(sel.summaryRows || []).map((row: SummaryRow, ri: number) => (
                            <div key={row.id} className="bg-slate-50 rounded-lg p-2 mb-2 space-y-1 border border-slate-100">
                                <div className="flex gap-1">
                                    <input value={row.label} onChange={e => {
                                        const rows = [...(sel.summaryRows || [])];
                                        rows[ri] = {...rows[ri], label: e.target.value};
                                        updateElement(sel.id, {summaryRows: rows});
                                    }} className="text-xs bg-white border rounded px-2 py-1 flex-1" placeholder="Etiqueta"/>
                                    <button onClick={() => {
                                        const rows = (sel.summaryRows || []).filter((_:any, i:number) => i !== ri);
                                        updateElement(sel.id, {summaryRows: rows});
                                    }} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={12}/></button>
                                </div>
                                <input value={row.field} onChange={e => {
                                    const rows = [...(sel.summaryRows || [])];
                                    rows[ri] = {...rows[ri], field: e.target.value};
                                    updateElement(sel.id, {summaryRows: rows});
                                }} className="text-xs bg-white border rounded px-2 py-1 w-full font-mono" placeholder="{{venta.total}}"/>
                                <div className="flex gap-2 items-center">
                                    <select value={row.format} onChange={e => {
                                        const rows = [...(sel.summaryRows || [])];
                                        rows[ri] = {...rows[ri], format: e.target.value as any};
                                        updateElement(sel.id, {summaryRows: rows});
                                    }} className="text-xs bg-white border rounded px-1 py-1 flex-1">
                                        <option value="TEXT">Texto</option>
                                        <option value="CURRENCY">Moneda</option>
                                        <option value="NUMBER">Número</option>
                                    </select>
                                    <label className="flex items-center gap-1 text-xs text-slate-600">
                                        <input type="checkbox" checked={row.bold || false} onChange={e => {
                                            const rows = [...(sel.summaryRows || [])];
                                            rows[ri] = {...rows[ri], bold: e.target.checked};
                                            updateElement(sel.id, {summaryRows: rows});
                                        }} className="rounded text-indigo-600"/> Negrita
                                    </label>
                                    <label className="flex items-center gap-1 text-xs text-slate-600">
                                        <input type="checkbox" checked={row.separator || false} onChange={e => {
                                            const rows = [...(sel.summaryRows || [])];
                                            rows[ri] = {...rows[ri], separator: e.target.checked};
                                            updateElement(sel.id, {summaryRows: rows});
                                        }} className="rounded text-indigo-600"/> Línea
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 py-1.5 px-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <input type="checkbox" id="canGrowSummary" checked={sel.canGrow ?? false} onChange={e => updateElement(sel.id, {canGrow: e.target.checked})} className="rounded accent-blue-600"/>
                        <div>
                            <label htmlFor="canGrowSummary" className="text-xs font-bold text-blue-700 block cursor-pointer">Puede Crecer (Can Grow)</label>
                            <span className="text-[10px] text-blue-500">Expande y desplaza elementos debajo al imprimir</span>
                        </div>
                    </div>
                </div>
            )}

            {/* INVOICE_TABLE Specific */}
            {sel.type === 'INVOICE_TABLE' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Configuración de Tabla</h4>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fondo Encabezado</label>
                            <input type="color" value={sel.tableHeaderBg || '#1e293b'} onChange={e => updateElement(sel.id, {tableHeaderBg: e.target.value})} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Texto Enc.</label>
                            <input type="color" value={sel.tableHeaderColor || '#ffffff'} onChange={e => updateElement(sel.id, {tableHeaderColor: e.target.value})} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                    </div>

                    <PropertyInput label="Alto de Fila" value={sel.tableRowHeight || 8} onChange={(v:any) => updateElement(sel.id, {tableRowHeight:v})} type="number"/>
                    <PropertyInput label="Tamaño Fuente Tabla" value={sel.tableFontSize || 9} onChange={(v:any) => updateElement(sel.id, {tableFontSize:v})} type="number"/>

                    <div className="flex items-center gap-2 py-1">
                        <input type="checkbox" id="altrows" checked={sel.tableAlternateRows ?? true} onChange={e => updateElement(sel.id, {tableAlternateRows: e.target.checked})} className="rounded text-indigo-600"/>
                        <label htmlFor="altrows" className="text-xs font-medium text-slate-600">Filas alternadas</label>
                    </div>

                    <div className="flex items-center gap-2 py-1.5 px-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <input type="checkbox" id="canGrow" checked={sel.canGrow ?? false} onChange={e => updateElement(sel.id, {canGrow: e.target.checked})} className="rounded accent-blue-600"/>
                        <div>
                            <label htmlFor="canGrow" className="text-xs font-bold text-blue-700 block cursor-pointer">Puede Crecer (Can Grow)</label>
                            <span className="text-[10px] text-blue-500">Expande y desplaza elementos debajo al imprimir</span>
                        </div>
                    </div>
                    {(sel.tableAlternateRows ?? true) && (
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Color Fila Alterna</label>
                            <input type="color" value={sel.tableAlternateBg || '#f8fafc'} onChange={e => updateElement(sel.id, {tableAlternateBg: e.target.value})} className="h-8 w-full rounded cursor-pointer border border-slate-200"/>
                        </div>
                    )}

                    {/* Column editor */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h5 className="font-bold text-xs text-slate-700">Columnas</h5>
                            <div className="flex items-center gap-1">
                                {(() => {
                                    const total = (sel.tableColumns || defaultCols).reduce((s: number, c: InvoiceColumn) => s + c.widthPct, 0);
                                    return (
                                        <button title="Normalizar anchos al 100%" onClick={() => {
                                            const cols = sel.tableColumns || defaultCols;
                                            const even = Math.floor(100 / cols.length);
                                            const rem = 100 - even * (cols.length - 1);
                                            updateElement(sel.id, { tableColumns: cols.map((c: InvoiceColumn, i: number) => ({ ...c, widthPct: i === cols.length - 1 ? rem : even })) });
                                        }} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${Math.abs(total - 100) > 1 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                                            {total}%
                                        </button>
                                    );
                                })()}
                                <button onClick={() => {
                                    const cols = sel.tableColumns || defaultCols;
                                    const newCol: InvoiceColumn = { id: `c${Date.now()}`, header: 'Columna', field: '', widthPct: 10, align: 'left', format: 'TEXT' };
                                    updateElement(sel.id, { tableColumns: [...cols, newCol] });
                                }} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100">+ Col</button>
                            </div>
                        </div>

                        {(sel.tableColumns || defaultCols).map((col, ci) => (
                            <div key={col.id} className="bg-slate-50 rounded-lg p-2 mb-2 space-y-1 border border-slate-100">
                                <div className="flex gap-1">
                                    <input value={col.header} onChange={e => {
                                        const cols = [...(sel.tableColumns || defaultCols)];
                                        cols[ci] = { ...cols[ci], header: e.target.value };
                                        updateElement(sel.id, { tableColumns: cols });
                                    }} className="text-xs bg-white border rounded px-2 py-1 flex-1" placeholder="Encabezado" />
                                    <button onClick={() => {
                                        const cols = (sel.tableColumns || defaultCols).filter((_, i) => i !== ci);
                                        updateElement(sel.id, { tableColumns: cols });
                                    }} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={12}/></button>
                                </div>
                                <input value={col.field} onChange={e => {
                                    const cols = [...(sel.tableColumns || defaultCols)];
                                    cols[ci] = { ...cols[ci], field: e.target.value };
                                    updateElement(sel.id, { tableColumns: cols });
                                }} className="text-xs bg-white border rounded px-2 py-1 w-full font-mono" placeholder="{{item.campo}}" />
                                <div className="flex gap-1 items-center">
                                    <input type="number" value={col.widthPct} min={5} max={100} onChange={e => {
                                        const cols = [...(sel.tableColumns || defaultCols)];
                                        cols[ci] = { ...cols[ci], widthPct: Number(e.target.value) };
                                        updateElement(sel.id, { tableColumns: cols });
                                    }} className="text-xs bg-white border rounded px-2 py-1 w-14" />
                                    <span className="text-xs text-slate-400">%</span>
                                    <select value={col.align} onChange={e => {
                                        const cols = [...(sel.tableColumns || defaultCols)];
                                        cols[ci] = { ...cols[ci], align: e.target.value as 'left' | 'center' | 'right' };
                                        updateElement(sel.id, { tableColumns: cols });
                                    }} className="text-xs bg-white border rounded px-1 py-1 flex-1">
                                        <option value="left">Izq</option>
                                        <option value="center">Centro</option>
                                        <option value="right">Der</option>
                                    </select>
                                    <select value={col.format} onChange={e => {
                                        const cols = [...(sel.tableColumns || defaultCols)];
                                        cols[ci] = { ...cols[ci], format: e.target.value as 'TEXT' | 'CURRENCY' | 'NUMBER' };
                                        updateElement(sel.id, { tableColumns: cols });
                                    }} className="text-xs bg-white border rounded px-1 py-1 flex-1">
                                        <option value="TEXT">Texto</option>
                                        <option value="CURRENCY">Moneda</option>
                                        <option value="NUMBER">Número</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DesignerProperties;
