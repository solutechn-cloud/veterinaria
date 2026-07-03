
const express = require('express');
const router = express.Router();
const { pool, generateNextId, generateFacturaCorrelativo, handleDbError, updateArqueoBalance, getLocalTimestamp, anularVenta } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');
const { calcularIsvLinea, TIPOS_ISV_VALIDOS } = require('../services/sales/tax');
const { asignarLotesFefo } = require('../services/sales/fefo');
const { buildTutorIdentity } = require('../services/sales/tutorIdentity');

function httpError(statusCode, message, code) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.code = code;
    return err;
}

const SALE_DOCUMENT_TYPES = new Set(['factura_fiscal', 'factura_no_fiscal']);

function normalizeSaleDocumentType(body = {}) {
    if (SALE_DOCUMENT_TYPES.has(body.tipoDocumento)) return body.tipoDocumento;
    if (body.documentoFiscal === false) return 'factura_no_fiscal';
    return 'factura_fiscal';
}

function toSafeNum(v) {
    const n = parseFloat(v);
    return isFinite(n) && n >= 0 ? n : null;
}

function validateCommercialPayload({ total, isv, descuento, montoPrima, montoFinanciado, detalles }) {
    if (toSafeNum(total) === null) throw httpError(400, 'total debe ser un numero positivo', 'INVALID_TOTAL');
    if (toSafeNum(isv) === null && isv != null) throw httpError(400, 'isv invalido', 'INVALID_TAX');
    if (toSafeNum(descuento) === null && descuento != null) throw httpError(400, 'descuento invalido', 'INVALID_DISCOUNT');
    if (toSafeNum(montoPrima) === null && montoPrima != null) throw httpError(400, 'montoPrima invalido', 'INVALID_DOWN_PAYMENT');
    if (toSafeNum(montoFinanciado) === null && montoFinanciado != null) throw httpError(400, 'montoFinanciado invalido', 'INVALID_FINANCED_AMOUNT');

    if (!Array.isArray(detalles) || detalles.length === 0) {
        throw httpError(400, 'detalles debe ser un arreglo con al menos un item', 'INVALID_DETAILS');
    }
    for (const item of detalles) {
        if (toSafeNum(item.cantidad) === null || Number(item.cantidad) <= 0) {
            throw httpError(400, 'cantidad de item invalida', 'INVALID_ITEM_QUANTITY');
        }
        if (toSafeNum(item.precioVenta) === null) {
            throw httpError(400, 'precioVenta de item invalido', 'INVALID_ITEM_PRICE');
        }
        if (item.tipoIsv && !TIPOS_ISV_VALIDOS.has(item.tipoIsv)) {
            throw httpError(400, `tipoIsv invalido: ${item.tipoIsv}`, 'INVALID_ITEM_TAX');
        }
    }
}

