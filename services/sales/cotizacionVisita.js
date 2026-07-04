'use strict';

// Consolida el consumo de una visita (servicios de consulta, recetas,
// vacunas, desparasitaciones o cualquier otro cargo generado desde el
// expediente clinico) en UNA sola cotizacion "Emitida" por paciente/dia, en
// vez de crear una cotizacion distinta por cada seccion del expediente.
// Reemplaza la logica que antes estaba duplicada entre pages/Expediente.tsx
// (busqueda por tutor+fecha) y routes/veterinaryRoutes.js (insercion directa
// sin buscar una cotizacion abierta).

const { generateNextId, getLocalTimestamp } = require('../../config/db');
const { calcularIsvLinea } = require('./tax');

/**
 * @param {object} params
 * @param {import('pg').PoolClient} params.client - Cliente ya dentro de una transaccion.
 * @param {string} params.tenantId
 * @param {number} params.idPaciente
 * @param {string} params.identidadCliente - Identidad del tutor (requerido para crear cotizacion nueva).
 * @param {string} [params.codVendedor]
 * @param {Array<{descripcionProducto?:string, cantidad:number, precioVenta:number, tipoProducto?:string, id_medicamento?:string, id_presentacion?:number, id_servicio?:number, tipoIsv?:string}>} params.items
 * @param {string} [params.observaciones]
 * @returns {Promise<{codigo:string, creado:boolean, total:number}>}
 */
async function upsertVisitaCotizacion({
    client, tenantId, idPaciente, identidadCliente,
    codVendedor, items, observaciones,
}) {
    if (!idPaciente) throw Object.assign(new Error('idPaciente es requerido'), { statusCode: 400 });
    if (!Array.isArray(items) || items.length === 0) {
        throw Object.assign(new Error('items debe ser un arreglo con al menos un elemento'), { statusCode: 400 });
    }

    const lineas = items.map(item => {
        const tipoIsv = item.tipoIsv || 'exento';
        const { subExento, subGravado, isvLinea } = calcularIsvLinea(item.precioVenta, item.cantidad, tipoIsv);
        return { ...item, tipoIsv, subExento, subGravado, isvLinea };
    });
    const totalNuevo = lineas.reduce((sum, l) => sum + Number(l.precioVenta) * Number(l.cantidad), 0);
    const isvNuevo = lineas.reduce((sum, l) => sum + l.isvLinea, 0);

    const abierta = await client.query(
        `SELECT codigo FROM cotizaciones
         WHERE tenant_id = $1 AND id_paciente = $2 AND estado = 'Emitida'
           AND fecha::date = CURRENT_DATE
         ORDER BY fecha DESC LIMIT 1 FOR UPDATE`,
        [tenantId, idPaciente]
    );

    let codigo;
    let creado = false;

    if (abierta.rows.length) {
        codigo = abierta.rows[0].codigo;
        await client.query(
            `UPDATE cotizaciones SET total = total + $1, isv = isv + $2, fecha_actualizacion = NOW()
             WHERE codigo = $3 AND tenant_id = $4`,
            [totalNuevo, isvNuevo, codigo, tenantId]
        );
    } else {
        if (!identidadCliente) {
            throw Object.assign(new Error('El paciente no tiene tutor asignado para crear la cotizacion pendiente'), { statusCode: 400 });
        }
        codigo = await generateNextId('cotizaciones', 'codigo', 'COT', client);
        creado = true;
        await client.query(
            `INSERT INTO cotizaciones
             (codigo, fecha, cod_vendedor, identidad_cliente, total, estado, tipo_compra,
              isv, descuento, observaciones, id_paciente, tenant_id)
             VALUES ($1, $2, $3, $4, $5, 'Emitida', 'Contado', $6, 0, $7, $8, $9)`,
            [codigo, getLocalTimestamp(), codVendedor || null, identidadCliente, totalNuevo, isvNuevo, observaciones || null, idPaciente, tenantId]
        );
    }

    for (const l of lineas) {
        await client.query(
            `INSERT INTO detalle_cotizacion
             (codigo_cotizacion, producto, cantidad, precio_unitario, tipo_producto,
              id_medicamento, id_presentacion, id_servicio, tipo_isv,
              subtotal_exento, subtotal_gravado, isv_linea, tenant_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
                codigo,
                l.descripcionProducto || l.id_medicamento || l.id_servicio || 'Producto',
                l.cantidad,
                l.precioVenta,
                l.tipoProducto || 'MEDICAMENTO',
                l.id_medicamento || null,
                l.id_presentacion || null,
                l.id_servicio || null,
                l.tipoIsv,
                l.subExento,
                l.subGravado,
                l.isvLinea,
                tenantId,
            ]
        );
    }

    const totales = await client.query('SELECT total FROM cotizaciones WHERE codigo = $1 AND tenant_id = $2', [codigo, tenantId]);
    return { codigo, creado, total: Number(totales.rows[0]?.total || 0) };
}

module.exports = { upsertVisitaCotizacion };
