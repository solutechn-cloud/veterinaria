
// --- ENTIDADES BASE DE DATOS (Mapeo Estricto SQL) ---

export type EstadoGeneral = 'Activo' | 'Inactivo';
export type TipoCosto = 'Costo Directo' | 'Costo Indirecto';

// Tabla: usuarios
export interface Usuario {
  codUsuario: string; // PK
  usuario: string;
  password?: string;
  identidad: string; // FK empleado
  idCaja: string; // FK caja
  idrol: string; // FK roles
  foto?: string; // bytea in DB, string base64 here
  fechaCreacion?: string;
  fechaModificacion?: string;
  estado: EstadoGeneral;
  // UI Helpers
  nombreEmpleado?: string;
  nombreRol?: string;
  nombreCaja?: string;
}

// Tabla: empleado
export interface Empleado {
  identidad: string; // PK
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  estado: EstadoGeneral;
  fechaCreacion?: string;
  fechaModificacion?: string;
}

// Tabla: permisos
export interface Permiso {
  idPermiso: string;
  nombre: string;
  modulo: string;
}

// Tabla: roles
export interface Rol {
  idrol: string; // PK
  nombre: string;
  estado: EstadoGeneral;
  permisos?: string[]; // Lista de IDs de permisos asignados
}

// Tabla: caja
export interface Caja {
  idCaja: string; // PK
  nombre: string;
  estado: string;
}

// Tabla: clientes
export interface Cliente {
  identidad: string; // PK
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  correo?: string;
  fechaCreacion?: string;
  fechaModificacion?: string;
}

// Tabla: proveedores
export interface Proveedor {
  codProveedor: string; // PK
  nombre: string;
  telefono: string;
  direccion: string;
  fechaCreacion?: string;
  fechaModificacion?: string;
}

// Tabla: categoria
export interface Categoria {
  codCategoria: string; // PK
  tipo: string;
}

// Tabla: accesorios (Maestro)
export interface Accesorio {
  codAccesorio: string; // PK
  codCategoria: string; // FK
  descripcion: string;
  // UI Helper
  nombreCategoria?: string;
}

// Tabla: ubicacion
export interface Ubicacion {
  idUbicacion: string; // PK
  nombre: string;
  descripcion: string;
  estante: string;
  nivel: string;
  estado: string;
}

// Tabla: inventario (Stock de Accesorios)
export interface Inventario {
  codInventario: string; // PK
  codAccesorio: string; // FK
  cantidad: number;
  precioCompra: number;
  precioVenta: number;
  codProveedor: string; // FK
  fecha: string;
  idubicacion: string; // FK
  estado: string;
  // UI Helpers
  descripcionAccesorio?: string;
  nombreUbicacion?: string;
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
  fecha: string;
  idubicacion: string; // FK
  estado: string;
  // UI Helper
  nombreUbicacion?: string;
}

// Tabla: costos
export interface Costo {
  codCostos: string; // PK
  tipo: TipoCosto;
  descripcion: string;
  monto: number;
  estado: string;
}

// Tabla: arqueo
export interface Arqueo {
  idArqueo: string; // PK
  idCaja: string; // FK
  idUsuario: string; // FK
  fechaApertura: string;
  fechaCierre?: string;
  montoInicial: number;
  montoFinal?: number;
  totalVentas?: number;
  TotalGastos?: number;
  totalCostos?: number;
  ganancia?: number;
  estado: string;
}

// Tabla: ingresos
export interface Ingreso {
  idIngreso: string; // PK
  idCaja: string; // FK
  descripcion: string;
  monto: number;
  costo: number;
  fechaCreacion: string;
  estado: string;
  fechaModificacion?: number;
}

// Tabla: egresos
export interface Egreso {
  idegresos: string; // PK (Note lowercase 'd' in schema provided)
  idCaja: string; // FK
  descripcion: string;
  monto: number;
  fechaCreacion: string;
  estado: string;
  fechaModificacion?: string;
}

// Tabla: ventas
export interface Venta {
  codVenta: string; // PK
  fecha: string;
  codVendedor: string;
  identidadCliente: string; // FK
  total: number;
  estado: string;
  // UI Helpers
  nombreCliente?: string;
  nombreVendedor?: string;
}

// Tabla: detalleventa
export interface DetalleVenta {
  codDetalleVenta: string; // PK
  idVenta?: string; // FK (Optional during creation before save)
  idAccesorio?: string; // FK
  idTelefono?: string; // FK
  idIngreso?: string; 
  idInventario?: string; // Added for POS logic linkage
  cantidad: number;
  precioVenta: number;
  estado?: string;
  // UI Helpers
  descripcionProducto?: string;
  tipoProducto?: 'TELEFONO' | 'ACCESORIO' | 'SERVICIO';
}

// Tabla: recargas
export interface Recarga {
  idRecargas: string;
  red: string;
  tipo: string;
  descripcion: string;
  precioCobrado: number;
  precioPagado: number;
  estado: string;
}

// Tabla: saldos
export interface Saldo {
  idsaldos: string; // PK
  red: string;
  saldoInicio: number;
  saldoComprado?: number;
  saldoFinal?: number;
  fecha: string;
}

// --- UI / APP SPECIFIC ---

export interface UserSession {
  codUsuario: string;
  usuario: string;
  rol: string;
  nombreEmpleado: string;
  idCaja: string;
  permisos?: string[]; // IDs de permisos
}

export interface AuthResponse {
  token: string;
  user: UserSession;
}

export interface LoginCredentials {
  usuario: string;
  password: string; 
}

export interface ProductoUnified {
  id: string; // codInventario OR codigo
  tipo: 'TELEFONO' | 'ACCESORIO';
  nombre: string; 
  codigo: string; // Display Code
  precioVenta: number;
  stock: number;
  imei?: string; 
  ubicacion?: string;
}

export interface VentaPayload {
  identidadCliente: string;
  tipoCompra: 'Contado' | 'Credito'; 
  total: number;
  isv?: number;
  descuento?: number;
  detalles: Partial<DetalleVenta>[];
}