router.get('/clientes', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM clientes WHERE tenant_id = $1 ORDER BY nombre ASC', [req.tenantId]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/clientes', authenticateToken, async (req, res) => {
    try {
        const {
            nombre, apellido, direccion, telefono,
            tipo_identificacion = 'identidad',
            sin_correo = false,
            ciudad_municipio, departamento,
            contacto_autorizado_nombre, contacto_autorizado_telefono,
            telefono_alternativo,
        } = req.body;
        const identidad = buildTutorIdentity({ ...req.body, tenantId: req.tenantId });
        const correo = sin_correo ? null : (req.body.correo || null);
        if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
        await pool.query(
            `INSERT INTO clientes (
                identidad, nombre, apellido, direccion, telefono, correo, fechaCreacion, tenant_id,
                tipo_identificacion, sin_correo, ciudad_municipio, departamento,
                contacto_autorizado_nombre, contacto_autorizado_telefono, telefono_alternativo
             ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
                identidad, nombre, apellido || '', direccion || null, telefono || null, correo, req.tenantId,
                tipo_identificacion === 'telefono' ? 'telefono' : 'identidad',
                Boolean(sin_correo), ciudad_municipio || null, departamento || null,
                contacto_autorizado_nombre || null, contacto_autorizado_telefono || null, telefono_alternativo || null,
            ]
        );
        if (correo) {
            emailService.sendWelcomeEmail(correo, nombre, apellido).catch(err =>
                console.error('[salesRoutes] welcome email error:', err.message)
            );
        }
        res.status(201).json({ message: 'OK', identidad });
    } catch(e) {
        if (e.statusCode) return res.status(e.statusCode).json({ error: e.message, code: e.code });
        handleDbError(res, e);
    }
});

router.put('/clientes/:id', authenticateToken, async (req, res) => {
    try {
        const {
            nombre, apellido, direccion, telefono,
            sin_correo = false,
            ciudad_municipio, departamento,
            contacto_autorizado_nombre, contacto_autorizado_telefono,
            telefono_alternativo,
        } = req.body;
        const correo = sin_correo ? null : (req.body.correo || null);
        await pool.query(
            `UPDATE clientes SET
                nombre=$1, apellido=$2, direccion=$3, telefono=$4, correo=$5,
                sin_correo=$6, ciudad_municipio=$7, departamento=$8,
                contacto_autorizado_nombre=$9, contacto_autorizado_telefono=$10,
                telefono_alternativo=$11
             WHERE identidad=$12 AND tenant_id=$13`,
            [
                nombre, apellido || '', direccion || null, telefono || null, correo,
                Boolean(sin_correo), ciudad_municipio || null, departamento || null,
                contacto_autorizado_nombre || null, contacto_autorizado_telefono || null,
                telefono_alternativo || null, req.params.id, req.tenantId,
            ]
        );
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/clientes/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM clientes WHERE identidad=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- VENTAS ---
router.get('/ventas/historial', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const { codUsuario, idCaja, rol, permisos } = req.user;
        const isAdmin = ['administrador', 'admin', 'superadmin'].includes(String(rol || '').toLowerCase())
            || (permisos || []).includes('VER_ADMIN');

        const params = [idCaja, fecha || getLocalTimestamp().substring(0, 10), req.tenantId];
        let filtroVendedor = '';
        if (!isAdmin) {
            params.push(codUsuario);
            filtroVendedor = ' AND v.codVendedor = $4::text';
        }

        const result = await pool.query(`
            SELECT v.codVenta as "codVenta", v.numero_factura as "numeroFactura",
                   COALESCE(v.numero_factura, v.codVenta) as "numeroDocumento",
                   COALESCE(v.tipo_documento, 'factura_fiscal') as "tipoDocumento",
                   (COALESCE(v.tipo_documento, 'factura_fiscal') = 'factura_fiscal') as "documentoFiscal",
                   v.fecha, v.total, v.estado,
                   v.identidadCliente as "identidadCliente",
                   v.tipoCompra as "tipoCompra", v.codVendedor as "codVendedor",
                   COALESCE(c.nombre || ' ' || c.apellido, 'Consumidor Final') as "nombreCliente"
            FROM ventas v
            LEFT JOIN clientes c ON v.identidadCliente = c.identidad AND c.tenant_id = $3
            WHERE v.idCaja = $1
              AND TO_CHAR(v.fecha, 'YYYY-MM-DD') = $2
              AND v.tenant_id = $3
              ${filtroVendedor}
            ORDER BY v.fecha DESC
        `, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// Historial de ventas por rango de fecha (para reimpresión de documentos).
router.get('/ventas/buscar', authenticateToken, async (req, res) => {
    try {
        const { desde, hasta, q } = req.query;
        const hoy = getLocalTimestamp().substring(0, 10);
        const params = [req.tenantId, desde || hoy, hasta || hoy];
        let filtro = '';
        if (q) {
            params.push(`%${q}%`);
            filtro = ` AND (v.codVenta ILIKE $4 OR v.numero_factura ILIKE $4 OR v.identidadCliente ILIKE $4 OR (c.nombre || ' ' || COALESCE(c.apellido,'')) ILIKE $4)`;
        }
        const result = await pool.query(`
            SELECT v.codVenta as "codVenta", v.numero_factura as "numeroFactura",
                   COALESCE(v.numero_factura, v.codVenta) as "numeroDocumento",
                   COALESCE(v.tipo_documento, 'factura_fiscal') as "tipoDocumento",
                   (COALESCE(v.tipo_documento, 'factura_fiscal') = 'factura_fiscal') as "documentoFiscal",
                   v.fecha, v.total, v.estado, v.tipoCompra as "tipoCompra",
                   v.identidadCliente as "identidadCliente",
                   COALESCE(c.nombre || ' ' || COALESCE(c.apellido,''), 'Consumidor Final') as "nombreCliente"
            FROM ventas v
            LEFT JOIN clientes c ON v.identidadCliente = c.identidad AND c.tenant_id = $1
            WHERE v.tenant_id = $1
              AND TO_CHAR(v.fecha, 'YYYY-MM-DD') BETWEEN $2 AND $3
              ${filtro}
            ORDER BY v.fecha DESC
            LIMIT 500
        `, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.get('/ventas/:id', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT
                v.codVenta as "codVenta", v.numero_factura as "numeroFactura",
                COALESCE(v.numero_factura, v.codVenta) as "numeroDocumento",
                COALESCE(v.tipo_documento, 'factura_fiscal') as "tipoDocumento",
                (COALESCE(v.tipo_documento, 'factura_fiscal') = 'factura_fiscal') as "documentoFiscal",
                v.fecha, v.codVendedor as "codVendedor",
                v.identidadCliente as "identidadCliente", v.total, v.estado,
                v.tipoCompra as "tipoCompra", v.isv, v.descuento,
                v.monto_prima as "montoPrima", v.monto_financiamiento as "montoFinanciado",
                c.nombre as "nombreCliente", c.apellido as "apellidoCliente",
                c.direccion as "direccionCliente",
                COALESCE(e.nombre || ' ' || e.apellido, u.usuario) as "nombreVendedor"
            FROM ventas v
            LEFT JOIN clientes c ON v.identidadCliente = c.identidad AND c.tenant_id = $2
            JOIN usuarios u ON v.codVendedor::text = u.codUsuario::text AND u.tenant_id = $2
            LEFT JOIN empleado e ON u.identidad = e.identidad AND e.tenant_id = $2
            WHERE v.codVenta = $1 AND v.tenant_id = $2
        `, [req.params.id, req.tenantId]);
        res.json(r.rows[0]);
    } catch(e) { handleDbError(res, e); }
});

