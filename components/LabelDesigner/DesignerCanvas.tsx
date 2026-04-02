
import React, { memo, useRef, useEffect, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { RotateCw, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { LabelTemplate, LabelElement, InvoiceColumn, SummaryRow } from '../../types';

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
    setSelectedId: (id: string | null) => void;
    onPointerDown: (e: any, id: string | null, mode: any, handle?: string) => void;
    tool: 'SELECT' | 'HAND';
    pan: { x: number, y: number };
}

const renderBarcode = (el: LabelElement) => {
    const canvas = document.createElement('canvas');
    try {
        // FIX: If content has variable braces {{...}}, render a generic code for preview
        const hasVariable = /{{.*?}}/.test(el.content);
        const content = hasVariable ? '123456' : el.content;

        JsBarcode(canvas, content, { format: (el.barcodeFormat as any) || "CODE128", displayValue: el.displayValue, margin: 0, width: 2, height: 50, fontSize: 20 });
        return canvas.toDataURL("image/png");
    } catch (e) { return ''; }
};

// QR rendering is async — handled inside CanvasElement via useState/useEffect

// Memoized Element with Scale Injection
const CanvasElement = memo(({ el, isSelected, isMultiSelected, scale, onPointerDown, onSelect, tool }: any) => {
    // QR: async rendering with local state
    const [qrSrc, setQrSrc] = useState('');
    useEffect(() => {
        if (el.type === 'QR') {
            const hasVariable = /{{.*?}}/.test(el.content);
            const content = hasVariable ? 'DEMO-QR' : (el.content || 'QR');
            QRCode.toDataURL(content, { margin: 0 })
                .then((url: string) => setQrSrc(url))
                .catch(() => setQrSrc(''));
        }
    }, [el.type, el.content]);
    // Logic for "Hollow" objects:
    const isHollow = el.type === 'SHAPE' && (el.fill === 'transparent' || !el.fill);

    // CRITICAL FIX: If tool is HAND, disable pointer events on individual elements
    const pointerEventsClass = tool === 'HAND' ? 'pointer-events-none' : (isHollow ? 'pointer-events-none' : '');

    const showHandles = isSelected && tool === 'SELECT';

    return (
        <div
            onMouseDown={(e) => tool === 'SELECT' && onPointerDown(e, el.id, 'MOVE')}
            onTouchStart={(e) => tool === 'SELECT' && onPointerDown(e, el.id, 'MOVE')}
            className={`absolute group select-none cursor-move
                ${isSelected ? 'z-50 outline outline-2 outline-indigo-500' : isMultiSelected ? 'z-40 outline outline-2 outline-blue-400 outline-dashed' : 'z-10 hover:outline hover:outline-1 hover:outline-indigo-300'}
                ${pointerEventsClass}`}
            style={{
                left: `${el.x * scale}px`,
                top: `${el.y * scale}px`,
                width: `${el.width * scale}px`,
                height: `${el.height * scale}px`,
                transform: `rotate(${el.rotation}deg)`,
                opacity: el.opacity ?? 1,
            }}
            onClick={(e) => { e.stopPropagation(); if(tool === 'SELECT') onSelect(el.id, e); }}
        >
            {/* Inner Content */}
            <div className={`w-full h-full overflow-hidden flex items-center justify-center relative ${tool === 'HAND' ? '' : (isHollow ? 'pointer-events-none' : '')}`} style={{
                borderRadius: el.shapeType === 'CIRCLE' ? '50%' : (el.borderRadius ? `${el.borderRadius}px` : '0'),
                backgroundColor: el.type === 'SHAPE' ? el.fill : 'transparent',
            }}>
                {/* Specific Handling for Hollow Shapes BORDER */}
                {el.type === 'SHAPE' && (
                    <div
                        className={tool === 'SELECT' && isHollow ? 'pointer-events-auto' : ''}
                        style={{
                            position: 'absolute', inset: 0,
                            border: el.shapeType !== 'LINE' ? `${(el.strokeWidth||1)}px solid ${el.stroke}` : 'none',
                            borderRadius: el.shapeType === 'CIRCLE' ? '50%' : (el.borderRadius ? `${el.borderRadius}px` : '0'),
                        }}
                    />
                )}

                {el.type === 'TEXT' && (
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
                    }}>{el.content}</div>
                )}
                {el.type === 'BARCODE' && <img src={renderBarcode(el)} className="w-full h-full object-fill pointer-events-none"/>}
                {el.type === 'QR' && qrSrc && <img src={qrSrc} className="w-full h-full object-contain pointer-events-none"/>}
                {el.type === 'IMAGE' && <img src={el.content} className="w-full h-full object-contain pointer-events-none"/>}
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
                                <div style={{ fontWeight: 'bold', fontSize: `${(el.fontSize || 9) + 3}pt`, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>NOMBRE DE LA EMPRESA</div>
                                {el.companyShowRTN !== false && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: `${el.fontSize || 9}pt` }}>RTN: 0000-0000-000000</div>}
                                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: `${el.fontSize || 9}pt` }}>Dirección · Tel: 0000-0000</div>
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
                        <div style={{ fontWeight: 'bold', fontSize: `${(el.fontSize || 9) + 2}pt`, color: el.color || '#000' }}>NOMBRE DE LA EMPRESA</div>
                        {el.companyShowRTN !== false && <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>RTN: 0000-0000-000000</div>}
                        <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>Dirección de la Empresa</div>
                        {el.companyShowPhone !== false && <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>Tel: 0000-0000</div>}
                        {el.companyShowEmail && <div style={{ color: el.color || '#555', fontSize: `${el.fontSize || 9}pt` }}>empresa@correo.com</div>}
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

