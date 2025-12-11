import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { 
  ArrowLeft, Save, Type, ScanLine, Trash2, 
  Grid, FolderOpen, Star, 
  AlignLeft, AlignCenter, AlignRight, X, 
  Maximize2, Check, ChevronDown, FileCog,
  QrCode, Image as ImageIcon, Square, Undo2, Redo2,
  ZoomIn, ZoomOut, Layers, Copy, Upload
} from 'lucide-react';
import Swal from 'sweetalert2';
import { LabelService } from '../services/api';
import { LabelTemplate, LabelElement } from '../types';

// --- CONSTANTS ---
const MM_TO_PX = 3.7795; // 96 DPI conversion
const HISTORY_LIMIT = 20;

const INITIAL_TEMPLATE: LabelTemplate = {
  id: '',
  name: 'Nueva Etiqueta',
  isDefault: false,
  width: 50,
  height: 25,
  elements: []
};

const PLACEHOLDERS = [
  { label: 'Nombre Producto', value: '{{NOMBRE}}' },
  { label: 'Código / SKU', value: '{{SKU}}' },
  { label: 'Precio Venta', value: '{{PRECIO}}' },
  { label: 'Código Barras', value: '{{BARCODE}}' },
  { label: 'Marca', value: '{{MARCA}}' },
  { label: 'Modelo', value: '{{MODELO}}' },
];

const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// --- COMPONENTS ---

// Robust Input component that doesn't lose focus or lag
const PropertyInput = ({ label, value, onChange, type = "text", step, min }: any) => {
    const [localValue, setLocalValue] = useState(value);
    
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const commitChange = () => {
        let finalVal = localValue;
        if (type === 'number') {
            finalVal = parseFloat(localValue);
            if (isNaN(finalVal)) finalVal = 0;
        }
        if (finalVal !== value) {
            onChange(finalVal);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur(); // Trigger onBlur to commit
        }
    };

    return (
        <div className="flex flex-col gap-1">
            {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</label>}
            <div className="flex items-center gap-1 bg-white border rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all overflow-hidden">
                <input 
                    type={type}
                    step={step}
                    min={min}
                    className="w-full p-2 text-sm font-mono outline-none bg-transparent"
                    value={localValue} 
                    onChange={e => setLocalValue(e.target.value)}
                    onBlur={commitChange}
                    onKeyDown={handleKeyDown}
                />
                <button onClick={commitChange} className="px-2 text-indigo-600 hover:bg-indigo-50 h-full flex items-center justify-center">
                    <Check size={14}/>
                </button>
            </div>
        </div>
    );
};

