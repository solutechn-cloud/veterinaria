import { LabelTemplate, LabelElement, SummaryRow } from '../types';
import { generateId, defaultInvoiceColumns } from './labelDesignerUtils';

export function useLabelDesignerElements(
    template: LabelTemplate,
    setTemplate: React.Dispatch<React.SetStateAction<LabelTemplate>>,
    selectedId: string | null,
    setSelectedId: (id: string | null) => void,
    selectedIds: string[],
    setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>,
    addToHistory: (s: LabelTemplate) => void,
    setTool: (t: 'SELECT' | 'HAND') => void,
) {
    const updateTemplate = (updates: Partial<LabelTemplate>) => {
        const newState = { ...template, ...updates };
        setTemplate(newState);
        addToHistory(newState);
    };

    const updateElement = (id: string, updates: Partial<LabelElement>) => {
        const newElements = template.elements.map(el => el.id === id ? { ...el, ...updates } : el);
        setTemplate({ ...template, elements: newElements });
    };

    const updateMultipleElements = (ids: string[], updates: Partial<LabelElement>) => {
        const newElements = template.elements.map(el => ids.includes(el.id) ? { ...el, ...updates } : el);
        const newTpl = { ...template, elements: newElements };
        setTemplate(newTpl);
        addToHistory(newTpl);
    };

    const addElement = (type: LabelElement['type'], extra: Partial<LabelElement> = {}) => {
        const isDoc = template.type === 'DOCUMENT';
        const defW = isDoc ? 5 : 30;
        const defH = isDoc ? 2 : 5;
        const { id: _dropId, ...restExtra } = extra as any;

        const newEl: LabelElement = {
            id: generateId(),
            type,
            x: isDoc ? 2 : 5, y: isDoc ? 2 : 5,
            width: defW, height: defH,
            rotation: 0,
            content: type === 'TEXT' ? 'Texto' : '',
            fontSize: 10, color: '#000000', textAlign: 'left', fontWeight: 'normal', fontFamily: 'helvetica',
            barcodeFormat: 'CODE128', displayValue: true, shapeType: 'RECTANGLE',
            isStretchWithOverflow: false, opacity: 1,
            ...restExtra,
        };

        if (type === 'BARCODE')  { newEl.content = '123456'; newEl.width = isDoc?6:30; newEl.height = isDoc?2:10; }
        if (type === 'QR')       { newEl.content = 'QR CODE'; newEl.width = isDoc?3:15; newEl.height = isDoc?3:15; }
        if (type === 'SHAPE')    { newEl.fill = 'transparent'; newEl.stroke = '#000000'; newEl.strokeWidth = 0.5; newEl.width = isDoc?4:15; newEl.height = isDoc?4:15; }
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
                { id: 's2', label: 'ISV (15%):', field: '{{venta.isv}}',       format: 'CURRENCY', bold: false },
                { id: 's3', label: 'TOTAL:',     field: '{{venta.total}}',     format: 'CURRENCY', bold: true, separator: true },
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

        updateTemplate({ elements: [...template.elements, newEl] });
        setSelectedId(newEl.id);
        setSelectedIds([newEl.id]);
        setTool('SELECT');
    };

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
            x: startX, y: startY, width: logoW, height: logoH,
            content: '{{empresa.logoBase64}}',
            imageObjectFit: 'contain',
            fontSize: 10, color: '#000000', textAlign: 'left',
            fontWeight: 'normal', fontFamily: 'helvetica',
            elementLabel: 'Logo Empresa',
        };

        const textFields = [
            { content: '{{empresa.nombreEmpresa}}', fontSize: isDoc ? 11 : 9, fontWeight: 'bold',   label: 'Nombre Empresa' },
            { content: 'RTN: {{empresa.rtn}}',       fontSize: isDoc ? 9  : 8, fontWeight: 'normal', label: 'RTN' },
            { content: '{{empresa.direccion}}',       fontSize: isDoc ? 9  : 8, fontWeight: 'normal', label: 'Dirección' },
            { content: 'Tel: {{empresa.telefono}}',   fontSize: isDoc ? 9  : 8, fontWeight: 'normal', label: 'Teléfono' },
            { content: '{{empresa.correo}}',          fontSize: isDoc ? 9  : 8, fontWeight: 'normal', label: 'Correo' },
            ...(isDoc ? [
                { content: 'CAI: {{empresa.cai}}',                                             fontSize: 8, fontWeight: 'normal', label: 'CAI' },
                { content: 'Rango Autorizado: {{empresa.rangoInicial}} - {{empresa.rangoFinal}}', fontSize: 8, fontWeight: 'normal', label: 'Rango Autorizado' },
                { content: 'Fecha Límite de Emisión: {{empresa.fechaLimite}}',                 fontSize: 8, fontWeight: 'normal', label: 'Fecha Límite CAI' },
                { content: '{{empresa.mensajeFinal}}',                                         fontSize: 8, fontWeight: 'normal', label: 'Mensaje Final' },
            ] : []),
        ];

        let textY = startY;
        const textEls: LabelElement[] = textFields.map(f => {
            const el: LabelElement = {
                ...base as any,
                id: generateId(), type: 'TEXT',
                x: textX, y: textY, width: textW, height: lineH,
                content: f.content,
                fontSize: f.fontSize, fontWeight: f.fontWeight as any,
                color: '#000000', textAlign: 'left',
                fontFamily: 'helvetica', isMultiline: false,
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

    const insertClienteAsElements = () => {
        const isDoc = template.type === 'DOCUMENT';
        const startX = isDoc ? 1 : 5;
        const startY = isDoc ? 0.5 : 5;
        const textW  = template.width - (isDoc ? 2 : 10);
        const lineH  = isDoc ? 0.65 : 5;

        const base: Partial<LabelElement> = {
            rotation: 0, opacity: 1,
            barcodeFormat: 'CODE128' as any, displayValue: true,
            shapeType: 'RECTANGLE' as any, isStretchWithOverflow: false,
        };

        const textFields = [
            { content: 'No. Factura: {{venta.numeroFactura}}',   fontSize: isDoc ? 9 : 8, fontWeight: 'normal', label: 'Número de Factura' },
            { content: 'Fecha: {{venta.fecha}}',                 fontSize: isDoc ? 9 : 8, fontWeight: 'normal', label: 'Fecha de Facturación' },
            { content: 'Cliente: {{cliente.nombre}}',           fontSize: isDoc ? 9 : 8, fontWeight: 'normal', label: 'Nombre Cliente' },
            { content: 'RTN / Identidad: {{cliente.identidad}}', fontSize: isDoc ? 9 : 8, fontWeight: 'normal', label: 'RTN Cliente' },
        ];

        let textY = startY;
        const newEls: LabelElement[] = textFields.map(f => {
            const el: LabelElement = {
                ...base as any,
                id: generateId(), type: 'TEXT',
                x: startX, y: textY, width: textW, height: lineH,
                content: f.content,
                fontSize: f.fontSize, fontWeight: f.fontWeight as any,
                color: '#000000', textAlign: 'left',
                fontFamily: 'helvetica', isMultiline: false,
                elementLabel: f.label,
            };
            textY += lineH;
            return el;
        });

        updateTemplate({ elements: [...template.elements, ...newEls] });
        setSelectedId(newEls[0].id);
        setSelectedIds(newEls.map(e => e.id));
        setTool('SELECT');
    };

    const deleteSelected = () => {
        if (selectedId) {
            updateTemplate({ elements: template.elements.filter(e => e.id !== selectedId) });
            setSelectedId(null);
            setSelectedIds([]);
        }
    };

    const moveLayer = (direction: 'UP' | 'DOWN' | 'TOP' | 'BOTTOM') => {
        if (!selectedId) return;
        const index = template.elements.findIndex(e => e.id === selectedId);
        if (index === -1) return;
        const newElements = [...template.elements];
        const el = newElements.splice(index, 1)[0];
        if (direction === 'TOP')    newElements.push(el);
        else if (direction === 'BOTTOM') newElements.unshift(el);
        else if (direction === 'UP')   newElements.splice(Math.min(index + 1, newElements.length), 0, el);
        else if (direction === 'DOWN') newElements.splice(Math.max(index - 1, 0), 0, el);
        updateTemplate({ elements: newElements });
    };

    const reorderElements = (fromIndex: number, toIndex: number) => {
        const newElements = [...template.elements];
        const [moved] = newElements.splice(fromIndex, 1);
        newElements.splice(toIndex, 0, moved);
        updateTemplate({ elements: newElements });
    };

    const alignElements = (direction: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => {
        if (selectedIds.length < 2) return;
        const els = template.elements.filter(e => selectedIds.includes(e.id));
        let newElements = [...template.elements];
        if (direction === 'left') {
            const minX = Math.min(...els.map(e => e.x));
            newElements = newElements.map(e => selectedIds.includes(e.id) ? { ...e, x: minX } : e);
        } else if (direction === 'center-h') {
            const minX = Math.min(...els.map(e => e.x));
            const maxX = Math.max(...els.map(e => e.x + e.width));
            const cX = (minX + maxX) / 2;
            newElements = newElements.map(e => selectedIds.includes(e.id) ? { ...e, x: cX - e.width / 2 } : e);
        } else if (direction === 'right') {
            const maxX = Math.max(...els.map(e => e.x + e.width));
            newElements = newElements.map(e => selectedIds.includes(e.id) ? { ...e, x: maxX - e.width } : e);
        } else if (direction === 'top') {
            const minY = Math.min(...els.map(e => e.y));
            newElements = newElements.map(e => selectedIds.includes(e.id) ? { ...e, y: minY } : e);
        } else if (direction === 'center-v') {
            const minY = Math.min(...els.map(e => e.y));
            const maxY = Math.max(...els.map(e => e.y + e.height));
            const cY = (minY + maxY) / 2;
            newElements = newElements.map(e => selectedIds.includes(e.id) ? { ...e, y: cY - e.height / 2 } : e);
        } else if (direction === 'bottom') {
            const maxY = Math.max(...els.map(e => e.y + e.height));
            newElements = newElements.map(e => selectedIds.includes(e.id) ? { ...e, y: maxY - e.height } : e);
        }
        updateTemplate({ elements: newElements });
    };

    const distributeH = () => {
        if (selectedIds.length < 3) return;
        const els = [...template.elements.filter(e => selectedIds.includes(e.id))].sort((a, b) => a.x - b.x);
        const totalWidth = els.reduce((s, e) => s + e.width, 0);
        const span = els[els.length - 1].x + els[els.length - 1].width - els[0].x;
        const gap = (span - totalWidth) / (els.length - 1);
        let curX = els[0].x;
        const newElements = template.elements.map(e => {
            const i = els.findIndex(s => s.id === e.id);
            if (i === -1) return e;
            const result = { ...e, x: curX };
            curX += e.width + gap;
            return result;
        });
        updateTemplate({ elements: newElements });
    };

    return {
        updateTemplate, updateElement, updateMultipleElements,
        addElement, insertCompanyAsElements, insertClienteAsElements, deleteSelected,
        moveLayer, reorderElements, alignElements, distributeH,
    };
}
