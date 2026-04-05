
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

/**
 * Convierte un elemento COMPANY_HEADER monolítico en elementos individuales:
 * un IMAGE para el logo + un TEXT por cada campo de la empresa.
 * Usa el bounding box del elemento original para posicionar los sub-elementos.
 */
function expandCompanyHeader(ch: LabelElement): LabelElement[] {
    const {
        x, y, width: w, height: h,
        fontSize = 9, color = '#000000',
        companyShowRTN = true, companyShowPhone = true, companyShowEmail = false,
        companyAlign = 'left',
    } = ch;

    const base: Partial<LabelElement> = {
        rotation: 0, opacity: 1,
        barcodeFormat: 'CODE128' as any, displayValue: true,
        shapeType: 'RECTANGLE' as any, isStretchWithOverflow: false,
    };

    // Logo ocupa la parte izquierda — ancho ≈ h (área cuadrada) con máx 35% del ancho total
    const logoW = Math.min(h * 1.1, w * 0.35);
    const logoH = h;
    const gap   = w > 10 ? 0.3 : 2; // cm para documentos, mm para etiquetas
    const textX = x + logoW + gap;
    const textW = w - logoW - gap;

    // Campos a mostrar según propiedades del COMPANY_HEADER
    const fields: { content: string; bold: boolean; label: string }[] = [
        { content: '{{empresa.nombreEmpresa}}', bold: true,  label: 'Nombre Empresa' },
    ];
    if (companyShowRTN  !== false) fields.push({ content: 'RTN: {{empresa.rtn}}',       bold: false, label: 'RTN' });
    fields.push(                               { content: '{{empresa.direccion}}',       bold: false, label: 'Dirección' });
    if (companyShowPhone !== false) fields.push({ content: 'Tel: {{empresa.telefono}}',  bold: false, label: 'Teléfono' });
    if (companyShowEmail)           fields.push({ content: '{{empresa.correo}}',         bold: false, label: 'Correo' });

    const lineH = h / fields.length;

    const logoEl: LabelElement = {
        ...base as any,
        id: generateId(), type: 'IMAGE',
        x, y, width: logoW, height: logoH,
        content: '{{empresa.logoBase64}}',
        imageObjectFit: 'contain',
        fontSize: 10, color: '#000000', textAlign: 'left',
        fontWeight: 'normal', fontFamily: 'helvetica',
        elementLabel: 'Logo Empresa',
    };

    let textY = y;
    const textEls: LabelElement[] = fields.map(f => {
        const el: LabelElement = {
            ...base as any,
            id: generateId(), type: 'TEXT',
            x: textX, y: textY,
            width: textW, height: lineH,
            content: f.content,
            fontSize: f.bold ? fontSize + 2 : fontSize,
            fontWeight: f.bold ? 'bold' : 'normal',
            color, textAlign: companyAlign as any,
            fontFamily: 'helvetica',
            isMultiline: false,
            elementLabel: f.label,
        };
        textY += lineH;
        return el;
    });

    return [logoEl, ...textEls];
}

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
        /** Start positions for all elements in a multi-element drag */
        multiElementStarts?: Record<string, { x: number; y: number }>;
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
    const computeFitZoom = (tpl: LabelTemplate): number => {
        const scale = tpl.type === 'DOCUMENT' ? CM_TO_PX : MM_TO_PX;
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        const availW = (typeof window !== 'undefined' ? window.innerWidth : 1200) - (isMobile ? 48 : 340);
        const availH = (typeof window !== 'undefined' ? window.innerHeight : 800) - (isMobile ? 180 : 130);
        const fw = availW / (tpl.width * scale);
        const fh = availH / (tpl.height * scale);
        return Math.max(0.2, Math.min(isMobile ? 2 : 3, Math.min(fw, fh)));
    };

    const loadTemplate = (tpl: LabelTemplate) => {
        // Auto-expand COMPANY_HEADER blocks into individual editable elements
        const hasCompanyHeader = tpl.elements.some(e => e.type === 'COMPANY_HEADER');
        const resolvedElements = hasCompanyHeader
            ? tpl.elements.flatMap(e => e.type === 'COMPANY_HEADER' ? expandCompanyHeader(e) : [e])
            : tpl.elements;
        const resolvedTpl = hasCompanyHeader ? { ...tpl, elements: resolvedElements } : tpl;

        setTemplate(resolvedTpl);
        setHistory([]);
        setHistoryIndex(-1);
        setSelectedIds([]);
        setSelectedId(null);
        setZoom(computeFitZoom(resolvedTpl));
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
        setZoom(computeFitZoom({
            ...INITIAL_TEMPLATE,
            type,
            width: type === 'DOCUMENT' ? 21 : 50,
            height: type === 'DOCUMENT' ? 29.7 : 25,
        }));
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

        // Strip any incoming id so paste/duplicate always gets a fresh unique ID
        const { id: _dropId, ...restExtra } = extra as any;

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
            ...restExtra
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
        // Note: insertCompanyAsElements handles COMPANY_HEADER as separate elements
        updateTemplate({ elements: newElements });
        setSelectedId(newEl.id);
        setSelectedIds([newEl.id]);
        setTool('SELECT'); // Switch to select mode after adding
    };

    /**
     * Inserts the company header as individual, independently-editable elements:
     * one IMAGE for the logo + one TEXT per info field.
     */
    const insertCompanyAsElements = () => {
        const isDoc = template.type === 'DOCUMENT';
        const startX = isDoc ? 1 : 5;
        const startY = isDoc ? 0.5 : 5;
        const pageW  = template.width - (isDoc ? 2 : 10);
        const lineH  = isDoc ? 0.65 : 5;
        const logoW  = isDoc ? 3.2 : 20;
        const logoH  = isDoc ? 2.5 : 18;
        const textX  = startX + logoW + (isDoc ? 0.3 : 2);
        const textW  = pageW - logoW - (isDoc ? 0.3 : 2);

        const base: Partial<LabelElement> = {
            rotation: 0, opacity: 1,
            barcodeFormat: 'CODE128' as any, displayValue: true,
            shapeType: 'RECTANGLE' as any, isStretchWithOverflow: false,
        };

        const logoEl: LabelElement = {
            ...base as any,
            id: generateId(), type: 'IMAGE',
            x: startX, y: startY,
            width: logoW, height: logoH,
            content: '{{empresa.logoBase64}}',
            imageObjectFit: 'contain',
            fontSize: 10, color: '#000000', textAlign: 'left',
            fontWeight: 'normal', fontFamily: 'helvetica',
            elementLabel: 'Logo Empresa',
        };

        const textFields = [
            { content: '{{empresa.nombreEmpresa}}', fontSize: isDoc ? 11 : 9, fontWeight: 'bold',   label: 'Nombre Empresa' },
            { content: 'RTN: {{empresa.rtn}}',       fontSize: isDoc ? 9 : 8,  fontWeight: 'normal', label: 'RTN' },
            { content: '{{empresa.direccion}}',       fontSize: isDoc ? 9 : 8,  fontWeight: 'normal', label: 'Dirección' },
            { content: 'Tel: {{empresa.telefono}}',   fontSize: isDoc ? 9 : 8,  fontWeight: 'normal', label: 'Teléfono' },
            { content: '{{empresa.correo}}',          fontSize: isDoc ? 9 : 8,  fontWeight: 'normal', label: 'Correo' },
        ];

        let textY = startY;
        const textEls: LabelElement[] = textFields.map(f => {
            const el: LabelElement = {
                ...base as any,
                id: generateId(), type: 'TEXT',
                x: textX, y: textY,
                width: textW, height: lineH,
                content: f.content,
                fontSize: f.fontSize,
                fontWeight: f.fontWeight as any,
                color: '#000000', textAlign: 'left',
                fontFamily: 'helvetica',
                isMultiline: false,
                elementLabel: f.label,
            };
            textY += lineH;
            return el;
        });

        const newEls = [logoEl, ...textEls];
        updateTemplate({ elements: [...template.elements, ...newEls] });
        setSelectedId(newEls[0].id);
        setSelectedIds(newEls.map(e => e.id));
        setTool('SELECT');
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

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            const allIds = template.elements.filter(el => el.visible !== false).map(el => el.id);
            setSelectedIds(allIds);
            if (allIds.length > 0) setSelectedId(allIds[0]);
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
                const offset = template.type === 'DOCUMENT' ? 1.5 : 5;
                addElement(clipboard.type, {
                    ...clipboard,
                    x: clipboard.x + offset,
                    y: clipboard.y + offset,
                });
            }
            return;
        }

        // Ctrl+D — duplicate selected element(s)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            const idsToClone = selectedIds.length > 1 ? selectedIds : (selectedId ? [selectedId] : []);
            if (idsToClone.length === 0) return;
            const offset = template.type === 'DOCUMENT' ? 1.5 : 5;
            const clones = idsToClone.map(id => {
                const src = template.elements.find(x => x.id === id);
                if (!src) return null;
                return { ...src, id: generateId(), x: src.x + offset, y: src.y + offset };
            }).filter(Boolean) as typeof template.elements;
            if (clones.length === 0) return;
            const newElements = [...template.elements, ...clones];
            const newTemplate = { ...template, elements: newElements };
            setTemplate(newTemplate);
            addToHistory(newTemplate);
            setSelectedId(clones[clones.length - 1].id);
            setSelectedIds(clones.map(c => c.id));
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Don't delete when typing in an input/textarea
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
            if (selectedIds.length > 1) {
                const newEls = template.elements.filter(el => !selectedIds.includes(el.id));
                const newTpl = { ...template, elements: newEls };
                setTemplate(newTpl);
                addToHistory(newTpl);
                setSelectedId(null);
                setSelectedIds([]);
            } else if (selectedId) {
                deleteSelected();
            }
            return;
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const idsToMove = selectedIds.length > 1 ? selectedIds : (selectedId ? [selectedId] : []);
            if (idsToMove.length === 0) return;
            e.preventDefault();
            const step = e.shiftKey ? (template.type === 'DOCUMENT' ? 1 : 10) : (template.type === 'DOCUMENT' ? 0.1 : 0.5);
            const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
            const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
            const newEls = template.elements.map(el => {
                if (!idsToMove.includes(el.id)) return el;
                return { ...el, x: Number((el.x + dx).toFixed(2)), y: Number((el.y + dy).toFixed(2)) };
            });
            setTemplate({ ...template, elements: newEls });
        }

        if (e.key === 'Escape') { setSelectedId(null); setSelectedIds([]); }

        if (e.key === 'Tab') {
            e.preventDefault();
            const visible = template.elements.filter(el => el.visible !== false);
            if (!visible.length) return;
            const idx = visible.findIndex(el => el.id === selectedId);
            const next = e.shiftKey
                ? (idx - 1 + visible.length) % visible.length
                : (idx + 1) % visible.length;
            setSelectedId(visible[next].id);
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === ']' || e.key === '[')) {
            e.preventDefault();
            if (!selectedId) return;
            const el = template.elements.find(x => x.id === selectedId);
            if (!el || el.type !== 'TEXT') return;
            const current = el.fontSize || 10;
            updateElement(selectedId, { fontSize: Math.max(4, current + (e.key === ']' ? 1 : -1)) });
        }
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

            // For multi-element drag: capture start positions of ALL selected elements
            const multiStarts: Record<string, { x: number; y: number }> = {};
            if (mode === 'MOVE' && selectedIds.length > 1 && selectedIds.includes(id)) {
                template.elements.forEach(e2 => {
                    if (selectedIds.includes(e2.id)) multiStarts[e2.id] = { x: e2.x, y: e2.y };
                });
            }

            setInteraction({
                mode,
                startPos: { x: clientX, y: clientY },
                elementStart: { x: el.x, y: el.y, w: el.width, h: el.height, r: el.rotation },
                panStart: { x: 0, y: 0 },
                handle,
                multiElementStarts: Object.keys(multiStarts).length > 0 ? multiStarts : undefined,
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

        if (interaction.mode === 'MOVE' && interaction.multiElementStarts && Object.keys(interaction.multiElementStarts).length > 0) {
            // Move ALL selected elements by the same delta
            setTemplate(prev => ({
                ...prev,
                elements: prev.elements.map(el => {
                    const s = interaction.multiElementStarts![el.id];
                    if (!s) return el;
                    return { ...el, x: Number((s.x + deltaX).toFixed(2)), y: Number((s.y + deltaY).toFixed(2)) };
                })
            }));
            return;
        }

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
        insertCompanyAsElements,
        saveTemplate,
        moveLayer, reorderElements,
        alignElements, distributeH,
        interaction, scaleFactor, unitLabel,
        handlePointerDown, handlePointerMove, handlePointerUp,
        snapValue, snapGuides,
    };
};
