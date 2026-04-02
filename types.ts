

export type EstadoGeneral = 'Activo' | 'Inactivo' | 'Disponible' | 'Vendido' | 'Completada' | 'Anulada' | 'Cerrada' | 'Registrado' | 'Garantia' | 'Defectuoso';

// Clasificación unificada para compatibilidad con DB
export type SubtipoIngreso = 'Venta' | 'Reparacion' | 'Recarga' | 'KrediYa_Prima' | 'Cobros Venta a Negocios Externos' | 'Cobro Consignacion' | 'Ajuste Utilidad Cambio';
export type SubtipoEgreso = 'Gasto Operativo' | 'Retiro Personal' | 'Pago Servicio de Reparación' | 'Pago Inventario Externo' | 'Nomina' | 'Compra Saldo' | 'Compra Inventario' | 'Pago a Tecnico' | 'Pago a Tienda Externa' | 'Perdida Margen Garantia';

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

export interface Proveedor {
  codProveedor: string;
  nombre: string;
  telefono: string;
  direccion: string;
  fechaCreacion?: string;
}

export interface Telefono {
  codigo: string;
  imei1: string;
  imei2: string;
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
  tipo: 'TELEFONO' | 'ACCESORIO' | 'SERVICIO';
  nombre: string;
  codigo: string;
  precioVenta: number;
  /* Added precioCompra to ProductoUnified interface */
  precioCompra: number;
  stock: number;
  imei?: string;
  ubicacion: string;
  marca?: string;
  categoria?: string;
}

export interface Venta {
  codVenta: string;
  fecha: string;
  codVendedor?: string;
  identidadCliente: string;
  nombreCliente?: string;
  total: number;
  estado: EstadoGeneral;
  tipoCompra: 'Contado' | 'Credito' | 'KrediYa';
  isv?: number;
  descuento?: number;
  montoPrima?: number;
  montoFinanciado?: number;
  detalles?: DetalleVenta[];
  nombreVendedor?: string; 
  direccionCliente?: string;
  estado_pago_financiera?: string;
}

export interface VentaPayload {
  identidadCliente: string;
  tipoCompra: 'Contado' | 'Credito' | 'KrediYa'; 
  total: number;
  isv?: number;
  descuento?: number;
  montoPrima?: number;
  montoFinanciado?: number;
  detalles: Partial<DetalleVenta>[];
  fecha?: string;
}

export interface DetalleVenta {
  codDetalleVenta?: string;
  idVenta?: string;
  idAccesorio?: string;
  idTelefono?: string;
  idInventario?: string; 
  idIngreso?: string;
  cantidad: number;
  precioVenta: number;
  // Fix: Added precioCompra property to match backend response and usage in components
  precioCompra?: number;
  descripcionProducto?: string;
  tipoProducto?: 'TELEFONO' | 'ACCESORIO' | 'SERVICIO';
  estado?: EstadoGeneral;
}

export interface Reparacion {
  id_reparacion: number;
  identidad_cliente?: string;
  nombre_cliente?: string;
  descripcion_falla: string;
  imei_equipo?: string;
  marca: string;
  modelo: string;
  marca_modelo?: string; // Legacy
  complementos?: string; // Cargador, cobertor, etc.
  costo_tecnico: number;
  precio_cliente: number;
  nombre_tecnico: string;
  estado_reparacion: 'Pendiente' | 'En Taller' | 'Listo' | 'Entregado';
  pago_tecnico_estado: 'Pendiente' | 'Pagado';
  fecha_ingreso: string;
  fecha_entrega_estimada?: string;
}

export interface Garantia {
  id_garantia: number;
  cod_venta: string;
  id_producto_original: string;
  tipo_producto: 'TELEFONO' | 'ACCESORIO';
  falla_reportada: string;
  // Fix: Added 'Entregado' to possible status values to match component logic
  estado_garantia: 'Pendiente' | 'En Taller' | 'Proveedor' | 'Listo' | 'Cambiado' | 'Entregado';
  fecha_ingreso: string;
  fecha_resolucion?: string;
  costo_original: number;
  precio_venta_original: number;
  observaciones?: string;
  identidad_cliente: string;
  nombre_cliente?: string;
  // Fix: Added dispositivo_nombre to match backend response
  dispositivo_nombre?: string;
}

export interface Consignacion {
  id_consignacion: number;
  id_producto: string;
  tipo_producto: 'TELEFONO' | 'ACCESORIO';
  negocio_destino: string;
  cantidad_prestada: number;
  precio_especial_pago: number;
  estado_consignacion: 'Prestado' | 'Vendido_Pagado' | 'Devuelto';
  fecha_salida: string;
  fecha_limite?: string;
  nombre_producto?: string;
  codigo_referencia?: string;
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
  saldoTigoFinal?: number;
  saldoClaroFinal?: number;
  totalCostos?: number;
  TotalGastos?: number;
}

