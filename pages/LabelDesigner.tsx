
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { 
  ArrowLeft, Save, Type, ScanLine, Trash2, 
  AlignLeft, AlignCenter, AlignRight, X, 
  Check, ChevronDown, FileCog,
  QrCode, Image as ImageIcon, Square, Undo2, Redo2,
  ZoomIn, ZoomOut, Layers, Upload, Settings,
  RotateCw, RotateCcw, Move, ArrowUp, ArrowDown,
  Smartphone, Headphones, Database, Shapes, Circle, Minus,
  FileText, Receipt, Table as TableIcon, Eye, Star
} from 'lucide-react';
import Swal from 'sweetalert2';
import { LabelService, InventoryService, SalesService, ClientService } from '../services/api';
import { LabelTemplate, LabelElement } from '../types';

// --- CONSTANTS ---
const MM_TO_PX = 3.7795; // 96 DPI conversion
const HISTORY_LIMIT = 20;

const FONTS = [
    { name: 'Predeterminada', value: 'helvetica' },
    { name: 'Roboto', value: "'Roboto', sans-serif" },
    { name: 'Open Sans', value: "'Open Sans', sans-serif" },
    { name: 'Montserrat', value: "'Montserrat', sans-serif" },
    { name: 'Oswald', value: "'Oswald', sans-serif" },
    { name: 'Playfair', value: "'Playfair Display', serif" },
    { name: 'Courier (Code)', value: "'Courier Prime', monospace" },
];

const PAPER_SIZES = [
    { name: 'Etiqueta Pequeña', w: 50, h: 25 },
    { name: 'Etiqueta Grande', w: 70, h: 40 },
    { name: 'Ticket (80mm)', w: 80, h: 200 }, // Altura variable conceptualmente
    { name: 'Carta (Letter)', w: 216, h: 279 },
    { name: 'A4', w: 210, h: 297 },
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

// --- DATA CONTEXTS ---
const DATA_SOURCES = {
    INVENTORY: {
        label: 'Inventario (Tel/Acc)',
        fields: [
            { label: 'Marca', value: '{{MARCA}}' },
            { label: 'Modelo/Desc', value: '{{MODELO}}' },
            { label: 'Código', value: '{{CODIGO}}' },
            { label: 'IMEI', value: '{{IMEI}}' },
            { label: 'Precio', value: '{{PRECIO}}' },
            { label: 'Color', value: '{{COLOR}}' },
            { label: 'Ubicación', value: '{{UBICACION}}' },
        ]
    },
    SALES: {
        label: 'Ventas / Facturas',
        fields: [
            { label: 'N° Factura', value: '{{FACTURA}}' },
            { label: 'Cliente', value: '{{CLIENTE}}' },
            { label: 'Fecha', value: '{{FECHA}}' },
            { label: 'Total', value: '{{TOTAL}}' },
            { label: 'Vendedor', value: '{{VENDEDOR}}' },
            { label: 'Subtotal', value: '{{SUBTOTAL}}' },
            { label: 'Impuesto', value: '{{ISV}}' },
        ]
    },
    CLIENTS: {
        label: 'Clientes',
        fields: [
            { label: 'Nombre Completo', value: '{{NOMBRE}}' },
            { label: 'Identidad/RTN', value: '{{RTN}}' },
            { label: 'Dirección', value: '{{DIRECCION}}' },
            { label: 'Teléfono', value: '{{TELEFONO}}' },
        ]
    },
    GENERAL: {
        label: 'Datos Generales',
        fields: [
            { label: 'Nombre Empresa', value: '{{EMPRESA}}' },
            { label: 'Fecha Actual', value: '{{FECHA_HOY}}' },
            { label: 'Hora Actual', value: '{{HORA_HOY}}' },
        ]
    }
};

const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// --- EXTERNAL COMPONENT: PropertyInput (Fixed Focus) ---
const PropertyInput = React.memo(({ label, value, onChange, type = "text", step, min, className, disabled, onFocus }: any) => {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => { setLocalValue(value); }, [value]);

    const handleBlur = () => {
        let finalVal = localValue;
        if (type === 'number') {
            finalVal = parseFloat(localValue);
            if (isNaN(finalVal)) finalVal = 0;
        }
        if (finalVal !== value) {
            onChange(finalVal);
        }
    };

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</label>}
            <div className={`flex items-center gap-1 bg-white border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all overflow-hidden h-9 ${disabled ? 'bg-slate-100' : ''}`}>
                <input 
                    type={type}
                    step={step}
                    min={min}
                    disabled={disabled}
                    className="w-full px-2 text-sm font-mono outline-none bg-transparent h-full text-slate-700"
                    value={localValue} 
                    onChange={e => setLocalValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                    onFocus={onFocus}
                />
            </div>
        </div>
    );
});

