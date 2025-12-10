import React, { useState, useEffect } from 'react';
import { InventoryService } from '../services/api';
import { 
  Telefono, 
  InventarioAccesorio, 
  AccesorioMaster, 
  Categoria, 
  Ubicacion,
  Proveedor 
} from '../types';
import { 
  Search, Plus, Smartphone, Headphones, Box, MapPin, 
  Tag, List, PlusCircle, X, RefreshCw, Printer
} from 'lucide-react';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

type InventoryTab = 'TELEPHONES' | 'STOCK' | 'MASTER' | 'CATEGORIES' | 'LOCATIONS';

const Inventory: React.FC = () => {
  const [activeTab, setActiveTab] = useState<InventoryTab>('TELEPHONES');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Data Stores
  const [phones, setPhones] = useState<Telefono[]>([]);
  const [stock, setStock] = useState<InventarioAccesorio[]>([]);
  const [master, setMaster] = useState<AccesorioMaster[]>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [locations, setLocations] = useState<Ubicacion[]>([]);
  const [providers, setProviders] = useState<Proveedor[]>([]);

  // Forms
  const [phoneForm, setPhoneForm] = useState<Partial<Telefono>>({});
  const [stockForm, setStockForm] = useState<Partial<InventarioAccesorio>>({});
  const [masterForm, setMasterForm] = useState<Partial<AccesorioMaster>>({});
  const [catForm, setCatForm] = useState<Partial<Categoria>>({});
  const [locForm, setLocForm] = useState<Partial<Ubicacion>>({});

  useEffect(() => {
    loadData();
    // Load auxiliaries once
    InventoryService.getCategorias().then(setCategories);
    InventoryService.getUbicaciones().then(setLocations);
    InventoryService.getProveedores().then(setProviders);
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'TELEPHONES') {
        const data = await InventoryService.getTelefonos();
        setPhones(data);
      } else if (activeTab === 'STOCK') {
        const data = await InventoryService.getStockAccesorios();
        setStock(data);
      } else if (activeTab === 'MASTER') {
        const data = await InventoryService.getAccesoriosMaster();
        setMaster(data);
      } else if (activeTab === 'CATEGORIES') {
        const data = await InventoryService.getCategorias();
        setCategories(data);
      } else if (activeTab === 'LOCATIONS') {
        const data = await InventoryService.getUbicaciones();
        setLocations(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === 'TELEPHONES') {
        await InventoryService.createTelefono(phoneForm);
      } else if (activeTab === 'STOCK') {
        await InventoryService.createStock(stockForm);
      } else if (activeTab === 'MASTER') {
        await InventoryService.createAccesorioMaster(masterForm);
      } else if (activeTab === 'CATEGORIES') {
        await InventoryService.createCategoria(catForm);
      } else if (activeTab === 'LOCATIONS') {
        await InventoryService.createUbicacion(locForm);
      }
      setShowModal(false);
      Swal.fire('Guardado', 'Registro creado exitosamente', 'success');
      loadData();
    } catch (error: any) {
      Swal.fire('Error', error.message, 'error');
    }
  };

  const openNewModal = () => {
    setPhoneForm({});
    setStockForm({});
    setMasterForm({});
    setCatForm({});
    setLocForm({});
    setShowModal(true);
  };

  // --- BARCODE GENERATION LOGIC ---
  const handlePrintBarcode = (code: string, description: string) => {
    try {
      // 1. Setup PDF (25mm x 40mm)
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: [25, 40] // Width 25mm, Height 40mm (Tall & Narrow)
      });

      // 2. Create Barcode Image using Canvas
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, code, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        textMargin: 0,
        margin: 0,
        width: 2,
        height: 50
      });
      const barcodeImg = canvas.toDataURL("image/png");

      // 3. Add Content to PDF
      // Standard vertical layout: Text Top, Barcode Bottom.
      // Text
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      
      // Split text to fit width (approx 20mm usable)
      const splitTitle = doc.splitTextToSize(description.substring(0, 30), 22);
      doc.text(splitTitle, 12.5, 5, { align: "center" });

      // Barcode Image
      doc.addImage(barcodeImg, 'PNG', 1, 10, 23, 25); // x, y, w, h

      // 4. Save
      doc.save(`barcode_${code}.pdf`);

    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo generar el código de barras', 'error');
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* HEADER & TABS */}
      <div>
        <div className="flex flex-col md:flex-row justify-between items-end mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Gestión de Inventario</h2>
            <p className="text-slate-500 text-sm">Administra teléfonos, accesorios y configuraciones</p>
          </div>
          <button 
             onClick={openNewModal}
             className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-indigo-600/20 transition-all"
          >
            <PlusCircle size={20} />
            <span>Nuevo {activeTab === 'TELEPHONES' ? 'Teléfono' : activeTab === 'STOCK' ? 'Accesorio' : 'Registro'}</span>
          </button>
        </div>

        <div className="bg-white rounded-t-2xl border-b border-slate-200 px-2 pt-2 flex overflow-x-auto">
          {[
            { id: 'TELEPHONES', label: 'Inventario Teléfonos', icon: <Smartphone size={18}/> },
            { id: 'STOCK', label: 'Inventario Accesorios', icon: <Box size={18}/> },
            { id: 'MASTER', label: 'Registrar Accesorio', icon: <Headphones size={18}/> },
            { id: 'CATEGORIES', label: 'Categorías', icon: <Tag size={18}/> },
            { id: 'LOCATIONS', label: 'Ubicaciones', icon: <MapPin size={18}/> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as InventoryTab)}
              className={`flex items-center gap-2 px-6 py-4 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === tab.id 
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        
        {/* SEARCH BAR */}
        <div className="bg-white border-x border-slate-200 p-3 flex gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      {/* CONTENT TABLE */}
      <div className="flex-1 bg-white rounded-b-2xl shadow-sm border border-slate-200 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
            <div className="text-indigo-600 font-bold animate-pulse">Cargando datos...</div>
          </div>
        )}
        
        <div className="overflow-x-auto h-full">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-0">
              <tr>
                {/* DYNAMIC HEADERS */}
                {activeTab === 'TELEPHONES' && (
                  <>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">COD</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">IMEI</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Marca/Modelo</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Precio C.</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Precio V.</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Ubicación</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Fecha</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Imprimir</th>
                  </>
                )}
                {activeTab === 'STOCK' && (
                  <>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">COD</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Descripción</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Categoría</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Cant.</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Precio C.</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Precio V.</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Ubicación</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-center">Imprimir</th>
                  </>
                )}
                {activeTab === 'MASTER' && (
                  <>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Cod Accesorio</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Categoría</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Descripción</th>
                  </>
                )}
                {activeTab === 'CATEGORIES' && (
                  <>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Cod Categoría</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Tipo</th>
                  </>
                )}
                {activeTab === 'LOCATIONS' && (
                  <>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Cod</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Nombre</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Descripción</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Estante</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Nivel</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* PHONES ROW */}
              {activeTab === 'TELEPHONES' && phones.filter(p => JSON.stringify(p).toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
                <tr key={p.codigo} className="hover:bg-slate-50">
                  <td className="p-4 text-xs font-mono text-slate-500">{p.codigo}</td>
                  <td className="p-4 text-xs font-mono text-slate-600 font-bold">{p.imei1}</td>
                  <td className="p-4 text-sm font-medium text-slate-800">{p.marca} {p.modelo}</td>
                  <td className="p-4 text-sm text-right text-slate-500">L. {p.precioCompra}</td>
                  <td className="p-4 text-sm text-right font-bold text-emerald-600">L. {p.precioVenta}</td>
                  <td className="p-4 text-xs text-slate-500">
                    {p.nombreUbicacion ? (
                      <div className="flex flex-col">
                        <span className="font-bold">{p.nombreUbicacion}</span>
                        {/* If backend returns estante/nivel for phones join query */}
                        <span className="text-[10px] text-slate-400">Est: {(p as any).estante} - Nvl: {(p as any).nivel}</span>
                      </div>
                    ) : (p.idubicacion)}
                  </td>
                  <td className="p-4 text-xs text-slate-400">{new Date(p.fecha).toLocaleDateString()}</td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => handlePrintBarcode(p.codigo, `${p.marca} ${p.modelo}`)}
                      className="text-slate-500 hover:text-indigo-600 transition-colors"
                      title="Imprimir Código de Barras"
                    >
                      <Printer size={18} />
                    </button>
                  </td>
                </tr>
              ))}

              {/* STOCK ROW */}
              {activeTab === 'STOCK' && stock.filter(s => JSON.stringify(s).toLowerCase().includes(searchTerm.toLowerCase())).map(s => (
                <tr key={s.codInventario} className="hover:bg-slate-50">
                  <td className="p-4 text-xs font-mono text-slate-500">{s.codInventario}</td>
                  <td className="p-4 text-sm font-medium text-slate-800">{s.descripcion}</td>
                  <td className="p-4 text-xs text-slate-500">{s.categoria}</td>
                  <td className="p-4 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${s.cantidad === 0 ? 'bg-red-100 text-red-600' : s.cantidad < 3 ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                      {s.cantidad}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-right text-slate-500">L. {s.precioCompra}</td>
                  <td className="p-4 text-sm text-right font-bold text-emerald-600">L. {s.precioVenta}</td>
                  <td className="p-4 text-xs text-slate-500">
                     {s.nombreUbicacion ? (
                      <div className="flex flex-col">
                        <span className="font-bold">{s.nombreUbicacion}</span>
                        <span className="text-[10px] text-slate-400">Est: {(s as any).estante} - Nvl: {(s as any).nivel}</span>
                      </div>
                    ) : (s.idubicacion)}
                  </td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => handlePrintBarcode(s.codInventario, s.descripcion || 'Accesorio')}
                      className="text-slate-500 hover:text-indigo-600 transition-colors"
                      title="Imprimir Código de Barras"
                    >
                      <Printer size={18} />
                    </button>
                  </td>
                </tr>
              ))}

              {/* MASTER ROW */}
              {activeTab === 'MASTER' && master.filter(m => JSON.stringify(m).toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                <tr key={m.codAccesorio} className="hover:bg-slate-50">
                  <td className="p-4 text-xs font-mono text-slate-500">{m.codAccesorio}</td>
                  <td className="p-4 text-xs text-slate-500">{m.nombreCategoria}</td>
                  <td className="p-4 text-sm font-medium text-slate-800">{m.descripcion}</td>
                </tr>
              ))}

              {/* CATEGORIES ROW */}
              {activeTab === 'CATEGORIES' && categories.filter(c => c.tipo.toLowerCase().includes(searchTerm.toLowerCase())).map(c => (
                <tr key={c.codCategoria} className="hover:bg-slate-50">
                  <td className="p-4 text-xs font-mono text-slate-500">{c.codCategoria}</td>
                  <td className="p-4 text-sm font-bold text-slate-700">{c.tipo}</td>
                </tr>
              ))}

              {/* LOCATIONS ROW */}
              {activeTab === 'LOCATIONS' && locations.filter(l => l.nombre.toLowerCase().includes(searchTerm.toLowerCase())).map(l => (
                <tr key={l.idUbicacion} className="hover:bg-slate-50">
                  <td className="p-4 text-xs font-mono text-slate-500">{l.idUbicacion}</td>
                  <td className="p-4 text-sm font-bold text-slate-700">{l.nombre}</td>
                  <td className="p-4 text-sm text-slate-600">{l.descripcion}</td>
                  <td className="p-4 text-xs text-slate-500">{l.estante}</td>
                  <td className="p-4 text-xs text-slate-500">{l.nivel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREATION */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-800">
                Nuevo Registro: {activeTab}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              
              {/* FORM: TELEPHONES */}
              {activeTab === 'TELEPHONES' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-slate-500">IMEI 1</label>
                       <input required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setPhoneForm({...phoneForm, imei1: e.target.value})} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-slate-500">IMEI 2</label>
                       <input required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setPhoneForm({...phoneForm, imei2: e.target.value})} />
                     </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-slate-500">Marca</label>
                       <input required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setPhoneForm({...phoneForm, marca: e.target.value})} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-slate-500">Modelo</label>
                       <input required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setPhoneForm({...phoneForm, modelo: e.target.value})} />
                     </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-slate-500">Precio Compra</label>
                       <input type="number" required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setPhoneForm({...phoneForm, precioCompra: Number(e.target.value)})} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-slate-500">Precio Venta</label>
                       <input type="number" required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setPhoneForm({...phoneForm, precioVenta: Number(e.target.value)})} />
                     </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Proveedor</label>
                    <select required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setPhoneForm({...phoneForm, codProveedor: e.target.value})}>
                      <option value="">Seleccione...</option>
                      {providers.map(p => <option key={p.codProveedor} value={p.codProveedor}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Ubicación Exacta</label>
                    <select required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setPhoneForm({...phoneForm, idubicacion: e.target.value})}>
                      <option value="">Seleccione...</option>
                      {locations.map(l => (
                        <option key={l.idUbicacion} value={l.idUbicacion}>
                          {l.nombre} - Estante {l.estante} (Nivel {l.nivel})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* FORM: STOCK ACCESORIOS */}
              {activeTab === 'STOCK' && (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Producto (Master)</label>
                    <select required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setStockForm({...stockForm, codAccesorio: e.target.value})}>
                      <option value="">Seleccione...</option>
                      {master.map(m => <option key={m.codAccesorio} value={m.codAccesorio}>{m.descripcion}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                     <div>
                       <label className="text-xs font-bold text-slate-500">Cantidad</label>
                       <input type="number" required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setStockForm({...stockForm, cantidad: Number(e.target.value)})} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-slate-500">Precio C.</label>
                       <input type="number" required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setStockForm({...stockForm, precioCompra: Number(e.target.value)})} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-slate-500">Precio V.</label>
                       <input type="number" required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setStockForm({...stockForm, precioVenta: Number(e.target.value)})} />
                     </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Proveedor</label>
                    <select required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setStockForm({...stockForm, codProveedor: e.target.value})}>
                      <option value="">Seleccione...</option>
                      {providers.map(p => <option key={p.codProveedor} value={p.codProveedor}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Ubicación Exacta</label>
                    <select required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setStockForm({...stockForm, idubicacion: e.target.value})}>
                      <option value="">Seleccione...</option>
                      {locations.map(l => (
                        <option key={l.idUbicacion} value={l.idUbicacion}>
                           {l.nombre} - Estante {l.estante} (Nivel {l.nivel})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* FORM: MASTER (REGISTRAR ACCESORIO) */}
              {activeTab === 'MASTER' && (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Categoría</label>
                    <select required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setMasterForm({...masterForm, codCategoria: e.target.value})}>
                      <option value="">Seleccione...</option>
                      {categories.map(c => <option key={c.codCategoria} value={c.codCategoria}>{c.tipo}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Descripción / Nombre</label>
                    <input required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setMasterForm({...masterForm, descripcion: e.target.value})} />
                  </div>
                </>
              )}

              {/* FORM: CATEGORIAS */}
              {activeTab === 'CATEGORIES' && (
                <div>
                   <label className="text-xs font-bold text-slate-500">Nombre Categoría</label>
                   <input required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setCatForm({...catForm, tipo: e.target.value})} />
                </div>
              )}

              {/* FORM: UBICACIONES */}
              {activeTab === 'LOCATIONS' && (
                <>
                  <div>
                     <label className="text-xs font-bold text-slate-500">Nombre</label>
                     <input required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setLocForm({...locForm, nombre: e.target.value})} />
                  </div>
                  <div>
                     <label className="text-xs font-bold text-slate-500">Descripción</label>
                     <input required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setLocForm({...locForm, descripcion: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-slate-500">Estante</label>
                       <input required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setLocForm({...locForm, estante: e.target.value})} />
                     </div>
                     <div>
                       <label className="text-xs font-bold text-slate-500">Nivel</label>
                       <input required className="w-full p-2 bg-slate-50 border rounded-lg mt-1" onChange={e => setLocForm({...locForm, nivel: e.target.value})} />
                     </div>
                  </div>
                </>
              )}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;