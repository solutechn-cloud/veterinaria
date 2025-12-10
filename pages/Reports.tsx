
import React, { useState, useEffect } from 'react';
import { ReportsService } from '../services/api';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable'; // Importación para tablas en PDF
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Legend, PieChart, Pie, Cell 
} from 'recharts';
import { FileText, Download, Filter, TrendingUp, Package, Users, Smartphone } from 'lucide-react';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState('SALES');
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  
  // Data States
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [inventoryVal, setInventoryVal] = useState<any[]>([]);
  const [recharges, setRecharges] = useState<any[]>([]);
  const [topClients, setTopClients] = useState<any[]>([]);
  const [dailySales, setDailySales] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [activeTab, year, month]);

  const getDates = () => {
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const end = `${year}-${String(month).padStart(2, '0')}-31`; // SQL handles overflow dates usually or use library
      return { start, end };
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDates();

      if (activeTab === 'SALES') {
          const trend = await ReportsService.getSalesTrend(year);
          setSalesTrend(trend);
          const daily = await ReportsService.getDailySales(start, end);
          setDailySales(daily);
      } else if (activeTab === 'INVENTORY') {
          const inv = await ReportsService.getInventoryValuation();
          setInventoryVal(inv);
          const top = await ReportsService.getTopProducts(start, end);
          setTopProducts(top);
      } else if (activeTab === 'RECHARGES') {
          const rec = await ReportsService.getRechargesProfit(year);
          setRecharges(rec);
      } else if (activeTab === 'CLIENTS') {
          const clients = await ReportsService.getTopClients(start, end);
          setTopClients(clients);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // --- PDF GENERATOR HELPER ---
  const generatePDF = (title: string, columns: string[], data: any[], filename: string) => {
      const doc = new jsPDF();
      
      // Header
      doc.setFillColor(79, 70, 229); // Indigo 600
      doc.rect(0, 0, 210, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text("SMARTCLOUD ERP", 14, 15);
      doc.setFontSize(10);
      doc.text("Reporte Generado Automáticamente", 140, 15);

      // Info
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.text(title, 14, 35);
      doc.setFontSize(10);
      doc.text(`Fecha Emisión: ${new Date().toLocaleDateString()}`, 14, 42);
      
      // @ts-ignore
      doc.autoTable({
          startY: 50,
          head: [columns],
          body: data,
          theme: 'striped',
          headStyles: { fillColor: [79, 70, 229] },
          alternateRowStyles: { fillColor: [245, 247, 255] }
      });

      doc.save(`${filename}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
         <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-indigo-600"/> Reportes y Análisis
            </h2>
            <p className="text-slate-500 text-sm">Visualiza el rendimiento de tu negocio.</p>
         </div>
         <div className="flex gap-3">
             <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                 <Filter size={16} className="text-slate-400"/>
                 <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-transparent text-sm font-bold text-slate-700 outline-none">
                     {[2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
                 </select>
             </div>
             <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                 <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-transparent text-sm font-bold text-slate-700 outline-none">
                     {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                         <option key={m} value={m}>{new Date(0, m-1).toLocaleString('es', {month: 'long'})}</option>
                     ))}
                 </select>
             </div>
         </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[
              { id: 'SALES', label: 'Ventas', icon: <TrendingUp size={18}/> },
              { id: 'INVENTORY', label: 'Inventario', icon: <Package size={18}/> },
              { id: 'RECHARGES', label: 'Recargas', icon: <Smartphone size={18}/> },
              { id: 'CLIENTS', label: 'Clientes', icon: <Users size={18}/> },
          ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                  {tab.icon} {tab.label}
              </button>
          ))}
      </div>

      {/* --- DASHBOARD CONTENT --- */}
      
      {activeTab === 'SALES' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chart */}
              <div className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-6">Tendencia de Ingresos ({year})</h3>
                  <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={salesTrend}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                              <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}}/>
                              <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}}/>
                              <Tooltip contentStyle={{borderRadius: '12px', border:'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}/>
                              <Legend />
                              <Line type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={3} dot={{r: 4}} name="Ventas (L.)"/>
                          </LineChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              {/* Daily Sales Table */}
              <div className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-slate-800">Detalle de Ventas Diarias ({new Date(0, month-1).toLocaleString('es', {month: 'long'})})</h3>
                      <button 
                        onClick={() => generatePDF(`Ventas Diarias - ${month}/${year}`, ['Fecha', 'Vendedor', 'N. Ventas', 'Total'], dailySales.map(d => [new Date(d.fecha).toLocaleDateString(), d.vendedor, d.num_ventas, `L. ${d.total_dia}`]), `Ventas_${month}_${year}`)}
                        className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-bold"
                      >
                          <Download size={18}/> Exportar PDF
                      </button>
                  </div>
                  <div className="overflow-x-auto">
                      <table className="w-full text-left">
                          <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                              <tr>
                                  <th className="p-3">Fecha</th>
                                  <th className="p-3">Vendedor</th>
                                  <th className="p-3 text-center">Transacciones</th>
                                  <th className="p-3 text-right">Total</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {dailySales.map((d, i) => (
                                  <tr key={i} className="hover:bg-slate-50">
                                      <td className="p-3 text-sm">{new Date(d.fecha).toLocaleDateString()}</td>
                                      <td className="p-3 text-sm">{d.vendedor}</td>
                                      <td className="p-3 text-sm text-center">{d.num_ventas}</td>
                                      <td className="p-3 text-sm font-bold text-right text-emerald-600">L. {Number(d.total_dia).toFixed(2)}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'INVENTORY' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-4">Valoración de Inventario</h3>
                  <div className="space-y-4">
                      {inventoryVal.map((inv, i) => (
                          <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                              <div className="flex justify-between mb-2">
                                  <span className="font-bold text-slate-700">{inv.categoria}</span>
                                  <span className="text-xs bg-white px-2 py-1 rounded border text-slate-500">{inv.cantidad} Unidades</span>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <p className="text-xs text-slate-400">Costo Total</p>
                                      <p className="font-bold text-slate-800">L. {Number(inv.costo_total).toFixed(2)}</p>
                                  </div>
                                  <div>
                                      <p className="text-xs text-slate-400">Venta Proyectada</p>
                                      <p className="font-bold text-indigo-600">L. {Number(inv.venta_proyectada).toFixed(2)}</p>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-slate-800">Top Productos Vendidos (Mes)</h3>
                      <button 
                        onClick={() => generatePDF(`Top Productos - ${month}/${year}`, ['Producto', 'Cant.', 'Total'], topProducts.map(p => [p.producto, p.cantidad, `L. ${p.total_vendido}`]), 'Top_Productos')}
                        className="text-slate-400 hover:text-indigo-600"
                      ><Download size={20}/></button>
                  </div>
                  <table className="w-full text-left">
                      <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                          <tr><th className="p-3">Producto</th><th className="p-3 text-center">Cant.</th><th className="p-3 text-right">Total</th></tr>
                      </thead>
                      <tbody>
                          {topProducts.map((p, i) => (
                              <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                                  <td className="p-3 text-sm font-medium text-slate-700">{p.producto}</td>
                                  <td className="p-3 text-sm text-center">{p.cantidad}</td>
                                  <td className="p-3 text-sm text-right font-bold text-indigo-600">L. {Number(p.total_vendido).toFixed(2)}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {activeTab === 'RECHARGES' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="font-bold text-slate-800 mb-6">Ganancias por Recargas ({year})</h3>
              <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={recharges}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                          <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}}/>
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}}/>
                          <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border:'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}/>
                          <Legend />
                          <Bar dataKey="ganancia" fill="#10b981" name="Ganancia (L.)" radius={[4,4,0,0]} barSize={30} />
                          <Bar dataKey="venta_total" fill="#3b82f6" name="Venta Total (L.)" radius={[4,4,0,0]} barSize={30} />
                      </BarChart>
                  </ResponsiveContainer>
              </div>
          </div>
      )}

      {activeTab === 'CLIENTS' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-slate-800">Mejores Clientes (Mes)</h3>
                  <button 
                    onClick={() => generatePDF(`Top Clientes - ${month}/${year}`, ['Identidad', 'Nombre', 'Compras', 'Total'], topClients.map(c => [c.identidad, c.nombre, c.compras, `L. ${c.total_gastado}`]), 'Top_Clientes')}
                    className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors flex items-center gap-2"
                  >
                      <Download size={18}/> Descargar Reporte
                  </button>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left">
                      <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                          <tr>
                              <th className="p-4">Cliente</th>
                              <th className="p-4 text-center">Frecuencia Compra</th>
                              <th className="p-4 text-right">Monto Total</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {topClients.map((c, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                  <td className="p-4">
                                      <p className="font-bold text-slate-800">{c.nombre}</p>
                                      <p className="text-xs text-slate-400">{c.identidad}</p>
                                  </td>
                                  <td className="p-4 text-center">
                                      <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">{c.compras} Visitas</span>
                                  </td>
                                  <td className="p-4 text-right font-bold text-indigo-600">L. {Number(c.total_gastado).toFixed(2)}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}
    </div>
  );
};

export default Reports;