const ToolbarButton = ({ icon, label, onClick, isActive, colorClass }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 p-2 w-full rounded-xl transition-all active:scale-95 group relative ${isActive ? 'text-indigo-600 bg-indigo-50' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
        <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-white shadow-sm ring-1 ring-indigo-100' : 'bg-transparent'} ${colorClass || ''}`}>
            {icon}
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
    </button>
);

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
  const [showVarModal, setShowVarModal] = useState(false);
  const [showShapeModal, setShowShapeModal] = useState(false);
  
  const [activePanel, setActivePanel] = useState<'TOOLS' | 'LAYERS' | 'SETTINGS' | 'PROPERTIES'>('TOOLS'); 
  const [isMobilePropertiesOpen, setIsMobilePropertiesOpen] = useState(false);
  const [clipboard, setClipboard] = useState<LabelElement | null>(null);

  // Interaction State
  const [interaction, setInteraction] = useState<{
      mode: 'NONE' | 'MOVE' | 'RESIZE' | 'ROTATE';
      startPos: { x: number, y: number };
      elementStart: { x: number, y: number, w: number, h: number, r: number };
      handle?: string; 
  }>({ mode: 'NONE', startPos: {x:0, y:0}, elementStart: {x:0, y:0, w:0, h:0, r:0} });

  const canvasRef = useRef<HTMLDivElement>(null);
  const [pinchDist, setPinchDist] = useState<number | null>(null);

  // Variable Builder State
  const [varBuilderText, setVarBuilderText] = useState('');

  const saveTemplate = async () => {
    try {
        let savedId = template.id;
        if (template.id) {
            await LabelService.update(template.id, template);
        } else {
            const res: any = await LabelService.create(template);
            savedId = res.id;
            setTemplate({ ...template, id: savedId });
        }
        Swal.fire({ icon: 'success', title: 'Diseño Guardado', timer: 1500, showConfirmButton: false });
        loadSavedTemplates();
    } catch (e: any) {
        Swal.fire('Error', e.message, 'error');
    }
  };

  const handleCanvasWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
        e.preventDefault();
        setZoom(z => Math.max(0.5, Math.min(6, z - e.deltaY * 0.01)));
    }
  };

  const getPreviewText = (el: LabelElement) => {
    return el.content || '';
  };

  const LayersPanel = () => (
      <div className="p-4 space-y-2 overflow-y-auto h-full pb-20 md:pb-4 custom-scrollbar">
          <h3 className="font-bold text-slate-800 text-xs uppercase mb-3 flex items-center gap-2"><Layers size={14}/> Capas</h3>
          <div className="space-y-1">
            {[...template.elements].reverse().map((el) => (
                <div key={el.id} 
                     onClick={() => { setSelectedId(el.id); setActivePanel('PROPERTIES'); }}
                     className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border text-sm group ${selectedId === el.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-white hover:bg-slate-50'}`}
                >
                    <span className="text-slate-400">
                        {el.type === 'TEXT' && <Type size={14}/>}
                        {el.type === 'BARCODE' && <ScanLine size={14}/>}
                        {el.type === 'QR' && <QrCode size={14}/>}
                        {el.type === 'IMAGE' && <ImageIcon size={14}/>}
                        {el.type === 'SHAPE' && <Shapes size={14}/>}
                        {el.type === 'DETAIL_TABLE' && <TableIcon size={14}/>}
                    </span>
                    <span className="truncate flex-1 font-medium text-slate-700">{el.content || el.type}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); changeLayerOrder(el.id, 'UP'); }} className="p-1 hover:bg-slate-200 rounded text-slate-500" title="Traer al frente"><ArrowUp size={12}/></button>
                        <button onClick={(e) => { e.stopPropagation(); changeLayerOrder(el.id, 'DOWN'); }} className="p-1 hover:bg-slate-200 rounded text-slate-500" title="Enviar al fondo"><ArrowDown size={12}/></button>
                    </div>
                </div>
            ))}
            {template.elements.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Sin elementos</p>}
          </div>
      </div>
  );

  useEffect(() => {
      loadSavedTemplates();
      handleResize();
      window.addEventListener('resize', handleResize);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
          window.removeEventListener('resize', handleResize);
          window.removeEventListener('keydown', handleKeyDown);
      };
  }, [selectedId, template, clipboard, historyIndex]);

  const handleResize = () => setZoom(window.innerWidth < 768 ? 2.5 : 3.5);

  const loadSavedTemplates = async () => {
      try {
          const data = await LabelService.getAll();
          setSavedTemplates(data || []);
      } catch (e) { console.error(e); }
  };

  // --- KEYBOARD SHORTCUTS ---
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'Delete') { if (selectedId) deleteSelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
          if (selectedId) {
              const el = template.elements.find(x => x.id === selectedId);
              if (el) { setClipboard(el); Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1000 }).fire({ icon: 'info', title: 'Copiado' }); }
          }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
          if (clipboard) {
              const newEl = { ...clipboard, id: generateId(), x: clipboard.x + 2, y: clipboard.y + 2 };
              const newElements = [...template.elements, newEl];
              updateTemplate({ elements: newElements });
              setSelectedId(newEl.id);
          }
      }
      // Nudge logic same as before...
  }, [selectedId, template, clipboard, historyIndex]);

  // --- HISTORY & STATE UPDATES ---
  const addToHistory = (newState: LabelTemplate) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newState)));
      if (newHistory.length > HISTORY_LIMIT) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => { if (historyIndex > 0) { setTemplate(JSON.parse(JSON.stringify(history[historyIndex - 1]))); setHistoryIndex(historyIndex - 1); setSelectedId(null); } };
  const redo = () => { if (historyIndex < history.length - 1) { setTemplate(JSON.parse(JSON.stringify(history[historyIndex + 1]))); setHistoryIndex(historyIndex + 1); setSelectedId(null); } };

  const updateTemplate = (updates: Partial<LabelTemplate>) => {
      const newState = { ...template, ...updates };
      setTemplate(newState);
      addToHistory(newState);
  };

  const updateElement = (id: string, updates: Partial<LabelElement>) => {
      const newElements = template.elements.map(el => el.id === id ? { ...el, ...updates } : el);
      const newState = { ...template, elements: newElements };
      setTemplate(newState);
      if (interaction.mode === 'NONE') addToHistory(newState); 
  };

  // --- ADD ELEMENTS ---
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
          isMultiline: false,
          ...extra
      };

      if (type === 'BARCODE') { newEl.content = '123456'; newEl.width = 30; newEl.height = 10; }
      if (type === 'QR') { newEl.content = 'https://example.com'; newEl.width = 15; newEl.height = 15; }
      if (type === 'SHAPE') { newEl.fill = 'transparent'; newEl.stroke = '#000000'; newEl.strokeWidth = 0.5; if(newEl.shapeType === 'LINE') newEl.height = 0.5; }
      if (type === 'DETAIL_TABLE') { newEl.width = template.width - 10; newEl.height = 30; newEl.content = 'TABLA DE DETALLES (Marcador)'; }

      const newElements = [...template.elements, newEl];
      updateTemplate({ elements: newElements });
      setSelectedId(newEl.id);
      if (window.innerWidth < 768) setIsMobilePropertiesOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => { addElement('IMAGE', { content: reader.result as string, width: 20, height: 20 }); };
          reader.readAsDataURL(file);
      }
  };

  const deleteSelected = () => { if (selectedId) { const newElements = template.elements.filter(e => e.id !== selectedId); updateTemplate({ elements: newElements }); setSelectedId(null); } };
  
  const changeLayerOrder = (id: string, direction: 'UP' | 'DOWN') => {
      const index = template.elements.findIndex(e => e.id === id);
      if (index === -1) return;
      const newElements = [...template.elements];
      if (direction === 'UP' && index < newElements.length - 1) { [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]]; } 
      else if (direction === 'DOWN' && index > 0) { [newElements[index], newElements[index - 1]] = [newElements[index - 1], newElements[index]]; }
      updateTemplate({ elements: newElements });
  };

  // --- RENDER HELPERS ---
  const renderBarcode = (el: LabelElement) => {
      const canvas = document.createElement('canvas');
      try { JsBarcode(canvas, "123456", { format: (el.barcodeFormat as any) || "CODE128", displayValue: el.displayValue, margin: 0, width: 2, height: 50, fontSize: 20 }); return canvas.toDataURL("image/png"); } catch (e) { return ''; }
  };
  const renderQR = (el: LabelElement) => { let url = ''; QRCode.toDataURL(el.content || 'error', { margin: 0 }, (err, u) => { url = u; }); return url; };

  // --- PREVIEW & PRINT ---
  const handlePreview = async () => {
      try {
          // 1. Fetch Mock/Real Data based on context
          let data: any = { 'EMPRESA': 'Mi Empresa S.A.', 'FECHA_HOY': new Date().toLocaleDateString(), 'HORA_HOY': new Date().toLocaleTimeString() };
          
          if (template.dataSource === 'INVENTORY') {
              const res = await InventoryService.getTelefonos(); // Get last added
              if (res && res.length > 0) {
                  const p = res[0];
                  data = { ...data, 'MARCA': p.marca, 'MODELO': p.modelo, 'CODIGO': p.codigo, 'IMEI': p.imei1, 'PRECIO': `L. ${p.precioVenta}`, 'COLOR': 'Negro', 'UBICACION': p.nombreUbicacion || 'Tienda' };
              }
          } else if (template.dataSource === 'SALES') {
              // Mock sales data if API not fully ready with one click
              data = { ...data, 'FACTURA': 'FAC-0001', 'CLIENTE': 'Juan Pérez', 'FECHA': '2023-10-27', 'TOTAL': 'L. 1500.00', 'VENDEDOR': 'Admin', 'SUBTOTAL': 'L. 1300.00', 'ISV': 'L. 200.00' };
          } else if (template.dataSource === 'CLIENTS') {
              const res = await ClientService.getAll();
              if (res && res.length > 0) {
                  const c = res[0];
                  data = { ...data, 'NOMBRE': `${c.nombre} ${c.apellido}`, 'RTN': c.identidad, 'DIRECCION': c.direccion, 'TELEFONO': c.telefono };
              }
          }

          // 2. Generate PDF
          const doc = new jsPDF({ 
              orientation: template.width > template.height ? 'l' : 'p', 
              unit: 'mm', 
              format: [template.width, template.height] 
          });

          template.elements.forEach(el => {
              // Variable Replacement Logic
              let content = el.content || '';
              Object.keys(data).forEach(key => {
                  content = content.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
              });

              if (el.type === 'TEXT') {
                  doc.setFontSize(el.fontSize || 10);
                  doc.setFont(el.fontFamily || 'helvetica', el.fontWeight || 'normal');
                  doc.setTextColor(el.color || '#000000');
                  
                  if (el.isMultiline) {
                      doc.text(content, el.x, el.y + (el.fontSize! * 0.3527), { 
                          maxWidth: el.width, 
                          align: el.textAlign || 'left',
                          lineHeightFactor: el.lineHeight || 1.15
                      });
                  } else {
                      doc.text(content, el.x, el.y + (el.height/2), { angle: el.rotation, align: el.textAlign });
                  }
              } else if (el.type === 'BARCODE' || el.type === 'QR') {
                  // Render dummy image for preview
                  const img = el.type === 'BARCODE' ? renderBarcode(el) : renderQR(el);
                  if(img) doc.addImage(img, 'PNG', el.x, el.y, el.width, el.height);
              } else if (el.type === 'SHAPE') {
                  const style = (el.fill && el.fill !== 'transparent') ? 'FD' : 'S';
                  doc.setDrawColor(el.stroke || '#000000');
                  doc.setLineWidth(el.strokeWidth || 0.2);
                  if (el.fill && el.fill !== 'transparent') doc.setFillColor(el.fill);
                  
                  if (el.shapeType === 'CIRCLE') doc.ellipse(el.x + el.width/2, el.y + el.height/2, el.width/2, el.height/2, style);
                  else if (el.shapeType === 'LINE') doc.line(el.x, el.y + el.height/2, el.x + el.width, el.y + el.height/2);
                  else doc.rect(el.x, el.y, el.width, el.height, style);
              } else if (el.type === 'DETAIL_TABLE') {
                  // Mock Table
                  (doc as any).autoTable({
                      startY: el.y,
                      margin: { left: el.x },
                      tableWidth: el.width,
                      head: [['Cant', 'Producto', 'Precio', 'Total']],
                      body: [
                          ['1', 'Samsung S23', '20000', '20000'],
                          ['2', 'Funda Silicona', '500', '1000'],
                      ],
                      theme: 'plain',
                      styles: { fontSize: 8, cellPadding: 1 }
                  });
              }
          });

          // Open Preview in new window
          window.open(doc.output('bloburl'), '_blank');

      } catch (e: any) { Swal.fire('Error', 'No se pudo generar la vista previa: ' + e.message, 'error'); }
  };

  // --- INTERACTION HANDLERS (POINTER) ---
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, id: string, mode: 'MOVE' | 'RESIZE' | 'ROTATE', handle?: string) => {
      e.stopPropagation(); 
      const el = template.elements.find(x => x.id === id);
      if (!el) return;
      setSelectedId(id);
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setInteraction({ mode, startPos: { x: clientX, y: clientY }, elementStart: { x: el.x, y: el.y, w: el.width, h: el.height, r: el.rotation }, handle });
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (interaction.mode === 'NONE' || !selectedId) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaMmX = (clientX - interaction.startPos.x) / (MM_TO_PX * zoom);
      const deltaMmY = (clientY - interaction.startPos.y) / (MM_TO_PX * zoom);
      
      const elStart = interaction.elementStart;
      let newEl = { ...template.elements.find(x => x.id === selectedId)! };

      if (interaction.mode === 'MOVE') {
          newEl.x = Number((elStart.x + deltaMmX).toFixed(1));
          newEl.y = Number((elStart.y + deltaMmY).toFixed(1));
      } else if (interaction.mode === 'RESIZE' && interaction.handle) {
          if (interaction.handle.includes('e')) newEl.width = Math.max(2, Number((elStart.w + deltaMmX).toFixed(1)));
          if (interaction.handle.includes('s')) newEl.height = Math.max(2, Number((elStart.h + deltaMmY).toFixed(1)));
      } else if (interaction.mode === 'ROTATE') {
          newEl.rotation = (elStart.r + ((clientX - interaction.startPos.x) / 2)) % 360;
      }
      setTemplate(prev => ({ ...prev, elements: prev.elements.map(el => el.id === selectedId ? newEl : el) }));
  };

  const handlePointerUp = () => { if (interaction.mode !== 'NONE') { addToHistory(template); setInteraction({ ...interaction, mode: 'NONE' }); } };

  // --- PANELS ---
  
  const SettingsPanel = () => (
      <div className="p-4 space-y-4">
          <h3 className="font-bold text-slate-800 text-xs uppercase mb-3 flex items-center gap-2"><Settings size={14}/> Configuración General</h3>
          
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
              <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Tipo Documento</label>
                  <select className="w-full p-2 border rounded-lg text-sm mt-1" value={template.type || 'LABEL'} onChange={e => setTemplate({...template, type: e.target.value as any})}>
                      <option value="LABEL">Etiqueta (Label)</option>
                      <option value="INVOICE">Factura / Recibo</option>
                      <option value="REPORT">Reporte</option>
                  </select>
              </div>
              
              <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Fuente de Datos (Contexto)</label>
                  <select className="w-full p-2 border rounded-lg text-sm mt-1" value={template.dataSource || 'NONE'} onChange={e => setTemplate({...template, dataSource: e.target.value as any})}>
                      <option value="NONE">Ninguno (Diseño Libre)</option>
                      <option value="INVENTORY">Inventario (Productos)</option>
                      <option value="SALES">Ventas (Facturas)</option>
                      <option value="CLIENTS">Clientes</option>
                  </select>
              </div>

              <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Tamaño Página</label>
                  <select className="w-full p-2 border rounded-lg text-sm mt-1" onChange={e => {
                      const size = PAPER_SIZES.find(s => s.name === e.target.value);
                      if(size) setTemplate({...template, width: size.w, height: size.h});
                  }}>
                      <option value="">Personalizado...</option>
                      {PAPER_SIZES.map(s => <option key={s.name} value={s.name}>{s.name} ({s.w}x{s.h}mm)</option>)}
                  </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                  <PropertyInput label="Ancho (mm)" value={template.width} onChange={(v:any) => setTemplate({...template, width: v})} type="number"/>
                  <PropertyInput label="Alto (mm)" value={template.height} onChange={(v:any) => setTemplate({...template, height: v})} type="number"/>
              </div>
          </div>
          
          <button onClick={handlePreview} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-md">
              <Eye size={16}/> Vista Previa con Datos
          </button>
      </div>
  );

  const PropertiesPanel = () => {
      const sel = template.elements.find(e => e.id === selectedId);
      if (!sel) return <div className="p-8 text-center text-slate-400"><Move size={48} className="mx-auto mb-2 opacity-20"/>Selecciona un elemento</div>;

      return (
          <div className="space-y-5 p-4 overflow-y-auto h-full pb-20 md:pb-4 custom-scrollbar">
              <div className="flex justify-between items-center pb-2 border-b">
                  <span className="font-bold text-xs uppercase bg-slate-100 px-2 py-1 rounded">{sel.type}</span>
                  <button onClick={deleteSelected} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
              </div>

              {/* Geometry */}
              <div className="grid grid-cols-2 gap-2">
                  <PropertyInput label="X" value={sel.x} onChange={(v:any) => updateElement(sel.id, {x:v})} type="number" />
                  <PropertyInput label="Y" value={sel.y} onChange={(v:any) => updateElement(sel.id, {y:v})} type="number" />
                  <PropertyInput label="Ancho" value={sel.width} onChange={(v:any) => updateElement(sel.id, {width:v})} type="number" />
                  <PropertyInput label="Alto" value={sel.height} onChange={(v:any) => updateElement(sel.id, {height:v})} type="number" />
              </div>

              {/* Text / Content */}
              {(sel.type === 'TEXT' || sel.type === 'BARCODE' || sel.type === 'QR') && (
                  <div>
                      <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Contenido</label>
                          <button onClick={() => { setVarBuilderText(sel.content); setShowVarModal(true); }} className="text-[10px] text-indigo-600 font-bold hover:underline bg-indigo-50 px-2 py-0.5 rounded">
                              + Variables
                          </button>
                      </div>
                      <textarea 
                          className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono" 
                          rows={3} 
                          value={sel.content} 
                          onChange={e => updateElement(sel.id, {content: e.target.value})}
                      />
                  </div>
              )}

              {/* Text Advanced */}
              {sel.type === 'TEXT' && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase">Estilo de Texto</h4>
                      <div className="flex gap-2">
                          <select className="flex-1 p-1.5 border rounded text-sm" value={sel.fontFamily} onChange={e => updateElement(sel.id, {fontFamily: e.target.value})}>
                              {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
                          </select>
                          <PropertyInput value={sel.fontSize} onChange={(v:any) => updateElement(sel.id, {fontSize:v})} type="number" className="w-16"/>
                      </div>
                      
                      <div className="flex gap-2 items-center">
                          <button onClick={() => updateElement(sel.id, {fontWeight: sel.fontWeight === 'bold' ? 'normal' : 'bold'})} className={`p-2 border rounded ${sel.fontWeight === 'bold' ? 'bg-slate-800 text-white' : 'bg-white'}`}>B</button>
                          <div className="flex bg-white rounded border overflow-hidden flex-1">
                              {['left','center','right'].map((a:any) => (
                                  <button key={a} onClick={() => updateElement(sel.id, {textAlign: a})} className={`flex-1 p-1.5 flex justify-center hover:bg-slate-50 ${sel.textAlign === a ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>
                                      {a==='left'?<AlignLeft size={14}/>:a==='center'?<AlignCenter size={14}/>:<AlignRight size={14}/>}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="space-y-2">
                          <div className="flex items-center gap-2">
                              <input type="checkbox" checked={sel.isMultiline || false} onChange={e => updateElement(sel.id, {isMultiline: e.target.checked})} />
                              <label className="text-xs font-medium">Permitir Múltiples Líneas (Ajuste)</label>
                          </div>
                          {sel.isMultiline && (
                              <PropertyInput label="Interlineado" value={sel.lineHeight || 1.15} onChange={(v:any) => updateElement(sel.id, {lineHeight:v})} type="number" step={0.1}/>
                          )}
                      </div>
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden font-sans" onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}>
        
        {/* --- HEADER --- */}
        <header className="bg-white border-b h-14 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm">
            <div className="flex items-center gap-2 w-1/3">
                <button onClick={() => navigate(-1)} className="hover:bg-slate-100 p-2 rounded-full text-slate-600"><ArrowLeft size={20}/></button>
                <div className="hidden md:flex gap-1 border-l pl-2 ml-2">
                    <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Undo2 size={18}/></button>
                    <button onClick={redo} disabled={historyIndex >= history.length-1} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Redo2 size={18}/></button>
                </div>
            </div>
            <div className="flex-1 flex justify-center">
                <input className="text-center font-bold text-slate-800 bg-transparent hover:bg-slate-50 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 text-sm md:text-base" value={template.name} onChange={e => setTemplate({...template, name: e.target.value})} placeholder="Nombre del Diseño" />
            </div>
            <div className="w-1/3 flex justify-end gap-2">
                <button onClick={() => setShowTemplatesModal(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg md:flex hidden items-center gap-2"><Settings size={18}/> <span className="text-xs font-bold">Abrir</span></button>
                <button onClick={saveTemplate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm flex items-center gap-2 text-xs md:text-sm"><Save size={16}/> <span className="hidden md:inline">Guardar</span></button>
            </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
            {/* --- LEFT TOOLBAR --- */}
            <aside className="hidden md:flex w-20 bg-white border-r flex-col items-center py-4 gap-3 z-20 shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
                <ToolbarButton icon={<Type/>} label="Texto" onClick={() => addElement('TEXT')}/>
                <ToolbarButton icon={<ScanLine/>} label="Código" onClick={() => addElement('BARCODE')}/>
                <ToolbarButton icon={<QrCode/>} label="QR" onClick={() => addElement('QR')}/>
                <ToolbarButton icon={<Shapes/>} label="Forma" onClick={() => setShowShapeModal(true)}/>
                <ToolbarButton icon={<ImageIcon/>} label="Imagen" onClick={() => fileInputRef.current?.click()}/>
                {template.type === 'INVOICE' && <ToolbarButton icon={<TableIcon/>} label="Tabla" onClick={() => addElement('DETAIL_TABLE')} colorClass="text-purple-600 bg-purple-50"/>}
                <div className="h-px w-10 bg-slate-200 my-1"/>
                <ToolbarButton icon={<FileCog/>} label="Config" isActive={activePanel === 'SETTINGS'} onClick={() => { setActivePanel('SETTINGS'); setSelectedId(null); }}/>
                <ToolbarButton icon={<Layers/>} label="Capas" isActive={activePanel === 'LAYERS'} onClick={() => setActivePanel('LAYERS')}/>
            </aside>

            {/* --- CANVAS --- */}
            <main className="flex-1 bg-slate-200/50 overflow-hidden relative flex items-center justify-center p-8 touch-none" onWheel={handleCanvasWheel} onClick={() => { setSelectedId(null); if(activePanel === 'PROPERTIES') setActivePanel('TOOLS'); }}>
                <div className="absolute bottom-6 left-6 flex flex-col gap-2 bg-white p-1 rounded-lg shadow-lg border z-10">
                    <button onClick={() => setZoom(z => Math.min(z + 0.5, 6))} className="p-2 hover:bg-slate-100 rounded text-slate-600"><ZoomIn size={20}/></button>
                    <div className="text-[10px] font-bold text-slate-400 text-center py-1 border-y">{Math.round(zoom*100/3.7795)}%</div>
                    <button onClick={() => setZoom(z => Math.max(z - 0.5, 1))} className="p-2 hover:bg-slate-100 rounded text-slate-600"><ZoomOut size={20}/></button>
                </div>

                <div ref={canvasRef} className="bg-white shadow-2xl relative transition-all duration-100" style={{ width: `${template.width * MM_TO_PX * zoom}px`, height: `${template.height * MM_TO_PX * zoom}px` }} onClick={(e) => e.stopPropagation()}>
                    <div className="absolute -top-6 left-0 text-xs font-bold text-slate-400 select-none">{template.width}mm x {template.height}mm ({template.type})</div>
                    <div className="absolute inset-0 pointer-events-none opacity-20" style={{backgroundImage: 'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)', backgroundSize: `${5*MM_TO_PX*zoom}px ${5*MM_TO_PX*zoom}px`}}></div>

                    {template.elements.map(el => {
                        const isSelected = selectedId === el.id;
                        return (
                            <div key={el.id} 
                                onMouseDown={(e) => handlePointerDown(e, el.id, 'MOVE')}
                                className={`absolute group select-none cursor-move ${isSelected ? 'z-50' : 'z-10 hover:outline hover:outline-1 hover:outline-indigo-300'}`}
                                style={{
                                    left: `${el.x * MM_TO_PX * zoom}px`,
                                    top: `${el.y * MM_TO_PX * zoom}px`,
                                    width: `${el.width * MM_TO_PX * zoom}px`,
                                    height: `${el.height * MM_TO_PX * zoom}px`,
                                    transform: `rotate(${el.rotation}deg)`,
                                }}
                                onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); if(window.innerWidth < 768) setIsMobilePropertiesOpen(true); setActivePanel('PROPERTIES'); }}
                            >
                                <div className="w-full h-full overflow-hidden flex items-center justify-center relative" style={{
                                    border: (el.type === 'SHAPE' && el.shapeType !== 'LINE') ? `${(el.strokeWidth || 0) * zoom}px solid ${el.stroke}` : 'none',
                                    borderRadius: el.shapeType === 'CIRCLE' ? '50%' : '0',
                                    backgroundColor: el.type === 'SHAPE' ? el.fill : 'transparent',
                                    opacity: el.type === 'DETAIL_TABLE' ? 0.7 : 1
                                }}>
                                    {el.type === 'TEXT' && (
                                        <div style={{
                                            fontSize: `${(el.fontSize || 10) * zoom}pt`,
                                            fontFamily: el.fontFamily || 'helvetica',
                                            fontWeight: el.fontWeight,
                                            color: el.color,
                                            textAlign: el.textAlign,
                                            lineHeight: el.lineHeight || 1.15,
                                            width: '100%', height: '100%',
                                            whiteSpace: el.isMultiline ? 'pre-wrap' : 'nowrap',
                                            overflow: 'hidden'
                                        }}>
                                            {getPreviewText(el)}
                                        </div>
                                    )}
                                    {el.type === 'BARCODE' && <img src={renderBarcode(el)} className="w-full h-full object-fill pointer-events-none"/>}
                                    {el.type === 'QR' && <img src={renderQR(el)} className="w-full h-full object-contain pointer-events-none"/>}
                                    {el.type === 'IMAGE' && <img src={el.content} className="w-full h-full object-contain pointer-events-none"/>}
                                    {el.type === 'SHAPE' && el.shapeType === 'LINE' && <div style={{width:'100%', height:`${(el.strokeWidth || 1)*zoom}px`, backgroundColor: el.stroke}}></div>}
                                    {el.type === 'DETAIL_TABLE' && (
                                        <div className="w-full h-full border-2 border-dashed border-purple-400 bg-purple-50 flex items-center justify-center flex-col text-purple-600">
                                            <TableIcon size={24*zoom/3}/>
                                            <span className="text-[10px] font-bold mt-1" style={{fontSize:`${10*zoom/3}px`}}>TABLA DETALLE</span>
                                        </div>
                                    )}
                                </div>
                                {isSelected && (
                                    <>
                                        <div className="absolute inset-0 border-2 border-indigo-600 pointer-events-none"/>
                                        <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-nwse-resize shadow-md" onMouseDown={(e) => handlePointerDown(e, el.id, 'RESIZE', 'se')}/>
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
                                            <div className="w-px h-4 bg-indigo-600"></div>
                                            <div className="w-5 h-5 bg-white border border-indigo-600 rounded-full cursor-grab flex items-center justify-center shadow-sm" onMouseDown={(e) => handlePointerDown(e, el.id, 'ROTATE')}><RefreshCwIcon size={10} className="text-indigo-600"/></div>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </main>

            {/* --- RIGHT PANEL --- */}
            <aside className="hidden md:block w-80 bg-white border-l z-20 shadow-lg flex flex-col">
                <div className="p-3 border-b flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                        {activePanel === 'LAYERS' ? 'Capas' : activePanel === 'SETTINGS' ? 'Configuración' : 'Propiedades'}
                    </h3>
                    <div className="flex gap-1">
                        {selectedId && <button onClick={() => setActivePanel('PROPERTIES')} className={`p-1.5 rounded ${activePanel === 'PROPERTIES' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`}><Settings size={14}/></button>}
                        <button onClick={() => setActivePanel('LAYERS')} className={`p-1.5 rounded ${activePanel === 'LAYERS' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`}><Layers size={14}/></button>
                    </div>
                </div>
                <div className="flex-1 overflow-hidden relative">
                    {activePanel === 'SETTINGS' && <SettingsPanel />}
                    {activePanel === 'LAYERS' && <LayersPanel />}
                    {(activePanel === 'PROPERTIES' || activePanel === 'TOOLS') && <PropertiesPanel />}
                </div>
            </aside>
        </div>

        {/* --- MODAL VARIABLES (EXPRESSION BUILDER) --- */}
        {showVarModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg">Constructor de Contenido</h3>
                        <button onClick={() => setShowVarModal(false)}><X/></button>
                    </div>
                    
                    <div className="mb-4">
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Previsualización Expresión</label>
                        <textarea 
                            className="w-full p-3 border-2 border-indigo-100 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none text-lg font-mono" 
                            rows={3}
                            value={varBuilderText}
                            onChange={e => setVarBuilderText(e.target.value)}
                            placeholder="Escribe texto o selecciona variables..."
                        />
                        <p className="text-xs text-slate-400 mt-1">Ejemplo: Marca: {'{{MARCA}}'} - {'{{MODELO}}'}</p>
                    </div>

                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar border-t pt-4">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Variables Disponibles ({DATA_SOURCES[template.dataSource as keyof typeof DATA_SOURCES]?.label || 'General'})</p>
                        <div className="flex flex-wrap gap-2">
                            {(DATA_SOURCES[template.dataSource as keyof typeof DATA_SOURCES]?.fields || DATA_SOURCES.GENERAL.fields).map(field => (
                                <button 
                                    key={field.value}
                                    onClick={() => setVarBuilderText(prev => prev + (prev.length > 0 && !prev.endsWith(' ') ? ' ' : '') + field.value)}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border rounded-lg text-xs font-bold transition-colors"
                                >
                                    {field.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-6 flex gap-2">
                        <button onClick={() => setShowVarModal(false)} className="flex-1 py-3 bg-slate-100 font-bold rounded-xl text-slate-600">Cancelar</button>
                        <button onClick={() => { if(selectedId) updateElement(selectedId, {content: varBuilderText}); setShowVarModal(false); }} className="flex-1 py-3 bg-indigo-600 font-bold rounded-xl text-white shadow-lg">Aplicar</button>
                    </div>
                </div>
            </div>
        )}

        {/* --- MODAL SHAPES (EXISTING) --- */}
        {showShapeModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-2xl">
                    <h3 className="font-bold text-lg mb-4">Elegir Forma</h3>
                    <div className="grid grid-cols-3 gap-4">
                        <button onClick={() => { addElement('SHAPE', {shapeType:'RECTANGLE'}); setShowShapeModal(false); }} className="flex flex-col items-center gap-2 p-3 hover:bg-slate-50 rounded-xl border"><Square size={32}/><span className="text-xs font-bold">Rect.</span></button>
                        <button onClick={() => { addElement('SHAPE', {shapeType:'CIRCLE'}); setShowShapeModal(false); }} className="flex flex-col items-center gap-2 p-3 hover:bg-slate-50 rounded-xl border"><Circle size={32}/><span className="text-xs font-bold">Círculo</span></button>
                        <button onClick={() => { addElement('SHAPE', {shapeType:'LINE'}); setShowShapeModal(false); }} className="flex flex-col items-center gap-2 p-3 hover:bg-slate-50 rounded-xl border"><Minus size={32}/><span className="text-xs font-bold">Línea</span></button>
                    </div>
                    <button onClick={() => setShowShapeModal(false)} className="mt-4 w-full py-2 bg-slate-100 rounded-lg font-bold text-slate-600">Cancelar</button>
                </div>
            </div>
        )}

        {/* --- MODAL TEMPLATES (EXISTING) --- */}
        {showTemplatesModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col shadow-2xl">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-xl text-slate-800">Mis Diseños</h3>
                        <button onClick={() => setShowTemplatesModal(false)}><X/></button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 overflow-y-auto p-1 custom-scrollbar">
                        <button onClick={() => { setTemplate(INITIAL_TEMPLATE); setHistory([]); setShowTemplatesModal(false); }} className="border-2 border-dashed border-indigo-200 bg-indigo-50/50 rounded-xl p-4 flex flex-col items-center justify-center gap-3 hover:bg-indigo-50 min-h-[140px] text-indigo-600 font-bold"><Upload size={20}/> Nuevo Diseño</button>
                        {savedTemplates.map(t => (
                            <div key={t.id} onClick={() => { setTemplate(t); setHistory([]); setShowTemplatesModal(false); }} className="border border-slate-200 rounded-xl p-4 hover:shadow-lg cursor-pointer bg-white relative group">
                                {t.isDefault && <div className="absolute top-2 right-2 text-amber-500"><Star size={16} fill="currentColor"/></div>}
                                <div className="aspect-[2/1] bg-slate-100 rounded mb-3 flex items-center justify-center"><FileCog className="text-slate-300"/></div>
                                <p className="font-bold text-slate-700 text-sm truncate">{t.name}</p>
                                <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{t.type}</span>
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

const RefreshCwIcon = ({size, className}:any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
);

export default LabelDesigner;
