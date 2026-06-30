
import React from 'react';
import { Trash2, AlignLeft, AlignCenter, AlignRight, FileCog, Check, Grid, Magnet, Lock, Unlock } from 'lucide-react';
import { LabelTemplate, LabelElement } from '../../types';
import PropertyInput from './PropertyInput';
import PropertiesDisplay from './PropertiesDisplay';
import PropertiesTable from './PropertiesTable';

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
                            <option value="MEDICAMENTOS">Inventario Medicamentos</option>
                            <option value="LOTES_MED">Lotes / Vencimientos</option>
                            <option disabled>--- DOCUMENTOS ---</option>
                            <option value="SALES">Ventas / Facturación</option>
                            <option value="DISPENSACION">Dispensación de Medicamentos</option>
                            <option value="CLIENTS">Clientes / Pacientes</option>
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
                                        <option value="MEDICAMENTO">Medicamento</option>
                                        <option value="LOTE">Lote / Vencimiento</option>
                                        <option value="DISPENSACION">Dispensación</option>
                                    </>
                                ) : (
                                    <>
                                        <option value="INVOICE">Factura / Recibo</option>
                                        <option value="DISPENSACION">Despacho / Formula</option>
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

    // â”€â”€ Multi-select panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (multiSel.length > 1) {
        const types = [...new Set(multiSel.map(e => e.type))];
        const allText  = types.every(t => t === 'TEXT' || t === 'RECEIPT_ITEMS');
        const allShape = types.every(t => t === 'SHAPE');
        const hasSizes = types.some(t => ['TEXT','RECEIPT_ITEMS','SHAPE','IMAGE','BARCODE','QR'].includes(t));

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

                {/* Geometry â€” apply to all */}
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

    // â”€â”€ Element Properties â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            <PropertiesDisplay sel={sel} updateElement={updateElement} setShowVarModal={setShowVarModal}/>
            <PropertiesTable sel={sel} updateElement={updateElement}/>

        </div>
    );
};

export default DesignerProperties;
