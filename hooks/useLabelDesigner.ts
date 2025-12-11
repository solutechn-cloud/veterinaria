
import { useState, useRef, useCallback, useEffect } from 'react';
import { LabelTemplate, LabelElement } from '../types';
import { LabelService, AdminService } from '../services/api';
import Swal from 'sweetalert2';

// Constants
export const MM_TO_PX = 3.7795; // 96 DPI
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

// Definición de Tipos para Esquema Relacional
interface SchemaTable {
    columns: { name: string, type: string }[];
    relations: { column: string, foreignTable: string, foreignColumn: string }[];
}

export const useLabelDesigner = () => {
    // --- STATE ---
    const [template, setTemplate] = useState<LabelTemplate>(INITIAL_TEMPLATE);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(2);
    const [history, setHistory] = useState<LabelTemplate[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [dbSchema, setDbSchema] = useState<Record<string, SchemaTable>>({});
    const [clipboard, setClipboard] = useState<LabelElement | null>(null);
    
    // Interaction State
    const [interaction, setInteraction] = useState<{
        mode: 'NONE' | 'MOVE' | 'RESIZE' | 'ROTATE';
        startPos: { x: number, y: number };
        elementStart: { x: number, y: number, w: number, h: number, r: number };
        handle?: string; 
    }>({ mode: 'NONE', startPos: {x:0, y:0}, elementStart: {x:0, y:0, w:0, h:0, r:0} });

    // --- INITIALIZATION ---
    const loadTemplate = (tpl: LabelTemplate) => {
        setTemplate(tpl);
        setHistory([]);
        setHistoryIndex(-1);
    };

    const createNew = () => {
        setTemplate(INITIAL_TEMPLATE);
        setHistory([]);
        setHistoryIndex(-1);
        setZoom(window.innerWidth < 768 ? 1.5 : 3);
    };

    const fetchDbSchema = async () => {
        try {
            const schema: any = await AdminService.getSchema();
            setDbSchema(schema);
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchDbSchema();
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [selectedId, template, clipboard, historyIndex]);

    // --- HISTORY MANAGEMENT ---
    const addToHistory = (newState: LabelTemplate) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(JSON.parse(JSON.stringify(newState)));
        if (newHistory.length > 20) newHistory.shift();
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const undo = () => {
        if (historyIndex > 0) {
            setTemplate(history[historyIndex - 1]);
            setHistoryIndex(h => h - 1);
            setSelectedId(null);
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            setTemplate(history[historyIndex + 1]);
            setHistoryIndex(h => h + 1);
            setSelectedId(null);
        }
    };

    // --- ELEMENT MANIPULATION ---
    const updateTemplate = (updates: Partial<LabelTemplate>) => {
        const newState = { ...template, ...updates };
        setTemplate(newState);
        addToHistory(newState);
    };

    const updateElement = (id: string, updates: Partial<LabelElement>) => {
        const newElements = template.elements.map(el => el.id === id ? { ...el, ...updates } : el);
        setTemplate({ ...template, elements: newElements });
        // NOTE: We don't add to history on every tiny update (like slider drag), parent handles that on mouseUp
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
        if (type === 'QR') { newEl.content = 'QR CODE'; newEl.width = 15; newEl.height = 15; }
        if (type === 'SHAPE') { newEl.fill = 'transparent'; newEl.stroke = '#000000'; newEl.strokeWidth = 0.5; }
        if (type === 'DETAIL_TABLE') { newEl.width = template.width - 10; newEl.height = 15; newEl.content = 'TABLA DETALLE'; }

        const newElements = [...template.elements, newEl];
        updateTemplate({ elements: newElements });
        setSelectedId(newEl.id);
    };

    const deleteSelected = () => {
        if (selectedId) {
            const newElements = template.elements.filter(e => e.id !== selectedId);
            updateTemplate({ elements: newElements });
            setSelectedId(null);
        }
    };

    // --- LAYERS & ORDERING ---
    const moveLayer = (direction: 'UP' | 'DOWN' | 'TOP' | 'BOTTOM') => {
        if (!selectedId) return;
        const index = template.elements.findIndex(e => e.id === selectedId);
        if (index === -1) return;

        const newElements = [...template.elements];
        const el = newElements.splice(index, 1)[0];

        if (direction === 'TOP') newElements.push(el);
        else if (direction === 'BOTTOM') newElements.unshift(el);
        else if (direction === 'UP') newElements.splice(Math.min(index + 1, newElements.length), 0, el);
        else if (direction === 'DOWN') newElements.splice(Math.max(index - 1, 0), 0, el);

        updateTemplate({ elements: newElements });
    };

    // --- KEYBOARD SHORTCUTS ---
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
        // Ignorar si está escribiendo en un input
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

        // Undo / Redo
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }

        // Copy / Paste
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            if (selectedId) {
                const el = template.elements.find(x => x.id === selectedId);
                if (el) setClipboard(el);
            }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            if (clipboard) {
                addElement(clipboard.type, {
                    ...clipboard,
                    x: clipboard.x + 2,
                    y: clipboard.y + 2
                });
            }
            return;
        }

        // Delete (Only Delete Key, Backspace Removed)
        if (e.key === 'Delete') {
            if (selectedId) deleteSelected();
            return;
        }

        // Arrow Keys (Nudge)
        if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const el = template.elements.find(x => x.id === selectedId);
            if (!el) return;

            const step = e.shiftKey ? 10 : 0.5; // mm
            let { x, y } = el;

            if (e.key === 'ArrowUp') y -= step;
            if (e.key === 'ArrowDown') y += step;
            if (e.key === 'ArrowLeft') x -= step;
            if (e.key === 'ArrowRight') x += step;

            updateElement(selectedId, { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) });
        }
        
        // Escape
        if (e.key === 'Escape') setSelectedId(null);
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
            return true;
        } catch (e: any) { 
            Swal.fire('Error', e.message, 'error'); 
            return false;
        }
    };

    // --- INTERACTION LOGIC (CANVAS) ---
    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, id: string, mode: 'MOVE'|'RESIZE'|'ROTATE', handle?: string) => {
        e.stopPropagation();
        const el = template.elements.find(x => x.id === id);
        if (!el) return;
        
        setSelectedId(id);
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

    return {
        template, setTemplate,
        selectedId, setSelectedId,
        zoom, setZoom,
        history, historyIndex,
        dbSchema,
        loadTemplate, createNew,
        undo, redo,
        addElement, updateElement, deleteSelected, updateTemplate,
        saveTemplate,
        moveLayer,
        interaction,
        handlePointerDown, handlePointerMove, handlePointerUp
    };
};
