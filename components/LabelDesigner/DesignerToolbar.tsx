
import React from 'react';
import { Type, ScanLine, Shapes, Image as ImageIcon, Table as TableIcon, FileCog, QrCode, Layers, Hand, MousePointer2, Building2, ReceiptText } from 'lucide-react';
import { LabelTemplate } from '../../types';

interface ToolButtonProps {
    icon: React.ReactNode;
    label?: string;
    onClick: () => void;
    active?: boolean;
    color?: string;
}

const ToolButton = ({ icon, label, onClick, active, color }: ToolButtonProps) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 w-full group ${active ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}>
        <div className={`p-2.5 rounded-xl transition-all shadow-sm ${active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200'} ${color || ''}`}>
            {icon}
        </div>
        {label && <span className={`text-[9px] font-bold ${active ? 'text-indigo-600' : 'text-slate-400'}`}>{label}</span>}
    </button>
);

interface DesignerToolbarProps {
    template: LabelTemplate;
    addElement: (type: any, extra?: any) => void;
    insertCompanyAsElements: () => void;
    onImageUpload: (e: any) => void;
    setShowShapeModal: (show: boolean) => void;
    onConfigClick: () => void;
    onLayersClick: () => void;
    activePanel: string;
    tool: 'SELECT' | 'HAND';
    setTool: (t: 'SELECT' | 'HAND') => void;
}

const DesignerToolbar: React.FC<DesignerToolbarProps> = ({
    template, addElement, insertCompanyAsElements, onImageUpload, setShowShapeModal, onConfigClick, onLayersClick, activePanel, tool, setTool
}) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    return (
        <aside className="hidden md:flex w-20 bg-white border-r flex-col items-center py-6 gap-4 z-20 shadow-sm overflow-y-auto">
            <div className="flex flex-col gap-2 w-full px-2 border-b border-slate-100 pb-4">
                <ToolButton icon={<MousePointer2 size={20}/>} label="Cursor" onClick={() => setTool('SELECT')} active={tool === 'SELECT'} />
                <ToolButton icon={<Hand size={20}/>} label="Mover" onClick={() => setTool('HAND')} active={tool === 'HAND'} />
            </div>

            <div className="flex flex-col gap-4 w-full px-2">
                <ToolButton icon={<Type size={20}/>} label="Texto" onClick={() => addElement('TEXT')} />
                <ToolButton icon={<ScanLine size={20}/>} label="Código" onClick={() => addElement('BARCODE')} />
                <ToolButton icon={<QrCode size={20}/>} label="QR" onClick={() => addElement('QR')} />
                <ToolButton icon={<Shapes size={20}/>} label="Forma" onClick={() => setShowShapeModal(true)} />
                <ToolButton icon={<ImageIcon size={20}/>} label="Imagen" onClick={() => fileInputRef.current?.click()} />
                
                {template.type === 'DOCUMENT' && <ToolButton icon={<TableIcon size={20}/>} label="Tabla" onClick={() => addElement('INVOICE_TABLE')} color="text-purple-600 bg-purple-50" />}
                {template.type === 'DOCUMENT' && <ToolButton icon={<ReceiptText size={20}/>} label="Totales" onClick={() => addElement('SUMMARY_BOX')} color="text-emerald-600 bg-emerald-50" />}
                <ToolButton icon={<Building2 size={20}/>} label="Empresa" onClick={insertCompanyAsElements} color="text-amber-600 bg-amber-50" />
            </div>
            
            <div className="mt-auto flex flex-col gap-4 w-full px-2 pt-4 border-t border-slate-100">
                <ToolButton icon={<Layers size={20}/>} label="Capas" onClick={onLayersClick} active={activePanel === 'LAYERS'} />
                <ToolButton icon={<FileCog size={20}/>} label="Config" onClick={onConfigClick} active={activePanel === 'PROPERTIES' && !template.elements.some(e => e.id === '')} />
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onImageUpload}/>
        </aside>
    );
};

export default DesignerToolbar;
