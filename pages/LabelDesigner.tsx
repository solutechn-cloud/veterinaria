
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { 
  ArrowLeft, Save, Type, ScanLine, Trash2, 
  MousePointer2, Grid, FolderOpen, Star, 
  AlignLeft, AlignCenter, AlignRight, X, Settings2
} from 'lucide-react';
import Swal from 'sweetalert2';
import { LabelService } from '../services/api';
import { LabelTemplate, LabelElement } from '../types';

// --- UTILS ---
const MM_TO_PX = 3.7795; // 96 DPI
const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

const LabelDesigner: React.FC = () => {
  const navigate = useNavigate();
  
  // --- STATES ---
  const [template, setTemplate] = useState<LabelTemplate>(INITIAL_TEMPLATE);
  const [elements, setElements] = useState<LabelElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // UI Logic
  const [zoom, setZoom] = useState(3); // Zoom visual
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showPropertiesMobile, setShowPropertiesMobile] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  
  // Dragging Logic
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSavedTemplates();
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Ajustar zoom inicial según dispositivo
  const handleResize = () => {
      if (window.innerWidth < 768) setZoom(2.5);
      else setZoom(3.5);
  };

  const loadSavedTemplates = async () => {
    try {
      const data = await LabelService.getAll();
      setSavedTemplates(data || []);
    } catch (error) {
      console.error("Error loading templates", error);
    }
  };

  // --- ELEMENT MANAGEMENT ---
  const addElement = (type: LabelElement['type']) => {
    const newEl: LabelElement = {
      id: generateId(),
      type,
      x: 5,
      y: 5,
      width: type === 'BARCODE' ? 30 : 25,
      height: type === 'BARCODE' ? 10 : 5,
      rotation: 0,
      content: type === 'TEXT' ? 'Texto' : '123456',
      fontSize: 8,
      fontFamily: 'helvetica',
      fontWeight: 'normal',
      color: '#000000',
      textAlign: 'center',
      barcodeFormat: 'CODE128',
      displayValue: true
    };

    if (type === 'BARCODE') newEl.variableField = '{{SKU}}';
    
    setElements(prev => [...prev, newEl]);
    setSelectedId(newEl.id);
    if(window.innerWidth < 768) setShowPropertiesMobile(true);
  };

  const updateElement = (id: string, updates: Partial<LabelElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const deleteElement = (id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    setSelectedId(null);
    setShowPropertiesMobile(false);
  };

  // --- DRAG & DROP HANDLERS (UNIFIED MOUSE/TOUCH) ---
  
  const handleStart = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    if(window.innerWidth < 768) setShowPropertiesMobile(true);

    isDragging.current = true;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    // Calcular offset inicial relativo al elemento
    // Buscamos el elemento actual en el estado
    const el = elements.find(item => item.id === id);
    if(el && canvasRef.current) {
        // Convertimos posición del elemento (mm) a px pantalla
        const elPxX = el.x * MM_TO_PX * zoom;
        const elPxY = el.y * MM_TO_PX * zoom;
        
        // Offset del puntero respecto al canvas rect no es necesario si movemos delta
        // Guardamos posición inicial del ratón
        dragOffset.current = { x: clientX, y: clientY };
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current || !selectedId || !canvasRef.current) return;
    
    // Prevenir scroll en móviles al arrastrar
    if ('touches' in e) { 
        // e.preventDefault(); // Puede bloquear scroll de pagina, usar con cuidado
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - dragOffset.current.x;
    const deltaY = clientY - dragOffset.current.y;

    // Convertir delta px a mm
    const deltaMmX = deltaX / (MM_TO_PX * zoom);
    const deltaMmY = deltaY / (MM_TO_PX * zoom);

    setElements(prev => prev.map(el => {
        if(el.id === selectedId) {
            return {
                ...el,
                x: Number((el.x + deltaMmX).toFixed(2)),
                y: Number((el.y + deltaMmY).toFixed(2))
            }
        }
        return el;
    }));

    // Actualizar referencia para siguiente frame
    dragOffset.current = { x: clientX, y: clientY };
  };

  const handleEnd = () => {
    isDragging.current = false;
  };

  // --- RENDERING HELPERS ---
  const renderBarcode = (el: LabelElement) => {
      const canvas = document.createElement('canvas');
      try {
          JsBarcode(canvas, "123456", {
              format: "CODE128",
              displayValue: el.displayValue,
              margin: 0,
              width: 2,
              height: 50,
              fontSize: 20 // High res for preview
          });
          return canvas.toDataURL("image/png");
      } catch (e) { return ''; }
  };

  const resolvePreviewText = (el: LabelElement) => {
      if (el.variableField) {
          switch(el.variableField) {
              case '{{NOMBRE}}': return 'Prod. Ejemplo';
              case '{{SKU}}': return 'ABC-123';
              case '{{PRECIO}}': return 'L. 100.00';
              case '{{MARCA}}': return 'Marca';
              case '{{MODELO}}': return 'Modelo';
              default: return el.variableField;
          }
      }
      return el.content;
  };

  // --- SAVING ---
  const handleSave = async () => {
      if (!template.name) return Swal.fire('Nombre Requerido', 'Asigne un nombre a la plantilla', 'warning');
      const payload = { ...template, elements };
      try {
          if (template.id) await LabelService.update(template.id, payload);
          else await LabelService.create(payload);
          Swal.fire('Guardado', 'Plantilla lista', 'success');
          loadSavedTemplates();
      } catch(e:any) { Swal.fire('Error', e.message, 'error'); }
  };

  // --- UI COMPONENTS ---
  const PropertyPanel = ({ mobile = false }) => {
      const sel = elements.find(e => e.id === selectedId);
      
      // Si no hay selección, mostrar configuración de hoja
      if (!sel) return (
          <div className={`p-4 space-y-4 ${mobile ? '' : 'h-full overflow-y-auto'}`}>
              <h3 className="font-bold text-slate-800 border-b pb-2 mb-2 flex items-center gap-2"><Grid size={18}/> Configuración Hoja</h3>
              <div className="grid grid-cols-2 gap-4">
                  <Input label="Ancho (mm)" value={template.width} onChange={v => setTemplate({...template, width: Number(v)})} />
                  <Input label="Alto (mm)" value={template.height} onChange={v => setTemplate({...template, height: Number(v)})} />
              </div>
              <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100 cursor-pointer mt-4" 
                   onClick={() => setTemplate({...template, isDefault: !template.isDefault})}>
                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${template.isDefault ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                      {template.isDefault && <Star size={12} className="text-white"/>}
                  </div>
                  <span className="text-sm font-bold text-indigo-900">Plantilla Predeterminada</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">Esta plantilla se usará automáticamente al imprimir desde inventario.</p>
          </div>
      );

      return (
          <div className={`p-4 space-y-4 ${mobile ? '' : 'h-full overflow-y-auto'}`}>
              <div className="flex justify-between items-center border-b pb-2 mb-2">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      {sel.type === 'TEXT' ? <Type size={18}/> : <ScanLine size={18}/>} Propiedades
                  </h3>
                  <button onClick={() => deleteElement(sel.id)} className="text-red-500 bg-red-50 p-2 rounded-lg"><Trash2 size={18}/></button>
              </div>

              {/* Data Binding */}
              <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Dato / Contenido</label>
                  <select className="w-full p-2 border rounded bg-slate-50 text-sm" value={sel.variableField || ''} 
                      onChange={e => updateElement(sel.id, {variableField: e.target.value, content: e.target.value || sel.content})}>
                      <option value="">Texto Manual</option>
                      {PLACEHOLDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  {!sel.variableField && (
                      <input className="w-full p-2 border rounded text-sm" value={sel.content} onChange={e => updateElement(sel.id, {content: e.target.value})} />
                  )}
              </div>

              {/* Geometry */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <Input label="X (mm)" value={sel.x} onChange={v => updateElement(sel.id, {x: Number(v)})} />
                  <Input label="Y (mm)" value={sel.y} onChange={v => updateElement(sel.id, {y: Number(v)})} />
                  <Input label="Ancho" value={sel.width} onChange={v => updateElement(sel.id, {width: Number(v)})} />
                  <Input label="Alto" value={sel.height} onChange={v => updateElement(sel.id, {height: Number(v)})} />
                  <div className="col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Rotación: {sel.rotation}°</label>
                      <input type="range" min="0" max="270" step="90" className="w-full" value={sel.rotation} onChange={e => updateElement(sel.id, {rotation: Number(e.target.value)})} />
                  </div>
              </div>

              {/* Styles */}
              {sel.type === 'TEXT' && (
                  <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                          <Input label="Tamaño (pt)" value={sel.fontSize || 10} onChange={v => updateElement(sel.id, {fontSize: Number(v)})} />
                          <div>
                              <label className="text-[10px] text-slate-400 block mb-1 uppercase">Peso</label>
                              <select className="w-full p-1.5 border rounded text-sm" value={sel.fontWeight} onChange={e => updateElement(sel.id, {fontWeight: e.target.value})}>
                                  <option value="normal">Normal</option>
                                  <option value="bold">Negrita</option>
                              </select>
                          </div>
                      </div>
                      <div className="flex justify-center gap-1 bg-slate-100 p-1 rounded">
                          {['left','center','right'].map((a:any) => (
                              <button key={a} onClick={() => updateElement(sel.id, {textAlign: a})} 
                                  className={`p-1 rounded flex-1 flex justify-center ${sel.textAlign === a ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>
                                  {a==='left'?<AlignLeft size={16}/>:a==='center'?<AlignCenter size={16}/>:<AlignRight size={16}/>}
                              </button>
                          ))}
                      </div>
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden" 
         onMouseMove={handleMove} onMouseUp={handleEnd}
         onTouchMove={handleMove} onTouchEnd={handleEnd}>
      
      {/* HEADER */}
      <div className="bg-white border-b h-16 flex items-center justify-between px-4 shrink-0 z-20">
          <div className="flex items-center gap-3 overflow-hidden">
              <button onClick={() => navigate(-1)}><ArrowLeft size={22} className="text-slate-600"/></button>
              <input 
                  className="font-bold text-slate-800 text-lg outline-none bg-transparent w-full min-w-[100px]"
                  value={template.name} onChange={e => setTemplate({...template, name: e.target.value})}
                  placeholder="Nombre Plantilla"
              />
          </div>
          <div className="flex gap-2">
              <button onClick={() => setShowTemplateModal(true)} className="p-2 bg-slate-100 rounded-lg text-slate-600"><FolderOpen size={20}/></button>
              <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700">
                  <Save size={18}/> <span className="hidden md:inline">Guardar</span>
              </button>
          </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
          {/* TOOLBAR (Left Desktop / Bottom Mobile) */}
          <div className="bg-white border-r flex flex-col md:w-16 w-full md:h-full h-16 md:flex-col flex-row md:static absolute bottom-0 left-0 z-30 justify-center md:justify-start gap-1 p-1 md:pt-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] md:shadow-none order-2 md:order-1">
              <ToolBtn icon={<MousePointer2 size={20}/>} label="Select" onClick={() => { setSelectedId(null); setShowPropertiesMobile(true); }} active={!selectedId} />
              <ToolBtn icon={<Type size={20}/>} label="Texto" onClick={() => addElement('TEXT')} />
              <ToolBtn icon={<ScanLine size={20}/>} label="Code" onClick={() => addElement('BARCODE')} />
          </div>

          {/* CANVAS AREA */}
          <div className="flex-1 bg-slate-200/50 flex items-center justify-center overflow-hidden relative order-1 md:order-2 p-4 md:p-10 touch-none">
              
              {/* CANVAS WRAPPER (To center scaling) */}
              <div 
                ref={canvasRef}
                className="bg-white shadow-2xl relative transition-shadow"
                style={{
                    width: `${template.width * MM_TO_PX * zoom}px`,
                    height: `${template.height * MM_TO_PX * zoom}px`,
                }}
                onClick={() => { setSelectedId(null); if(window.innerWidth < 768) setShowPropertiesMobile(false); }}
              >
                  {/* GRID BACKGROUND */}
                  <div className="absolute inset-0 pointer-events-none opacity-20" 
                       style={{backgroundImage: 'linear-gradient(#ccc 1px, transparent 1px), linear-gradient(90deg, #ccc 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
                  </div>

                  {elements.map(el => {
                      const isSelected = selectedId === el.id;
                      return (
                          <div
                            key={el.id}
                            onMouseDown={(e) => handleStart(e, el.id)}
                            onTouchStart={(e) => handleStart(e, el.id)}
                            className={`absolute flex items-center justify-center select-none cursor-move
                                ${isSelected ? 'outline outline-2 outline-indigo-600 z-50' : 'z-10 hover:outline hover:outline-1 hover:outline-indigo-300'}`}
                            style={{
                                left: `${el.x * MM_TO_PX * zoom}px`,
                                top: `${el.y * MM_TO_PX * zoom}px`,
                                width: `${el.width * MM_TO_PX * zoom}px`,
                                height: `${el.height * MM_TO_PX * zoom}px`,
                                transform: `rotate(${el.rotation}deg)`,
                                transformOrigin: 'center center', // Rotación desde centro para mejor control
                            }}
                          >
                              {el.type === 'TEXT' ? (
                                  <div style={{
                                      fontSize: `${(el.fontSize || 10) * zoom}pt`,
                                      fontFamily: el.fontFamily,
                                      fontWeight: el.fontWeight,
                                      color: el.color,
                                      textAlign: el.textAlign,
                                      width: '100%',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      pointerEvents: 'none'
                                  }}>
                                      {resolvePreviewText(el)}
                                  </div>
                              ) : (
                                  <img 
                                    src={renderBarcode(el)} 
                                    alt="barcode" 
                                    className="w-full h-full object-fill pointer-events-none"
                                  />
                              )}
                          </div>
                      );
                  })}
              </div>
          </div>

          {/* DESKTOP PROPERTIES (Right Side) */}
          <div className="hidden md:block w-72 bg-white border-l z-20 order-3 shadow-lg">
              <PropertyPanel />
          </div>

          {/* MOBILE PROPERTIES (Bottom Sheet) */}
          {showPropertiesMobile && (
              <div className="md:hidden fixed inset-x-0 bottom-16 bg-white rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)] z-40 max-h-[50vh] overflow-y-auto border-t border-slate-200 animate-slide-up">
                  <div className="sticky top-0 bg-white p-2 flex justify-center border-b mb-2">
                      <div className="w-10 h-1 bg-slate-300 rounded-full"/>
                  </div>
                  <PropertyPanel mobile />
              </div>
          )}
          
          {/* Mobile FAB to show properties if hidden */}
          {!showPropertiesMobile && (
              <button 
                onClick={() => setShowPropertiesMobile(true)}
                className="md:hidden absolute bottom-20 right-4 bg-white p-3 rounded-full shadow-lg border border-slate-200 text-slate-700 z-30"
              >
                  <Settings2 size={24}/>
              </button>
          )}
      </div>

      {/* TEMPLATE LOAD MODAL */}
      {showTemplateModal && (
          <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg">Mis Plantillas</h3>
                      <button onClick={() => setShowTemplateModal(false)}><X/></button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 overflow-y-auto p-1">
                      <button onClick={() => { setTemplate(INITIAL_TEMPLATE); setElements([]); setShowTemplateModal(false); }}
                          className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 min-h-[120px]">
                          <span className="font-bold text-slate-500">+ Nueva</span>
                      </button>
                      {savedTemplates.map(t => (
                          <div key={t.id} onClick={() => { setTemplate(t); setElements(t.elements); setShowTemplateModal(false); }}
                              className="border rounded-xl p-4 hover:shadow-md cursor-pointer bg-slate-50 relative">
                              {t.isDefault && <Star size={16} className="absolute top-2 right-2 text-amber-500" fill="currentColor"/>}
                              <p className="font-bold text-sm truncate">{t.name}</p>
                              <p className="text-xs text-slate-500">{t.width}x{t.height}mm</p>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

const Input = ({ label, value, onChange }: any) => (
    <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase">{label}</label>
        <input type="number" className="w-full p-1.5 border rounded text-sm font-mono" value={value} onChange={e => onChange(e.target.value)} />
    </div>
);

const ToolBtn = ({ icon, label, onClick, active }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 p-2 md:w-full rounded-lg transition-colors ${active ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>
        {icon}
        <span className="text-[9px] font-bold uppercase hidden md:block">{label}</span>
    </button>
);

export default LabelDesigner;
