
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
  nombreUbicacion?: string;
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
  // Campos calculados o del vendedor para impresión
  nombreVendedor?: string; 
  direccionCliente?: string;
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
  fechaCierre?: string;
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

// --- CONFIGURACION EMPRESA (SAR) ---
export interface EmpresaConfig {
  id?: number;
  nombreEmpresa: string;
  rtn: string;
  direccion: string;
  telefono: string;
  correo: string;
  cai: string;
  rangoInicial: string;
  rangoFinal: string;
  fechaLimite: string;
  isv: number;
  mensajeFinal: string;
}

// --- CONTABILIDAD Y SOCIOS ---
export interface Socio {
  idSocio: number;
  nombre: string;
  porcentajeParticipacion: number;
  estado: EstadoGeneral;
  fechaIngreso?: string;
}

export interface GastoContable {
  idGasto: number;
  descripcion: string;
  monto: number;
  fecha: string;
  categoria: 'Operativo' | 'Administrativo' | 'Ventas' | 'Personal';
  idSocioAsignado?: number | null; // Null si es gasto de empresa, ID si es gasto personal de socio
  nombreSocio?: string;
  origenFondo: 'Caja' | 'Banco' | 'Tarjeta';
}

export interface ReporteFinanciero {
  periodo: string;
  ingresosVentas: number;
  costoVentas: number;
  utilidadBruta: number;
  gastosOperativos: number;
  utilidadNeta: number;
  distribucion: {
    socio: string;
    porcentaje: number;
    utilidadCorrespondiente: number;
    gastosPersonalesDeducidos: number;
    pagoFinal: number;
  }[];
}

// --- LABEL DESIGNER TYPES ---

export type ElementType = 'TEXT' | 'BARCODE' | 'QR' | 'IMAGE' | 'SHAPE' | 'DETAIL_TABLE';

export interface LabelElement {
  id: string;
  type: ElementType;
  x: number; // units (mm or cm)
  y: number; // units
  width: number; // units
  height: number; // units
  rotation: number; // degrees
  
  // Content & Variables
  content: string; // Puede contener texto estático y variables: "Precio: {{PRECIO}} {{MONEDA}}"
  variableField?: string; // DEPRECATED: Use content template string instead
  
  // Text Styling
  fontFamily?: string;
  fontSize?: number; // pt
  fontWeight?: string; // 'bold', 'normal'
  color?: string; // hex
  textAlign?: 'left' | 'center' | 'right';
  
  // Advanced Text Properties
  isMultiline?: boolean; // Permitir salto de línea
  lineHeight?: number; 
  isStretchWithOverflow?: boolean; // NUEVO: Si true, el elemento empuja a los de abajo
  
  // Shape/Image specific
  shapeType?: 'RECTANGLE' | 'LINE' | 'CIRCLE';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
  
  // Barcode specific
  barcodeFormat?: string; // 'CODE128', 'EAN13'
  displayValue?: boolean;
}

export interface LabelTemplate {
  id: string; // UUID
  name: string;
  
  // Strict Categories for Logic Separation
  category?: 'GENERAL' | 'TELEPHONE' | 'ACCESSORY' | 'INVOICE' | 'REPORT'; 
  type?: 'LABEL' | 'DOCUMENT'; // LABEL uses mm, DOCUMENT uses cm
  dataSource?: 'NONE' | 'TELEPHONES' | 'INVENTORY_ACCESSORIES' | 'SALES' | 'CLIENTS' | 'FULL_DB';
  
  isDefault: boolean;
  width: number; // units based on type
  height: number; // units based on type
  elements: LabelElement[];
  createdAt?: string;
}
