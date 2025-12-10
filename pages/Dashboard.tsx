
import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';
import { DollarSign, ShoppingBag, Users, AlertTriangle, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { MOCK_SALES } from '../services/mockData';

const dataSales = [
  { name: 'Lun', venta: 4000 },
  { name: 'Mar', venta: 3000 },
  { name: 'Mie', venta: 2000 },
  { name: 'Jue', venta: 2780 },
  { name: 'Vie', venta: 1890 },
  { name: 'Sab', venta: 6390 },
  { name: 'Dom', venta: 3490 },
];

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  trend?: string;
  isPositive?: boolean;
  colorClass: string;
  iconBgClass: string;
}> = ({ title, value, icon, trend, isPositive, colorClass, iconBgClass }) => (
  <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 transition-all hover:shadow-lg hover:-translate-y-1">
    <div className="flex items-start justify-between mb-4">
      <div className={`p-3 rounded-xl ${iconBgClass} ${colorClass}`}>
        {icon}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
          {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {trend}
        </div>
      )}
    </div>
    <div>
      <h3 className="text-3xl font-bold text-slate-800 tracking-tight">{value}</h3>
      <p className="text-sm font-medium text-slate-500 mt-1">{title}</p>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const safeSales = Array.isArray(MOCK_SALES) ? MOCK_SALES : [];
  const totalSales = safeSales.reduce((acc, curr) => acc + (curr.total || 0), 0);
  const safeChartData = Array.isArray(dataSales) ? dataSales : [];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Panel de Control</h2>
          <p className="text-slate-500 mt-1">Resumen general de SmartCloud ERP</p>
        </div>
        <div className="flex gap-3">
          <select className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm w-full md:w-auto">
            <option>Esta Semana</option>
            <option>Este Mes</option>
            <option>Este Año</option>
          </select>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg shadow-lg shadow-indigo-600/20 transition-all whitespace-nowrap">
            Descargar
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Ventas Totales" 
          value={`L. ${totalSales.toLocaleString()}`} 
          icon={<DollarSign size={22} />} 
          trend="+12.5%"
          isPositive={true}
          colorClass="text-indigo-600"
          iconBgClass="bg-indigo-50"
        />
        <StatCard 
          title="Transacciones" 
          value={safeSales.length.toString()} 
          icon={<ShoppingBag size={22} />} 
          trend="+5.2%"
          isPositive={true}
          colorClass="text-purple-600"
          iconBgClass="bg-purple-50"
        />
        <StatCard 
          title="Nuevos Clientes" 
          value="12" 
          icon={<Users size={22} />} 
          trend="+2.1%"
          isPositive={true}
          colorClass="text-blue-600"
          iconBgClass="bg-blue-50"
        />
        <StatCard 
          title="Alertas de Stock" 
          value="2" 
          icon={<AlertTriangle size={22} />} 
          trend="-1 Item"
          isPositive={false}
          colorClass="text-amber-600"
          iconBgClass="bg-amber-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Resumen de Ingresos</h3>
              <p className="text-sm text-slate-500">Comportamiento de ventas últimos 7 días</p>
            </div>
          </div>
          <div className="h-80 w-full">
            {safeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={safeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVenta" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#64748b', fontSize: 12}} 
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#64748b', fontSize: 12}} 
                  />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}} 
                    contentStyle={{
                      borderRadius: '12px', 
                      border: 'none', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                      padding: '12px 16px'
                    }} 
                  />
                  <Bar 
                    dataKey="venta" 
                    fill="url(#colorVenta)" 
                    radius={[6, 6, 0, 0]} 
                    barSize={40} 
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">Sin datos para mostrar</div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white p-6 rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 flex flex-col">
          <h3 className="font-bold text-slate-800 text-lg mb-6">Actividad Reciente</h3>
          <div className="space-y-6 flex-1 overflow-y-auto pr-2 max-h-[400px]">
            {safeSales.slice(0, 4).map((sale) => (
              <div key={sale.id} className="flex items-center gap-4 group cursor-pointer">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-100 transition-all shrink-0">
                  <DollarSign size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <p className="font-semibold text-slate-800 text-sm truncate">Venta #{sale.id}</p>
                    <span className="text-xs font-bold text-slate-800">L. {sale.total}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{new Date(sale.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {sale.clientName}</p>
                </div>
              </div>
            ))}
          </div>
          
          <button className="mt-6 w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all border border-slate-200 border-dashed hover:border-indigo-200 hover:border-solid">
            Ver todas las transacciones <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
