
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { 
  ArrowLeft, Save, Type, ScanLine, Trash2, 
  AlignLeft, AlignCenter, AlignRight, X, 
  Check, ChevronDown, FileCog,
  QrCode, Image as ImageIcon, Square, Undo2, Redo2,
  ZoomIn, ZoomOut, Layers, Upload, Settings,
  RotateCw, RotateCcw, Move, ArrowUp, ArrowDown,
  Database, Shapes, Circle, Minus,
  FileText, Receipt, Table as TableIcon, Eye, Star,
  Plus, Grid, MoreVertical, Smartphone, Headphones
} from 'lucide-react';
import Swal from 'sweetalert2';
import { LabelService, AdminService } from '../services/api';
import { LabelTemplate, LabelElement } from '../types';

// --- CONSTANTS ---
const MM_TO_PX = 3.7795; // 96 DPI

const FONTS = [
    { name: 'Predeterminada', value: 'helvetica' },
    { name: 'Roboto', value: "'Roboto', sans-serif" },
    { name: 'Open Sans', value: "'Open Sans', sans-serif" },
    { name: 'Montserrat', value: "'Montserrat', sans-serif" },
    { name: 'Courier (Code)', value: "'Courier Prime', monospace" },
];

const INITIAL_TEMPLATE: LabelTemplate = {
  id: '',
  name: 'Nuevo Diseño',
  category: 'GENERAL',
  type: 'LABEL',
  dataSource: 'NONE',
  isDefault: false,
  width: 50,
  height: 25,
  elements: []
};

const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// --- COMPONENT: PropertyInput (Fixed Focus) ---
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