const DesignerCanvas: React.FC<DesignerCanvasProps> = ({ template, selectedId, selectedIds = [], zoom, setZoom, setSelectedId, onPointerDown, tool, pan }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lastDist = useRef<number | null>(null);

    const currentScale = template.type === 'DOCUMENT' ? 37.795 : 3.7795;
    const currentUnit = template.type === 'DOCUMENT' ? 'cm' : 'mm';

    // --- GESTURE LOGIC ---
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY * -0.01;
                setZoom(z => Math.max(0.1, Math.min(5, z + delta)));
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
            if (e.touches.length === 2 && lastDist.current) {
                e.preventDefault();
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const delta = dist - lastDist.current;
                setZoom(z => Math.max(0.1, Math.min(5, z + (delta * 0.005))));
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
    }, [setZoom, tool]);

    const handleElementSelect = (id: string, e: React.MouseEvent) => {
        setSelectedId(id);
    };

    return (
        <div
            ref={containerRef}
            className={`flex-1 bg-slate-200/50 overflow-hidden relative flex items-center justify-center p-8 touch-none ${tool === 'HAND' ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onMouseDown={(e) => onPointerDown(e, null, 'PANNING')}
            onTouchStart={(e) => onPointerDown(e, null, 'PANNING')}
        >
            {/* Viewport Controls */}
            <div className="absolute bottom-6 left-6 flex flex-col gap-2 bg-white p-1 rounded-xl shadow-lg border border-slate-200 z-20">
                <button onClick={() => setZoom(z => Math.min(z + 0.5, 5))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><ZoomIn size={20}/></button>
                <div className="text-[10px] font-bold text-slate-400 text-center py-1 border-y border-slate-100 select-none">{Math.round(zoom*100)}%</div>
                <button onClick={() => setZoom(z => Math.max(z - 0.5, 0.5))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><ZoomOut size={20}/></button>
                <button onClick={() => { /* Reset View */ }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 border-t border-slate-100 mt-1"><Maximize size={20}/></button>
            </div>

            <div
                className="bg-white shadow-2xl relative transition-transform duration-75 ease-out ring-1 ring-slate-900/5 origin-center"
                style={{
                    width: `${template.width * currentScale}px`,
                    height: `${template.height * currentScale}px`,
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    backgroundColor: template.backgroundColor || '#ffffff',
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
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

                <div
                    className="absolute -top-8 left-0 bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-bold shadow-sm opacity-50 hover:opacity-100 transition-opacity"
                    style={{ transform: `scale(${1/zoom})`, transformOrigin: 'bottom left' }}
                >
                    {template.width}{currentUnit} x {template.height}{currentUnit}
                </div>

                {template.elements.map(el => (
                    <CanvasElement
                        key={el.id}
                        el={el}
                        isSelected={selectedId === el.id}
                        isMultiSelected={selectedIds.includes(el.id) && selectedId !== el.id}
                        scale={currentScale}
                        onPointerDown={onPointerDown}
                        onSelect={handleElementSelect}
                        tool={tool}
                    />
                ))}
            </div>
        </div>
    );
};

export default memo(DesignerCanvas);
