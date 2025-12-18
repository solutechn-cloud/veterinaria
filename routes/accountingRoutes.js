
const express = require('express');
const router = express.Router();
const { pool, handleDbError, updateArqueoBalance } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- AUDITORÍA DE MOVIMIENTOS ---
router.get('/audit/transactions', authenticateToken, async (req, res) => {
    try {
        const { date } = req.query;
        let where = "1=1";
        const params = [];
        if (date) { where = "TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $1"; params.push(date); }

        const query = `
            (SELECT 
                'INGRESO' as tipo, idIngreso as id, idCaja as "idCaja", descripcion, monto, costo, 
                TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as fecha, estado, 'Venta/Servicio' as categoria,
                NULL as id_socio_asignado, NULL as nombre_socio
             FROM ingresos WHERE ${where})
            UNION ALL
            (SELECT 
                'EGRESO' as tipo, idegresos as id, idCaja as "idCaja", descripcion, monto, 0 as costo, 
                TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as fecha, estado, categoria,
                e.id_socio_asignado, s.nombre as nombre_socio
             FROM egresos e
             LEFT JOIN socios s ON e.id_socio_asignado = s.id_socio
             WHERE ${where})
            ORDER BY fecha DESC
        `;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- REPORTE DE RENTABILIDAD POR PERIODOS ---
router.get('/report/profitability', authenticateToken, async (req, res) => {
    try {
        const { date } = req.query; 
        if (!date) return res.status(400).json({ error: 'Fecha requerida' });

        const getMetrics = async (start, end) => {
            const ing = await pool.query(`SELECT COALESCE(SUM(monto),0) as ing, COALESCE(SUM(costo),0) as cst FROM ingresos WHERE fechaCreacion BETWEEN $1 AND $2`, [start, end]);
            
            // Gastos Operativos (Generales del negocio - Sin socio asignado)
            const opexGeneral = await pool.query(`SELECT COALESCE(SUM(monto),0) as tot FROM egresos WHERE categoria = 'Gasto Operativo' AND id_socio_asignado IS NULL AND fechaCreacion BETWEEN $1 AND $2`, [start, end]);
            
            // Inversiones (No afectan ganancia)
            const inv = await pool.query(`SELECT COALESCE(SUM(monto),0) as tot FROM egresos WHERE categoria = 'Compra de Producto' AND fechaCreacion BETWEEN $1 AND $2`, [start, end]);

            // Gastos por Socio (Para deducción individual)
            const opexSocios = await pool.query(`SELECT id_socio_asignado, COALESCE(SUM(monto),0) as total FROM egresos WHERE id_socio_asignado IS NOT NULL AND fechaCreacion BETWEEN $1 AND $2 GROUP BY 1`, [start, end]);

            const ingresos = Number(ing.rows[0].ing);
            const costos = Number(ing.rows[0].cst);
            const utilBruta = ingresos - costos;
            const gastosGral = Number(opexGeneral.rows[0].tot);
            const utilNetaNegocio = utilBruta - gastosGral;

            return { 
                ingresos, costos, utilBruta, gastosGral, utilNetaNegocio, 
                inversion: Number(inv.rows[0].tot),
                personalDeductions: opexSocios.rows 
            };
        };

        const d = new Date(date);
        const dayStart = `${date} 00:00:00`, dayEnd = `${date} 23:59:59`;
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0] + ' 00:00:00', monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0] + ' 23:59:59';
        const yearStart = `${d.getFullYear()}-01-01 00:00:00`, yearEnd = `${d.getFullYear()}-12-31 23:59:59`;

        const [daily, monthly, yearly] = await Promise.all([ getMetrics(dayStart, dayEnd), getMetrics(monthStart, monthEnd), getMetrics(yearStart, yearEnd) ]);

        const socios = await pool.query("SELECT id_socio, nombre, porcentaje_participacion FROM socios WHERE estado = 'Activo'");
        const distribucion = socios.rows.map(s => {
            const dedDia = Number(daily.personalDeductions.find(pd => pd.id_socio_asignado === s.id_socio)?.total || 0);
            const dedMes = Number(monthly.personalDeductions.find(pd => pd.id_socio_asignado === s.id_socio)?.total || 0);
            const dedAnio = Number(yearly.personalDeductions.find(pd => pd.id_socio_asignado === s.id_socio)?.total || 0);

            return {
                socio: s.nombre,
                porcentaje: s.porcentaje_participacion,
                gananciaDia: (daily.utilNetaNegocio * (s.porcentaje_participacion / 100)) - dedDia,
                gananciaMes: (monthly.utilNetaNegocio * (s.porcentaje_participacion / 100)) - dedMes,
                gananciaAnio: (yearly.utilNetaNegocio * (s.porcentaje_participacion / 100)) - dedAnio,
                deduccionDia: dedDia
            };
        });

        res.json({ daily, monthly, yearly, distribucion });
    } catch(e) { handleDbError(res, e); }
});

router.get('/socios', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT id_socio as "idSocio", nombre, porcentaje_participacion as "porcentajeParticipacion", estado FROM socios ORDER BY id_socio');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.put('/audit/transactions/:tipo/:id', authenticateToken, async (req, res) => {
    try {
        const { tipo, id } = req.params;
        const { descripcion, monto, costo, categoria, id_socio_asignado } = req.body;
        let idCaja = null;
        if (tipo === 'INGRESO') {
            const r = await pool.query('UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4 RETURNING idCaja', [descripcion, monto, costo, id]);
            idCaja = r.rows[0]?.idcaja;
        } else {
            const socioId = id_socio_asignado === "" ? null : id_socio_asignado;
            const r = await pool.query('UPDATE egresos SET descripcion=$1, monto=$2, categoria=$3, id_socio_asignado=$4 WHERE idegresos=$5 RETURNING idCaja', [descripcion, monto, categoria, socioId, id]);
            idCaja = r.rows[0]?.idcaja;
        }
        if (idCaja) await updateArqueoBalance(idCaja);
        res.json({ message: 'Sincronizado con éxito' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
