import React, { useState, useEffect } from 'react';
import { ReportsService, CashService } from '../services/api';
import { 
  TrendingUp, Users, Package, DollarSign, ArrowUpRight, ArrowDownRight, 
  ShoppingCart, Activity, Smartphone, RefreshCw
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalVentas: 0,
    costoInventario: 0,
    cajasActivas: 0,
    gananciaEstimada: 0
  });
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [boxStatus, setBoxStatus] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const [trend, valuation, boxes] = await Promise.all([
        ReportsService.getSalesTrend(year),
        ReportsService.getInventoryValuation(),
        CashService.getAdminBoxesStatus()
      ]);

      setSalesTrend(trend);
      setBoxStatus(boxes);
      
      // Calculate KPIs
      const activeBoxes = boxes.filter((b: any) => b.estadoArqueo === 'Activo').length;
      const invCosto = valuation.reduce((acc: number, curr: any) => acc + Number(curr.costo_total || 0), 0);
      const totalV = trend.reduce((acc: number, curr: any) => acc + Number(curr.total || 0), 0);

      setMetrics({
        totalVentas: totalV,
        costoInventario: invCosto,
        cajasActivas: activeBoxes,
        gananciaEstimada: totalV * 0.25 // Placeholder logic
      });
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const kpis = [
    { label: 'Ventas Anuales', value: `L. ${metrics.totalVentas.toLocaleString()}`, icon: <TrendingUp className="text-indigo-600"/>, color: 'bg-indigo-50', trend: '+12.5%', isUp: true },
    { label: 'Costo Inventario', value: `L. ${metrics.costoInventario.toLocaleString()}`, icon: <Package className="text-emerald-600"/>, color: 'bg-emerald-50', trend: '-2.1%', isUp: false },
    { label: 'Cajas Activas', value: metrics.cajasActivas, icon: <Activity className="text-amber-600"/>, color: 'bg-amber-50', trend: 'Normal', isUp: true },
    { label: 'Ganancia Est.', value: `L. ${metrics.gananciaEstimada.toLocaleString()}`, icon: <DollarSign className="text-blue-600"/>, color: 'bg-blue-50', trend: '+5.4%', isUp: true },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Panel de Control</h2>
            <p className="text-slate-500 font-medium">Resumen general de operaciones de SmartCloud</p>
          </div>
          <button onClick={loadDashboardData} className="p-2.5 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-xl transition-all border border-transparent hover:border-slate-200 shadow-sm">
              <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 transition-all hover:shadow-md group">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-2xl ${kpi.color} group-hover:scale-110 transition-transform`}>
                {kpi.icon}
              </div>
              <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${kpi.isUp ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                {kpi.isUp ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
                {kpi.trend}
              </div>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{kpi.label}</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{kpi.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
           <div className="flex justify-between items-center mb-8">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><TrendingUp size={20} className="text-indigo-500"/> Flujo de Ingresos</h3>
              <select className="bg-slate-50 border-none text-xs font-bold text-slate-500 p-2 rounded-lg outline-none">
                  <option>Año Actual</option>
                  <option>Año Pasado</option>
              </select>
           </div>
           <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrend}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    cursor={{ stroke: '#4f46e5', strokeWidth: 2 }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={4} fillOpacity={1} fill="url(#colorTotal)" />
                </AreaChart>
              </ResponsiveContainer>
           </div>
        </div>

        {/* Box Status Summary */}
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 text-lg mb-6 flex items-center gap-2"><Smartphone size={20} className="text-indigo-500"/> Estado de Terminales</h3>
            <div className="space-y-4">
                {boxStatus.slice(0, 5).map((box, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:border-indigo-100 transition-all">
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${box.estadoArqueo === 'Activo' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}/>
                            <div>
                                <p className="text-sm font-bold text-slate-700">{box.nombreCaja}</p>
                                <p className="text-[10px] text-slate-400 uppercase font-bold">{box.usuario || 'Desconectado'}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-black text-indigo-600">L. {Number(box.montoFinal || 0).toLocaleString()}</p>
                            <p className="text-[9px] text-slate-400 font-bold">ACTUAL</p>
                        </div>
                    </div>
                ))}
                {boxStatus.length === 0 && <p className="text-center text-slate-400 py-10 italic">No hay cajas registradas</p>}
            </div>
            <button 
                onClick={() => window.location.href = '/admin/cash-dashboard'}
                className="w-full mt-6 py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"
            >
                Ver todas las cajas
            </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;