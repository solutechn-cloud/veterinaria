
import React, { useState, useEffect, useRef } from 'react';
// Fix: Use namespace import to bypass missing named export errors in certain environments
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate } = ReactRouterDOM as any;
import {
  ArrowLeft, Save, Undo2, Redo2, Plus, Star, FileCog, Type, ScanLine, Shapes, Settings, ChevronDown, MoreVertical, X, Square, Circle, Minus,
  Layers, Search, Database, Table, ChevronRight, Key, GripVertical, FileText, Tag, ChevronUp, Image as ImageIcon, Hand, Trash2, MousePointer2,
  Printer, Eye, EyeOff, Copy, Download, Upload, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterHorizontal, AlignEndVertical,
  AlignStartHorizontal, AlignVerticalJustifyCenter, AlignEndHorizontal, Clipboard, Keyboard
} from 'lucide-react';
import { printTemplate, downloadHTML } from '../services/TemplateRenderer';
import PreviewModal from '../components/LabelDesigner/PreviewModal';
import TemplateThumbnail from '../components/LabelDesigner/TemplateThumbnail';
import { STARTER_TEMPLATES, StarterTemplateEntry } from '../services/StarterTemplates';
import Swal from 'sweetalert2';
import { LabelService } from '../services/api';
import { LabelTemplate } from '../types';
import { useLabelDesigner } from '../hooks/useLabelDesigner';
import DesignerCanvas from '../components/LabelDesigner/DesignerCanvas';
import DesignerProperties from '../components/LabelDesigner/DesignerProperties';
import DesignerToolbar from '../components/LabelDesigner/DesignerToolbar';

