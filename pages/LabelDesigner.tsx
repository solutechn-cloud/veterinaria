
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Save, Undo2, Redo2, Plus, Star, FileCog, Type, ScanLine, Shapes, Settings, ChevronDown, MoreVertical, X, Square, Circle, Minus,
  Layers, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Search, Database, Table, ChevronRight, Key, GripVertical
} from 'lucide-react';
import { LabelService } from '../services/api';
import { LabelTemplate } from '../types';
import { useLabelDesigner } from '../hooks/useLabelDesigner';
import DesignerCanvas from '../components/LabelDesigner/DesignerCanvas';
import DesignerProperties from '../components/LabelDesigner/DesignerProperties';
import DesignerToolbar from '../components/LabelDesigner/DesignerToolbar';

// --- MAIN COMPONENT ---
const LabelDesigner: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<'GALLERY' | 'DESIGNER'>('GALLERY');
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  
  // Custom Hook for Logic
  const {
      template, setTemplate,
      selectedId, setSelectedId,
      zoom, setZoom,
      history, historyIndex,
      dbSchema,
      loadTemplate, createNew,
      undo, redo,
      addElement, updateElement, deleteSelected, updateTemplate,
      saveTemplate, moveLayer, reorderElements,
      interaction,
      handlePointerDown, handlePointerMove, handlePointerUp
  } = useLabelDesigner();

  // Local UI State
  const [activePanel, setActivePanel] = useState<'PROPERTIES' | 'LAYERS'>('PROPERTIES');
  const [isMobilePropOpen, setIsMobilePropOpen] = useState(false);
  const [showVarModal, setShowVarModal] = useState(false);
  const [showShapeModal, setShowShapeModal] = useState(false);
  
  // Variable Modal Logic
  const [varSearch, setVarSearch] = useState('');
  const [expandedTables, setExpandedTables] = useState<string[]>([]);

  // Drag and Drop Logic
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  useEffect(() => {
      loadSavedList();
  }, []);

  const loadSavedList = async () => {
      try {
          const data = await LabelService.getAll();
          setSavedTemplates(data || []);
      } catch (e) { console.error(e); }
  };

  const handleCreate = () => {
      createNew();
      setView('DESIGNER');
  };

  const handleOpen = (t: LabelTemplate) => {
      loadTemplate(t);
      setView('DESIGNER');
  };

  const handleSave = async () => {
      const success = await saveTemplate();
      if(success) loadSavedList();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => addElement('IMAGE', { content: reader.result as string, width: 20, height: 20 });
          reader.readAsDataURL(file);
      }
  };

  // Helper for Variable Tree
  const toggleTable = (tableName: string) => {
      setExpandedTables(prev => prev.includes(tableName) ? prev.filter(t => t !== tableName) : [...prev, tableName]);
  };

  // DnD Handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragItem.current = position;
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragOverItem.current = position;
  };

  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
        reorderElements(dragItem.current, dragOverItem.current);
    }
    dragItem.current = null;
    dragOverItem.current = null;
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
                      <button onClick={handleCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 font-bold transition-all hover:scale-105">
                          <Plus size={20}/> Nuevo Diseño
                      </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {savedTemplates.map(t => (
                          <div key={t.id} onClick={() => handleOpen(t)} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all cursor-pointer group overflow-hidden relative">
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
    <div 
        className="flex flex-col h-screen bg-slate-100 overflow-hidden font-sans" 
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
                    <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Undo2 size={18}/></button>
                    <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"><Redo2 size={18}/></button>
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
                <button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2 text-sm transition-all active:scale-95">
                    <Save size={18}/> <span className="hidden md:inline">Guardar</span>
                </button>
            </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
            
            <DesignerToolbar 
                template={template}
                addElement={(t, e) => { addElement(t, e); if(window.innerWidth < 768) setIsMobilePropOpen(true); }}
                onImageUpload={handleImageUpload}
                setShowShapeModal={setShowShapeModal}
                onConfigClick={() => { setSelectedId(null); setActivePanel('PROPERTIES'); if(window.innerWidth < 768) setIsMobilePropOpen(true); }}
                onLayersClick={() => { setActivePanel('LAYERS'); if(window.innerWidth < 768) setIsMobilePropOpen(true); }}
                activePanel={activePanel}
            />

            <DesignerCanvas 
                template={template} 
                selectedId={selectedId}
                zoom={zoom}
                setZoom={setZoom}
                setSelectedId={(id) => { setSelectedId(id); setActivePanel('PROPERTIES'); if(id && window.innerWidth < 768) setIsMobilePropOpen(true); }}
                onPointerDown={handlePointerDown}
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
                        <p className="text-xs text-slate-400 mb-2">Arrastra para reordenar</p>
                        <div className="flex-1 overflow-y-auto space-y-1">
                            {template.elements.map((el, index) => (
                                <div 
                                    key={el.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragEnter={(e) => handleDragEnter(e, index)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => e.preventDefault()}
                                    onClick={() => setSelectedId(el.id)}
                                    className={`p-2 rounded-lg text-sm flex items-center gap-3 cursor-pointer select-none transition-colors group
                                        ${selectedId === el.id ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200' : 'hover:bg-slate-50 text-slate-600 border border-transparent'}`}
                                >
                                    <div className="cursor-grab text-slate-300 hover:text-slate-500"><GripVertical size={14}/></div>
                                    <span className="text-[10px] bg-slate-200 px-1.5 rounded text-slate-500 font-mono w-6 text-center">{index+1}</span>
                                    {el.type === 'TEXT' && <Type size={14}/>}
                                    {el.type === 'BARCODE' && <ScanLine size={14}/>}
                                    {el.type === 'SHAPE' && <Shapes size={14}/>}
                                    <span className="truncate flex-1">{el.content || el.type}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </aside>
        </div>

        {/* MOBILE BOTTOM BAR */}
        <div className="md:hidden bg-white border-t px-4 py-2 flex justify-between items-center z-40 pb-safe">
            <button onClick={() => addElement('TEXT')} className="p-3 bg-slate-50 rounded-lg"><Type size={20}/></button>
            <button onClick={() => addElement('BARCODE')} className="p-3 bg-slate-50 rounded-lg"><ScanLine size={20}/></button>
            <button onClick={() => setShowShapeModal(true)} className="p-3 bg-slate-50 rounded-lg"><Shapes size={20}/></button>
            <button onClick={() => { setActivePanel('LAYERS'); setIsMobilePropOpen(true); }} className="p-3 bg-slate-50 rounded-lg"><Layers size={20}/></button>
            <div className="w-px h-8 bg-slate-200 mx-2"/>
            <button onClick={() => { setActivePanel('PROPERTIES'); setIsMobilePropOpen(!isMobilePropOpen); }} className={`p-3 rounded-full ${selectedId || isMobilePropOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {isMobilePropOpen ? <ChevronDown/> : <MoreVertical/>}
            </button>
        </div>

        {/* MOBILE SLIDE-UP PANEL */}
        <div className={`md:hidden fixed inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50 transition-transform duration-300 transform flex flex-col max-h-[70vh] border-t border-slate-100 ${isMobilePropOpen ? 'translate-y-0' : 'translate-y-full'}`}>
            <div className="flex justify-between items-center px-4 pt-3 pb-2 border-b border-slate-50">
                <div className="w-8"/> {/* Spacer */}
                <div className="w-12 h-1.5 bg-slate-200 rounded-full" onClick={() => setIsMobilePropOpen(false)}/>
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
                    // Mobile Layers
                    <div className="space-y-2">
                        <p className="text-xs text-slate-400 mb-2">Orden de capas</p>
                        {template.elements.map((el, i) => (
                            <div key={el.id} onClick={() => setSelectedId(el.id)} className={`p-3 rounded-lg border flex items-center gap-2 ${selectedId===el.id?'border-indigo-500 bg-indigo-50':'border-slate-200'}`}>
                                <span className="font-bold text-slate-400 text-xs">{i+1}.</span>
                                {el.type}
                            </div>
                        ))}
                    </div>
                )}
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

        {/* NEW MODERN VARIABLE PICKER */}
        {showVarModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-2xl h-[80vh] shadow-2xl flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Database className="text-indigo-600" size={20}/> Selector de Datos</h3>
                            <p className="text-xs text-slate-500">Selecciona campos para insertar en tu diseño.</p>
                        </div>
                        <button onClick={() => setShowVarModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X/></button>
                    </div>

                    {/* Search */}
                    <div className="p-4 border-b bg-white">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                            <input 
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Buscar variable (ej: precio, cliente)..."
                                value={varSearch}
                                onChange={e => setVarSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 custom-scrollbar">
                        <div className="space-y-4">
                            {Object.entries(dbSchema).map(([table, schema]: any) => {
                                const isExpanded = expandedTables.includes(table) || varSearch.length > 0;
                                const cols = schema.columns || [];
                                const rels = schema.relations || [];
                                
                                // Filter based on search
                                const matchesSearch = varSearch === '' || 
                                    cols.some((c:any) => c.name.toLowerCase().includes(varSearch.toLowerCase())) || 
                                    table.toLowerCase().includes(varSearch.toLowerCase());

                                if (!matchesSearch) return null;

                                return (
                                    <div key={table} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <button 
                                            onClick={() => toggleTable(table)}
                                            className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-100"
                                        >
                                            <div className="flex items-center gap-2 font-bold text-slate-700 text-sm uppercase">
                                                <Table size={16} className="text-indigo-500"/>
                                                {table}
                                            </div>
                                            {isExpanded ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
                                        </button>
                                        
                                        {isExpanded && (
                                            <div className="p-2 grid grid-cols-2 gap-2">
                                                {/* Columns */}
                                                {cols.map((col: any) => (
                                                    <button 
                                                        key={col.name}
                                                        onClick={() => {
                                                            if(selectedId) updateElement(selectedId, { content: template.elements.find(e => e.id === selectedId)?.content + `{{${table}.${col.name}}}` });
                                                            setShowVarModal(false);
                                                        }}
                                                        className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded-lg text-left group transition-all border border-transparent hover:border-indigo-100"
                                                    >
                                                        <div className="w-6 h-6 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-[10px] font-bold group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                                            {col.type === 'integer' || col.type === 'numeric' ? '#' : 'T'}
                                                        </div>
                                                        <span className="text-xs font-medium text-slate-600 group-hover:text-indigo-700">{col.name}</span>
                                                    </button>
                                                ))}
                                                
                                                {/* Relations (Foreign Keys) with Recursive Columns */}
                                                {rels.map((rel: any) => {
                                                    // Find related table schema
                                                    const foreignSchema = (dbSchema as any)[rel.foreignTable];
                                                    if (!foreignSchema) return null;

                                                    return (
                                                        <div key={rel.foreignTable} className="col-span-2 bg-amber-50 rounded-lg border border-amber-100 p-2 mt-1">
                                                            <div className="flex items-center gap-2 text-xs font-bold text-amber-700 mb-2">
                                                                <Key size={12}/> Relación: {rel.foreignTable}
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2 pl-2 border-l-2 border-amber-200">
                                                                {foreignSchema.columns.map((fCol: any) => (
                                                                    <button 
                                                                        key={fCol.name}
                                                                        onClick={() => {
                                                                            // Uses relatedTable.column format
                                                                            if(selectedId) updateElement(selectedId, { content: template.elements.find(e => e.id === selectedId)?.content + `{{${rel.foreignTable}.${fCol.name}}}` });
                                                                            setShowVarModal(false);
                                                                        }}
                                                                        className="flex items-center gap-2 p-1.5 hover:bg-white rounded text-left group transition-all"
                                                                    >
                                                                        <div className="w-4 h-4 rounded bg-amber-200 text-amber-800 flex items-center justify-center text-[8px] font-bold">
                                                                            {fCol.type === 'integer' || fCol.type === 'numeric' ? '#' : 'T'}
                                                                        </div>
                                                                        <span className="text-[10px] font-medium text-amber-900 group-hover:underline">{fCol.name}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default LabelDesigner;
