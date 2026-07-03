import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  User, UserPlus, ChevronDown, Banknote, CreditCard, Blend,
  RefreshCw, ShoppingCart, Percent, DollarSign, CheckCircle, Search, X, Star, FileText,
  ReceiptText, FileX,
} from 'lucide-react';
import { Cliente, LoyaltyPreview, VentaDocumentoTipo } from '../../types';
import { CartTotals, PaymentMethod, DiscountType } from './types';

interface Props {
  cartLength: number;
  clients: Cliente[];
  selectedClientId: string;
  paymentType: 'Contado' | 'Credito';
  paymentMethod: PaymentMethod;
  discount: number;
  discountType: DiscountType;
  cashReceived: number;
  mixtoEfectivo: number;
  thirdAgeMode: boolean;
  totals: CartTotals;
  isCheckingOut: boolean;
  isCreatingQuote: boolean;
  documentType: VentaDocumentoTipo;
  canCharge: boolean;
  onClientChange: (id: string) => void;
  onPaymentTypeChange: (type: 'Contado' | 'Credito') => void;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  onDocumentTypeChange: (type: VentaDocumentoTipo) => void;
  onDiscountChange: (v: number) => void;
  onDiscountTypeChange: (t: DiscountType) => void;
  onCashReceivedChange: (v: number) => void;
  onMixtoEfectivoChange: (v: number) => void;
  onThirdAgeModeChange: (v: boolean) => void;
  onCheckout: () => void;
  onCreateQuote: () => void;
  onNewClient: () => void;
  loyaltyPreview?: LoyaltyPreview | null;
  loyaltyRedemptionLps?: number;
  onLoyaltyRedemptionChange?: (lps: number, pts: number) => void;
}

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: 'Efectivo', label: 'Efectivo', icon: <Banknote size={14} /> },
  { id: 'Tarjeta',  label: 'Tarjeta',  icon: <CreditCard size={14} /> },
  { id: 'Mixto',    label: 'Mixto',    icon: <Blend size={14} /> },
];

