
import React, { memo, useRef, useEffect, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { RotateCw, ZoomIn, ZoomOut, Maximize, Lock } from 'lucide-react';
import { LabelTemplate, LabelElement, InvoiceColumn, SummaryRow, EmpresaConfig } from '../../types';

const defaultCols: InvoiceColumn[] = [
  { id: 'c1', header: 'Descripción', field: '{{item.descripcion}}', widthPct: 45, align: 'left', format: 'TEXT' },
  { id: 'c2', header: 'Cant.', field: '{{item.cantidad}}', widthPct: 10, align: 'center', format: 'NUMBER' },
  { id: 'c3', header: 'P. Unit.', field: '{{item.precioVenta}}', widthPct: 15, align: 'right', format: 'CURRENCY' },
  { id: 'c4', header: 'ISV', field: '{{item.isv}}', widthPct: 10, align: 'right', format: 'CURRENCY' },
  { id: 'c5', header: 'Total', field: '{{item.total}}', widthPct: 20, align: 'right', format: 'CURRENCY' },
];

interface DesignerCanvasProps {
    template: LabelTemplate;
    selectedId: string | null;
    selectedIds?: string[];
    zoom: number;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    setPan?: (p: {x:number;y:number}) => void;
    setSelectedId: (id: string | null) => void;
    onPointerDown: (e: any, id: string | null, mode: any, handle?: string) => void;
    tool: 'SELECT' | 'HAND';
    pan: { x: number, y: number };
    editingId?: string | null;
    onStartEdit?: (id: string) => void;
    onCommitEdit?: (id: string, value: string) => void;
    snapGuides?: { axis: 'x' | 'y'; pos: number }[];
    onContextMenu?: (e: React.MouseEvent, id: string) => void;
    empresaConfig?: Partial<EmpresaConfig>;
}

/** Resuelve tokens {{empresa.X}} en el canvas para preview */
function resolveEmpresaTokens(content: string, emp: Partial<EmpresaConfig>): string {
    return content.replace(/\{\{empresa\.(\w+)\}\}/g, (_, key) => {
        const val = (emp as any)[key];
        return val !== undefined && val !== null ? String(val) : `{{empresa.${key}}}`;
    });
}

const renderBarcode = (el: LabelElement) => {
    const canvas = document.createElement('canvas');
    try {
        // FIX: If content has variable braces {{...}}, render a generic code for preview
        const hasVariable = /{{.*?}}/.test(el.content);
        const content = hasVariable ? '123456' : el.content;

        JsBarcode(canvas, content, {
            format: (el.barcodeFormat as any) || "CODE128",
            displayValue: el.displayValue,
            margin: 0, width: 2, height: 50, fontSize: 20,
            lineColor: el.barcodeFgColor || '#000000',
            background: el.barcodeBgColor || '#ffffff',
        });
        return canvas.toDataURL("image/png");
    } catch (e) { return ''; }
};

// QR rendering is async — handled inside CanvasElement via useState/useEffect

const CLIP_PATHS: Record<string, string> = {
  TRIANGLE_TL: 'polygon(0 0, 100% 0, 0 100%)',
  TRIANGLE_TR: 'polygon(0 0, 100% 0, 100% 100%)',
  TRIANGLE_BL: 'polygon(0 0, 0 100%, 100% 100%)',
  TRIANGLE_BR: 'polygon(100% 0, 100% 100%, 0 100%)',
  RHOMBUS:     'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
};

// Memoized Element with Scale Injection
const CanvasElement = memo(({ el, isSelected, isMultiSelected, scale, onPointerDown, onSelect, tool, isEditing, onStartEdit, onCommitEdit, onContextMenu, empresaConfig }: any) => {
    const emp: Partial<EmpresaConfig> = empresaConfig || {};
    // QR: async rendering with local state
    const [qrSrc, setQrSrc] = useState('');
    useEffect(() => {
        if (el.type === 'QR') {
            const hasVariable = /{{.*?}}/.test(el.content);
            const content = hasVariable ? 'DEMO-QR' : (el.content || 'QR');
            QRCode.toDataURL(content, {
                margin: 0,
                color: {
                    dark: el.qrFgColor || '#000000',
                    light: el.qrBgColor || '#ffffff',
                }
            })
                .then((url: string) => setQrSrc(url))
                .catch(() => setQrSrc(''));
        }
    }, [el.type, el.content, el.qrFgColor, el.qrBgColor]);
    // Logic for "Hollow" objects:
    const isHollow = el.type === 'SHAPE' && (el.fill === 'transparent' || !el.fill) && !CLIP_PATHS[el.shapeType || ''];
    const isLocked = el.locked === true;
    const hasCondition = !!el.visibilityCondition;

    // CRITICAL FIX: If tool is HAND, disable pointer events on individual elements
    const pointerEventsClass = tool === 'HAND' ? 'pointer-events-none' : (isHollow && !isEditing ? 'pointer-events-none' : '');

    const showHandles = isSelected && tool === 'SELECT' && !isEditing && !isLocked;

    // Shadow CSS
    const shadowStyle = el.shadowEnabled
        ? `drop-shadow(${el.shadowOffsetX ?? 2}px ${el.shadowOffsetY ?? 2}px ${el.shadowBlur ?? 4}px ${el.shadowColor ?? 'rgba(0,0,0,0.3)'})`
        : undefined;

    return (
        <div
            onMouseDown={(e) => { if (isEditing || isLocked) return; tool === 'SELECT' && onPointerDown(e, el.id, 'MOVE'); }}
            onTouchStart={(e) => { if (isEditing || isLocked) return; tool === 'SELECT' && onPointerDown(e, el.id, 'MOVE'); }}
            onDoubleClick={(e) => { if (tool === 'SELECT' && el.type === 'TEXT' && !isLocked) { e.stopPropagation(); onStartEdit?.(el.id); } }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e, el.id); }}
            className={`absolute group select-none ${isEditing ? 'cursor-text' : isLocked ? 'cursor-default' : 'cursor-move'}
                ${isSelected ? 'z-50 outline outline-2 outline-indigo-500' : isMultiSelected ? 'z-40 outline outline-2 outline-blue-400 outline-dashed' : 'z-10 hover:outline hover:outline-1 hover:outline-indigo-300'}
                ${pointerEventsClass}`}
            style={{
                left: `${el.x * scale}px`,
                top: `${el.y * scale}px`,
                width: `${el.width * scale}px`,
                height: `${el.height * scale}px`,
                transform: `rotate(${el.rotation}deg)`,
                opacity: el.opacity ?? 1,
                filter: shadowStyle,
            }}
            onClick={(e) => { if (isEditing) return; e.stopPropagation(); if(tool === 'SELECT') onSelect(el.id, e); }}
        >
            {/* Inner Content */}
            <div className={`w-full h-full overflow-hidden flex items-center justify-center relative ${tool === 'HAND' ? '' : (isHollow ? 'pointer-events-none' : '')}`} style={{
                borderRadius: el.shapeType === 'CIRCLE' ? '50%' : (el.borderRadius ? `${el.borderRadius}px` : '0'),
                background: el.type === 'SHAPE'
                    ? (el.gradientEnabled && el.gradientColor1 && el.gradientColor2
                        ? (el.gradientType === 'radial'
                            ? `radial-gradient(circle, ${el.gradientColor1}, ${el.gradientColor2})`
                            : `linear-gradient(${el.gradientAngle ?? 135}deg, ${el.gradientColor1}, ${el.gradientColor2})`)
                        : (el.fill || 'transparent'))
                    : 'transparent',
                clipPath: el.type === 'SHAPE' ? (CLIP_PATHS[el.shapeType || ''] ?? undefined) : undefined,
            }}>
                {/* Border overlay: only for RECTANGLE/CIRCLE (clip-path shapes don't support CSS border) */}
                {el.type === 'SHAPE' && !CLIP_PATHS[el.shapeType || ''] && el.shapeType !== 'LINE' && (
                    <div
                        className={tool === 'SELECT' && isHollow ? 'pointer-events-auto' : ''}
                        style={{
                            position: 'absolute', inset: 0,
                            border: `${(el.strokeWidth||1)}px solid ${el.stroke}`,
                            borderRadius: el.shapeType === 'CIRCLE' ? '50%' : (el.borderRadius ? `${el.borderRadius}px` : '0'),
                        }}
                    />
                )}

                {el.type === 'TEXT' && isEditing ? (
                    <textarea
                        autoFocus
                        defaultValue={el.content}
                        style={{
                            width: '100%', height: '100%',
                            fontSize: `${(el.fontSize||10)}pt`,
                            fontFamily: el.fontFamily,
                            fontWeight: el.fontWeight,
                            fontStyle: el.italic ? 'italic' : 'normal',
                            color: el.color,
                            textAlign: el.textAlign,
                            lineHeight: String(el.lineHeight || 1.2),
                            letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : 'normal',
                            background: el.backgroundColor || 'transparent',
                            border: 'none', outline: '2px solid #6366f1',
                            resize: 'none', padding: '0 2px',
                            boxSizing: 'border-box',
                        }}
                        onBlur={e => onCommitEdit?.(el.id, e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Escape') { onCommitEdit?.(el.id, el.content); }
                            if (e.key === 'Enter' && !el.isMultiline) { e.preventDefault(); e.currentTarget.blur(); }
                        }}
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                    />
                ) : el.type === 'TEXT' ? (
                    <div className={tool === 'SELECT' ? 'pointer-events-auto' : ''} style={{
                        fontSize: `${(el.fontSize||10)}pt`,
                        fontFamily: el.fontFamily,
                        fontWeight: el.fontWeight,
                        fontStyle: el.italic ? 'italic' : 'normal',
                        textDecoration: el.underline ? 'underline' : 'none',
                        color: el.color,
                        textAlign: el.textAlign,
                        whiteSpace: el.isMultiline ? 'pre-wrap' : 'nowrap',
                        width: '100%', height: '100%',
                        lineHeight: el.lineHeight || 1.2,
                        letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : 'normal',
                        backgroundColor: el.backgroundColor || 'transparent',
                        display: 'flex', alignItems: 'center',
                        justifyContent: el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start',
                        padding: '0 2px',
                    }}>{resolveEmpresaTokens(el.content || '', emp)}</div>
                ) : null}
                {el.type === 'BARCODE' && <img src={renderBarcode(el)} className="w-full h-full object-fill pointer-events-none"/>}
                {el.type === 'QR' && qrSrc && <img src={qrSrc} className="w-full h-full object-contain pointer-events-none"/>}
                {el.type === 'IMAGE' && (
                    el.content === '{{empresa.logoBase64}}' && emp.logoBase64 ? (
                        <img src={emp.logoBase64} className="w-full h-full pointer-events-none" style={{ objectFit: (el.imageObjectFit || 'contain') as any }}/>
                    ) : /^\{\{/.test(el.content || '') ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 border border-dashed border-slate-300 pointer-events-none gap-1">
                            <span className="text-[9px] font-mono text-slate-400 text-center px-1 leading-tight">{el.elementLabel || el.content}</span>
                            <span className="text-[8px] text-slate-300">Logo cargado al imprimir</span>
                        </div>
                    ) : (
                        <img src={el.content} className="w-full h-full pointer-events-none" style={{ objectFit: (el.imageObjectFit || 'contain') as any }}/>
                    )
                )}
                {el.type === 'SHAPE' && el.shapeType === 'LINE' && <div className={tool === 'SELECT' && isHollow ? 'pointer-events-auto' : ''} style={{width:'100%', height:`${(el.strokeWidth||1)}px`, backgroundColor: el.stroke}}/>}

                {el.type === 'COMPANY_HEADER' && el.companyStyle === 'GEOMETRIC' && (
                    <div className={`w-full h-full overflow-hidden relative ${tool === 'SELECT' ? 'pointer-events-auto' : ''}`}>
                        {/* Dark blue base */}
                        <div style={{ position: 'absolute', inset: 0, background: '#1e3a8a' }} />
                        {/* Accent triangle */}
                        <div style={{ position: 'absolute', inset: 0, background: '#3b82f6', clipPath: 'polygon(0 0, 48% 0, 0 100%)' }} />
                        {/* Content */}
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 'bold', fontSize: `${(el.fontSize || 9) + 3}pt`, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.nombreEmpresa || 'NOMBRE DE LA EMPRESA'}</div>
                                {el.companyShowRTN !== false && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: `${el.fontSize || 9}pt` }}>RTN: {emp.rtn || '0000-0000-000000'}</div>}
                                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: `${el.fontSize || 9}pt` }}>{emp.direccion || 'Dirección'}{emp.telefono ? ` · Tel: ${emp.telefono}` : ''}</div>
                            </div>
                            {el.companyDocTitle && (
                                <div style={{ color: '#fff', fontWeight: 900, fontSize: `${(el.fontSize || 9) + 10}pt`, letterSpacing: 2, flexShrink: 0 }}>
                                    {el.companyDocTitle}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {el.type === 'COMPANY_HEADER' && el.companyStyle !== 'GEOMETRIC' && (
                    <div className={`w-full h-full p-1 overflow-hidden ${tool === 'SELECT' ? 'pointer-events-auto' : ''}`}
                        style={{ textAlign: el.companyAlign || 'center', fontSize: `${el.fontSize || 9}pt`, lineHeight: 1.4 }}>
                        <div style={{ fontWeight: 'bold', fontSize: `${(el.fontSize || 9) + 2}pt`, color: el.color || '#000' }}>{emp.nombreEmpresa || 'NOMBRE DE LA EMPRESA'}</div>
                        {el.companyShowRTN !== false && <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>RTN: {emp.rtn || '0000-0000-000000'}</div>}
                        <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>{emp.direccion || 'Dirección de la Empresa'}</div>
                        {el.companyShowPhone !== false && <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>Tel: {emp.telefono || '0000-0000'}</div>}
                        {el.companyShowEmail && <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>{emp.correo || 'empresa@correo.com'}</div>}
                    </div>
                )}

                {el.type === 'SUMMARY_BOX' && (
                    <div className={`w-full h-full overflow-hidden ${tool === 'SELECT' ? 'pointer-events-auto' : ''}`}
                        style={{ backgroundColor: el.summaryBg || 'transparent', fontSize: `${el.summaryFontSize || 9}pt` }}>
                        {(el.summaryRows || []).map((row: SummaryRow) => (
                            <div key={row.id}>
                                {row.separator && <div style={{ borderTop: '1px solid #cbd5e1', margin: '2px 0' }} />}
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 4px',
                                    fontWeight: row.bold ? 'bold' : 'normal', color: el.summaryLabelColor || '#000' }}>
                                    <span>{row.label}</span>
                                    <span style={{ color: el.summaryValueColor || '#000', fontFamily: 'monospace' }}>{row.field}</span>
                                </div>
                            </div>
                        ))}
                        {(!el.summaryRows || el.summaryRows.length === 0) && (
                            <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">RESUMEN TOTALES</div>
                        )}
                    </div>
                )}

                {el.type === 'INVOICE_TABLE' && (
                    <div className={`w-full h-full overflow-hidden text-[8px] border border-slate-300 ${tool === 'SELECT' ? 'pointer-events-auto' : ''}`}>
                        {/* Header row */}
                        <div className="flex" style={{ backgroundColor: el.tableHeaderBg || '#1e293b', color: el.tableHeaderColor || '#ffffff', minHeight: (el.tableRowHeight || 8) * scale / scale }}>
                            {(el.tableColumns || defaultCols).map((col: InvoiceColumn, ci: number) => (
                                <div key={ci} className="font-bold px-1 flex items-center overflow-hidden truncate" style={{
                                    width: `${col.widthPct}%`,
                                    justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start',
                                    fontSize: `${el.tableFontSize || 8}px`,
                                }}>
                                    {col.header}
                                </div>
                            ))}
                        </div>
                        {/* Sample data rows */}
                        {[1,2,3].map((row, ri) => (
                            <div key={ri} className="flex border-t border-slate-200" style={{
                                backgroundColor: (el.tableAlternateRows && ri % 2 === 1) ? (el.tableAlternateBg || '#f8fafc') : 'white',
                            }}>
                                {(el.tableColumns || defaultCols).map((col: InvoiceColumn, ci: number) => (
                                    <div key={ci} className="px-1 flex items-center text-slate-400 overflow-hidden truncate" style={{
                                        width: `${col.widthPct}%`,
                                        justifyContent: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start',
                                        fontSize: `${el.tableFontSize || 8}px`,
                                    }}>
                                        {col.format === 'CURRENCY' ? 'L. 0.00' : col.format === 'NUMBER' ? '0' : '···'}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Lock indicator */}
            {isLocked && isSelected && (
                <div className="absolute -top-5 -right-1 bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center shadow-sm z-50 pointer-events-none">
                    <Lock size={8}/>
                </div>
            )}

            {/* Conditional visibility indicator */}
            {hasCondition && !isLocked && (
                <div className="absolute top-0 right-0 w-3 h-3 bg-orange-400 rounded-full z-50 pointer-events-none" title="Visibilidad condicional"/>
            )}

            {/* 8 Resize Handles + Rotate */}
            {showHandles && (
                <>
                    {[
                        { handle: 'n',  style: { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' } as React.CSSProperties },
                        { handle: 's',  style: { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' } as React.CSSProperties },
                        { handle: 'e',  style: { right: -4, top: '50%', transform: 'translateY(-50%)', cursor: 'e-resize' } as React.CSSProperties },
                        { handle: 'w',  style: { left: -4, top: '50%', transform: 'translateY(-50%)', cursor: 'w-resize' } as React.CSSProperties },
                        { handle: 'ne', style: { top: -4, right: -4, cursor: 'ne-resize' } as React.CSSProperties },
                        { handle: 'nw', style: { top: -4, left: -4, cursor: 'nw-resize' } as React.CSSProperties },
                        { handle: 'se', style: { bottom: -4, right: -4, cursor: 'se-resize' } as React.CSSProperties },
                        { handle: 'sw', style: { bottom: -4, left: -4, cursor: 'sw-resize' } as React.CSSProperties },
                    ].map(({ handle, style }) => (
                        <div
                            key={handle}
                            className="absolute w-3 h-3 bg-white border-2 border-indigo-600 rounded-sm shadow-sm pointer-events-auto"
                            style={{ position: 'absolute', ...style }}
                            onMouseDown={(e) => { e.stopPropagation(); onPointerDown(e, el.id, 'RESIZE', handle); }}
                            onTouchStart={(e) => { e.stopPropagation(); onPointerDown(e, el.id, 'RESIZE', handle); }}
                        />
                    ))}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center cursor-grab shadow-sm text-slate-500 pointer-events-auto"
                            onMouseDown={(e) => onPointerDown(e, el.id, 'ROTATE')} onTouchStart={(e) => onPointerDown(e, el.id, 'ROTATE')}>
                        <RotateCw size={12}/>
                    </div>
                </>
            )}
        </div>
    );
});

const DesignerCanvas: React.FC<DesignerCanvasProps> = ({ template, selectedId, selectedIds = [], zoom, setZoom, setPan, setSelectedId, onPointerDown, tool, pan, editingId, onStartEdit, onCommitEdit, snapGuides = [], onContextMenu, empresaConfig }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lastDist = useRef<number | null>(null);
    const panRef = useRef(pan);
    const zoomRef = useRef(zoom);
    const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

    const currentScale = template.type === 'DOCUMENT' ? 37.795 : 3.7795;
    const currentUnit = template.type === 'DOCUMENT' ? 'cm' : 'mm';

    // Keep refs in sync with latest prop values (for use inside event-listener closures)
    useEffect(() => { panRef.current = pan; }, [pan]);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    // --- GESTURE LOGIC ---
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const rect = container.getBoundingClientRect();
                const mx = e.clientX - rect.left - rect.width / 2;
                const my = e.clientY - rect.top - rect.height / 2;
                const factor = e.deltaY < 0 ? 1.1 : 0.909;
                const prevZoom = zoomRef.current;
                const newZoom = Math.max(0.1, Math.min(5, prevZoom * factor));
                const ratio = newZoom / prevZoom;
                const prevPan = panRef.current;
                setZoom(newZoom);
                setPan?.({
                    x: mx + (prevPan.x - mx) * ratio,
                    y: my + (prevPan.y - my) * ratio,
                });
            }
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                lastDist.current = dist;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && lastDist.current !== null) {
                e.preventDefault();
                const rect = container.getBoundingClientRect();
                const t0 = e.touches[0], t1 = e.touches[1];
                const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
                const mx = ((t0.clientX + t1.clientX) / 2) - rect.left - rect.width / 2;
                const my = ((t0.clientY + t1.clientY) / 2) - rect.top - rect.height / 2;
                const factor = dist / lastDist.current;
                const prevZoom = zoomRef.current;
                const newZoom = Math.max(0.1, Math.min(5, prevZoom * factor));
                const ratio = newZoom / prevZoom;
                const prevPan = panRef.current;
                setZoom(newZoom);
                setPan?.({
                    x: mx + (prevPan.x - mx) * ratio,
                    y: my + (prevPan.y - my) * ratio,
                });
                lastDist.current = dist;
            }
        };

        const handleTouchEnd = () => { lastDist.current = null; };

        container.addEventListener('wheel', handleWheel, { passive: false });
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);

        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [setZoom, tool, setPan]);

    // Track container size for ruler rendering
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const obs = new ResizeObserver(() => setContainerSize({ w: el.offsetWidth, h: el.offsetHeight }));
        obs.observe(el);
        setContainerSize({ w: el.offsetWidth, h: el.offsetHeight });
        return () => obs.disconnect();
    }, []);

    const handleElementSelect = (id: string, e: React.MouseEvent) => {
        setSelectedId(id);
    };

    return (
        <div
            ref={containerRef}
            className={`flex-1 bg-slate-200/50 overflow-hidden relative flex items-center justify-center p-2 md:p-8 touch-none ${tool === 'HAND' ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onMouseDown={(e) => onPointerDown(e, null, 'PANNING')}
            onTouchStart={(e) => onPointerDown(e, null, 'PANNING')}
        >
            {/* Rulers */}
            {containerSize.w > 0 && (() => {
                const RULER_SIZE = 18;
                const tickUnit = currentScale * zoom; // px per template unit at current zoom
                // Origin: center of container + pan, minus half the scaled canvas size
                const canvasW = template.width * currentScale * zoom;
                const canvasH = template.height * currentScale * zoom;
                const originX = containerSize.w / 2 + pan.x - canvasW / 2;
                const originY = containerSize.h / 2 + pan.y - canvasH / 2;
                // Choose tick interval: aim for ~40-60px between labeled ticks
                const rawInterval = 60 / tickUnit;
                const niceIntervals = [0.5, 1, 2, 5, 10, 20, 50, 100];
                const tickInterval = niceIntervals.find(n => n >= rawInterval) ?? 100;

                const hTicks: { pos: number; label: string }[] = [];
                const startU = Math.floor(-originX / tickUnit / tickInterval) * tickInterval;
                const endU = Math.ceil((containerSize.w - originX) / tickUnit / tickInterval) * tickInterval;
                for (let u = startU; u <= endU; u += tickInterval) {
                    hTicks.push({ pos: originX + u * tickUnit, label: String(u) });
                }

                const vTicks: { pos: number; label: string }[] = [];
                const startV = Math.floor(-originY / tickUnit / tickInterval) * tickInterval;
                const endV = Math.ceil((containerSize.h - originY) / tickUnit / tickInterval) * tickInterval;
                for (let v = startV; v <= endV; v += tickInterval) {
                    vTicks.push({ pos: originY + v * tickUnit, label: String(v) });
                }

                return (
                    <>
                        {/* Horizontal ruler (top) */}
                        <svg className="absolute top-0 left-0 pointer-events-none z-30"
                            style={{ width: containerSize.w, height: RULER_SIZE }}>
                            <rect width={containerSize.w} height={RULER_SIZE} fill="#f8fafc" />
                            <line x1={0} y1={RULER_SIZE} x2={containerSize.w} y2={RULER_SIZE} stroke="#cbd5e1" strokeWidth={1}/>
                            {hTicks.map((t, i) => (
                                <g key={i}>
                                    <line x1={t.pos} y1={RULER_SIZE - 8} x2={t.pos} y2={RULER_SIZE} stroke="#94a3b8" strokeWidth={1}/>
                                    <text x={t.pos + 2} y={RULER_SIZE - 10} fontSize={8} fill="#94a3b8" fontFamily="monospace">{t.label}</text>
                                </g>
                            ))}
                            {/* Corner square */}
                            <rect width={RULER_SIZE} height={RULER_SIZE} fill="#e2e8f0"/>
                            <text x={2} y={12} fontSize={7} fill="#94a3b8" fontFamily="monospace">{currentUnit}</text>
                        </svg>
                        {/* Vertical ruler (left) */}
                        <svg className="absolute top-0 left-0 pointer-events-none z-30"
                            style={{ width: RULER_SIZE, height: containerSize.h }}>
                            <rect width={RULER_SIZE} height={containerSize.h} fill="#f8fafc" />
                            <line x1={RULER_SIZE} y1={0} x2={RULER_SIZE} y2={containerSize.h} stroke="#cbd5e1" strokeWidth={1}/>
                            {vTicks.map((t, i) => (
                                <g key={i} transform={`translate(0, ${t.pos})`}>
                                    <line x1={RULER_SIZE - 8} y1={0} x2={RULER_SIZE} y2={0} stroke="#94a3b8" strokeWidth={1}/>
                                    <text x={RULER_SIZE - 9} y={0} fontSize={8} fill="#94a3b8" fontFamily="monospace"
                                        transform={`rotate(-90, ${RULER_SIZE - 9}, 0)`} textAnchor="start">{t.label}</text>
                                </g>
                            ))}
                            {/* Corner square (cover) */}
                            <rect width={RULER_SIZE} height={RULER_SIZE} fill="#e2e8f0"/>
                        </svg>
                    </>
                );
            })()}

            {/* Viewport Controls */}
            <div className="absolute bottom-6 left-6 flex flex-col gap-2 bg-white p-1 rounded-xl shadow-lg border border-slate-200 z-20">
                <button onClick={() => setZoom(z => Math.min(z + 0.5, 5))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><ZoomIn size={20}/></button>
                <div className="relative group">
                    <button className="text-[10px] font-bold text-slate-400 text-center py-1 px-2 border-y border-slate-100 select-none hover:bg-slate-50 w-full transition-colors">
                        {Math.round(zoom*100)}%
                    </button>
                    <div className="absolute left-full ml-1 top-0 hidden group-hover:flex flex-col bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 w-16">
                        {[50, 75, 100, 150, 200, 300].map(pct => (
                            <button key={pct} onClick={() => setZoom(pct/100)}
                                className={`px-3 py-1.5 text-xs font-bold hover:bg-indigo-50 text-left transition-colors ${Math.round(zoom*100) === pct ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`}>
                                {pct}%
                            </button>
                        ))}
                    </div>
                </div>
                <button onClick={() => setZoom(z => Math.max(z - 0.5, 0.5))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><ZoomOut size={20}/></button>
                <button
                    onClick={() => {
                        if (!containerRef.current) return;
                        const cw = containerRef.current.offsetWidth - 64;
                        const ch = containerRef.current.offsetHeight - 64;
                        const tw = template.width * currentScale;
                        const th = template.height * currentScale;
                        const fitZoom = Math.min(cw / tw, ch / th, 3);
                        setZoom(z => Math.max(0.1, fitZoom));
                        setPan?.({ x: 0, y: 0 });
                    }}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 border-t border-slate-100 mt-1"
                ><Maximize size={20}/></button>
            </div>

            {/* Outer wrapper: occupies visual (zoomed) space so parent overflow/centering works */}
            <div
                style={{
                    width: `${template.width * currentScale * zoom}px`,
                    height: `${template.height * currentScale * zoom}px`,
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                    flexShrink: 0,
                    position: 'relative',
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
            >
            {/* Dimension label — outside the scaled inner div so no counter-scale needed */}
            <div
                className="absolute -top-7 left-0 bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-bold shadow-sm opacity-50 hover:opacity-100 transition-opacity"
                style={{ whiteSpace: 'nowrap' }}
            >
                {template.width}{currentUnit} x {template.height}{currentUnit}
            </div>
            {/* Inner page: scaled to zoom, origin top-left so it fills the outer wrapper */}
            <div
                className="bg-white shadow-2xl relative transition-transform duration-75 ease-out ring-1 ring-slate-900/5 overflow-hidden"
                style={{
                    width: `${template.width * currentScale}px`,
                    height: `${template.height * currentScale}px`,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
                    backgroundColor: template.backgroundColor || '#ffffff',
                }}
            >
                {/* Grid Overlay */}
                {template.showGrid && (() => {
                    const gs = (template.gridSize || (template.type === 'DOCUMENT' ? 1 : 5)) * currentScale;
                    return (
                        <svg className="absolute inset-0 pointer-events-none" style={{ width: template.width * currentScale, height: template.height * currentScale }}>
                            <defs>
                                <pattern id="designer-grid" width={gs} height={gs} patternUnits="userSpaceOnUse">
                                    <path d={`M ${gs} 0 L 0 0 0 ${gs}`} fill="none" stroke="#e2e8f0" strokeWidth="0.5"/>
                                </pattern>
                            </defs>
                            <rect width="100%" height="100%" fill="url(#designer-grid)" />
                        </svg>
                    );
                })()}

                {/* Legacy Visual Grid for Documents (fallback when showGrid not set) */}
                {!template.showGrid && template.type === 'DOCUMENT' && (
                    <div className="absolute inset-0 pointer-events-none opacity-10"
                        style={{backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`, backgroundSize: `${currentScale}px ${currentScale}px`}}>
                    </div>
                )}

                {template.elements.map(el => el.visible === false ? null : (
                    <CanvasElement
                        key={el.id}
                        el={el}
                        isSelected={selectedId === el.id}
                        isMultiSelected={selectedIds.includes(el.id) && selectedId !== el.id}
                        scale={currentScale}
                        onPointerDown={onPointerDown}
                        onSelect={handleElementSelect}
                        tool={tool}
                        isEditing={editingId === el.id}
                        onStartEdit={onStartEdit}
                        onCommitEdit={onCommitEdit}
                        onContextMenu={onContextMenu}
                        empresaConfig={empresaConfig}
                    />
                ))}

                {/* Snap Guide Lines */}
                {snapGuides.length > 0 && (
                    <svg className="absolute inset-0 pointer-events-none z-[200]"
                        style={{ width: template.width * currentScale, height: template.height * currentScale, overflow: 'visible' }}>
                        {snapGuides.map((g, i) => g.axis === 'x'
                            ? <line key={i} x1={g.pos * currentScale} y1={-9999} x2={g.pos * currentScale} y2={9999} stroke="#6366f1" strokeWidth={1} strokeDasharray="4 3" opacity={0.8}/>
                            : <line key={i} x1={-9999} y1={g.pos * currentScale} x2={9999} y2={g.pos * currentScale} stroke="#6366f1" strokeWidth={1} strokeDasharray="4 3" opacity={0.8}/>
                        )}
                    </svg>
                )}
            </div>
            {/* /inner-page */}
            </div>
            {/* /outer-wrapper */}
        </div>
    );
};

export default memo(DesignerCanvas);