export interface Ingreso {
  idIngreso: string;
  idCaja: string;
  descripcion: string;
  monto: number;
  costo: number;
  fechaCreacion?: string;
  estado: string;
  subtipo_movimiento?: SubtipoIngreso;
}

export interface Egreso {
  idegresos: string;
  idCaja: string;
  descripcion: string;
  monto: number;
  fechaCreacion?: string;
  estado: string;
  categoria?: string;
  subtipo_egreso?: SubtipoEgreso;
  id_socio_asignado?: number | null;
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

export interface Socio {
  idSocio: number;
  nombre: string;
  porcentajeParticipacion: number;
  estado: EstadoGeneral;
  fechaIngreso?: string;
}

export interface EmpresaConfig {
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

export type TipoCosto = 'Costo Directo' | 'Costo Indirecto';

export interface Costo {
  codCostos: string;
  tipo: TipoCosto;
  descripcion: string;
  monto: number;
  estado: EstadoGeneral;
}

export interface InvoiceColumn {
  id: string;
  header: string;
  field: string;       // e.g. "{{item.descripcion}}"
  widthPct: number;    // percentage of total width (0-100)
  align: 'left' | 'center' | 'right';
  format: 'TEXT' | 'CURRENCY' | 'NUMBER';
}

export interface SummaryRow {
  id: string;
  label: string;
  field: string;       // e.g. "{{venta.total}}" or static text
  format: 'TEXT' | 'CURRENCY' | 'NUMBER';
  bold?: boolean;
  separator?: boolean; // render a horizontal line above this row
}

export interface LabelElement {
  id: string;
  type: 'TEXT' | 'BARCODE' | 'QR' | 'IMAGE' | 'SHAPE' | 'INVOICE_TABLE' | 'SUMMARY_BOX' | 'COMPANY_HEADER';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  content: string;
  fontSize?: number;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  fontWeight?: string;
  fontFamily?: string;
  barcodeFormat?: string;
  displayValue?: boolean;
  shapeType?: 'RECTANGLE' | 'CIRCLE' | 'LINE';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  isMultiline?: boolean;
  isStretchWithOverflow?: boolean;
  // Text extra
  italic?: boolean;
  underline?: boolean;
  lineHeight?: number;
  letterSpacing?: number;
  backgroundColor?: string;
  // Shape extra
  borderRadius?: number;
  // All elements
  opacity?: number;
  // INVOICE_TABLE specific
  tableColumns?: InvoiceColumn[];
  tableHeaderBg?: string;
  tableHeaderColor?: string;
  tableRowHeight?: number;
  tableAlternateRows?: boolean;
  tableAlternateBg?: string;
  tableBorderColor?: string;
  tableFontSize?: number;
  // SUMMARY_BOX specific
  summaryRows?: SummaryRow[];
  summaryBg?: string;
  summaryLabelColor?: string;
  summaryValueColor?: string;
  summaryFontSize?: number;
  // COMPANY_HEADER specific
  companyShowRTN?: boolean;
  companyShowPhone?: boolean;
  companyShowEmail?: boolean;
  companyAlign?: 'left' | 'center' | 'right';
  companyStyle?: 'PLAIN' | 'GEOMETRIC';
  companyDocTitle?: string;
}

export interface LabelTemplate {
  id: string;
  name: string;
  category?: string;
  type?: 'LABEL' | 'DOCUMENT';
  dataSource?: string;
  isDefault: boolean;
  width: number;
  height: number;
  elements: LabelElement[];
  margins?: { top: number; bottom: number; left: number; right: number };
  backgroundColor?: string;
  snapEnabled?: boolean;
  gridSize?: number;
  showGrid?: boolean;
}

export interface GastoContable {
  idGasto: string;
  descripcion: string;
  monto: number;
  fecha: string;
  categoria: string;
}

export interface ReporteFinanciero {
  ventasBrutas: number;
  costoVentas: number;
  utilidadBruta: number;
  gastosOperativos: number;
  utilidadNeta: number;
}

export interface ComponenteCosto {
  id: string;
  nombre: string;
  monto: number;
}

export interface CostoProducto {
  codProducto: string;
  costoUnitario: number;
  margenUtilidad: number;
}

export interface PresupuestoMensual {
  mes: string;
  anio: number;
  montoEstimado: number;
  montoReal: number;
}

export interface DailyTrackingRow {
  fecha: string;
  ingresos: number;
  egresos: number;
  balance: number;
}

export interface PnLRow {
  concepto: string;
  monto: number;
  porcentaje: number;
}
