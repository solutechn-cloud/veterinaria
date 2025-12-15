
const express = require('express');
const router = express.Router();
const { pool, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- SOCIOS (Existing) ---
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

// --- GASTOS CONTABLES (Existing) ---
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

// --- REPORTE FINANCIERO SIMPLE (Existing) ---
router.get('/accounting/report', authenticateToken, async (req, res) => {
    try {
        const { month, year } = req.query; // e.g. month=10, year=2023
        
        const ingresosRes = await pool.query(`
            SELECT COALESCE(SUM(monto), 0) as total, COALESCE(SUM(costo), 0) as costo
            FROM ingresos 
            WHERE EXTRACT(MONTH FROM fechaCreacion) = $1 AND EXTRACT(YEAR FROM fechaCreacion) = $2
        `, [month, year]);
        
        const ingresosVentas = Number(ingresosRes.rows[0].total);
        const costoVentas = Number(ingresosRes.rows[0].costo);
        const utilidadBruta = ingresosVentas - costoVentas;

        const gastosOpRes = await pool.query(`
            SELECT COALESCE(SUM(monto), 0) as total
            FROM gastos_contables
            WHERE EXTRACT(MONTH FROM fecha) = $1 AND EXTRACT(YEAR FROM fecha) = $2
            AND id_socio_asignado IS NULL
        `, [month, year]);
        
        const gastosOperativos = Number(gastosOpRes.rows[0].total);
        const utilidadNeta = utilidadBruta - gastosOperativos;

        const sociosRes = await pool.query('SELECT id_socio, nombre, porcentaje_participacion FROM socios WHERE estado = \'Activo\'');
        
        const distribucion = await Promise.all(sociosRes.rows.map(async (socio) => {
            const porcentaje = Number(socio.porcentaje_participacion);
            const utilidadCorrespondiente = (utilidadNeta * porcentaje) / 100;

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

// ==========================================
// --- ADVANCED ACCOUNTING (COGS & P&L) ---
// ==========================================

// 1. GESTIÓN DE COSTOS DIRECTOS (COGS)
router.get('/accounting/cogs/components', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM cost_components ORDER BY nombre');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/accounting/cogs/components', authenticateToken, async (req, res) => {
    try {
        const { nombre, naturaleza } = req.body;
        await pool.query('INSERT INTO cost_components (nombre, naturaleza) VALUES ($1, $2)', [nombre, naturaleza]);
        res.status(201).json({ message: 'Componente creado' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/accounting/cogs/product/:id', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT pdc.id, pdc.id_producto as "idProducto", pdc.tipo_producto as "tipoProducto", 
                   pdc.id_componente as "idComponente", pdc.valor, cc.nombre as "nombreComponente"
            FROM product_direct_costs pdc
            JOIN cost_components cc ON pdc.id_componente = cc.id
            WHERE pdc.id_producto = $1
        `, [req.params.id]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/accounting/cogs/product', authenticateToken, async (req, res) => {
    try {
        const { idProducto, tipoProducto, idComponente, valor } = req.body;
        await pool.query(`
            INSERT INTO product_direct_costs (id_producto, tipo_producto, id_componente, valor)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id_producto, id_componente) DO UPDATE SET valor = $4
        `, [idProducto, tipoProducto, idComponente, valor]);
        res.json({ message: 'Costo asignado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/accounting/cogs/cost/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM product_direct_costs WHERE id = $1', [req.params.id]);
        res.json({ message: 'Costo eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// 2. PRESUPUESTOS (BUDGETS)
router.get('/accounting/budgets', authenticateToken, async (req, res) => {
    try {
        const { year } = req.query;
        const r = await pool.query(`
            SELECT id, mes, anio, categoria, monto_base as "montoBase", monto_mejor as "montoMejor", monto_peor as "montoPeor"
            FROM financial_budgets WHERE anio = $1
        `, [year]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/accounting/budgets', authenticateToken, async (req, res) => {
    try {
        const { mes, anio, categoria, montoBase, montoMejor, montoPeor } = req.body;
        await pool.query(`
            INSERT INTO financial_budgets (mes, anio, categoria, monto_base, monto_mejor, monto_peor)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (mes, anio, categoria) DO UPDATE 
            SET monto_base = $4, monto_mejor = $5, monto_peor = $6
        `, [mes, anio, categoria, montoBase, montoMejor, montoPeor]);
        res.json({ message: 'Presupuesto guardado' });
    } catch(e) { handleDbError(res, e); }
});

// 3. REPORTES AVANZADOS: SALES TRACKING DIARIO
router.get('/accounting/tracking/daily', authenticateToken, async (req, res) => {
    try {
        const { start, end } = req.query;
        
        // Esta consulta es compleja:
        // 1. Agrupa ventas por día
        // 2. Calcula costo directo BASADO EN LA TABLA NUEVA (product_direct_costs) para tener costo real
        // 3. Suma gastos operativos del día
        
        const query = `
            WITH ventas_dia AS (
                SELECT 
                    TO_CHAR(v.fecha, 'YYYY-MM-DD') as fecha,
                    SUM(v.total) as venta_total,
                    -- Costo Base (Compra) + Costos Extra
                    SUM(
                        dv.cantidad * (
                            CASE 
                                WHEN dv.idTelefono IS NOT NULL THEN (SELECT precioCompra FROM telefonos WHERE codigo = dv.idTelefono)
                                ELSE (SELECT precioCompra FROM inventario WHERE codInventario = dv.idInventario LIMIT 1)
                            END 
                            + 
                            COALESCE((
                                SELECT SUM(valor) FROM product_direct_costs 
                                WHERE id_producto = COALESCE(dv.idTelefono, (SELECT codAccesorio FROM inventario WHERE codInventario = dv.idInventario LIMIT 1))
                            ), 0)
                        )
                    ) as costo_real
                FROM ventas v
                JOIN detalleventa dv ON v.codVenta = dv.idVenta
                WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
                GROUP BY 1
            ),
            gastos_dia AS (
                SELECT 
                    TO_CHAR(fecha, 'YYYY-MM-DD') as fecha,
                    SUM(monto) as gastos_operativos
                FROM gastos_contables
                WHERE fecha BETWEEN $1 AND $2 AND (categoria = 'Operativo' OR categoria = 'Administrativo' OR categoria = 'Ventas')
                GROUP BY 1
            )
            SELECT 
                COALESCE(v.fecha, g.fecha) as fecha,
                TO_CHAR(COALESCE(v.fecha, g.fecha)::date, 'Day') as "diaSemana",
                COALESCE(v.venta_total, 0) as "ventaTotal",
                COALESCE(v.costo_real, 0) as "costosDirectos",
                COALESCE(g.gastos_operativos, 0) as "gastosOperativos",
                (COALESCE(v.venta_total, 0) - COALESCE(v.costo_real, 0)) as "gananciaBruta",
                (COALESCE(v.venta_total, 0) - COALESCE(v.costo_real, 0) - COALESCE(g.gastos_operativos, 0)) as "gananciaNeta"
            FROM ventas_dia v
            FULL OUTER JOIN gastos_dia g ON v.fecha = g.fecha
            ORDER BY 1 DESC
        `;
        
        const result = await pool.query(query, [start, end]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// 4. REPORTES AVANZADOS: P&L
router.get('/accounting/pnl', authenticateToken, async (req, res) => {
    try {
        const { year } = req.query;
        
        // Similares CTEs pero agrupados por año para comparar con presupuesto
        const query = `
            WITH real_data AS (
                SELECT 
                    'Ventas' as categoria, SUM(v.total) as monto
                FROM ventas v WHERE EXTRACT(YEAR FROM v.fecha) = $1 AND v.estado = 'Completada'
                UNION ALL
                SELECT 
                    'CostoVentas' as categoria,
                    SUM(
                        dv.cantidad * (
                            CASE 
                                WHEN dv.idTelefono IS NOT NULL THEN (SELECT precioCompra FROM telefonos WHERE codigo = dv.idTelefono)
                                ELSE (SELECT precioCompra FROM inventario WHERE codInventario = dv.idInventario LIMIT 1)
                            END 
                            + 
                            COALESCE((
                                SELECT SUM(valor) FROM product_direct_costs 
                                WHERE id_producto = COALESCE(dv.idTelefono, (SELECT codAccesorio FROM inventario WHERE codInventario = dv.idInventario LIMIT 1))
                            ), 0)
                        )
                    ) as monto
                FROM ventas v JOIN detalleventa dv ON v.codVenta = dv.idVenta
                WHERE EXTRACT(YEAR FROM v.fecha) = $1 AND v.estado = 'Completada'
                UNION ALL
                SELECT 
                    'GastosOperativos' as categoria, SUM(monto) as monto
                FROM gastos_contables
                WHERE EXTRACT(YEAR FROM fecha) = $1 AND (categoria = 'Operativo' OR categoria = 'Administrativo' OR categoria = 'Ventas')
            ),
            budget_data AS (
                SELECT categoria, SUM(monto_base) as presupuesto
                FROM financial_budgets WHERE anio = $1
                GROUP BY 1
            )
            SELECT 
                COALESCE(r.categoria, b.categoria) as concepto,
                COALESCE(r.monto, 0) as real,
                COALESCE(b.presupuesto, 0) as presupuesto,
                (COALESCE(r.monto, 0) - COALESCE(b.presupuesto, 0)) as diferencia
            FROM real_data r
            FULL OUTER JOIN budget_data b ON r.categoria = b.categoria
        `;
        
        const result = await pool.query(query, [year]);
        
        // Post-processing to format P&L structure
        const map = result.rows.reduce((acc, row) => ({...acc, [row.concepto]: row}), {});
        
        const ventas = map['Ventas'] || {real:0, presupuesto:0, diferencia:0};
        const cogs = map['CostoVentas'] || {real:0, presupuesto:0, diferencia:0};
        const gastos = map['GastosOperativos'] || {real:0, presupuesto:0, diferencia:0};
        
        const pnl = [
            { concepto: 'Ingreso por Ventas', ...ventas },
            { concepto: '(-) Costo de Ventas (COGS)', real: cogs.real, presupuesto: cogs.presupuesto, diferencia: cogs.diferencia },
            { concepto: '(=) Utilidad Bruta', real: ventas.real - cogs.real, presupuesto: ventas.presupuesto - cogs.presupuesto, diferencia: (ventas.real-cogs.real)-(ventas.presupuesto-cogs.presupuesto), isTotal: true },
            { concepto: '(-) Gastos Operativos', ...gastos },
            { concepto: '(=) UTILIDAD NETA', real: (ventas.real-cogs.real)-gastos.real, presupuesto: (ventas.presupuesto-cogs.presupuesto)-gastos.presupuesto, diferencia: 0, isTotal: true }
        ];
        // Recalc diff for Net Profit
        pnl[4].diferencia = pnl[4].real - pnl[4].presupuesto;

        res.json(pnl);
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
