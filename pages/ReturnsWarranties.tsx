
import React, { useState, useEffect, useMemo } from 'react';
import { WarrantyService, SalesService, InventoryService, ClientService } from '../services/api';
import { Garantia, Venta, ProductoUnified, DetalleVenta, Cliente } from '../types';
import { 
  ShieldCheck, Search, PlusCircle, Clock, CheckCircle, RefreshCcw, X, Save, 
  AlertTriangle, ArrowRightLeft, Trash2, FileText, Smartphone, Printer, Info, History,
  TrendingUp, Check
} from 'lucide-react';
import Swal from 'sweetalert2';

const ReturnsWarranties: React.FC = () => {
  const [warranties, setWarranties] = useState<Garantia[]>([]);
  const [products, setProducts] = useState<ProductoUnified[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create / Edit Flow
  const [showModal, setShowModal] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState<Garantia | null>(null);
  
  // Creation Form
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [foundInvoice, setFoundInvoice] = useState<Venta | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DetalleVenta | null>(null);
  const [falla, setFalla] = useState('');
  const [obs, setObs] = useState('');

  // Exchange Form
  const [newProductSearch, setNewProductSearch] = useState('');
  const [selectedNewProduct, setSelectedNewProduct] = useState<ProductoUnified | null>(null);

  useEffect(() => { loadData(); loadDependencies(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await WarrantyService.getAll();
      setWarranties(data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const loadDependencies = async () => {
      try {
          const [p, c] = await Promise.all([
              InventoryService.getUnifiedProducts(),
              ClientService.getAll()
          ]);
          setProducts(p || []);
          setClients(c || []);
      } catch (e) { console.error(e); }
  };

  const handleSearchInvoice = async () => {
      if (!invoiceSearch) return;
      setFoundInvoice(null);
      setSelectedDetail(null);
      try {
          const v = await SalesService.getVenta(invoiceSearch);
          const d = await SalesService.getDetallesVenta(invoiceSearch);
          if (v) {
              setFoundInvoice({ ...v, detalles: d });
          } else {
              Swal.fire('No Encontrada', 'Verifique el número de factura.', 'warning');
          }
      } catch (e) { Swal.fire('Error', 'No se pudo localizar la factura.', 'error'); }
  };

  const handleCreateWarranty = async () => {
      if (!foundInvoice || !selectedDetail) return;
      try {
          const payload: Partial<Garantia> = {
              cod_venta: foundInvoice.codVenta,
              id_producto_original: selectedDetail.idTelefono || selectedDetail.idAccesorio,
              tipo_producto: (selectedDetail.tipoProducto as any) || 'TELEFONO',
              falla_reportada: falla,
              identidad_cliente: foundInvoice.identidadCliente,
              costo_original: 0, 
              precio_venta_original: Number(selectedDetail.precioVenta || 0),
              observaciones: obs
          };
          await WarrantyService.create(payload);
          setShowModal(false);
          setFalla('');
          setObs('');
          loadData();
          Swal.fire('Ingresado', 'Equipo en garantía registrado.', 'success');
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const exchangeCalculations = useMemo(() => {
    if (!selectedWarranty || !selectedNewProduct) return null;
    
    const s1 = Number(selectedWarranty.precio_venta_original || 0);
    const c1 = Number(selectedWarranty.costo_original || 0);
    const u1 = s1 - c1;

    const s2 = Number(selectedNewProduct.precioVenta || 0);
    const realC2 = (selectedNewProduct as any).precioCompra || (s2 * 0.75);
    const u2 = s2 - realC2;

    const diferenciaEfectivo = s2 - s1;
    const utilidadDiferencia = u2 - u1;

    return { s1, c1, u1, s2, c2: realC2, u2, diferenciaEfectivo, utilidadDiferencia };
  }, [selectedWarranty, selectedNewProduct]);

  const processExchange = async () => {
      if (!selectedWarranty || !selectedNewProduct || !exchangeCalculations) return;
      
      const result = await Swal.fire({
          title: '¿Confirmar Intercambio?',
          html: `
            <div class="text-left text-sm space-y-2">
                <p><b>Diferencia a cobrar:</b> L. ${exchangeCalculations.diferenciaEfectivo.toFixed(2)}</p>
                <p><b>Impacto Contable:</b> ${exchangeCalculations.utilidadDiferencia >= 0 ? 'INGRESO' : 'GASTO'} de L. ${Math.abs(exchangeCalculations.utilidadDiferencia).toFixed(2)}</p>
            </div>
          `,
          icon: 'warning',
          showCancelButton: true
      });

      if (result.isConfirmed) {
          try {
              await WarrantyService.exchange(selectedWarranty.id_garantia, {
                  idNuevoProducto: selectedNewProduct.id,
                  tipoNuevo: selectedNewProduct.tipo,
                  diferenciaEfectivo: exchangeCalculations.diferenciaEfectivo,
                  utilidadDiferencia: exchangeCalculations.utilidadDiferencia,
                  descripcionGastoIngreso: `CAMBIO ${selectedWarranty.id_producto_original} POR ${selectedNewProduct.nombre}`
              });
              setShowExchangeModal(false);
              loadData();
              Swal.fire('Procesado', 'El inventario y caja han sido actualizados.', 'success');
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const updateStatus = async (g: Garantia) => {
      const { value: status } = await Swal.fire({
          title: 'Actualizar Estado',
          input: 'select',
          inputOptions: { 'En Taller': 'En Taller', 'Proveedor': 'Proveedor', 'Listo': 'Listo' },
          inputValue: g.estado_garantia,
          showCancelButton: true
      });
      if (status) {
          try {
              await WarrantyService.update(g.id_garantia, { estado_garantia: status });
              loadData();
          } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
      }
  };

  const filtered = warranties.filter(g => 
    (g.cod_venta || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (g.id_producto_original || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (g.nombre_cliente || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in h-full flex flex-col pb-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 px-2">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ShieldCheck className="text-emerald-600"/> Garantías y Devoluciones</h2>
                <p className="text-slate-500 text-sm">Soporte técnico, reclamos de fábrica e intercambio de equipos.</p>
            </div>
            <button onClick={() => { setFoundInvoice(null); setInvoiceSearch(''); setShowModal(true); }} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-emerald-600/20 transition-all active:scale-95">
                <PlusCircle size={20}/> Ingresar Garantía
            </button>
        </div>

        <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-slate-50/50 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Buscar por factura, IMEI o cliente..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left min-w-[750px]">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase sticky top-0 z-10 tracking-widest border-b">
                        <tr>
                            <th className="p-4">Factura / Fecha</th>
                            <th className="p-4">Producto</th>
                            <th className="p-4">Cliente</th>
                            <th className="p-4">Estado</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.length === 0 ? (
                            <tr><td colSpan={5} className="p-10 text-center text-slate-400 italic text-sm">No hay registros de garantía.</td></tr>
                        ) : filtered.map(g => (
                            <tr key={g.id_garantia} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-4">
                                    <p className="font-bold text-slate-800 text-sm">{g.cod_venta}</p>
                                    <p className="text-[10px] text-slate-400 font-mono uppercase">{new Date(g.fecha_ingreso).toLocaleDateString()}</p>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-slate-100 p-2 rounded-xl text-slate-500"><Smartphone size={18}/></div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-700">{g.id_producto_original}</p>
                                            <p className="text-[9px] text-slate-400 uppercase font-black">{g.tipo_producto}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <p className="text-xs font-bold text-slate-600">{g.nombre_cliente || 'N/A'}</p>
                                </td>
                                <td className="p-4">
                                    <button onClick={() => updateStatus(g)} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1.5 transition-all hover:scale-105 ${g.estado_garantia === 'Cambiado' ? 'bg-indigo-100 text-indigo-700' : g.estado_garantia === 'Listo' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {g.estado_garantia === 'Listo' ? <CheckCircle size={12}/> : <Clock size={12}/>}
                                        {g.estado_garantia}
                                    </button>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-1.5 transition-opacity">
                                        {g.estado_garantia !== 'Cambiado' && (
                                            <button onClick={() => { setSelectedWarranty(g); setSelectedNewProduct(null); setShowExchangeModal(true); }} className="p-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20" title="Cambio de Equipo"><ArrowRightLeft size={16}/></button>
                                        )}
                                        <button onClick={() => {}} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><FileText size={16}/></button>
                                        <button onClick={() => {}} className="p-2 text-red-400 hover:bg-red-50 rounded-xl"><Trash2 size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* MODAL INGRESO GARANTIA */}
        {showModal && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
                <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in flex flex-col h-[90vh]">
                    <div className="p-5 md:p-6 border-b flex justify-between items-center bg-white shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-600 p-2 rounded-xl text-white"><ShieldCheck size={24}/></div>
                            <div>
                                <h3 className="text-lg md:text-xl font-bold">Ingreso a Garantía</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Recepción de Equipo</p>
                            </div>
                        </div>
                        <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-full"><X/></button>
                    </div>
                    <div className="p-5 md:p-8 space-y-6 overflow-y-auto custom-scrollbar bg-slate-50/30 flex-1">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">1. Localizar Factura</label>
                            <div className="flex flex-col md:flex-row gap-2">
                                <input className="flex-1 p-3 border border-slate-200 rounded-2xl font-bold text-sm uppercase outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="Número de Factura" value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)} />
                                <button onClick={handleSearchInvoice} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"><Search size={18}/> Buscar</button>
                            </div>
                        </div>

                        {foundInvoice && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Cliente: {foundInvoice.nombreCliente || 'Consumidor'}</p>
                                    <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2">2. Seleccionar Producto</label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {foundInvoice.detalles && foundInvoice.detalles.length > 0 ? foundInvoice.detalles.map(d => (
                                            <button key={d.codDetalleVenta} onClick={() => setSelectedDetail(d)} className={`w-full flex justify-between items-center p-3 rounded-xl border transition-all ${selectedDetail?.codDetalleVenta === d.codDetalleVenta ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-slate-50 border-slate-100 hover:bg-white'}`}>
                                                <div className="flex items-center gap-3 text-left">
                                                    <Smartphone size={16} className="text-slate-400"/>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-800">{d.descripcionProducto || 'Producto'}</p>
                                                        <p className="text-[9px] text-slate-500 font-mono">{d.idTelefono || d.idAccesorio || 'N/A'}</p>
                                                    </div>
                                                </div>
                                                <span className="text-xs font-black text-indigo-600">L. {Number(d.precioVenta || 0).toFixed(2)}</span>
                                            </button>
                                        )) : (
                                            <p className="text-xs text-slate-400 text-center py-4">No se encontraron productos en esta factura.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">3. Diagnóstico</label>
                                    <textarea className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" rows={2} placeholder="Describa el fallo reportado..." value={falla} onChange={e=>setFalla(e.target.value)}/>
                                    <textarea className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" rows={2} placeholder="Observaciones adicionales..." value={obs} onChange={e=>setObs(e.target.value)}/>
                                </div>

                                <button onClick={handleCreateWarranty} disabled={!selectedDetail || !falla.trim()} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm active:scale-95 disabled:opacity-50">
                                    <Save size={20}/> REGISTRAR INGRESO
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* MODAL INTERCAMBIO FINANCIERO */}
        {showExchangeModal && selectedWarranty && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
                <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden animate-fade-in flex flex-col h-[90vh]">
                    <div className="p-5 md:p-6 border-b flex justify-between items-center bg-indigo-600 text-white shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-2 rounded-xl"><ArrowRightLeft size={24}/></div>
                            <div>
                                <h3 className="text-lg md:text-xl font-bold">Intercambio de Equipo</h3>
                                <p className="text-[10px] text-indigo-100 font-bold uppercase tracking-widest">Ajuste de Garantía y Caja</p>
                            </div>
                        </div>
                        <button onClick={() => setShowExchangeModal(false)} className="text-indigo-200 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"><X/></button>
                    </div>

                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                        <div className="w-full md:w-1/2 p-5 md:p-6 border-r border-slate-100 flex flex-col bg-slate-50/50 overflow-y-auto">
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <input className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="Buscar nuevo equipo..." value={newProductSearch} onChange={e=>setNewProductSearch(e.target.value)} />
                            </div>
                            <div className="flex-1 space-y-2">
                                {products.filter(p => p.nombre.toLowerCase().includes(newProductSearch.toLowerCase()) && p.stock > 0).map(p => (
                                    <button key={p.id} onClick={() => setSelectedNewProduct(p)} className={`w-full p-3 rounded-2xl border text-left transition-all ${selectedNewProduct?.id === p.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-100 hover:border-indigo-300'}`}>
                                        <p className="text-xs font-bold leading-tight">{p.nombre}</p>
                                        <p className={`text-[9px] font-black uppercase mt-1 ${selectedNewProduct?.id === p.id ? 'text-indigo-200' : 'text-slate-400'}`}>L. {Number(p.precioVenta || 0).toFixed(2)}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="w-full md:w-1/2 p-5 md:p-6 bg-white flex flex-col justify-between overflow-y-auto">
                            <div className="space-y-6">
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Resumen de Cambio</p>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Equipo Original:</span>
                                            <span className="font-bold">L. {Number(selectedWarranty.precio_venta_original || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Equipo Nuevo:</span>
                                            <span className="font-bold">L. {selectedNewProduct ? Number(selectedNewProduct.precioVenta || 0).toFixed(2) : '0.00'}</span>
                                        </div>
                                        <div className="pt-2 border-t flex justify-between items-center">
                                            <span className="text-xs font-black text-indigo-600 uppercase">Diferencia Efectivo:</span>
                                            <span className={`text-lg font-black ${exchangeCalculations?.diferenciaEfectivo && exchangeCalculations.diferenciaEfectivo < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                L. {exchangeCalculations?.diferenciaEfectivo.toFixed(2) || '0.00'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {exchangeCalculations && (
                                    <div className={`p-4 rounded-2xl border flex items-start gap-3 ${exchangeCalculations.utilidadDiferencia >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                                        {exchangeCalculations.utilidadDiferencia >= 0 ? <TrendingUp className="text-emerald-600"/> : <AlertTriangle className="text-red-600"/>}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Impacto en Utilidad</p>
                                            <p className={`text-sm font-bold ${exchangeCalculations.utilidadDiferencia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                {exchangeCalculations.utilidadDiferencia >= 0 ? 'INCREMENTO DE GANANCIA' : 'PÉRDIDA DE MARGEN'}
                                            </p>
                                            <p className="text-xs font-medium text-slate-600 mt-1">Monto: L. {Math.abs(exchangeCalculations.utilidadDiferencia).toFixed(2)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button onClick={processExchange} disabled={!selectedNewProduct} className="w-full mt-4 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm disabled:opacity-50">
                                <Check size={20}/> PROCESAR INTERCAMBIO
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default ReturnsWarranties;
