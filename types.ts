export type EstadoGeneral = 'Activo' | 'Inactivo' | 'Disponible' | 'Vendido' | 'Completada' | 'Anulada' | 'Cerrada' | 'Registrado';

export interface Usuario {
  codUsuario: string;
  usuario: string;
  password?: string;
  identidad: string;
  idCaja: string;
  idrol: string;
  estado: EstadoGeneral;
  nombreEmpleado?: string;
  nombreRol?: string;
  permisos?: string[];
}

export interface UserSession extends Usuario {
  rol: string;
}

export interface LoginCredentials {
  usuario: string;
  password?: string;
}

export interface AuthResponse {
  token: string;
  user: UserSession;
}

export interface Empleado {
  identidad: string;
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  estado: EstadoGeneral;
  fechaCreacion?: string;
}

export interface Rol {
  idrol: string;
  nombre: string;
  estado: EstadoGeneral;
  permisos?: string[];
}

export interface Permiso {
  idPermiso: string;
  nombre: string;
  modulo: string;
}

export interface Caja {
  idCaja: string;
  nombre: string;
  estado: 'Activo' | 'Inactivo';
}

export interface Cliente {
  identidad: string;
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  correo?: string;
  fechaCreacion?: string;
}

export interface Proveedor {
  codProveedor: string;
  nombre: string;
  telefono: string;
  direccion: string;
}

export interface Categoria {
  codCategoria: string;
  tipo: string;
}

export interface Ubicacion {
  idUbicacion: string;
  nombre: string;
  descripcion: string;
  estante: string;
  nivel: string;
  estado: EstadoGeneral;
}

export interface Telefono {
  codigo: string;
  imei1: string;
  imei2?: string;
  marca: string;
  modelo: string;
  precioCompra: number;
  precioVenta: number;
  codProveedor: string;
  idubicacion: string;
  estado: EstadoGeneral;
  fecha: string;
}

export interface Accesorio {
  codAccesorio: string;
  codCategoria: string;
  descripcion: string;
  nombreCategoria?: string;
}

export interface Inventario {
  codInventario: string;
  codAccesorio: string;
  cantidad: number;
  precioCompra: number;
  precioVenta: number;
  codProveedor: string;
  idubicacion: string;
  estado: EstadoGeneral;
  fecha: string;
  descripcionAccesorio?: string;
  categoriaAccesorio?: string;
  nombreUbicacion?: string;
}

export interface ProductoUnified {
  id: string;
  tipo: 'TELEFONO' | 'ACCESORIO';
  nombre: string;
  codigo: string;
  precioVenta: number;
  stock: number;
  imei?: string;
  ubicacion: string;
}

export interface DetalleVenta {
  codDetalleVenta?: string;
  idVenta?: string;
  idAccesorio?: string;
  idTelefono?: string;
  idInventario?: string; // Helper for frontend
  idIngreso?: string;
  cantidad: number;
  precioVenta: number;
  descripcionProducto?: string;
  tipoProducto?: 'TELEFONO' | 'ACCESORIO' | 'SERVICIO';
  estado?: EstadoGeneral;
}

export interface Venta {
  codVenta: string;
  fecha: string;
  codVendedor?: string;
  identidadCliente: string;
  nombreCliente?: string;
  total: number;
  estado: EstadoGeneral;
  tipoCompra: 'Contado' | 'Credito';
  isv?: number;
  descuento?: number;
  detalles?: DetalleVenta[];
}

export interface VentaPayload {
  identidadCliente: string;
  tipoCompra: 'Contado' | 'Credito'; 
  total: number;
  isv?: number;
  descuento?: number;
  detalles: Partial<DetalleVenta>[];
  fecha?: string;
}

export interface Arqueo {
  idArqueo: string;
  idCaja: string;
  idUsuario: string;
  fechaApertura: string;
  montoInicial: number;
  montoFinal?: number;
  estado: 'Activo' | 'Cerrada';
  totalVentas?: number;
  ganancia?: number;
}

export interface Ingreso {
  idIngreso: string;
  idCaja: string;
  descripcion: string;
  monto: number;
  costo: number;
  fechaCreacion?: string;
  estado: string;
}

export interface Egreso {
  idegresos: string;
  idCaja: string;
  descripcion: string;
  monto: number;
  fechaCreacion?: string;
  estado: string;
}

export interface Saldo {
  idsaldos: string;
  red: 'TIGO' | 'CLARO';
  saldoInicio: number;
  saldoComprado: number;
  saldoFinal: number;
  fecha: string;
}

export interface Paquete {
  idPaquete: string;
  red: 'TIGO' | 'CLARO';
  nombre: string;
  precio: number;
  costo: number;
  estado: EstadoGeneral;
}

export type TipoCosto = 'Costo Directo' | 'Costo Indirecto';

export interface Costo {
  codCostos: string;
  tipo: TipoCosto;
  descripcion: string;
  monto: number;
  estado: EstadoGeneral;
}

// --- LABEL DESIGNER TYPES ---

export type ElementType = 'TEXT' | 'BARCODE' | 'QR' | 'IMAGE' | 'SHAPE';

export interface LabelElement {
  id: string;
  type: ElementType;
  x: number; // mm
  y: number; // mm
  width: number; // mm
  height: number; // mm
  rotation: number; // degrees
  content: string; // Text content or Image Base64
  
  // Style properties
  fontFamily?: string;
  fontSize?: number; // pt
  fontWeight?: string; // 'bold', 'normal'
  color?: string; // hex
  textAlign?: 'left' | 'center' | 'right';
  
  // Shape/Image specific
  shapeType?: 'RECTANGLE' | 'LINE';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  
  // Barcode specific
  barcodeFormat?: string; // 'CODE128', 'EAN13'
  displayValue?: boolean;
  
  // Variable binding (e.g., 'product_name', 'price')
  variableField?: string; 
}

export interface LabelTemplate {
  id: string; // UUID
  name: string;
  isDefault: boolean;
  width: number; // mm
  height: number; // mm
  elements: LabelElement[];
  createdAt?: string;
}