
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
  Search, PlusCircle, Package, Smartphone, Layers, MapPin, Tag, Edit2, Trash2, X, RefreshCw, Box, Filter, Printer, Hand
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

  useEffect(() => {
    loadData();
    loadDependencies();
  }, [activeTab]);

  const uniqueBrands = useMemo(() => {
      const brands = phones.map(p => p.marca).filter(Boolean);
      return Array.from(new Set(brands)).sort();
  }, [phones]);

  const availableModels = useMemo(() => {
      if (!phoneForm.marca) return [];
      const models = phones
          .filter(p => p.marca.toLowerCase() === phoneForm.marca?.toLowerCase())
          .map(p => p.modelo)
          .filter(Boolean);
      return Array.from(new Set(models)).sort();
  }, [phones, phoneForm.marca]);

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

  const handleConsign = (item: Telefono | Inventario, type: 'TELEFONO' | 'ACCESORIO') => {
      const prod: ProductoUnified = type === 'TELEFONO' 
        ? { id: (item as Telefono).codigo, tipo: 'TELEFONO', nombre: `${(item as Telefono).marca} ${(item as Telefono).modelo}`, codigo: (item as Telefono).codigo, precioVenta: (item as Telefono).precioVenta, stock: 1, imei: (item as Telefono).imei1, ubicacion: (item as Telefono).idubicacion }
        : { id: (item as Inventario).codInventario, tipo: 'ACCESORIO', nombre: (item as Inventario).descripcionAccesorio || 'Accesorio', codigo: (item as Inventario).codInventario, precioVenta: (item as Inventario).precioVenta, stock: (item as Inventario).cantidad, ubicacion: (item as Inventario).idubicacion, categoria: (item as Inventario).categoriaAccesorio };
      
      navigate('/consignments', { state: { consignItem: prod } });
  };

  const getNestedValue = (obj: any, path: string): any => {
      if (!obj) return '';
      const keys = path.split('.');
      let current = obj;
      for (const key of keys) {
          if (current === null || typeof current !== 'object') return '';
          const foundKey = Object.keys(current).find(k => k.toLowerCase() === key.toLowerCase());
          if (foundKey) { current = current[foundKey]; } else { return ''; }
      }
      return current;
  };

  const replaceVariables = (content: string, dataContext: any): string => {
      let text = content || '';
      text = text.replace(/{{([\w.]+)}}/g, (match, path) => {
          const val = getNestedValue(dataContext, path);
          if (typeof val === 'number' && (path.toLowerCase().includes('precio') || path.toLowerCase().includes('costo'))) {
              return `L. ${val.toFixed(2)}`;
          }
          return val !== undefined && val !== null ? String(val) : '';
      });
      return text;
  };

  const safeNum = (val: any, def: number = 0): number => {
      const num = parseFloat(val);
      return isNaN(num) ? def : num;
  };

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
          const sortedElements = [...template.elements].sort((a, b) => safeNum(a.y) - safeNum(b.y));
          const layoutElements = sortedElements.map(el => {
              const elY = safeNum(el.y); const elH = safeNum(el.height); const elW = safeNum(el.width); const elX = safeNum(el.x);
              let finalY = elY + totalShiftY; let finalHeight = elH; let finalContent = el.content;
              if (el.type === 'TEXT') {
                  finalContent = replaceVariables(el.content, dataContext);
                  if (el.isStretchWithOverflow) {
                      const fontSize = safeNum(el.fontSize, 10);
                      if(el.fontFamily?.includes('Courier')) scratchDoc.setFont('courier', el.fontWeight); else if(el.fontFamily?.includes('Times')) scratchDoc.setFont('times', el.fontWeight); else scratchDoc.setFont('helvetica', el.fontWeight);
                      scratchDoc.setFontSize(fontSize);
                      const usableWidth = elW > 0 ? elW : 10;
                      const lines = scratchDoc.splitTextToSize(finalContent, usableWidth);
                      const lineHeightMm = fontSize * 0.3527 * 1.15; const actualHeight = lines.length * lineHeightMm;
                      if (actualHeight > elH) { const growth = actualHeight - elH; finalHeight = actualHeight; totalShiftY += growth; }
                  }
              } else if (el.type === 'BARCODE') { finalContent = replaceVariables(el.content, dataContext); }
              return { ...el, y: finalY, height: finalHeight, width: elW, x: elX, computedContent: finalContent };
          });
          const baseW = safeNum(template.width, 50); const baseH = safeNum(template.height, 25);
          const finalPdfHeight = baseH + totalShiftY;
          const doc = new jsPDF({ orientation: baseW > finalPdfHeight ? 'landscape' : 'portrait', unit: 'mm', format: [baseW, finalPdfHeight] });
          for (const el of layoutElements) {
              if (el.type === 'TEXT') {
                  doc.setFontSize(safeNum(el.fontSize, 10));
                  if(el.fontFamily?.includes('Courier')) doc.setFont('courier', el.fontWeight); else if(el.fontFamily?.includes('Times')) doc.setFont('times', el.fontWeight); else doc.setFont('helvetica', el.fontWeight);
                  doc.setTextColor(el.color || '#000000');
                  const opts: any = { baseline: 'top' };
                  let x = el.x;
                  if (el.textAlign === 'center') { x = el.x + (el.width / 2); opts.align = 'center'; } else if (el.textAlign === 'right') { x = el.x + el.width; opts.align = 'right'; }
                  if (el.isMultiline) opts.maxWidth = el.width > 0 ? el.width : baseW;
                  if (el.rotation && el.rotation !== 0) opts.angle = el.rotation;
                  doc.text(String(el.computedContent || ''), x, el.y, opts);
              } else if (el.type === 'BARCODE') {
                  const codeValue = el.computedContent;
                  if (codeValue) {
                      const canvas = document.createElement('canvas');
                      try {
                          const scaleFactor = 4;
                          JsBarcode(canvas, codeValue, { format: (el.barcodeFormat as any) || "CODE128", displayValue: el.displayValue, text: codeValue, fontSize: 14 * scaleFactor, textMargin: 2 * scaleFactor, margin: 0, width: 2 * scaleFactor, height: 50 * scaleFactor });
                          const imgData = canvas.toDataURL("image/png");
                          doc.addImage(imgData, 'PNG', el.x, el.y, el.width, el.height);
                      } catch(e) { console.error("Barcode Error", e); }
                  }
              } else if (el.type === 'SHAPE') {
                  const style = el.fill && el.fill !== 'transparent' ? 'FD' : 'S';
                  doc.setDrawColor(el.stroke || '#000000'); doc.setFillColor(el.fill || '#FFFFFF'); doc.setLineWidth((el.strokeWidth || 1) * 0.1); 
                  if (el.shapeType === 'CIRCLE') { const r = Math.min(el.width, el.height) / 2; doc.circle(el.x + r, el.y + r, r, style); } else if (el.shapeType === 'LINE') { doc.line(el.x, el.y, el.x + el.width, el.y); } else { doc.rect(el.x, el.y, el.width, el.height, style); }
              }
          }
          doc.save(type === 'TELEFONO' ? `Label_${item.imei1}.pdf` : `Label_${item.codInventario}.pdf`);
      } catch (error) { console.error(error); Swal.fire('Error', 'No se pudo generar la etiqueta.', 'error'); }
  };

  const openModal = (item?: any) => {
      setIsEditing(!!item);
      setCurrentId(item ? (item.codigo || item.codInventario || item.codAccesorio || item.codCategoria || item.idUbicacion) : null);
      if (activeTab === 'TELEPHONES') setPhoneForm(item || { estado: 'Disponible', fecha: new Date().toISOString().split('T')[0] });
      else if (activeTab === 'STOCK') setStockForm(item || { estado: 'Activo', fecha: new Date().toISOString().split('T')[0] });
      else if (activeTab === 'MASTER') setMasterForm(item || {});
      else if (activeTab === 'CATEGORIES') setCatForm(item || {});
      else if (activeTab === 'LOCATIONS') setLocForm(item || { estado: 'Activo' });
      setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditing) {
        if (activeTab === 'TELEPHONES') { if (phones.some(p => p.imei1 === phoneForm.imei1)) return Swal.fire({ title: 'IMEI Duplicado', text: `El IMEI ${phoneForm.imei1} ya existe.`, icon: 'warning' }); } 
        else if (activeTab === 'STOCK') { if (stock.some(s => s.codAccesorio === stockForm.codAccesorio && s.idubicacion === stockForm.idubicacion)) return Swal.fire({ title: 'Producto ya en Inventario', text: 'Este registro ya existe.', icon: 'error' }); }
    }
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
      if (loading) return <div className="p-8 text-center text-slate-500">Cargando datos...</div>;
      if (activeTab === 'TELEPHONES') {
          const filtered = phones.filter(p => {
              const term = searchTerm.toLowerCase();
              const matchesSearch = p.marca.toLowerCase().includes(term) || p.modelo.toLowerCase().includes(term) || p.imei1.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term);
              const matchesStatus = statusFilter === 'ALL' || p.estado === statusFilter;
              return matchesSearch && matchesStatus;
          });
          return (
              <table className="w-full text-left">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0"><tr><th className="p-3">Código</th><th className="p-3">Marca/Modelo</th><th className="p-3">IMEI</th><th className="p-3">Precio Venta</th><th className="p-3">Ubicación</th><th className="p-3">Estado</th><th className="p-3 text-right">Acciones</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{filtered.map(p => (
                      <tr key={p.codigo} className="hover:bg-slate-50 text-sm">
                          <td className="p-3 font-mono text-slate-500">{p.codigo}</td><td className="p-3 font-bold text-slate-700">{p.marca} {p.modelo}</td><td className="p-3 font-mono">{p.imei1}</td><td className="p-3 font-bold text-emerald-600">L. {Number(p.precioVenta).toFixed(2)}</td><td className="p-3 text-xs">{p.nombreUbicacion || p.idubicacion}</td>
                          <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${p.estado === 'Disponible' ? 'bg-green-100 text-green-700' : p.estado === 'Vendido' ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-600'}`}>{p.estado}</span></td>
                          <td className="p-3 text-right flex justify-end gap-1">
                              {p.estado === 'Disponible' && <button onClick={() => handleConsign(p, 'TELEFONO')} className="text-orange-500 hover:bg-orange-50 p-1.5 rounded" title="Prestar Consignación"><Hand size={16}/></button>}
                              <button onClick={() => handlePrintLabel(p, 'TELEFONO')} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded" title="Imprimir Etiqueta"><Printer size={16}/></button>
                              <button onClick={() => openModal(p)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                              <button onClick={() => handleDelete(p.codigo)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                          </td>
                      </tr>))}
                  </tbody>
              </table>
          );
      }
      if (activeTab === 'STOCK') {
        const filtered = stock.filter(s => { const term = searchTerm.toLowerCase(); return s.descripcionAccesorio?.toLowerCase().includes(term) || s.codInventario.toLowerCase().includes(term); });
        return (
            <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase sticky top-0"><tr><th className="p-3">SKU</th><th className="p-3">Descripción</th><th className="p-3">Categoría</th><th className="p-3 text-center">Cant.</th><th className="p-3 text-right">P. Venta</th><th className="p-3">Ubicación</th><th className="p-3 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{filtered.map(s => (
                    <tr key={s.codInventario} className="hover:bg-slate-50 text-sm">
                        <td className="p-3 font-mono text-slate-500 text-xs">{s.codInventario}</td><td className="p-3 font-bold text-slate-700">{s.descripcionAccesorio}</td><td className="p-3 text-xs">{s.categoriaAccesorio}</td>
                        <td className="p-3 text-center"><span className={`px-2 py-1 rounded-md font-bold text-xs ${s.cantidad > 5 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{s.cantidad}</span></td>
                        <td className="p-3 text-right font-bold text-emerald-600">L. {Number(s.precioVenta).toFixed(2)}</td><td className="p-3 text-xs">{s.nombreUbicacion || s.idubicacion}</td>
                        <td className="p-3 text-right flex justify-end gap-1">
                            {s.cantidad > 0 && <button onClick={() => handleConsign(s, 'ACCESORIO')} className="text-orange-500 hover:bg-orange-50 p-1.5 rounded" title="Prestar Consignación"><Hand size={16}/></button>}
                            <button onClick={() => handlePrintLabel(s, 'STOCK')} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded" title="Imprimir Etiqueta"><Printer size={16}/></button>
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
                <tbody className="divide-y divide-slate-100">{master.filter(m => m.descripcion.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                    <tr key={m.codAccesorio} className="hover:bg-slate-50 text-sm">
                        <td className="p-3 font-mono text-slate-500 text-xs">{m.codAccesorio}</td><td className="p-3 font-bold text-slate-700">{m.descripcion}</td><td className="p-3">{m.nombreCategoria || m.codCategoria}</td>
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
            <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50">
                <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none" /></div>
                {activeTab === 'TELEPHONES' && (
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"><Filter size={16} className="text-slate-400"/><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none"><option value="ALL">Todos</option><option value="Disponible">Disponibles</option><option value="Vendido">Vendidos</option></select></div>
                )}
                <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg border border-slate-200 bg-white"><RefreshCw size={20} /></button>
            </div>
          )}
          <div className="flex-1 overflow-auto">{renderContent()}</div>
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`bg-white rounded-3xl w-full ${activeTab === 'TELEPHONES' || activeTab === 'STOCK' ? 'max-w-4xl' : 'max-w-md'} shadow-2xl p-0 overflow-hidden animate-fade-in flex flex-col max-h-[90vh]`}>
             <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10"><div><h3 className="text-2xl font-bold text-slate-800">{isEditing ? 'Editar' : 'Nuevo'} {activeTab === 'TELEPHONES' ? 'Teléfono' : activeTab === 'STOCK' ? 'Inventario' : activeTab === 'MASTER' ? 'Accesorio' : activeTab === 'CATEGORIES' ? 'Categoría' : 'Ubicación'}</h3><p className="text-slate-500 text-sm mt-1">Complete la información requerida</p></div><button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-2 hover:bg-slate-100 rounded-full"><X size={24}/></button></div>
             <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50"><form onSubmit={handleSubmit} className="space-y-8">
                {activeTab === 'TELEPHONES' && (
                    <div className="space-y-8"><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><h4 className="text-sm font-bold text-indigo-600 uppercase mb-4 tracking-wider flex items-center gap-2"><Tag size={16}/> Identificadores</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">IMEI 1 (Principal)</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono" value={phoneForm.imei1 || ''} onChange={e => setPhoneForm({...phoneForm, imei1: e.target.value})} placeholder="Escanear o escribir..." /></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">IMEI 2 (Opcional)</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono" value={phoneForm.imei2 || ''} onChange={e => setPhoneForm({...phoneForm, imei2: e.target.value})} placeholder="Dual SIM" /></div></div></div><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><h4 className="text-sm font-bold text-indigo-600 uppercase mb-4 tracking-wider flex items-center gap-2"><Smartphone size={16}/> Dispositivo</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Marca</label><input required list="brands-list" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none placeholder:text-slate-400" value={phoneForm.marca || ''} onChange={e => setPhoneForm({...phoneForm, marca: e.target.value, modelo: ''})} placeholder="Ej: Samsung, Apple..."/><datalist id="brands-list">{uniqueBrands.map(brand => (<option key={brand} value={brand} />))}</datalist></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Modelo</label><input required list="models-list" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none placeholder:text-slate-400" value={phoneForm.modelo || ''} onChange={e => setPhoneForm({...phoneForm, modelo: e.target.value})} placeholder="Ej: Galaxy S23, iPhone 14..." disabled={!phoneForm.marca}/><datalist id="models-list">{availableModels.map(model => (<option key={model} value={model} />))}</datalist></div></div></div><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><h4 className="text-sm font-bold text-indigo-600 uppercase mb-4 tracking-wider flex items-center gap-2"><Layers size={16}/> Finanzas y Logística</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6"><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Precio Compra</label><input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" value={phoneForm.precioCompra || ''} onChange={e => setPhoneForm({...phoneForm, precioCompra: Number(e.target.value)})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Precio Venta</label><input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-600 text-lg" value={phoneForm.precioVenta || ''} onChange={e => setPhoneForm({...phoneForm, precioVenta: Number(e.target.value)})} /></div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Fecha Compra</label><input type="date" required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" value={phoneForm.fecha ? phoneForm.fecha.split('T')[0] : ''} onChange={e => setPhoneForm({...phoneForm, fecha: e.target.value})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Ubicación</label><select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" value={phoneForm.idubicacion || ''} onChange={e => setPhoneForm({...phoneForm, idubicacion: e.target.value})}><option value="">Seleccionar...</option>{locations.map(l => (<option key={l.idUbicacion} value={l.idUbicacion}>{l.nombre} - Estante: {l.estante} - Nivel: {l.nivel}</option>))}</select></div><div className="md:col-span-2"><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Proveedor</label><select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" value={phoneForm.codProveedor || ''} onChange={e => setPhoneForm({...phoneForm, codProveedor: e.target.value})}><option value="">Seleccionar...</option>{providers.map(p => <option key={p.codProveedor} value={p.codProveedor}>{p.nombre}</option>)}</select></div></div></div></div>
                )}
                {activeTab === 'STOCK' && (
                    <div className="space-y-8"><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><h4 className="text-sm font-bold text-indigo-600 uppercase mb-4 tracking-wider flex items-center gap-2"><Box size={16}/> Producto</h4><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Accesorio (Maestro)</label><select required disabled={isEditing} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl disabled:bg-slate-100 text-slate-900" value={stockForm.codAccesorio || ''} onChange={e => setStockForm({...stockForm, codAccesorio: e.target.value})}><option value="" className="text-slate-500">Seleccionar...</option>{master.map(m => (<option key={m.codAccesorio} value={m.codAccesorio}>{m.descripcion}</option>))}</select></div></div><div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><h4 className="text-sm font-bold text-indigo-600 uppercase mb-4 tracking-wider flex items-center gap-2"><Layers size={16}/> Detalle Inventario</h4><div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6"><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Cantidad</label><input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg" value={stockForm.cantidad || ''} onChange={e => setStockForm({...stockForm, cantidad: Number(e.target.value)})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">P. Compra</label><input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" value={stockForm.precioCompra || ''} onChange={e => setStockForm({...stockForm, precioCompra: Number(e.target.value)})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">P. Venta</label><input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-600 text-lg" value={stockForm.precioVenta || ''} onChange={e => setStockForm({...stockForm, precioVenta: Number(e.target.value)})} /></div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Ubicación</label><select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" value={stockForm.idubicacion || ''} onChange={e => setStockForm({...stockForm, idubicacion: e.target.value})}><option value="">Seleccionar...</option>{locations.map(l => (<option key={l.idUbicacion} value={l.idUbicacion}>{l.nombre} - Estante: {l.estante} - Nivel: {l.nivel}</option>))}</select></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Proveedor</label><select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl" value={stockForm.codProveedor || ''} onChange={e => setStockForm({...stockForm, codProveedor: e.target.value})}><option value="">Seleccionar...</option>{providers.map(p => <option key={p.codProveedor} value={p.codProveedor}>{p.nombre}</option>)}</select></div></div></div></div>
                )}
                {activeTab === 'MASTER' && (
                    <div className="space-y-4"><div><label className="text-xs font-bold text-slate-500 uppercase">Descripción</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={masterForm.descripcion || ''} onChange={e => setMasterForm({...masterForm, descripcion: e.target.value})} placeholder="Ej: Cargador Samsung Tipo C" /></div><div><label className="text-xs font-bold text-slate-500 uppercase">Categoría</label><select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={masterForm.codCategoria || ''} onChange={e => setMasterForm({...masterForm, codCategoria: e.target.value})}><option value="">-- Seleccionar --</option>{categories.map(c => <option key={c.codCategoria} value={c.codCategoria}>{c.tipo}</option>)}</select></div></div>
                )}
                {activeTab === 'CATEGORIES' && (
                     <div><label className="text-xs font-bold text-slate-500 uppercase">Nombre Categoría</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={catForm.tipo || ''} onChange={e => setCatForm({...catForm, tipo: e.target.value})} /></div>
                )}
                {activeTab === 'LOCATIONS' && (
                    <div className="space-y-4"><div><label className="text-xs font-bold text-slate-500 uppercase">Nombre</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={locForm.nombre || ''} onChange={e => setLocForm({...locForm, nombre: e.target.value})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase">Descripción</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={locForm.descripcion || ''} onChange={e => setLocForm({...locForm, descripcion: e.target.value})} /></div><div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 uppercase">Estante</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={locForm.estante || ''} onChange={e => setLocForm({...locForm, estante: e.target.value})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase">Nivel</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" value={locForm.nivel || ''} onChange={e => setLocForm({...locForm, nivel: e.target.value})} /></div></div></div>
                )}
                <div className="pt-6 flex gap-4 border-t border-slate-100"><button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancelar</button><button type="submit" className="flex-1 px-4 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20">{isEditing ? 'Actualizar' : 'Guardar'}</button></div>
             </form></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
