
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { LabelTemplate, LabelElement, InvoiceColumn, SummaryRow } from '../types';
import { LabelService, AdminService } from '../services/api';
import Swal from 'sweetalert2';

// Constants
export const MM_TO_PX = 3.7795; // 96 DPI / 25.4
export const CM_TO_PX = 37.795; // 96 DPI / 2.54

const INITIAL_TEMPLATE: LabelTemplate = {
  id: '',
  name: 'Nuevo Diseño',
  category: 'GENERAL',
  type: 'LABEL',
  dataSource: 'NONE',
  isDefault: false,
  width: 50, // mm default
  height: 25, // mm default
  elements: [],
  snapEnabled: false,
  gridSize: 5,
  showGrid: false,
};

const generateId = () => `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Definición de Tipos para Esquema Relacional
interface SchemaTable {
    columns: { name: string, type: string }[];
    relations: { column: string, foreignTable: string, foreignColumn: string }[];
}

const defaultInvoiceColumns: InvoiceColumn[] = [
  { id: 'c1', header: 'Descripción', field: '{{item.descripcion}}', widthPct: 45, align: 'left', format: 'TEXT' },
  { id: 'c2', header: 'Cant.', field: '{{item.cantidad}}', widthPct: 10, align: 'center', format: 'NUMBER' },
  { id: 'c3', header: 'P. Unit.', field: '{{item.precioVenta}}', widthPct: 15, align: 'right', format: 'CURRENCY' },
  { id: 'c4', header: 'ISV', field: '{{item.isv}}', widthPct: 10, align: 'right', format: 'CURRENCY' },
  { id: 'c5', header: 'Total', field: '{{item.total}}', widthPct: 20, align: 'right', format: 'CURRENCY' },
];

export const useLabelDesigner = () => {
    // --- STATE ---
    const [template, setTemplate] = useState<LabelTemplate>(INITIAL_TEMPLATE);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [zoom, setZoom] = useState(2); // Initial zoom factor
    const [history, setHistory] = useState<LabelTemplate[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [dbSchema, setDbSchema] = useState<Record<string, SchemaTable>>({});
    const [clipboard, setClipboard] = useState<LabelElement | null>(null);

    // Tools & Navigation
    const [tool, setTool] = useState<'SELECT' | 'HAND'>('SELECT');
    const [pan, setPan] = useState({ x: 0, y: 0 });

    // Derived State for Unit Scale
    const scaleFactor = template.type === 'DOCUMENT' ? CM_TO_PX : MM_TO_PX;
    const unitLabel = template.type === 'DOCUMENT' ? 'cm' : 'mm';

    // Interaction State
    const [interaction, setInteraction] = useState<{
        mode: 'NONE' | 'MOVE' | 'RESIZE' | 'ROTATE' | 'PANNING';
        startPos: { x: number, y: number };
        elementStart: { x: number, y: number, w: number, h: number, r: number };
        panStart: { x: number, y: number };
        handle?: string;
    }>({ mode: 'NONE', startPos: {x:0, y:0}, elementStart: {x:0, y:0, w:0, h:0, r:0}, panStart: {x:0, y:0} });

    // Snap Guide Lines (in template units, shown during MOVE)
    const [snapGuides, setSnapGuides] = useState<{ axis: 'x' | 'y'; pos: number }[]>([]);

    // --- SNAP HELPER ---
    const snapValue = (val: number): number => {
        if (!template.snapEnabled || !template.gridSize) return val;
        const gs = template.gridSize;
        return Math.round(val / gs) * gs;
    };

    // --- INITIALIZATION ---
    const loadTemplate = (tpl: LabelTemplate) => {
        setTemplate(tpl);
        setHistory([]);
        setHistoryIndex(-1);
        setSelectedIds([]);
        // Adjust zoom based on document type for better UX
        setZoom(tpl.type === 'DOCUMENT' ? 0.8 : 2.5);
        setPan({ x: 0, y: 0 });
        setTool('SELECT');
    };

    const createNew = (type: 'LABEL' | 'DOCUMENT', name: string) => {
        setTemplate({
            ...INITIAL_TEMPLATE,
            name,
            type,
            // A4 for Document (cm), Standard for Label (mm)
            width: type === 'DOCUMENT' ? 21 : 50,
            height: type === 'DOCUMENT' ? 29.7 : 25,
            category: type === 'DOCUMENT' ? 'REPORT' : 'GENERAL',
            elements: [],
            snapEnabled: false,
            gridSize: type === 'DOCUMENT' ? 1 : 5,
            showGrid: false,
        });
        setHistory([]);
        setHistoryIndex(-1);
        setSelectedIds([]);
        setZoom(type === 'DOCUMENT' ? 0.8 : 2.5);
        setPan({ x: 0, y: 0 });
        setTool('SELECT');
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
    };

    const addElement = (type: LabelElement['type'], extra: Partial<LabelElement> = {}) => {
        const isDoc = template.type === 'DOCUMENT';
        // Default sizes based on unit type
        const defW = isDoc ? 5 : 30; // 5cm vs 30mm
        const defH = isDoc ? 2 : 5;  // 2cm vs 5mm

        const newEl: LabelElement = {
            id: generateId(),
            type,
            x: isDoc ? 2 : 5, y: isDoc ? 2 : 5,
            width: defW,
            height: defH,
            rotation: 0,
            content: type === 'TEXT' ? 'Texto' : '',
            fontSize: 10, color: '#000000', textAlign: 'left', fontWeight: 'normal', fontFamily: 'helvetica',
            barcodeFormat: 'CODE128', displayValue: true, shapeType: 'RECTANGLE',
            isStretchWithOverflow: false,
            opacity: 1,
            ...extra
        };

        if (type === 'BARCODE') { newEl.content = '123456'; newEl.width = isDoc?6:30; newEl.height = isDoc?2:10; }
        if (type === 'QR') { newEl.content = 'QR CODE'; newEl.width = isDoc?3:15; newEl.height = isDoc?3:15; }
        if (type === 'SHAPE') { newEl.fill = 'transparent'; newEl.stroke = '#000000'; newEl.strokeWidth = 0.5; newEl.width = isDoc?4:15; newEl.height = isDoc?4:15; }
        if (type === 'INVOICE_TABLE') {
            newEl.width = template.width - (isDoc?2:10);
            newEl.height = isDoc?10:20;
            newEl.content = 'TABLA DETALLE';
            newEl.tableColumns = defaultInvoiceColumns;
            newEl.tableHeaderBg = '#1e293b';
            newEl.tableHeaderColor = '#ffffff';
            newEl.tableRowHeight = isDoc ? 0.8 : 8;
            newEl.tableAlternateRows = true;
            newEl.tableAlternateBg = '#f8fafc';
        }
        if (type === 'SUMMARY_BOX') {
            newEl.width = isDoc ? 5 : 30;
            newEl.height = isDoc ? 2.5 : 20;
            newEl.summaryRows = [
                { id: 's1', label: 'Descuento:', field: '{{venta.descuento}}', format: 'CURRENCY', bold: false },
                { id: 's2', label: 'ISV (15%):', field: '{{venta.isv}}', format: 'CURRENCY', bold: false },
                { id: 's3', label: 'TOTAL:', field: '{{venta.total}}', format: 'CURRENCY', bold: true, separator: true },
            ] as SummaryRow[];
            newEl.summaryFontSize = 9;
            newEl.summaryBg = 'transparent';
            newEl.summaryLabelColor = '#1e293b';
            newEl.summaryValueColor = '#1e293b';
        }
        if (type === 'COMPANY_HEADER') {
            newEl.width = template.width - (isDoc ? 2 : 10);
            newEl.height = isDoc ? 2.5 : 20;
            newEl.fontSize = isDoc ? 9 : 8;
            newEl.companyShowRTN = true;
            newEl.companyShowPhone = true;
            newEl.companyShowEmail = false;
            newEl.companyAlign = 'center';
        }

        const newElements = [...template.elements, newEl];
        updateTemplate({ elements: newElements });
        setSelectedId(newEl.id);
        setSelectedIds([newEl.id]);
        setTool('SELECT'); // Switch to select mode after adding
    };

    const deleteSelected = () => {
        if (selectedId) {
            const newElements = template.elements.filter(e => e.id !== selectedId);
            updateTemplate({ elements: newElements });
            setSelectedId(null);
            setSelectedIds([]);
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

    const reorderElements = (fromIndex: number, toIndex: number) => {
        const newElements = [...template.elements];
        const [movedItem] = newElements.splice(fromIndex, 1);
        newElements.splice(toIndex, 0, movedItem);
        updateTemplate({ elements: newElements });
    };

    // --- ALIGNMENT FUNCTIONS ---
    const alignElements = (direction: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => {
        if (selectedIds.length < 2) return;
        const els = template.elements.filter(e => selectedIds.includes(e.id));
        let newElements = [...template.elements];

        if (direction === 'left') {
            const minX = Math.min(...els.map(e => e.x));
            newElements = newElements.map(e => selectedIds.includes(e.id) ? {...e, x: minX} : e);
        } else if (direction === 'center-h') {
            const minX = Math.min(...els.map(e => e.x));
            const maxX = Math.max(...els.map(e => e.x + e.width));
            const centerX = (minX + maxX) / 2;
            newElements = newElements.map(e => selectedIds.includes(e.id) ? {...e, x: centerX - e.width/2} : e);
        } else if (direction === 'right') {
            const maxX = Math.max(...els.map(e => e.x + e.width));
            newElements = newElements.map(e => selectedIds.includes(e.id) ? {...e, x: maxX - e.width} : e);
        } else if (direction === 'top') {
            const minY = Math.min(...els.map(e => e.y));
            newElements = newElements.map(e => selectedIds.includes(e.id) ? {...e, y: minY} : e);
        } else if (direction === 'center-v') {
            const minY = Math.min(...els.map(e => e.y));
            const maxY = Math.max(...els.map(e => e.y + e.height));
            const centerY = (minY + maxY) / 2;
            newElements = newElements.map(e => selectedIds.includes(e.id) ? {...e, y: centerY - e.height/2} : e);
        } else if (direction === 'bottom') {
            const maxY = Math.max(...els.map(e => e.y + e.height));
            newElements = newElements.map(e => selectedIds.includes(e.id) ? {...e, y: maxY - e.height} : e);
        }
        updateTemplate({ elements: newElements });
    };

    const distributeH = () => {
        if (selectedIds.length < 3) return;
        const els = [...template.elements.filter(e => selectedIds.includes(e.id))].sort((a,b) => a.x - b.x);
        const totalWidth = els.reduce((s,e) => s + e.width, 0);
        const span = els[els.length-1].x + els[els.length-1].width - els[0].x;
        const gap = (span - totalWidth) / (els.length - 1);
        let curX = els[0].x;
        const newElements = template.elements.map(e => {
            const i = els.findIndex(s => s.id === e.id);
            if (i === -1) return e;
            const result = {...e, x: curX};
            curX += e.width + gap;
            return result;
        });
        updateTemplate({ elements: newElements });
    };

    // --- KEYBOARD SHORTCUTS ---
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            const ids = template.elements.map(el => el.id);
            setSelectedIds(ids);
            if (ids.length > 0) setSelectedId(ids[ids.length - 1]);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            if (selectedId) {
                const el = template.elements.find(x => x.id === selectedId);
                if (el) addElement(el.type, { ...el, x: el.x + (template.type==='DOCUMENT'?0.5:2), y: el.y + (template.type==='DOCUMENT'?0.5:2) });
            }
            return;
        }

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
                    x: clipboard.x + (template.type==='DOCUMENT'?0.5:2),
                    y: clipboard.y + (template.type==='DOCUMENT'?0.5:2)
                });
            }
            return;
        }

        if (e.key === 'Delete') {
            if (selectedId) deleteSelected();
            return;
        }

        if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const el = template.elements.find(x => x.id === selectedId);
            if (!el) return;

            const step = e.shiftKey ? (template.type==='DOCUMENT'?1:10) : (template.type==='DOCUMENT'?0.1:0.5);
            let { x, y } = el;

            if (e.key === 'ArrowUp') y -= step;
            if (e.key === 'ArrowDown') y += step;
            if (e.key === 'ArrowLeft') x -= step;
            if (e.key === 'ArrowRight') x += step;

            updateElement(selectedId, { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
        }

        if (e.key === 'Escape') { setSelectedId(null); setSelectedIds([]); }
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
    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, id: string | null, mode: 'MOVE'|'RESIZE'|'ROTATE'|'PANNING', handle?: string) => {
        e.stopPropagation();

        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const isShift = 'shiftKey' in e ? e.shiftKey : false;

        // If Tool is HAND, overwrite interaction to PANNING regardless of target
        if (tool === 'HAND') {
            setInteraction({
                mode: 'PANNING',
                startPos: { x: clientX, y: clientY },
                elementStart: { x:0, y:0, w:0, h:0, r:0 },
                panStart: { x: pan.x, y: pan.y }
            });
            return;
        }

        if (id) {
            const el = template.elements.find(x => x.id === id);
            if (!el) return;

            // Locked elements: allow selection but block MOVE/RESIZE/ROTATE
            if (el.locked && (mode === 'MOVE' || mode === 'RESIZE' || mode === 'ROTATE')) {
                setSelectedId(id);
                setSelectedIds([id]);
                return;
            }

            // Multi-select: shift+click
            if (isShift && mode === 'MOVE') {
                setSelectedIds(prev => {
                    if (prev.includes(id)) return prev.filter(x => x !== id);
                    return [...prev, id];
                });
                setSelectedId(id);
            } else if (mode !== 'RESIZE' && mode !== 'ROTATE') {
                setSelectedId(id);
                setSelectedIds([id]);
            } else {
                setSelectedId(id);
            }

            setInteraction({
                mode,
                startPos: { x: clientX, y: clientY },
                elementStart: { x: el.x, y: el.y, w: el.width, h: el.height, r: el.rotation },
                panStart: { x: 0, y: 0 },
                handle
            });
        } else {
            // Clicked on empty canvas -> Deselect
            setSelectedId(null);
            setSelectedIds([]);
        }
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (interaction.mode === 'NONE') return;

        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        if (interaction.mode === 'PANNING') {
            e.preventDefault(); // Prevent scroll on touch
            const deltaX = clientX - interaction.startPos.x;
            const deltaY = clientY - interaction.startPos.y;
            setPan({
                x: interaction.panStart.x + deltaX,
                y: interaction.panStart.y + deltaY
            });
            return;
        }

        if (!selectedId) return;

        const deltaX = (clientX - interaction.startPos.x) / (scaleFactor * zoom);
        const deltaY = (clientY - interaction.startPos.y) / (scaleFactor * zoom);

        const start = interaction.elementStart;
        let newEl = { ...template.elements.find(x => x.id === selectedId)! };

        if (interaction.mode === 'MOVE') {
            let rawX = start.x + deltaX;
            let rawY = start.y + deltaY;

            // --- SNAP GUIDES: compare moving element edges to other elements ---
            const others = template.elements.filter(e => e.id !== selectedId);
            const threshold = template.type === 'DOCUMENT' ? 0.25 : 2.5;
            const guides: { axis: 'x' | 'y'; pos: number }[] = [];

            // X-axis snapping (left, center, right)
            const mLeft   = rawX;
            const mCenterX = rawX + newEl.width / 2;
            const mRight  = rawX + newEl.width;
            let snapX: number | null = null;
            let snapXOffset = 0;
            for (const o of others) {
                for (const [oEdge, mEdge, offset] of [
                    [o.x, mLeft, 0],
                    [o.x + o.width, mLeft, 0],
                    [o.x, mRight, -newEl.width],
                    [o.x + o.width, mRight, -newEl.width],
                    [o.x + o.width / 2, mCenterX, -newEl.width / 2],
                ] as [number, number, number][]) {
                    if (Math.abs(oEdge - mEdge) < threshold && (snapX === null || Math.abs(oEdge - mEdge) < Math.abs(snapX - (mLeft - snapXOffset)))) {
                        snapX = oEdge; snapXOffset = offset;
                        if (!guides.find(g => g.axis === 'x' && Math.abs(g.pos - oEdge) < 0.01)) guides.push({ axis: 'x', pos: oEdge });
                    }
                }
            }
            if (snapX !== null) rawX = snapX + snapXOffset;

            // Y-axis snapping (top, center, bottom)
            const mTop    = rawY;
            const mCenterY = rawY + newEl.height / 2;
            const mBottom = rawY + newEl.height;
            let snapY: number | null = null;
            let snapYOffset = 0;
            for (const o of others) {
                for (const [oEdge, mEdge, offset] of [
                    [o.y, mTop, 0],
                    [o.y + o.height, mTop, 0],
                    [o.y, mBottom, -newEl.height],
                    [o.y + o.height, mBottom, -newEl.height],
                    [o.y + o.height / 2, mCenterY, -newEl.height / 2],
                ] as [number, number, number][]) {
                    if (Math.abs(oEdge - mEdge) < threshold && (snapY === null || Math.abs(oEdge - mEdge) < Math.abs(snapY - (mTop - snapYOffset)))) {
                        snapY = oEdge; snapYOffset = offset;
                        if (!guides.find(g => g.axis === 'y' && Math.abs(g.pos - oEdge) < 0.01)) guides.push({ axis: 'y', pos: oEdge });
                    }
                }
            }
            if (snapY !== null) rawY = snapY + snapYOffset;

            setSnapGuides(guides);
            newEl.x = snapValue(Number(rawX.toFixed(2)));
            newEl.y = snapValue(Number(rawY.toFixed(2)));
        } else if (interaction.mode === 'RESIZE' && interaction.handle) {
            const h = interaction.handle;
            if (h.includes('e')) newEl.width = Math.max(1, Number((start.w + deltaX).toFixed(2)));
            if (h.includes('s')) newEl.height = Math.max(0.5, Number((start.h + deltaY).toFixed(2)));
            if (h.includes('w')) { newEl.x = Number((start.x + deltaX).toFixed(2)); newEl.width = Math.max(1, Number((start.w - deltaX).toFixed(2))); }
            if (h.includes('n')) { newEl.y = Number((start.y + deltaY).toFixed(2)); newEl.height = Math.max(0.5, Number((start.h - deltaY).toFixed(2))); }
        } else if (interaction.mode === 'ROTATE') {
            newEl.rotation = (start.r + ((clientX - interaction.startPos.x)/2)) % 360;
        }
        setTemplate(prev => ({ ...prev, elements: prev.elements.map(el => el.id === selectedId ? newEl : el) }));
    };

    const handlePointerUp = () => {
        if (interaction.mode !== 'NONE' && interaction.mode !== 'PANNING') {
            addToHistory(template);
        }
        setSnapGuides([]);
        setInteraction({ ...interaction, mode: 'NONE' });
    };

    return {
        template, setTemplate,
        selectedId, setSelectedId,
        selectedIds, setSelectedIds,
        zoom, setZoom,
        tool, setTool, pan, setPan,
        history, historyIndex,
        dbSchema,
        loadTemplate, createNew,
        undo, redo,
        addElement, updateElement, deleteSelected, updateTemplate,
        saveTemplate,
        moveLayer, reorderElements,
        alignElements, distributeH,
        interaction, scaleFactor, unitLabel,
        handlePointerDown, handlePointerMove, handlePointerUp,
        snapValue, snapGuides,
    };
};
