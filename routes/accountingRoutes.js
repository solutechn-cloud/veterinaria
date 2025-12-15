
const express = require('express');
const router = express.Router();
const { pool, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- SOCIOS ---
router.get('/accounting/socios', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_socio as "idSocio", nombre, porcentaje_participacion as "porcentajeParticipacion", estado, fecha_ingreso as "fechaIngreso"
            FROM socios ORDER BY id_socio
        `);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/accounting/socios', authenticateToken, async (req, res) => {
    try {
        const { nombre, porcentajeParticipacion } = req.body;
        await pool.query(
            `INSERT INTO socios (nombre, porcentaje_participacion) VALUES ($1, $2)`,
            [nombre, porcentajeParticipacion]
        );
        res.status(201).json({ message: 'Socio creado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/accounting/socios/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, porcentajeParticipacion, estado } = req.body;
        await pool.query(
            `UPDATE socios SET nombre=$1, porcentaje_participacion=$2, estado=$3 WHERE id_socio=$4`,
            [nombre, porcentajeParticipacion, estado, req.params.id]
        );
        res.json({ message: 'Socio actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/accounting/socios/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM socios WHERE id_socio=$1', [req.params.id]);
        res.json({ message: 'Socio eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- GASTOS CONTABLES (Generales y Por Socio) ---
router.get('/accounting/gastos', authenticateToken, async (req, res) => {
    try {
        const { start, end } = req.query;
        let query = `
            SELECT 
                g.id_gasto as "idGasto", g.descripcion, g.monto, TO_CHAR(g.fecha, 'YYYY-MM-DD') as "fecha", 
                g.categoria, g.id_socio_asignado as "idSocioAsignado", g.origen_fondo as "origenFondo",
                s.nombre as "nombreSocio"
            FROM gastos_contables g
            LEFT JOIN socios s ON g.id_socio_asignado = s.id_socio
            WHERE 1=1
        `;
        const params = [];
        if(start && end) {
            query += ` AND g.fecha BETWEEN $1 AND $2`;
            params.push(start, end);
        }
        query += ` ORDER BY g.fecha DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/accounting/gastos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, fecha, categoria, idSocioAsignado, origenFondo } = req.body;
        await pool.query(
            `INSERT INTO gastos_contables (descripcion, monto, fecha, categoria, id_socio_asignado, origen_fondo) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [descripcion, monto, fecha, categoria, idSocioAsignado || null, origenFondo]
        );
        res.status(201).json({ message: 'Gasto registrado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/accounting/gastos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, fecha, categoria, idSocioAsignado, origenFondo } = req.body;
        await pool.query(
            `UPDATE gastos_contables 
             SET descripcion=$1, monto=$2, fecha=$3, categoria=$4, id_socio_asignado=$5, origen_fondo=$6 
             WHERE id_gasto=$7`,
            [descripcion, monto, fecha, categoria, idSocioAsignado || null, origenFondo, req.params.id]
        );
        res.json({ message: 'Gasto actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/accounting/gastos/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM gastos_contables WHERE id_gasto=$1', [req.params.id]);
        res.json({ message: 'Gasto eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- REPORTE FINANCIERO Y DISTRIBUCIÓN ---
router.get('/accounting/report', authenticateToken, async (req, res) => {
    try {
        const { month, year } = req.query; // e.g. month=10, year=2023
        
        // 1. Obtener Ingresos por Ventas (Tabla 'ingresos' donde descripcion like 'Venta%' o 'Recarga%')
        const ingresosRes = await pool.query(`
            SELECT COALESCE(SUM(monto), 0) as total, COALESCE(SUM(costo), 0) as costo
            FROM ingresos 
            WHERE EXTRACT(MONTH FROM fechaCreacion) = $1 AND EXTRACT(YEAR FROM fechaCreacion) = $2
        `, [month, year]);
        
        const ingresosVentas = Number(ingresosRes.rows[0].total);
        const costoVentas = Number(ingresosRes.rows[0].costo);
        const utilidadBruta = ingresosVentas - costoVentas;

        // 2. Obtener Gastos Operativos (Tabla 'gastos_contables' donde id_socio_asignado IS NULL)
        const gastosOpRes = await pool.query(`
            SELECT COALESCE(SUM(monto), 0) as total
            FROM gastos_contables
            WHERE EXTRACT(MONTH FROM fecha) = $1 AND EXTRACT(YEAR FROM fecha) = $2
            AND id_socio_asignado IS NULL
        `, [month, year]);
        
        const gastosOperativos = Number(gastosOpRes.rows[0].total);
        const utilidadNeta = utilidadBruta - gastosOperativos;

        // 3. Obtener Socios y calcular distribución
        const sociosRes = await pool.query('SELECT id_socio, nombre, porcentaje_participacion FROM socios WHERE estado = \'Activo\'');
        
        const distribucion = await Promise.all(sociosRes.rows.map(async (socio) => {
            const porcentaje = Number(socio.porcentaje_participacion);
            const utilidadCorrespondiente = (utilidadNeta * porcentaje) / 100;

            // 4. Buscar gastos personales de este socio en el periodo (Adelantos)
            const gastosPersonalesRes = await pool.query(`
                SELECT COALESCE(SUM(monto), 0) as total
                FROM gastos_contables
                WHERE EXTRACT(MONTH FROM fecha) = $1 AND EXTRACT(YEAR FROM fecha) = $2
                AND id_socio_asignado = $3
            `, [month, year, socio.id_socio]);
            
            const gastosPersonales = Number(gastosPersonalesRes.rows[0].total);

            return {
                socio: socio.nombre,
                porcentaje: porcentaje,
                utilidadCorrespondiente: utilidadCorrespondiente,
                gastosPersonalesDeducidos: gastosPersonales,
                pagoFinal: utilidadCorrespondiente - gastosPersonales
            };
        }));

        res.json({
            periodo: `${month}/${year}`,
            ingresosVentas,
            costoVentas,
            utilidadBruta,
            gastosOperativos,
            utilidadNeta,
            distribucion
        });

    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