router.get('/ventas/:id/detalles', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT
                dv.codDetalleVenta  AS "codDetalleVenta",
                dv.idVenta          AS "idVenta",
                dv.cantidad         AS "cantidad",
                COALESCE(dv.precioUnitario, dv.precioVenta) AS "precioVenta",
                dv.tipoProducto     AS "tipoProducto",
                dv.id_presentacion  AS "id_presentacion",
                dv.id_servicio       AS "id_servicio",
                dv.tipo_isv         AS "tipoIsv",
                dv.subtotal_exento  AS "subtotalExento",
                dv.subtotal_gravado AS "subtotalGravado",
                dv.isv_linea        AS "isvLinea",
                COALESCE(dv.producto, 'PRODUCTO') AS "descripcionProducto",
                pv.id_medicamento   AS "id_medicamento"
            FROM detalleventa dv
            LEFT JOIN presentaciones_venta pv ON dv.id_presentacion = pv.id_presentacion AND pv.tenant_id = $2
            WHERE dv.idVenta = $1 AND dv.tenant_id = $2
        `, [req.params.id, req.tenantId]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- COTIZACIONES ---
// Listado de cotizaciones por rango de fecha / estado (historial).
router.get('/cotizaciones', authenticateToken, async (req, res) => {
    try {
        const { desde, hasta, estado, q } = req.query;
        const hoy = getLocalTimestamp().substring(0, 10);
        const params = [req.tenantId, desde || hoy, hasta || hoy];
        let filtro = '';
        if (estado) { params.push(estado); filtro += ` AND q.estado = $${params.length}`; }
        if (q) {
            params.push(`%${q}%`);
            filtro += ` AND (q.codigo ILIKE $${params.length} OR q.identidad_cliente ILIKE $${params.length} OR (c.nombre || ' ' || COALESCE(c.apellido,'')) ILIKE $${params.length})`;
        }
        const result = await pool.query(`
            SELECT q.codigo as "codigo", q.fecha, q.total, q.estado,
                   q.tipo_compra as "tipoCompra", q.valido_hasta as "validoHasta",
                   q.venta_codigo as "ventaCodigo",
                   q.identidad_cliente as "identidadCliente",
                   COALESCE(c.nombre || ' ' || COALESCE(c.apellido,''), 'Consumidor Final') as "nombreCliente"
            FROM cotizaciones q
            LEFT JOIN clientes c ON q.identidad_cliente = c.identidad AND c.tenant_id = $1
            WHERE q.tenant_id = $1
              AND TO_CHAR(q.fecha, 'YYYY-MM-DD') BETWEEN $2 AND $3
              ${filtro}
            ORDER BY q.fecha DESC
            LIMIT 500
        `, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.get('/cotizaciones/:id', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT
                q.codigo as "codigo",
                q.codigo as "codVenta",
                q.codigo as "numeroFactura",
                q.codigo as "numeroDocumento",
                'cotizacion' as "tipoDocumento",
                FALSE as "documentoFiscal",
                q.fecha,
                q.cod_vendedor as "codVendedor",
                q.identidad_cliente as "identidadCliente",
                q.total,
                q.estado,
                q.tipo_compra as "tipoCompra",
                q.isv,
                q.descuento,
                q.valido_hasta as "validoHasta",
                q.observaciones,
                c.nombre as "nombreCliente",
                c.apellido as "apellidoCliente",
                c.direccion as "direccionCliente",
                COALESCE(e.nombre || ' ' || e.apellido, u.usuario) as "nombreVendedor"
            FROM cotizaciones q
            LEFT JOIN clientes c ON q.identidad_cliente = c.identidad AND c.tenant_id = $2
            LEFT JOIN usuarios u ON q.cod_vendedor::text = u.codUsuario::text AND u.tenant_id = $2
            LEFT JOIN empleado e ON u.identidad = e.identidad AND e.tenant_id = $2
            WHERE q.codigo = $1 AND q.tenant_id = $2
        `, [req.params.id, req.tenantId]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Cotizacion no encontrada' });
        res.json(r.rows[0]);
    } catch(e) { handleDbError(res, e); }
});

router.get('/cotizaciones/:id/detalles', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT
                dc.id_detalle::text AS "codDetalleVenta",
                dc.codigo_cotizacion AS "idVenta",
                dc.cantidad AS "cantidad",
                dc.precio_unitario AS "precioVenta",
                dc.tipo_producto AS "tipoProducto",
                dc.id_presentacion AS "id_presentacion",
                dc.id_servicio AS "id_servicio",
                dc.id_medicamento AS "id_medicamento",
                dc.tipo_isv AS "tipoIsv",
                dc.subtotal_exento AS "subtotalExento",
                dc.subtotal_gravado AS "subtotalGravado",
                dc.isv_linea AS "isvLinea",
                dc.producto AS "descripcionProducto"
            FROM detalle_cotizacion dc
            WHERE dc.codigo_cotizacion = $1 AND dc.tenant_id = $2
            ORDER BY dc.id_detalle ASC
        `, [req.params.id, req.tenantId]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/cotizaciones', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { identidadCliente, tipoCompra, total, detalles, isv, descuento, clientMutationId, validoHasta, observaciones } = req.body;
        validateCommercialPayload({ total, isv, descuento, detalles });

        await client.query('BEGIN');

        if (clientMutationId) {
            const existing = await client.query(
                'SELECT codigo FROM cotizaciones WHERE tenant_id = $1 AND client_mutation_id = $2',
                [req.tenantId, clientMutationId]
            );
            if (existing.rows.length) {
                await client.query('COMMIT');
                return res.status(200).json({ codigo: existing.rows[0].codigo, codCotizacion: existing.rows[0].codigo, duplicate: true });
            }
        }

        const codigo = await generateNextId('cotizaciones', 'codigo', 'COT', client);
        const hndTime = getLocalTimestamp();

        await client.query(
            `INSERT INTO cotizaciones
             (codigo, fecha, cod_vendedor, identidad_cliente, total, estado, tipo_compra,
              isv, descuento, valido_hasta, observaciones, client_mutation_id, tenant_id)
             VALUES ($1,$2,$3,$4,$5,'Emitida',$6,$7,$8,$9,$10,$11,$12)`,
            [
                codigo, hndTime, req.user.codUsuario, identidadCliente || null, total,
                tipoCompra || 'Contado', isv || 0, descuento || 0,
                validoHasta || null, observaciones || null, clientMutationId || null, req.tenantId,
            ]
        );

        for (const item of detalles) {
            const tipoIsv = item.tipoIsv || 'exento';
            const { subExento, subGravado, isvLinea } = calcularIsvLinea(item.precioVenta, item.cantidad, tipoIsv);
            await client.query(
                `INSERT INTO detalle_cotizacion
                 (codigo_cotizacion, producto, cantidad, precio_unitario, tipo_producto,
                  id_medicamento, id_presentacion, id_servicio, tipo_isv,
                  subtotal_exento, subtotal_gravado, isv_linea, tenant_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [
                    codigo,
                    item.descripcionProducto || item.id_medicamento || item.id_servicio || 'Producto',
                    item.cantidad,
                    item.precioVenta,
                    item.tipoProducto || 'MEDICAMENTO',
                    item.id_medicamento || null,
                    item.id_presentacion || null,
                    item.id_servicio || null,
                    tipoIsv,
                    subExento,
                    subGravado,
                    isvLinea,
                    req.tenantId,
                ]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ codigo, codCotizacion: codigo });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch {}
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        handleDbError(res, err);
    } finally { client.release(); }
});