export default function CheckoutPanel({
  cartLength, clients, selectedClientId, paymentType, paymentMethod,
  discount, discountType, cashReceived, mixtoEfectivo, thirdAgeMode,
  totals, isCheckingOut, isCreatingQuote, documentType, canCharge,
  onClientChange, onPaymentTypeChange, onPaymentMethodChange,
  onDocumentTypeChange, onDiscountChange, onDiscountTypeChange, onCashReceivedChange,
  onMixtoEfectivoChange, onThirdAgeModeChange, onCheckout, onNewClient,
  onCreateQuote, loyaltyPreview, loyaltyRedemptionLps = 0, onLoyaltyRedemptionChange,
}: Props) {
  const [clientSearch, setClientSearch] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [loyaltyActive, setLoyaltyActive] = useState(false);
  const [puntosInput, setPuntosInput] = useState(0);
  const clientRef   = useRef<HTMLDivElement>(null);
  const searchRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setSearchActive(false);
        setClientSearch('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Reset loyalty UI when client or cart changes
  useEffect(() => {
    setLoyaltyActive(false);
    setPuntosInput(0);
    onLoyaltyRedemptionChange?.(0, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId, cartLength]);

  const selectedClient = clients.find(c => c.identidad === selectedClientId);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return [];
    const startsWithDigit = /^\d/.test(q);
    const matches = clients.filter(c =>
      c.identidad.toLowerCase().includes(q) ||
      `${c.nombre} ${c.apellido || ''}`.toLowerCase().includes(q)
    );
    if (startsWithDigit) {
      matches.sort((a, b) => {
        const aExact = a.identidad.toLowerCase().startsWith(q) ? 0 : 1;
        const bExact = b.identidad.toLowerCase().startsWith(q) ? 0 : 1;
        return aExact - bExact;
      });
    }
    return matches.slice(0, 12);
  }, [clients, clientSearch]);

  const activateSearch = () => {
    setSearchActive(true);
    setClientSearch('');
    setTimeout(() => searchRef.current?.focus(), 30);
  };

  const change = paymentMethod === 'Efectivo' ? cashReceived - totals.total : null;
  const mixtoTarjeta = totals.total - mixtoEfectivo;
  const canCheckout = cartLength > 0 && !!selectedClientId && !isCheckingOut && !isCreatingQuote && canCharge;
  // La cotización no requiere caja/turno; el cobro sí (canCharge).
  const canCreateQuote = cartLength > 0 && !!selectedClientId && !isCheckingOut && !isCreatingQuote;
  const manualDiscount = Math.max(0, totals.descuento - loyaltyRedemptionLps);

  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 w-full lg:w-[320px] xl:w-[340px] shrink-0 min-h-0 h-full overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 shrink-0 bg-gradient-to-r from-indigo-50 to-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
            <ShoppingCart size={14} className="text-white" />
          </div>
          <h3 className="font-black text-sm text-slate-800">Cobrar</h3>
          {cartLength > 0 && (
            <span className="text-[10px] font-bold text-slate-400">{cartLength} ítem{cartLength !== 1 ? 's' : ''}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => onDocumentTypeChange('factura_fiscal')}
              title="Cobrar con factura fiscal (consume correlativo CAI)"
              aria-pressed={documentType === 'factura_fiscal'}
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                documentType === 'factura_fiscal'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-400 border border-slate-200 hover:border-indigo-300'
              }`}
            >
              <ReceiptText size={12} />
            </button>
            <button
              type="button"
              onClick={() => onDocumentTypeChange('factura_no_fiscal')}
              title="Cobrar sin factura fiscal (no consume CAI)"
              aria-pressed={documentType === 'factura_no_fiscal'}
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                documentType === 'factura_no_fiscal'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-400 border border-slate-200 hover:border-indigo-300'
              }`}
            >
              <FileX size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 pt-3 pb-4 space-y-4">

          {/* Cliente */}
          <div ref={clientRef} className="relative">
            <div className="flex items-center gap-2 mb-1.5">
              <User size={13} className="text-slate-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Cliente</span>
              <button
                onClick={onNewClient}
                className="ml-auto flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <UserPlus size={11} /> Nuevo <span className="hidden sm:inline opacity-50 font-normal">(F4)</span>
              </button>
            </div>

            {/* Selected client card */}
            {selectedClient && !searchActive ? (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-indigo-50 border-2 border-indigo-200 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                  {selectedClient.nombre[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-800 truncate">{selectedClient.nombre} {selectedClient.apellido}</p>
                  <p className="text-[10px] text-slate-400 truncate">{selectedClient.identidad}</p>
                </div>
                <button
                  onClick={activateSearch}
                  className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors shrink-0 flex items-center gap-0.5"
                >
                  <ChevronDown size={11} /> Cambiar
                </button>
              </div>
            ) : (
              /* Direct identity/name search input */
              <div className="relative">
                <div className="relative flex items-center">
                  <Search size={13} className="absolute left-3 text-slate-400 pointer-events-none" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    onFocus={() => setSearchActive(true)}
                    placeholder="Identidad o nombre del cliente…"
                    className="w-full pl-8 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-300 transition-all"
                  />
                  {clientSearch && (
                    <button
                      onClick={() => setClientSearch('')}
                      className="absolute right-2.5 text-slate-300 hover:text-slate-500 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 mt-1 ml-1">Escribe la identidad (DNI) para búsqueda exacta</p>

                {/* Results dropdown */}
                {clientSearch.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
                    <div className="max-h-44 overflow-y-auto">
                      {filteredClients.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">Sin resultados para "{clientSearch}"</p>
                      ) : filteredClients.map(c => (
                        <button
                          key={c.identidad}
                          onClick={() => { onClientChange(c.identidad); setSearchActive(false); setClientSearch(''); }}
                          className={`w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors flex items-center gap-2.5 border-b border-slate-50 last:border-0 ${c.identidad === selectedClientId ? 'bg-indigo-50' : ''}`}
                        >
                          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600 shrink-0">
                            {c.nombre[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{c.nombre} {c.apellido || ''}</p>
                            <p className="text-[10px] font-mono text-indigo-600 font-bold">{c.identidad}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tipo compra + 3a Edad */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1 flex-1 bg-slate-100 rounded-xl p-0.5">
              {(['Contado', 'Credito'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => onPaymentTypeChange(t)}
                  className={`flex-1 py-1.5 text-[11px] font-black rounded-lg transition-all ${
                    paymentType === t
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              onClick={() => onThirdAgeModeChange(!thirdAgeMode)}
              title="Precio tercera edad"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border-2 text-[11px] font-black transition-all shrink-0 ${
                thirdAgeMode
                  ? 'bg-purple-600 border-purple-600 text-white shadow-sm'
                  : 'bg-transparent border-slate-200 text-slate-400 hover:border-purple-300'
              }`}
            >
              3a Edad
            </button>
          </div>

          {/* Descuento */}
          {cartLength > 0 && (
            <div className="flex items-center gap-2 py-2 border-y border-slate-100">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide shrink-0">Descuento</span>
              <div className="flex items-center bg-slate-100 rounded-lg ml-auto overflow-hidden shrink-0">
                <button
                  onClick={() => onDiscountTypeChange('L')}
                  className={`px-2 py-1 text-[10px] font-black transition-colors flex items-center gap-0.5 ${discountType === 'L' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <DollarSign size={10} /> L
                </button>
                <button
                  onClick={() => onDiscountTypeChange('%')}
                  className={`px-2 py-1 text-[10px] font-black transition-colors flex items-center gap-0.5 ${discountType === '%' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Percent size={10} /> %
                </button>
              </div>
              <input
                type="number"
                min={0}
                max={discountType === '%' ? 100 : undefined}
                value={discount}
                onChange={e => onDiscountChange(Math.max(0, Number(e.target.value)))}
                onFocus={e => e.target.select()}
                className="w-20 text-right py-1.5 px-2 border border-slate-200 rounded-lg bg-white text-[12px] font-black text-slate-700 outline-none focus:ring-1 focus:ring-indigo-400 shrink-0"
              />
            </div>
          )}

          {/* Loyalty card */}
          {loyaltyPreview?.activo && cartLength > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-3 space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2">
                <Star size={12} className="text-amber-500 fill-amber-500 shrink-0" />
                <span className="text-[10px] font-black text-amber-700 truncate">
                  {loyaltyPreview.nombrePrograma}
                </span>
                {loyaltyPreview.tierEnabled && (
                  <span className={`ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                    loyaltyPreview.tierActual === 'gold'   ? 'bg-yellow-300 text-yellow-900' :
                    loyaltyPreview.tierActual === 'silver' ? 'bg-slate-200 text-slate-700' :
                                                             'bg-amber-200 text-amber-800'
                  }`}>
                    {String(loyaltyPreview.tierActual || 'bronze').toUpperCase()}
                  </span>
                )}
              </div>

              {/* Balance + earn */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-black text-amber-700 leading-none">
                    {(loyaltyPreview.puntosDisponibles || 0).toLocaleString()} pts
                  </p>
                  <p className="text-[9px] text-amber-500 mt-0.5">disponibles</p>
                </div>
                {(loyaltyPreview.puntosGanaria || 0) > 0 && (
                  <div className="text-right">
                    <p className="text-[11px] font-black text-emerald-600">+{loyaltyPreview.puntosGanaria} pts</p>
                    <p className="text-[9px] text-emerald-500">ganarías</p>
                  </div>
                )}
              </div>

              {/* Redeem section */}
              {(loyaltyPreview.maxPuntosRedimibles || 0) > 0 ? (
                <div className="space-y-1.5">
                  <button
                    onClick={() => {
                      const next = !loyaltyActive;
                      setLoyaltyActive(next);
                      if (!next) { setPuntosInput(0); onLoyaltyRedemptionChange?.(0, 0); }
                    }}
                    className={`w-full flex items-center gap-2 py-1.5 px-2.5 rounded-xl border-2 text-[11px] font-black transition-all ${
                      loyaltyActive
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : 'bg-white border-amber-300 text-amber-700 hover:border-amber-400'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                      loyaltyActive ? 'border-white bg-white' : 'border-amber-400'
                    }`}>
                      {loyaltyActive && <div className="w-1.5 h-1.5 bg-amber-500 rounded-sm" />}
                    </div>
                    Usar puntos como descuento
                  </button>

                  {loyaltyActive && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={loyaltyPreview.maxPuntosRedimibles || 0}
                          step={100}
                          value={puntosInput || ''}
                          onChange={e => {
                            const max = loyaltyPreview.maxPuntosRedimibles || 0;
                            const v   = Math.min(Math.max(0, parseInt(e.target.value) || 0), max);
                            const rounded = Math.floor(v / 100) * 100;
                            setPuntosInput(rounded);
                            const rate = loyaltyPreview.redeemRate || 100;
                            onLoyaltyRedemptionChange?.(Number((rounded / rate).toFixed(2)), rounded);
                          }}
                          onFocus={e => e.target.select()}
                          className="flex-1 py-1.5 px-2 border border-amber-300 rounded-xl text-sm font-black text-amber-800 bg-white outline-none focus:ring-2 focus:ring-amber-400/30 text-right"
                        />
                        <span className="text-[9px] text-amber-500 font-bold shrink-0">
                          / {(loyaltyPreview.maxPuntosRedimibles || 0).toLocaleString()} pts
                        </span>
                      </div>
                      {puntosInput > 0 && (
                        <div className="flex justify-between items-center bg-amber-100 rounded-xl px-2.5 py-1.5">
                          <span className="text-[10px] text-amber-700 font-bold">Descuento aplicado</span>
                          <span className="text-sm font-black text-amber-800">
                            -L {(puntosInput / (loyaltyPreview.redeemRate || 100)).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (loyaltyPreview.redeemMinPoints || 0) > 0 ? (
                <p className="text-[9px] text-amber-500">
                  Mínimo {(loyaltyPreview.redeemMinPoints || 0).toLocaleString()} pts para canjear
                  {(loyaltyPreview.puntosDisponibles || 0) > 0
                    ? ` — faltan ${Math.max(0, (loyaltyPreview.redeemMinPoints || 0) - (loyaltyPreview.puntosDisponibles || 0)).toLocaleString()} pts`
                    : ''}
                </p>
              ) : null}
            </div>
          )}

          {/* Totales */}
          {cartLength > 0 && (
            <div className="bg-slate-50 rounded-2xl p-3 space-y-1.5">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Subtotal exento</span><span>L {totals.exento.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Subtotal gravado</span><span>L {totals.gravado.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>ISV</span><span>L {totals.isv.toFixed(2)}</span>
              </div>
              {manualDiscount > 0 && (
                <div className="flex justify-between text-[10px] text-emerald-600 font-bold">
                  <span>Descuento</span><span>-L {manualDiscount.toFixed(2)}</span>
                </div>
              )}
              {loyaltyRedemptionLps > 0 && (
                <div className="flex justify-between text-[10px] text-amber-600 font-bold">
                  <span>★ Puntos de lealtad</span><span>-L {loyaltyRedemptionLps.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-end justify-between pt-1.5 border-t border-slate-200 mt-1.5">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total</span>
                <span className="text-2xl font-black text-indigo-600 leading-none">L {totals.total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {!cartLength && (
            <div className="flex items-end justify-between py-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</span>
              <span className="text-2xl font-black text-slate-200 leading-none">L 0.00</span>
            </div>
          )}

          {/* Método de pago */}
          {cartLength > 0 && paymentType === 'Contado' && (
            <div className="space-y-3">
              <div className="flex gap-1.5">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => onPaymentMethodChange(m.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-[11px] font-black transition-all ${
                      paymentMethod === m.id
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'bg-transparent border-slate-200 text-slate-400 hover:border-indigo-300'
                    }`}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>

              {paymentMethod === 'Efectivo' && (
                <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 w-20 shrink-0">Recibido</span>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">L</span>
                      <input
                        type="number"
                        min={0}
                        value={cashReceived || ''}
                        onChange={e => onCashReceivedChange(Math.max(0, Number(e.target.value)))}
                        onFocus={e => e.target.select()}
                        placeholder="0.00"
                        className="w-full pl-7 pr-2 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-400/30 text-right"
                      />
                    </div>
                  </div>
                  {change !== null && cashReceived > 0 && (
                    <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${change >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-center gap-1.5">
                        {change >= 0 && <CheckCircle size={13} className="text-emerald-500" />}
                        <span className="text-[11px] font-bold text-slate-600">Cambio</span>
                      </div>
                      <span className={`text-2xl font-black leading-none ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        L {Math.max(0, change).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'Mixto' && (
                <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Banknote size={13} className="text-slate-400 shrink-0" />
                    <span className="text-[10px] font-bold text-slate-500 w-16 shrink-0">Efectivo</span>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">L</span>
                      <input
                        type="number"
                        min={0}
                        max={totals.total}
                        value={mixtoEfectivo || ''}
                        onChange={e => onMixtoEfectivoChange(Math.min(totals.total, Math.max(0, Number(e.target.value))))}
                        onFocus={e => e.target.select()}
                        placeholder="0.00"
                        className="w-full pl-7 pr-2 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:ring-1 focus:ring-indigo-400/30 text-right"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <CreditCard size={12} />
                      <span className="font-bold">Tarjeta:</span>
                      <span className="font-black text-indigo-600">L {Math.max(0, mixtoTarjeta).toFixed(2)}</span>
                    </div>
                    {mixtoTarjeta < 0 && (
                      <span className="text-[10px] text-red-500 font-bold">Efectivo excede el total</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Checkout button */}
      <div className="space-y-2 px-4 pb-4 pt-3 border-t border-slate-100 shrink-0">
        <button
          type="button"
          onClick={onCreateQuote}
          disabled={!canCreateQuote}
          className="w-full py-3 border-2 border-indigo-100 bg-white hover:bg-indigo-50 disabled:bg-slate-50 disabled:border-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed text-indigo-600 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {isCreatingQuote ? (
            <><RefreshCw size={15} className="animate-spin" /> Generando cotización...</>
          ) : (
            <><FileText size={15} /> Generar cotización</>
          )}
        </button>
        <button
          onClick={onCheckout}
          disabled={!canCheckout}
          className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-2xl font-black text-sm transition-all active:scale-[0.98] shadow-lg shadow-indigo-200 disabled:shadow-none flex items-center justify-center gap-2"
        >
          {isCheckingOut ? (
            <><RefreshCw size={16} className="animate-spin" /> Procesando...</>
          ) : (
            <>
              <ShoppingCart size={16} />
              {canCheckout
                ? `Cobrar — L ${totals.total.toFixed(2)}`
                : (cartLength > 0 && !!selectedClientId && !canCharge)
                  ? 'Abre caja para cobrar'
                  : 'Selecciona cliente y productos'}
              {canCheckout && <span className="opacity-40 text-[10px] font-bold ml-1">F8</span>}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
