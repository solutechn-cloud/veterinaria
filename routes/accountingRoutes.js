const express = require('express');
const router = express.Router();
const { pool, handleDbError, updateArqueoBalance } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- AUDITORÍA DE MOVIMIENTOS ---
router.get('/audit/transactions', authenticateToken, async (req, res) => {
    try {
        const { date, startDate, endDate } = req.query;
        const params = [];
        let whereIngresos = '1=1';
        let whereEgresos = '1=1';

        if (startDate && endDate) {
            whereIngresos = "i.fechaCreacion BETWEEN $1 AND $2";
            whereEgresos = "e.fechaCreacion BETWEEN $1 AND $2";
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        } else if (date) {
            whereIngresos = "TO_CHAR(i.fechaCreacion, 'YYYY-MM-DD') = $1";
            whereEgresos = "TO_CHAR(e.fechaCreacion, 'YYYY-MM-DD') = $1";
            params.push(date);
        }

        const query = `
            (SELECT 'INGRESO' as tipo, i.idIngreso as id, i.idCaja as "idCaja",
                i.descripcion, i.monto, i.costo,
                TO_CHAR(i.fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as fecha,
                i.estado, 'Venta/Servicio' as categoria,
                NULL::integer as id_socio_asignado, NULL::text as nombre_socio
             FROM ingresos i WHERE ${whereIngresos})
            UNION ALL
            (SELECT 'EGRESO' as tipo, e.idegresos as id, e.idCaja as "idCaja",
                e.descripcion, e.monto, 0 as costo,
                TO_CHAR(e.fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as fecha,
                e.estado, e.categoria,
                e.id_socio_asignado, s.nombre as nombre_socio
             FROM egresos e
             LEFT JOIN socios s ON e.id_socio_asignado = s.id_socio
             WHERE ${whereEgresos})
            ORDER BY fecha DESC
        `;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- REPORTE DE RENTABILIDAD ---
router.get('/report/profitability', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'startDate y endDate requeridos' });

        const start = `${startDate} 00:00:00`;
        const end = `${endDate} 23:59:59`;

        const [ingRow, opexRow, invRow, deducRow, sociosRow] = await Promise.all([
            pool.query(
                `SELECT COALESCE(SUM(monto),0) as ing, COALESCE(SUM(costo),0) as cst
                 FROM ingresos WHERE fechaCreacion BETWEEN $1 AND $2`, [start, end]),
            pool.query(
                `SELECT COALESCE(SUM(monto),0) as tot FROM egresos
                 WHERE (categoria = 'Gasto Operativo' OR categoria IS NULL)
                 AND id_socio_asignado IS NULL AND fechaCreacion BETWEEN $1 AND $2`, [start, end]),
            pool.query(
                `SELECT COALESCE(SUM(monto),0) as tot FROM egresos
                 WHERE categoria = 'Compra de Producto' AND fechaCreacion BETWEEN $1 AND $2`, [start, end]),
            pool.query(
                `SELECT id_socio_asignado, COALESCE(SUM(monto),0) as total FROM egresos
                 WHERE id_socio_asignado IS NOT NULL AND fechaCreacion BETWEEN $1 AND $2
                 GROUP BY id_socio_asignado`, [start, end]),
            pool.query(
                `SELECT id_socio, nombre, porcentaje_participacion FROM socios WHERE estado = 'Activo'`)
        ]);

        const ingresos = Number(ingRow.rows[0].ing);
        const costos = Number(ingRow.rows[0].cst);
        const utilBruta = ingresos - costos;
        const gastosGral = Number(opexRow.rows[0].tot);
        const utilNetaNegocio = utilBruta - gastosGral;
        const inversion = Number(invRow.rows[0].tot);

        const metrics = { ingresos, costos, utilBruta, gastosGral, inversion, utilNetaNegocio };

        const distribucion = sociosRow.rows.map(s => {
            const ded = Number(deducRow.rows.find(r => r.id_socio_asignado === s.id_socio)?.total || 0);
            const gananciaBruta = utilNetaNegocio * (s.porcentaje_participacion / 100);
            return {
                socio: s.nombre,
                porcentaje: s.porcentaje_participacion,
                gananciaBruta,
                deduccionPersonal: ded,
                gananciaNeta: gananciaBruta - ded
            };
        });

        res.json({ metrics, distribucion });
    } catch(e) { handleDbError(res, e); }
});

