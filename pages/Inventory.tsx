import React, { useState, useEffect } from 'react';
import { InventoryService } from '../services/api';
import { ProductoUnified, TipoProducto } from '../types';
import { Search, Plus, MoreVertical, Smartphone, Headphones, Box, Filter } from 'lucide-react';

const Inventory: React.FC = () => {
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    setLoading(true);
    const data = await InventoryService.getUnifiedProducts();
    setProducts(data);
    setLoading(false);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.imei && p.imei.includes(searchTerm));
    const matchesType = filterType === 'ALL' || p.tipo === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Inventario</h2>
          <p className="text-slate-500 mt-1">Base de Datos: telefonos & accesorios</p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-all shadow-lg shadow-indigo-600/20 active:transform active:scale-95">
          <Plus size={20} />
          <span>Nuevo Item</span>
        </button>
      </div>

      <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex p-1 bg-slate-100 rounded-xl w-full md:w-auto">
          <button 
            onClick={() => setFilterType('ALL')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${filterType === 'ALL' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Todos
          </button>
          <button 
             onClick={() => setFilterType('TELEFONO')}
             className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${filterType === 'TELEFONO' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Smartphone size={16} /> Teléfonos
          </button>
          <button 
             onClick={() => setFilterType('ACCESORIO')}
             className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${filterType === 'ACCESORIO' ? 'bg-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Headphones size={16} /> Accesorios
          </button>
        </div>

        <div className="relative w-full md:w-80 mr-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por código, IMEI o nombre..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all text-sm font-medium text-slate-700 placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="p-5 font-bold text-slate-600 text-xs uppercase tracking-wider">Producto / Código</th>
                <th className="p-5 font-bold text-slate-600 text-xs uppercase tracking-wider hidden md:table-cell">Tipo</th>
                <th className="p-5 font-bold text-slate-600 text-xs uppercase tracking-wider hidden lg:table-cell">Detalles (IMEI / Cat)</th>
                <th className="p-5 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">Stock</th>
                <th className="p-5 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">Precio Venta</th>
                <th className="p-5 font-bold text-slate-600 text-xs uppercase tracking-wider">Ubicación</th>
                <th className="p-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                 <tr><td colSpan={7} className="p-10 text-center text-slate-500">Cargando datos de SmartCloud...</td></tr>
              ) : filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs">
                        {product.tipo === 'TELEFONO' ? 'TEL' : 'ACC'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 text-sm">{product.nombre}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{product.codigo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-5 hidden md:table-cell">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold
                      ${product.tipo === 'TELEFONO' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-purple-50 text-purple-700 border border-purple-100'}`}>
                      {product.tipo}
                    </span>
                  </td>
                  <td className="p-5 text-sm text-slate-500 hidden lg:table-cell font-mono">
                     {product.imei ? (
                       <span className="flex items-center gap-1 text-slate-600"><Smartphone size={12}/> {product.imei}</span>
                     ) : (
                       <span className="text-slate-400">---</span>
                     )}
                  </td>
                  <td className="p-5 text-right">
                    <div className="flex flex-col items-end">
                      <span className={`font-bold text-sm ${product.stock <= 2 ? 'text-red-600' : 'text-slate-700'}`}>
                        {product.stock} un.
                      </span>
                    </div>
                  </td>
                  <td className="p-5 text-right font-bold text-slate-800">
                    L. {product.precioVenta.toLocaleString('es-HN', {minimumFractionDigits: 2})}
                  </td>
                  <td className="p-5 text-sm text-slate-500">
                     <div className="flex items-center gap-2">
                      <Box size={14} className="text-slate-300" />
                      {product.ubicacion || 'N/A'}
                    </div>
                  </td>
                  <td className="p-5 text-right">
                    <button className="text-slate-400 hover:text-indigo-600 p-2 rounded-lg hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100">
                      <MoreVertical size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Inventory;