const LabelDesigner: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // --- STATE ---
  const [template, setTemplate] = useState<LabelTemplate>(INITIAL_TEMPLATE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(3);
  const [history, setHistory] = useState<LabelTemplate[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  const [isMobilePropertiesOpen, setIsMobilePropertiesOpen] = useState(false);

  // Interaction State
  const [interaction, setInteraction] = useState<{
      mode: 'NONE' | 'MOVE' | 'RESIZE' | 'ROTATE';
      startPos: { x: number, y: number };
      elementStart: { x: number, y: number, w: number, h: number, r: number };
      handle?: string; // 'nw', 'ne', 'se', 'sw'
  }>({ 
      mode: 'NONE', 
      startPos: {x:0, y:0}, 
      elementStart: {x:0, y:0, w:0, h:0, r:0} 
  });

  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      loadSavedTemplates();
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleResize = () => {
      setZoom(window.innerWidth < 768 ? 2.5 : 3.5);
  };

  const loadSavedTemplates = async () => {
      try {
          const data = await LabelService.getAll();
          setSavedTemplates(data || []);
      } catch (e) { console.error(e); }
  };

  // --- HISTORY MANAGEMENT ---
  const addToHistory = (newState: LabelTemplate) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newState)));
      if (newHistory.length > HISTORY_LIMIT) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
      if (historyIndex > 0) {
          const prev = history[historyIndex - 1];
          setTemplate(JSON.parse(JSON.stringify(prev)));
          setHistoryIndex(historyIndex - 1);
      }
  };

  const redo = () => {
      if (historyIndex < history.length - 1) {
          const next = history[historyIndex + 1];
          setTemplate(JSON.parse(JSON.stringify(next)));
          setHistoryIndex(historyIndex + 1);
      }
  };

  const updateTemplate = (updates: Partial<LabelTemplate>) => {
      const newState = { ...template, ...updates };
      setTemplate(newState);
      addToHistory(newState);
  };

  const updateElement = (id: string, updates: Partial<LabelElement>) => {
      const newElements = template.elements.map(el => el.id === id ? { ...el, ...updates } : el);
      updateTemplate({ elements: newElements });
  };

  // --- ADD ELEMENTS ---
  const addElement = (type: LabelElement['type'], extra: Partial<LabelElement> = {}) => {
      const newEl: LabelElement = {
          id: generateId(),
          type,
          x: 5,
          y: 5,
          width: type === 'TEXT' ? 25 : 20,
          height: type === 'TEXT' ? 5 : 20,
          rotation: 0,
          content: 'Nuevo Elemento',
          fontSize: 8,
          color: '#000000',
          textAlign: 'center',
          fontWeight: 'normal',
          fontFamily: 'helvetica',
          barcodeFormat: 'CODE128',
          displayValue: true,
          ...extra
      };

      if (type === 'BARCODE') { newEl.content = '123456'; newEl.width = 30; newEl.height = 10; newEl.variableField = '{{SKU}}'; }
      if (type === 'QR') { newEl.content = 'https://example.com'; newEl.width = 15; newEl.height = 15; }
      if (type === 'SHAPE') { newEl.shapeType = 'RECTANGLE'; newEl.fill = 'transparent'; newEl.stroke = '#000000'; newEl.strokeWidth = 0.5; }

      const newElements = [...template.elements, newEl];
      updateTemplate({ elements: newElements });
      setSelectedId(newEl.id);
      setIsMobilePropertiesOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              addElement('IMAGE', { content: reader.result as string, width: 20, height: 20 });
          };
          reader.readAsDataURL(file);
      }
  };

  const deleteSelected = () => {
      if (selectedId) {
          const newElements = template.elements.filter(e => e.id !== selectedId);
          updateTemplate({ elements: newElements });
          setSelectedId(null);
          setIsMobilePropertiesOpen(false);
      }
  };

  // --- RENDER HELPERS ---
  const renderBarcode = (el: LabelElement) => {
      const canvas = document.createElement('canvas');
      try {
          JsBarcode(canvas, "123456", {
              format: (el.barcodeFormat as any) || "CODE128",
              displayValue: el.displayValue,
              margin: 0,
              width: 2, height: 50, fontSize: 20
          });
          return canvas.toDataURL("image/png");
      } catch (e) { return ''; }
  };

  const renderQR = (el: LabelElement) => {
      let url = '';
      QRCode.toDataURL(el.content || 'error', { margin: 0 }, (err, u) => { url = u; });
      return url;
  };

  const getPreviewText = (el: LabelElement) => {
      if (el.variableField) {
          const mapping: any = { '{{NOMBRE}}': 'Producto Ej.', '{{SKU}}': 'ABC-001', '{{PRECIO}}': 'L. 100.00', '{{BARCODE}}': '12345678' };
          return mapping[el.variableField] || el.variableField;
      }
      return el.content;
  };

  // --- INTERACTION HANDLERS ---
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, id: string, mode: 'MOVE' | 'RESIZE' | 'ROTATE', handle?: string) => {
      e.stopPropagation();
      const el = template.elements.find(x => x.id === id);
      if (!el) return;

      setSelectedId(id);
      setIsMobilePropertiesOpen(true);

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      setInteraction({
          mode,
          startPos: { x: clientX, y: clientY },
          elementStart: { x: el.x, y: el.y, w: el.width, h: el.height, r: el.rotation },
          handle
      });
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (interaction.mode === 'NONE' || !selectedId) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const deltaPxX = clientX - interaction.startPos.x;
      const deltaPxY = clientY - interaction.startPos.y;
      
      const deltaMmX = deltaPxX / (MM_TO_PX * zoom);
      const deltaMmY = deltaPxY / (MM_TO_PX * zoom);

      const elStart = interaction.elementStart;
      let newEl = { ...template.elements.find(x => x.id === selectedId)! };

      if (interaction.mode === 'MOVE') {
          newEl.x = Number((elStart.x + deltaMmX).toFixed(1));
          newEl.y = Number((elStart.y + deltaMmY).toFixed(1));
      } else if (interaction.mode === 'RESIZE' && interaction.handle) {
          // Simple Resize Logic (Improve aspect ratio lock later if needed)
          if (interaction.handle.includes('e')) newEl.width = Math.max(2, Number((elStart.w + deltaMmX).toFixed(1)));
          if (interaction.handle.includes('s')) newEl.height = Math.max(2, Number((elStart.h + deltaMmY).toFixed(1)));
          // Logic for west/north handles involves changing x/y AND width/height inversely - keeping it simple SE for now for stability on mobile
          if (interaction.handle.includes('w')) {
             const w = Math.max(2, Number((elStart.w - deltaMmX).toFixed(1)));
             newEl.width = w;
             newEl.x = Number((elStart.x + (elStart.w - w)).toFixed(1));
          }
      } else if (interaction.mode === 'ROTATE') {
          // Calculate angle relative to center
          // Simplified: just drag x affects rotation
          newEl.rotation = (elStart.r + (deltaPxX / 2)) % 360;
      }

      setTemplate(prev => ({
          ...prev,
          elements: prev.elements.map(el => el.id === selectedId ? newEl : el)
      }));
  };

  const handlePointerUp = () => {
      if (interaction.mode !== 'NONE') {
          addToHistory(template); // Save state on interaction end
          setInteraction({ ...interaction, mode: 'NONE' });
      }
  };

  const saveTemplate = async () => {
      if (!template.name) return Swal.fire('Error', 'Asigne un nombre', 'warning');
      try {
          if (template.id) await LabelService.update(template.id, template);
          else await LabelService.create(template);
          Swal.fire('Guardado', 'Plantilla guardada', 'success');
          loadSavedTemplates();
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  // --- UI PARTS ---

  const ElementProperties = () => {
      const sel = template.elements.find(e => e.id === selectedId);
      if (!sel) return (
          <div className="text-center text-slate-400 p-8">
              <Layers size={48} className="mx-auto mb-4 opacity-20"/>
              <p>Selecciona un elemento para editar sus propiedades</p>
          </div>
      );

      return (
          <div className="space-y-4 animate-fade-in">
              <div className="flex justify-between items-center pb-2 border-b">
                  <span className="font-bold text-slate-700 text-sm uppercase">{sel.type}</span>
                  <div className="flex gap-2">
                      <button onClick={() => {
                          const newElements = [...template.elements];
                          const idx = newElements.findIndex(e => e.id === sel.id);
                          if (idx > -1) {
                              newElements.push(newElements.splice(idx, 1)[0]); // Move to end (front)
                              updateTemplate({ elements: newElements });
                          }
                      }} className="p-1.5 hover:bg-slate-100 rounded text-slate-500" title="Traer al frente"><Layers size={16}/></button>
                      <button onClick={deleteSelected} className="p-1.5 hover:bg-red-50 text-red-500 rounded"><Trash2 size={16}/></button>
                  </div>
              </div>

              {/* Common Geometry */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <PropertyInput label="X (mm)" value={sel.x} onChange={(v:any) => updateElement(sel.id, {x:v})} type="number" />
                  <PropertyInput label="Y (mm)" value={sel.y} onChange={(v:any) => updateElement(sel.id, {y:v})} type="number" />
                  <PropertyInput label="Ancho" value={sel.width} onChange={(v:any) => updateElement(sel.id, {width:v})} type="number" min={1}/>
                  <PropertyInput label="Alto" value={sel.height} onChange={(v:any) => updateElement(sel.id, {height:v})} type="number" min={1}/>
                  <div className="col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Rotación: {Math.round(sel.rotation)}°</label>
                      <input type="range" min="0" max="360" value={sel.rotation} onChange={e => updateElement(sel.id, {rotation: Number(e.target.value)})} className="w-full accent-indigo-600"/>
                  </div>
              </div>

              {/* Type Specific */}
              {(sel.type === 'TEXT' || sel.type === 'BARCODE' || sel.type === 'QR') && (
                  <div className="space-y-3">
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Contenido</label>
                          <div className="flex gap-2 mb-2">
                              <select className="flex-1 p-2 border rounded text-sm bg-white" 
                                  value={sel.variableField || 'CUSTOM'} 
                                  onChange={e => updateElement(sel.id, {variableField: e.target.value === 'CUSTOM' ? '' : e.target.value, content: e.target.value === 'CUSTOM' ? 'Texto' : e.target.value})}
                              >
                                  <option value="CUSTOM">Texto Personalizado</option>
                                  {PLACEHOLDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                              </select>
                          </div>
                          {!sel.variableField && (
                              <textarea className="w-full p-2 border rounded text-sm" value={sel.content} onChange={e => updateElement(sel.id, {content: e.target.value})} rows={2}/>
                          )}
                      </div>
                  </div>
              )}

              {sel.type === 'TEXT' && (
                  <div className="grid grid-cols-2 gap-3">
                      <PropertyInput label="Tamaño Pt" value={sel.fontSize} onChange={(v:any) => updateElement(sel.id, {fontSize:v})} type="number" />
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Peso</label>
                          <select className="w-full p-2 border rounded text-sm" value={sel.fontWeight} onChange={e => updateElement(sel.id, {fontWeight: e.target.value})}>
                              <option value="normal">Normal</option>
                              <option value="bold">Negrita</option>
                          </select>
                      </div>
                      <div className="col-span-2 flex justify-center bg-slate-100 p-1 rounded-lg">
                          {['left','center','right'].map((a:any) => (
                              <button key={a} onClick={() => updateElement(sel.id, {textAlign: a})} 
                                  className={`flex-1 p-1 rounded flex justify-center ${sel.textAlign === a ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>
                                  {a==='left'?<AlignLeft size={16}/>:a==='center'?<AlignCenter size={16}/>:<AlignRight size={16}/>}
                              </button>
                          ))}
                      </div>
                  </div>
              )}

              {sel.type === 'SHAPE' && (
                  <div className="grid grid-cols-2 gap-3">
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Relleno</label>
                          <input type="color" className="w-full h-8 rounded cursor-pointer" value={sel.fill === 'transparent' ? '#ffffff' : sel.fill} onChange={e => updateElement(sel.id, {fill: e.target.value})} />
                          <button onClick={() => updateElement(sel.id, {fill: 'transparent'})} className="text-xs text-slate-500 underline mt-1 w-full text-center">Transparente</button>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Borde</label>
                          <input type="color" className="w-full h-8 rounded cursor-pointer" value={sel.stroke} onChange={e => updateElement(sel.id, {stroke: e.target.value})} />
                      </div>
                      <PropertyInput label="Grosor Borde" value={sel.strokeWidth} onChange={(v:any) => updateElement(sel.id, {strokeWidth:v})} type="number" step={0.5} />
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden font-sans"
         onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}
         onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}>
        
        {/* --- HEADER --- */}
        <header className="bg-white border-b h-16 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm relative">
            <div className="flex items-center gap-3 w-1/3">
                <button onClick={() => navigate(-1)} className="hover:bg-slate-100 p-2 rounded-full transition-colors"><ArrowLeft size={20} className="text-slate-600"/></button>
                <div className="hidden md:flex gap-1">
                    <button onClick={undo} disabled={historyIndex <= 0} className="p-2 hover:bg-slate-100 rounded disabled:opacity-30"><Undo2 size={18}/></button>
                    <button onClick={redo} disabled={historyIndex >= history.length-1} className="p-2 hover:bg-slate-100 rounded disabled:opacity-30"><Redo2 size={18}/></button>
                </div>
            </div>
            
            <div className="flex-1 flex justify-center">
                <input 
                    className="text-center font-bold text-slate-700 bg-transparent hover:bg-slate-50 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={template.name}
                    onChange={e => setTemplate({...template, name: e.target.value})}
                    placeholder="Nombre del Diseño"
                />
            </div>

            <div className="w-1/3 flex justify-end gap-2">
                <button onClick={() => setShowTemplatesModal(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg md:flex hidden items-center gap-2">
                    <FolderOpen size={18}/> <span className="text-xs font-bold">Abrir</span>
                </button>
                <button onClick={saveTemplate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-2 text-sm transition-all active:scale-95">
                    <Save size={18}/> <span className="hidden md:inline">Guardar</span>
                </button>
            </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
            
            {/* --- LEFT TOOLBAR (Desktop) --- */}
            <aside className="hidden md:flex w-20 bg-white border-r flex-col items-center py-4 gap-2 z-20 shadow-[2px_0_10px_rgba(0,0,0,0.05)]">
                <ToolbarButton icon={<Type/>} label="Texto" onClick={() => addElement('TEXT')}/>
                <ToolbarButton icon={<ScanLine/>} label="Código" onClick={() => addElement('BARCODE')}/>
                <ToolbarButton icon={<QrCode/>} label="QR" onClick={() => addElement('QR')}/>
                <ToolbarButton icon={<Square/>} label="Forma" onClick={() => addElement('SHAPE')}/>
                <ToolbarButton icon={<ImageIcon/>} label="Imagen" onClick={() => fileInputRef.current?.click()}/>
                <div className="h-px w-10 bg-slate-200 my-2"/>
                <div className="mt-auto flex flex-col gap-2">
                    <ToolbarButton icon={<ZoomIn/>} label="Zoom +" onClick={() => setZoom(z => Math.min(z + 0.5, 6))}/>
                    <div className="text-[10px] font-bold text-slate-400 text-center">{Math.round(zoom*100/3.7795)}%</div>
                    <ToolbarButton icon={<ZoomOut/>} label="Zoom -" onClick={() => setZoom(z => Math.max(z - 0.5, 1))}/>
                </div>
            </aside>

            {/* --- CANVAS WORKSPACE --- */}
            <main className="flex-1 bg-slate-100 overflow-hidden relative flex items-center justify-center p-8 touch-none">
                
                {/* Canvas Container */}
                <div 
                    ref={canvasRef}
                    className="bg-white shadow-2xl relative transition-all duration-200"
                    style={{
                        width: `${template.width * MM_TO_PX * zoom}px`,
                        height: `${template.height * MM_TO_PX * zoom}px`,
                    }}
                    onClick={() => { setSelectedId(null); setIsMobilePropertiesOpen(false); }}
                >
                    {/* Page Size Label */}
                    <div className="absolute -top-6 left-0 text-xs font-bold text-slate-400">
                        {template.width}mm x {template.height}mm
                    </div>

                    {/* Grid Background */}
                    <div className="absolute inset-0 pointer-events-none opacity-20" 
                       style={{backgroundImage: 'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)', backgroundSize: `${5*MM_TO_PX*zoom}px ${5*MM_TO_PX*zoom}px`}}>
                    </div>

                    {template.elements.map(el => {
                        const isSelected = selectedId === el.id;
                        return (
                            <div
                                key={el.id}
                                onMouseDown={(e) => handlePointerDown(e, el.id, 'MOVE')}
                                onTouchStart={(e) => handlePointerDown(e, el.id, 'MOVE')}
                                className={`absolute group select-none cursor-move
                                    ${isSelected ? 'z-50' : 'z-10 hover:outline hover:outline-1 hover:outline-indigo-300'}`}
                                style={{
                                    left: `${el.x * MM_TO_PX * zoom}px`,
                                    top: `${el.y * MM_TO_PX * zoom}px`,
                                    width: `${el.width * MM_TO_PX * zoom}px`,
                                    height: `${el.height * MM_TO_PX * zoom}px`,
                                    transform: `rotate(${el.rotation}deg)`,
                                }}
                            >
                                {/* Element Content */}
                                <div className="w-full h-full overflow-hidden" style={{
                                    border: el.type === 'SHAPE' ? `${(el.strokeWidth || 0) * zoom}px solid ${el.stroke}` : 'none',
                                    backgroundColor: el.type === 'SHAPE' ? el.fill : 'transparent'
                                }}>
                                    {el.type === 'TEXT' && (
                                        <div style={{
                                            fontSize: `${(el.fontSize || 10) * zoom}pt`,
                                            fontFamily: el.fontFamily,
                                            fontWeight: el.fontWeight,
                                            color: el.color,
                                            textAlign: el.textAlign,
                                            lineHeight: 1,
                                            width: '100%',
                                            height: '100%',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {getPreviewText(el)}
                                        </div>
                                    )}
                                    {el.type === 'BARCODE' && <img src={renderBarcode(el)} className="w-full h-full object-fill pointer-events-none"/>}
                                    {el.type === 'QR' && <img src={renderQR(el)} className="w-full h-full object-contain pointer-events-none"/>}
                                    {el.type === 'IMAGE' && <img src={el.content} className="w-full h-full object-contain pointer-events-none"/>}
                                </div>

                                {/* Selection Handles */}
                                {isSelected && (
                                    <>
                                        <div className="absolute inset-0 border-2 border-indigo-600 pointer-events-none"/>
                                        {/* Resize Handles */}
                                        <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-full cursor-nwse-resize"
                                             onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE', 'nw')} onTouchStart={(e) => handlePointerDown(e, el.id, 'RESIZE', 'nw')}/>
                                        <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-full cursor-nesw-resize"
                                             onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE', 'ne')} onTouchStart={(e) => handlePointerDown(e, el.id, 'RESIZE', 'ne')}/>
                                        <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-600 rounded-full cursor-nesw-resize"
                                             onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE', 'sw')} onTouchStart={(e) => handlePointerDown(e, el.id, 'RESIZE', 'sw')}/>
                                        <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-nwse-resize shadow-md"
                                             onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE', 'se')} onTouchStart={(e) => handlePointerDown(e, el.id, 'RESIZE', 'se')}/>
                                        
                                        {/* Rotate Handle */}
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
                                            <div className="w-px h-4 bg-indigo-600"></div>
                                            <div className="w-5 h-5 bg-white border border-indigo-600 rounded-full cursor-grab flex items-center justify-center shadow-sm"
                                                 onMouseDown={(e) => handlePointerDown(e, el.id, 'ROTATE')} onTouchStart={(e) => handlePointerDown(e, el.id, 'ROTATE')}>
                                                <RefreshCwIcon size={10} className="text-indigo-600"/>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </main>

            {/* --- RIGHT PROPERTIES PANEL (Desktop) --- */}
            <aside className="hidden md:block w-72 bg-white border-l z-20 shadow-lg overflow-y-auto">
                <div className="p-4 border-b">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Configuración</h3>
                </div>
                
                {/* Global Page Settings if nothing selected */}
                {!selectedId && (
                    <div className="p-4 space-y-4">
                        <h4 className="font-bold text-xs text-slate-500 uppercase flex items-center gap-2"><FileCog size={14}/> Documento</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <PropertyInput label="Ancho (mm)" value={template.width} onChange={(v:any) => setTemplate({...template, width: v})} type="number"/>
                            <PropertyInput label="Alto (mm)" value={template.height} onChange={(v:any) => setTemplate({...template, height: v})} type="number"/>
                        </div>
                        <div className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50" onClick={() => setTemplate({...template, isDefault: !template.isDefault})}>
                            <div className={`w-4 h-4 border rounded flex items-center justify-center ${template.isDefault ? 'bg-indigo-600 border-indigo-600' : 'bg-white'}`}>
                                {template.isDefault && <Check size={10} className="text-white"/>}
                            </div>
                            <span className="text-sm font-medium text-slate-700">Plantilla Predeterminada</span>
                        </div>
                    </div>
                )}

                <ElementProperties />
            </aside>
        </div>

        {/* --- MOBILE BOTTOM TOOLBAR (Always Visible) --- */}
        <div className="md:hidden bg-white border-t px-2 py-2 flex justify-between items-center shrink-0 z-40 pb-safe">
            <div className="flex gap-1 overflow-x-auto no-scrollbar w-full justify-around">
               <ToolbarButton icon={<Type size={20}/>} label="Texto" onClick={() => addElement('TEXT')}/>
               <ToolbarButton icon={<ScanLine size={20}/>} label="Código" onClick={() => addElement('BARCODE')}/>
               <ToolbarButton icon={<QrCode size={20}/>} label="QR" onClick={() => addElement('QR')}/>
               <ToolbarButton icon={<Square size={20}/>} label="Forma" onClick={() => addElement('SHAPE')}/>
               <ToolbarButton icon={<ImageIcon size={20}/>} label="Imagen" onClick={() => fileInputRef.current?.click()}/>
            </div>
        </div>

        {/* --- MOBILE PROPERTIES SHEET (Slide Up) --- */}
        {isMobilePropertiesOpen && (
            <div className="md:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-[0_-5px_30px_rgba(0,0,0,0.15)] z-50 max-h-[60vh] overflow-y-auto border-t border-slate-200 animate-slide-up pb-safe">
                <div className="sticky top-0 bg-white p-3 flex justify-between items-center border-b mb-2" onClick={() => setIsMobilePropertiesOpen(false)}>
                    <span className="text-xs font-bold text-slate-400 uppercase">Propiedades</span>
                    <ChevronDown size={20} className="text-slate-400"/>
                </div>
                <div className="p-4 pb-8">
                    {selectedId ? <ElementProperties /> : (
                        <div className="grid grid-cols-2 gap-3">
                            <PropertyInput label="Ancho Hoja" value={template.width} onChange={(v:any) => setTemplate({...template, width: v})} type="number"/>
                            <PropertyInput label="Alto Hoja" value={template.height} onChange={(v:any) => setTemplate({...template, height: v})} type="number"/>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* TEMPLATES MODAL */}
        {showTemplatesModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col shadow-2xl">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-xl text-slate-800">Mis Plantillas</h3>
                        <button onClick={() => setShowTemplatesModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X/></button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 overflow-y-auto p-1 custom-scrollbar">
                        <button onClick={() => { setTemplate(INITIAL_TEMPLATE); setHistory([]); setShowTemplatesModal(false); }}
                            className="border-2 border-dashed border-indigo-200 bg-indigo-50/50 rounded-xl p-4 flex flex-col items-center justify-center gap-3 hover:bg-indigo-50 min-h-[140px] transition-colors group">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-sm group-hover:scale-110 transition-transform"><Upload size={20}/></div>
                            <span className="font-bold text-indigo-600 text-sm">Nueva Plantilla</span>
                        </button>
                        {savedTemplates.map(t => (
                            <div key={t.id} onClick={() => { setTemplate(t); setHistory([]); setShowTemplatesModal(false); }}
                                className="border border-slate-200 rounded-xl p-4 hover:shadow-lg cursor-pointer bg-white relative transition-all group hover:border-indigo-300">
                                {t.isDefault && <div className="absolute top-2 right-2 text-amber-500"><Star size={16} fill="currentColor"/></div>}
                                <div className="aspect-[2/1] bg-slate-100 rounded mb-3 flex items-center justify-center">
                                    <FileCog className="text-slate-300"/>
                                </div>
                                <p className="font-bold text-slate-700 text-sm truncate group-hover:text-indigo-700">{t.name}</p>
                                <p className="text-[10px] text-slate-400">{t.width}x{t.height}mm</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* Hidden File Input */}
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload}/>
    </div>
  );
};

const ToolbarButton = ({ icon, label, onClick }: any) => (
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-1 p-2 w-full rounded-xl text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all active:scale-95 group">
        <div className="p-2 rounded-lg bg-slate-50 group-hover:bg-white shadow-sm border border-slate-100 group-hover:border-indigo-200 transition-colors">
            {icon}
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
    </button>
);

// Simple icon for rotation handle
const RefreshCwIcon = ({size, className}:any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
    </svg>
);

export default LabelDesigner;