// Agrega líneas a una cotización existente (aún no convertida) y recalcula el
// total/ISV. Lo usa el consultorio para que consulta (servicios) y receta
// (productos) de una misma visita queden en UNA sola cotización.
router.post('/cotizaciones/:id/detalles', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { detalles } = req.body;
        if (!Array.isArray(detalles) || detalles.length === 0) {
            return res.status(400).json({ error: 'detalles debe ser un arreglo con al menos un ítem' });
        }
        for (const item of detalles) {
            if (item.tipoIsv && !TIPOS_ISV_VALIDOS.has(item.tipoIsv)) {
                return res.status(400).json({ error: `tipoIsv inválido: ${item.tipoIsv}` });
            }
        }

        await client.query('BEGIN');
        const cot = await client.query(
            `SELECT codigo, estado, descuento FROM cotizaciones WHERE codigo = $1 AND tenant_id = $2 FOR UPDATE`,
            [req.params.id, req.tenantId]
        );
        if (!cot.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Cotización no encontrada' }); }
        if (cot.rows[0].estado === 'Convertida') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'La cotización ya fue convertida en venta' }); }

        for (const item of detalles) {
            const tipoIsv = item.tipoIsv || 'exento';
            const { subExento, subGravado, isvLinea } = calcularIsvLinea(item.precioVenta, item.cantidad, tipoIsv);
            await client.query(
                `INSERT INTO detalle_cotizacion
                 (codigo_cotizacion, producto, cantidad, precio_unitario, tipo_producto,
                  id_medicamento, id_presentacion, id_servicio, tipo_isv,
                  subtotal_exento, subtotal_gravado, isv_linea, tenant_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [
                    req.params.id,
                    item.descripcionProducto || item.id_medicamento || item.id_servicio || 'Producto',
                    item.cantidad, item.precioVenta, item.tipoProducto || 'MEDICAMENTO',
                    item.id_medicamento || null, item.id_presentacion || null, item.id_servicio || null,
                    tipoIsv, subExento, subGravado, isvLinea, req.tenantId,
                ]
            );
        }

        const agg = await client.query(
            `SELECT COALESCE(SUM(subtotal_exento + subtotal_gravado), 0) AS base,
                    COALESCE(SUM(isv_linea), 0) AS isv
             FROM detalle_cotizacion WHERE codigo_cotizacion = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId]
        );
        const base = Number(agg.rows[0].base || 0);
        const isvTot = Number(agg.rows[0].isv || 0);
        const descuento = Number(cot.rows[0].descuento || 0);
        const total = base + isvTot - descuento;
        await client.query(
            `UPDATE cotizaciones SET total = $1, isv = $2, fecha_actualizacion = NOW()
             WHERE codigo = $3 AND tenant_id = $4`,
            [total, isvTot, req.params.id, req.tenantId]
        );

        await client.query('COMMIT');
        res.json({ codigo: req.params.id, codCotizacion: req.params.id, total, isv: isvTot });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch {}
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        handleDbError(res, err);
    } finally { client.release(); }
});

const COTIZACION_ESTADOS = new Set(['Emitida', 'Aceptada', 'Vencida', 'Convertida']);
router.patch('/cotizaciones/:id/estado', authenticateToken, async (req, res) => {
    try {
        const { estado } = req.body;
        if (!COTIZACION_ESTADOS.has(estado)) {
            return res.status(400).json({ error: `estado inválido: ${estado}` });
        }
        const r = await pool.query(
            `UPDATE cotizaciones SET estado = $1, fecha_actualizacion = NOW()
             WHERE codigo = $2 AND tenant_id = $3 AND estado <> 'Convertida'
             RETURNING codigo`,
            [estado, req.params.id, req.tenantId]
        );
        if (!r.rows.length) {
            return res.status(409).json({ error: 'Cotización no encontrada o ya convertida' });
        }
        res.json({ message: 'Estado actualizado', codigo: r.rows[0].codigo, estado });
    } catch(e) { handleDbError(res, e); }
});

