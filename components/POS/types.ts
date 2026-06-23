import { ProductoFarmacia } from '../../types';

export interface CartItem {
  key: string;
  id_medicamento: string;
  id_presentacion: number;
  id_servicio?: number;
  nombre: string;
  cantidad: number;
  precioVenta: number;
  precioTerceraEdad?: number;
  tipoIsv: 'exento' | '15' | '18';
  tipoProducto?: 'MEDICAMENTO' | 'SERVICIO';
  requiereReceta: boolean;
  esControlado: boolean;
  stock: number;
  id_sucursal_origen?: number;
  sucursal_nombre_origen?: string;
}

export interface HeldCart {
  id: string;
  clienteNombre: string;
  items: CartItem[];
  discount: number;
  discountType: 'L' | '%';
  paymentType: 'Contado' | 'Credito';
  savedAt: Date;
}

export type PaymentMethod = 'Efectivo' | 'Tarjeta' | 'Mixto';
export type DiscountType = 'L' | '%';

export interface PresentacionModalState {
  product: ProductoFarmacia;
  visible: boolean;
  selectedId: number | null;
}

export interface CrossBranchModalState {
  visible: boolean;
  product: ProductoFarmacia | null;
  branches: any[];
  loading: boolean;
}

export interface CartTotals {
  exento: number;
  gravado: number;
  bruto: number;
  descuento: number;
  isv: number;
  total: number;
}

export const ISV_LABEL: Record<string, string> = { exento: 'Exento', '15': 'ISV 15%', '18': 'ISV 18%' };
export const ISV_COLORS: Record<string, string> = {
  exento: 'bg-emerald-50 text-emerald-700',
  '15': 'bg-amber-50 text-amber-700',
  '18': 'bg-orange-50 text-orange-700',
};
