
import React, { useEffect, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  Smartphone, Plug, Users, Store, TrendingUp, ArrowRight, DollarSign, Activity, Loader2, AlertCircle
} from 'lucide-react';
import { 
  InventoryService, 
  ClientService, 
  ReportsService, 
  SalesService
} from '../services/api';
import { useHistory } from 'react-router-dom';

// Colores para el Pie Chart (Productos Top)
const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const StatCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
  borderColor: string;
}> = ({ title, value, subtitle, icon, colorClass, bgClass, borderColor }) => (
  <div className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${borderColor} flex items-center gap-4 transition-all hover:shadow-md`}>
    <div className={`p-3 rounded-lg ${bgClass} ${colorClass}`}>
      {icon}
    </div>
    <div>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      <p className="text-sm font-bold text-slate-600 uppercase tracking-wide">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const history = useHistory();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Data States
  const [kpiData, setKpiData] = useState({
    phonesCount: 0,
    accessoriesCount: 0,
    clientsCount: 0,
    providersCount: 0
  });
  const [salesChartData, setSalesChartData] = useState<any[]>([]);
  const [topProductsData, setTopProductsData] = useState<any[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const getDates = () => {
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 6); // Last 7 days

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Helper to format YYYY-MM-DD
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    
    return {
      today: fmt(today),
      sevenDaysAgo: fmt(lastWeek),
      firstDayMonth: fmt(startOfMonth)
    };
  };

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const dates = getDates();

      // 1. Fetch KPIs Data in Parallel
      const [phones, stock, clients, providers] = await Promise.all([
        InventoryService.getTelefonos(),
        InventoryService.getStockAccesorios(),
        ClientService.getAll(),
        InventoryService.getProveedores()
      ]);

      // Calculate Counts
      const phonesCount = phones.filter(p => p.estado === 'Disponible').length;
      const accessoriesCount = stock.reduce((acc, item) => acc + Number(item.cantidad), 0);
      
      setKpiData({
        phonesCount,
        accessoriesCount,
        clientsCount: clients.length,
        providersCount: providers.length
      });

      // 2. Fetch Chart Data (Sales Last 7 Days)
      const dailyData = await ReportsService.getDailySales(dates.sevenDaysAgo, dates.today);
      
      // Process Daily Data to ensure all 7 days are represented
      const processedChartData = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
        const dayName = d.toLocaleDateString('es-ES', { weekday: 'long' }); // Lunes, Martes...
        
        // Find existing data or default to 0
        const found = dailyData.find((item: any) => item.fecha && item.fecha.startsWith(dateStr));
        processedChartData.push({
          name: dayName.charAt(0).toUpperCase() + dayName.slice(1), // Capitalize
          fullDate: dateStr,
          total: found ? Number(found.total_dia) : 0
        });
      }
      setSalesChartData(processedChartData);

      // 3. Fetch Top Products (This Month)
      const topProds = await ReportsService.getTopProducts(dates.firstDayMonth, dates.today);
      const pieData = topProds.slice(0, 5).map(item => ({
        name: item.producto || 'Producto General',
        value: Number(item.cantidad)
      }));
      setTopProductsData(pieData);

      // 4. Fetch Recent Activity
      const recent = await SalesService.getVentasDiarias(); 
      setRecentSales(recent.slice(0, 5)); // Take top 5

    } catch (err: any) {
      console.error("Error loading dashboard data:", err);
      setError("No se pudieron cargar algunos datos del dashboard. Verifique la conexión.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-4 text-slate-400">
        <Loader2 className="animate-spin" size={40} />
        <p>Cargando métricas en tiempo real...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Panel de Control</h2>
          <p className="text-slate-500 mt-1">Resumen general de SmartCloud ERP</p>
        </div>
        <div className="flex gap-2">
           <span className="bg-white px-4 py-2 rounded-lg text-sm font-bold text-slate-600 border border-slate-200 shadow-sm capitalize">
             {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
           </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-2 border border-red-100">
          <AlertCircle size={20}/> {error}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Teléfonos Disp."
          value={kpiData.phonesCount}
          subtitle="En Inventario"
          icon={<Smartphone size={24} />} 
          colorClass="text-blue-600"
          bgClass="bg-blue-100"
          borderColor="border-l-blue-500"
        />
        <StatCard 
          title="Accesorios Stock"
          value={kpiData.accessoriesCount}
          subtitle="Unidades Totales"
          icon={<Plug size={24} />} 
          colorClass="text-orange-600"
          bgClass="bg-orange-100"
          borderColor="border-l-orange-500"
        />
        <StatCard 
          title="Clientes Reg."
          value={kpiData.clientsCount}
          subtitle="Base de Datos"
          icon={<Users size={24} />} 
          colorClass="text-teal-600"
          bgClass="bg-teal-100"
          borderColor="border-l-teal-500"
        />
        <StatCard 
          title="Proveedores"
          value={kpiData.providersCount}
          subtitle="Activos"
          icon={<Store size={24} />} 
          colorClass="text-indigo-600"
          bgClass="bg-indigo-100"
          borderColor="border-l-indigo-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <TrendingUp className="text-indigo-600" size={20}/> Ventas de la Semana
              </h3>
              <p className="text-sm text-slate-500">Ingresos brutos últimos 7 días</p>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                  tick={{fill: '#64748b', fontSize: 11}} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 12}} 
                  tickFormatter={(val) => `L.${val}`}
                />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}} 
                  contentStyle={{
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    padding: '12px 16px'
                  }}
                  formatter={(val: number) => [`L. ${val.toLocaleString()}`, 'Venta Total']}
                />
                <Bar 
                  dataKey="total" 
                  fill="url(#colorVenta)" 
                  radius={[6, 6, 0, 0]} 
                  barSize={40} 
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products Pie Chart */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
          <h3 className="font-bold text-slate-800 text-lg mb-2">Productos Más Vendidos</h3>
          <p className="text-sm text-slate-500 mb-6">Top 5 por cantidad (Mes actual)</p>
          
          <div className="flex-1 min-h-[250px] relative">
             {topProductsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topProductsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {topProductsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
             ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                   Sin datos de ventas este mes.
                </div>
             )}
          </div>
        </div>
      </div>

      {/* Recent Activity List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
             <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                   <Activity className="text-indigo-600" size={20}/> Actividad Reciente
                </h3>
                <p className="text-sm text-slate-500">Últimas transacciones registradas</p>
             </div>
             <button onClick={() => history.push('/cash')} className="text-indigo-600 text-sm font-bold flex items-center gap-1 hover:underline">
                Ver todo <ArrowRight size={16}/>
             </button>
          </div>
          
          <div className="overflow-x-auto">
             <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                   <tr>
                      <th className="p-4 pl-6">ID Venta</th>
                      <th className="p-4">Cliente</th>
                      <th className="p-4">Fecha / Hora</th>
                      <th className="p-4">Estado</th>
                      <th className="p-4 text-right pr-6">Total</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                   {recentSales.length > 0 ? recentSales.map((sale) => (
                      <tr key={sale.codVenta} className="hover:bg-slate-50 transition-colors">
                         <td className="p-4 pl-6">
                            <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                  <DollarSign size={14} />
                               </div>
                               <span className="font-bold text-slate-700 text-sm">{sale.codVenta}</span>
                            </div>
                         </td>
                         <td className="p-4 text-sm text-slate-600">{sale.nombreCliente}</td>
                         <td className="p-4 text-sm text-slate-500">
                            {new Date(sale.fecha).toLocaleDateString()} <span className="text-xs ml-1 opacity-70">{new Date(sale.fecha).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                         </td>
                         <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                               sale.estado === 'Completada' ? 'bg-emerald-100 text-emerald-700' : 
                               sale.estado === 'Anulada' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                               {sale.estado}
                            </span>
                         </td>
                         <td className="p-4 pr-6 text-right font-bold text-indigo-600">
                            L. {Number(sale.total).toLocaleString(undefined, {minimumFractionDigits: 2})}
                         </td>
                      </tr>
                   )) : (
                      <tr>
                         <td colSpan={5} className="p-8 text-center text-slate-400">No hay actividad reciente.</td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
      </div>
    </div>
  );
};

export default Dashboard;