// --- MAIN COMPONENT ---
const LabelDesigner: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // --- STATE ---
  const [view, setView] = useState<'GALLERY' | 'DESIGNER'>('GALLERY');
  const [template, setTemplate] = useState<LabelTemplate>(INITIAL_TEMPLATE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2); 
  const [history, setHistory] = useState<LabelTemplate[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  const [dbSchema, setDbSchema] = useState<Record<string, {name:string, type:string}[]>>({});
  
  // UI State
  const [activePanel, setActivePanel] = useState<'TOOLS' | 'LAYERS' | 'PROPERTIES'>('PROPERTIES'); 
  const [isMobilePropOpen, setIsMobilePropOpen] = useState(false);
  const [showVarModal, setShowVarModal] = useState(false);
  const [showShapeModal, setShowShapeModal] = useState(false);
  
  // Interaction State
  const [interaction, setInteraction] = useState<{
      mode: 'NONE' | 'MOVE' | 'RESIZE' | 'ROTATE';
      startPos: { x: number, y: number };
      elementStart: { x: number, y: number, w: number, h: number, r: number };
      handle?: string; 
  }>({ mode: 'NONE', startPos: {x:0, y:0}, elementStart: {x:0, y:0, w:0, h:0, r:0} });

  // --- LIFECYCLE ---
  useEffect(() => {
      loadSavedTemplates();
      fetchDbSchema();
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- API CALLS ---
  const loadSavedTemplates = async () => {
      try {
          const data = await LabelService.getAll();
          setSavedTemplates(data || []);
      } catch (e) { console.error(e); }
  };

  const fetchDbSchema = async () => {
      try {
          const schema = await AdminService.getSchema();
          setDbSchema(schema);
      } catch (e) { console.error(e); }
  };

  const saveTemplate = async () => {
      if (!template.name) return Swal.fire('Error', 'Asigne un nombre al diseño', 'warning');
      try {
          if (template.id) await LabelService.update(template.id, template);
          else {
              const res: any = await LabelService.create(template);
              setTemplate({ ...template, id: res.id });
          }
          Swal.fire({ icon: 'success', title: 'Guardado', toast: true, position: 'bottom-end', timer: 2000, showConfirmButton: false });
          loadSavedTemplates();
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  // --- ACTIONS ---
  const handleCreateNew = () => {
      setTemplate(INITIAL_TEMPLATE);
      setHistory([]);
      setHistoryIndex(-1);
      setView('DESIGNER');
      setZoom(window.innerWidth < 768 ? 1.5 : 3);
  };

  const handleOpenTemplate = (tpl: LabelTemplate) => {
      setTemplate(tpl);
      setHistory([]);
      setHistoryIndex(-1);
      setView('DESIGNER');
      setZoom(window.innerWidth < 768 ? 1.5 : 3);
  };

  const addToHistory = (newState: LabelTemplate) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newState)));
      if (newHistory.length > 20) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const updateTemplate = (updates: Partial<LabelTemplate>) => {
      const newState = { ...template, ...updates };
      setTemplate(newState);
      addToHistory(newState);
  };

  const updateElement = (id: string, updates: Partial<LabelElement>) => {
      const newElements = template.elements.map(el => el.id === id ? { ...el, ...updates } : el);
      // Direct state update for performance, history on interaction end
      setTemplate({ ...template, elements: newElements });
  };

  const addElement = (type: LabelElement['type'], extra: Partial<LabelElement> = {}) => {
      const newEl: LabelElement = {
          id: generateId(),
          type,
          x: 5, y: 5,
          width: type === 'TEXT' ? 30 : 20,
          height: type === 'TEXT' ? 5 : 20,
          rotation: 0,
          content: type === 'TEXT' ? 'Texto' : '',
          fontSize: 8, color: '#000000', textAlign: 'left', fontWeight: 'normal', fontFamily: 'helvetica',
          barcodeFormat: 'CODE128', displayValue: true, shapeType: 'RECTANGLE',
          ...extra
      };

      if (type === 'BARCODE') { newEl.content = '123456'; newEl.width = 30; newEl.height = 10; }
      if (type === 'SHAPE') { newEl.fill = 'transparent'; newEl.stroke = '#000000'; newEl.strokeWidth = 0.5; }
      if (type === 'DETAIL_TABLE') { newEl.width = template.width - 10; newEl.height = 15; newEl.content = 'TABLA DETALLE'; }

      const newElements = [...template.elements, newEl];
      updateTemplate({ elements: newElements });
      setSelectedId(newEl.id);
      setActivePanel('PROPERTIES');
      if (window.innerWidth < 768) setIsMobilePropOpen(true);
  };

  const deleteSelected = () => {
      if (selectedId) {
          const newElements = template.elements.filter(e => e.id !== selectedId);
          updateTemplate({ elements: newElements });
          setSelectedId(null);
      }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => addElement('IMAGE', { content: reader.result as string, width: 20, height: 20 });
          reader.readAsDataURL(file);
      }
  };

  // --- KEYBOARD SHORTCUTS ---
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
      if (view !== 'DESIGNER') return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (historyIndex > 0) { setTemplate(history[historyIndex - 1]); setHistoryIndex(h => h - 1); setSelectedId(null); } }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); if (historyIndex < history.length - 1) { setTemplate(history[historyIndex + 1]); setHistoryIndex(h => h + 1); setSelectedId(null); } }
      else if (e.key === 'Delete') deleteSelected();
  }, [view, selectedId, historyIndex, history]);

  // --- INTERACTION ---
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, id: string, mode: 'MOVE'|'RESIZE'|'ROTATE', handle?: string) => {
      e.stopPropagation();
      const el = template.elements.find(x => x.id === id);
      if (!el) return;
      setSelectedId(id);
      setActivePanel('PROPERTIES');
      if (window.innerWidth < 768) setIsMobilePropOpen(true);

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
      const deltaMmX = (clientX - interaction.startPos.x) / (MM_TO_PX * zoom);
      const deltaMmY = (clientY - interaction.startPos.y) / (MM_TO_PX * zoom);
      
      const start = interaction.elementStart;
      let newEl = { ...template.elements.find(x => x.id === selectedId)! };

      if (interaction.mode === 'MOVE') {
          newEl.x = Number((start.x + deltaMmX).toFixed(1));
          newEl.y = Number((start.y + deltaMmY).toFixed(1));
      } else if (interaction.mode === 'RESIZE' && interaction.handle) {
          if (interaction.handle.includes('e')) newEl.width = Math.max(2, Number((start.w + deltaMmX).toFixed(1)));
          if (interaction.handle.includes('s')) newEl.height = Math.max(2, Number((start.h + deltaMmY).toFixed(1)));
      } else if (interaction.mode === 'ROTATE') {
          newEl.rotation = (start.r + ((clientX - interaction.startPos.x)/2)) % 360;
      }
      setTemplate(prev => ({ ...prev, elements: prev.elements.map(el => el.id === selectedId ? newEl : el) }));
  };

  const handlePointerUp = () => {
      if (interaction.mode !== 'NONE') {
          addToHistory(template);
          setInteraction({ ...interaction, mode: 'NONE' });
      }
  };

  // --- RENDER HELPERS ---
  const renderBarcode = (el: LabelElement) => {
      const canvas = document.createElement('canvas');
      try { 
          // Replace vars for preview
          const content = el.content.replace(/{{.*?}}/g, '123456');
          JsBarcode(canvas, content, { format: (el.barcodeFormat as any) || "CODE128", displayValue: el.displayValue, margin: 0, width: 2, height: 50, fontSize: 20 }); 
          return canvas.toDataURL("image/png"); 
      } catch (e) { return ''; }
  };
  const renderQR = (el: LabelElement) => { 
      let url = ''; 
      const content = el.content.replace(/{{.*?}}/g, 'DEMO-DATA');
      QRCode.toDataURL(content, { margin: 0 }, (err, u) => { url = u; }); 
      return url; 
  };

  // --- VIEWS ---

  if (view === 'GALLERY') {
      return (
          <div className="min-h-screen bg-slate-50 p-6 md:p-10">
              <div className="max-w-6xl mx-auto">
                  <div className="flex justify-between items-center mb-8">
                      <div>
                          <h1 className="text-3xl font-bold text-slate-800">Mis Diseños</h1>
                          <p className="text-slate-500">Gestiona tus etiquetas y reportes</p>
                      </div>
                      <button onClick={handleCreateNew} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 font-bold transition-all hover:scale-105">
                          <Plus size={20}/> Nuevo Diseño
                      </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {savedTemplates.map(t => (
                          <div key={t.id} onClick={() => handleOpenTemplate(t)} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all cursor-pointer group overflow-hidden relative">
                              <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center relative p-4">
                                  {t.type === 'LABEL' && <div className="w-16 h-8 bg-white border-2 border-slate-300 rounded shadow-sm group-hover:scale-110 transition-transform"></div>}
                                  {t.type === 'INVOICE' && <div className="w-12 h-16 bg-white border-2 border-slate-300 rounded shadow-sm group-hover:scale-110 transition-transform flex flex-col gap-1 p-1"><div className="h-1 bg-slate-200 w-full"/><div className="h-1 bg-slate-200 w-2/3"/><div className="h-1 bg-slate-200 w-full mt-auto"/></div>}
                                  <div className="absolute top-2 right-2">
                                      {t.isDefault && <Star className="text-amber-400 fill-amber-400" size={16}/>}
                                  </div>
                              </div>
                              <div className="p-4">
                                  <h3 className="font-bold text-slate-700 group-hover:text-indigo-600 truncate">{t.name}</h3>
                                  <div className="flex justify-between items-center mt-1 text-xs text-slate-400">
                                      <span>{t.width}x{t.height}mm</span>
                                      <span className="uppercase font-bold bg-slate-100 px-1.5 py-0.5 rounded">{t.category?.substring(0,3)}</span>
                                  </div>
                              </div>
                          </div>
                      ))}
                      {savedTemplates.length === 0 && (
                          <div className="col-span-full py-20 text-center text-slate-400">
                              <FileCog size={48} className="mx-auto mb-2 opacity-20"/>
                              <p>No tienes diseños guardados</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  // --- DESIGNER VIEW ---
  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden font-sans" onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}>
        
        {/* HEADER */}
        <header className="bg-white border-b h-16 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm">
            <div className="flex items-center gap-2 w-1/3">
                <button onClick={() => setView('GALLERY')} className="hover:bg-slate-100 p-2 rounded-full text-slate-600 transition-colors"><ArrowLeft size={20}/></button>
                <div className="hidden md:flex gap-1 border-l pl-3 ml-2">
                    <button onClick={() => { if(historyIndex>0){setTemplate(history[historyIndex-1]); setHistoryIndex(h=>h-1);} }} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Undo2 size={18}/></button>
                    <button onClick={() => { if(historyIndex<history.length-1){setTemplate(history[historyIndex+1]); setHistoryIndex(h=>h+1);} }} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Redo2 size={18}/></button>
                </div>
            </div>
            
            <div className="flex-1 flex justify-center">
                <input 
                    className="text-center font-bold text-slate-800 bg-transparent hover:bg-slate-50 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-[250px] transition-all" 
                    value={template.name} 
                    onChange={e => setTemplate({...template, name: e.target.value})}
                    placeholder="Nombre del Diseño"
                />
            </div>

            <div className="w-1/3 flex justify-end gap-2">
                <button onClick={saveTemplate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2 text-sm transition-all active:scale-95">
                    <Save size={18}/> <span className="hidden md:inline">Guardar</span>
                </button>
            </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
            
            {/* DESKTOP SIDEBAR */}
            <aside className="hidden md:flex w-20 bg-white border-r flex-col items-center py-6 gap-6 z-20 shadow-sm">
                <div className="flex flex-col gap-4 w-full px-2">
                    <ToolButton icon={<Type size={20}/>} label="Texto" onClick={() => addElement('TEXT')} />
                    <ToolButton icon={<ScanLine size={20}/>} label="Código" onClick={() => addElement('BARCODE')} />
                    <ToolButton icon={<Shapes size={20}/>} label="Forma" onClick={() => setShowShapeModal(true)} />
                    <ToolButton icon={<ImageIcon size={20}/>} label="Imagen" onClick={() => fileInputRef.current?.click()} />
                    {template.type === 'INVOICE' && <ToolButton icon={<TableIcon size={20}/>} label="Tabla" onClick={() => addElement('DETAIL_TABLE')} color="text-purple-600 bg-purple-50" />}
                </div>
                <div className="mt-auto flex flex-col gap-4 w-full px-2">
                    <div className="h-px bg-slate-200 w-full"/>
                    <ToolButton icon={<FileCog size={20}/>} label="Config" onClick={() => { setSelectedId(null); setActivePanel('PROPERTIES'); }} active={!selectedId} />
                </div>
            </aside>

            {/* CANVAS */}
            <main className="flex-1 bg-slate-200/50 overflow-hidden relative flex items-center justify-center p-8 touch-none"
                  onClick={() => setSelectedId(null)}
                  onWheel={(e) => { if(e.ctrlKey) { e.preventDefault(); setZoom(z => Math.max(0.5, Math.min(5, z - e.deltaY * 0.01))); } }}
            >
                {/* Zoom Controls */}
                <div className="absolute bottom-6 left-6 flex flex-col gap-2 bg-white p-1 rounded-xl shadow-lg border border-slate-200 z-10">
                    <button onClick={() => setZoom(z => Math.min(z + 0.5, 5))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><ZoomIn size={20}/></button>
                    <div className="text-[10px] font-bold text-slate-400 text-center py-1 border-y border-slate-100 select-none">{Math.round(zoom*100)}%</div>
                    <button onClick={() => setZoom(z => Math.max(z - 0.5, 0.5))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><ZoomOut size={20}/></button>
                </div>

                <div 
                    className="bg-white shadow-2xl relative transition-all duration-75 ease-out ring-1 ring-slate-900/5"
                    style={{
                        width: `${template.width * MM_TO_PX * zoom}px`,
                        height: `${template.height * MM_TO_PX * zoom}px`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Size Label */}
                    <div className="absolute -top-8 left-0 bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-bold shadow-sm opacity-50 hover:opacity-100 transition-opacity">
                        {template.width}mm x {template.height}mm
                    </div>

                    {/* Grid Pattern */}
                    <div className="absolute inset-0 pointer-events-none opacity-20" 
                       style={{backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`, backgroundSize: `${10*zoom}px ${10*zoom}px`}}>
                    </div>

                    {/* ELEMENTS RENDER */}
                    {template.elements.map(el => {
                        const isSelected = selectedId === el.id;
                        return (
                            <div
                                key={el.id}
                                onMouseDown={(e) => handlePointerDown(e, el.id, 'MOVE')}
                                onTouchStart={(e) => handlePointerDown(e, el.id, 'MOVE')}
                                className={`absolute group select-none cursor-move
                                    ${isSelected ? 'z-50 outline outline-2 outline-indigo-500' : 'z-10 hover:outline hover:outline-1 hover:outline-indigo-300'}`}
                                style={{
                                    left: `${el.x * MM_TO_PX * zoom}px`,
                                    top: `${el.y * MM_TO_PX * zoom}px`,
                                    width: `${el.width * MM_TO_PX * zoom}px`,
                                    height: `${el.height * MM_TO_PX * zoom}px`,
                                    transform: `rotate(${el.rotation}deg)`,
                                }}
                                onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                            >
                                <div className="w-full h-full overflow-hidden flex items-center justify-center relative" style={{
                                    border: (el.type === 'SHAPE' && el.shapeType !== 'LINE') ? `${(el.strokeWidth||1)*zoom}px solid ${el.stroke}` : 'none',
                                    borderRadius: el.shapeType === 'CIRCLE' ? '50%' : '0',
                                    backgroundColor: el.type === 'SHAPE' ? el.fill : 'transparent',
                                }}>
                                    {el.type === 'TEXT' && (
                                        <div style={{
                                            fontSize: `${(el.fontSize||10)*zoom}px`,
                                            fontFamily: el.fontFamily,
                                            fontWeight: el.fontWeight,
                                            color: el.color,
                                            textAlign: el.textAlign,
                                            whiteSpace: el.isMultiline ? 'pre-wrap' : 'nowrap',
                                            width: '100%', height: '100%', lineHeight: 1.2
                                        }}>{el.content}</div>
                                    )}
                                    {el.type === 'BARCODE' && <img src={renderBarcode(el)} className="w-full h-full object-fill pointer-events-none"/>}
                                    {el.type === 'QR' && <img src={renderQR(el)} className="w-full h-full object-contain pointer-events-none"/>}
                                    {el.type === 'IMAGE' && <img src={el.content} className="w-full h-full object-contain pointer-events-none"/>}
                                    {el.type === 'SHAPE' && el.shapeType === 'LINE' && <div style={{width:'100%', height:`${(el.strokeWidth||1)*zoom}px`, backgroundColor: el.stroke}}/>}
                                    {el.type === 'DETAIL_TABLE' && <div className="w-full h-full border-2 border-dashed border-purple-300 bg-purple-50 flex items-center justify-center text-purple-500 font-bold text-[10px]">DETALLES</div>}
                                </div>

                                {/* HANDLES */}
                                {isSelected && (
                                    <>
                                        <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white border-2 border-indigo-600 rounded-full shadow-sm cursor-nwse-resize"
                                             onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE', 'se')} onTouchStart={(e) => handlePointerDown(e, el.id, 'RESIZE', 'se')}/>
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center cursor-grab shadow-sm text-slate-500"
                                             onMouseDown={(e) => handlePointerDown(e, el.id, 'ROTATE')} onTouchStart={(e) => handlePointerDown(e, el.id, 'ROTATE')}>
                                            <RotateCw size={12}/>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </main>

            {/* DESKTOP PROPERTIES PANEL */}
            <aside className="hidden md:flex w-80 bg-white border-l z-20 shadow-xl flex-col">
                <PanelContent 
                    selectedId={selectedId} 
                    template={template} 
                    setTemplate={setTemplate} 
                    updateElement={updateElement} 
                    deleteSelected={deleteSelected}
                    dbSchema={dbSchema}
                    setShowVarModal={setShowVarModal}
                />
            </aside>
        </div>

        {/* MOBILE BOTTOM BAR */}
        <div className="md:hidden bg-white border-t px-4 py-2 flex justify-between items-center z-40 pb-safe">
            <ToolButton icon={<Type size={20}/>} onClick={() => addElement('TEXT')} />
            <ToolButton icon={<ScanLine size={20}/>} onClick={() => addElement('BARCODE')} />
            <ToolButton icon={<Shapes size={20}/>} onClick={() => setShowShapeModal(true)} />
            <ToolButton icon={<Settings size={20}/>} onClick={() => { setSelectedId(null); setIsMobilePropOpen(true); }} />
            <div className="w-px h-8 bg-slate-200 mx-2"/>
            <button onClick={() => setIsMobilePropOpen(!isMobilePropOpen)} className={`p-3 rounded-full ${selectedId || isMobilePropOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {isMobilePropOpen ? <ChevronDown/> : <MoreVertical/>}
            </button>
        </div>

        {/* MOBILE SLIDE-UP PANEL */}
        <div className={`md:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50 transition-transform duration-300 transform flex flex-col max-h-[70vh] border-t border-slate-100 ${isMobilePropOpen ? 'translate-y-0' : 'translate-y-full'}`}>
            <div className="flex justify-center p-2" onClick={() => setIsMobilePropOpen(false)}>
                <div className="w-12 h-1.5 bg-slate-200 rounded-full"/>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                <PanelContent 
                    selectedId={selectedId} 
                    template={template} 
                    setTemplate={setTemplate} 
                    updateElement={updateElement} 
                    deleteSelected={deleteSelected}
                    dbSchema={dbSchema}
                    setShowVarModal={setShowVarModal}
                />
            </div>
        </div>

        {/* --- MODALS --- */}
        
        {/* SHAPE SELECTOR */}
        {showShapeModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg">Formas</h3>
                        <button onClick={() => setShowShapeModal(false)}><X/></button>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <button onClick={() => { addElement('SHAPE', {shapeType:'RECTANGLE'}); setShowShapeModal(false); }} className="flex flex-col items-center gap-2 p-3 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"><Square size={32} strokeWidth={1.5}/><span className="text-xs font-bold text-slate-600">Rect.</span></button>
                        <button onClick={() => { addElement('SHAPE', {shapeType:'CIRCLE'}); setShowShapeModal(false); }} className="flex flex-col items-center gap-2 p-3 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"><Circle size={32} strokeWidth={1.5}/><span className="text-xs font-bold text-slate-600">Círculo</span></button>
                        <button onClick={() => { addElement('SHAPE', {shapeType:'LINE'}); setShowShapeModal(false); }} className="flex flex-col items-center gap-2 p-3 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"><Minus size={32} strokeWidth={1.5}/><span className="text-xs font-bold text-slate-600">Línea</span></button>
                    </div>
                </div>
            </div>
        )}

        {/* VARIABLE PICKER */}
        {showVarModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col max-h-[80vh]">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b">
                        <h3 className="font-bold text-lg text-slate-800">Insertar Variable</h3>
                        <button onClick={() => setShowVarModal(false)}><X/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
                        {Object.entries(dbSchema).map(([table, cols]) => (
                            <div key={table}>
                                <h4 className="text-xs font-bold text-indigo-600 uppercase mb-2 sticky top-0 bg-white py-1">{table}</h4>
                                <div className="flex flex-wrap gap-2">
                                    {cols.map(col => (
                                        <button 
                                            key={col.name}
                                            onClick={() => {
                                                if(selectedId) {
                                                    const el = template.elements.find(e => e.id === selectedId);
                                                    if(el) updateElement(selectedId, { content: (el.content || '') + `{{${col.name}}}` });
                                                }
                                                setShowVarModal(false);
                                            }}
                                            className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            {col.name}
                                        </button>
                                    ))}
                                </div>
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

// --- SUB-COMPONENTS ---

const ToolButton = ({ icon, label, onClick, active, color }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 w-full group ${active ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}>
        <div className={`p-2.5 rounded-xl transition-all shadow-sm ${active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200'} ${color || ''}`}>
            {icon}
        </div>
        {label && <span className={`text-[9px] font-bold ${active ? 'text-indigo-600' : 'text-slate-400'}`}>{label}</span>}
    </button>
);

const PanelContent = ({ selectedId, template, setTemplate, updateElement, deleteSelected, dbSchema, setShowVarModal }: any) => {
    const sel = template.elements.find((e: any) => e.id === selectedId);

    if (!sel) {
        // Page Settings
        return (
            <div className="p-6 space-y-6">
                <div className="flex items-center gap-2 text-slate-800 border-b pb-2">
                    <FileCog size={18} className="text-indigo-600"/>
                    <h3 className="font-bold text-sm uppercase">Configuración Página</h3>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Tipo Documento</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setTemplate({...template, type:'LABEL'})} className={`p-2 rounded-lg border text-xs font-bold transition-all ${template.type==='LABEL'?'border-indigo-600 bg-indigo-50 text-indigo-700':'border-slate-200 text-slate-500'}`}>Etiqueta</button>
                            <button onClick={() => setTemplate({...template, type:'INVOICE'})} className={`p-2 rounded-lg border text-xs font-bold transition-all ${template.type==='INVOICE'?'border-indigo-600 bg-indigo-50 text-indigo-700':'border-slate-200 text-slate-500'}`}>Factura</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <PropertyInput label="Ancho (mm)" value={template.width} onChange={(v:any) => setTemplate({...template, width:v})} type="number" />
                        <PropertyInput label="Alto (mm)" value={template.height} onChange={(v:any) => setTemplate({...template, height:v})} type="number" />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Contexto de Datos</label>
                        <select className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" value={template.dataSource} onChange={e => setTemplate({...template, dataSource:e.target.value})}>
                            <option value="NONE">Sin Conexión</option>
                            <option value="INVENTORY">Inventario / Productos</option>
                            <option value="SALES">Ventas / Facturas</option>
                            <option value="CLIENTS">Clientes</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer" onClick={() => setTemplate({...template, isDefault: !template.isDefault})}>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${template.isDefault ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                            {template.isDefault && <Check size={14} className="text-white"/>}
                        </div>
                        <span className="text-sm font-medium text-slate-600">Usar como Predeterminado</span>
                    </div>
                </div>
            </div>
        );
    }

    // Element Properties
    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center border-b pb-2">
                <div className="flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-bold uppercase">{sel.type}</span>
                </div>
                <button onClick={deleteSelected} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"><Trash2 size={18}/></button>
            </div>

            {/* Common Geometry */}
            <div className="grid grid-cols-2 gap-3">
                <PropertyInput label="X (mm)" value={sel.x} onChange={(v:any) => updateElement(sel.id, {x:v})} type="number" />
                <PropertyInput label="Y (mm)" value={sel.y} onChange={(v:any) => updateElement(sel.id, {y:v})} type="number" />
                <PropertyInput label="Ancho" value={sel.width} onChange={(v:any) => updateElement(sel.id, {width:v})} type="number" />
                <PropertyInput label="Alto" value={sel.height} onChange={(v:any) => updateElement(sel.id, {height:v})} type="number" />
            </div>

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

            {/* Text Specific */}
            {sel.type === 'TEXT' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Tipografía</h4>
                    <select className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" value={sel.fontFamily} onChange={e => updateElement(sel.id, {fontFamily:e.target.value})}>
                        {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                        <PropertyInput value={sel.fontSize} onChange={(v:any) => updateElement(sel.id, {fontSize:v})} type="number" className="flex-1"/>
                        <button onClick={() => updateElement(sel.id, {fontWeight: sel.fontWeight === 'bold' ? 'normal' : 'bold'})} className={`px-3 border rounded-lg font-bold ${sel.fontWeight === 'bold' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>B</button>
                    </div>
                    <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                        {['left','center','right'].map((a:any) => (
                            <button key={a} onClick={() => updateElement(sel.id, {textAlign:a})} className={`flex-1 py-1 rounded flex justify-center ${sel.textAlign===a ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>
                                {a==='left'?<AlignLeft size={16}/>:a==='center'?<AlignCenter size={16}/>:<AlignRight size={16}/>}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <input type="checkbox" checked={sel.isMultiline} onChange={e => updateElement(sel.id, {isMultiline: e.target.checked})} className="rounded text-indigo-600"/>
                        <label className="text-xs font-medium text-slate-600">Multilínea (Ajuste)</label>
                    </div>
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
                                <input type="color" value={sel.fill === 'transparent' ? '#ffffff' : sel.fill} onChange={e => updateElement(sel.id, {fill: e.target.value})} className="h-8 w-8 rounded cursor-pointer border-0"/>
                                <button onClick={() => updateElement(sel.id, {fill:'transparent'})} className="text-[10px] px-2 py-1 bg-slate-100 rounded border">None</button>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Borde</label>
                            <input type="color" value={sel.stroke} onChange={e => updateElement(sel.id, {stroke: e.target.value})} className="h-8 w-full rounded cursor-pointer border-0"/>
                        </div>
                    </div>
                    <PropertyInput label="Grosor Borde" value={sel.strokeWidth} onChange={(v:any) => updateElement(sel.id, {strokeWidth:v})} type="number" step={0.5}/>
                </div>
            )}
        </div>
    );
};

export default LabelDesigner;
