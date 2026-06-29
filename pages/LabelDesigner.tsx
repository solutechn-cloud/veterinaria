import React, { useState, useEffect, useRef } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate } = ReactRouterDOM as any;
import { printMultipleCopies } from '../services/TemplateRenderer';
import PreviewModal from '../components/LabelDesigner/PreviewModal';
import { STARTER_TEMPLATES, StarterTemplateEntry } from '../services/StarterTemplates';
import Swal from 'sweetalert2';
import { LabelService, ConfigService } from '../services/api';
import { LabelTemplate, EmpresaConfig } from '../types';
import { useLabelDesigner } from '../hooks/useLabelDesigner';
import DesignerCanvas    from '../components/LabelDesigner/DesignerCanvas';
import DesignerProperties from '../components/LabelDesigner/DesignerProperties';
import DesignerToolbar   from '../components/LabelDesigner/DesignerToolbar';
import DesignerHeader    from '../components/LabelDesigner/DesignerHeader';
import LayersPanel       from '../components/LabelDesigner/LayersPanel';
import MobileUI          from '../components/LabelDesigner/MobileUI';
import GalleryView       from '../components/LabelDesigner/GalleryView';
import VarModal          from '../components/LabelDesigner/VarModal';
import ShapeModal        from '../components/LabelDesigner/ShapeModal';
import ShortcutsModal    from '../components/LabelDesigner/ShortcutsModal';
import ContextMenu       from '../components/LabelDesigner/ContextMenu';
import { importTemplateFromText } from '../services/labelTemplatePackage';

