import React, { useState, useEffect } from 'react';
import { CashService } from '../services/api';
import { Arqueo, Ingreso, Egreso } from '../types';
import { ArrowDownLeft, ArrowUpRight, Lock, Unlock, FileText, PlusCircle } from 'lucide-react';

const CashRegister: React.FC = () => {
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [loading, setLoading] = useState(true);

  // Constants hardcoded for demo, normally from Auth Context
  const CURRENT_USER = 'USER-01'; 
  const CURRENT_CAJA = 'CAJA-01';

  useEffect(() => {
    loadCashData();
  }, []);

  const loadCashData = async () => {
    setLoading(true);
    // Fetch active session (arqueo)
    const activeArqueo = await CashService.getActiveArqueo(CURRENT_USER);
    if (activeArqueo) {
      setArqueo(activeArqueo);
      const ing = await CashService.getIngresos(activeArqueo.idCaja);
      const egr = await CashService.getEgresos(activeArqueo.idCaja);
      setIngresos(ing);
      setEgresos(egr);
    }
    setLoading(false);
  };

  // Calculate Balance dynamically based on Arqueo Start + Incomes - Expenses
  const calculateBalance = () => {
    if (!arqueo) return 0;
    const totalIngresos = ingresos.reduce((acc, curr) => acc + curr.monto, 0);
    const totalEgresos = egresos.reduce((acc, curr) => acc + curr.monto, 0);
    return arqueo.montoInicial + totalIngresos - totalEgresos;
  };

  const currentBalance = calculateBalance();

  // Combine lists for the UI timeline
  const combinedMovements = [
    ...ingresos.map(i => ({ ...i, type: 'INGRESO', date: i.fechaCreacion })),
    ...egresos.map(e => ({ ...e, type: 'EGRESO', date: e.fechaCreacion }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (loading) return <div className="p-10 text-center">Cargando Caja...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Caja y Movimientos</h2>
          <p className="text-slate-500 mt-1">Control de Arqueo y Flujo Diario</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {arqueo?.estado === 'Abierta' ? (
            <button 
              className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-medium shadow-lg shadow-slate-800/20 transition-all"
              onClick={() => alert("Función: Actualizar tabla arqueo -> fechaCierre")}
            >
              <Lock size={18} /> Cerrar Caja
            </button>
          ) : (
            <button 
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-medium shadow-lg shadow-emerald-600/20 transition-all"
              onClick={() => alert("Función: Insertar nuevo registro en tabla arqueo")}
            >
              <Unlock size={18} /> Aperturar Caja
            </button>
          )}
          <button className="bg-white border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 text-slate-700 px-5 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 shadow-sm">
            <PlusCircle size={18} /> Registrar Gasto (Egreso)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 rounded-2xl shadow-xl shadow-indigo-600/20 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
          <div>
            <p className="text-indigo-100 font-medium mb-1 flex items-center gap-2">
              <FileText size={16} /> Saldo Calculado
            </p>
            <h3 className="text-4xl font-bold tracking-tight">
              L. {currentBalance.toLocaleString()}
            </h3>
            <p className="text-xs text-indigo-300 mt-2">Base Inicial: L. {arqueo?.montoInicial.toLocaleString()}</p>
          </div>
          <div className="mt-8 flex items-center gap-3">
             <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 ${arqueo?.estado === 'Abierta' ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/30' : 'bg-red-500/20 text-red-100 border border-red-500/30'}`}>
                <div className={`w-2 h-2 rounded-full ${arqueo?.estado === 'Abierta' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                {arqueo?.estado === 'Abierta' ? 'CAJA ABIERTA' : 'CERRADA'}
             </div>
             <span className="text-xs text-indigo-200">{arqueo?.idArqueo}</span>
          </div>
        </div>

        {/* Movements Table */}
        <div className="md:col-span-2 bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 overflow-hidden flex flex-col">
           <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
             <h4 className="font-bold text-slate-800">Movimientos (Ingresos/Egresos)</h4>
             <button className="text-xs font-bold text-indigo-600 hover:underline">Ver Historial</button>
           </div>
           <div className="overflow-x-auto flex-1">
             <table className="w-full text-left">
               <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                 <tr>
                   <th className="px-6 py-4">Tipo</th>
                   <th className="px-6 py-4">Descripción</th>
                   <th className="px-6 py-4">Hora</th>
                   <th className="px-6 py-4 text-right">Monto</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                 {combinedMovements.length === 0 ? (
                   <tr><td colSpan={4} className="p-6 text-center text-slate-400">Sin movimientos registrados hoy</td></tr>
                 ) : combinedMovements.map((mov: any, idx) => (
                   <tr key={idx} className="hover:bg-slate-50 transition-colors">
                     <td className="px-6 py-4">
                       <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold
                         ${mov.type === 'INGRESO' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 
                           'bg-red-50 text-red-700 border border-red-100'}`}>
                         {mov.type === 'INGRESO' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                         {mov.type}
                       </span>
                     </td>
                     <td className="px-6 py-4 text-sm font-medium text-slate-700">{mov.descripcion}</td>
                     <td className="px-6 py-4 text-sm text-slate-500 font-mono">{new Date(mov.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                     <td className={`px-6 py-4 text-sm font-bold text-right font-mono ${mov.type === 'EGRESO' ? 'text-red-600' : 'text-slate-800'}`}>
                       {mov.type === 'EGRESO' ? '-' : '+'} L. {mov.monto.toLocaleString()}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CashRegister;