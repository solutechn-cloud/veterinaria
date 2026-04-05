import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ConsignService, InventoryService } from '../services/api';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { Consignacion, ProductoUnified } from '../types';
import {
  Hand, Search, Store, ShoppingCart, RefreshCcw, X, RefreshCw,
  Smartphone, Package, Check, ChevronDown, ChevronRight,
  ScanLine, Layers, DollarSign, RotateCcw, History, AlertCircle, Trash2, Minus, Plus
} from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';
import Swal from 'sweetalert2';
import * as ReactRouterDOM from 'react-router-dom';
const { useLocation } = ReactRouterDOM as any;

const TODAY = new Date().toISOString().split('T')[0];

interface BusinessGroup {
  name: string;
  items: Consignacion[];
  total: number;
}

interface FieldEdit { id: number; value: string; }

const Consignments: React.FC = () => {
  const location = useLocation();

  const [consignments, setConsignments] = useState<Consignacion[]>([]);
  const [products,     setProducts]     = useState<ProductoUnified[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [searchTerm,   setSearchTerm]   = useState('');
  const [showHistory,  setShowHistory]  = useState(false);

  // Which business accordion is expanded
  const [expandedBusiness, setExpandedBusiness] = useState<string | null>(null);

  // Inline field editing
  const [priceEdit, setPriceEdit] = useState<FieldEdit | null>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  // --- Scan flow ---
  // Step 1: choose mode
  const [showModeSheet, setShowModeSheet] = useState(false);
  // Step 2: choose business
  const [showBusinessSheet, setShowBusinessSheet] = useState(false);
  const [pendingMode, setPendingMode] = useState<'single' | 'batch' | null>(null);
  const [scanBusiness, setScanBusiness] = useState('');
  const [scanDueDate,  setScanDueDate]  = useState('');
  // Step 3: scan
  const [showScanner, setShowScanner]   = useState(false);
  const [batchCodes,  setBatchCodes]    = useState<string[]>([]);

  const businessInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const data = await ConsignService.getAll();
      setConsignments(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadProducts = async () => {
    try {
      const data = await InventoryService.getUnifiedProducts();
      setProducts(data || []);
    } catch (e) { console.error(e); }
  };

  useOfflineSync(loadData);

  useEffect(() => {
    loadData();
    loadProducts();
    if (location.state?.consignItem) {
      setScanBusiness('');
      setShowBusinessSheet(true);
      setPendingMode('single');
    }
  }, [location.state]);

  // ── Computed groups ─────────────────────────────────────────────────────────
  const uniqueBusinesses = useMemo(() =>
    [...new Set(consignments.map(c => c.negocio_destino))].sort(),
    [consignments]
  );

  const activeGroups = useMemo<BusinessGroup[]>(() => {
    const term = searchTerm.toLowerCase();
    const active = consignments.filter(c =>
      c.estado_consignacion === 'Prestado' &&
      (!term || c.negocio_destino.toLowerCase().includes(term) || c.nombre_producto?.toLowerCase().includes(term))
    );
    const map = new Map<string, Consignacion[]>();
    active.forEach(c => {
      const g = map.get(c.negocio_destino) ?? [];
      g.push(c);
      map.set(c.negocio_destino, g);
    });
    return Array.from(map.entries())
      .map(([name, items]) => ({ name, items, total: items.reduce((s, i) => s + Number(i.precio_especial_pago) * i.cantidad_prestada, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [consignments, searchTerm]);

  const historyItems = useMemo(() =>
    consignments
      .filter(c => c.estado_consignacion !== 'Prestado' &&
        (!searchTerm || c.negocio_destino.toLowerCase().includes(searchTerm.toLowerCase())))
      .slice(0, 40),
    [consignments, searchTerm]
  );

  // ── Register a consignment ─────────────────────────────────────────────────
  const registerOne = async (product: ProductoUnified, business: string, dueDate?: string) => {
    await ConsignService.create([{
      id_producto:         product.id,
      tipo_producto:       product.tipo as 'TELEFONO' | 'ACCESORIO',
      negocio_destino:     business,
      cantidad_prestada:   1,
      precio_especial_pago: product.precioVenta,
      fecha_limite:        dueDate || null,
    }]);
  };

  // ── Scan handlers ──────────────────────────────────────────────────────────
  const findProduct = (code: string) =>
    products.find(p => p.imei === code || p.codigo === code || String(p.id) === code);

  const handleScan = useCallback(async (code: string) => {
    const product = findProduct(code);
    if (!product) {
      Swal.fire({ title: 'Producto no encontrado', text: code, icon: 'warning', timer: 1800, showConfirmButton: false, toast: true, position: 'top' });
      return;
    }
    if (product.stock <= 0) {
      Swal.fire({ title: 'Sin stock', text: product.nombre, icon: 'warning', timer: 1500, showConfirmButton: false, toast: true, position: 'top' });
      return;
    }

    if (pendingMode === 'single') {
      // Check if this product is already consigned to this business (accessories only)
      const existing = consignments.find(c =>
        c.estado_consignacion === 'Prestado' &&
        c.negocio_destino === scanBusiness &&
        c.id_producto === product.id &&
        c.tipo_producto === 'ACCESORIO'
      );
      try {
        if (existing) {
          // Increment quantity on existing record
          const newQty = existing.cantidad_prestada + 1;
          await ConsignService.update(existing.id_consignacion, {
            cantidad_prestada: newQty,
            negocio_destino: existing.negocio_destino,
          });
          Swal.fire({ title: `Cantidad: ${newQty}`, text: product.nombre, icon: 'success', timer: 1200, showConfirmButton: false, toast: true, position: 'top' });
        } else {
          await registerOne(product, scanBusiness, scanDueDate);
          Swal.fire({ title: '¡Registrado!', text: product.nombre, icon: 'success', timer: 1200, showConfirmButton: false, toast: true, position: 'top' });
        }
        setShowScanner(false);
        loadData(); loadProducts();
        setExpandedBusiness(scanBusiness);
      } catch (e: any) {
        Swal.fire('Error', e.message, 'error');
      }
    } else {
      // Batch mode: accumulate unique product codes
      if (batchCodes.includes(code)) {
        Swal.fire({ title: 'Ya en el lote', text: product.nombre, icon: 'info', timer: 1000, showConfirmButton: false, toast: true, position: 'top' });
        return;
      }
      setBatchCodes(prev => [...prev, code]);
    }
  }, [pendingMode, scanBusiness, scanDueDate, batchCodes, products, consignments]);

  const handleConfirmBatch = useCallback(async () => {
    if (batchCodes.length === 0) {
      Swal.fire({ title: 'No hay productos escaneados', icon: 'warning', timer: 1500, showConfirmButton: false });
      return;
    }
    if (!scanBusiness.trim()) {
      Swal.fire('Falta el negocio', 'Selecciona un negocio destino.', 'warning');
      return;
    }
    setShowScanner(false);
    const resolved = batchCodes.map(c => findProduct(c)).filter(Boolean) as ProductoUnified[];
    try {
      for (const p of resolved) await registerOne(p, scanBusiness, scanDueDate);
      setBatchCodes([]);
      loadData(); loadProducts();
      setExpandedBusiness(scanBusiness);
      Swal.fire({ title: `${resolved.length} producto(s) registrado(s)`, icon: 'success', timer: 1800, showConfirmButton: false });
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  }, [batchCodes, scanBusiness, scanDueDate, products]);

  // ── Business sheet confirm ─────────────────────────────────────────────────
  const startScan = () => {
    if (!scanBusiness.trim()) {
      businessInputRef.current?.focus();
      return;
    }
    setShowBusinessSheet(false);
    setBatchCodes([]);
    setShowScanner(true);
  };

  // ── Liquidate / Return ─────────────────────────────────────────────────────
  const handleLiquidate = async (id: number, name?: string) => {
    const r = await Swal.fire({
      title: '¿Confirmar Cobro?', text: name, icon: 'question',
      showCancelButton: true, confirmButtonText: 'Cobrar', cancelButtonText: 'No',
      confirmButtonColor: '#16a34a',
    });
    if (r.isConfirmed) {
      try { await ConsignService.liquidate(id); loadData(); }
      catch (e: any) { Swal.fire('Error', e.message, 'error'); }
    }
  };

  const handleLiquidateAll = async (group: BusinessGroup) => {
    const r = await Swal.fire({
      title: `Cobrar todo a ${group.name}`,
      text: `Total: L. ${group.total.toFixed(2)}`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: 'Cobrar Todo', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
    });
    if (r.isConfirmed) {
      try {
        for (const item of group.items) await ConsignService.liquidate(item.id_consignacion);
        loadData();
        Swal.fire({ title: 'Cobrado', icon: 'success', timer: 1400, showConfirmButton: false });
      } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
    }
  };

  const handleReturn = async (id: number, name?: string) => {
    const r = await Swal.fire({
      title: '¿Retornar a Stock?', text: name, icon: 'warning',
      showCancelButton: true, confirmButtonText: 'Retornar',
    });
    if (r.isConfirmed) {
      try { await ConsignService.returnToStock(id); loadData(); loadProducts(); }
      catch (e: any) { Swal.fire('Error', e.message, 'error'); }
    }
  };

  // ── Price editing ──────────────────────────────────────────────────────────
  const startPriceEdit = (id: number, current: number) => {
    setPriceEdit({ id, value: String(current) });
    setTimeout(() => priceRef.current?.select(), 50);
  };

  const commitPriceEdit = async () => {
    if (!priceEdit) return;
    const price = parseFloat(priceEdit.value);
    if (isNaN(price) || price < 0) { setPriceEdit(null); return; }
    // Include negocio_destino to satisfy the NOT NULL constraint on the backend
    const item = consignments.find(c => c.id_consignacion === priceEdit.id);
    try {
      await ConsignService.update(priceEdit.id, {
        precio_especial_pago: price,
        negocio_destino: item?.negocio_destino,
      });
      setConsignments(prev => prev.map(c => c.id_consignacion === priceEdit.id ? { ...c, precio_especial_pago: price } : c));
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
    setPriceEdit(null);
  };

  // ── Quantity editing ───────────────────────────────────────────────────────
  const adjustQty = async (item: Consignacion, delta: number) => {
    const newQty = item.cantidad_prestada + delta;
    if (newQty < 1) return;
    try {
      await ConsignService.update(item.id_consignacion, {
        cantidad_prestada: newQty,
        negocio_destino: item.negocio_destino,
      });
      setConsignments(prev => prev.map(c => c.id_consignacion === item.id_consignacion ? { ...c, cantidad_prestada: newQty } : c));
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: number, name?: string) => {
    const r = await Swal.fire({
      title: '¿Eliminar registro?', text: `${name ?? ''} — el stock será devuelto.`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (r.isConfirmed) {
      try { await ConsignService.delete(id); loadData(); loadProducts(); }
      catch (e: any) { Swal.fire('Error', e.message, 'error'); }
    }
  };

  const toggleBusiness = (name: string) =>
    setExpandedBusiness(prev => prev === name ? null : name);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 shrink-0 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Hand className="text-orange-500" size={20}/> Consignaciones
          </h2>
          <p className="text-[11px] text-slate-400">{activeGroups.length} negocios activos</p>
        </div>
        <div className="flex gap-2">
          {/* Single product button */}
          <button
            onClick={() => { setPendingMode('single'); setScanBusiness(''); setScanDueDate(''); setShowBusinessSheet(true); }}
            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white px-3 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-orange-600/25 active:scale-95 transition-all"
          >
            <ScanLine size={16}/> <span className="hidden sm:inline">Producto</span>
          </button>
          {/* Batch button */}
          <button
            onClick={() => { setPendingMode('batch'); setScanBusiness(''); setScanDueDate(''); setShowBusinessSheet(true); }}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white px-3 py-2.5 rounded-xl font-black text-xs shadow-lg active:scale-95 transition-all"
          >
            <Layers size={16}/> <span className="hidden sm:inline">Lote</span>
          </button>
          <button onClick={loadData} className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
          <input
            type="text" placeholder="Buscar negocio o producto..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* ── Business Groups ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 custom-scrollbar">

        {activeGroups.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-300">
            <Hand size={48} strokeWidth={1} className="mb-3 opacity-30"/>
            <p className="font-black text-xs uppercase tracking-widest">Sin consignaciones activas</p>
            <p className="text-xs mt-1 text-slate-400">Usa los botones de arriba para registrar</p>
          </div>
        )}

        {activeGroups.map(group => {
          const isOpen = expandedBusiness === group.name;
          return (
            <div key={group.name} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Business header row */}
              <button
                onClick={() => toggleBusiness(group.name)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50/80 transition-colors active:bg-slate-100"
              >
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center shrink-0 text-orange-600">
                  <Store size={18}/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-800 text-sm truncate">{group.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {group.items.length} artículo{group.items.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-emerald-600 text-sm">L. {group.total.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  {isOpen ? <ChevronDown size={16} className="text-slate-400 ml-auto mt-0.5"/> : <ChevronRight size={16} className="text-slate-400 ml-auto mt-0.5"/>}
                </div>
              </button>

              {/* Expanded item list */}
              {isOpen && (
                <div className="border-t border-slate-100">
                  <div className="divide-y divide-slate-50">
                    {group.items.map(item => (
                      <div key={item.id_consignacion} className="p-3 flex items-center gap-3">
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.tipo_producto === 'TELEFONO' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-500'}`}>
                          {item.tipo_producto === 'TELEFONO' ? <Smartphone size={14}/> : <Package size={14}/>}
                        </div>

                        {/* Name + price + qty */}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 text-xs truncate">{item.nombre_producto}</p>

                          {/* Quantity row */}
                          <div className="flex items-center gap-1.5 mt-1">
                            {item.tipo_producto === 'ACCESORIO' ? (
                              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-1">
                                <button onClick={() => adjustQty(item, -1)} className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-500 active:scale-90 transition-all"><Minus size={10}/></button>
                                <span className="min-w-[20px] text-[11px] font-black text-slate-700 text-center px-0.5">{item.cantidad_prestada}</span>
                                <button onClick={() => adjustQty(item, +1)} className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-emerald-500 active:scale-90 transition-all"><Plus size={10}/></button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-bold">×1</span>
                            )}
                          </div>

                          {/* Inline price edit */}
                          {priceEdit?.id === item.id_consignacion ? (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[10px] text-slate-400 font-bold">L.</span>
                              <input
                                ref={priceRef}
                                type="number"
                                value={priceEdit.value}
                                onChange={e => setPriceEdit({ ...priceEdit, value: e.target.value })}
                                onBlur={commitPriceEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitPriceEdit(); if (e.key === 'Escape') setPriceEdit(null); }}
                                className="w-24 text-sm font-black text-emerald-600 border-b-2 border-emerald-500 bg-transparent outline-none"
                                autoFocus
                              />
                              <button onClick={commitPriceEdit} className="text-emerald-500 hover:text-emerald-700"><Check size={14}/></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startPriceEdit(item.id_consignacion, Number(item.precio_especial_pago))}
                              className="text-xs font-black text-emerald-600 hover:text-emerald-800 hover:underline mt-0.5 flex items-center gap-1"
                            >
                              L. {Number(item.precio_especial_pago).toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                              <span className="text-[9px] text-slate-300 font-normal">(editar)</span>
                            </button>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col gap-1 shrink-0">
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleLiquidate(item.id_consignacion, item.nombre_producto)}
                              className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center hover:bg-emerald-200 active:scale-90 transition-all"
                              title="Cobrar"
                            >
                              <DollarSign size={13}/>
                            </button>
                            <button
                              onClick={() => handleReturn(item.id_consignacion, item.nombre_producto)}
                              className="w-8 h-8 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center hover:bg-slate-200 active:scale-90 transition-all"
                              title="Retornar"
                            >
                              <RotateCcw size={13}/>
                            </button>
                          </div>
                          <button
                            onClick={() => handleDelete(item.id_consignacion, item.nombre_producto)}
                            className="w-full h-7 bg-red-50 text-red-400 rounded-lg flex items-center justify-center hover:bg-red-100 hover:text-red-600 active:scale-90 transition-all"
                            title="Eliminar"
                          >
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Liquidate all */}
                  <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                    <button
                      onClick={() => handleLiquidateAll(group)}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all"
                    >
                      <ShoppingCart size={16}/>
                      Cobrar Todo — L. {group.total.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* History toggle */}
        <button
          onClick={() => setShowHistory(h => !h)}
          className="w-full py-3 flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-widest transition-colors"
        >
          <History size={14}/>
          {showHistory ? 'Ocultar Historial' : `Ver Historial (${historyItems.length})`}
          <ChevronDown size={12} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`}/>
        </button>

        {showHistory && historyItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Historial — Cerrados</p>
            </div>
            <div className="divide-y divide-slate-50">
              {historyItems.map(c => (
                <div key={c.id_consignacion} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-600 text-xs truncate">{c.nombre_producto}</p>
                    <p className="text-[10px] text-slate-400">{c.negocio_destino}</p>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.estado_consignacion === 'Vendido_Pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {c.estado_consignacion === 'Vendido_Pagado' ? 'Cobrado' : 'Devuelto'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Business selection sheet ── */}
      {showBusinessSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowBusinessSheet(false)}/>
          <div className="relative bg-white rounded-t-3xl w-full max-w-lg shadow-2xl animate-slide-up"
               style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>

            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-4"/>

            <div className="px-5 pb-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${pendingMode === 'single' ? 'bg-orange-100 text-orange-600' : 'bg-slate-700 text-white'}`}>
                  {pendingMode === 'single' ? <ScanLine size={20}/> : <Layers size={20}/>}
                </div>
                <div>
                  <h3 className="font-black text-slate-800">
                    {pendingMode === 'single' ? 'Escanear Producto' : 'Escanear Lote'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {pendingMode === 'single' ? 'Escanea 1 producto y se registra al instante' : 'Escanea varios y confirma al terminar'}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Negocio Destino *</label>
                <div className="relative">
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                  <input
                    ref={businessInputRef}
                    list="businesses-list-sheet"
                    className="w-full pl-9 pr-4 py-3 border-2 border-slate-200 focus:border-orange-400 rounded-2xl font-bold text-sm outline-none transition-colors"
                    placeholder="Ej: Celulares Express..."
                    value={scanBusiness}
                    onChange={e => setScanBusiness(e.target.value)}
                    autoFocus
                  />
                  <datalist id="businesses-list-sheet">
                    {uniqueBusinesses.map(b => <option key={b} value={b}/>)}
                  </datalist>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Límite (opcional)</label>
                <input
                  type="date" min={TODAY}
                  className="w-full py-3 px-4 border-2 border-slate-200 focus:border-orange-400 rounded-2xl text-sm outline-none transition-colors"
                  value={scanDueDate} onChange={e => setScanDueDate(e.target.value)}
                />
              </div>

              <button
                onClick={startScan}
                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl active:scale-[0.98] transition-all ${pendingMode === 'single' ? 'bg-orange-600 shadow-orange-600/25 text-white' : 'bg-slate-800 shadow-slate-800/25 text-white'}`}
              >
                <ScanLine size={18}/>
                {pendingMode === 'single' ? 'Abrir Escáner' : 'Abrir Escáner de Lote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Barcode Scanner ── */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => { setShowScanner(false); setBatchCodes([]); }}
          title={pendingMode === 'single' ? `Escanear → ${scanBusiness}` : `Lote → ${scanBusiness}`}
          hint={pendingMode === 'single' ? 'Apunta al código, se registra al instante' : 'Escanea varios, presiona ✓ al terminar'}
          continuous={pendingMode === 'batch'}
          batchCount={batchCodes.length}
          onConfirmBatch={pendingMode === 'batch' ? handleConfirmBatch : undefined}
        />
      )}
    </div>
  );
};

export default Consignments;
