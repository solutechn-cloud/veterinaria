import React from 'react';
import { Plus, Search, Upload, Star, Tag, FileText, Trash2 } from 'lucide-react';
import TemplateThumbnail from './TemplateThumbnail';
import { STARTER_TEMPLATES, StarterTemplateEntry } from '../../services/StarterTemplates';
import { LabelTemplate } from '../../types';

interface Props {
    savedTemplates: LabelTemplate[];
    gallerySearch: string;
    setGallerySearch: (v: string) => void;
    galleryFilter: 'ALL' | 'LABEL' | 'DOCUMENT';
    setGalleryFilter: (v: 'ALL' | 'LABEL' | 'DOCUMENT') => void;
    gallerySort: 'name' | 'type';
    setGallerySort: (v: 'name' | 'type') => void;
    importInputRef: React.RefObject<HTMLInputElement>;
    onImportTemplate: (e: React.ChangeEvent<HTMLInputElement>) => void;
    showCreateModal: boolean;
    setShowCreateModal: (v: boolean) => void;
    newDesignName: string;
    setNewDesignName: (v: string) => void;
    selectedType: 'LABEL' | 'DOCUMENT' | null;
    setSelectedType: (v: 'LABEL' | 'DOCUMENT' | null) => void;
    selectedStarter: StarterTemplateEntry | null;
    setSelectedStarter: (v: StarterTemplateEntry | null) => void;
    isFormValid: boolean;
    hasName: boolean;
    onOpen: (t: LabelTemplate) => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onInitCreation: () => void;
}

