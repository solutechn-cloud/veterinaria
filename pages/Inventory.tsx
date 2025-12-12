
import React, { useState, useEffect } from 'react';
import { InventoryService, LabelService } from '../services/api';
import { 
  Telefono, Inventario, Accesorio, Categoria, Ubicacion, Proveedor, LabelTemplate, LabelElement, EstadoGeneral 
} from '../types';
import { 
  Search, Smartphone, Headphones, Box, MapPin, Tag, PlusCircle, X, RefreshCw, Printer, Edit2, Trash2, Filter
} from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

type InventoryTab = 'TELEPHONES' | 'STOCK' | 'MASTER' | 'CATEGORIES' | 'LOCATIONS';

const Inventory: React.FC = () => {
  const [activeTab, setActiveTab] = useState<InventoryTab>('TELEPHONES');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [phoneStateFilter, setPhoneStateFilter] = useState<string>('Disponible');
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [phones, setPhones] = useState<Telefono[]>([]);
  const [stock, setStock] = useState<Inventario[]>([]);
  const [master, setMaster] = useState<Accesorio[]>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [locations, setLocations] = useState<Ubicacion[]>([]);
  const [providers, setProviders] = useState<Proveedor[]>([]);

  const [phoneForm, setPhoneForm] = useState<Partial<Telefono>>({});
  const [stockForm, setStockForm] = useState<Partial<Inventario>>({});
  const [masterForm, setMasterForm] = useState<Partial<Accesorio>>({});
  const [catForm, setCatForm] = useState<Partial<Categoria>>({});
  const [locForm, setLocForm] = useState<Partial<Ubicacion>>({});

  const [uniqueBrands, setUniqueBrands] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [manualBrandMode, setManualBrandMode] = useState(false);
  const [manualModelMode, setManualModelMode] = useState(false);

  useEffect(() => {
    loadData();
    InventoryService.getCategorias().then(data => setCategories(data || []));
    InventoryService.getUbicaciones().then(data => setLocations(data || []));
    InventoryService.getProveedores().then(data => setProviders(data || []));
    InventoryService.getAccesoriosMaster().then(data => setMaster(data || []));
  }, [activeTab]);

  useEffect(() => {
    if (phones.length > 0) {
      const brands = Array.from(new Set(phones.map(p => p.marca))).sort();
      setUniqueBrands(brands);
    }
  }, [phones]);

  useEffect(() => {
    if (phoneForm.marca && !manualBrandMode) {
      const models = phones.filter(p => p.marca === phoneForm.marca).map(p => p.modelo);
      setAvailableModels(Array.from(new Set(models)).sort());
    } else {
      setAvailableModels([]);
    }
  }, [phoneForm.marca, manualBrandMode, phones]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'TELEPHONES') setPhones((await InventoryService.getTelefonos()) || []);
      else if (activeTab === 'STOCK') setStock((await InventoryService.getStockAccesorios()) || []);
      else if (activeTab === 'MASTER') setMaster((await InventoryService.getAccesoriosMaster()) || []);
      else if (activeTab === 'CATEGORIES') setCategories((await InventoryService.getCategorias()) || []);
      else if (activeTab === 'LOCATIONS') setLocations((await InventoryService.getUbicaciones()) || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // --- LOGICA DE IMPRESIÓN DIRECTA ACTUALIZADA ---
  const printLabel = async (type: 'TELEPHONE' | 'ACCESSORY', data: any) => {
      try {
          // Fetch templates specifically for the category, fallback to General
          const templates = await LabelService.getAll();
          let tpl = templates.find(t => t.isDefault && t.category === (type === 'TELEPHONE' ? 'TELEPHONE' : 'ACCESSORY'));
          if (!tpl) tpl = templates.find(t => t.isDefault && t.category === 'GENERAL');
          
          if (!tpl) {
              return Swal.fire('Sin Plantilla', `No hay plantilla predeterminada para ${type}. Configúrala en el Diseñador.`, 'warning');
          }

          // Build context object explicitly for variable replacement
          let contextData: any = {};
          if (type === 'TELEPHONE') {
              contextData = {
                  telefonos: {
                      ...data,
                      precioVenta: `L. ${Number(data.precioVenta || 0).toFixed(2)}`,
                      fecha: data.fecha ? data.fecha.split('T')[0] : ''
                  }
              };
          } else {
              // For Accessories, we have Inventory data + Accessory Master data
              // The passed 'data' object from table is flat, let's restructure or use it directly
              // Assuming 'data' contains fields from both inventory and accesorios joined
              contextData = {
                  inventario: {
                      ...data,
                      codInventario: data.codInventario || data.codigo,
                      cantidad: data.cantidad,
                      precioVenta: `L. ${Number(data.precioVenta || 0).toFixed(2)}`,
                  },
                  accesorios: {
                      codAccesorio: data.codAccesorio,
                      descripcion: data.descripcion || data.descripcionAccesorio,
                      // Add other fields if available
                  }
              };
          }

          // Generate PDF
          const orientation = tpl.width > tpl.height ? 'l' : 'p';
          const doc = new jsPDF({ orientation, unit: 'mm', format: [tpl.width, tpl.height] });

          // Helper to get value from dot notation string (e.g. "telefonos.marca")
          const getValue = (path: string, obj: any) => {
              return path.split('.').reduce((prev, curr) => prev && prev[curr], obj) || '';
          };

          tpl.elements.forEach(el => {
              // Variable Replacement Logic
              let content = el.content || '';
              
              // Find all {{variables}}
              const matches = content.match(/{{(.*?)}}/g);
              if (matches) {
                  matches.forEach(match => {
                      const key = match.replace(/{{|}}/g, ''); // e.g. "telefonos.marca" or "marca"
                      
                      // Try to find in context
                      let val = getValue(key, contextData);
                      
                      // Fallback: If user used short names without table prefix (e.g. {{marca}})
                      if (!val && !key.includes('.')) {
                          if (type === 'TELEPHONE') val = getValue(`telefonos.${key}`, contextData);
                          else {
                              val = getValue(`inventario.${key}`, contextData);
                              if (!val) val = getValue(`accesorios.${key}`, contextData);
                          }
                      }
                      
                      content = content.replace(match, String(val));
                  });
              }

              if (el.type === 'TEXT') {
                  doc.setFontSize(el.fontSize || 10);
                  doc.setFont(el.fontFamily || 'helvetica', el.fontWeight || 'normal');
                  doc.setTextColor(el.color || '#000000');
                  
                  const options: any = { angle: el.rotation || 0 };
                  if (el.textAlign) options.align = el.textAlign;
                  
                  // Correction for Text Align Pivot in jsPDF
                  let x = el.x;
                  if (el.textAlign === 'center') x += el.width / 2;
                  if (el.textAlign === 'right') x += el.width;

                  doc.text(content, x, el.y + (el.height/2), options);

              } else if (el.type === 'BARCODE') {
                  try {
                      const canvas = document.createElement('canvas');
                      // Ensure content is a clean value for barcode
                      let codeContent = content.trim();
                      if (!codeContent) codeContent = "000000"; // Fallback

                      JsBarcode(canvas, codeContent, {
                          format: (el.barcodeFormat as any) || "CODE128",
                          displayValue: el.displayValue,
                          margin: 0,
                          width: 2, height: 50, fontSize: 20
                      });
                      const imgData = canvas.toDataURL("image/png");
                      doc.addImage(imgData, 'PNG', el.x, el.y, el.width, el.height, undefined, 'FAST', el.rotation);
                  } catch (e) { console.error("Error barcode", e); }
              } else if (el.type === 'SHAPE') {
                  doc.setDrawColor(el.stroke || '#000000');
                  doc.setLineWidth(el.strokeWidth || 0.1);
                  if (el.fill && el.fill !== 'transparent') doc.setFillColor(el.fill);
                  
                  const style = (el.fill && el.fill !== 'transparent') ? 'FD' : 'S';

                  if (el.shapeType === 'CIRCLE') {
                      doc.ellipse(el.x + el.width/2, el.y + el.height/2, el.width/2, el.height/2, style);
                  } else if (el.shapeType === 'LINE') {
                      doc.line(el.x, el.y + el.height/2, el.x + el.width, el.y + el.height/2);
                  } else {
                      doc.rect(el.x, el.y, el.width, el.height, style);
                  }
              }
          });

          doc.save(`etiqueta_${type}_${data.codigo || data.codInventario || Date.now()}.pdf`);

      } catch (err: any) {
          console.error(err);
          Swal.fire('Error', 'Falló la generación del PDF', 'error');
      }
  };

  const openNewModal = () => {
    setIsEditing(false);
    setCurrentId(null);
    setPhoneForm({ fecha: new Date().toISOString().split('T')[0] });
    setStockForm({ fecha: new Date().toISOString().split('T')[0] });
    setMasterForm({});
    setCatForm({});
    setLocForm({});
    setManualBrandMode(false);
    setManualModelMode(false);
    setShowModal(true);
  };

  const openEditModal = (item: any) => {
    setIsEditing(true);
    setCurrentId(item.codigo || item.codInventario || item.codAccesorio || item.codCategoria || item.idUbicacion);
    if (activeTab === 'TELEPHONES') {
      setPhoneForm({ ...item, fecha: item.fecha ? item.fecha.split('T')[0] : '' });
      setManualBrandMode(true); 
      setManualModelMode(true);
    }
    else if (activeTab === 'STOCK') setStockForm({ ...item, fecha: item.fecha ? item.fecha.split('T')[0] : '' });
    else if (activeTab === 'MASTER') setMasterForm({ ...item });
    else if (activeTab === 'CATEGORIES') setCatForm({ ...item });
    else if (activeTab === 'LOCATIONS') setLocForm({ ...item });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    const result = await Swal.fire({ title: '¿Estás seguro?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar' });
    if (result.isConfirmed) {
      try {
        if (activeTab === 'TELEPHONES') await InventoryService.deleteTelefono(id);
        else if (activeTab === 'STOCK') await InventoryService.deleteStock(id);
        else if (activeTab === 'MASTER') await InventoryService.deleteAccesorioMaster(id);
        else if (activeTab === 'CATEGORIES') await InventoryService.deleteCategoria(id);
        else if (activeTab === 'LOCATIONS') await InventoryService.deleteUbicacion(id);
        Swal.fire('Eliminado', 'Registro eliminado.', 'success');
        loadData();
      } catch (error: any) { Swal.fire('Error', error.message, 'error'); }
    }
  };

  const filteredPhones = phones.filter(p => {
      const matchSearch = JSON.stringify(p).toLowerCase().includes(searchTerm.toLowerCase());
      const matchState = phoneStateFilter === 'TODOS' ? true : p.estado === phoneStateFilter;
      return matchSearch && matchState;
  });

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* HEADER & TABS (Same as before) */}
      <div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Gestión de Inventario</h2>
            <p className="text-slate-500 text-sm">Administra teléfonos, accesorios y configuraciones</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button 
                onClick={openNewModal}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-indigo-600/20 transition-all flex-1 justify-center md:flex-initial"
            >
                <PlusCircle size={20} />
                <span>Nuevo</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-t-2xl border-b border-slate-200 px-2 pt-2 flex overflow-x-auto no-scrollbar">
          {[
            { id: 'TELEPHONES', label: 'Teléfonos', icon: <Smartphone size={18}/> },
            { id: 'STOCK', label: 'Stock Accesorios', icon: <Box size={18}/> },
            { id: 'MASTER', label: 'Accesorios', icon: <Headphones size={18}/> },
            { id: 'CATEGORIES', label: 'Categorías', icon: <Tag size={18}/> },
            { id: 'LOCATIONS', label: 'Ubicaciones', icon: <MapPin size={18}/> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as InventoryTab)}
              className={`flex items-center gap-2 px-4 md:px-6 py-4 border-b-2 font-medium text-sm whitespace-nowrap transition-colors flex-shrink-0 ${
                activeTab === tab.id 
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        
        {/* SEARCH BAR & FILTERS (Same as before) */}
        <div className="bg-white border-x border-b border-slate-200 p-3 flex flex-col md:flex-row gap-3 rounded-b-xl mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          
          {activeTab === 'TELEPHONES' && (
              <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1">
                  <Filter size={16} className="text-slate-400"/>
                  <select 
                    value={phoneStateFilter} 
                    onChange={e => setPhoneStateFilter(e.target.value)}
                    className="bg-transparent text-sm border-none focus:ring-0 text-slate-700 font-medium"
                  >
                      <option value="Disponible">Disponibles</option>
                      <option value="Vendido">Vendidos</option>
                      <option value="TODOS">Todos</option>
                  </select>
              </div>
          )}

          <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      {/* CONTENT TABLE */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
        <div className="overflow-x-auto h-full">
          <table className="w-full text-left border-collapse min-w-[800px] md:min-w-full">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                {activeTab === 'TELEPHONES' && (
                  <>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">COD</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">IMEI</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Marca/Modelo</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Precio V.</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Estado</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Acciones</th>
                  </>
                )}
                {activeTab === 'STOCK' && (
                  <>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">COD</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Descripción</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Cant.</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Precio V.</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Ubicación</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Acciones</th>
                  </>
                )}
                 {activeTab === 'MASTER' && (
                  <>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Cod</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Categoría</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Descripción</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Acciones</th>
                  </>
                )}
                 {(activeTab === 'CATEGORIES' || activeTab === 'LOCATIONS') && (
                  <>
                     <th className="p-4 text-xs font-bold text-slate-500 uppercase">ID</th>
                     <th className="p-4 text-xs font-bold text-slate-500 uppercase">Nombre/Tipo</th>
                     <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Acciones</th>
                  </>
                 )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeTab === 'TELEPHONES' && filteredPhones.map(p => (
                <tr key={p.codigo} className="hover:bg-slate-50">
                  <td className="p-4 text-xs font-mono text-slate-500">{p.codigo}</td>
                  <td className="p-4 text-xs font-mono text-slate-600 font-bold">{p.imei1}</td>
                  <td className="p-4 text-sm font-medium text-slate-800">{p.marca} {p.modelo}</td>
                  <td className="p-4 text-sm text-right font-bold text-emerald-600">L. {Number(p.precioVenta).toFixed(2)}</td>
                  <td className="p-4 text-center">
                      <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${p.estado === 'Disponible' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{p.estado}</span>
                  </td>
                  <td className="p-4 text-center flex items-center justify-center gap-2">
                    <button 
                        onClick={() => printLabel('TELEPHONE', p)}
                        className="text-slate-500 hover:text-indigo-600" 
                        title="Imprimir Etiqueta"
                    ><Printer size={16} /></button>
                    <button onClick={() => openEditModal(p)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                    <button onClick={() => handleDelete(p.codigo)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
              
              {activeTab === 'STOCK' && stock.filter(s => JSON.stringify(s).toLowerCase().includes(searchTerm.toLowerCase())).map(s => (
                <tr key={s.codInventario} className="hover:bg-slate-50">
                  <td className="p-4 text-xs font-mono text-slate-500">{s.codInventario}</td>
                  <td className="p-4 text-sm font-medium text-slate-800">
                      <span className="text-xs text-slate-500 uppercase font-bold mr-1">{s.categoriaAccesorio}</span>
                      {s.descripcionAccesorio || s.codAccesorio}
                  </td>
                  <td className="p-4 text-center"><span className={`px-2 py-1 rounded text-xs font-bold ${s.cantidad < 3 ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>{s.cantidad}</span></td>
                  <td className="p-4 text-sm text-right font-bold text-emerald-600">L. {Number(s.precioVenta).toFixed(2)}</td>
                  <td className="p-4 text-xs text-slate-500 truncate max-w-[150px]">{s.nombreUbicacion || s.idubicacion}</td>
                  <td className="p-4 text-center flex items-center justify-center gap-2">
                    <button 
                        onClick={() => printLabel('ACCESSORY', {
                            codigo: s.codInventario,
                            codAccesorio: s.codAccesorio,
                            descripcion: s.descripcionAccesorio,
                            precioVenta: s.precioVenta,
                            categoria: s.categoriaAccesorio,
                            ubicacion: s.nombreUbicacion,
                            cantidad: s.cantidad
                        })}
                        className="text-slate-500 hover:text-indigo-600" 
                        title="Imprimir Etiqueta"
                    ><Printer size={16} /></button>
                    <button onClick={() => openEditModal(s)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                    <button onClick={() => handleDelete(s.codInventario)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}

              {/* ... Rest of tabs (Master, Categories, Locations) ... */}
              {activeTab === 'MASTER' && master.filter(m => JSON.stringify(m).toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                <tr key={m.codAccesorio} className="hover:bg-slate-50">
                  <td className="p-4 text-xs font-mono text-slate-500">{m.codAccesorio}</td>
                  <td className="p-4 text-xs text-slate-500">{m.nombreCategoria || m.codCategoria}</td>
                  <td className="p-4 text-sm font-medium text-slate-800">{m.descripcion}</td>
                  <td className="p-4 text-center flex items-center justify-center gap-2">
                    <button onClick={() => openEditModal(m)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                    <button onClick={() => handleDelete(m.codAccesorio)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
              
              {activeTab === 'CATEGORIES' && categories.map(c => (
                <tr key={c.codCategoria} className="hover:bg-slate-50">
                   <td className="p-4 text-xs font-mono text-slate-500">{c.codCategoria}</td>
                   <td className="p-4 text-sm font-bold text-slate-700">{c.tipo}</td>
                   <td className="p-4 text-center flex items-center justify-center gap-2">
                      <button onClick={() => openEditModal(c)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                      <button onClick={() => handleDelete(c.codCategoria)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                   </td>
                </tr>
              ))}
              
              {activeTab === 'LOCATIONS' && locations.map(l => (
                <tr key={l.idUbicacion} className="hover:bg-slate-50">
                   <td className="p-4 text-xs font-mono text-slate-500">{l.idUbicacion}</td>
                   <td className="p-4 text-sm font-bold text-slate-700">{l.nombre} <span className="text-xs font-normal text-slate-400">({l.estante}-{l.nivel})</span></td>
                   <td className="p-4 text-center flex items-center justify-center gap-2">
                      <button onClick={() => openEditModal(l)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                      <button onClick={() => handleDelete(l.idUbicacion)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                   </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
            {/* Modal Content - Same as previous */}
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-800">
                {isEditing ? 'Editar' : 'Nuevo'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
               {/* ... (Existing form content preserved) ... */}
               {activeTab === 'TELEPHONES' && (
                 <>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-slate-500 uppercase">IMEI 1</label>
                       <input className="w-full p-2.5 border rounded-lg mt-1" value={phoneForm.imei1 || ''} onChange={e => setPhoneForm({...phoneForm, imei1: e.target.value})} required placeholder="Principal"/>
                     </div>
                     <div>
                       <label className="text-xs font-bold text-slate-500 uppercase">IMEI 2 (Opcional)</label>
                       <input className="w-full p-2.5 border rounded-lg mt-1" value={phoneForm.imei2 || ''} onChange={e => setPhoneForm({...phoneForm, imei2: e.target.value})} placeholder="Secundario"/>
                     </div>
                   </div>

                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Marca</label>
                      {!manualBrandMode ? (
                        <select 
                          className="w-full p-2.5 border rounded-lg mt-1 bg-white"
                          value={phoneForm.marca || ''} 
                          onChange={(e) => {
                             if(e.target.value === 'NEW') {
                               setManualBrandMode(true);
                               setPhoneForm({...phoneForm, marca: ''});
                             } else {
                               setPhoneForm({...phoneForm, marca: e.target.value});
                             }
                          }}
                          required
                        >
                          <option value="">Seleccionar Marca...</option>
                          {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
                          <option value="NEW" className="font-bold text-indigo-600">+ NUEVA MARCA...</option>
                        </select>
                      ) : (
                        <div className="flex gap-2">
                           <input autoFocus className="w-full p-2.5 border-2 border-indigo-200 rounded-lg mt-1" placeholder="Escriba la marca..." value={phoneForm.marca || ''} onChange={e => setPhoneForm({...phoneForm, marca: e.target.value})} required />
                           <button type="button" onClick={() => setManualBrandMode(false)} className="mt-1 p-2 bg-slate-100 rounded text-slate-500"><X size={16}/></button>
                        </div>
                      )}
                   </div>

                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Modelo</label>
                      {!manualModelMode ? (
                        <select 
                          className="w-full p-2.5 border rounded-lg mt-1 bg-white disabled:bg-slate-100"
                          value={phoneForm.modelo || ''} 
                          disabled={!phoneForm.marca || manualBrandMode}
                          onChange={(e) => {
                             if(e.target.value === 'NEW') {
                               setManualModelMode(true);
                               setPhoneForm({...phoneForm, modelo: ''});
                             } else {
                               setPhoneForm({...phoneForm, modelo: e.target.value});
                             }
                          }}
                          required
                        >
                          <option value="">Seleccionar Modelo...</option>
                          {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                          <option value="NEW" className="font-bold text-indigo-600">+ NUEVO MODELO...</option>
                        </select>
                      ) : (
                         <div className="flex gap-2">
                           <input autoFocus className="w-full p-2.5 border-2 border-indigo-200 rounded-lg mt-1" placeholder="Escriba el modelo..." value={phoneForm.modelo || ''} onChange={e => setPhoneForm({...phoneForm, modelo: e.target.value})} required />
                           <button type="button" onClick={() => setManualModelMode(false)} className="mt-1 p-2 bg-slate-100 rounded text-slate-500"><X size={16}/></button>
                        </div>
                      )}
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Precio Compra</label>
                        <input type="number" className="w-full p-2.5 border rounded-lg mt-1" value={phoneForm.precioCompra || ''} onChange={e => setPhoneForm({...phoneForm, precioCompra: Number(e.target.value)})} required/>
                      </div>
                      <div>
                         <label className="text-xs font-bold text-slate-500 uppercase">Precio Venta</label>
                         <input type="number" className="w-full p-2.5 border rounded-lg mt-1 font-bold text-emerald-600" value={phoneForm.precioVenta || ''} onChange={e => setPhoneForm({...phoneForm, precioVenta: Number(e.target.value)})} required/>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Fecha Compra</label>
                        <input type="date" className="w-full p-2.5 border rounded-lg mt-1" value={phoneForm.fecha || ''} onChange={e => setPhoneForm({...phoneForm, fecha: e.target.value})} required/>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Ubicación</label>
                        <select className="w-full p-2.5 border rounded-lg mt-1" value={phoneForm.idubicacion || ''} onChange={e => setPhoneForm({...phoneForm, idubicacion: e.target.value})} required>
                            <option value="">Seleccionar...</option>
                            {locations.map(l => (
                                <option key={l.idUbicacion} value={l.idUbicacion}>
                                    {l.nombre} - Estante {l.estante} (Nivel {l.nivel})
                                </option>
                            ))}
                        </select>
                      </div>
                   </div>
                   
                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Proveedor</label>
                      <select className="w-full p-2.5 border rounded-lg mt-1" value={phoneForm.codProveedor || ''} onChange={e => setPhoneForm({...phoneForm, codProveedor: e.target.value})} required>
                          <option value="">Seleccionar...</option>
                          {providers.map(p => <option key={p.codProveedor} value={p.codProveedor}>{p.nombre}</option>)}
                      </select>
                   </div>
                 </>
               )}

               {/* --- FORMULARIO STOCK ACCESORIOS --- */}
               {activeTab === 'STOCK' && (
                 <>
                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Accesorio (Maestro)</label>
                      <select 
                        disabled={isEditing}
                        className="w-full p-2.5 border rounded-lg mt-1 disabled:bg-slate-200" 
                        value={stockForm.codAccesorio || ''} 
                        onChange={e => setStockForm({...stockForm, codAccesorio: e.target.value})} 
                        required
                      >
                          <option value="">Seleccionar Producto Base...</option>
                          {master.map(m => <option key={m.codAccesorio} value={m.codAccesorio}>{m.descripcion}</option>)}
                      </select>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Cantidad</label>
                        <input type="number" className="w-full p-2.5 border rounded-lg mt-1 font-bold" value={stockForm.cantidad || ''} onChange={e => setStockForm({...stockForm, cantidad: Number(e.target.value)})} required/>
                      </div>
                      <div>
                         <label className="text-xs font-bold text-slate-500 uppercase">Ubicación</label>
                         <select className="w-full p-2.5 border rounded-lg mt-1" value={stockForm.idubicacion || ''} onChange={e => setStockForm({...stockForm, idubicacion: e.target.value})} required>
                            <option value="">Seleccionar...</option>
                            {locations.map(l => (
                                <option key={l.idUbicacion} value={l.idUbicacion}>
                                    {l.nombre} - Estante {l.estante} (Nivel {l.nivel})
                                </option>
                            ))}
                        </select>
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Precio Compra</label>
                        <input type="number" className="w-full p-2.5 border rounded-lg mt-1" value={stockForm.precioCompra || ''} onChange={e => setStockForm({...stockForm, precioCompra: Number(e.target.value)})} required/>
                      </div>
                      <div>
                         <label className="text-xs font-bold text-slate-500 uppercase">Precio Venta</label>
                         <input type="number" className="w-full p-2.5 border rounded-lg mt-1 font-bold text-emerald-600" value={stockForm.precioVenta || ''} onChange={e => setStockForm({...stockForm, precioVenta: Number(e.target.value)})} required/>
                      </div>
                   </div>
                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Proveedor</label>
                      <select className="w-full p-2.5 border rounded-lg mt-1" value={stockForm.codProveedor || ''} onChange={e => setStockForm({...stockForm, codProveedor: e.target.value})} required>
                          <option value="">Seleccionar...</option>
                          {providers.map(p => <option key={p.codProveedor} value={p.codProveedor}>{p.nombre}</option>)}
                      </select>
                   </div>
                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
                      <select className="w-full p-2.5 border rounded-lg mt-1" value={stockForm.estado || 'Disponible'} onChange={e => setStockForm({...stockForm, estado: e.target.value as EstadoGeneral})}>
                          <option value="Disponible">Disponible</option>
                          <option value="Inactivo">Inactivo</option>
                      </select>
                   </div>
                 </>
               )}

               {/* --- OTROS FORMULARIOS --- */}
               {activeTab === 'MASTER' && (
                 <>
                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Categoría</label>
                      <select className="w-full p-2.5 border rounded-lg mt-1" value={masterForm.codCategoria || ''} onChange={e => setMasterForm({...masterForm, codCategoria: e.target.value})} required>
                          <option value="">Seleccionar...</option>
                          {categories.map(c => <option key={c.codCategoria} value={c.codCategoria}>{c.tipo}</option>)}
                      </select>
                   </div>
                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Descripción / Nombre Producto</label>
                      <input className="w-full p-2.5 border rounded-lg mt-1" value={masterForm.descripcion || ''} onChange={e => setMasterForm({...masterForm, descripcion: e.target.value})} required placeholder="Ej: Funda Silicona iPhone 13"/>
                   </div>
                 </>
               )}

               {activeTab === 'CATEGORIES' && (
                 <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Nombre Categoría</label>
                    <input className="w-full p-2.5 border rounded-lg mt-1" value={catForm.tipo || ''} onChange={e => setCatForm({...catForm, tipo: e.target.value})} required placeholder="Ej: Fundas, Cargadores..."/>
                 </div>
               )}

               {activeTab === 'LOCATIONS' && (
                 <>
                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Nombre Ubicación</label>
                      <input className="w-full p-2.5 border rounded-lg mt-1" value={locForm.nombre || ''} onChange={e => setLocForm({...locForm, nombre: e.target.value})} required placeholder="Ej: Vitrina Principal"/>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Estante</label>
                        <input className="w-full p-2.5 border rounded-lg mt-1" value={locForm.estante || ''} onChange={e => setLocForm({...locForm, estante: e.target.value})} required placeholder="A1"/>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Nivel</label>
                        <input className="w-full p-2.5 border rounded-lg mt-1" value={locForm.nivel || ''} onChange={e => setLocForm({...locForm, nivel: e.target.value})} required placeholder="1"/>
                      </div>
                   </div>
                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Descripción</label>
                      <input className="w-full p-2.5 border rounded-lg mt-1" value={locForm.descripcion || ''} onChange={e => setLocForm({...locForm, descripcion: e.target.value})} required placeholder="Detalle..."/>
                   </div>
                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
                      <select className="w-full p-2.5 border rounded-lg mt-1" value={locForm.estado || 'Activo'} onChange={e => setLocForm({...locForm, estado: e.target.value as EstadoGeneral})}>
                          <option value="Activo">Activo</option>
                          <option value="Inactivo">Inactivo</option>
                      </select>
                   </div>
                 </>
               )}
               
               <div className="pt-4 flex gap-3">
                 <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 font-bold rounded-xl text-slate-600 hover:bg-slate-200">Cancelar</button>
                 <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg">Guardar</button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
