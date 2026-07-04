import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { InventoryService, ClientService, SalesService, MedicamentosService, CashService, LoyaltyService, QuoteService } from '../services/api';
import { printSaleInvoice, downloadSaleInvoicePDF, printQuote, downloadQuotePDF } from '../services/DocumentService';
import { ProductoFarmacia, Cliente, VentaPayload, CotizacionPayload, PresentacionVenta, LoyaltyPreview, VentaDocumentoTipo } from '../types';
import {
  AlertTriangle, Lock, RefreshCw, ShoppingCart,
  LayoutGrid, Clock, TrendingUp, Package,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';

import {
  CartItem, HeldCart, PaymentMethod, DiscountType,
  PresentacionModalState, CrossBranchModalState, CartTotals,
} from '../components/POS/types';
import ProductCatalog    from '../components/POS/ProductCatalog';
import CartPanel         from '../components/POS/CartPanel';
import CheckoutPanel     from '../components/POS/CheckoutPanel';
import PresentacionModal from '../components/POS/PresentacionModal';
import CrossBranchModal  from '../components/POS/CrossBranchModal';
import QuickClientModal  from '../components/POS/QuickClientModal';
import HoldPanel         from '../components/POS/HoldPanel';
import * as ReactRouterDOM from 'react-router-dom';
const { useNavigate, useLocation } = ReactRouterDOM as any;

// ── Session stats (local counter, resets on page reload) ─────────────────────
const sessionStart = new Date();

function formatDuration(from: Date): string {
  const mins = Math.floor((Date.now() - from.getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const POS: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [products, setProducts]       = useState<ProductoFarmacia[]>([]);
  const [clients, setClients]         = useState<Cliente[]>([]);
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [activeArqueo, setActiveArqueo] = useState<any>(null);
  const [cotizacionOrigen, setCotizacionOrigen] = useState<string | null>(null);

  const [isLoading, setIsLoading]         = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const checkoutLockRef = useRef(false);
  const quoteLockRef = useRef(false);

  const [searchTerm, setSearchTerm]           = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [mobileTab, setMobileTab]             = useState<'CATALOG' | 'CART' | 'CHECKOUT'>('CATALOG');
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [showHoldPanel, setShowHoldPanel]     = useState(false);

  // Cart controls
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [paymentType, setPaymentType]           = useState<'Contado' | 'Credito'>('Contado');
  const [paymentMethod, setPaymentMethod]       = useState<PaymentMethod>('Efectivo');
  const [documentType, setDocumentType]          = useState<VentaDocumentoTipo>('factura_fiscal');
  const [discount, setDiscount]                 = useState<number>(0);
  const [discountType, setDiscountType]         = useState<DiscountType>('L');
  const [cashReceived, setCashReceived]         = useState<number>(0);
  const [mixtoEfectivo, setMixtoEfectivo]       = useState<number>(0);
  const [thirdAgeMode, setThirdAgeMode]         = useState(false);
  const [heldCarts, setHeldCarts]               = useState<HeldCart[]>([]);
  const [sessionSales, setSessionSales]         = useState(0);
  const [tick, setTick]                         = useState(0); // for duration display

  const [modal, setModal]           = useState<PresentacionModalState>({ product: {} as ProductoFarmacia, visible: false, selectedId: null });
  const [crossModal, setCrossModal] = useState<CrossBranchModalState>({ visible: false, product: null, branches: [], loading: false });
  const [pendingCrossBranch, setPendingCrossBranch] = useState<{ id_sucursal: number; nombre: string } | null>(null);

  // Loyalty state
  const [loyaltyPreview, setLoyaltyPreview]           = useState<LoyaltyPreview | null>(null);
  const [loyaltyRedemptionPts, setLoyaltyRedemptionPts] = useState(0);
  const [loyaltyRedemptionLps, setLoyaltyRedemptionLps] = useState(0);

  const hasAssignedCashRegister = !!user?.idCaja && user.idCaja !== 'Sin Caja';

  // Tick every minute to update session duration
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'F2') { e.preventDefault(); setMobileTab('CATALOG'); }
      if (e.key === 'F4') { e.preventDefault(); setShowQuickClient(true); }
      if (e.key === 'F8') { e.preventDefault(); if (!isCheckingOut && !isCreatingQuote) handleCheckout(); }
      if (e.key === 'Escape' && !inInput) { setSearchTerm(''); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCheckingOut, isCreatingQuote]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadInitialData = useCallback(async (options?: { selectDefaultClient?: boolean }) => {
    setIsLoading(true);
    try {
      const [prodData, clientData, cashSession] = await Promise.all([
        InventoryService.getUnifiedProducts(),
        ClientService.getAll(),
        CashService.getActiveArqueo().catch(() => null),
      ]);
      setProducts(prodData || []);
      setActiveArqueo(cashSession || null);
      const clientList = clientData || [];
      setClients(clientList);
      const cf = clientList.find((c: Cliente) =>
        (c.nombre + ' ' + (c.apellido || '')).toLowerCase().includes('consumidor')
      );
      if (options?.selectDefaultClient !== false && cf) setSelectedClientId(cf.identidad);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadInitialData(); }, [loadInitialData]);

  // Convertir cotización → venta: carga sus ítems al carrito si se llega con ?cotizacion=
  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const codigo = params.get('cotizacion');
    if (!codigo) return;
    (async () => {
      try {
        const [cot, dets] = await Promise.all([QuoteService.get(codigo), QuoteService.getDetalles(codigo)]);
        const items: CartItem[] = (dets || []).map((d: any, idx: number) => ({
          key: `cot-${codigo}-${idx}`,
          id_medicamento: d.id_medicamento || '',
          id_presentacion: Number(d.id_presentacion) || 0,
          id_servicio: d.id_servicio || undefined,
          nombre: d.descripcionProducto || 'Producto',
          cantidad: Number(d.cantidad) || 1,
          precioVenta: Number(d.precioVenta) || 0,
          tipoIsv: (d.tipoIsv as CartItem['tipoIsv']) || 'exento',
          tipoProducto: (d.tipoProducto as CartItem['tipoProducto']) || 'MEDICAMENTO',
          requiereReceta: false,
          esControlado: false,
          stock: 999999,
        }));
        setCart(items);
        if ((cot as any)?.identidadCliente) setSelectedClientId((cot as any).identidadCliente);
        setCotizacionOrigen(codigo);
        navigate('/pos', { replace: true });
        Swal.fire({ icon: 'info', title: 'Cotización cargada', text: `${codigo} cargada en el carrito. Revisa y cobra para convertirla en venta.`, timer: 2600, showConfirmButton: false });
      } catch (e: any) {
        Swal.fire('Error', e?.message || 'No se pudo cargar la cotización', 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // ── Cart totals ───────────────────────────────────────────────────────────
  const totals = useMemo((): CartTotals => {
    let exento = 0, gravado15 = 0, gravado18 = 0;
    for (const item of cart) {
      const price = thirdAgeMode && item.precioTerceraEdad ? item.precioTerceraEdad : item.precioVenta;
      const line  = item.cantidad * price;
      if (item.tipoIsv === 'exento') exento    += line;
      else if (item.tipoIsv === '15') gravado15 += line;
      else if (item.tipoIsv === '18') gravado18 += line;
    }
    const bruto = exento + gravado15 + gravado18;
    let desc = 0;
    if (discountType === 'L') desc = Math.max(0, Math.min(discount, bruto));
    else desc = Math.max(0, Math.min((bruto * discount) / 100, bruto));
    // Add loyalty redemption on top of manual discount
    desc = Math.min(desc + loyaltyRedemptionLps, bruto);

    const ratio = bruto > 0 ? (bruto - desc) / bruto : 1;
    const isv   = (gravado15 * ratio * 15 / 115) + (gravado18 * ratio * 18 / 118);
    return { exento, gravado: gravado15 + gravado18, bruto, descuento: desc, isv: Math.round(isv * 100) / 100, total: bruto - desc };
  }, [cart, discount, discountType, thirdAgeMode, loyaltyRedemptionLps]);

  // ── Loyalty preview ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedClientId || cart.length === 0) {
      setLoyaltyPreview(null);
      return;
    }
    // Fetch with pre-loyalty-discount total so max redemption is computed correctly
    const baseTotal = totals.total + loyaltyRedemptionLps;
    if (baseTotal <= 0) return;
    const timer = setTimeout(async () => {
      try {
        const r = await LoyaltyService.preview(selectedClientId, baseTotal, user?.id_sucursal);
        setLoyaltyPreview(r.activo ? r : null);
      } catch { /* silent — loyalty is optional */ }
    }, 500);
    return () => clearTimeout(timer);
  // Intentionally omit loyaltyRedemptionLps: re-fetch only on cart/client/discount changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId, totals.bruto, discount, discountType, thirdAgeMode]);

  const handleLoyaltyRedemption = useCallback((lps: number, pts: number) => {
    setLoyaltyRedemptionLps(lps);
    setLoyaltyRedemptionPts(pts);
  }, []);

  // ── Cart handlers ─────────────────────────────────────────────────────────
  const addPresentacionToCart = useCallback((
    product: ProductoFarmacia,
    presentacion: PresentacionVenta,
    crossId?: number,
    crossNombre?: string,
  ) => {
    const baseKey = `${product.codigo}-${presentacion.id_presentacion}`;
    const key = crossId ? `${baseKey}-s${crossId}` : baseKey;
    setCart(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) {
        if (!crossId && existing.cantidad >= product.stock) {
          Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Sin más stock disponible', showConfirmButton: false, timer: 1500 });
          return prev;
        }
        return prev.map(i => i.key === key ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, {
        key,
        id_medicamento: product.tipoProducto === 'SERVICIO' ? '' : product.codigo,
        id_presentacion: presentacion.id_presentacion,
        id_servicio: product.tipoProducto === 'SERVICIO' ? presentacion.id_presentacion : undefined,
        nombre: `${product.nombreGenerico}${product.concentracion ? ' ' + product.concentracion : ''} — ${presentacion.nombre}`,
        cantidad: 1,
        precioVenta: Number(presentacion.precio_venta),
        precioTerceraEdad: presentacion.precio_tercera_edad ? Number(presentacion.precio_tercera_edad) : undefined,
        tipoIsv: product.tipoIsv,
        tipoProducto: product.tipoProducto || 'MEDICAMENTO',
        requiereReceta: product.requiereReceta,
        esControlado: product.esControlado,
        stock: crossId ? 9999 : product.stock,
        id_sucursal_origen: crossId,
        sucursal_nombre_origen: crossNombre,
      }];
    });
  }, []);

  const removeFromCart   = useCallback((key: string) => setCart(prev => prev.filter(i => i.key !== key)), []);

  const updateQty = useCallback((key: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.key !== key) return item;
      const next = item.cantidad + delta;
      if (next < 1) return item;
      if (delta > 0 && !item.id_sucursal_origen && next > item.stock) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Límite de stock alcanzado', showConfirmButton: false, timer: 1200 });
        return item;
      }
      return { ...item, cantidad: next };
    }));
  }, []);

  const updateQtyDirect = useCallback((key: string, qty: number) => {
    setCart(prev => prev.map(item => {
      if (item.key !== key) return item;
      if (!item.id_sucursal_origen && qty > item.stock) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Cantidad supera el stock', showConfirmButton: false, timer: 1200 });
        return item;
      }
      return { ...item, cantidad: qty };
    }));
  }, []);

  // ── Barcode search ────────────────────────────────────────────────────────
  const handleBarcodeSearch = useCallback((code: string) => {
    const p = products.find(pr => pr.codigoBarras === code) || products.find(pr => pr.codigo === code);
    if (!p) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: `Código "${code}" no encontrado`, showConfirmButton: false, timer: 1800 });
      return;
    }
    handleProductClick(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // ── Product/modal handlers ────────────────────────────────────────────────
  const openCrossModal = useCallback(async (product: ProductoFarmacia) => {
    setCrossModal({ visible: true, product, branches: [], loading: true });
    try {
      const branches = await MedicamentosService.getDisponibilidadSucursales(product.codigo);
      setCrossModal(m => ({ ...m, branches: branches || [], loading: false }));
    } catch {
      setCrossModal(m => ({ ...m, loading: false }));
    }
  }, []);

  const handleProductClick = useCallback((product: ProductoFarmacia) => {
    if (product.stock === 0) { openCrossModal(product); return; }
    const pres = product.presentaciones || [];
    if (pres.length === 0) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Sin presentaciones configuradas', showConfirmButton: false, timer: 1800 });
      return;
    }
    if (pres.length === 1) { addPresentacionToCart(product, pres[0]); setMobileTab('CART'); return; }
    setModal({ product, visible: true, selectedId: pres[0].id_presentacion });
  }, [addPresentacionToCart, openCrossModal]);

  const handleBillFromBranch = useCallback((product: ProductoFarmacia, branch: any) => {
    const pres = product.presentaciones || [];
    setCrossModal(m => ({ ...m, visible: false }));
    if (pres.length === 0) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Sin presentaciones configuradas', showConfirmButton: false, timer: 1800 });
      return;
    }
    if (pres.length === 1) { addPresentacionToCart(product, pres[0], branch.id_sucursal, branch.sucursal_nombre); setMobileTab('CART'); return; }
    setPendingCrossBranch({ id_sucursal: branch.id_sucursal, nombre: branch.sucursal_nombre });
    setModal({ product, visible: true, selectedId: pres[0].id_presentacion });
  }, [addPresentacionToCart]);

  const confirmModal = useCallback(() => {
    const pres = modal.product.presentaciones?.find(p => p.id_presentacion === modal.selectedId);
    if (!pres) return;
    addPresentacionToCart(modal.product, pres, pendingCrossBranch?.id_sucursal, pendingCrossBranch?.nombre);
    setPendingCrossBranch(null);
    setModal(m => ({ ...m, visible: false }));
    setMobileTab('CART');
  }, [modal, addPresentacionToCart, pendingCrossBranch]);

  // ── Hold / restore ────────────────────────────────────────────────────────
  const holdCart = useCallback(() => {
    if (cart.length === 0) return;
    if (heldCarts.length >= 5) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Máximo 5 ventas en espera', showConfirmButton: false, timer: 1800 });
      return;
    }
    const cliente = clients.find(c => c.identidad === selectedClientId);
    setHeldCarts(prev => [...prev, {
      id: `hold-${Date.now()}`,
      clienteNombre: cliente ? `${cliente.nombre} ${cliente.apellido}` : '',
      items: [...cart],
      discount,
      discountType,
      paymentType,
      savedAt: new Date(),
    }]);
    setCart([]);
    setDiscount(0);
    setDiscountType('L');
    setCashReceived(0);
    setMixtoEfectivo(0);
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Venta apartada', showConfirmButton: false, timer: 1200 });
  }, [cart, clients, selectedClientId, discount, discountType, paymentType, heldCarts.length]);

  const restoreCart = useCallback((id: string) => {
    const held = heldCarts.find(h => h.id === id);
    if (!held) return;
    if (cart.length > 0) {
      Swal.fire({
        title: '¿Reemplazar carrito actual?',
        text: 'El carrito actual se perderá.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, restaurar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#4f46e5',
      }).then(r => {
        if (!r.isConfirmed) return;
        setCart(held.items);
        setDiscount(held.discount);
        setDiscountType(held.discountType);
        setPaymentType(held.paymentType);
        setHeldCarts(prev => prev.filter(h => h.id !== id));
      });
    } else {
      setCart(held.items);
      setDiscount(held.discount);
      setDiscountType(held.discountType);
      setPaymentType(held.paymentType);
      setHeldCarts(prev => prev.filter(h => h.id !== id));
    }
  }, [cart.length, heldCarts]);

  // ── Quick client created ──────────────────────────────────────────────────
  const handleClientCreated = useCallback((newClient: Cliente) => {
    setClients(prev => {
      const exists = prev.find(c => c.identidad === newClient.identidad);
      return exists ? prev : [newClient, ...prev];
    });
    setSelectedClientId(newClient.identidad);
  }, []);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetPOS = useCallback(() => {
    setCart([]);
    setSelectedClientId('');
    setSearchTerm('');
    setSelectedCategory('Todos');
    setMobileTab('CATALOG');
    setDiscount(0);
    setDiscountType('L');
    setPaymentType('Contado');
    setPaymentMethod('Efectivo');
    setDocumentType('factura_fiscal');
    setCotizacionOrigen(null);
    setCashReceived(0);
    setMixtoEfectivo(0);
    setThirdAgeMode(false);
    setPendingCrossBranch(null);
    setModal({ product: {} as ProductoFarmacia, visible: false, selectedId: null });
    setCrossModal({ visible: false, product: null, branches: [], loading: false });
    setShowQuickClient(false);
    setShowHoldPanel(false);
    setLoyaltyPreview(null);
    setLoyaltyRedemptionPts(0);
    setLoyaltyRedemptionLps(0);
    loadInitialData({ selectDefaultClient: false });
  }, [loadInitialData]);

  const buildCommercialDetails = useCallback(() => cart.map(item => ({
    id_medicamento: item.id_medicamento,
    id_presentacion: item.id_presentacion,
    id_servicio: item.id_servicio,
    cantidad: item.cantidad,
    precioVenta: thirdAgeMode && item.precioTerceraEdad ? item.precioTerceraEdad : item.precioVenta,
    descripcionProducto: item.nombre,
    tipoProducto: item.tipoProducto || 'MEDICAMENTO' as const,
    tipoIsv: item.tipoIsv,
    ...(item.id_sucursal_origen ? { id_sucursal_origen: item.id_sucursal_origen } : {}),
  } as any)), [cart, thirdAgeMode]);

  // ── Checkout ──────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (checkoutLockRef.current) return;
    if (!hasAssignedCashRegister) {
      Swal.fire('Caja no asignada', 'Tu usuario no tiene una caja asignada.', 'warning');
      return;
    }
    if (!activeArqueo) {
      Swal.fire('Turno de caja cerrado', 'Debes abrir caja antes de procesar ventas.', 'warning');
      return;
    }
    if (cart.length === 0) return;
    if (!selectedClientId) {
      Swal.fire('Cliente Requerido', 'Seleccione un cliente para procesar la venta.', 'warning');
      return;
    }

    // Validate mixed payment
    if (paymentType === 'Contado' && paymentMethod === 'Mixto' && mixtoEfectivo > totals.total) {
      Swal.fire('Pago mixto inválido', 'El monto en efectivo no puede superar el total.', 'warning');
      return;
    }

    const hasRx = cart.some(i => i.requiereReceta || i.esControlado);
    if (hasRx) {
      const result = await Swal.fire({
        title: 'Medicamentos con receta',
        text: 'El carrito contiene medicamentos que requieren receta médica o son controlados. ¿Confirma que cuenta con la receta correspondiente?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, proceder',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#4f46e5',
      });
      if (!result.isConfirmed) return;
    }

    try {
      checkoutLockRef.current = true;
      setIsCheckingOut(true);
      const clientMutationId = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const payload: VentaPayload = {
        identidadCliente: selectedClientId,
        tipoCompra: paymentType,
        tipoDocumento: documentType,
        documentoFiscal: documentType === 'factura_fiscal',
        total: totals.total,
        isv: totals.isv,
        descuento: totals.descuento,
        clientMutationId,
        ...(cotizacionOrigen ? { codCotizacion: cotizacionOrigen } : {}),
        detalles: buildCommercialDetails(),
      };

      const crossBranchItems = cart.filter(i => i.id_sucursal_origen);
      // Capture loyalty snapshot before resetPOS clears state
      const snapClientId    = selectedClientId;
      const snapLoyaltyPts  = loyaltyRedemptionPts;
      const snapBasePurchase = totals.total + loyaltyRedemptionLps; // pre-loyalty total
      const loyaltyActive   = loyaltyPreview?.activo === true;

      const response = await SalesService.createVenta(payload);
      const codVenta = response?.codVenta || '';
      const numeroDocumento = response?.numeroFactura || codVenta;
      const documentLabel = documentType === 'factura_fiscal' ? 'Factura fiscal' : 'Factura no fiscal';
      setSessionSales(s => s + 1);
      resetPOS();

      // Non-blocking loyalty earn/redeem (best-effort — admin can adjust manually if it fails)
      if (loyaltyActive && snapClientId && codVenta) {
        (async () => {
          if (snapLoyaltyPts > 0) {
            try { await LoyaltyService.redeem(snapClientId, codVenta, snapLoyaltyPts, user?.id_sucursal); } catch {}
          }
          try { await LoyaltyService.earn(snapClientId, codVenta, snapBasePurchase, user?.id_sucursal); } catch {}
        })();
      }

      const crossHtml = crossBranchItems.length > 0
        ? `<div class="mt-3 p-3 bg-orange-50 rounded-lg text-left text-xs text-orange-800">
             <strong>El cliente debe retirar en:</strong>
             <ul class="mt-1 space-y-0.5">${crossBranchItems.map(i =>
               `<li>• ${i.nombre.split(' — ')[0]} → <strong>${i.sucursal_nombre_origen || 'sucursal origen'}</strong></li>`
             ).join('')}</ul>
           </div>`
        : '';

      const { value: action } = await Swal.fire({
        title: 'Venta Procesada',
        html: `<p class="text-slate-600">${documentLabel} <strong>#${numeroDocumento}</strong> generada.</p>${crossHtml}`,
        icon: 'success',
        confirmButtonColor: '#4f46e5',
        confirmButtonText: `Imprimir ${documentType === 'factura_fiscal' ? 'factura' : 'documento'}`,
        showDenyButton: true,
        denyButtonText: 'Descargar PDF',
        denyButtonColor: '#0ea5e9',
        showCancelButton: true,
        cancelButtonText: 'Cerrar',
        cancelButtonColor: '#64748b',
      });

      if (action === true) {
        const result = await printSaleInvoice(codVenta);
        if (!result.success) Swal.fire('Sin plantilla', result.message, 'warning');
      } else if (action === false) {
        const result = await downloadSaleInvoicePDF(codVenta);
        if (!result.success) Swal.fire('Sin plantilla', result.message, 'warning');
      }
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudo procesar la venta.', 'error');
    } finally {
      setIsCheckingOut(false);
      checkoutLockRef.current = false;
    }
  };

  const handleCreateQuote = async () => {
    if (quoteLockRef.current) return;
    if (cart.length === 0) return;
    if (!selectedClientId) {
      Swal.fire('Cliente requerido', 'Seleccione un cliente para generar la cotización.', 'warning');
      return;
    }

    try {
      quoteLockRef.current = true;
      setIsCreatingQuote(true);
      const clientMutationId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const payload: CotizacionPayload = {
        identidadCliente: selectedClientId,
        tipoCompra: paymentType,
        total: totals.total,
        isv: totals.isv,
        descuento: totals.descuento,
        clientMutationId,
        detalles: buildCommercialDetails(),
      };

      const response = await QuoteService.create(payload);
      const codigo = response?.codigo || response?.codCotizacion || '';

      const { value: action } = await Swal.fire({
        title: 'Cotización generada',
        html: `<p class="text-slate-600">Cotización <strong>#${codigo}</strong> generada. No afecta ventas, caja ni inventario.</p>`,
        icon: 'success',
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'Imprimir cotización',
        showDenyButton: true,
        denyButtonText: 'Descargar PDF',
        denyButtonColor: '#0ea5e9',
        showCancelButton: true,
        cancelButtonText: 'Cerrar',
        cancelButtonColor: '#64748b',
      });

      if (action === true) {
        const result = await printQuote(codigo);
        if (!result.success) Swal.fire('Sin plantilla', result.message, 'warning');
      } else if (action === false) {
        const result = await downloadQuotePDF(codigo);
        if (!result.success) Swal.fire('Sin plantilla', result.message, 'warning');
      }
    } catch (e: any) {
      Swal.fire('Error', e.message || 'No se pudo generar la cotización.', 'error');
    } finally {
      setIsCreatingQuote(false);
      quoteLockRef.current = false;
    }
  };

  const cartCount = cart.reduce((a, b) => a + b.cantidad, 0);

  const handleCrossSearch = useCallback(async (term: string) => {
    try {
      const all = await InventoryService.getUnifiedProducts({ q: term, include_zero_stock: '1' });
      if (!all || all.length === 0) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Medicamento no encontrado en ninguna sucursal', showConfirmButton: false, timer: 2200 });
        return;
      }
      const productWithStock = all.find((p: ProductoFarmacia) => Number(p.stock || 0) > 0) || all[0];
      openCrossModal(productWithStock as ProductoFarmacia);
    } catch {
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Error al buscar en otras sucursales', showConfirmButton: false, timer: 1800 });
    }
  }, [openCrossModal]);

  // ── Locked states ─────────────────────────────────────────────────────────
  // ── Main POS ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-80px)] gap-0 overflow-hidden -mx-4 md:-mx-8 -mt-4 md:-mt-8">

      {/* ── Session header strip ── */}
      <div className="bg-slate-900 text-white px-4 md:px-6 py-2 shrink-0 flex items-center gap-3 md:gap-6 flex-wrap">
        <div className="flex items-center gap-2 text-[11px]">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-slate-300">{user?.nombreEmpleado || user?.usuario}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">{user?.idCaja || 'Sin caja'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Clock size={11} />
          <span>{formatDuration(sessionStart)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <TrendingUp size={11} />
          <span>{sessionSales} venta{sessionSales !== 1 ? 's' : ''} este turno</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Package size={11} />
          <span>{products.length} productos</span>
        </div>
        {/* Shortcut hints — hidden on mobile */}
        <div className="ml-auto hidden md:flex items-center gap-3 text-[10px] text-slate-600">
          <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">F2</kbd> Buscar</span>
          <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">F4</kbd> Nuevo cliente</span>
          <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">F8</kbd> Cobrar</span>
          <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">Esc</kbd> Limpiar</span>
        </div>
      </div>

      {cotizacionOrigen && (
        <div className="shrink-0 border-b border-indigo-100 bg-indigo-50 px-4 py-2 text-sm text-indigo-800 md:px-6 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Package size={15} className="text-indigo-600" />
            Convirtiendo cotización <strong>{cotizacionOrigen}</strong> — cobra para generar la venta.
          </span>
          <button type="button" onClick={() => { setCart([]); setCotizacionOrigen(null); }}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Cancelar</button>
        </div>
      )}

      {/* ── Mobile tab bar ── */}
      {!isLoading && (!hasAssignedCashRegister || !activeArqueo) && (
        <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-900 md:px-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={16} />
              <span>
                Puedes preparar cotizaciones sin abrir caja. Para facturar ventas debes tener caja asignada y turno abierto.
                {!hasAssignedCashRegister ? ' Solicita a un administrador que asigne una caja a tu usuario.' : ''}
              </span>
            </div>
            <div className="flex shrink-0 gap-2">
              {hasAssignedCashRegister && (
                <button
                  type="button"
                  onClick={() => navigate('/cash')}
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
                >
                  <Lock size={13} /> Abrir caja
                </button>
              )}
              <button
                type="button"
                onClick={() => loadInitialData()}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 transition-colors hover:bg-amber-100"
              >
                <RefreshCw size={13} /> Verificar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="lg:hidden flex bg-white border-b border-slate-200 shrink-0">
        {[
          { id: 'CATALOG'  as const, label: 'Catálogo', badge: null },
          { id: 'CART'     as const, label: 'Carrito',  badge: cartCount > 0 ? cartCount : null },
          { id: 'CHECKOUT' as const, label: 'Cobrar',   badge: null },
        ].map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setMobileTab(id)}
            className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
              mobileTab === id
                ? 'text-indigo-600 border-indigo-600'
                : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}
          >
            {id === 'CATALOG'  && <LayoutGrid size={13} />}
            {id === 'CART'     && <ShoppingCart size={13} />}
            {id === 'CHECKOUT' && <Package size={13} />}
            {label}
            {badge !== null && (
              <span className="bg-indigo-600 text-white w-4 h-4 rounded-full text-[9px] flex items-center justify-center">{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Main panels ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden gap-0">

        {/* Catalog panel */}
        <div className={`${mobileTab === 'CATALOG' ? 'flex' : 'hidden'} lg:flex flex-1 min-h-0 min-w-0 p-3 md:p-4 bg-slate-50`}>
          <ProductCatalog
            products={products}
            isLoading={isLoading}
            searchTerm={searchTerm}
            selectedCategory={selectedCategory}
            onSearchChange={setSearchTerm}
            onCategoryChange={setSelectedCategory}
            onProductClick={handleProductClick}
            onReload={loadInitialData}
            onBarcodeSearch={handleBarcodeSearch}
            onCrossSearch={handleCrossSearch}
          />
        </div>

        {/* Cart panel */}
        <div className={`${mobileTab === 'CART' ? 'flex' : 'hidden'} lg:flex flex-col min-h-0 p-3 md:p-4 bg-slate-50 w-full lg:w-auto`}>
          <CartPanel
            cart={cart}
            thirdAgeMode={thirdAgeMode}
            totals={totals}
            heldCount={heldCarts.length}
            onUpdateQty={updateQty}
            onUpdateQtyDirect={updateQtyDirect}
            onRemove={removeFromCart}
            onClearCart={() => { setCart([]); setDiscount(0); setDiscountType('L'); setCashReceived(0); setMixtoEfectivo(0); }}
            onHoldCart={holdCart}
            onShowHeld={() => setShowHoldPanel(true)}
          />
        </div>

        {/* Checkout panel */}
        <div className={`${mobileTab === 'CHECKOUT' ? 'flex' : 'hidden'} lg:flex flex-col min-h-0 p-3 md:p-4 bg-slate-50 w-full lg:w-auto`}>
          <CheckoutPanel
            cartLength={cart.length}
            clients={clients}
            selectedClientId={selectedClientId}
            paymentType={paymentType}
            paymentMethod={paymentMethod}
            discount={discount}
            discountType={discountType}
            cashReceived={cashReceived}
            mixtoEfectivo={mixtoEfectivo}
            thirdAgeMode={thirdAgeMode}
            totals={totals}
            isCheckingOut={isCheckingOut}
            isCreatingQuote={isCreatingQuote}
            documentType={documentType}
            canCharge={hasAssignedCashRegister && !!activeArqueo}
            onClientChange={setSelectedClientId}
            onPaymentTypeChange={setPaymentType}
            onPaymentMethodChange={setPaymentMethod}
            onDocumentTypeChange={setDocumentType}
            onDiscountChange={setDiscount}
            onDiscountTypeChange={setDiscountType}
            onCashReceivedChange={setCashReceived}
            onMixtoEfectivoChange={setMixtoEfectivo}
            onThirdAgeModeChange={setThirdAgeMode}
            onCheckout={handleCheckout}
            onCreateQuote={handleCreateQuote}
            onNewClient={() => setShowQuickClient(true)}
            loyaltyPreview={loyaltyPreview}
            loyaltyRedemptionLps={loyaltyRedemptionLps}
            onLoyaltyRedemptionChange={handleLoyaltyRedemption}
          />
        </div>
      </div>

      {/* ── Modals ── */}
      <PresentacionModal
        modal={modal}
        pendingCrossBranch={pendingCrossBranch}
        onClose={() => { setModal(m => ({ ...m, visible: false })); setPendingCrossBranch(null); }}
        onSelectPres={id => setModal(m => ({ ...m, selectedId: id }))}
        onConfirm={confirmModal}
      />
      <CrossBranchModal
        modal={crossModal}
        onClose={() => setCrossModal(m => ({ ...m, visible: false }))}
        onBillFromBranch={handleBillFromBranch}
      />
      <QuickClientModal
        visible={showQuickClient}
        onClose={() => setShowQuickClient(false)}
        onCreated={handleClientCreated}
      />
      <HoldPanel
        visible={showHoldPanel}
        heldCarts={heldCarts}
        onClose={() => setShowHoldPanel(false)}
        onRestore={restoreCart}
        onDiscard={id => setHeldCarts(prev => prev.filter(h => h.id !== id))}
      />
    </div>
  );
};

export default POS;