export default function GalleryView({
    savedTemplates, gallerySearch, setGallerySearch, galleryFilter, setGalleryFilter,
    gallerySort, setGallerySort, importInputRef, onImportTemplate,
    showCreateModal, setShowCreateModal, newDesignName, setNewDesignName,
    selectedType, setSelectedType, selectedStarter, setSelectedStarter,
    isFormValid, hasName, onOpen, onDelete, onInitCreation,
}: Props) {
    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-10">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">Mis Diseños</h1>
                        <p className="text-slate-500">Etiquetas y Documentos</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input ref={importInputRef} type="file" accept=".json,.html,text/html,application/json" className="hidden" onChange={onImportTemplate}/>
                        <button onClick={() => importInputRef.current?.click()} className="border border-slate-300 hover:border-indigo-400 bg-white text-slate-600 hover:text-indigo-600 px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold transition-all">
                            <Upload size={16}/> Importar
                        </button>
                        <button onClick={() => setShowCreateModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 font-bold transition-all hover:scale-105">
                            <Plus size={20}/> Nuevo Diseño
                        </button>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <input value={gallerySearch} onChange={e => setGallerySearch(e.target.value)} placeholder="Buscar diseño..."
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 transition-colors"/>
                    </div>
                    <div className="flex gap-1">
                        {(['ALL', 'LABEL', 'DOCUMENT'] as const).map(f => (
                            <button key={f} onClick={() => setGalleryFilter(f)}
                                className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${galleryFilter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                                {f === 'ALL' ? `Todos (${savedTemplates.length})` : f === 'LABEL' ? 'Etiquetas' : 'Documentos'}
                            </button>
                        ))}
                        <select value={gallerySort} onChange={e => setGallerySort(e.target.value as any)}
                            className="ml-2 px-3 py-2.5 rounded-xl text-sm border border-slate-200 bg-white text-slate-500 font-bold outline-none focus:border-indigo-400">
                            <option value="name">A → Z</option>
                            <option value="type">Tipo</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {savedTemplates
                        .filter(t => galleryFilter === 'ALL' || t.type === galleryFilter)
                        .filter(t => !gallerySearch || t.name.toLowerCase().includes(gallerySearch.toLowerCase()))
                        .sort((a, b) => gallerySort === 'name' ? a.name.localeCompare(b.name) : (a.type || '').localeCompare(b.type || ''))
                        .map(t => (
                        <div key={t.id} onClick={() => onOpen(t)} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all cursor-pointer group overflow-hidden relative flex flex-col">
                            <div className="flex-1 bg-slate-100 relative overflow-hidden min-h-[160px]">
                                <TemplateThumbnail template={t} />
                                <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => onDelete(e, t.id)} className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-md transition-all hover:scale-110" title="Eliminar">
                                        <Trash2 size={13}/>
                                    </button>
                                </div>
                                {t.isDefault && (
                                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-400/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                                        <Star size={10} className="fill-white"/><span>PREDETER.</span>
                                    </div>
                                )}
                                <div className={`absolute bottom-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shadow-sm ${t.type==='LABEL'?'bg-indigo-600 text-white':'bg-purple-600 text-white'}`}>
                                    {t.type === 'LABEL' ? 'Etiqueta' : 'Documento'}
                                </div>
                            </div>
                            <div className="p-3 border-t border-slate-100">
                                <h3 className="font-bold text-slate-700 group-hover:text-indigo-600 truncate text-sm">{t.name}</h3>
                                <div className="flex justify-between items-center mt-1 text-xs">
                                    <span className="text-slate-400">{t.width}×{t.height} {t.type==='DOCUMENT'?'cm':'mm'}</span>
                                    <span className="text-slate-400 uppercase">{t.category || '—'}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {savedTemplates.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                            <FileText size={48} strokeWidth={1} className="mb-4 text-slate-300"/>
                            <p className="text-lg font-bold text-slate-500">No tienes diseños aún</p>
                            <p className="text-sm mt-1">Haz clic en "Nuevo Diseño" para empezar</p>
                        </div>
                    )}
                </div>
            </div>

            {showCreateModal && (
                <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in">
                        <h3 className="text-xl font-bold text-slate-800 mb-4">Crear Nuevo Diseño</h3>
                        <div className="mb-6">
                            <input
                                className={`w-full p-3 border rounded-xl outline-none focus:ring-2 transition-all ${(!hasName && newDesignName !== '') ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                                placeholder="Nombre del diseño..." value={newDesignName}
                                onChange={e => setNewDesignName(e.target.value)} autoFocus
                            />
                            {!hasName && newDesignName === '' && <p className="text-xs text-slate-400 mt-1 ml-1">* Requerido</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-5">
                            <button onClick={() => { setSelectedType('LABEL'); setSelectedStarter(null); }}
                                className={`p-4 border-2 rounded-xl transition-all text-left ${selectedType === 'LABEL' && !selectedStarter ? 'border-indigo-600 bg-indigo-50 shadow-md ring-2 ring-indigo-500/50' : 'border-slate-100 hover:border-indigo-300'}`}>
                                <Tag className={`${selectedType === 'LABEL' && !selectedStarter ? 'text-indigo-600' : 'text-slate-400'} mb-2`} size={28}/>
                                <h4 className="font-bold text-slate-800">Etiqueta</h4>
                                <p className="text-xs text-slate-500 mt-1">Códigos de barra, precios (mm).</p>
                            </button>
                            <button onClick={() => { setSelectedType('DOCUMENT'); setSelectedStarter(null); }}
                                className={`p-4 border-2 rounded-xl transition-all text-left ${selectedType === 'DOCUMENT' && !selectedStarter ? 'border-purple-600 bg-purple-50 shadow-md ring-2 ring-purple-500/50' : 'border-slate-100 hover:border-purple-300'}`}>
                                <FileText className={`${selectedType === 'DOCUMENT' && !selectedStarter ? 'text-purple-600' : 'text-slate-400'} mb-2`} size={28}/>
                                <h4 className="font-bold text-slate-800">Documento</h4>
                                <p className="text-xs text-slate-500 mt-1">Facturas, informes A4 (cm).</p>
                            </button>
                        </div>
                        <div className="mb-5">
                            <p className="text-xs font-bold text-slate-400 uppercase mb-2">— O elige una plantilla base —</p>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {STARTER_TEMPLATES.map(st => (
                                    <button key={st.id} onClick={() => { setSelectedStarter(st); setSelectedType(st.type); }}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${selectedStarter?.id === st.id ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/30' : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50'}`}>
                                        <span className="text-2xl">{st.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-sm text-slate-800 truncate">{st.name}</div>
                                            <div className="text-[10px] text-slate-500 truncate">{st.description}</div>
                                        </div>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${st.type === 'LABEL' ? 'bg-indigo-50 text-indigo-600' : 'bg-purple-50 text-purple-600'}`}>{st.type}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <button onClick={onInitCreation} disabled={!isFormValid}
                            className={`w-full py-3 font-bold rounded-xl shadow-lg transition-all mb-3 ${!isFormValid ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02]'}`}>
                            {isFormValid ? 'CREAR DISEÑO' : (!hasName ? 'Escriba un nombre' : 'Seleccione Tipo')}
                        </button>
                        <button onClick={() => setShowCreateModal(false)} className="w-full py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Cancelar</button>
                    </div>
                </div>
            )}
        </div>
    );
}
