
import React, { memo } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { LabelTemplate, LabelElement } from '../../types';
import { MM_TO_PX } from '../../hooks/useLabelDesigner';

interface DesignerCanvasProps {
    template: LabelTemplate;
    selectedId: string | null;
    zoom: number;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    setSelectedId: (id: string | null) => void;
    onPointerDown: (e: any, id: string, mode: any, handle?: string) => void;
}

// Helper functions kept outside component to avoid recreation
const renderBarcode = (el: LabelElement) => {
    const canvas = document.createElement('canvas');
    try { 
        const content = el.content.replace(/{{.*?}}/g, '123456');
        JsBarcode(canvas, content, { format: (el.barcodeFormat as any) || "CODE128", displayValue: el.displayValue, margin: 0, width: 2, height: 50, fontSize: 20 }); 
        return canvas.toDataURL("image/png"); 
    } catch (e) { return ''; }
};

const renderQR = (el: LabelElement) => { 
    let url = ''; 
    const content = el.content.replace(/{{.*?}}/g, 'DEMO-DATA');
    QRCode.toDataURL(content, { margin: 0 }, (err, u) => { url = u; }); 
    return url; 
};

// Memoized Individual Element to prevent full re-render on selection change
const CanvasElement = memo(({ el, isSelected, zoom, onPointerDown, onSelect }: any) => {
    return (
        <div
            onMouseDown={(e) => onPointerDown(e, el.id, 'MOVE')}
            onTouchStart={(e) => onPointerDown(e, el.id, 'MOVE')}
            className={`absolute group select-none cursor-move
                ${isSelected ? 'z-50 outline outline-2 outline-indigo-500' : 'z-10 hover:outline hover:outline-1 hover:outline-indigo-300'}`}
            style={{
                left: `${el.x * MM_TO_PX * zoom}px`,
                top: `${el.y * MM_TO_PX * zoom}px`,
                width: `${el.width * MM_TO_PX * zoom}px`,
                height: `${el.height * MM_TO_PX * zoom}px`,
                transform: `rotate(${el.rotation}deg)`,
            }}
            onClick={(e) => { e.stopPropagation(); onSelect(el.id); }}
        >
            <div className="w-full h-full overflow-hidden flex items-center justify-center relative" style={{
                border: (el.type === 'SHAPE' && el.shapeType !== 'LINE') ? `${(el.strokeWidth||1)*zoom}px solid ${el.stroke}` : 'none',
                borderRadius: el.shapeType === 'CIRCLE' ? '50%' : '0',
                backgroundColor: el.type === 'SHAPE' ? el.fill : 'transparent',
            }}>
                {el.type === 'TEXT' && (
                    <div style={{
                        fontSize: `${(el.fontSize||10)*zoom}px`,
                        fontFamily: el.fontFamily,
                        fontWeight: el.fontWeight,
                        color: el.color,
                        textAlign: el.textAlign,
                        whiteSpace: el.isMultiline ? 'pre-wrap' : 'nowrap',
                        width: '100%', height: '100%', lineHeight: 1.2
                    }}>{el.content}</div>
                )}
                {el.type === 'BARCODE' && <img src={renderBarcode(el)} className="w-full h-full object-fill pointer-events-none"/>}
                {el.type === 'QR' && <img src={renderQR(el)} className="w-full h-full object-contain pointer-events-none"/>}
                {el.type === 'IMAGE' && <img src={el.content} className="w-full h-full object-contain pointer-events-none"/>}
                {el.type === 'SHAPE' && el.shapeType === 'LINE' && <div style={{width:'100%', height:`${(el.strokeWidth||1)*zoom}px`, backgroundColor: el.stroke}}/>}
                {el.type === 'DETAIL_TABLE' && <div className="w-full h-full border-2 border-dashed border-purple-300 bg-purple-50 flex items-center justify-center text-purple-500 font-bold text-[10px]">DETALLES</div>}
            </div>

            {/* HANDLES */}
            {isSelected && (
                <>
                    <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white border-2 border-indigo-600 rounded-full shadow-sm cursor-nwse-resize"
                            onMouseDown={(e) => onPointerDown(e, el.id, 'RESIZE', 'se')} onTouchStart={(e) => onPointerDown(e, el.id, 'RESIZE', 'se')}/>
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center cursor-grab shadow-sm text-slate-500"
                            onMouseDown={(e) => onPointerDown(e, el.id, 'ROTATE')} onTouchStart={(e) => onPointerDown(e, el.id, 'ROTATE')}>
                        <RotateCw size={12}/>
                    </div>
                </>
            )}
        </div>
    );
});

const DesignerCanvas: React.FC<DesignerCanvasProps> = ({ template, selectedId, zoom, setZoom, setSelectedId, onPointerDown }) => {
    return (
        <div className="flex-1 bg-slate-200/50 overflow-hidden relative flex items-center justify-center p-8 touch-none"
                onClick={() => setSelectedId(null)}
                onWheel={(e) => { if(e.ctrlKey) { e.preventDefault(); setZoom(z => Math.max(0.5, Math.min(5, z - e.deltaY * 0.01))); } }}
        >
            {/* Zoom Controls */}
            <div className="absolute bottom-6 left-6 flex flex-col gap-2 bg-white p-1 rounded-xl shadow-lg border border-slate-200 z-10">
                <button onClick={() => setZoom(z => Math.min(z + 0.5, 5))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><ZoomIn size={20}/></button>
                <div className="text-[10px] font-bold text-slate-400 text-center py-1 border-y border-slate-100 select-none">{Math.round(zoom*100)}%</div>
                <button onClick={() => setZoom(z => Math.max(z - 0.5, 0.5))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><ZoomOut size={20}/></button>
            </div>

            <div 
                className="bg-white shadow-2xl relative transition-all duration-75 ease-out ring-1 ring-slate-900/5"
                style={{
                    width: `${template.width * MM_TO_PX * zoom}px`,
                    height: `${template.height * MM_TO_PX * zoom}px`,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Size Label */}
                <div className="absolute -top-8 left-0 bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-bold shadow-sm opacity-50 hover:opacity-100 transition-opacity">
                    {template.width}mm x {template.height}mm
                </div>

                {/* Grid Pattern */}
                <div className="absolute inset-0 pointer-events-none opacity-20" 
                    style={{backgroundImage: `radial-gradient(#cbd5e1 1px, transparent 1px)`, backgroundSize: `${10*zoom}px ${10*zoom}px`}}>
                </div>

                {/* ELEMENTS RENDER */}
                {template.elements.map(el => (
                    <CanvasElement 
                        key={el.id} 
                        el={el} 
                        isSelected={selectedId === el.id} 
                        zoom={zoom}
                        onPointerDown={onPointerDown}
                        onSelect={setSelectedId}
                    />
                ))}
            </div>
        </div>
    );
};

export default memo(DesignerCanvas);
