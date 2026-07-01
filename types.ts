

export type EstadoGeneral = 'Activo' | 'Inactivo' | 'Disponible' | 'Vendido' | 'Completada' | 'Anulada' | 'Cerrada' | 'Registrado' | 'Garantia' | 'Defectuoso';

export interface Usuario {
  codUsuario: string;
  usuario: string;
  password?: string;
  identidad: string;
  idCaja: string;
  idrol: string;
  estado: EstadoGeneral;
  id_sucursal?: number;
  sucursal_nombre?: string;
  nombreEmpleado?: string;
  nombreRol?: string;
  permisos?: string[];
}

export interface UserSession extends Usuario {
  rol: string;
  tenantId?: string;
  tenantSlug?: string;
  isSuperAdmin?: boolean;
  tenantPlan?: 'basico' | 'profesional' | 'enterprise';
  planFeatures?: string[];
}

export type PlanFeatureKey =
    | 'modulo_pos' | 'modulo_medicamentos' | 'modulo_clientes' | 'modulo_caja'
    | 'modulo_config' | 'ia_basica' | 'modulo_lealtad'
    | 'modulo_ordenes_compra' | 'modulo_vencimientos' | 'modulo_proveedores'
    | 'modulo_contabilidad' | 'modulo_etiquetas' | 'reportes_exportar' | 'ia_avanzada'
    | 'modulo_sucursales' | 'modulo_transferencias' | 'modulo_entregas' | 'modulo_panel_cajas'
    | 'modulo_pacientes' | 'modulo_citas' | 'modulo_expediente' | 'modulo_consultorio' | 'modulo_recordatorios'
    | 'modulo_vacunas' | 'modulo_hospitalizacion';

export const PERMISSIONS = {
    VER_POS: 'VER_POS', VER_CLIENTES: 'VER_CLIENTES', VER_INVENTARIO: 'VER_INVENTARIO',
    VER_LEALTAD: 'VER_LEALTAD', VER_CAJA: 'VER_CAJA',
    VER_CONTABILIDAD: 'VER_CONTABILIDAD', VER_REPORTES: 'VER_REPORTES',
    VER_PROVEEDORES: 'VER_PROVEEDORES', VER_ADMIN: 'VER_ADMIN',
    GESTIONAR_USUARIOS: 'GESTIONAR_USUARIOS', GESTIONAR_ROLES: 'GESTIONAR_ROLES',
    GESTIONAR_PANEL_CAJAS: 'GESTIONAR_PANEL_CAJAS', CONFIGURAR_EMPRESA: 'CONFIGURAR_EMPRESA',
    DISEÑAR_ETIQUETAS: 'DISEÑAR_ETIQUETAS',
    ANULAR_VENTA: 'ANULAR_VENTA', GESTIONAR_CAJA: 'GESTIONAR_CAJA',
    ELIMINAR_MEDICAMENTO: 'ELIMINAR_MEDICAMENTO', CONFIGURAR_LEALTAD: 'CONFIGURAR_LEALTAD',
    AJUSTAR_PUNTOS_LEALTAD: 'AJUSTAR_PUNTOS_LEALTAD',
    EXPORTAR_REPORTES: 'EXPORTAR_REPORTES',
    VER_PACIENTES: 'VER_PACIENTES', GESTIONAR_PACIENTES: 'GESTIONAR_PACIENTES',
    VER_CITAS: 'VER_CITAS', GESTIONAR_CITAS: 'GESTIONAR_CITAS',
    VER_FLOWBOARD: 'VER_FLOWBOARD',
    VER_EXPEDIENTE: 'VER_EXPEDIENTE', EDITAR_EXPEDIENTE: 'EDITAR_EXPEDIENTE',
    VER_CONSULTORIO: 'VER_CONSULTORIO', GESTIONAR_CONSULTORIO: 'GESTIONAR_CONSULTORIO',
    VER_VACUNAS: 'VER_VACUNAS', GESTIONAR_VACUNAS: 'GESTIONAR_VACUNAS',
    VER_AGENDA_PERSONAL: 'VER_AGENDA_PERSONAL',
    VER_DISPONIBILIDAD_AGENDA: 'VER_DISPONIBILIDAD_AGENDA',
    GESTIONAR_DISPONIBILIDAD: 'GESTIONAR_DISPONIBILIDAD',
    VER_SERVICIOS_VET: 'VER_SERVICIOS_VET', GESTIONAR_SERVICIOS_VET: 'GESTIONAR_SERVICIOS_VET',
    VER_RECORDATORIOS: 'VER_RECORDATORIOS', GESTIONAR_RECORDATORIOS: 'GESTIONAR_RECORDATORIOS',
    GESTIONAR_INVENTARIO: 'GESTIONAR_INVENTARIO',
    VER_VENCIMIENTOS: 'VER_VENCIMIENTOS',
    VER_ORDENES_COMPRA: 'VER_ORDENES_COMPRA', GESTIONAR_ORDENES_COMPRA: 'GESTIONAR_ORDENES_COMPRA',
    VER_TRANSFERENCIAS: 'VER_TRANSFERENCIAS', GESTIONAR_TRANSFERENCIAS: 'GESTIONAR_TRANSFERENCIAS',
    VER_ENTREGAS: 'VER_ENTREGAS', GESTIONAR_ENTREGAS: 'GESTIONAR_ENTREGAS',
    VER_SUCURSALES: 'VER_SUCURSALES', GESTIONAR_SUCURSALES: 'GESTIONAR_SUCURSALES',
    VER_PANEL_CAJAS: 'VER_PANEL_CAJAS', GESTIONAR_CAJAS: 'GESTIONAR_CAJAS',
    VER_AUTOMATIZACIONES: 'VER_AUTOMATIZACIONES', GESTIONAR_AUTOMATIZACIONES: 'GESTIONAR_AUTOMATIZACIONES',
    VER_BACKUPS: 'VER_BACKUPS', GESTIONAR_BACKUPS: 'GESTIONAR_BACKUPS',
    VER_IA_CUOTAS: 'VER_IA_CUOTAS',
} as const;

