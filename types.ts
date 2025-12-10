// Mapped strictly from PostgreSQL Schema

// --- ENUMS & CONSTANTS ---
export type EstadoGeneral = 'Activo' | 'Inactivo';
export type EstadoVenta = 'Completada' | 'Anulada' | 'Devolucion';
export type TipoProducto = 'TELEFONO' | 'ACCESORIO' | 'RECARGA';

// --- AUTH & PERMISSIONS ---

export interface AuthResponse {
  token: string;
  user: UserSession;
}

export interface UserSession {
  codUsuario: string;
  usuario: string;
  rol: string; // 'ADMIN', 'VENDEDOR', etc.
  nombreEmpleado: string;
}

export interface LoginCredentials {
  usuario: string;
  password: string; 
}

// --- CORE ENTITIES ---

export interface Cliente {
  identidad: string; // PK
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  correo?: string;
  fechaCreacion: string;
}

export interface Empleado {
  identidad: string; // PK
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  estado: EstadoGeneral;
  fechaCreacion?: string;
}

// Extendido para incluir datos visuales en la tabla de admin
export interface Usuario {
  codUsuario: string; // PK
  usuario: string;
  password?: string; // Solo para creación/update
  identidad: string; // FK -> Empleado
  idCaja: string; // FK -> Caja
  idrol: string; // FK -> Rol
  estado: EstadoGeneral;
  // UI Helpers
  nombreEmpleado?: string;
  nombreRol?: string;
}

export interface Rol {
  idrol: string;
  nombre: string;
  estado: EstadoGeneral;
}

// --- INVENTORY ---

export interface Categoria {
  codCategoria: string; // PK
  tipo: string;
}

export interface Proveedor {
  codProveedor: string; // PK
  nombre: string;
  telefono: string;
  direccion: string;
}

export interface Ubicacion {
  idUbicacion: string; // PK
  nombre: string;
  descripcion: string;
  estante: string;
  nivel: string;
  estado: EstadoGeneral;
}

// Tabla: telefonos
export interface Telefono {
  codigo: string; // PK
  imei1: string;
  imei2: string;
  marca: string;
  modelo: string;
  precioCompra: number;
  precioVenta: number;
  codProveedor: string; // FK
  idubicacion: string; // FK
  estado: 'Disponible' | 'Vendido' | 'Garantia' | 'Malo';
  fecha: string;
}

// Tabla: accesorios (Master data)
export interface Accesorio {
  codAccesorio: string; // PK
  codCategoria: string; // FK
  descripcion: string;
}

// Tabla: inventario (Stock for accessories)
export interface InventarioAccesorio {
  codInventario: string; // PK
  codAccesorio: string; // FK
  cantidad: number;
  precioCompra: number;
  precioVenta: number;
  codProveedor: string; // FK
  idubicacion: string; // FK
  estado: EstadoGeneral;
  fecha: string;
}

// Helper Type for UI (Unified View)
export interface ProductoUnified {
  id: string; // codAccesorio OR codigo (telefono)
  tipo: TipoProducto;
  nombre: string; // descripcion OR marca + modelo
  codigo: string;
  precioVenta: number;
  stock: number;
  imei?: string; // Only phones
  ubicacion?: string;
  categoria?: string;
}

// --- SALES / POS ---

export interface Venta {
  codVenta: string; // PK
  fecha: string;
  codVendedor: string;
  identidadCliente: string;
  total: number;
  estado: EstadoVenta;
  // UI helper: details are usually fetched separately or included
  detalles?: DetalleVenta[]; 
}

export interface DetalleVenta {
  codDetalleVenta: string; // PK
  idVenta: string; // FK
  idAccesorio?: string; // Nullable
  idTelefono?: string; // Nullable
  cantidad: number;
  precioVenta: number;
  estado: EstadoGeneral;
  // UI Helper
  descripcionProducto?: string;
}

export interface Recarga {
  idRecargas: string;
  red: string; // Tigo/Claro
  tipo: string;
  descripcion: string;
  precioCobrado: number;
  precioPagado: number;
  estado: string;
}

// --- CASH REGISTER & FINANCE ---

export interface Caja {
  idCaja: string; // PK
  nombre: string;
  estado: EstadoGeneral;
}

export interface Arqueo {
  idArqueo: string; // PK
  idCaja: string;
  idUsuario: string;
  fechaApertura: string;
  fechaCierre?: string;
  montoInicial: number;
  montoFinal?: number;
  totalVentas?: number;
  totalGastos?: number;
  totalCostos?: number;
  ganancia?: number;
  estado: 'Abierta' | 'Cerrada';
}

export interface Ingreso {
  idIngreso: string; // PK
  idCaja: string;
  descripcion: string;
  monto: number;
  costo: number; // Costo asociado al ingreso
  fechaCreacion: string;
  estado: string;
}

export interface Egreso {
  idegresos: string; // PK
  idCaja: string;
  descripcion: string;
  monto: number;
  fechaCreacion: string;
  estado: string;
}

export interface Configuracion {
  codConfiguracion: number;
  nombreEmpresa: string;
  rtn: string;
  isv: number;
  direccion: string;
}