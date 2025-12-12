
import React, { useState, useEffect } from 'react';
import { InventoryService } from '../services/api';
import { 
  Telefono, 
  Inventario, 
  Accesorio, 
  Categoria, 
  Ubicacion, 
  Proveedor 
} from '../types';
import { 
  Search, PlusCircle, Package, Smartphone, Layers, MapPin, Tag, Edit2, Trash2, X, RefreshCw, Box, Filter
} from 'lucide-react';
import Swal from 'sweetalert2';

type InventoryTab = 'TELEPHONES' | 'STOCK' | 'MASTER' | 'CATEGORIES' | 'LOCATIONS';

const Inventory: React.FC = () => {
  const [activeTab, setActiveTab] = useState<InventoryTab>('TELEPHONES');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // NEW: Filter for Phones Status
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Data Arrays
  const [phones, setPhones] = useState<Telefono[]>([]);
  const [stock, setStock] = useState<Inventario[]>([]);
  const [master, setMaster] = useState<Accesorio[]>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [locations, setLocations] = useState<Ubicacion[]>([]);
  const [providers, setProviders] = useState<Proveedor[]>([]);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Forms
  const [phoneForm, setPhoneForm] = useState<Partial<Telefono>>({ estado: 'Disponible' });
  const [stockForm, setStockForm] = useState<Partial<Inventario>>({ estado: 'Activo' });
  const [masterForm, setMasterForm] = useState<Partial<Accesorio>>({});
  const [catForm, setCatForm] = useState<Partial<Categoria>>({});
  const [locForm, setLocForm] = useState<Partial<Ubicacion>>({ estado: 'Activo' });

  useEffect(() => {
    loadData();
    loadDependencies();
  }, [activeTab]);

  const loadDependencies = async () => {
      try {
          const [provs, cats, locs] = await Promise.all([
              InventoryService.getProveedores(),
              InventoryService.getCategorias(),
              InventoryService.getUbicaciones()
          ]);
          setProviders(provs || []);
          setCategories(cats || []);
          setLocations(locs || []);
      } catch (error) {
          console.error("Error loading dependencies", error);
      }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'TELEPHONES') {
          const data = await InventoryService.getTelefonos();
          setPhones(data || []);
      } else if (activeTab === 'STOCK') {
          const data = await InventoryService.getStockAccesorios();
          setStock(data || []);
      } else if (activeTab === 'MASTER') {
          const data = await InventoryService.getAccesoriosMaster();
          setMaster(data || []);
      } else if (activeTab === 'CATEGORIES') {
          const data = await InventoryService.getCategorias();
          setCategories(data || []);
      } else if (activeTab === 'LOCATIONS') {
          const data = await InventoryService.getUbicaciones();
          setLocations(data || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (item?: any) => {
      setIsEditing(!!item);
      setCurrentId(item ? (item.codigo || item.codInventario || item.codAccesorio || item.codCategoria || item.idUbicacion) : null);

      if (activeTab === 'TELEPHONES') {
          setPhoneForm(item || { estado: 'Disponible', fecha: new Date().toISOString().split('T')[0] });
      } else if (activeTab === 'STOCK') {
          setStockForm(item || { estado: 'Activo', fecha: new Date().toISOString().split('T')[0] });
      } else if (activeTab === 'MASTER') {
          setMasterForm(item || {});
      } else if (activeTab === 'CATEGORIES') {
          setCatForm(item || {});
      } else if (activeTab === 'LOCATIONS') {
          setLocForm(item || { estado: 'Activo' });
      }
      setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isEditing) {
        if (activeTab === 'TELEPHONES') {
            const imeiExists = phones.some(p => p.imei1 === phoneForm.imei1);
            if (imeiExists) {
                return Swal.fire({ title: 'IMEI Duplicado', text: `El IMEI ${phoneForm.imei1} ya existe.`, icon: 'warning' });
            }
        } else if (activeTab === 'STOCK') {
            const stockExists = stock.some(s => s.codAccesorio === stockForm.codAccesorio && s.idubicacion === stockForm.idubicacion);
            if (stockExists) {
                return Swal.fire({ title: 'Producto ya en Inventario', text: 'Edite la cantidad existente.', icon: 'warning' });
            }
        }
    }

    try {
      if (activeTab === 'TELEPHONES') {
        if(isEditing) await InventoryService.updateTelefono(currentId!, phoneForm);
        else await InventoryService.createTelefono(phoneForm);
      } else if (activeTab === 'STOCK') {
        if(isEditing) await InventoryService.updateStock(currentId!, stockForm);
        else await InventoryService.createStock(stockForm);
      } else if (activeTab === 'MASTER') {
        if(isEditing) await InventoryService.updateAccesorioMaster(currentId!, masterForm);
        else await InventoryService.createAccesorioMaster(masterForm);
      } else if (activeTab === 'CATEGORIES') {
        if(isEditing) await InventoryService.updateCategoria(currentId!, catForm);
        else await InventoryService.createCategoria(catForm);
      } else if (activeTab === 'LOCATIONS') {
        if(isEditing) await InventoryService.updateUbicacion(currentId!, locForm);
        else await InventoryService.createUbicacion(locForm);
      }
      setShowModal(false);
      Swal.fire({ title: 'Éxito', icon: 'success', timer: 1500, showConfirmButton: false });
      loadData();
    } catch (error: any) { Swal.fire('Error', error.message, 'error'); }
  };

  const handleDelete = async (id: string) => {
      const result = await Swal.fire({ title: '¿Eliminar registro?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar' });
      if (result.isConfirmed) {
          try {
            if (activeTab === 'TELEPHONES') await InventoryService.deleteTelefono(id);
            else if (activeTab === 'STOCK') await InventoryService.deleteStock(id);
            else if (activeTab === 'MASTER') await InventoryService.deleteAccesorioMaster(id);
            else if (activeTab === 'CATEGORIES') await InventoryService.deleteCategoria(id);
            else if (activeTab === 'LOCATIONS') await InventoryService.deleteUbicacion(id);
            Swal.fire('Eliminado', '', 'success');
            loadData();
          } catch (error: any) { Swal.fire('Error', error.message, 'error'); }
      }
  };

  const renderContent = () => {
      if (loading) return <div className="p-8 text-center text-slate-500">Cargando datos...</div>;

      if (activeTab === 'TELEPHONES') {
          const filtered = phones.filter(p => {
              const matchesSearch = p.marca.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                    p.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    p.imei1.includes(searchTerm);
              const matchesStatus = statusFilter === 'ALL' || p.estado === statusFilter;
              return matchesSearch && matchesStatus;
          });
          return (
              <table className="w-full text-left">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0">
                      <tr>
                          <th className="p-3">Código</th>
                          <th className="p-3">Marca/Modelo</th>
                          <th className="p-3">IMEI</th>
                          <th className="p-3">Precio Venta</th>
                          <th className="p-3">Ubicación</th>
                          <th className="p-3">Estado</th>
                          <th className="p-3 text-right">Acciones</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {filtered.map(p => (
                          <tr key={p.codigo} className="hover:bg-slate-50 text-sm">
                              <td className="p-3 font-mono text-slate-500">{p.codigo}</td>
                              <td className="p-3 font-bold text-slate-700">{p.marca} {p.modelo}</td>
                              <td className="p-3 font-mono">{p.imei1}</td>
                              <td className="p-3 font-bold text-emerald-600">L. {Number(p.precioVenta).toFixed(2)}</td>
                              <td className="p-3 text-xs">{p.nombreUbicacion || p.idubicacion}</td>
                              <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${p.estado === 'Disponible' ? 'bg-green-100 text-green-700' : p.estado === 'Vendido' ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-600'}`}>{p.estado}</span></td>
                              <td className="p-3 text-right">
                                  <button onClick={() => openModal(p)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded mr-1"><Edit2 size={16}/></button>
                                  <button onClick={() => handleDelete(p.codigo)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          );
      }

      if (activeTab === 'STOCK') {
        const filtered = stock.filter(s => 
            s.descripcionAccesorio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.codInventario.toLowerCase().includes(searchTerm.toLowerCase())
        );
        return (
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0">
                    <tr>
                        <th className="p-3">SKU</th>
                        <th className="p-3">Descripción</th>
                        <th className="p-3">Categoría</th>
                        <th className="p-3 text-center">Cant.</th>
                        <th className="p-3 text-right">P. Venta</th>
                        <th className="p-3">Ubicación</th>
                        <th className="p-3 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filtered.map(s => (
                        <tr key={s.codInventario} className="hover:bg-slate-50 text-sm">
                            <td className="p-3 font-mono text-slate-500 text-xs">{s.codInventario}</td>
                            <td className="p-3 font-bold text-slate-700">{s.descripcionAccesorio}</td>
                            <td className="p-3 text-xs">{s.categoriaAccesorio}</td>
                            <td className="p-3 text-center">
                                <span className={`px-2 py-1 rounded-md font-bold text-xs ${s.cantidad > 5 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                    {s.cantidad}
                                </span>
                            </td>
                            <td className="p-3 text-right font-bold text-emerald-600">L. {Number(s.precioVenta).toFixed(2)}</td>
                            <td className="p-3 text-xs">{s.nombreUbicacion || s.idubicacion}</td>
                            <td className="p-3 text-right">
                                <button onClick={() => openModal(s)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded mr-1"><Edit2 size={16}/></button>
                                <button onClick={() => handleDelete(s.codInventario)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
      }

      if (activeTab === 'MASTER') {
          return (
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0">
                    <tr>
                        <th className="p-3">ID</th>
                        <th className="p-3">Descripción</th>
                        <th className="p-3">Categoría</th>
                        <th className="p-3 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {master.filter(m => m.descripcion.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                        <tr key={m.codAccesorio} className="hover:bg-slate-50 text-sm">
                            <td className="p-3 font-mono text-slate-500 text-xs">{m.codAccesorio}</td>
                            <td className="p-3 font-bold text-slate-700">{m.descripcion}</td>
                            <td className="p-3">{m.nombreCategoria || m.codCategoria}</td>
                            <td className="p-3 text-right">
                                <button onClick={() => openModal(m)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded mr-1"><Edit2 size={16}/></button>
                                <button onClick={() => handleDelete(m.codAccesorio)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
          );
      }

      if (activeTab === 'CATEGORIES') {
          return (
             <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                 {categories.map(c => (
                     <div key={c.codCategoria} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
                         <div>
                             <p className="font-bold text-slate-700">{c.tipo}</p>
                             <p className="text-xs text-slate-400 font-mono">{c.codCategoria}</p>
                         </div>
                         <div className="flex gap-1">
                            <button onClick={() => openModal(c)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                            <button onClick={() => handleDelete(c.codCategoria)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                         </div>
                     </div>
                 ))}
             </div>
          );
      }

      if (activeTab === 'LOCATIONS') {
          return (
             <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                 {locations.map(l => (
                     <div key={l.idUbicacion} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                         <div className={`absolute left-0 top-0 bottom-0 w-1 ${l.estado === 'Activo' ? 'bg-green-500' : 'bg-red-500'}`}/>
                         <div className="pl-3">
                             <div className="flex justify-between items-start">
                                 <div>
                                    <h4 className="font-bold text-slate-800">{l.nombre}</h4>
                                    <p className="text-xs text-slate-500">{l.descripcion}</p>
                                 </div>
                                 <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openModal(l)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                                    <button onClick={() => handleDelete(l.idUbicacion)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                                 </div>
                             </div>
                             <div className="mt-3 flex gap-2 text-xs">
                                 <span className="bg-slate-100 px-2 py-1 rounded text-slate-600 font-mono">Estante: {l.estante}</span>
                                 <span className="bg-slate-100 px-2 py-1 rounded text-slate-600 font-mono">Nivel: {l.nivel}</span>
                             </div>
                         </div>
                     </div>
                 ))}
             </div>
          );
      }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Package className="text-indigo-600"/> Gestión de Inventario
            </h2>
            <p className="text-slate-500 text-sm">Control de teléfonos, accesorios y configuraciones.</p>
          </div>
          <button 
             onClick={() => openModal()} 
             className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-indigo-600/20 transition-all"
          >
             <PlusCircle size={20}/>
             <span>Nuevo Registro</span>
          </button>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {[
              { id: 'TELEPHONES', label: 'Teléfonos', icon: <Smartphone size={18}/> },
              { id: 'STOCK', label: 'Stock Accesorios', icon: <Box size={18}/> },
              { id: 'MASTER', label: 'Catálogo Maestro', icon: <Layers size={18}/> },
              { id: 'CATEGORIES', label: 'Categorías', icon: <Tag size={18}/> },
              { id: 'LOCATIONS', label: 'Ubicaciones', icon: <MapPin size={18}/> },
          ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as InventoryTab)}
                className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all whitespace-nowrap
                   ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' : 'text-slate-500 hover:bg-white hover:text-slate-700'}`}
              >
                  {tab.icon} {tab.label}
              </button>
          ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
          {(activeTab === 'TELEPHONES' || activeTab === 'STOCK' || activeTab === 'MASTER') && (
            <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                    type="text" 
                    placeholder="Buscar..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    />
                </div>
                
                {activeTab === 'TELEPHONES' && (
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <Filter size={16} className="text-slate-400"/>
                        <select 
                            value={statusFilter} 
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-transparent text-sm font-bold text-slate-700 outline-none"
                        >
                            <option value="ALL">Todos</option>
                            <option value="Disponible">Disponibles</option>
                            <option value="Vendido">Vendidos</option>
                        </select>
                    </div>
                )}

                <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg border border-slate-200 bg-white">
                    <RefreshCw size={20} />
                </button>
            </div>
          )}

          <div className="flex-1 overflow-auto">
              {renderContent()}
          </div>
      </div>

      {/* --- MODAL FORM --- */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`bg-white rounded-3xl w-full ${activeTab === 'TELEPHONES' || activeTab === 'STOCK' ? 'max-w-4xl' : 'max-w-md'} shadow-2xl p-0 overflow-hidden animate-fade-in flex flex-col max-h-[90vh]`}>
             
             {/* Header Modal */}
             <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div>
                    <h3 className="text-2xl font-bold text-slate-800">
                        {isEditing ? 'Editar' : 'Nuevo'} {activeTab === 'TELEPHONES' ? 'Teléfono' : activeTab === 'STOCK' ? 'Inventario' : activeTab === 'MASTER' ? 'Maestro' : activeTab === 'CATEGORIES' ? 'Categoría' : 'Ubicación'}
                    </h3>
                    <p className="text-slate-500 text-sm mt-1">Complete la información requerida</p>
                </div>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-2 hover:bg-slate-100 rounded-full"><X size={24}/></button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
             <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* FORMULARIO TELEFONOS (DISEÑO ANTIGUO) */}
                {activeTab === 'TELEPHONES' && (
                    <div className="space-y-8">
                        {/* 1. Identificadores */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h4 className="text-sm font-bold text-indigo-600 uppercase mb-4 tracking-wider flex items-center gap-2"><Tag size={16}/> Identificadores</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">IMEI 1 (Principal)</label>
                                    <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-mono" value={phoneForm.imei1 || ''} onChange={e => setPhoneForm({...phoneForm, imei1: e.target.value})} placeholder="Escanear o escribir..." />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">IMEI 2 (Opcional)</label>
                                    <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all font-mono" value={phoneForm.imei2 || ''} onChange={e => setPhoneForm({...phoneForm, imei2: e.target.value})} placeholder="Dual SIM" />
                                </div>
                            </div>
                        </div>

                        {/* 2. Detalles del Producto */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h4 className="text-sm font-bold text-indigo-600 uppercase mb-4 tracking-wider flex items-center gap-2"><Smartphone size={16}/> Dispositivo</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Marca</label>
                                    <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" value={phoneForm.marca || ''} onChange={e => setPhoneForm({...phoneForm, marca: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Modelo</label>
                                    <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" value={phoneForm.modelo || ''} onChange={e => setPhoneForm({...phoneForm, modelo: e.target.value})} />
                                </div>
                            </div>
                        </div>

                        {/* 3. Precios y Logística */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h4 className="text-sm font-bold text-indigo-600 uppercase mb-4 tracking-wider flex items-center gap-2"><Layers size={16}/> Finanzas y Logística</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Precio Compra</label>
                                    <input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" value={phoneForm.precioCompra || ''} onChange={e => setPhoneForm({...phoneForm, precioCompra: Number(e.target.value)})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Precio Venta</label>
                                    <input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none font-bold text-emerald-600 text-lg" value={phoneForm.precioVenta || ''} onChange={e => setPhoneForm({...phoneForm, precioVenta: Number(e.target.value)})} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Fecha Compra</label>
                                    <input type="date" required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" value={phoneForm.fecha ? phoneForm.fecha.split('T')[0] : ''} onChange={e => setPhoneForm({...phoneForm, fecha: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Ubicación</label>
                                    <select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" value={phoneForm.idubicacion || ''} onChange={e => setPhoneForm({...phoneForm, idubicacion: e.target.value})}>
                                        <option value="">Seleccionar...</option>
                                        {locations.map(l => (
                                            <option key={l.idUbicacion} value={l.idUbicacion}>
                                                {l.nombre} - Estante: {l.estante} - Nivel: {l.nivel}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Proveedor</label>
                                    <select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" value={phoneForm.codProveedor || ''} onChange={e => setPhoneForm({...phoneForm, codProveedor: e.target.value})}>
                                        <option value="">Seleccionar...</option>
                                        {providers.map(p => <option key={p.codProveedor} value={p.codProveedor}>{p.nombre}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* FORMULARIO STOCK ACCESORIOS (DISEÑO ANTIGUO) */}
                {activeTab === 'STOCK' && (
                    <div className="space-y-8">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h4 className="text-sm font-bold text-indigo-600 uppercase mb-4 tracking-wider flex items-center gap-2"><Box size={16}/> Producto</h4>
                            <div>
                                 <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Accesorio (Maestro)</label>
                                 <select required disabled={isEditing} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none disabled:bg-slate-100" value={stockForm.codAccesorio || ''} onChange={e => setStockForm({...stockForm, codAccesorio: e.target.value})}>
                                    <option value="">Seleccionar Accesorio...</option>
                                    {master.map(m => <option key={m.codAccesorio} value={m.codAccesorio}>{m.descripcion}</option>)}
                                 </select>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h4 className="text-sm font-bold text-indigo-600 uppercase mb-4 tracking-wider flex items-center gap-2"><Layers size={16}/> Detalle Inventario</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Cantidad</label>
                                    <input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none font-bold text-lg" value={stockForm.cantidad || ''} onChange={e => setStockForm({...stockForm, cantidad: Number(e.target.value)})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">P. Compra</label>
                                    <input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" value={stockForm.precioCompra || ''} onChange={e => setStockForm({...stockForm, precioCompra: Number(e.target.value)})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">P. Venta</label>
                                    <input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none font-bold text-emerald-600 text-lg" value={stockForm.precioVenta || ''} onChange={e => setStockForm({...stockForm, precioVenta: Number(e.target.value)})} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Ubicación</label>
                                    <select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" value={stockForm.idubicacion || ''} onChange={e => setStockForm({...stockForm, idubicacion: e.target.value})}>
                                        <option value="">Seleccionar...</option>
                                        {locations.map(l => (
                                            <option key={l.idUbicacion} value={l.idUbicacion}>
                                                {l.nombre} - Estante: {l.estante} - Nivel: {l.nivel}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Proveedor</label>
                                    <select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" value={stockForm.codProveedor || ''} onChange={e => setStockForm({...stockForm, codProveedor: e.target.value})}>
                                        <option value="">Seleccionar...</option>
                                        {providers.map(p => <option key={p.codProveedor} value={p.codProveedor}>{p.nombre}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* FORMULARIO MAESTRO */}
                {activeTab === 'MASTER' && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Descripción</label>
                            <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={masterForm.descripcion || ''} onChange={e => setMasterForm({...masterForm, descripcion: e.target.value})} placeholder="Ej: Cargador Samsung Tipo C" />
                        </div>
                        <div>
                             <label className="text-xs font-bold text-slate-500 uppercase">Categoría</label>
                             <select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={masterForm.codCategoria || ''} onChange={e => setMasterForm({...masterForm, codCategoria: e.target.value})}>
                                <option value="">-- Seleccionar --</option>
                                {categories.map(c => <option key={c.codCategoria} value={c.codCategoria}>{c.tipo}</option>)}
                             </select>
                        </div>
                    </div>
                )}

                {/* FORMULARIO CATEGORIAS */}
                {activeTab === 'CATEGORIES' && (
                     <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Nombre Categoría</label>
                        <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={catForm.tipo || ''} onChange={e => setCatForm({...catForm, tipo: e.target.value})} />
                    </div>
                )}

                {/* FORMULARIO UBICACIONES */}
                {activeTab === 'LOCATIONS' && (
                    <div className="space-y-4">
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
                            <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={locForm.nombre || ''} onChange={e => setLocForm({...locForm, nombre: e.target.value})} placeholder="Ej: Estante A1" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Descripción</label>
                            <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={locForm.descripcion || ''} onChange={e => setLocForm({...locForm, descripcion: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Estante</label>
                                <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={locForm.estante || ''} onChange={e => setLocForm({...locForm, estante: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Nivel</label>
                                <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={locForm.nivel || ''} onChange={e => setLocForm({...locForm, nivel: e.target.value})} />
                            </div>
                        </div>
                    </div>
                )}

                <div className="pt-6 flex gap-4 border-t border-slate-100">
                    <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                    <button type="submit" className="flex-1 px-4 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-colors">{isEditing ? 'Actualizar' : 'Guardar'}</button>
                </div>
             </form>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