// --- SOCIOS ---
router.get('/socios', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(
            'SELECT id_socio as "idSocio", nombre, porcentaje_participacion as "porcentajeParticipacion", estado FROM socios ORDER BY id_socio');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/socios', authenticateToken, async (req, res) => {
    try {
        const { nombre, porcentaje_participacion, estado } = req.body;
        const r = await pool.query(
            `INSERT INTO socios (nombre, porcentaje_participacion, estado) VALUES ($1, $2, $3)
             RETURNING id_socio as "idSocio", nombre, porcentaje_participacion as "porcentajeParticipacion", estado`,
            [nombre, porcentaje_participacion, estado || 'Activo']);
        res.status(201).json(r.rows[0]);
    } catch(e) { handleDbError(res, e); }
});

router.put('/socios/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, porcentaje_participacion, estado } = req.body;
        const r = await pool.query(
            `UPDATE socios SET nombre=$1, porcentaje_participacion=$2, estado=$3 WHERE id_socio=$4
             RETURNING id_socio as "idSocio", nombre, porcentaje_participacion as "porcentajeParticipacion", estado`,
            [nombre, porcentaje_participacion, estado, req.params.id]);
        if (!r.rows.length) return res.status(404).json({ error: 'Socio no encontrado' });
        res.json(r.rows[0]);
    } catch(e) { handleDbError(res, e); }
});

router.delete('/socios/:id', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('DELETE FROM socios WHERE id_socio=$1 RETURNING id_socio', [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ error: 'Socio no encontrado' });
        res.json({ message: 'Socio eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- REPORTE OPEX ---
router.get('/report/opex', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ error: 'startDate y endDate requeridos' });

        const start = `${startDate} 00:00:00`;
        const end = `${endDate} 23:59:59`;

        const [catRows, socioRows, detRows] = await Promise.all([
            pool.query(
                `SELECT COALESCE(categoria, 'Sin Categoría') as categoria,
                 SUM(monto) as total, COUNT(*) as count
                 FROM egresos
                 WHERE fechaCreacion BETWEEN $1 AND $2
                 GROUP BY COALESCE(categoria, 'Sin Categoría')
                 ORDER BY total DESC`, [start, end]),
            pool.query(
                `SELECT s.nombre as socio, SUM(e.monto) as total
                 FROM egresos e
                 JOIN socios s ON e.id_socio_asignado = s.id_socio
                 WHERE e.id_socio_asignado IS NOT NULL AND e.fechaCreacion BETWEEN $1 AND $2
                 GROUP BY s.nombre ORDER BY total DESC`, [start, end]),
            pool.query(
                `SELECT e.descripcion, e.monto, COALESCE(e.categoria, 'Sin Categoría') as categoria,
                 TO_CHAR(e.fechaCreacion, 'YYYY-MM-DD') as fecha,
                 s.nombre as nombre_socio
                 FROM egresos e
                 LEFT JOIN socios s ON e.id_socio_asignado = s.id_socio
                 WHERE e.fechaCreacion BETWEEN $1 AND $2
                 ORDER BY e.fechaCreacion DESC`, [start, end])
        ]);

        res.json({
            porCategoria: catRows.rows.map(r => ({ categoria: r.categoria, total: Number(r.total), count: Number(r.count) })),
            porSocio: socioRows.rows.map(r => ({ socio: r.socio, total: Number(r.total) })),
            detalles: detRows.rows.map(r => ({ ...r, monto: Number(r.monto) }))
        });
    } catch(e) { handleDbError(res, e); }
});

// --- EDITAR TRANSACCIÓN ---
router.put('/audit/transactions/:tipo/:id', authenticateToken, async (req, res) => {
    try {
        const { tipo, id } = req.params;
        const { descripcion, monto, costo, categoria, id_socio_asignado } = req.body;
        let idCaja = null;
        if (tipo === 'INGRESO') {
            const r = await pool.query(
                'UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4 RETURNING idCaja',
                [descripcion, monto, costo, id]);
            idCaja = r.rows[0]?.idcaja;
        } else {
            const socioId = id_socio_asignado === "" ? null : id_socio_asignado;
            const r = await pool.query(
                'UPDATE egresos SET descripcion=$1, monto=$2, categoria=$3, id_socio_asignado=$4 WHERE idegresos=$5 RETURNING idCaja',
                [descripcion, monto, categoria, socioId, id]);
            idCaja = r.rows[0]?.idcaja;
        }
        if (idCaja) await updateArqueoBalance(idCaja);
        res.json({ message: 'Actualizado correctamente' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