const LabelDesigner: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<'GALLERY' | 'DESIGNER'>('GALLERY');
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryFilter, setGalleryFilter] = useState<'ALL' | 'LABEL' | 'DOCUMENT'>('ALL');
  const [gallerySort, setGallerySort] = useState<'name' | 'type'>('name');
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDesignName, setNewDesignName] = useState('');
  const [selectedType, setSelectedType] = useState<'LABEL' | 'DOCUMENT' | null>(null);
  const [selectedStarter, setSelectedStarter] = useState<StarterTemplateEntry | null>(null);
  const [empresaConfig, setEmpresaConfig] = useState<Partial<EmpresaConfig>>({});
  const [activePanel, setActivePanel] = useState<'PROPERTIES' | 'LAYERS'>('PROPERTIES');
  const [isMobilePropOpen, setIsMobilePropOpen] = useState(false);
  const [showVarModal, setShowVarModal] = useState(false);
  const [showShapeModal, setShowShapeModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string } | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [varTab, setVarTab] = useState<'context' | 'schema'>('context');
  const [varSearch, setVarSearch] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const styleClipboardRef = useRef<Partial<import('../types').LabelElement> | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

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
    addElement, updateElement, updateMultipleElements, deleteSelected, updateTemplate,
    insertCompanyAsElements,
    saveTemplate, moveLayer, reorderElements,
    alignElements, distributeH,
    interaction, unitLabel,
    handlePointerDown, handlePointerMove, handlePointerUp,
    snapGuides, lasso,
  } = useLabelDesigner();

  const handleStartEdit = (id: string) => { setEditingId(id); setSelectedId(id); };
  const handleCommitEdit = (id: string, value: string) => { updateElement(id, { content: value }); setEditingId(null); };
  const handleContextMenu = (e: React.MouseEvent, elementId: string) => { setSelectedId(elementId); setContextMenu({ x: e.clientX, y: e.clientY, elementId }); };
  const closeContextMenu = () => setContextMenu(null);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, pos: number) => { dragItem.current = pos; };
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, pos: number) => { dragOverItem.current = pos; };
  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      reorderElements(dragItem.current, dragOverItem.current);
    }
    dragItem.current = null; dragOverItem.current = null;
  };

  useEffect(() => {
    loadSavedList();
    ConfigService.get().then((data: any) => { if (data) setEmpresaConfig(data); }).catch(() => {});
    const id = 'gfonts-designer';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id; link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&family=Poppins:wght@400;600;700&family=Playfair+Display:wght@400;700&family=Raleway:wght@400;700&family=Oswald:wght@400;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    if (view !== 'DESIGNER' || !template.name || template.name === 'Nuevo Diseño') return;
    const timer = setTimeout(() => {
      try {
        const safeTemplate = { ...template, elements: template.elements.map(({ visibilityCondition: _vc, ...el }: typeof template.elements[0] & { visibilityCondition?: unknown }) => el) };
        localStorage.setItem('ld_autosave', JSON.stringify({ template: safeTemplate, savedAt: Date.now() }));
        setLastAutoSave(new Date());
      } catch { /* localStorage full */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [template, view]);

  useEffect(() => {
    if (view !== 'DESIGNER') return;
    const raw = localStorage.getItem('ld_autosave');
    if (!raw) return;
    try {
      const { template: saved, savedAt } = JSON.parse(raw);
      if (saved && !template.id && saved.id && saved.name !== 'Nuevo Diseño') {
        const age = Math.round((Date.now() - savedAt) / 60000);
        Swal.fire({ title: 'Borrador encontrado', text: `"${saved.name}" guardado hace ${age} min. ¿Restaurar?`, icon: 'question', showCancelButton: true, confirmButtonText: 'Restaurar', cancelButtonText: 'Descartar', confirmButtonColor: '#4f46e5' })
          .then(r => { if (r.isConfirmed) loadTemplate(saved); else localStorage.removeItem('ld_autosave'); });
      }
    } catch { /* ignore */ }
  }, [view]);

  useEffect(() => {
    if (view !== 'DESIGNER') return;
    const handleResize = () => {
      const scale = template.type === 'DOCUMENT' ? 37.795 : 3.7795;
      const isMobile = window.innerWidth < 768;
      const availW = window.innerWidth - (isMobile ? 48 : 340);
      const availH = window.innerHeight - (isMobile ? 180 : 130);
      setZoom(Math.max(0.2, Math.min(isMobile ? 2 : 3, Math.min(availW / (template.width * scale), availH / (template.height * scale)))));
      setPan({ x: 0, y: 0 });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [view, template.type, template.width, template.height]);

  useEffect(() => {
    if (view !== 'DESIGNER') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [view]);

  const loadSavedList = async () => {
    try { setSavedTemplates(await LabelService.getAll() || []); } catch (e) { console.error(e); }
  };

  const initCreation = () => {
    if (!newDesignName.trim() || !selectedType) return;
    if (selectedStarter) {
      loadTemplate({ ...selectedStarter.template, id: '', name: newDesignName } as any);
    } else {
      createNew(selectedType, newDesignName);
    }
    setShowCreateModal(false); setView('DESIGNER');
    setNewDesignName(''); setSelectedType(null); setSelectedStarter(null);
  };

  const handleOpen = (t: LabelTemplate) => { loadTemplate(t); setView('DESIGNER'); };

  const handleDeleteTemplate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const result = await Swal.fire({ title: '¿Eliminar diseño?', text: 'Esta acción no se puede deshacer', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar', confirmButtonColor: '#d33', cancelButtonText: 'Cancelar' });
    if (result.isConfirmed) {
      try { await LabelService.delete(id); Swal.fire('Eliminado', '', 'success'); loadSavedList(); }
      catch (err: any) { Swal.fire('Error', err.message, 'error'); }
    }
  };

  const handleImportTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importTemplateFromText(String(reader.result || ''), file.name);
        loadTemplate(imported);
        setView('DESIGNER');
        Swal.fire({
          icon: 'success',
          title: 'Plantilla importada',
          text: file.name.toLowerCase().endsWith('.html') ? 'El HTML incluia el diseno editable.' : undefined,
          toast: true,
          position: 'bottom-end',
          timer: 2200,
          showConfirmButton: false,
        });
      } catch (err) {
        Swal.fire('No se pudo importar', err instanceof Error ? err.message : 'El archivo no es una plantilla valida.', 'error');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };
  const handleSave = async () => { const ok = await saveTemplate(); if (ok) loadSavedList(); };

  const handleSaveAs = async () => {
    const { value: newName } = await Swal.fire({ title: 'Guardar como nuevo diseño', input: 'text', inputValue: `Copia de ${template.name}`, inputPlaceholder: 'Nombre del nuevo diseño', showCancelButton: true, confirmButtonText: 'Guardar', confirmButtonColor: '#4f46e5' });
    if (!newName) return;
    try { await LabelService.create({ ...template, id: undefined, name: newName, isDefault: false } as any); Swal.fire({ icon: 'success', title: 'Guardado como nuevo', toast: true, position: 'bottom-end', timer: 2000, showConfirmButton: false }); loadSavedList(); }
    catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const reader = new FileReader(); reader.onloadend = () => addElement('IMAGE', { content: reader.result as string }); reader.readAsDataURL(file); }
  };

  const hasName = newDesignName.trim().length > 0;
  const isFormValid = hasName && selectedType !== null;

  if (view === 'GALLERY') {
    return (
      <GalleryView
        savedTemplates={savedTemplates} gallerySearch={gallerySearch} setGallerySearch={setGallerySearch}
        galleryFilter={galleryFilter} setGalleryFilter={setGalleryFilter}
        gallerySort={gallerySort} setGallerySort={setGallerySort}
        importInputRef={importInputRef} onImportTemplate={handleImportTemplate}
        showCreateModal={showCreateModal} setShowCreateModal={setShowCreateModal}
        newDesignName={newDesignName} setNewDesignName={setNewDesignName}
        selectedType={selectedType} setSelectedType={setSelectedType}
        selectedStarter={selectedStarter} setSelectedStarter={setSelectedStarter}
        isFormValid={isFormValid} hasName={hasName}
        onOpen={handleOpen} onDelete={handleDeleteTemplate} onInitCreation={initCreation}
      />
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-100 overflow-hidden font-sans"
        onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}
        onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}>

      <DesignerHeader
        template={template} onNameChange={(name) => setTemplate({ ...template, name })}
        editHistory={editHistory} historyIndex={historyIndex} undo={undo} redo={redo}
        lastAutoSave={lastAutoSave} selectedId={selectedId} selectedIds={selectedIds}
        onBack={() => setView('GALLERY')} onPreview={() => setShowPreviewModal(true)}
        onShortcuts={() => setShowShortcutsModal(true)} onSave={handleSave} onSaveAs={handleSaveAs}
        alignElements={alignElements} distributeH={distributeH}
        moveLayer={moveLayer} updateElement={updateElement} styleClipboardRef={styleClipboardRef}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <DesignerToolbar
          template={template}
          addElement={(t, e) => { addElement(t, e); if (window.innerWidth < 768) setIsMobilePropOpen(true); }}
          insertCompanyAsElements={() => { insertCompanyAsElements(); if (window.innerWidth < 768) setIsMobilePropOpen(true); }}
          onImageUpload={handleImageUpload}
          setShowShapeModal={setShowShapeModal}
          onConfigClick={() => { setSelectedId(null); setActivePanel('PROPERTIES'); }}
          onLayersClick={() => { setActivePanel('LAYERS'); }}
          activePanel={activePanel} tool={tool} setTool={setTool}
        />

        <DesignerCanvas
          template={template} selectedId={selectedId} selectedIds={selectedIds}
          zoom={zoom} setZoom={setZoom} setPan={setPan}
          setSelectedId={(id) => { setSelectedId(id); setActivePanel('PROPERTIES'); setEditingId(null); if (id && window.innerWidth < 768) setIsMobilePropOpen(true); }}
          setSelectedIds={setSelectedIds} onPointerDown={handlePointerDown}
          tool={tool} setTool={setTool} pan={pan} editingId={editingId}
          onStartEdit={handleStartEdit} onCommitEdit={handleCommitEdit}
          snapGuides={snapGuides} onContextMenu={handleContextMenu}
          empresaConfig={empresaConfig} lasso={lasso}
        />

        <aside className="hidden md:flex w-80 bg-white border-l z-20 shadow-xl flex-col">
          {activePanel === 'PROPERTIES' ? (
            <DesignerProperties
              selectedId={selectedId} selectedIds={selectedIds}
              template={template} setTemplate={updateTemplate}
              updateElement={updateElement} updateMultipleElements={updateMultipleElements}
              deleteSelected={deleteSelected} setShowVarModal={setShowVarModal}
            />
          ) : (
            <LayersPanel
              template={template} selectedId={selectedId} updateElement={updateElement}
              setSelectedId={setSelectedId} setActivePanel={setActivePanel}
              handleDragStart={handleDragStart} handleDragEnter={handleDragEnter} handleDragEnd={handleDragEnd}
            />
          )}
        </aside>
      </div>

      <MobileUI
        tool={tool} setTool={setTool} addElement={addElement}
        setShowShapeModal={setShowShapeModal} activePanel={activePanel} setActivePanel={setActivePanel}
        isMobilePropOpen={isMobilePropOpen} setIsMobilePropOpen={setIsMobilePropOpen}
        template={template} setZoom={setZoom} setPan={setPan}
        selectedId={selectedId} selectedIds={selectedIds}
        updateTemplate={updateTemplate} updateElement={updateElement}
        updateMultipleElements={updateMultipleElements} deleteSelected={deleteSelected}
        setShowVarModal={setShowVarModal} setSelectedId={setSelectedId}
      />

      <ShortcutsModal show={showShortcutsModal} onClose={() => setShowShortcutsModal(false)} />

      {contextMenu && (
        <ContextMenu
          contextMenu={contextMenu} closeContextMenu={closeContextMenu}
          template={template} selectedIds={selectedIds}
          setSelectedIds={setSelectedIds} setSelectedId={setSelectedId}
          addElement={addElement} updateElement={updateElement}
          moveLayer={moveLayer} deleteSelected={deleteSelected}
        />
      )}

      {showVarModal && (
        <VarModal
          selectedId={selectedId} template={template} updateElement={updateElement}
          setShowVarModal={setShowVarModal} dbSchema={dbSchema}
          varTab={varTab} setVarTab={setVarTab} varSearch={varSearch} setVarSearch={setVarSearch}
        />
      )}

      <ShapeModal show={showShapeModal} onClose={() => setShowShapeModal(false)} addElement={addElement} />

      {showPreviewModal && <PreviewModal template={template} onClose={() => setShowPreviewModal(false)} />}
    </div>
  );
};

export default LabelDesigner;