router.post('/ventas', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { identidadCliente, tipoCompra, total, detalles, isv, descuento, montoPrima, montoFinanciado, clientMutationId, codCotizacion } = req.body;
        const { codUsuario } = req.user;

        const toSafeNum = (v) => { const n = parseFloat(v); return isFinite(n) && n >= 0 ? n : null; };
        const totalNum = toSafeNum(total);
        if (totalNum === null) return res.status(400).json({ error: 'total debe ser un número positivo' });
        if (toSafeNum(isv)             === null && isv             != null) return res.status(400).json({ error: 'isv inválido' });
        if (toSafeNum(descuento)       === null && descuento       != null) return res.status(400).json({ error: 'descuento inválido' });
        if (toSafeNum(montoPrima)      === null && montoPrima      != null) return res.status(400).json({ error: 'montoPrima inválido' });
        if (toSafeNum(montoFinanciado) === null && montoFinanciado != null) return res.status(400).json({ error: 'montoFinanciado inválido' });

        if (!Array.isArray(detalles) || detalles.length === 0) {
            return res.status(400).json({ error: 'detalles debe ser un arreglo con al menos un ítem' });
        }
        for (const item of detalles) {
            if (toSafeNum(item.cantidad) === null || Number(item.cantidad) <= 0) return res.status(400).json({ error: 'cantidad de ítem inválida' });
            if (toSafeNum(item.precioVenta) === null) return res.status(400).json({ error: 'precioVenta de ítem inválido' });
            if (item.tipoIsv && !TIPOS_ISV_VALIDOS.has(item.tipoIsv)) return res.status(400).json({ error: `tipoIsv inválido: ${item.tipoIsv}` });
        }

        const tipoDocumentoVenta = normalizeSaleDocumentType(req.body);

        await client.query('BEGIN');

        if (clientMutationId) {
            const existing = await client.query(
                'SELECT codVenta FROM ventas WHERE tenant_id = $1 AND client_mutation_id = $2',
                [req.tenantId, clientMutationId]
            );
            if (existing.rows.length) {
                await client.query('COMMIT');
                return res.status(200).json({ codVenta: existing.rows[0].codventa, duplicate: true });
            }
        }

        const userRes = await client.query(
            `SELECT u.idCaja, c.estado AS "estadoCaja", c.id_sucursal AS "idSucursalCaja"
             FROM usuarios u
             LEFT JOIN caja c ON c.idCaja = u.idCaja AND c.tenant_id = u.tenant_id
             WHERE u.codUsuario = $1 AND u.tenant_id = $2`,
            [codUsuario, req.tenantId]
        );
        const idCajaActual = userRes.rows[0]?.idcaja;
        if (!idCajaActual || idCajaActual === 'Sin Caja') {
            throw httpError(
                400,
                'No puede facturar porque su usuario no tiene una caja asignada. Solicite a un administrador que le asigne una caja activa.',
                'USER_WITHOUT_CASH_REGISTER'
            );
        }
        if (!userRes.rows[0]?.estadoCaja) {
            throw httpError(
                400,
                'La caja asignada a su usuario ya no existe. Solicite al administrador revisar su asignacion.',
                'ASSIGNED_CASH_REGISTER_NOT_FOUND'
            );
        }
        if (userRes.rows[0].estadoCaja !== 'Activo') {
            throw httpError(
                400,
                'La caja asignada a su usuario esta inactiva. Solicite al administrador activar o reasignar la caja.',
                'ASSIGNED_CASH_REGISTER_INACTIVE'
            );
        }
        const idSucursalCaja = userRes.rows[0]?.idSucursalCaja;
        if (!idSucursalCaja) {
            throw httpError(
                400,
                'La caja asignada no tiene una sucursal configurada. Solicite al administrador revisar la caja.',
                'CASH_REGISTER_WITHOUT_BRANCH'
            );
        }

        const activeArqueo = await client.query(
            "SELECT idArqueo FROM arqueo WHERE idCaja = $1 AND estado = 'Activo' AND tenant_id = $2 LIMIT 1",
            [idCajaActual, req.tenantId]
        );
        if (activeArqueo.rows.length === 0) {
            throw httpError(
                409,
                'No puede facturar porque no hay un turno de caja abierto. Abra caja antes de procesar ventas.',
                'CASH_REGISTER_NOT_OPEN'
            );
        }

        const hndTime = getLocalTimestamp();
        const codVenta = await generateNextId('ventas', 'codVenta', 'FACT', client);
        const numeroFactura = tipoDocumentoVenta === 'factura_fiscal'
            ? await generateFacturaCorrelativo(req.tenantId, client)
            : null;

        // Insert parent ventas row first so detalleventa FK constraint is satisfied
        await client.query(
            `INSERT INTO ventas
             (codVenta, fecha, codVendedor, identidadCliente, total, estado, tipoCompra, isv, descuento, monto_prima, monto_financiamiento, idCaja, tenant_id, client_mutation_id, numero_factura, tipo_documento)
             VALUES ($1,$2,$3,$4,$5,'Completada',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [codVenta, hndTime, codUsuario, identidadCliente, total,
             tipoCompra, isv || 0, descuento || 0, montoPrima || 0, montoFinanciado || 0, idCajaActual, req.tenantId, clientMutationId || null, numeroFactura, tipoDocumentoVenta]
        );

        for (const item of detalles) {
            if (item.tipoProducto === 'SERVICIO') {
                const tipoIsv = item.tipoIsv || 'exento';
                const { subExento, subGravado, isvLinea } = calcularIsvLinea(item.precioVenta, item.cantidad, tipoIsv);
                const codDetalle = await generateNextId('detalleventa', 'codDetalleVenta', 'PROD', client);
                await client.query(
                    `INSERT INTO detalleventa
                     (codDetalleVenta, idVenta, producto, cantidad, precioUnitario, tipoProducto,
                      id_servicio, tipo_isv, subtotal_exento, subtotal_gravado, isv_linea, tenant_id)
                     VALUES ($1,$2,$3,$4,$5,'SERVICIO',$6,$7,$8,$9,$10,$11)`,
                    [codDetalle, codVenta, item.descripcionProducto || 'Servicio veterinario',
                     item.cantidad, item.precioVenta, item.id_servicio || item.id_presentacion || null,
                     tipoIsv, subExento, subGravado, isvLinea, req.tenantId]
                );
                continue;
            }

            if (item.tipoProducto !== 'MEDICAMENTO' || !item.id_medicamento) continue;

            const presR = await client.query(
                'SELECT factor_conversion FROM presentaciones_venta WHERE id_presentacion = $1 AND tenant_id = $2',
                [item.id_presentacion, req.tenantId]
            );
            const factor = presR.rows[0] ? Number(presR.rows[0].factor_conversion) : 1;
            const cantidadBase = Number(item.cantidad) * factor;

            const sucursalLotes = item.id_sucursal_origen || idSucursalCaja;
            const lotesR = await client.query(
                `SELECT id_lote, cantidad_actual FROM lotes_medicamento
                 WHERE id_medicamento = $1 AND estado = 'Activo' AND cantidad_actual > 0
                   AND id_sucursal = $2
                   AND tenant_id = $3
                 ORDER BY fecha_vencimiento ASC`,
                [item.id_medicamento, sucursalLotes, req.tenantId]
            );

            const { plan: planLotes, primaryLoteId } = asignarLotesFefo(
                lotesR.rows, cantidadBase,
                { descripcion: item.descripcionProducto || item.id_medicamento }
            );
            for (const p of planLotes) {
                await client.query(
                    'UPDATE lotes_medicamento SET cantidad_actual = cantidad_actual - $1 WHERE id_lote = $2 AND tenant_id = $3',
                    [p.deduct, p.id_lote, req.tenantId]
                );
            }

            const tipoIsv = item.tipoIsv || 'exento';
            const { subExento, subGravado, isvLinea } = calcularIsvLinea(item.precioVenta, item.cantidad, tipoIsv);

            const nombreProd = item.descripcionProducto || item.id_medicamento;
            const codDetalle = await generateNextId('detalleventa', 'codDetalleVenta', 'PROD', client);
            await client.query(
                `INSERT INTO detalleventa
                 (codDetalleVenta, idVenta, producto, cantidad, precioUnitario, tipoProducto,
                  id_lote, id_presentacion, cantidad_base_descontada, tipo_isv,
                  subtotal_exento, subtotal_gravado, isv_linea, tenant_id)
                 VALUES ($1,$2,$3,$4,$5,'MEDICAMENTO',$6,$7,$8,$9,$10,$11,$12,$13)`,
                [codDetalle, codVenta, nombreProd, item.cantidad, item.precioVenta,
                 primaryLoteId, item.id_presentacion || null, cantidadBase, tipoIsv,
                 subExento, subGravado, isvLinea, req.tenantId]
            );
        }

        await updateArqueoBalance(idCajaActual, client, req.tenantId);

        // Si la venta proviene de una cotización, la marca como Convertida (misma transacción).
        if (codCotizacion) {
            await client.query(
                `UPDATE cotizaciones SET estado = 'Convertida', venta_codigo = $1, fecha_actualizacion = NOW()
                 WHERE codigo = $2 AND tenant_id = $3 AND estado <> 'Convertida'`,
                [codVenta, codCotizacion, req.tenantId]
            );
        }

        await client.query('COMMIT');

        // Post-commit: create delivery records for cross-branch items (non-transactional)
        const crossItems = detalles.filter(d => d.tipoProducto === 'MEDICAMENTO'
            && d.id_sucursal_origen
            && d.id_sucursal_origen !== idSucursalCaja);
        if (crossItems.length > 0) {
            let nombreCliente = 'Consumidor Final';
            let nombreSucursalFacturacion = idSucursalCaja ? `Sucursal ${idSucursalCaja}` : 'Sucursal facturadora';
            if (identidadCliente) {
                try {
                    const cli = await pool.query(
                        'SELECT nombre, apellido FROM clientes WHERE identidad=$1 AND tenant_id=$2',
                        [identidadCliente, req.tenantId]
                    );
                    if (cli.rows[0]) nombreCliente = `${cli.rows[0].nombre} ${cli.rows[0].apellido || ''}`.trim();
                } catch {}
            }
            if (idSucursalCaja) {
                try {
                    const suc = await pool.query(
                        'SELECT nombre FROM sucursales WHERE id_sucursal=$1 AND tenant_id=$2',
                        [idSucursalCaja, req.tenantId]
                    );
                    if (suc.rows[0]?.nombre) nombreSucursalFacturacion = suc.rows[0].nombre;
                } catch {}
            }
            for (const item of crossItems) {
                try {
                    await pool.query(`
                        INSERT INTO entregas_sucursal
                          (tenant_id,cod_venta,id_sucursal_facturacion,id_sucursal_origen,
                           id_medicamento,nombre_medicamento,cantidad,identidad_cliente,nombre_cliente)
                        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                        [req.tenantId, codVenta, idSucursalCaja, item.id_sucursal_origen,
                         item.id_medicamento, item.descripcionProducto || item.id_medicamento,
                         item.cantidad, identidadCliente || null, nombreCliente]
                    );
                    /* await pool.query(`
                        INSERT INTO notificaciones(tenant_id,tipo,titulo,cuerpo,leida,fecha_creacion)
                        VALUES($1,'entrega_pendiente',$2,$3,FALSE,NOW())`,
                        [req.tenantId,
                         `Entrega pendiente — ${item.descripcionProducto || item.id_medicamento}`,
                         `Factura ${codVenta}: Cliente ${nombreCliente} retirará ${item.cantidad} ud(s). Facturado en ${nombreSucursalFacturacion}.`]
                    ); */
                    const notificationTitle = `Entrega pendiente - ${item.descripcionProducto || item.id_medicamento}`;
                    const notificationBody = `Factura ${codVenta}: Cliente ${nombreCliente} retirara ${item.cantidad} ud(s). Facturado en ${nombreSucursalFacturacion}.`;
                    const targetUsers = await pool.query(
                        `SELECT usuario
                         FROM usuarios
                         WHERE tenant_id = $1
                           AND id_sucursal = $2
                           AND estado = 'Activo'
                         ORDER BY usuario`,
                        [req.tenantId, item.id_sucursal_origen]
                    );

                    if (targetUsers.rows.length > 0) {
                        for (const user of targetUsers.rows) {
                            await pool.query(`
                                INSERT INTO notificaciones
                                  (tenant_id,tipo,titulo,cuerpo,para_usuario,id_sucursal,leida,fecha_creacion)
                                VALUES($1,'entrega_pendiente',$2,$3,$4,$5,FALSE,NOW())`,
                                [req.tenantId, notificationTitle, notificationBody, user.usuario, item.id_sucursal_origen]
                            );
                        }
                    } else {
                        await pool.query(`
                            INSERT INTO notificaciones
                              (tenant_id,tipo,titulo,cuerpo,id_sucursal,leida,fecha_creacion)
                            VALUES($1,'entrega_pendiente',$2,$3,$4,FALSE,NOW())`,
                            [req.tenantId, notificationTitle, notificationBody, item.id_sucursal_origen]
                        );
                    }
                } catch (e) { console.error('[salesRoutes] entrega record error:', e.message); }
            }
        }

        res.status(201).json({ codVenta, numeroFactura, tipoDocumento: tipoDocumentoVenta });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505' && req.body?.clientMutationId) {
            try {
                const existing = await pool.query(
                    'SELECT codVenta FROM ventas WHERE tenant_id = $1 AND client_mutation_id = $2',
                    [req.tenantId, req.body.clientMutationId]
                );
                if (existing.rows.length) return res.status(200).json({ codVenta: existing.rows[0].codventa, duplicate: true });
            } catch {}
        }
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        handleDbError(res, err);
    } finally { client.release(); }
});

