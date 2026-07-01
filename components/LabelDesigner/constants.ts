export const TABLE_CONTEXT_MAP: Record<string, string> = {
    configuracion:        'empresa',
    ventas:               'venta',
    clientes:             'cliente',
    pacientes:            'paciente',
    medicamentos:         'medicamento',
    lotes_medicamento:    'lote',
    presentaciones_venta: 'presentacion',
    detalleventa:         'item',
    empleado:             'empleado',
    usuarios:             'usuario',
};

export const COLUMN_CAMEL_MAP: Record<string, string> = {
    codventa: 'codVenta', fechaventa: 'fechaVenta', codvendedor: 'codVendedor',
    identidadcliente: 'identidadCliente', tipompra: 'tipoCompra', metodopago: 'metodoPago',
    nombrevndedor: 'nombreVendedor', nombreccliente: 'nombreCliente',
    nombreeempresa: 'nombreEmpresa', nombreempresa: 'nombreEmpresa',
    rangoinicial: 'rangoInicial', rangofinal: 'rangoFinal',
    fechalimite: 'fechaLimite', mensajefinal: 'mensajeFinal', logo_base64: 'logoBase64',
    coddetalle: 'codDetalleVenta', precioventa: 'precioVenta', cantdad: 'cantidad',
    tipoproducto: 'tipoProducto', descuento: 'descuento',
    fechaingreso: 'fechaIngreso', fechacreacion: 'fechaCreacion',
    idreparacion: 'idReparacion', nombretecnico: 'nombreTecnico',
    nombrecliente: 'nombreCliente', apellidocliente: 'apellidoCliente',
    direccioncliente: 'direccionCliente',
    id_medicamento: 'idMedicamento', codigo_receta: 'codigoReceta',
    numero_lote: 'numeroLote', fecha_vencimiento: 'fechaVencimiento',
    fecha_fabricacion: 'fechaFabricacion', fecha_emision: 'fechaEmision',
    stock_total: 'stockTotal', stock_minimo: 'stockMinimo',
    requiere_receta: 'requiereReceta', precio_venta: 'precioVenta',
    precio_compra_unitario: 'precioCompraUnitario', precio_tercera_edad: 'precioTerceraEdad',
    cantidad_unidades: 'cantidadUnidades', cantidad_disponible: 'cantidadDisponible',
    cantidad_prescrita: 'cantidadPrescrita', fecha_nacimiento: 'fechaNacimiento',
};

export function toContextColName(col: string): string {
    return COLUMN_CAMEL_MAP[col.toLowerCase()] || col;
}

export interface CtxVar { key: string; label: string; example?: string }
export interface CtxGroup { icon: string; label: string; color: string; vars: CtxVar[] }