// --- COMPONENT: Recursive Schema Node ---
const SchemaNode = ({ table, path, schema, onSelect, level = 0 }: any) => {
    const [expanded, setExpanded] = useState(false);
    const tableDef = schema[table];
    
    if (!tableDef) return null;

    return (
        <div style={{ marginLeft: level * 12 }} className="border-l border-slate-200 pl-1 mt-1">
            <button 
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 p-2 w-full hover:bg-slate-100 rounded text-left"
            >
                {expanded ? <ChevronDown size={14} className="text-slate-400"/> : <ChevronRight size={14} className="text-slate-400"/>}
                <span className="font-bold text-slate-700 text-xs uppercase flex items-center gap-1">
                    {level === 0 ? <Table size={14} className="text-indigo-500"/> : <Key size={12} className="text-amber-500"/>}
                    {table}
                </span>
            </button>

            {expanded && (
                <div className="pl-4">
                    <div className="grid grid-cols-2 gap-1 mb-2">
                        {tableDef.columns.map((col: any) => (
                            <button 
                                key={col.name}
                                onClick={() => onSelect(`${path}.${col.name}`)}
                                className="flex items-center gap-2 p-1.5 hover:bg-indigo-50 rounded text-left group transition-all"
                            >
                                <div className="w-4 h-4 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-[8px] font-bold group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                    {col.type === 'integer' || col.type === 'numeric' ? '#' : 'T'}
                                </div>
                                <span className="text-[10px] font-medium text-slate-600 group-hover:text-indigo-700 truncate">{col.name}</span>
                            </button>
                        ))}
                    </div>
                    {tableDef.relations.map((rel: any) => (
                        <SchemaNode 
                            key={rel.foreignTable}
                            table={rel.foreignTable}
                            path={`${path}.${rel.foreignTable}`}
                            schema={schema}
                            onSelect={onSelect}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// --- MAIN COMPONENT ---
const LabelDesigner: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<'GALLERY' | 'DESIGNER'>('GALLERY');
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryFilter, setGalleryFilter] = useState<'ALL' | 'LABEL' | 'DOCUMENT'>('ALL');
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDesignName, setNewDesignName] = useState('');
  const [selectedType, setSelectedType] = useState<'LABEL' | 'DOCUMENT' | null>(null);
  
  // Custom Hook
  const {
      template, setTemplate,
      selectedId, setSelectedId,
      selectedIds, setSelectedIds,
      zoom, setZoom,
      tool, setTool, pan, setPan,
      history: editHistory, historyIndex,
      dbSchema,
      loadTemplate, createNew,
      undo, redo,
      addElement, updateElement, deleteSelected, updateTemplate,
      saveTemplate, moveLayer, reorderElements,
      alignElements, distributeH,
      interaction, unitLabel,
      handlePointerDown, handlePointerMove, handlePointerUp,
      snapGuides
  } = useLabelDesigner();

  const [activePanel, setActivePanel] = useState<'PROPERTIES' | 'LAYERS'>('PROPERTIES');
  const [isMobilePropOpen, setIsMobilePropOpen] = useState(false);
  const [showVarModal, setShowVarModal] = useState(false);
  const [showShapeModal, setShowShapeModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedStarter, setSelectedStarter] = useState<StarterTemplateEntry | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string } | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = (id: string) => {
    setEditingId(id);
    setSelectedId(id);
  };
  const handleCommitEdit = (id: string, value: string) => {
    updateElement(id, { content: value });
    setEditingId(null);
  };

  const handleContextMenu = (e: React.MouseEvent, elementId: string) => {
    setSelectedId(elementId);
    setContextMenu({ x: e.clientX, y: e.clientY, elementId });
  };

  const closeContextMenu = () => setContextMenu(null);

  // Drag and Drop
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  useEffect(() => {
    loadSavedList();
    // Load Google Fonts for the designer canvas preview
    const id = 'gfonts-designer';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&family=Poppins:wght@400;600;700&family=Playfair+Display:wght@400;700&family=Raleway:wght@400;700&family=Oswald:wght@400;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  // Auto-save draft to localStorage
  useEffect(() => {
    if (view !== 'DESIGNER' || !template.name || template.name === 'Nuevo Diseño') return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('ld_autosave', JSON.stringify({ template, savedAt: Date.now() }));
        setLastAutoSave(new Date());
      } catch { /* ignore if localStorage full */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [template, view]);

  useEffect(() => {
    if (view !== 'DESIGNER') return;
    const raw = localStorage.getItem('ld_autosave');
    if (!raw) return;
    try {
      const { template: saved, savedAt } = JSON.parse(raw);
      // Only offer to restore if it's a different template or unsaved (no id)
      if (saved && !template.id && saved.id && saved.name !== 'Nuevo Diseño') {
        const age = Math.round((Date.now() - savedAt) / 60000);
        Swal.fire({
          title: 'Borrador encontrado',
          text: `"${saved.name}" guardado hace ${age} min. ¿Restaurar?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Restaurar',
          cancelButtonText: 'Descartar',
          confirmButtonColor: '#4f46e5',
        }).then(r => {
          if (r.isConfirmed) { loadTemplate(saved); }
          else { localStorage.removeItem('ld_autosave'); }
        });
      }
    } catch { /* ignore */ }
  }, [view]);

  const loadSavedList = async () => {
      try {
          const data = await LabelService.getAll();
          setSavedTemplates(data || []);
      } catch (e) { console.error(e); }
  };

  const initCreation = () => {
      if(!newDesignName || newDesignName.trim() === '' || !selectedType) return;

      if (selectedStarter) {
          // Load a pre-built starter template
          loadTemplate({
              ...selectedStarter.template,
              id: '',
              name: newDesignName,
          } as any);
      } else {
          createNew(selectedType, newDesignName);
      }
      setShowCreateModal(false);
      setView('DESIGNER');
      setNewDesignName('');
      setSelectedType(null);
      setSelectedStarter(null);
  };

  const handleOpen = (t: LabelTemplate) => {
      loadTemplate(t);
      setView('DESIGNER');
  };

  const handleDeleteTemplate = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation(); // Prevent opening the design
      const result = await Swal.fire({
          title: '¿Eliminar diseño?',
          text: 'Esta acción no se puede deshacer',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, eliminar',
          confirmButtonColor: '#d33',
          cancelButtonText: 'Cancelar'
      });

      if (result.isConfirmed) {
          try {
              await LabelService.delete(id);
              Swal.fire('Eliminado', '', 'success');
              loadSavedList();
          } catch (err: any) {
              Swal.fire('Error', err.message, 'error');
          }
      }
  };

  const handleDuplicateTemplate = async (e: React.MouseEvent, t: LabelTemplate) => {
      e.stopPropagation();
      try {
          const { id, ...rest } = t;
          await LabelService.create({ ...rest, name: `Copia de ${rest.name}`, isDefault: false });
          Swal.fire({ icon: 'success', title: 'Duplicado', toast: true, position: 'bottom-end', timer: 2000, showConfirmButton: false });
          loadSavedList();
      } catch (err: any) {
          Swal.fire('Error', err.message, 'error');
      }
  };

  const handleExportTemplate = (e: React.MouseEvent, t: LabelTemplate) => {
      e.stopPropagation();
      const json = JSON.stringify(t, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t.name.replace(/[^a-z0-9]/gi, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const handleImportTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
          try {
              const parsed = JSON.parse(reader.result as string) as LabelTemplate;
              if (!parsed.elements || !parsed.width || !parsed.height) {
                  Swal.fire('Error', 'El archivo no es una plantilla válida', 'error');
                  return;
              }
              loadTemplate({ ...parsed, id: '', name: `Importado: ${parsed.name}` });
              setView('DESIGNER');
              Swal.fire({ icon: 'success', title: 'Plantilla importada', toast: true, position: 'bottom-end', timer: 2000, showConfirmButton: false });
          } catch {
              Swal.fire('Error', 'No se pudo leer el archivo JSON', 'error');
          }
          e.target.value = '';
      };
      reader.readAsText(file);
  };

  const handleSave = async () => {
      const success = await saveTemplate();
      if(success) loadSavedList();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => addElement('IMAGE', { content: reader.result as string });
          reader.readAsDataURL(file);
      }
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, position: number) => { dragItem.current = position; };
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, position: number) => { dragOverItem.current = position; };
  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
        reorderElements(dragItem.current, dragOverItem.current);
    }
    dragItem.current = null; dragOverItem.current = null;
  };

  // Validación Reactiva
  const hasName = newDesignName.trim().length > 0;
  const hasType = selectedType !== null;
  const isFormValid = hasName && hasType;

  // --- VIEWS ---

  if (view === 'GALLERY') {
      return (
          <div className="min-h-screen bg-slate-50 p-6 md:p-10">
              <div className="max-w-6xl mx-auto">
                  <div className="flex justify-between items-center mb-8">
                      <div>
                          <h1 className="text-3xl font-bold text-slate-800">Mis Diseños</h1>
                          <p className="text-slate-500">Etiquetas y Documentos</p>
                      </div>
                      <div className="flex items-center gap-2">
                          <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImportTemplate}/>
                          <button onClick={() => importInputRef.current?.click()} className="border border-slate-300 hover:border-indigo-400 bg-white text-slate-600 hover:text-indigo-600 px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold transition-all">
                              <Upload size={16}/> Importar
                          </button>
                          <button onClick={() => setShowCreateModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 font-bold transition-all hover:scale-105">
                              <Plus size={20}/> Nuevo Diseño
                          </button>
                      </div>
                  </div>

                  {/* Search + Filter bar */}
                  <div className="flex flex-col sm:flex-row gap-3 mb-6">
                      <div className="relative flex-1">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                          <input
                              value={gallerySearch}
                              onChange={e => setGallerySearch(e.target.value)}
                              placeholder="Buscar diseño..."
                              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 transition-colors"
                          />
                      </div>
                      <div className="flex gap-1">
                          {(['ALL', 'LABEL', 'DOCUMENT'] as const).map(f => (
                              <button key={f} onClick={() => setGalleryFilter(f)}
                                  className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${galleryFilter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                                  {f === 'ALL' ? `Todos (${savedTemplates.length})` : f === 'LABEL' ? 'Etiquetas' : 'Documentos'}
                              </button>
                          ))}
                      </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {savedTemplates
                          .filter(t => galleryFilter === 'ALL' || t.type === galleryFilter)
                          .filter(t => !gallerySearch || t.name.toLowerCase().includes(gallerySearch.toLowerCase()))
                          .map(t => (
                          <div key={t.id} onClick={() => handleOpen(t)} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all cursor-pointer group overflow-hidden relative flex flex-col">

                              {/* ── Thumbnail preview area ── */}
                              <div className="flex-1 bg-slate-100 relative overflow-hidden min-h-[160px]">
                                  <TemplateThumbnail template={t} />

                                  {/* Action buttons (visible on hover) */}
                                  <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                          onClick={(e) => handleDuplicateTemplate(e, t)}
                                          className="p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full shadow-md transition-all hover:scale-110"
                                          title="Duplicar"
                                      >
                                          <Copy size={13}/>
                                      </button>
                                      <button
                                          onClick={(e) => handleExportTemplate(e, t)}
                                          className="p-2 bg-teal-500 hover:bg-teal-600 text-white rounded-full shadow-md transition-all hover:scale-110"
                                          title="Exportar JSON"
                                      >
                                          <Download size={13}/>
                                      </button>
                                      <button
                                          onClick={(e) => handleDeleteTemplate(e, t.id)}
                                          className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-md transition-all hover:scale-110"
                                          title="Eliminar"
                                      >
                                          <Trash2 size={13}/>
                                      </button>
                                  </div>

                                  {/* Default badge */}
                                  {t.isDefault && (
                                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-400/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                                          <Star size={10} className="fill-white"/>
                                          <span>PREDETER.</span>
                                      </div>
                                  )}

                                  {/* Type badge bottom-right */}
                                  <div className={`absolute bottom-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shadow-sm ${t.type==='LABEL'?'bg-indigo-600 text-white':'bg-purple-600 text-white'}`}>
                                      {t.type === 'LABEL' ? 'Etiqueta' : 'Documento'}
                                  </div>
                              </div>

                              {/* ── Card footer ── */}
                              <div className="p-3 border-t border-slate-100">
                                  <h3 className="font-bold text-slate-700 group-hover:text-indigo-600 truncate text-sm">{t.name}</h3>
                                  <div className="flex justify-between items-center mt-1 text-xs">
                                      <span className="text-slate-400">{t.width}×{t.height} {t.type==='DOCUMENT'?'cm':'mm'}</span>
                                      <span className="text-slate-400 uppercase">{t.category || '—'}</span>
                                  </div>
                              </div>
                          </div>
                      ))}

                      {/* Empty state */}
                      {savedTemplates.length === 0 && (
                          <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                              <FileText size={48} strokeWidth={1} className="mb-4 text-slate-300"/>
                              <p className="text-lg font-bold text-slate-500">No tienes diseños aún</p>
                              <p className="text-sm mt-1">Haz clic en "Nuevo Diseño" para empezar</p>
                          </div>
                      )}
                  </div>
              </div>

              {/* CREATE MODAL (Mismo código anterior) */}
              {showCreateModal && (
                  <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in">
                          <h3 className="text-xl font-bold text-slate-800 mb-4">Crear Nuevo Diseño</h3>
                          <div className="mb-6">
                              <input 
                                  className={`w-full p-3 border rounded-xl outline-none focus:ring-2 transition-all ${(!hasName && newDesignName !== '') ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-indigo-500'}`} 
                                  placeholder="Nombre del diseño..."
                                  value={newDesignName}
                                  onChange={e => setNewDesignName(e.target.value)}
                                  autoFocus
                              />
                              {!hasName && newDesignName === '' && <p className="text-xs text-slate-400 mt-1 ml-1">* Requerido</p>}
                          </div>
                          {/* Type selector */}
                          <div className="grid grid-cols-2 gap-4 mb-5">
                              <button
                                  onClick={() => { setSelectedType('LABEL'); setSelectedStarter(null); }}
                                  className={`p-4 border-2 rounded-xl transition-all text-left ${selectedType === 'LABEL' && !selectedStarter ? 'border-indigo-600 bg-indigo-50 shadow-md ring-2 ring-indigo-500/50' : 'border-slate-100 hover:border-indigo-300'}`}
                              >
                                  <Tag className={`${selectedType === 'LABEL' && !selectedStarter ? 'text-indigo-600' : 'text-slate-400'} mb-2`} size={28}/>
                                  <h4 className="font-bold text-slate-800">Etiqueta</h4>
                                  <p className="text-xs text-slate-500 mt-1">Códigos de barra, precios (mm).</p>
                              </button>
                              <button
                                  onClick={() => { setSelectedType('DOCUMENT'); setSelectedStarter(null); }}
                                  className={`p-4 border-2 rounded-xl transition-all text-left ${selectedType === 'DOCUMENT' && !selectedStarter ? 'border-purple-600 bg-purple-50 shadow-md ring-2 ring-purple-500/50' : 'border-slate-100 hover:border-purple-300'}`}
                              >
                                  <FileText className={`${selectedType === 'DOCUMENT' && !selectedStarter ? 'text-purple-600' : 'text-slate-400'} mb-2`} size={28}/>
                                  <h4 className="font-bold text-slate-800">Documento</h4>
                                  <p className="text-xs text-slate-500 mt-1">Facturas, informes A4 (cm).</p>
                              </button>
                          </div>

                          {/* Starter templates */}
                          <div className="mb-5">
                              <p className="text-xs font-bold text-slate-400 uppercase mb-2">— O elige una plantilla base —</p>
                              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                  {STARTER_TEMPLATES.map(st => (
                                      <button
                                          key={st.id}
                                          onClick={() => { setSelectedStarter(st); setSelectedType(st.type); }}
                                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                                              selectedStarter?.id === st.id
                                                  ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/30'
                                                  : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50'
                                          }`}
                                      >
                                          <span className="text-2xl">{st.icon}</span>
                                          <div className="flex-1 min-w-0">
                                              <div className="font-bold text-sm text-slate-800 truncate">{st.name}</div>
                                              <div className="text-[10px] text-slate-500 truncate">{st.description}</div>
                                          </div>
                                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${st.type === 'LABEL' ? 'bg-indigo-50 text-indigo-600' : 'bg-purple-50 text-purple-600'}`}>
                                              {st.type}
                                          </span>
                                      </button>
                                  ))}
                              </div>
                          </div>
                          <button 
                              onClick={initCreation} 
                              disabled={!isFormValid}
                              className={`w-full py-3 font-bold rounded-xl shadow-lg transition-all mb-3 ${!isFormValid ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02]'}`}
                          >
                              {isFormValid ? 'CREAR DISEÑO' : (!hasName ? 'Escriba un nombre' : 'Seleccione Tipo')}
                          </button>
                          <button onClick={() => setShowCreateModal(false)} className="w-full py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Cancelar</button>
                      </div>
                  </div>
              )}
          </div>
      );
  }

  // --- DESIGNER VIEW ---
  return (
    <div 
        className="flex flex-col h-[100dvh] bg-slate-100 overflow-hidden font-sans" 
        onMouseMove={handlePointerMove} 
        onMouseUp={handlePointerUp} 
        onTouchMove={handlePointerMove} 
        onTouchEnd={handlePointerUp}
    >
        {/* HEADER */}
        <header className="bg-white border-b h-16 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm">
            <div className="flex items-center gap-2 w-1/3">
                <button onClick={() => setView('GALLERY')} className="hover:bg-slate-100 p-2 rounded-full text-slate-600 transition-colors"><ArrowLeft size={20}/></button>
                <div className="hidden md:flex gap-1 border-l pl-3 ml-2">
                    <button onClick={undo} disabled={editHistory.length <= 0 || historyIndex <= 0} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Undo2 size={18}/></button>
                    <button onClick={redo} disabled={historyIndex >= editHistory.length - 1} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Redo2 size={18}/></button>
                </div>
            </div>
            
            <div className="flex-1 flex justify-center relative">
                <input
                    className="text-center font-bold text-slate-800 bg-transparent hover:bg-slate-50 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-[250px] transition-all"
                    value={template.name}
                    onChange={e => setTemplate({...template, name: e.target.value})}
                    placeholder="Nombre del Diseño"
                />
                {lastAutoSave && (
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 whitespace-nowrap">
                        Auto-guardado {lastAutoSave.toLocaleTimeString()}
                    </div>
                )}
            </div>

            <div className="w-1/3 flex justify-end gap-2">
                <button
                    onClick={() => setShowPreviewModal(true)}
                    className="border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg font-bold flex items-center gap-2 text-sm transition-all active:scale-95"
                    title="Vista previa con datos reales"
                >
                    <Eye size={18}/> <span className="hidden md:inline">Preview</span>
                </button>
                <button
                    onClick={() => printTemplate(template, {})}
                    className="border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg font-bold flex items-center gap-2 text-sm transition-all active:scale-95"
                    title="Imprimir"
                >
                    <Printer size={18}/>
                </button>
                <button
                    onClick={() => downloadHTML(template, {})}
                    className="border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg font-bold flex items-center gap-2 text-sm transition-all active:scale-95"
                    title="Descargar HTML (abre en navegador → Ctrl+P → Guardar como PDF)"
                >
                    <Download size={18}/> <span className="hidden md:inline">HTML</span>
                </button>
                <button
                    onClick={() => setShowShortcutsModal(true)}
                    className="hidden md:flex border border-slate-200 hover:bg-slate-50 text-slate-500 p-2 rounded-lg transition-all"
                    title="Atajos de teclado"
                >
                    <Keyboard size={18}/>
                </button>
                <button
                    onClick={() => setShowShortcutsModal(true)}
                    className="hidden md:flex border border-slate-200 hover:bg-slate-50 text-slate-500 p-2 rounded-lg transition-all"
                    title="Atajos de teclado"
                ><Keyboard size={18}/></button>
                <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2 text-sm transition-all active:scale-95">
                    <Save size={18}/> <span className="hidden md:inline">Guardar</span>
                </button>
            </div>
        </header>

        {/* CONTEXTUAL BARS */}
        {/* Multi-select alignment bar */}
        {selectedIds.length >= 2 && (
            <div className="hidden md:flex bg-indigo-50 border-b border-indigo-200 px-4 py-1.5 gap-1 items-center shrink-0 z-20">
                <span className="text-[10px] font-bold text-indigo-400 uppercase mr-2">{selectedIds.length} seleccionados · Alinear:</span>
                {[
                    { icon: <AlignLeft size={14}/>, label: 'Izquierda', dir: 'left' as const },
                    { icon: <AlignCenterHorizontal size={14}/>, label: 'Centro H', dir: 'center-h' as const },
                    { icon: <AlignRight size={14}/>, label: 'Derecha', dir: 'right' as const },
                    { icon: <AlignStartVertical size={14}/>, label: 'Arriba', dir: 'top' as const },
                    { icon: <AlignVerticalJustifyCenter size={14}/>, label: 'Centro V', dir: 'center-v' as const },
                    { icon: <AlignEndVertical size={14}/>, label: 'Abajo', dir: 'bottom' as const },
                ].map(({ icon, label, dir }) => (
                    <button key={dir} onClick={() => alignElements(dir)} title={label}
                        className="p-1.5 rounded hover:bg-indigo-200 text-indigo-600 transition-colors">
                        {icon}
                    </button>
                ))}
                {selectedIds.length >= 3 && (
                    <button onClick={distributeH} title="Distribuir horizontalmente"
                        className="ml-1 px-2 py-1 text-[10px] font-bold rounded hover:bg-indigo-200 text-indigo-600 transition-colors border border-indigo-200">
                        ↔ Distribuir
                    </button>
                )}
            </div>
        )}

        {/* Single-element copy/paste bar */}
        {selectedId && selectedIds.length <= 1 && (
            <div className="hidden md:flex bg-slate-50 border-b border-slate-100 px-4 py-1 gap-2 items-center shrink-0 z-20">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Elemento:</span>
                <button
                    onClick={() => {
                        const el = template.elements.find(e => e.id === selectedId);
                        if (el) {
                            // Trigger copy via keyboard simulation workaround — hook handles Ctrl+C
                            // We directly call addElement with clipboard offset
                            addElement(el.type, {
                                ...el,
                                x: el.x + (template.type === 'DOCUMENT' ? 0.5 : 2),
                                y: el.y + (template.type === 'DOCUMENT' ? 0.5 : 2),
                            });
                        }
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded hover:bg-slate-200 text-slate-600 transition-colors"
                    title="Duplicar elemento (Ctrl+C, Ctrl+V)"
                >
                    <Copy size={12}/> Duplicar
                </button>
                <button
                    onClick={() => moveLayer('UP')}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded hover:bg-slate-200 text-slate-600 transition-colors"
                    title="Subir capa"
                >
                    ↑ Capa
                </button>
                <button
                    onClick={() => moveLayer('DOWN')}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded hover:bg-slate-200 text-slate-600 transition-colors"
                    title="Bajar capa"
                >
                    ↓ Capa
                </button>
                <span className="text-[10px] text-slate-300 ml-2">Ctrl+C/V copiar · Del eliminar · Flechas mover</span>
            </div>
        )}

        <div className="flex flex-1 overflow-hidden relative">

            {/* Desktop Toolbar */}
            <DesignerToolbar 
                template={template}
                addElement={(t, e) => { addElement(t, e); if(window.innerWidth < 768) setIsMobilePropOpen(true); }}
                onImageUpload={handleImageUpload}
                setShowShapeModal={setShowShapeModal}
                onConfigClick={() => { setSelectedId(null); setActivePanel('PROPERTIES'); }}
                onLayersClick={() => { setActivePanel('LAYERS'); }}
                activePanel={activePanel}
                tool={tool}
                setTool={setTool}
            />

            <DesignerCanvas
                template={template}
                selectedId={selectedId}
                selectedIds={selectedIds}
                zoom={zoom}
                setZoom={setZoom}
                setSelectedId={(id) => { setSelectedId(id); setActivePanel('PROPERTIES'); setEditingId(null); if(id && window.innerWidth < 768) setIsMobilePropOpen(true); }}
                onPointerDown={handlePointerDown}
                tool={tool}
                pan={pan}
                editingId={editingId}
                onStartEdit={handleStartEdit}
                onCommitEdit={handleCommitEdit}
                snapGuides={snapGuides}
                onContextMenu={handleContextMenu}
            />

            <aside className="hidden md:flex w-80 bg-white border-l z-20 shadow-xl flex-col">
                {activePanel === 'PROPERTIES' ? (
                    <DesignerProperties 
                        selectedId={selectedId} 
                        template={template} 
                        setTemplate={updateTemplate} 
                        updateElement={updateElement} 
                        deleteSelected={deleteSelected}
                        setShowVarModal={setShowVarModal}
                    />
                ) : (
                    <div className="p-4 h-full flex flex-col">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2"><Layers size={20}/> Capas</h3>
                        <div className="flex-1 overflow-y-auto space-y-1">
                            {[...template.elements].reverse().map((el, revIdx) => {
                                const index = template.elements.length - 1 - revIdx;
                                const typeColors: Record<string, string> = {
                                    TEXT: 'bg-blue-100 text-blue-700',
                                    SHAPE: 'bg-purple-100 text-purple-700',
                                    IMAGE: 'bg-green-100 text-green-700',
                                    BARCODE: 'bg-orange-100 text-orange-700',
                                    QR: 'bg-amber-100 text-amber-700',
                                    INVOICE_TABLE: 'bg-indigo-100 text-indigo-700',
                                    SUMMARY_BOX: 'bg-teal-100 text-teal-700',
                                    COMPANY_HEADER: 'bg-rose-100 text-rose-700',
                                };
                                const typeLabel: Record<string, string> = {
                                    TEXT: 'T', SHAPE: '■', IMAGE: '⬜', BARCODE: '|||',
                                    QR: 'QR', INVOICE_TABLE: '▦', SUMMARY_BOX: '∑', COMPANY_HEADER: '🏢',
                                };
                                const preview = el.type === 'TEXT'
                                    ? (el.content?.replace(/{{.*?}}/g, '…').slice(0, 24) || '—')
                                    : el.type === 'SHAPE' ? (el.shapeType || 'SHAPE')
                                    : el.type;
                                const isHidden = el.visible === false;

                                return (
                                    <div
                                        key={el.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, index)}
                                        onDragEnter={(e) => handleDragEnter(e, index)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={(e) => e.preventDefault()}
                                        onClick={() => { if (!isHidden) { setSelectedId(el.id); setActivePanel('PROPERTIES'); }}}
                                        className={`px-2 py-1.5 rounded-lg text-sm flex items-center gap-2 select-none transition-colors group border
                                            ${selectedId === el.id ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50 border-transparent'}
                                            ${isHidden ? 'opacity-40' : ''}`}
                                    >
                                        <div className="cursor-grab text-slate-300 hover:text-slate-500 shrink-0"><GripVertical size={13}/></div>
                                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${typeColors[el.type] || 'bg-slate-100 text-slate-600'}`}>
                                            {typeLabel[el.type] || el.type.slice(0,2)}
                                        </span>
                                        <span className={`truncate flex-1 text-xs ${selectedId === el.id ? 'text-indigo-700 font-bold' : 'text-slate-600'}`}>
                                            {preview}
                                        </span>
                                        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                                            {el.locked && <span title="Bloqueado" className="text-amber-500">🔒</span>}
                                            <button
                                                title={isHidden ? 'Mostrar' : 'Ocultar'}
                                                onClick={(e) => { e.stopPropagation(); updateElement(el.id, { visible: !isHidden }); }}
                                                className={`p-0.5 rounded hover:bg-slate-200 transition-colors ${isHidden ? 'text-slate-300' : 'text-slate-500'}`}
                                            >
                                                {isHidden ? <EyeOff size={12}/> : <Eye size={12}/>}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </aside>
        </div>

        {/* --- MOBILE UI --- */}
        
        {/* MOBILE BOTTOM TOOLBAR */}
        <div className="md:hidden bg-white border-t px-4 py-3 flex justify-between items-center z-40 pb-safe shrink-0">
            {/* Mobile Tool Switcher */}
            <button onClick={() => setTool(tool === 'SELECT' ? 'HAND' : 'SELECT')} className={`p-3 rounded-lg ${tool === 'HAND' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-600'}`}>
                {tool === 'HAND' ? <Hand size={20}/> : <MousePointer2 size={20}/>}
            </button>
            <div className="w-px h-8 bg-slate-200 mx-1"/>
            <button onClick={() => addElement('TEXT')} className="p-3 bg-slate-50 rounded-lg text-slate-600"><Type size={20}/></button>
            <button onClick={() => addElement('BARCODE')} className="p-3 bg-slate-50 rounded-lg text-slate-600"><ScanLine size={20}/></button>
            <button onClick={() => setShowShapeModal(true)} className="p-3 bg-slate-50 rounded-lg text-slate-600"><Shapes size={20}/></button>
            <button onClick={() => { setActivePanel('LAYERS'); setIsMobilePropOpen(true); }} className="p-3 bg-slate-50 rounded-lg text-slate-600"><Layers size={20}/></button>
            <div className="w-px h-8 bg-slate-200 mx-2"/>
            <button 
                onClick={() => { 
                    if(isMobilePropOpen && activePanel === 'PROPERTIES') setIsMobilePropOpen(false);
                    else { setActivePanel('PROPERTIES'); setIsMobilePropOpen(true); }
                }} 
                className={`p-3 rounded-full ${selectedId || isMobilePropOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}
            >
                {isMobilePropOpen ? <ChevronDown/> : <MoreVertical/>}
            </button>
        </div>

        {/* MOBILE SLIDE-UP PANEL (Mismo código anterior) */}
        <div className={`md:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)] z-50 transition-transform duration-300 transform flex flex-col max-h-[70vh] border-t border-slate-100 ${isMobilePropOpen ? 'translate-y-0' : 'translate-y-full'}`}>
            <div className="flex justify-between items-center px-4 pt-3 pb-2 border-b border-slate-50 cursor-pointer" onClick={() => setIsMobilePropOpen(false)}>
                <div className="w-8"/> 
                <div className="w-12 h-1.5 bg-slate-200 rounded-full"/>
                <button onClick={() => setIsMobilePropOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200">
                    <X size={16}/>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                {activePanel === 'PROPERTIES' ? (
                    <DesignerProperties 
                        selectedId={selectedId} 
                        template={template} 
                        setTemplate={updateTemplate} 
                        updateElement={updateElement} 
                        deleteSelected={deleteSelected}
                        setShowVarModal={setShowVarModal}
                    />
                ) : (
                    <div className="space-y-2">
                        <p className="text-xs text-slate-400 mb-2 font-bold uppercase">Orden de capas</p>
                        {template.elements.map((el, i) => (
                            <div key={el.id} onClick={() => setSelectedId(el.id)} className={`p-3 rounded-lg border flex items-center gap-2 ${selectedId===el.id?'border-indigo-500 bg-indigo-50':'border-slate-200'}`}>
                                <span className="font-bold text-slate-400 text-xs">{i+1}.</span>
                                <span className="flex-1 font-medium">{el.type}</span>
                                <GripVertical size={16} className="text-slate-300"/>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Keyboard Shortcuts Modal */}
        {showShortcutsModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowShortcutsModal(false)}>
                <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg flex items-center gap-2"><Keyboard size={18} className="text-indigo-600"/> Atajos de Teclado</h3>
                        <button onClick={() => setShowShortcutsModal(false)}><X/></button>
                    </div>
                    <div className="space-y-1 text-sm">
                        {[
                            ['Ctrl+Z', 'Deshacer'],
                            ['Ctrl+Y', 'Rehacer'],
                            ['Ctrl+C', 'Copiar elemento'],
                            ['Ctrl+V', 'Pegar elemento'],
                            ['Ctrl+A', 'Seleccionar todo'],
                            ['Ctrl+D', 'Duplicar elemento'],
                            ['Delete', 'Eliminar elemento'],
                            ['Escape', 'Deseleccionar'],
                            ['↑↓←→', 'Mover (0.1 cm)'],
                            ['Shift+↑↓←→', 'Mover (1 cm)'],
                            ['Doble clic', 'Editar texto'],
                            ['Clic derecho', 'Menú contextual'],
                        ].map(([key, desc]) => (
                            <div key={key} className="flex justify-between items-center py-1.5 border-b border-slate-50">
                                <span className="text-slate-600">{desc}</span>
                                <kbd className="bg-slate-100 border border-slate-200 text-slate-700 text-xs font-mono px-2 py-0.5 rounded">{key}</kbd>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
            <>
                <div className="fixed inset-0 z-[70]" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}/>
                <div
                    className="fixed z-[71] bg-white rounded-xl shadow-2xl border border-slate-200 py-1 min-w-[160px] text-sm animate-fade-in"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    {(() => {
                        const el = template.elements.find(e => e.id === contextMenu.elementId);
                        if (!el) return null;
                        const menuItem = (label: string, icon: string, onClick: () => void, danger = false) => (
                            <button
                                key={label}
                                onClick={() => { onClick(); closeContextMenu(); }}
                                className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 transition-colors text-left ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700'}`}
                            >
                                <span className="text-base leading-none">{icon}</span>
                                <span className="font-medium">{label}</span>
                            </button>
                        );
                        return (
                            <>
                                {menuItem('Duplicar', '⧉', () => {
                                    addElement(el.type, {
                                        ...el,
                                        x: el.x + (template.type === 'DOCUMENT' ? 0.5 : 2),
                                        y: el.y + (template.type === 'DOCUMENT' ? 0.5 : 2),
                                    });
                                })}
                                {menuItem(el.locked ? 'Desbloquear' : 'Bloquear', el.locked ? '🔓' : '🔒', () => {
                                    updateElement(el.id, { locked: !el.locked });
                                })}
                                <div className="border-t border-slate-100 my-1"/>
                                {menuItem('Subir capa', '↑', () => moveLayer('UP'))}
                                {menuItem('Bajar capa', '↓', () => moveLayer('DOWN'))}
                                <div className="border-t border-slate-100 my-1"/>
                                {menuItem('Eliminar', '✕', () => deleteSelected(), true)}
                            </>
                        );
                    })()}
                </div>
            </>
        )}

        {/* --- MODALS (Mismo código anterior) --- */}
        {showVarModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-lg h-[80vh] shadow-2xl flex flex-col overflow-hidden">
                    <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Database className="text-indigo-600" size={20}/> Explorador de Datos</h3>
                            <p className="text-xs text-slate-500">Navega por las tablas y relaciones.</p>
                        </div>
                        <button onClick={() => setShowVarModal(false)} className="p-2 hover:bg-slate-200 rounded-full"><X/></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {Object.keys(dbSchema).map(tableName => (
                            <SchemaNode 
                                key={tableName}
                                table={tableName}
                                path={tableName}
                                schema={dbSchema}
                                onSelect={(val: string) => {
                                    if(selectedId) {
                                        const oldContent = template.elements.find(e => e.id === selectedId)?.content || '';
                                        updateElement(selectedId, { content: oldContent + `{{${val}}}` });
                                    }
                                    setShowVarModal(false);
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        )}

        {showShapeModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg">Formas</h3>
                        <button onClick={() => setShowShapeModal(false)}><X/></button>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                        <button onClick={() => { addElement('SHAPE', {shapeType:'RECTANGLE'}); setShowShapeModal(false); }} className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"><Square size={28} strokeWidth={1.5}/><span className="text-xs font-bold text-slate-600">Rect.</span></button>
                        <button onClick={() => { addElement('SHAPE', {shapeType:'CIRCLE'}); setShowShapeModal(false); }} className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"><Circle size={28} strokeWidth={1.5}/><span className="text-xs font-bold text-slate-600">Círculo</span></button>
                        <button onClick={() => { addElement('SHAPE', {shapeType:'LINE'}); setShowShapeModal(false); }} className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"><Minus size={28} strokeWidth={1.5}/><span className="text-xs font-bold text-slate-600">Línea</span></button>
                        <button onClick={() => { addElement('SHAPE', {shapeType:'TRIANGLE_TL', fill:'#4f46e5', stroke:'transparent', strokeWidth:0}); setShowShapeModal(false); }} className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"><span style={{fontSize:28,lineHeight:1,color:'#4f46e5'}}>◤</span><span className="text-xs font-bold text-slate-600">▲ SupIzq</span></button>
                        <button onClick={() => { addElement('SHAPE', {shapeType:'TRIANGLE_TR', fill:'#4f46e5', stroke:'transparent', strokeWidth:0}); setShowShapeModal(false); }} className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"><span style={{fontSize:28,lineHeight:1,color:'#4f46e5'}}>◥</span><span className="text-xs font-bold text-slate-600">▲ SupDer</span></button>
                        <button onClick={() => { addElement('SHAPE', {shapeType:'TRIANGLE_BL', fill:'#4f46e5', stroke:'transparent', strokeWidth:0}); setShowShapeModal(false); }} className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"><span style={{fontSize:28,lineHeight:1,color:'#4f46e5'}}>◣</span><span className="text-xs font-bold text-slate-600">▲ InfIzq</span></button>
                        <button onClick={() => { addElement('SHAPE', {shapeType:'TRIANGLE_BR', fill:'#4f46e5', stroke:'transparent', strokeWidth:0}); setShowShapeModal(false); }} className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"><span style={{fontSize:28,lineHeight:1,color:'#4f46e5'}}>◢</span><span className="text-xs font-bold text-slate-600">▲ InfDer</span></button>
                        <button onClick={() => { addElement('SHAPE', {shapeType:'RHOMBUS', fill:'#4f46e5', stroke:'transparent', strokeWidth:0}); setShowShapeModal(false); }} className="flex flex-col items-center gap-1 p-2 hover:bg-slate-50 rounded-xl border border-slate-100 transition-all"><span style={{fontSize:28,lineHeight:1,color:'#4f46e5'}}>◆</span><span className="text-xs font-bold text-slate-600">Rombo</span></button>
                    </div>
                </div>
            </div>
        )}

        {/* PREVIEW MODAL */}
        {showPreviewModal && (
            <PreviewModal template={template} onClose={() => setShowPreviewModal(false)} />
        )}
    </div>
  );
};

export default LabelDesigner;
