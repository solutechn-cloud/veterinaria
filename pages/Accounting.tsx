
import React, { useState, useEffect } from 'react';
import { AccountingService, SalesService } from '../services/api';
import { Socio, DetalleVenta } from '../types';
import { 
  Calculator, Users, Search, Edit2, X, ArrowUpRight, DollarSign, PieChart, Activity, ShoppingBag, Calendar, Eye, RefreshCw, Layers, TrendingUp, ArrowRightLeft, FileText, Download, UserCheck, AlertCircle, Ticket, ExternalLink
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
          Swal.fire('Actualizado', 'La rentabilidad ha sido recalculada correctamente.', 'success');
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const handleEditInvoice = (descripcion: string) => {
      const match = descripcion.match(/#(FACT-\d+)/);
      if (match && match[1]) {
          navigate('/pos', { state: { editSaleId: match[1] } });
      } else {
          Swal.fire('Info', 'No se pudo identificar un número de factura válido.', 'info');
      }
  };

  const exportPDF = () => {
      if (!report) return;
      const doc = new jsPDF();
      const date = selectedDate;

      doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text("REPORTE DE RENTABILIDAD DIARIA", 105, 15, { align: 'center' });
      doc.setFontSize(10); doc.text(`Fecha: ${date} | Generado por SmartCloud ERP`, 105, 22, { align: 'center' });

      doc.setTextColor(0); doc.text("ESTADO DE RESULTADOS (NEGOCIO)", 14, 40);
      const mainData = [
          ["Ingresos Totales", `L. ${report.daily.ingresos.toFixed(2)}`],
          ["(-) Costo Mercancía", `L. ${report.daily.costos.toFixed(2)}`],
          ["Utilidad Bruta", `L. ${report.daily.utilBruta.toFixed(2)}`],
          ["(-) Gastos Operativos Negocio", `L. ${report.daily.gastosGral.toFixed(2)}`],
          ["UTILIDAD NETA REPARTIBLE", `L. ${report.daily.utilNetaNegocio.toFixed(2)}`]
      ];
      // @ts-ignore
      doc.autoTable({ startY: 45, head: [['Concepto', 'Monto']], body: mainData, theme: 'grid', headStyles: { fillColor: [79, 70, 229] } });

      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.text("DISTRIBUCIÓN Y DEDUCCIONES POR SOCIO", 14, finalY);
      const partnerRows = report.distribucion.map(d => [
          d.socio, `${d.porcentaje}%`, 
          `L. ${(report.daily.utilNetaNegocio * (d.porcentaje/100)).toFixed(2)}`,
          `L. ${d.deduccionDia.toFixed(2)}`,
          `L. ${d.gananciaDia.toFixed(2)}`
      ]);
      // @ts-ignore
      doc.autoTable({ startY: finalY + 5, head: [['Socio', '%', 'Util. Bruta', 'Deducción Pers.', 'PAGO FINAL']], body: partnerRows, theme: 'striped', headStyles: { fillColor: [16, 185, 129] } });

      doc.save(`Reporte_Rentabilidad_${date}.pdf`);
  };

  const filteredTransactions = transactions.filter(t => 
    t.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 h-full flex flex-col pb-10">
        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="p-3 bg-indigo-600 rounded-xl text-white shadow-lg shrink-0"><Calculator size={24}/></div>
                <div><h2 className="text-lg md:text-xl font-bold text-slate-800">Contabilidad Gerencial</h2><p className="text-[10px] md:text-xs text-slate-500 font-medium">Rentabilidad Neta y Reparto</p></div>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-2 w-full md:w-auto">
                <div className="flex p-1 bg-slate-100 rounded-xl">
                    <button onClick={() => setActiveTab('SUMMARY')} className={`px-3 md:px-4 py-2 rounded-lg font-bold text-[10px] md:text-xs flex items-center gap-2 transition-all ${activeTab === 'SUMMARY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><TrendingUp size={14}/> Ganancias</button>
                    <button onClick={() => setActiveTab('TRANSACTIONS')} className={`px-3 md:px-4 py-2 rounded-lg font-bold text-[10px] md:text-xs flex items-center gap-2 transition-all ${activeTab === 'TRANSACTIONS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Activity size={14}/> Auditoría</button>
                </div>
                <button onClick={exportPDF} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-[10px] md:text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-colors"><Download size={14}/> PDF</button>
                <div className="bg-indigo-50 p-1.5 rounded-xl border border-indigo-100 flex items-center gap-1">
                    <Calendar size={14} className="text-indigo-600 ml-1"/><input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-transparent text-[10px] md:text-xs font-bold text-indigo-700 outline-none w-28 md:w-32"/>
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'SUMMARY' && report && (
                <div className="animate-fade-in space-y-6 overflow-y-auto pr-1 custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-3 bg-slate-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-2xl">
                             <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                                <div><p className="text-indigo-300 text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1">Ventas Brutas (Día)</p><h3 className="text-3xl md:text-4xl font-black">L. {report.daily.ingresos.toLocaleString()}</h3><p className="text-emerald-400 text-[10px] md:text-xs mt-2 font-bold flex items-center gap-1"><ArrowUpRight size={14}/> Util. Bruta: L. {report.daily.utilBruta.toLocaleString()}</p></div>
                                <div className="md:border-l border-white/10 md:pl-8"><p className="text-red-300 text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1">Gastos Operativos</p><h3 className="text-2xl md:text-3xl font-bold text-red-200">L. {report.daily.gastosGral.toLocaleString()}</h3><p className="text-slate-400 text-[9px] md:text-[10px] mt-2">Deducciones comunes del negocio</p></div>
                                <div className="md:border-l border-white/10 md:pl-8 bg-emerald-500/10 rounded-2xl p-4"><p className="text-emerald-400 text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1">Utilidad Neta Total</p><h3 className="text-3xl md:text-4xl font-black text-emerald-400">L. {report.daily.utilNetaNegocio.toLocaleString()}</h3><p className="text-[9px] md:text-[10px] text-emerald-200/50 mt-1">Base para reparto</p></div>
                             </div>
                        </div>
                        <div className="bg-white border-2 border-indigo-100 rounded-3xl p-6 flex flex-col justify-center items-center text-center shadow-sm">
                            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3"><ArrowRightLeft size={24}/></div>
                            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase">Reposición Stock</p>
                            <h3 className="text-xl md:text-2xl font-bold text-slate-800 mt-1">L. {report.daily.inversion.toLocaleString()}</h3>
                            <p className="text-[9px] text-slate-400 mt-2 px-4 leading-tight italic">Dinero para inventario.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {report.distribucion.map((d, i) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative group hover:border-indigo-400 transition-all">
                                <div className="absolute top-4 right-4 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-black">{d.porcentaje}%</div>
                                <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-4"><Users size={20}/></div>
                                <h4 className="text-lg font-bold text-slate-800 mb-4">{d.socio}</h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between text-xs font-medium"><span className="text-slate-500 uppercase">Util. Correspondiente:</span><span className="text-slate-800 font-bold">L. {(report.daily.utilNetaNegocio * (d.porcentaje/100)).toLocaleString()}</span></div>
                                    <div className="flex justify-between text-xs font-medium"><span className="text-red-500 uppercase">Deducción Personal:</span><span className="text-red-600 font-bold">- L. {d.deduccionDia.toLocaleString()}</span></div>
                                    <div className="border-t border-slate-100 pt-3 flex justify-between items-center"><span className="text-xs font-black text-indigo-600 uppercase">Pago Neto:</span><span className="text-xl font-black text-emerald-600">L. {d.gananciaDia.toLocaleString()}</span></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'TRANSACTIONS' && (
                <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
                    <div className="p-4 bg-slate-50 border-b flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="relative w-full md:w-64"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="Buscar..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} /></div>
                    </div>
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase sticky top-0 z-10 border-b">
                                <tr><th className="p-4">Caja</th><th className="p-4">Descripción</th><th className="p-4">Categoría</th><th className="p-4 text-right">Monto</th><th className="p-4 text-center">Acciones</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredTransactions.map(tx => (
                                    <tr key={`${tx.tipo}-${tx.id}`} className="hover:bg-slate-50 group">
                                        <td className="p-4"><p className="font-bold text-slate-700">{tx.idCaja}</p><p className="text-[10px] text-slate-400">{tx.fecha.split(' ')[1]}</p></td>
                                        <td className="p-4"><span className="font-medium text-slate-600">{tx.descripcion}</span></td>
                                        <td className="p-4"><span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${tx.categoria === 'Gasto Operativo' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{tx.categoria}</span></td>
                                        <td className={`p-4 text-right font-bold ${tx.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-red-600'}`}>{tx.tipo === 'INGRESO' ? '+' : '-'} L. {tx.monto.toLocaleString()}</td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-1">
                                                <button onClick={() => handleEditTx(tx)} className="p-1 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={14}/></button>
                                                {tx.descripcion.includes('Factura #') && <button onClick={() => handleEditInvoice(tx.descripcion)} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"><Ticket size={14}/></button>}
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
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 animate-fade-in">
                    <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-lg text-slate-800">Corrección Contable</h3><button onClick={() => setEditingTx(null)}><X className="text-slate-400"/></button></div>
                    <div className="space-y-4">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Descripción</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={editForm.descripcion} onChange={e => setEditForm({...editForm, descripcion: e.target.value})} /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Monto</label><input type="number" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold" value={editForm.monto} onChange={e => setEditForm({...editForm, monto: e.target.value})} /></div>
                            <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Costo</label><input type="number" className="w-full p-3 bg-white border border-slate-200 rounded-xl value={editForm.costo} onChange={e => setEditForm({...editForm, costo: e.target.value})} /></div>
                        </div>
                        {editingTx.tipo === 'EGRESO' && (
                             <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Socio Asignado</label>
                             <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" value={editForm.id_socio_asignado} onChange={e => setEditForm({...editForm, id_socio_asignado: e.target.value})}>
                                 <option value="">-- Sin Socio --</option>
                                 {partners.map(p => <option key={p.idSocio} value={p.idSocio}>{p.nombre}</option>)}
                             </select></div>
                        )}
                        <button onClick={saveEditTx} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">GUARDAR CAMBIOS</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default Accounting;
