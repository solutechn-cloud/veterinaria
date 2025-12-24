
import React, { useState, useEffect } from 'react';
import { AccountingService } from '../services/api';
import { Socio } from '../types';
import { 
  Calculator, Users, Search, Edit2, X, ArrowUpRight, Activity, Calendar, RefreshCw, TrendingUp, ArrowRightLeft, Download, Ticket
} from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate } = ReactRouterDOM as any;

interface AuditTransaction {
    tipo: 'INGRESO' | 'EGRESO';
    id: string;
    idCaja: string;
    descripcion: string;
    monto: number;
    costo: number;
    fecha: string;
    estado: string;
    categoria: string;
    id_socio_asignado: number | null;
    nombre_socio: string | null;
}

interface ProfitMetrics {
    ingresos: number;
    costos: number;
    utilBruta: number;
    gastosGral: number;
    inversion: number;
    utilNetaNegocio: number;
}

interface ProfitReport {
    daily: ProfitMetrics;
    monthly: ProfitMetrics;
    yearly: ProfitMetrics;
    distribucion: { socio: string; porcentaje: number; gananciaDia: number; gananciaMes: number; gananciaAnio: number; deduccionDia: number; }[];
}

const Accounting: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'TRANSACTIONS'>('SUMMARY');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [transactions, setTransactions] = useState<AuditTransaction[]>([]);
  const [partners, setPartners] = useState<Socio[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [editingTx, setEditingTx] = useState<AuditTransaction | null>(null);
  const [editForm, setEditForm] = useState({ descripcion: '', monto: '', costo: '', categoria: '', id_socio_asignado: '' });

  useEffect(() => { loadData(); }, [selectedDate, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
        const [pData, sData] = await Promise.all([
            AccountingService.getProfitabilityReport(selectedDate),
            AccountingService.getSocios()
        ]);
        setReport(pData);
        setPartners(sData);
        
        if (activeTab === 'TRANSACTIONS') {
            const auditData = await AccountingService.getAuditTransactions(selectedDate);
            setTransactions(auditData || []);
        }
    } catch (e) { 
        console.error(e); 
        setTransactions([]);
    } finally { 
        setLoading(false); 
    }
  };

  const handleEditTx = (tx: AuditTransaction) => {
      setEditingTx(tx);
      setEditForm({ 
          descripcion: tx.descripcion, 
          monto: String(tx.monto), 
          costo: String(tx.costo || 0),
          categoria: tx.categoria || (tx.tipo === 'EGRESO' ? 'Gasto Operativo' : 'Venta/Servicio'),
          id_socio_asignado: tx.id_socio_asignado ? String(tx.id_socio_asignado) : ''
      });
  };

  const saveEditTx = async () => {
      if (!editingTx) return;
      try {
          await AccountingService.updateAuditTransaction(editingTx.tipo, editingTx.id, {
              ...editForm,
              monto: Number(editForm.monto),
              costo: Number(editForm.costo),
              id_socio_asignado: editForm.id_socio_asignado || null
          });
          setEditingTx(null);
          loadData();
          Swal.fire('Actualizado', 'Recalculado con éxito.', 'success');
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleEditInvoice = (descripcion: string) => {
      const match = descripcion.match(/#(FACT-\d+)/);
      if (match && match[1]) {
          navigate('/pos', { state: { editSaleId: match[1] } });
      } else {
          Swal.fire('Info', 'Sin factura válida.', 'info');
      }
  };

  const exportPDF = () => {
      if (!report) return;
      const doc = new jsPDF();
      doc.setFontSize(18); doc.text("REPORTE DE RENTABILIDAD", 14, 20);
      doc.setFontSize(10); doc.text(`Fecha: ${selectedDate}`, 14, 28);

      const mainData = [
          ["Ingresos Totales", `L. ${report.daily.ingresos.toFixed(2)}`],
          ["(-) Costo Mercancía", `L. ${report.daily.costos.toFixed(2)}`],
          ["Utilidad Bruta", `L. ${report.daily.utilBruta.toFixed(2)}`],
          ["Gastos Operativos", `L. ${report.daily.gastosGral.toFixed(2)}`],
          ["UTILIDAD NETA", `L. ${report.daily.utilNetaNegocio.toFixed(2)}`]
      ];
      // @ts-ignore
      doc.autoTable({ startY: 40, head: [['Concepto', 'Monto']], body: mainData, theme: 'grid' });
      doc.save(`Rentabilidad_${selectedDate}.pdf`);
  };

  const filteredTransactions = transactions.filter(t => 
    t.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 h-full flex flex-col pb-10">
        <div className="bg-white p-4 rounded-2xl shadow-sm border flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-600 rounded-xl text-white shadow-lg"><Calculator size={24}/></div>
                <div><h2 className="text-xl font-bold">Contabilidad Gerencial</h2><p className="text-xs text-slate-500">Rentabilidad y Reparto</p></div>
            </div>
            
            <div className="flex items-center gap-2">
                <div className="flex p-1 bg-slate-100 rounded-xl">
                    <button onClick={() => setActiveTab('SUMMARY')} className={`px-4 py-2 rounded-lg font-bold text-xs ${activeTab === 'SUMMARY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Ganancias</button>
                    <button onClick={() => setActiveTab('TRANSACTIONS')} className={`px-4 py-2 rounded-lg font-bold text-xs ${activeTab === 'TRANSACTIONS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Auditoría</button>
                </div>
                <button onClick={exportPDF} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs"><Download size={14}/></button>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-indigo-50 p-2 rounded-xl text-xs font-bold text-indigo-700 outline-none border border-indigo-100"/>
            </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'SUMMARY' && report && (
                <div className="animate-fade-in space-y-6 overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl">
                            <p className="text-indigo-300 text-[10px] font-black uppercase mb-1">Ventas Brutas</p>
                            <h3 className="text-3xl font-black">L. {report.daily.ingresos.toLocaleString()}</h3>
                        </div>
                        <div className="bg-white border rounded-3xl p-6 shadow-sm">
                            <p className="text-slate-400 text-[10px] font-black uppercase mb-1">Gastos Operativos</p>
                            <h3 className="text-2xl font-bold text-red-600">L. {report.daily.gastosGral.toLocaleString()}</h3>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 shadow-sm">
                            <p className="text-emerald-600 text-[10px] font-black uppercase mb-1">Utilidad Neta</p>
                            <h3 className="text-3xl font-black text-emerald-700">L. {report.daily.utilNetaNegocio.toLocaleString()}</h3>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {report.distribucion.map((d, i) => (
                            <div key={i} className="bg-white border rounded-2xl p-6 shadow-sm relative group hover:border-indigo-400 transition-all">
                                <div className="absolute top-4 right-4 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black">{d.porcentaje}%</div>
                                <h4 className="text-lg font-bold mb-4">{d.socio}</h4>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between"><span>Correspondiente:</span><span className="font-bold">L. {(report.daily.utilNetaNegocio * (d.porcentaje/100)).toLocaleString()}</span></div>
                                    <div className="flex justify-between text-red-600"><span>Deducción Pers:</span><span className="font-bold">- L. {d.deduccionDia.toLocaleString()}</span></div>
                                    <div className="border-t pt-2 flex justify-between items-center"><span className="font-black text-indigo-600 uppercase">Pago Neto:</span><span className="text-xl font-black text-emerald-600">L. {d.gananciaDia.toLocaleString()}</span></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'TRANSACTIONS' && (
                <div className="flex flex-col h-full bg-white rounded-2xl border shadow-sm overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
                        <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="pl-9 pr-3 py-2 bg-white border rounded-lg text-xs outline-none" placeholder="Buscar..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} /></div>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b sticky top-0">
                                <tr><th className="p-4">Caja</th><th className="p-4">Descripción</th><th className="p-4 text-right">Monto</th><th className="p-4 text-center">Acciones</th></tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredTransactions.map(tx => (
                                    <tr key={`${tx.tipo}-${tx.id}`} className="hover:bg-slate-50">
                                        <td className="p-4"><p className="font-bold">{tx.idCaja}</p><p className="text-[10px] text-slate-400">{tx.fecha.split(' ')[1]}</p></td>
                                        <td className="p-4">{tx.descripcion}</td>
                                        <td className={`p-4 text-right font-bold ${tx.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-red-600'}`}>{tx.tipo === 'INGRESO' ? '+' : '-'} L. {tx.monto.toLocaleString()}</td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button onClick={() => handleEditTx(tx)} className="p-1 text-blue-500"><Edit2 size={14}/></button>
                                                {tx.descripcion.includes('Factura #') && <button onClick={() => handleEditInvoice(tx.descripcion)} className="p-1 text-indigo-600"><Ticket size={14}/></button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>

        {editingTx && (
            <div className="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6">
                    <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-lg">Corrección Contable</h3><button onClick={() => setEditingTx(null)}><X className="text-slate-400"/></button></div>
                    <div className="space-y-4">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase">Descripción</label><input className="w-full p-3 bg-slate-50 border rounded-xl" value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-[10px] font-bold text-slate-400 uppercase">Monto</label><input type="number" className="w-full p-3 border rounded-xl font-bold" value={editForm.monto} onChange={e => setEditForm({...editForm, monto: e.target.value})} /></div>
                            <div><label className="text-[10px] font-bold text-slate-400 uppercase">Costo</label><input type="number" className="w-full p-3 border rounded-xl" value={editForm.costo} onChange={e => setEditForm({...editForm, costo: e.target.value})} /></div>
                        </div>
                        {editingTx.tipo === 'EGRESO' && (
                             <div><label className="text-[10px] font-bold text-slate-400 uppercase">Socio Asignado</label>
                             <select className="w-full p-3 bg-slate-50 border rounded-xl" value={editForm.id_socio_asignado} onChange={e => setEditForm({...editForm, id_socio_asignado: e.target.value})}>
                                 <option value="">-- Sin Socio --</option>
                                 {partners.map(p => <option key={p.idSocio} value={p.idSocio}>{p.nombre}</option>)}
                             </select></div>
                        )}
                        <button onClick={saveEditTx} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">GUARDAR</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default Accounting;
