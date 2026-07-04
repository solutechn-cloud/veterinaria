const express = require('express');
const router = express.Router();
const { pool, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- AUDITORÍA DE VENTAS ---
router.get('/audit/transactions', authenticateToken, async (req, res) => {
    try {
        const { date, startDate, endDate, estado, numeroFactura } = req.query;
        const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
        const params = [];
        let where = '1=1';

        if (startDate && endDate) {
            if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
                return res.status(400).json({ error: 'Formato de fecha inválido. Use YYYY-MM-DD' });
            }
            where = 'v.fecha BETWEEN $1 AND $2';
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        } else if (date) {
            if (!DATE_RE.test(date)) {
                return res.status(400).json({ error: 'Formato de fecha inválido. Use YYYY-MM-DD' });
            }
            where = "TO_CHAR(v.fecha, 'YYYY-MM-DD') = $1";
            params.push(date);
        }

        if (estado) { params.push(estado); where += ` AND v.estado = $${params.length}`; }
        if (numeroFactura) { params.push(`%${numeroFactura}%`); where += ` AND v.numero_factura ILIKE $${params.length}`; }

        params.push(req.tenantId);
        const tidx = params.length;
        where += ` AND v.tenant_id = $${tidx}`;

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

        const countResult = await pool.query(`
            SELECT COUNT(*)::int AS total FROM ventas v WHERE ${where}
        `, params);

        const result = await pool.query(`
            SELECT
                v.codVenta      AS id,
                v.numero_factura AS "numeroFactura",
                v.numero_no_fiscal AS "numeroNoFiscal",
                v.total         AS monto,
                v.estado,
                v.tipoCompra    AS categoria,
                v.idCaja        AS "idCaja",
                TO_CHAR(v.fecha, 'YYYY-MM-DD HH24:MI:SS') AS fecha,
                COALESCE(c.nombre || ' ' || c.apellido, 'Consumidor Final') AS cliente,
                COALESCE(e.nombre || ' ' || e.apellido, u.usuario) AS vendedor
            FROM ventas v
            LEFT JOIN clientes c ON v.identidadCliente = c.identidad AND c.tenant_id = $${tidx}
            LEFT JOIN usuarios u ON v.codVendedor::text = u.codUsuario::text AND u.tenant_id = $${tidx}
            LEFT JOIN empleado e ON u.identidad = e.identidad AND e.tenant_id = $${tidx}
            WHERE ${where}
            ORDER BY v.fecha DESC
            LIMIT $${tidx + 1} OFFSET $${tidx + 2}
        `, [...params, limit, offset]);
        res.json({ rows: result.rows, total: countResult.rows[0].total, limit, offset });
    } catch(e) { handleDbError(res, e); }
});

// --- REPORTE DE RENTABILIDAD ---
router.get('/report/profitability', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'startDate y endDate requeridos' });

        const start = `${startDate} 00:00:00`;
        const end   = `${endDate} 23:59:59`;

        const [ventasRow, costoRow] = await Promise.all([
            pool.query(
                `SELECT COUNT(*) as num_facturas,
                        COALESCE(SUM(total), 0)          AS ingresos,
                        COALESCE(SUM(isv_calculado), 0)  AS isv_total
                 FROM ventas
                 WHERE fecha BETWEEN $1 AND $2 AND estado = 'Completada' AND tenant_id = $3`,
                [start, end, req.tenantId]
            ),
            pool.query(
                `SELECT COALESCE(
                    SUM(dv.cantidad_base_descontada * COALESCE(l.precio_compra_unitario, 0)), 0
                 ) AS costos
                 FROM detalleventa dv
                 JOIN ventas v ON dv.idVenta = v.codVenta
                 LEFT JOIN lotes_medicamento l ON dv.id_lote = l.id_lote
                 WHERE v.fecha BETWEEN $1 AND $2
                   AND v.estado = 'Completada'
                   AND dv.tipoProducto = 'MEDICAMENTO'
                   AND v.tenant_id = $3`,
                [start, end, req.tenantId]
            ),
        ]);

        const ingresos  = Number(ventasRow.rows[0].ingresos);
        const costos    = Number(costoRow.rows[0].costos);
        const utilBruta = ingresos - costos;

        res.json({
            metrics: {
                numFacturas: Number(ventasRow.rows[0].num_facturas),
                ingresos,
                costos,
                utilBruta,
                isvTotal: Number(ventasRow.rows[0].isv_total),
            }
        });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