router.put('/ventas/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const codVenta = req.params.id;
        const { identidadCliente, tipoCompra, total, detalles, isv, descuento, montoPrima, montoFinanciado } = req.body;

        await client.query('BEGIN');

        const ventaRes = await client.query(
            `SELECT v.codVenta, v.idCaja, c.id_sucursal AS "idSucursalCaja"
             FROM ventas v
             LEFT JOIN caja c ON c.idCaja = v.idCaja AND c.tenant_id = v.tenant_id
             WHERE v.codVenta = $1 AND v.tenant_id = $2`,
            [codVenta, req.tenantId]
        );
        if (ventaRes.rows.length === 0) throw new Error('Venta no encontrada');
        const idCajaActual = ventaRes.rows[0].idcaja;
        const idSucursalCaja = ventaRes.rows[0].idSucursalCaja;
        if (!idSucursalCaja) throw new Error('La caja de la venta no tiene una sucursal configurada.');

        // Restore FEFO lot stock from old details before deleting them
        const oldDetails = await client.query(
            'SELECT * FROM detalleventa WHERE idVenta = $1 AND tenant_id = $2',
            [codVenta, req.tenantId]
        );
        for (const d of oldDetails.rows) {
            if (d.tipoproducto === 'MEDICAMENTO' && d.cantidad_base_descontada && d.id_lote) {
                await client.query(
                    'UPDATE lotes_medicamento SET cantidad_actual = cantidad_actual + $1 WHERE id_lote = $2 AND tenant_id = $3',
                    [d.cantidad_base_descontada, d.id_lote, req.tenantId]
                );
            }
        }
        await client.query(
            'DELETE FROM detalleventa WHERE idVenta = $1 AND tenant_id = $2',
            [codVenta, req.tenantId]
        );

        for (const item of detalles) {
            if (item.tipoProducto === 'SERVICIO') {
                const tipoIsv = item.tipoIsv || 'exento';
                const { subExento, subGravado, isvLinea } = calcularIsvLinea(item.precioVenta, item.cantidad, tipoIsv);
                const codDetalle = await generateNextId('detalleventa', 'codDetalleVenta', 'PROD', client);
                await client.query(
                    `INSERT INTO detalleventa
                     (codDetalleVenta, idVenta, producto, cantidad, precioUnitario, tipoProducto,
                      id_servicio, tipo_isv, subtotal_exento, subtotal_gravado, isv_linea, tenant_id)
                     VALUES ($1,$2,$3,$4,$5,'SERVICIO',$6,$7,$8,$9,$10,$11)`,
                    [codDetalle, codVenta, item.descripcionProducto || 'Servicio veterinario',
                     item.cantidad, item.precioVenta, item.id_servicio || item.id_presentacion || null,
                     tipoIsv, subExento, subGravado, isvLinea, req.tenantId]
                );
                continue;
            }

            if (item.tipoProducto !== 'MEDICAMENTO' || !item.id_medicamento) continue;

            const presR = await client.query(
                'SELECT factor_conversion FROM presentaciones_venta WHERE id_presentacion = $1 AND tenant_id = $2',
                [item.id_presentacion, req.tenantId]
            );
            const factor = presR.rows[0] ? Number(presR.rows[0].factor_conversion) : 1;
            const cantidadBase = Number(item.cantidad) * factor;

            const sucursalLotes = item.id_sucursal_origen || idSucursalCaja;
            const lotesR = await client.query(
                `SELECT id_lote, cantidad_actual FROM lotes_medicamento
                 WHERE id_medicamento = $1 AND estado = 'Activo' AND cantidad_actual > 0
                   AND id_sucursal = $2
                   AND tenant_id = $3
                 ORDER BY fecha_vencimiento ASC`,
                [item.id_medicamento, sucursalLotes, req.tenantId]
            );

            const { plan: planLotes, primaryLoteId } = asignarLotesFefo(
                lotesR.rows, cantidadBase,
                { descripcion: item.descripcionProducto || item.id_medicamento }
            );
            for (const p of planLotes) {
                await client.query(
                    'UPDATE lotes_medicamento SET cantidad_actual = cantidad_actual - $1 WHERE id_lote = $2 AND tenant_id = $3',
                    [p.deduct, p.id_lote, req.tenantId]
                );
            }

            const tipoIsv = item.tipoIsv || 'exento';
            const { subExento, subGravado, isvLinea } = calcularIsvLinea(item.precioVenta, item.cantidad, tipoIsv);

            const nombreProd = item.descripcionProducto || item.id_medicamento;
            const codDetalle = await generateNextId('detalleventa', 'codDetalleVenta', 'PROD', client);
            await client.query(
                `INSERT INTO detalleventa
                 (codDetalleVenta, idVenta, producto, cantidad, precioUnitario, tipoProducto,
                  id_lote, id_presentacion, cantidad_base_descontada, tipo_isv,
                  subtotal_exento, subtotal_gravado, isv_linea, tenant_id)
                 VALUES ($1,$2,$3,$4,$5,'MEDICAMENTO',$6,$7,$8,$9,$10,$11,$12,$13)`,
                [codDetalle, codVenta, nombreProd, item.cantidad, item.precioVenta,
                 primaryLoteId, item.id_presentacion || null, cantidadBase, tipoIsv,
                 subExento, subGravado, isvLinea, req.tenantId]
            );
        }

        await client.query(
            `UPDATE ventas SET identidadCliente=$1, tipoCompra=$2, total=$3, isv=$4, descuento=$5,
             monto_prima=$6, monto_financiamiento=$7 WHERE codVenta=$8 AND tenant_id=$9`,
            [identidadCliente, tipoCompra, total, isv || 0, descuento || 0, montoPrima || 0, montoFinanciado || 0, codVenta, req.tenantId]
        );

        await updateArqueoBalance(idCajaActual, client, req.tenantId);
        await client.query('COMMIT');
        res.json({ codVenta });
    } catch (err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

router.put('/ventas/:id/anular', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { codUsuario } = req.user;
        const motivo = req.body?.motivo || 'Anulada por usuario';

        const isAdmin = ['administrador','admin','superadmin'].includes(String(req.user?.rol||'').toLowerCase());
        if (!isAdmin && !req.user?.permisos?.includes('ANULAR_VENTA')) {
            return res.status(403).json({ error: 'Permiso ANULAR_VENTA requerido', code: 'FORBIDDEN' });
        }

        await client.query('BEGIN');

        const vRes = await client.query(
            'SELECT codVenta, idCaja, estado FROM ventas WHERE codVenta = $1 AND tenant_id = $2',
            [id, req.tenantId]
        );
        if (vRes.rows.length === 0) throw new Error('Venta no encontrada');
        if (vRes.rows[0].estado === 'Anulada') throw new Error('La venta ya está anulada');
        const idCajaActual = vRes.rows[0].idcaja;

        if (req.tenantId) await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [req.tenantId]);
        const spResult = await anularVenta(id, codUsuario, motivo, client, req.tenantId);

        if (!spResult) {
            // Fallback manual: revert FEFO lot stock
            await client.query(
                "UPDATE ventas SET estado = 'Anulada', updated_at = NOW(), updated_by = $2 WHERE codVenta = $1 AND tenant_id = $3",
                [id, codUsuario, req.tenantId]
            );
            const details = await client.query(
                'SELECT * FROM detalleventa WHERE idVenta = $1 AND tenant_id = $2',
                [id, req.tenantId]
            );
            for (const d of details.rows) {
                if (d.tipoproducto === 'MEDICAMENTO' && d.cantidad_base_descontada && d.id_lote) {
                    await client.query(
                        'UPDATE lotes_medicamento SET cantidad_actual = cantidad_actual + $1 WHERE id_lote = $2 AND tenant_id = $3',
                        [d.cantidad_base_descontada, d.id_lote, req.tenantId]
                    );
                }
            }
        }

        await updateArqueoBalance(idCajaActual, client, req.tenantId);
        await client.query('COMMIT');
        res.json({ message: 'Venta anulada', codVenta: id });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

module.exports = router;