export interface LoginCredentials {
  usuario: string;
  password?: string;
  tenantSlug?: string;
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
  id_sucursal?: number;
  sucursal_nombre?: string;
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
  id_sucursal?: number;
  sucursal_nombre?: string;
}

export interface Cliente {
  identidad: string;
  nombre: string;
  apellido: string;
  direccion: string;
  telefono: string;
  correo?: string;
  tipo_identificacion?: 'identidad' | 'telefono';
  sin_correo?: boolean;
  ciudad_municipio?: string;
  departamento?: string;
  contacto_autorizado_nombre?: string;
  contacto_autorizado_telefono?: string;
  telefono_alternativo?: string;
  fechaCreacion?: string;
}

export interface Proveedor {
  codProveedor: string;
  nombre: string;
  telefono: string;
  direccion: string;
  fechaCreacion?: string;
}

export interface Venta {
  codVenta: string;
  numeroFactura?: string;
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
  clientMutationId?: string;
}

export interface DetalleVenta {
  codDetalleVenta?: string;
  idVenta?: string;
  idInventario?: string;
  idIngreso?: string;
  cantidad: number;
  precioVenta: number;
  // Fix: Added precioCompra property to match backend response and usage in components
  precioCompra?: number;
  descripcionProducto?: string;
  tipoProducto?: 'SERVICIO' | 'MEDICAMENTO';
  estado?: EstadoGeneral;
  // Pharmacy fields
  id_medicamento?: string;
  id_presentacion?: number;
  id_servicio?: number;
  tipoIsv?: 'exento' | '15' | '18';
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
  facturaCorrelativoActual?: number;
  isv: number;
  mensajeFinal: string;
  logoBase64?: string;
  adminEmail?: string;
  emailFrom?: string;
  automationSenderName?: string;
  backupR2Prefix?: string;
  backupRetentionDays?: number;
  backupEnabled?: boolean;
  backupTime?: string;
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
  type: 'TEXT' | 'BARCODE' | 'QR' | 'IMAGE' | 'SHAPE' | 'INVOICE_TABLE' | 'SUMMARY_BOX' | 'COMPANY_HEADER' | 'RECEIPT_ITEMS';
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
  shapeType?: 'RECTANGLE' | 'CIRCLE' | 'LINE' | 'TRIANGLE_TL' | 'TRIANGLE_TR' | 'TRIANGLE_BL' | 'TRIANGLE_BR' | 'RHOMBUS';
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
  // Shape gradient
  gradientEnabled?: boolean;
  gradientType?: 'linear' | 'radial';
  gradientColor1?: string;
  gradientColor2?: string;
  gradientAngle?: number;
  // Image
  imageObjectFit?: 'contain' | 'cover' | 'fill' | 'none';
  qrFgColor?: string;
  qrBgColor?: string;
  barcodeFgColor?: string;
  barcodeBgColor?: string;
  // Locking
  locked?: boolean;
  visible?: boolean;
  elementLabel?: string;
  visibilityCondition?: string;
  // Shadow (applies to TEXT and SHAPE)
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  // All elements
  opacity?: number;
  // Growing container (Crystal Reports / SSRS "Can Grow")
  canGrow?: boolean;
  // INVOICE_TABLE specific
  tableColumns?: InvoiceColumn[];
  tableHeaderBg?: string;
  tableHeaderColor?: string;
  tableRowHeight?: number;
  tableAlternateRows?: boolean;
  tableAlternateBg?: string;
  tableBorderColor?: string;
  tableFontSize?: number;
  receiptLineChars?: number;
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

// ─── INVENTARIO CLINICO ──────────────────────────────────────────────────────

export interface CategoriaTerapeutica {
  id_categoria: number;
  nombre: string;
  descripcion?: string;
  codigo_atc_nivel1?: string;
  activo: boolean;
}

export interface FormaFarmaceutica {
  id_forma: number;
  nombre: string;
  unidad_base: string;
  activo: boolean;
}

export interface PresentacionVenta {
  id_presentacion: number;
  id_medicamento: string;
  nombre: string;
  factor_conversion: number;
  descripcion_presentacion?: string;
  precio_venta: number;
  precio_tercera_edad?: number;
  codigo_barras_presentacion?: string;
  es_unidad_compra: boolean;
  es_unidad_venta: boolean;
  permite_fraccion: boolean;
  activo: boolean;
}

export interface Medicamento {
  codigo: string;
  nombre_generico: string;
  nombre_comercial?: string;
  concentracion?: string;
  id_forma?: number;
  via_administracion: string;
  id_categoria?: number;
  indicaciones?: string;
  contraindicaciones?: string;
  advertencias?: string;
  registro_sanitario?: string;
  laboratorio?: string;
  pais_origen?: string;
  requiere_receta: boolean;
  es_controlado: boolean;
  clase_controlado?: string;
  tipo_isv: 'exento' | '15' | '18';
  precio_costo_base?: number;
  margen_ganancia: number;
  stock_minimo: number;
  punto_reorden: number;
  codigo_ean13?: string;
  condicion_almacenamiento: string;
  activo: boolean;
  fecha_alta?: string;
  tipo_producto?: 'Medicamento' | 'Vacuna' | 'Insumo' | 'Alimento' | 'Antiparasitario' | 'Laboratorio';
  especies_permitidas?: string;
  dosis_recomendada?: string;
  unidad_dosis?: string;
  intervalo_dosis?: string;
  periodo_retiro?: string;
  categoriaNombre?: string;
  formaNombre?: string;
  unidadBase?: string;
  stockTotal?: number;
  presentacionesActivas?: number;
  presentacionesVendibles?: number;
  lotesActivos?: number;
  estadoCatalogo?: 'Borrador' | 'Sin stock' | 'Listo para venta';
  urlImagenPrincipal?: string;
  imagenBase64Principal?: string;
  r2KeyPrincipal?: string;
}

export interface LoteMedicamento {
  id_lote: number;
  id_medicamento: string;
  numero_lote: string;
  fecha_vencimiento_display: string;
  fecha_vencimiento: string;
  fecha_fabricacion?: string;
  cantidad_inicial: number;
  cantidad_actual: number;
  precio_compra_unitario?: number;
  id_sucursal?: number;
  id_proveedor?: string;
  fecha_ingreso: string;
  estado: 'Activo' | 'Vencido' | 'Cuarentena' | 'Devuelto' | 'Dado de baja';
  notas?: string;
  nombreProveedor?: string;
  alerta_vencimiento?: string;
}

export interface ImagenMedicamento {
  id_imagen: number;
  id_medicamento: string;
  url_imagen?: string;
  imagen_base64?: string;
  r2_key?: string;
  signed_url?: string;
  es_principal: boolean;
  descripcion?: string;
}

export interface AIMedicationImagePayload {
  base64: string;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  filename?: string;
}

export interface AIFieldSuggestion<T = string> {
  value: T;
  confidence: number;
  source?: 'front_label' | 'back_label' | 'inferred' | 'external' | string;
  label?: string;
}

export interface AIMedicationAnalysisResult {
  provider: 'openai' | 'anthropic' | 'gemini' | string;
  model: string;
  fields: {
    nombre_generico: AIFieldSuggestion;
    nombre_comercial: AIFieldSuggestion;
    concentracion: AIFieldSuggestion;
    id_forma_sugerida: AIFieldSuggestion<number | null>;
    laboratorio: AIFieldSuggestion;
    registro_sanitario: AIFieldSuggestion;
    codigo_ean13: AIFieldSuggestion;
    requiere_receta: AIFieldSuggestion<boolean>;
    es_controlado: AIFieldSuggestion<boolean>;
    tipo_isv: AIFieldSuggestion<'exento' | '15' | '18'>;
    via_administracion: AIFieldSuggestion;
    id_categoria_sugerida: AIFieldSuggestion<number | null>;
    pais_origen: AIFieldSuggestion;
    clase_controlado: AIFieldSuggestion;
    indicaciones: AIFieldSuggestion;
    advertencias: AIFieldSuggestion;
    contraindicaciones: AIFieldSuggestion;
    condicion_almacenamiento: AIFieldSuggestion;
  };
  warnings: string[];
  possibleDuplicates: Array<Pick<Medicamento, 'codigo' | 'nombre_generico' | 'nombre_comercial' | 'concentracion' | 'codigo_ean13'>>;
  needsReview: boolean;
}

export type AISymptomAgeRange = 'nino' | 'adulto' | 'adulto_mayor' | 'desconocido';
export type AIRecommendationAvailability = 'in_current_branch' | 'other_branch' | 'out_of_stock';

export interface AISymptomRecommendationPayload {
  symptoms: string[];
  ageRange: AISymptomAgeRange;
  pregnant: boolean;
  allergies: string[];
  currentMedications: string[];
  chronicConditions: string[];
  id_sucursal?: number;
}

export interface AISymptomRecommendation {
  codigo: string;
  nombre: string;
  reason: string;
  confidence: number;
  availability: AIRecommendationAvailability;
  stockCurrentBranch: number;
  stockTotal: number;
  requiresPrescription: boolean;
  isControlled: boolean;
  warnings: string[];
}

export interface AISymptomRecommendationResult {
  provider: 'openai' | 'anthropic' | 'gemini' | string;
  model: string;
  requiresMedicalReferral: boolean;
  referralReasons: string[];
  summary: string;
  recommendations: AISymptomRecommendation[];
  notRecommended: Array<{ codigo: string; nombre?: string; reason: string }>;
  safetyMessage: string;
}

export interface AlertaVencimiento {
  codigo: string;
  nombreGenerico: string;
  nombreComercial?: string;
  idLote: number;
  numeroLote: string;
  fechaVencimientoDisplay: string;
  fechaVencimiento: string;
  cantidadActual: number;
  dias_para_vencer: number;
  nivel_alerta: 'VENCIDO' | 'CRITICO' | 'ALERTA' | 'MONITOREO';
}

export interface StockCritico {
  codigo: string;
  nombreGenerico: string;
  stockMinimo: number;
  puntoReorden: number;
  stockActual: number;
  categoria?: string;
}

export interface Sucursal {
  id_sucursal: number;
  codigo: string;
  nombre: string;
  direccion?: string;
  telefono?: string;
  ciudad?: string;
  regente_farmacia?: string;
  numero_licencia?: string;
  estado: 'Activa' | 'Inactiva';
  created_at?: string;
}

export interface ProductoFarmacia {
  codigo: string;
  tipoProducto?: 'MEDICAMENTO' | 'SERVICIO';
  nombreGenerico: string;
  nombreComercial?: string;
  concentracion?: string;
  tipoIsv: 'exento' | '15' | '18';
  requiereReceta: boolean;
  esControlado: boolean;
  advertencias?: string;
  categoria?: string;
  formaFarmaceutica?: string;
  stock: number;
  urlImagen?: string;
  imagenBase64?: string;
  presentaciones?: PresentacionVenta[];
}

// Veterinary platform
export type EstadoCita = 'Programada' | 'Confirmada' | 'En espera' | 'En consulta' | 'Completada' | 'No asistio' | 'Cancelada';
export type EstadoConsulta = 'Abierta' | 'Cerrada' | 'Anulada';

export interface Paciente {
  id_paciente: number;
  id_tutor: string;
  nombre: string;
  especie: string;
  raza?: string;
  sexo?: string;
  color?: string;
  fecha_nacimiento?: string;
  fecha_nacimiento_estimada?: boolean;
  peso_actual?: number;
  microchip?: string;
  estado_reproductivo?: string;
  alergias?: string;
  condiciones_cronicas?: string;
  foto_base64?: string;
  estado: string;
  tutorNombre?: string;
  tutorTelefono?: string;
  tutorCorreo?: string;
  proximaCita?: string;
  totalConsultas?: number;
  pesos?: any[];
  citas?: Cita[];
  consultas?: Consulta[];
  vacunas?: VacunaAplicada[];
}

export interface TipoCita {
  id_tipo_cita: number;
  nombre: string;
  duracion_minutos: number;
  color?: string;
  requiere_veterinario: boolean;
  activo: boolean;
}

export interface Cita {
  id_cita: number;
  id_paciente?: number;
  id_tutor?: string;
  id_tipo_cita?: number;
  fecha_inicio: string;
  fecha_fin: string;
  id_veterinario?: string;
  id_sucursal?: number;
  sala_recurso?: string;
  estado: EstadoCita;
  motivo?: string;
  notas?: string;
  pacienteNombre?: string;
  tutorNombre?: string;
  tutorTelefono?: string;
  tutorCorreo?: string;
  tipoCitaNombre?: string;
  tipoCitaColor?: string;
  sucursalNombre?: string;
  veterinarioNombre?: string;
}

export interface AgendaVeterinario {
  id_veterinario: string;
  nombre: string;
  usuario?: string;
  id_sucursal?: number;
  sucursalNombre?: string;
}

export interface AgendaDisponibilidad {
  id_disponibilidad: number;
  id_veterinario: string;
  veterinarioNombre?: string;
  id_sucursal?: number;
  sucursalNombre?: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  intervalo_minutos: number;
  tipo: 'Disponible' | 'Bloqueado';
  notas?: string;
  activo: boolean;
}

export interface AgendaSlot {
  inicio: string;
  fin: string;
  disponible: boolean;
  motivo?: string;
}

export interface Consulta {
  id_consulta: number;
  id_paciente: number;
  id_tutor?: string;
  id_cita?: number;
  id_veterinario?: string;
  fecha: string;
  motivo?: string;
  subjetivo?: string;
  objetivo?: string;
  evaluacion?: string;
  plan?: string;
  peso?: number;
  temperatura?: number;
  frecuencia_cardiaca?: number;
  frecuencia_respiratoria?: number;
  condicion_corporal?: string;
  notas_alta?: string;
  estado: EstadoConsulta;
  pacienteNombre?: string;
  tutorNombre?: string;
  diagnosticos?: Array<{ id?: number; diagnostico: string; codigo?: string; notas?: string }>;
  tratamientos?: Array<{ id?: number; descripcion: string; id_medicamento?: string; dosis?: string; frecuencia?: string; duracion?: string; instrucciones?: string }>;
}

export interface VacunaProtocolo {
  id_protocolo: number;
  nombre: string;
  especie: string;
  edad_inicial_dias?: number;
  intervalo_dias?: number;
  dosis_totales?: number;
  id_medicamento?: string;
  activo: boolean;
}

export interface VacunaAplicada {
  id_vacuna_aplicada: number;
  id_paciente: number;
  id_protocolo?: number;
  id_medicamento?: string;
  id_lote?: number;
  nombre_vacuna: string;
  fecha_aplicacion: string;
  proxima_dosis?: string;
  veterinario?: string;
  notas?: string;
  pacienteNombre?: string;
  tutorNombre?: string;
}

export interface RecordatorioVet {
  id_recordatorio: number;
  tipo: string;
  referencia_tabla?: string;
  referencia_id?: number;
  id_tutor?: string;
  id_paciente?: number;
  correo_destino?: string;
  asunto: string;
  cuerpo?: string;
  fecha_programada: string;
  fecha_envio?: string;
  estado: string;
  intentos: number;
  pacienteNombre?: string;
  tutorNombre?: string;
}

export type ConsultorioTipo =
  | 'historia'
  | 'consulta'
  | 'vacuna'
  | 'formula'
  | 'desparasitacion'
  | 'hospitalizacion'
  | 'cirugia'
  | 'orden'
  | 'laboratorio'
  | 'imagenologia'
  | 'grooming'
  | 'guarderia'
  | 'seguimiento'
  | 'documento'
  | 'remision'
  | 'cita'
  | 'mensaje';

export interface ConsultorioEvento {
  id_evento?: number;
  id?: number | string;
  source?: string;
  id_paciente?: number;
  id_tutor?: string;
  id_cita?: number;
  tipo: ConsultorioTipo;
  tipoLabel?: string;
  titulo: string;
  fecha_evento: string;
  estado?: string;
  resumen?: string;
  detalle?: string;
  payload?: Record<string, any>;
  adjuntos?: any[];
  enviar_correo?: boolean;
  correo_enviado?: boolean;
  correo_destino?: string;
}

export interface ConsultorioBusquedaItem {
  identidad: string;
  nombre: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
  ciudad?: string;
  fechaCreacion?: string;
  totalPacientes: number;
  pacientes: Paciente[];
  ultimaGestion?: string;
}

export interface ConsultorioPacienteDetalle {
  paciente: Paciente & {
    tutorId?: string;
    tutorTelefonoAlternativo?: string;
    tutorDireccion?: string;
    tutorCiudad?: string;
    tutorDepartamento?: string;
    tutorSinCorreo?: boolean;
    contactoAutorizadoNombre?: string;
    contactoAutorizadoTelefono?: string;
  };
  conteos: Record<ConsultorioTipo, number>;
  citas: Cita[];
  recordatorios: RecordatorioVet[];
}

export interface ServicioVeterinario {
  id_servicio: number;
  codigo?: string;
  nombre: string;
  categoria: string;
  descripcion?: string;
  duracion_minutos: number;
  precio: number;
  tipo_isv: 'exento' | '15' | '18';
  requiere_paciente: boolean;
  activo: boolean;
}

export type EstadoEntrega = 'Pendiente' | 'Entregado' | 'Cancelado';

export interface EntregaSucursal {
  id: number;
  codVenta: string;
  idMedicamento: string;
  nombreMedicamento: string;
  cantidad: number;
  nombrePresentacion?: string;
  identidadCliente?: string;
  nombreCliente: string;
  estado: EstadoEntrega;
  fechaCreacion: string;
  fechaEntrega?: string;
  entregadoPor?: string;
  notasEntrega?: string;
  sucursalFacturacion: string;
  ciudadFacturacion?: string;
}

// ─── LOYALTY PROGRAM ──────────────────────────────────────────────────────────

export type LoyaltyExpiryType = 'rolling' | 'anniversary' | 'never';
export type LoyaltyTier = 'bronze' | 'silver' | 'gold';
export type LoyaltyTxTipo = 'earn' | 'redeem' | 'expire' | 'adjust' | 'reversal' | 'bonus';

export interface LoyaltyConfig {
  id?: number;
  idSucursal?: number | null;
  activo: boolean;
  nombrePrograma: string;
  earnRate: number;
  earnMinPurchase: number;
  redeemRate: number;
  redeemMinPoints: number;
  redeemMaxPct: number;
  expiryMonths: number;
  expiryType: LoyaltyExpiryType;
  tierEnabled: boolean;
  tierThresholds: { silver: number; gold: number };
  tierMultipliers: { bronze: number; silver: number; gold: number };
  bonusBirthdayPts: number;
  bonusEnrollmentPts: number;
  excludedCategories: number[];
  excludeIhss: boolean;
}

export interface LoyaltyAccount {
  id: number;
  identidadCliente: string;
  puntosDisponibles: number;
  puntosVitalicios: number;
  tierActual: LoyaltyTier;
  fechaInscripcion: string;
  fechaUltimoMov?: string;
  nombreCliente?: string;
}

export interface LoyaltyTransaction {
  id: number;
  tipo: LoyaltyTxTipo;
  puntosDelta: number;
  puntosAntes: number;
  puntosDespues: number;
  codVenta?: string;
  descripcion?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface LoyaltyPreview {
  activo: boolean;
  nombrePrograma?: string;
  puntosDisponibles?: number;
  puntosVitalicios?: number;
  tierActual?: LoyaltyTier;
  tierEnabled?: boolean;
  puntosGanaria?: number;
  maxPuntosRedimibles?: number;
  maxLpsRedimibles?: number;
  redeemMinPoints?: number;
  redeemRate?: number;
  earnRate?: number;
}

export interface LoyaltyAccountList {
  rows: LoyaltyAccount[];
  total: number;
  limit: number;
  offset: number;
}

export interface LoyaltyStats {
  cuentas: {
    total_cuentas: string;
    puntos_en_circulacion: string;
    puntos_vitalicios_total: string;
    cuentas_silver: string;
    cuentas_gold: string;
    activos_30d: string;
  };
  transacciones30d: { tipo: LoyaltyTxTipo; cantidad: string; puntos_total: string }[];
}

// ─── SAAS / MULTI-TENANCY ─────────────────────────────────────────────────────

export type PlanTenant = 'basico' | 'profesional' | 'enterprise';
export type EstadoTenant = 'activo' | 'suspendido' | 'cancelado' | 'prueba';

export interface Tenant {
  id: string;
  slug: string;
  nombreEmpresa: string;
  emailContacto: string;
  telefono?: string;
  pais: string;
  plan: PlanTenant;
  estado: EstadoTenant;
  maxSucursales: number;
  maxUsuarios: number;
  maxMedicamentos: number;
  fechaInicio: string;
  fechaVencimiento?: string;
  stripeCustomerId?: string;
  createdAt: string;
}

export interface TenantStats {
  tenantId: string;
  totalUsuarios: number;
  totalSucursales: number;
  totalMedicamentos: number;
  totalVentasMes: number;
  totalVentasHoy: number;
  ultimaActividad?: string;
}

export interface CreateTenantPayload {
  slug: string;
  nombreEmpresa: string;
  emailContacto: string;
  telefono?: string;
  pais?: string;
  plan: PlanTenant;
  maxSucursales?: number;
  maxUsuarios?: number;
  maxMedicamentos?: number;
  fechaVencimiento?: string;
  adminUsuario: string;
  adminPassword: string;
}