export const CONTEXT_GROUPS: CtxGroup[] = [
    {
        icon: '🏢', label: 'Empresa / CAI', color: 'indigo',
        vars: [
            { key: 'empresa.nombreEmpresa', label: 'Nombre Empresa',   example: 'Clinica Veterinaria San Jose' },
            { key: 'empresa.rtn',           label: 'RTN',              example: '0801-1990-01234' },
            { key: 'empresa.direccion',     label: 'Dirección',        example: 'Col. Palmira, Teg.' },
            { key: 'empresa.telefono',      label: 'Teléfono',         example: '2222-3333' },
            { key: 'empresa.correo',        label: 'Correo',           example: 'info@veterinaria.hn' },
            { key: 'empresa.cai',           label: 'CAI',              example: 'A1B2C3-D4E5F6-...' },
            { key: 'empresa.rangoInicial',  label: 'Rango Inicial',    example: '001-001-01-00000001' },
            { key: 'empresa.rangoFinal',    label: 'Rango Final',      example: '001-001-01-00099999' },
            { key: 'empresa.fechaLimite',   label: 'Fecha Límite CAI', example: '31/12/2026' },
            { key: 'empresa.mensajeFinal',  label: 'Mensaje Final',    example: 'EXIJA SU FACTURA' },
        ],
    },
    {
        icon: '💊', label: 'Medicamento', color: 'green',
        vars: [
            { key: 'medicamento.codigo',        label: 'Código',          example: 'MED-0001' },
            { key: 'medicamento.nombre',         label: 'Nombre',          example: 'Losartan 50mg' },
            { key: 'medicamento.descripcion',    label: 'Descripción',     example: 'Antihipertensivo' },
            { key: 'medicamento.stockTotal',     label: 'Stock Total',     example: '150' },
            { key: 'medicamento.ubicacion',      label: 'Ubicación',       example: 'Estante A-3' },
            { key: 'medicamento.requiereReceta', label: 'Requiere Receta', example: 'Sí' },
            { key: 'medicamento.estado',         label: 'Estado',          example: 'Activo' },
        ],
    },
    {
        icon: '🏷️', label: 'Presentación / Precio', color: 'amber',
        vars: [
            { key: 'presentacion.nombre',           label: 'Presentación',      example: 'Caja x 30 tab' },
            { key: 'presentacion.precioVenta',       label: 'Precio Venta',      example: '165.00' },
            { key: 'presentacion.precioTerceraEdad', label: 'Precio 3a Edad',    example: '140.25' },
            { key: 'presentacion.cantidadUnidades',  label: 'Unidades por Pack', example: '30' },
            { key: 'presentacion.unidad',            label: 'Unidad',            example: 'Tableta' },
        ],
    },
    {
        icon: '📦', label: 'Lote', color: 'purple',
        vars: [
            { key: 'lote.numeroLote',         label: 'Número de Lote',      example: 'LOT-2024-001' },
            { key: 'lote.fechaVencimiento',   label: 'Fecha Vencimiento',   example: '31/12/2025' },
            { key: 'lote.fechaFabricacion',   label: 'Fecha Fabricación',   example: '01/01/2024' },
            { key: 'lote.cantidadDisponible', label: 'Cantidad Disponible', example: '90' },
            { key: 'lote.estado',             label: 'Estado Lote',         example: 'Activo' },
        ],
    },
    {
        icon: '👤', label: 'Paciente / Cliente', color: 'sky',
        vars: [
            { key: 'paciente.nombre',    label: 'Nombre Paciente', example: 'María García' },
            { key: 'paciente.identidad', label: 'Identidad / DNI', example: '0801-1985-12345' },
            { key: 'paciente.telefono',  label: 'Teléfono',        example: '9999-8888' },
            { key: 'paciente.direccion', label: 'Dirección',       example: 'Col. Alameda, Teg.' },
            { key: 'paciente.genero',    label: 'Género',          example: 'F' },
            { key: 'cliente.nombre',     label: 'Nombre Cliente',  example: 'Pedro López' },
            { key: 'cliente.identidad',  label: 'RTN / Identidad', example: '0801-1990-56789' },
        ],
    },
    {
        icon: '🛒', label: 'Ítem (tabla)', color: 'amber',
        vars: [
            { key: '{{item.descripcion}}',  label: 'Medicamento',     example: 'Losartan 50mg x30' },
            { key: '{{item.cantidad}}',     label: 'Cantidad',        example: '2' },
            { key: '{{item.precioVenta}}',  label: 'Precio Unitario', example: '165.00' },
            { key: '{{item.isv}}',          label: 'ISV',             example: '0.00' },
            { key: '{{item.total}}',        label: 'Total Ítem',      example: '330.00' },
        ],
    },
    {
        icon: '🧾', label: 'Venta / Factura', color: 'green',
        vars: [
            { key: 'venta.numeroFactura',  label: 'No. de Factura (fiscal)', example: '000-001-01-00000021' },
            { key: 'venta.codVenta',       label: 'Código Interno', example: 'FACT-0001' },
            { key: 'venta.fecha',          label: 'Fecha Venta',    example: '05/04/2026' },
            { key: 'venta.total',          label: 'Total',          example: '330.00' },
            { key: 'venta.isv',            label: 'ISV (15%)',      example: '0.00' },
            { key: 'venta.descuento',      label: 'Descuento',      example: '0.00' },
            { key: 'venta.tipoCompra',     label: 'Tipo de Venta',  example: 'Contado' },
            { key: 'venta.nombreVendedor', label: 'Vendedor',       example: 'Ana Rodríguez' },
        ],
    },
    {
        icon: '💰', label: 'Totales Fiscales', color: 'rose',
        vars: [
            { key: 'fiscal.subtotal',          label: 'Subtotal',           example: '287.00' },
            { key: 'fiscal.descuento',         label: 'Descuento',          example: '0.00' },
            { key: 'fiscal.subtotalExento',    label: 'Importe Exento',     example: '0.00' },
            { key: 'fiscal.subtotalGravado15', label: 'Importe Gravado 15%', example: '287.00' },
            { key: 'fiscal.subtotalGravado18', label: 'Importe Gravado 18%', example: '0.00' },
            { key: 'fiscal.isv15',             label: 'ISV 15%',            example: '43.00' },
            { key: 'fiscal.isv18',             label: 'ISV 18%',            example: '0.00' },
            { key: 'fiscal.total',             label: 'Total a Pagar',      example: '330.00' },
            { key: 'fiscal.totalLetras',       label: 'Total en Letras',    example: 'TRESCIENTOS TREINTA LEMPIRAS CON 00/100' },
            { key: 'fiscal.numeroItems',       label: 'Número de Ítems',    example: '3' },
        ],
    },
];

export const COLOR_MAP: Record<string, { bg: string; badge: string; text: string }> = {
    indigo: { bg: 'bg-indigo-50 border-indigo-100', badge: 'bg-indigo-100 text-indigo-700', text: 'text-indigo-800' },
    green:  { bg: 'bg-green-50 border-green-100',   badge: 'bg-green-100 text-green-700',   text: 'text-green-800' },
    sky:    { bg: 'bg-sky-50 border-sky-100',        badge: 'bg-sky-100 text-sky-700',       text: 'text-sky-800' },
    amber:  { bg: 'bg-amber-50 border-amber-100',   badge: 'bg-amber-100 text-amber-700',   text: 'text-amber-800' },
    rose:   { bg: 'bg-rose-50 border-rose-100',      badge: 'bg-rose-100 text-rose-700',     text: 'text-rose-800' },
    purple: { bg: 'bg-purple-50 border-purple-100', badge: 'bg-purple-100 text-purple-700', text: 'text-purple-800' },
};
