
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryService, LabelService } from '../services/api';
import { 
  Telefono, 
  Inventario, 
  Accesorio, 
  Categoria, 
  Ubicacion, 
  Proveedor,
  LabelTemplate,
  ProductoUnified
} from '../types';
import { 
  Search, PlusCircle, Package, Smartphone, Layers, MapPin, Tag, Edit2, Trash2, X, RefreshCw, Box, Filter, Printer, Hand, CheckCircle, Clock, AlertTriangle
} from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate } = ReactRouterDOM as any;

type InventoryTab = 'TELEPHONES' | 'STOCK' | 'MASTER' | 'CATEGORIES' | 'LOCATIONS';

const Inventory: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<InventoryTab>('TELEPHONES');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const [phones, setPhones] = useState<Telefono[]>([]);
  const [stock, setStock] = useState<Inventario[]>([]);
  const [master, setMaster] = useState<Accesorio[]>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [locations, setLocations] = useState<Ubicacion[]>([]);
  const [providers, setProviders] = useState<Proveedor[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [phoneForm, setPhoneForm] = useState<Partial<Telefono>>({ estado: 'Disponible' });
  const [stockForm, setStockForm] = useState<Partial<Inventario>>({ estado: 'Activo' });
  const [masterForm, setMasterForm] = useState<Partial<Accesorio>>({});
  const [catForm, setCatForm] = useState<Partial<Categoria>>({});
  const [locForm, setLocForm] = useState<Partial<Ubicacion>>({ estado: 'Activo' });

  // State for Searchable Accessory Input in Modal
  const [showAccessoryDropdown, setShowAccessoryDropdown] = useState(false);
  const [accessorySearchTerm, setAccessorySearchTerm] = useState('');

  useEffect(() => {
    loadData();
    loadDependencies();
  }, [activeTab]);

  const loadDependencies = async () => {
      try {
          const [provs, cats, locs, mst] = await Promise.all([
              InventoryService.getProveedores(),
              InventoryService.getCategorias(),
              InventoryService.getUbicaciones(),
              InventoryService.getAccesoriosMaster()
          ]);
          setProviders(provs || []);
          setCategories(cats || []);
          setLocations(locs || []);
          setMaster(mst || []);
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

  const handleChangePhoneStatus = async (p: Telefono) => {
      const { value: status } = await Swal.fire({
          title: 'Cambiar Estado de Equipo',
          text: `Equipo: ${p.marca} ${p.modelo}`,
          input: 'select',
          inputOptions: {
              'Disponible': 'Disponible',
              'Vendido': 'Vendido',
              'Defectuoso': 'Dañado / Defectuoso',
              'Garantia': 'En Garantía'
          },
          inputValue: p.estado,
          showCancelButton: true,
          confirmButtonColor: '#4f46e5'
      });

      if (status) {
          try {
              await InventoryService.updateTelefonoStatus(p.codigo, status);
              loadData();
              Swal.fire({ icon: 'success', title: 'Estado Actualizado', timer: 1000, showConfirmButton: false });
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const filteredMasterInModal = useMemo(() => {
    return master.filter(m => 
        m.descripcion.toLowerCase().includes(accessorySearchTerm.toLowerCase()) ||
        m.codAccesorio.toLowerCase().includes(accessorySearchTerm.toLowerCase())
    ).slice(0, 10); // Limit results for performance
  }, [master, accessorySearchTerm]);

  const handlePrintLabel = async (item: any, type: 'TELEFONO' | 'STOCK') => {
      try {
          const category = type === 'TELEFONO' ? 'TELEPHONE' : 'ACCESSORY';
          const template = await LabelService.getDefault(category);
          if (!template) return Swal.fire('Sin Plantilla', `No hay una etiqueta predeterminada para ${category}.`, 'warning');
          
          let dataContext: any = {};
          if (type === 'TELEFONO') {
              dataContext = { telefonos: { ...item, ubicacion: { nombre: item.nombreUbicacion, id: item.idubicacion }, proveedores: { id: item.codProveedor } } };
          } else {
              dataContext = { inventario: { ...item, accesorios: { codAccesorio: item.codAccesorio, descripcion: item.descripcionAccesorio, categoria: { tipo: item.categoriaAccesorio } }, ubicacion: { nombre: item.nombreUbicacion, id: item.idubicacion }, proveedores: { id: item.codProveedor } } };
          }
          
          const scratchDoc = new jsPDF(); 
          let totalShiftY = 0;
          const sortedElements = [...template.elements].sort((a, b) => (a.y || 0) - (b.y || 0));
          
          const layoutElements = sortedElements.map(el => {
              const elY = el.y || 0; const elH = el.height || 0; const elW = el.width || 0; const elX = el.x || 0;
              let finalY = elY + totalShiftY; let finalHeight = elH; let finalContent = el.content;
              if (el.type === 'TEXT') {
                  finalContent = el.content.replace(/{{([\w.]+)}}/g, (match: string, path: string) => {
                      const keys = path.split('.');
                      let current = dataContext;
                      for (const key of keys) {
                          if (current === null || typeof current !== 'object') return '';
                          const foundKey = Object.keys(current).find(k => k.toLowerCase() === key.toLowerCase());
                          if (foundKey) { current = current[foundKey]; } else { return ''; }
                      }
                      return String(current || '');
                  });
              }
              return { ...el, y: finalY, height: finalHeight, width: elW, x: elX, computedContent: finalContent };
          });

          const baseW = template.width || 50; const baseH = template.height || 25;
          const doc = new jsPDF({ orientation: baseW > baseH ? 'landscape' : 'portrait', unit: 'mm', format: [baseW, baseH] });
          
          for (const el of layoutElements) {
              if (el.type === 'TEXT') {
                  doc.setFontSize(el.fontSize || 10);
                  doc.text(String(el.computedContent || ''), el.x, el.y, { baseline: 'top' });
              } else if (el.type === 'BARCODE') {
                  const canvas = document.createElement('canvas');
                  JsBarcode(canvas, String(el.computedContent || '12345'), { format: "CODE128", displayValue: false });
                  doc.addImage(canvas.toDataURL("image/png"), 'PNG', el.x, el.y, el.width, el.height);
              }
          }
          doc.save(`Label_${type}.pdf`);
      } catch (error) { console.error(error); Swal.fire('Error', 'No se pudo generar la etiqueta.', 'error'); }
  };

  const openModal = (item?: any) => {
      setIsEditing(!!item);
      setCurrentId(item ? (item.codigo || item.codInventario || item.codAccesorio || item.codCategoria || item.idUbicacion) : null);
      setAccessorySearchTerm('');
      setShowAccessoryDropdown(false);

      if (activeTab === 'TELEPHONES') setPhoneForm(item || { estado: 'Disponible', fecha: new Date().toISOString().split('T')[0] });
      else if (activeTab === 'STOCK') {
          setStockForm(item || { estado: 'Activo', fecha: new Date().toISOString().split('T')[0] });
          if(item) setAccessorySearchTerm(item.descripcionAccesorio || '');
      }
      else if (activeTab === 'MASTER') setMasterForm(item || {});
      else if (activeTab === 'CATEGORIES') setCatForm(item || {});
      else if (activeTab === 'LOCATIONS') setLocForm(item || { estado: 'Activo' });
      setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === 'TELEPHONES') { if(isEditing) await InventoryService.updateTelefono(currentId!, phoneForm); else await InventoryService.createTelefono(phoneForm); } 
      else if (activeTab === 'STOCK') { if(isEditing) await InventoryService.updateStock(currentId!, stockForm); else await InventoryService.createStock(stockForm); } 
      else if (activeTab === 'MASTER') { if(isEditing) await InventoryService.updateAccesorioMaster(currentId!, masterForm); else await InventoryService.createAccesorioMaster(masterForm); } 
      else if (activeTab === 'CATEGORIES') { if(isEditing) await InventoryService.updateCategoria(currentId!, catForm); else await InventoryService.createCategoria(catForm); } 
      else if (activeTab === 'LOCATIONS') { if(isEditing) await InventoryService.updateUbicacion(currentId!, locForm); else await InventoryService.createUbicacion(locForm); }
      setShowModal(false); Swal.fire({ title: 'Éxito', icon: 'success', timer: 1500, showConfirmButton: false }); loadData();
    } catch (error: any) { Swal.fire('Error', error.message, 'error'); }
  };

  const handleDelete = async (id: string) => {
      const result = await Swal.fire({ title: '¿Eliminar registro?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar' });
      if (result.isConfirmed) {
          try {
            if (activeTab === 'TELEPHONES') await InventoryService.deleteTelefono(id); else if (activeTab === 'STOCK') await InventoryService.deleteStock(id); else if (activeTab === 'MASTER') await InventoryService.deleteAccesorioMaster(id); else if (activeTab === 'CATEGORIES') await InventoryService.deleteCategoria(id); else if (activeTab === 'LOCATIONS') await InventoryService.deleteUbicacion(id);
            Swal.fire('Eliminado', '', 'success'); loadData();
          } catch (error: any) { Swal.fire('Error', error.message, 'error'); }
      }
  };

  const renderContent = () => {
      if (loading) return <div className="p-8 text-center text-slate-500"><RefreshCw className="animate-spin inline mr-2"/>Cargando datos...</div>;
      
      if (activeTab === 'TELEPHONES') {
          const filtered = phones.filter(p => {
              const term = searchTerm.toLowerCase();
              const matchesSearch = p.marca.toLowerCase().includes(term) || p.modelo.toLowerCase().includes(term) || p.imei1.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term);
              const matchesStatus = statusFilter === 'ALL' || p.estado === statusFilter;
              return matchesSearch && matchesStatus;
          });
          return (
              <table className="w-full text-left">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0"><tr><th className="p-3">Código</th><th className="p-3">Marca/Modelo</th><th className="p-3">IMEI</th><th className="p-3">Precio Venta</th><th className="p-3">Estado</th><th className="p-3 text-right">Acciones</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{filtered.map(p => (
                      <tr key={p.codigo} className="hover:bg-slate-50 text-sm">
                          <td className="p-3 font-mono text-slate-500">{p.codigo}</td><td className="p-3 font-bold text-slate-700">{p.marca} {p.modelo}</td><td className="p-3 font-mono">{p.imei1}</td><td className="p-3 font-bold text-emerald-600">L. {Number(p.precioVenta).toFixed(2)}</td>
                          <td className="p-3">
                              <button onClick={() => handleChangePhoneStatus(p)} className={`px-2 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 transition-transform active:scale-95 ${p.estado === 'Disponible' ? 'bg-green-100 text-green-700' : p.estado === 'Vendido' ? 'bg-indigo-100 text-indigo-700' : p.estado === 'Defectuoso' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {p.estado === 'Disponible' ? <CheckCircle size={10}/> : p.estado === 'Vendido' ? <Package size={10}/> : p.estado === 'Defectuoso' ? <AlertTriangle size={10}/> : <Clock size={10}/>}
                                  {p.estado}
                              </button>
                          </td>
                          <td className="p-3 text-right flex justify-end gap-1">
                              <button onClick={() => handlePrintLabel(p, 'TELEFONO')} className="text-slate-400 hover:text-slate-600 p-1.5 rounded" title="Imprimir"><Printer size={16}/></button>
                              <button onClick={() => openModal(p)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                              <button onClick={() => handleDelete(p.codigo)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                          </td>
                      </tr>))}
                  </tbody>
              </table>
          );
      }
      if (activeTab === 'STOCK') {
        const filtered = stock.filter(s => { 
            const term = searchTerm.toLowerCase(); 
            const matchesSearch = s.descripcionAccesorio?.toLowerCase().includes(term) || s.codInventario.toLowerCase().includes(term) || s.categoriaAccesorio?.toLowerCase().includes(term);
            const matchesCat = categoryFilter === 'ALL' || s.categoriaAccesorio === categoryFilter;
            return matchesSearch && matchesCat;
        });
        return (
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0"><tr><th className="p-3">SKU</th><th className="p-3">Descripción</th><th className="p-3">Categoría</th><th className="p-3 text-center">Cant.</th><th className="p-3 text-right">P. Venta</th><th className="p-3 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{filtered.map(s => (
                    <tr key={s.codInventario} className="hover:bg-slate-50 text-sm">
                        <td className="p-3 font-mono text-slate-500 text-xs">{s.codInventario}</td><td className="p-3 font-bold text-slate-700">{s.descripcionAccesorio}</td><td className="p-3 text-[10px] font-black uppercase text-slate-400">{s.categoriaAccesorio}</td>
                        <td className="p-3 text-center"><span className={`px-2 py-1 rounded-md font-bold text-xs ${s.cantidad > 5 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{s.cantidad}</span></td>
                        <td className="p-3 text-right font-bold text-indigo-600">L. {Number(s.precioVenta).toFixed(2)}</td>
                        <td className="p-3 text-right flex justify-end gap-1">
                            <button onClick={() => handlePrintLabel(s, 'STOCK')} className="text-slate-400 hover:text-slate-600 p-1.5 rounded"><Printer size={16}/></button>
                            <button onClick={() => openModal(s)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                            <button onClick={() => handleDelete(s.codInventario)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                        </td>
                    </tr>))}
                </tbody>
            </table>
        );
      }
      if (activeTab === 'MASTER') {
          return (
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0"><tr><th className="p-3">ID</th><th className="p-3">Descripción</th><th className="p-3">Categoría</th><th className="p-3 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{master.filter(m => m.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) || m.codAccesorio.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                    <tr key={m.codAccesorio} className="hover:bg-slate-50 text-sm">
                        <td className="p-3 font-mono text-slate-500 text-xs">{m.codAccesorio}</td><td className="p-3 font-bold text-slate-700">{m.descripcion}</td><td className="p-3 text-xs">{m.nombreCategoria || m.codCategoria}</td>
                        <td className="p-3 text-right"><button onClick={() => openModal(m)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded mr-1"><Edit2 size={16}/></button><button onClick={() => handleDelete(m.codAccesorio)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button></td>
                    </tr>))}
                </tbody>
            </table>
          );
      }
      if (activeTab === 'CATEGORIES') {
          return (
             <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                 {categories.map(c => (
                     <div key={c.codCategoria} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
                         <div><p className="font-bold text-slate-700">{c.tipo}</p><p className="text-xs text-slate-400 font-mono">{c.codCategoria}</p></div>
                         <div className="flex gap-1"><button onClick={() => openModal(c)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button><button onClick={() => handleDelete(c.codCategoria)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button></div>
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
                             <div className="flex justify-between items-start"><div><h4 className="font-bold text-slate-800">{l.nombre}</h4><p className="text-xs text-slate-500">{l.descripcion}</p></div><div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => openModal(l)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button><button onClick={() => handleDelete(l.idUbicacion)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button></div></div>
                             <div className="mt-3 flex gap-2 text-xs"><span className="bg-slate-100 px-2 py-1 rounded text-slate-600 font-mono">Estante: {l.estante}</span><span className="bg-slate-100 px-2 py-1 rounded text-slate-600 font-mono">Nivel: {l.nivel}</span></div>
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
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Package className="text-indigo-600"/> Gestión de Inventario</h2>
            <p className="text-slate-500 text-sm">Control de teléfonos, accesorios y configuraciones.</p>
          </div>
          <button onClick={() => openModal()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-indigo-600/20 transition-all"><PlusCircle size={20}/><span>Nuevo Registro</span></button>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {[{ id: 'TELEPHONES', label: 'Teléfonos', icon: <Smartphone size={18}/> }, { id: 'STOCK', label: 'Stock Accesorios', icon: <Box size={18}/> }, { id: 'MASTER', label: 'Accesorios', icon: <Layers size={18}/> }, { id: 'CATEGORIES', label: 'Categorías', icon: <Tag size={18}/> }, { id: 'LOCATIONS', label: 'Ubicaciones', icon: <MapPin size={18}/> }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as InventoryTab)} className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' : 'text-slate-500 hover:bg-white hover:text-slate-700'}`}>{tab.icon} {tab.label}</button>
          ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
          {(activeTab === 'TELEPHONES' || activeTab === 'STOCK' || activeTab === 'MASTER') && (
            <div className="p-4 border-b border-slate-100 flex flex-wrap gap-4 bg-slate-50/50">
                <div className="relative flex-1 min-w-[250px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="Búsqueda rápida..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none" /></div>
                {activeTab === 'TELEPHONES' && (
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2"><Filter size={16} className="text-slate-400"/><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none"><option value="ALL">Todos los Estados</option><option value="Disponible">Disponible</option><option value="Vendido">Vendido</option><option value="Defectuoso">Dañado</option><option value="Garantia">Garantía</option></select></div>
                )}
                {activeTab === 'STOCK' && (
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2"><Filter size={16} className="text-slate-400"/><select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none"><option value="ALL">Todas las Categorías</option>{categories.map(c => <option key={c.codCategoria} value={c.tipo}>{c.tipo}</option>)}</select></div>
                )}
                <button onClick={loadData} className="p-2 text-slate-500 hover:bg-white rounded-xl border border-slate-200 bg-white transition-all shadow-sm"><RefreshCw size={20} className={loading ? "animate-spin" : ""} /></button>
            </div>
          )}
          <div className="flex-1 overflow-auto custom-scrollbar">{renderContent()}</div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`bg-white rounded-3xl w-full ${activeTab === 'TELEPHONES' || activeTab === 'STOCK' ? 'max-w-4xl' : 'max-w-md'} shadow-2xl p-0 overflow-hidden animate-fade-in flex flex-col max-h-[95vh]`}>
             <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10"><div><h3 className="text-2xl font-bold text-slate-800">{isEditing ? 'Editar' : 'Nuevo'} {activeTab === 'TELEPHONES' ? 'Teléfono' : activeTab === 'STOCK' ? 'Inventario' : activeTab === 'MASTER' ? 'Accesorio' : activeTab === 'CATEGORIES' ? 'Categoría' : 'Ubicación'}</h3><p className="text-slate-500 text-sm mt-1">Complete la información del registro</p></div><button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-2 hover:bg-slate-100 rounded-full"><X size={24}/></button></div>
             <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 custom-scrollbar">
               <form onSubmit={handleSubmit} className="space-y-6">
                {activeTab === 'TELEPHONES' && (
                    <div className="space-y-6"><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><h4 className="text-xs font-black text-indigo-600 uppercase mb-4 tracking-widest flex items-center gap-2"><Tag size={16}/> Identificadores Únicos</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 block ml-1">IMEI 1 (Principal)</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm" value={phoneForm.imei1 || ''} onChange={e => setPhoneForm({...phoneForm, imei1: e.target.value})} placeholder="0000..." /></div><div><label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 block ml-1">IMEI 2 (Opcional)</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm" value={phoneForm.imei2 || ''} onChange={e => setPhoneForm({...phoneForm, imei2: e.target.value})} /></div></div></div><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><h4 className="text-xs font-black text-indigo-600 uppercase mb-4 tracking-widest flex items-center gap-2"><Smartphone size={16}/> Dispositivo y Precios</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 block ml-1">Marca</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={phoneForm.marca || ''} onChange={e => setPhoneForm({...phoneForm, marca: e.target.value})} /></div><div><label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 block ml-1">Modelo</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" value={phoneForm.modelo || ''} onChange={e => setPhoneForm({...phoneForm, modelo: e.target.value})} /></div><div><label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 block ml-1">P. Compra</label><input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={phoneForm.precioCompra || ''} onChange={e => setPhoneForm({...phoneForm, precioCompra: Number(e.target.value)})} /></div><div><label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 block ml-1">P. Venta</label><input required type="number" className="w-full p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm font-black text-emerald-700" value={phoneForm.precioVenta || ''} onChange={e => setPhoneForm({...phoneForm, precioVenta: Number(e.target.value)})} /></div></div></div></div>
                )}
                
                {activeTab === 'STOCK' && (
                    <div className="space-y-6">
                        {/* SEARCHABLE ACCESSORY SELECTOR */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative">
                            <h4 className="text-xs font-black text-indigo-600 uppercase mb-4 tracking-widest flex items-center gap-2"><Layers size={16}/> Selección de Accesorio</h4>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                                <input 
                                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" 
                                    placeholder="Escriba descripción o código del accesorio maestro..."
                                    value={accessorySearchTerm}
                                    onChange={(e) => {
                                        setAccessorySearchTerm(e.target.value);
                                        setShowAccessoryDropdown(true);
                                    }}
                                    onFocus={() => setShowAccessoryDropdown(true)}
                                />
                                {showAccessoryDropdown && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 max-h-60 overflow-y-auto">
                                        {filteredMasterInModal.length === 0 ? (
                                            <div className="p-4 text-center text-slate-400 text-xs italic">No se encontraron resultados...</div>
                                        ) : filteredMasterInModal.map(m => (
                                            <button key={m.codAccesorio} type="button" onClick={() => {
                                                setStockForm({...stockForm, codAccesorio: m.codAccesorio});
                                                setAccessorySearchTerm(m.descripcion);
                                                setShowAccessoryDropdown(false);
                                            }} className="w-full p-4 hover:bg-indigo-50 border-b border-slate-50 last:border-0 text-left flex justify-between items-center group transition-colors">
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-slate-800">{m.descripcion}</p>
                                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{m.codAccesorio}</p>
                                                </div>
                                                <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-black text-slate-500 uppercase">{m.nombreCategoria}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h4 className="text-xs font-black text-indigo-600 uppercase mb-4 tracking-widest flex items-center gap-2"><Box size={16}/> Detalles de Inventario</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                <div><label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 block">Cantidad</label><input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg" value={stockForm.cantidad || ''} onChange={e => setStockForm({...stockForm, cantidad: Number(e.target.value)})} /></div>
                                <div><label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 block">P. Compra</label><input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" value={stockForm.precioCompra || ''} onChange={e => setStockForm({...stockForm, precioCompra: Number(e.target.value)})} /></div>
                                <div><label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 block">P. Venta</label><input required type="number" className="w-full p-3 bg-emerald-50 border border-emerald-100 rounded-xl font-black text-emerald-700 text-lg" value={stockForm.precioVenta || ''} onChange={e => setStockForm({...stockForm, precioVenta: Number(e.target.value)})} /></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div><label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 block">Ubicación</label><select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={stockForm.idubicacion || ''} onChange={e => setStockForm({...stockForm, idubicacion: e.target.value})}><option value="">Seleccionar...</option>{locations.map(l => (<option key={l.idUbicacion} value={l.idUbicacion}>{l.nombre}</option>))}</select></div>
                                <div><label className="text-[10px] font-black text-slate-500 uppercase mb-1.5 block">Proveedor</label><select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" value={stockForm.codProveedor || ''} onChange={e => setStockForm({...stockForm, codProveedor: e.target.value})}><option value="">Seleccionar...</option>{providers.map(p => <option key={p.codProveedor} value={p.codProveedor}>{p.nombre}</option>)}</select></div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'MASTER' && (
                    <div className="space-y-4"><div><label className="text-xs font-bold text-slate-500 uppercase">Descripción del Accesorio</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={masterForm.descripcion || ''} onChange={e => setMasterForm({...masterForm, descripcion: e.target.value})} placeholder="Ej: Funda..." /></div><div><label className="text-xs font-bold text-slate-500 uppercase">Categoría</label><select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={masterForm.codCategoria || ''} onChange={e => setMasterForm({...masterForm, codCategoria: e.target.value})}><option value="">-- Seleccionar --</option>{categories.map(c => <option key={c.codCategoria} value={c.codCategoria}>{c.tipo}</option>)}</select></div></div>
                )}
                {activeTab === 'CATEGORIES' && (
                     <div><label className="text-xs font-bold text-slate-500 uppercase">Nombre Categoría</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={catForm.tipo || ''} onChange={e => setCatForm({...catForm, tipo: e.target.value})} /></div>
                )}
                {activeTab === 'LOCATIONS' && (
                    <div className="space-y-4"><div><label className="text-xs font-bold text-slate-500 uppercase">Nombre</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={locForm.nombre || ''} onChange={e => setLocForm({...locForm, nombre: e.target.value})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase">Descripción</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={locForm.descripcion || ''} onChange={e => setLocForm({...locForm, descripcion: e.target.value})} /></div><div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 uppercase">Estante</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={locForm.estante || ''} onChange={e => setLocForm({...locForm, estante: e.target.value})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase">Nivel</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={locForm.nivel || ''} onChange={e => setLocForm({...locForm, nivel: e.target.value})} /></div></div></div>
                )}
                
                <div className="pt-6 flex gap-4 border-t border-slate-100 bg-white sticky bottom-0"><button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest">Cancelar</button><button type="submit" className="flex-1 px-4 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 transition-all uppercase text-xs tracking-widest">{isEditing ? 'Actualizar' : 'Guardar'}</button></div>
             </form></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
