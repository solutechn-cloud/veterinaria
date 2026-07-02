import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Search, RefreshCw, Pill, Building2, LayoutGrid, List,
  AlertTriangle, Scan, ChevronRight, Info,
} from 'lucide-react';
import { ProductoFarmacia } from '../../types';
import { ISV_LABEL, ISV_COLORS } from './types';

interface Props {
  products: ProductoFarmacia[];
  isLoading: boolean;
  searchTerm: string;
  selectedCategory: string;
  onSearchChange: (v: string) => void;
  onCategoryChange: (c: string) => void;
  onProductClick: (p: ProductoFarmacia) => void;
  onReload: () => void;
  onBarcodeSearch?: (code: string) => void;
  onCrossSearch?: (query: string) => void;
}

type ViewMode = 'list' | 'grid';

function stockColor(stock: number) {
  if (stock > 20) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (stock >= 5) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-red-100 text-red-600 border-red-200';
}

function stockBarWidth(stock: number) {
  if (stock <= 0) return 0;
  if (stock >= 50) return 100;
  return Math.round((stock / 50) * 100);
}

function stockBarColor(stock: number) {
  if (stock > 20) return 'bg-emerald-400';
  if (stock >= 5) return 'bg-amber-400';
  return 'bg-red-400';
}

function ProductThumbnail({ url, base64, name }: { url?: string; base64?: string; name: string }) {
  const [imgError, setImgError] = useState(false);
  const src = base64
    ? (base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64.replace(/\s/g, '')}`)
    : url;

  if (!src || imgError) {
    return (
      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
        <Pill size={18} className="text-slate-300" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      onError={() => setImgError(true)}
      className="w-10 h-10 rounded-xl object-contain bg-white border border-slate-100 shrink-0"
    />
  );
}

// Tooltip para información adicional del medicamento
function InfoTooltip({ product }: { product: ProductoFarmacia }) {
  const [open, setOpen] = useState(false);
  const hasInfo = product.advertencias;
  if (!hasInfo) return null;
  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="p-1 text-slate-300 hover:text-indigo-400 transition-colors rounded"
      >
        <Info size={13} />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-56 bg-slate-800 text-white text-[11px] rounded-xl p-3 z-50 shadow-xl leading-relaxed">
          {product.advertencias && <p><span className="font-bold text-amber-400">Advertencias: </span>{product.advertencias}</p>}
          <div className="absolute right-2 bottom-0 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  );
}

export default function ProductCatalog({
  products, isLoading, searchTerm, selectedCategory,
  onSearchChange, onCategoryChange, onProductClick, onReload, onBarcodeSearch, onCrossSearch,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeRef = useRef<HTMLInputElement>(null);
  const searchRef  = useRef<HTMLInputElement>(null);

  // Expose searchRef for F2 shortcut from parent
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.categoria).filter(Boolean) as string[]);
    return ['Todos', ...Array.from(cats).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return products.filter(p => {
      const matchSearch = !term
        || p.nombreGenerico.toLowerCase().includes(term)
        || (p.nombreComercial || '').toLowerCase().includes(term)
        || p.codigo.toLowerCase().includes(term);
      const matchCat = selectedCategory === 'Todos' || p.categoria === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [products, searchTerm, selectedCategory]);

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      e.preventDefault();
      onBarcodeSearch?.(barcodeInput.trim());
      setBarcodeInput('');
    }
  };

  // ── List row ──────────────────────────────────────────────────────────────
  const renderListRow = (p: ProductoFarmacia) => (
    <div
      key={p.codigo}
      role="button"
      tabIndex={0}
      onClick={() => onProductClick(p)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onProductClick(p); } }}
      className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left active:scale-[0.99] cursor-pointer ${
        p.stock === 0
          ? 'bg-slate-50 border-slate-100 hover:border-orange-200 hover:bg-orange-50/50 opacity-80'
          : 'bg-white border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 hover:shadow-sm'
      }`}
    >
      <ProductThumbnail url={p.urlImagen} base64={p.imagenBase64} name={p.nombreGenerico} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className="font-bold text-slate-800 text-[12px] leading-snug truncate max-w-[180px] sm:max-w-xs">
            {p.nombreGenerico}{p.concentracion ? ` ${p.concentracion}` : ''}
          </span>
          {p.requiereReceta && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 shrink-0">RX</span>
          )}
          {p.esControlado && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700 shrink-0">CTRL</span>
          )}
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${ISV_COLORS[p.tipoIsv] || ''}`}>
            {ISV_LABEL[p.tipoIsv]}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {p.nombreComercial && (
            <span className="text-[10px] text-slate-400 truncate">{p.nombreComercial}</span>
          )}
          {p.formaFarmaceutica && (
            <span className="text-[10px] text-slate-300">· {p.formaFarmaceutica}</span>
          )}
        </div>

        {/* Mini stock bar */}
        {p.stock > 0 && (
          <div className="mt-1 flex items-center gap-1.5">
            <div className="w-14 h-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${stockBarColor(p.stock)}`}
                style={{ width: `${stockBarWidth(p.stock)}%` }}
              />
            </div>
            <span className={`text-[9px] font-black px-1 py-0.5 rounded border ${stockColor(p.stock)}`}>
              {p.stock} ud
            </span>
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        {p.stock === 0 ? (
          <div className="flex items-center gap-1 text-orange-500">
            <Building2 size={12} />
            <span className="text-[10px] font-bold">Otras sucs.</span>
          </div>
        ) : (
          <>
            <span className="font-black text-indigo-600 text-sm whitespace-nowrap">
              {p.presentaciones && p.presentaciones.length > 0
                ? `L ${Number(p.presentaciones[0].precio_venta).toFixed(2)}`
                : 'Sin precio'}
            </span>
            {p.presentaciones && p.presentaciones.length > 1 && (
              <span className="text-[9px] text-slate-400">+{p.presentaciones.length - 1} pres.</span>
            )}
          </>
        )}
        <div className="flex items-center gap-0.5">
          <InfoTooltip product={p} />
          <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-400 transition-colors" />
        </div>
      </div>
    </div>
  );

  // ── Grid card ─────────────────────────────────────────────────────────────
  const renderGridCard = (p: ProductoFarmacia) => (
    <button
      key={p.codigo}
      onClick={() => onProductClick(p)}
      className={`group flex flex-col p-3 border rounded-2xl cursor-pointer transition-all text-left active:scale-95 ${
        p.stock === 0
          ? 'bg-slate-50 border-slate-100 hover:border-orange-200 hover:bg-orange-50/50 opacity-75'
          : 'bg-white border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between mb-2 gap-1 w-full">
        <ProductThumbnail url={p.urlImagen} base64={p.imagenBase64} name={p.nombreGenerico} />
        <div className="flex flex-wrap gap-1 justify-end">
          {p.requiereReceta && <span className="text-[8px] font-black px-1 py-0.5 rounded bg-orange-100 text-orange-700">RX</span>}
          {p.esControlado   && <span className="text-[8px] font-black px-1 py-0.5 rounded bg-red-100 text-red-700">CTRL</span>}
        </div>
      </div>

      <p className="font-bold text-slate-800 text-[11px] leading-snug line-clamp-2 mb-0.5 flex-1">
        {p.nombreGenerico}{p.concentracion ? ` ${p.concentracion}` : ''}
      </p>
      {p.nombreComercial && (
        <p className="text-[9px] text-slate-400 truncate mb-1">{p.nombreComercial}</p>
      )}

      <div className="mt-auto pt-2 border-t border-slate-100 w-full flex items-center justify-between">
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${ISV_COLORS[p.tipoIsv] || ''}`}>
          {ISV_LABEL[p.tipoIsv]}
        </span>
        {p.stock === 0 ? (
          <span className="text-[9px] font-bold text-orange-600 flex items-center gap-0.5"><Building2 size={9} />Otras sucs.</span>
        ) : (
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${stockColor(p.stock)}`}>{p.stock} ud</span>
        )}
      </div>
      <span className="font-black text-indigo-600 text-[12px] mt-1">
        {p.presentaciones && p.presentaciones.length > 0
          ? `L ${Number(p.presentaciones[0].precio_venta).toFixed(2)}`
          : 'Sin precio'}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 min-h-0">

      {/* ── Barra de escaneo ── */}
      <div className="px-3 pt-3 shrink-0">
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
          <Scan size={15} className="text-indigo-400 shrink-0" />
          <input
            ref={barcodeRef}
            type="text"
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            onKeyDown={handleBarcodeKeyDown}
            placeholder="Escanear código de barras / EAN — Enter para agregar"
            className="flex-1 bg-transparent text-sm font-medium text-indigo-800 placeholder-indigo-300 outline-none"
          />
          {barcodeInput && (
            <button onClick={() => setBarcodeInput('')} className="text-indigo-300 hover:text-indigo-500 text-xs font-bold">✕</button>
          )}
        </div>
      </div>

      {/* ── Search + controls ── */}
      <div className="px-3 pt-2 pb-2 border-b border-slate-100 space-y-2 shrink-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar por genérico, comercial… (F2)"
              value={searchTerm}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-300 transition-all"
            />
          </div>
          {/* View toggle */}
          <div className="flex bg-slate-100 rounded-xl p-0.5 shrink-0">
            <button
              onClick={() => setViewMode('list')}
              title="Vista lista"
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Vista cuadrícula"
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
          <button
            onClick={onReload}
            title="Recargar productos"
            className="p-2 bg-slate-100 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-all active:scale-95 shrink-0"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Categorías */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`shrink-0 px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conteo ── */}
      {!isLoading && products.length > 0 && (
        <div className="px-3 py-1.5 shrink-0 border-b border-slate-50">
          <p className="text-[10px] text-slate-400 font-medium">
            {filteredProducts.length} de {products.length} productos
            {searchTerm && <> · "<span className="text-indigo-500 font-bold">{searchTerm}</span>"</>}
          </p>
        </div>
      )}

      {/* ── Producto list/grid ── */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {isLoading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-300">
            <RefreshCw size={28} className="animate-spin text-indigo-400" />
            <p className="text-sm font-medium text-slate-400">Cargando productos...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-300 gap-2 px-4">
            <Pill size={36} strokeWidth={1.5} />
            <p className="text-sm font-bold text-slate-400">Sin resultados locales</p>
            {searchTerm && (
              <button onClick={() => onSearchChange('')} className="text-xs text-slate-400 underline font-medium">
                Limpiar búsqueda
              </button>
            )}
            {searchTerm && onCrossSearch && (
              <button
                onClick={() => onCrossSearch(searchTerm)}
                className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black transition-all active:scale-95 shadow-sm shadow-orange-200"
              >
                <Building2 size={14} /> Buscar en otras sucursales
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-1">
            {filteredProducts.map(renderListRow)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
            {filteredProducts.map(renderGridCard)}
          </div>
        )}
      </div>
    </div>
  );
}
