
const express = require('express');
const router = express.Router();
const { pool, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// Helper: convierte "YYYY-MM-DD" a timestamps para BETWEEN
const toRange = (start, end) => [`${start} 00:00:00`, `${end} 23:59:59`];

// --- 1. TENDENCIA DE VENTAS (Gráfico Mensual) ---
router.get('/reports/sales-trend', authenticateToken, async (req, res) => {
    try {
        const { year } = req.query;
        // FIX: TRIM elimina los espacios que PostgreSQL añade en TO_CHAR('Month')
        const query = `
            SELECT
                TRIM(TO_CHAR(fecha, 'Month')) as mes,
                EXTRACT(MONTH FROM fecha) as num_mes,
                COALESCE(SUM(total), 0) as total,
                COUNT(codVenta) as num_ventas
            FROM ventas
            WHERE EXTRACT(YEAR FROM fecha) = $1 AND estado = 'Completada'
            GROUP BY 1, 2
            ORDER BY 2
        `;
        const result = await pool.query(query, [year || new Date().getFullYear()]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 2. TOP PRODUCTOS VENDIDOS ---
router.get('/reports/top-products', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const [start, end] = toRange(startDate, endDate);
        // FIX: dv.idAccesorio → inventario.codInventario → accesorios (no directo)
        const query = `
            SELECT
                COALESCE(
                    t.marca || ' ' || t.modelo,
                    a.descripcion,
                    'Producto General'
                ) as producto,
                SUM(dv.cantidad) as cantidad,
                SUM(dv.cantidad * dv.precioVenta) as total_vendido,
                SUM(dv.cantidad * COALESCE(t.precioCompra, inv.precioCompra, 0)) as total_costo
            FROM detalleventa dv
            JOIN ventas v ON dv.idVenta = v.codVenta
            LEFT JOIN telefonos t ON dv.idTelefono = t.codigo
            LEFT JOIN inventario inv ON dv.idAccesorio = inv.codInventario
            LEFT JOIN accesorios a ON inv.codAccesorio = a.codAccesorio
            WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
            GROUP BY 1
            ORDER BY cantidad DESC
            LIMIT 10
        `;
        const result = await pool.query(query, [start, end]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 3. REPORTE DE RECARGAS ---
router.get('/reports/recharges-profit', authenticateToken, async (req, res) => {
    try {
        const { year } = req.query;
        // FIX: ingresos no tiene columna 'red'. Se extrae del inicio de descripcion.
        const query = `
            SELECT
                CASE
                    WHEN descripcion ILIKE 'TIGO%' THEN 'TIGO'
                    WHEN descripcion ILIKE 'CLARO%' THEN 'CLARO'
                    ELSE 'OTRA'
                END as red,
                TRIM(TO_CHAR(fechaCreacion, 'Month')) as mes,
                EXTRACT(MONTH FROM fechaCreacion) as num_mes,
                COALESCE(SUM(monto - costo), 0) as ganancia,
                COALESCE(SUM(monto), 0) as venta_total,
                COUNT(*) as cantidad
            FROM ingresos
            WHERE subtipo_movimiento = 'Recarga' AND EXTRACT(YEAR FROM fechaCreacion) = $1
            GROUP BY 1, 2, 3
            ORDER BY 3
        `;
        const result = await pool.query(query, [year || new Date().getFullYear()]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 4. VALORACIÓN DE INVENTARIO ---
router.get('/reports/inventory-valuation', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 'Teléfonos' as categoria,
                COUNT(*) as cantidad,
                COALESCE(SUM(precioCompra), 0) as costo_total,
                COALESCE(SUM(precioVenta), 0) as venta_proyectada
            FROM telefonos WHERE estado = 'Disponible'
            UNION ALL
            SELECT 'Accesorios' as categoria,
                COALESCE(SUM(cantidad), 0) as cantidad,
                COALESCE(SUM(precioCompra * cantidad), 0) as costo_total,
                COALESCE(SUM(precioVenta * cantidad), 0) as venta_proyectada
            FROM inventario WHERE estado = 'Activo'
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 5. MEJORES CLIENTES ---
router.get('/reports/top-clients', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const [start, end] = toRange(startDate, endDate);
        const query = `
            SELECT
                c.identidad,
                c.nombre || ' ' || c.apellido as nombre,
                COUNT(v.codVenta) as compras,
                COALESCE(SUM(v.total), 0) as total_gastado,
                MAX(v.fecha) as ultima_compra
            FROM ventas v
            JOIN clientes c ON v.identidadCliente = c.identidad
            WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
            GROUP BY 1, 2
            ORDER BY total_gastado DESC
            LIMIT 20
        `;
        const result = await pool.query(query, [start, end]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 6. VENTAS DIARIAS DETALLADAS ---
router.get('/reports/daily-sales', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const [start, end] = toRange(startDate, endDate);
        // FIX: timestamps correctos + nombre real del vendedor
        const query = `
            SELECT
                TO_CHAR(v.fecha, 'YYYY-MM-DD') as fecha,
                COUNT(v.codVenta) as num_ventas,
                COALESCE(SUM(v.total), 0) as total_dia,
                COALESCE(e.nombre || ' ' || e.apellido, u.usuario) as vendedor
            FROM ventas v
            JOIN usuarios u ON v.codVendedor = u.codUsuario
            LEFT JOIN empleado e ON u.identidad = e.identidad
            WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
            GROUP BY 1, 4
            ORDER BY 1 DESC
        `;
        const result = await pool.query(query, [start, end]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 7. KPI RESUMEN (NUEVO) ---
router.get('/reports/kpi-summary', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const [start, end] = toRange(startDate, endDate);

        const [ventasRow, ingresosRow, egresosRow, recargasRow] = await Promise.all([
            pool.query(`SELECT COUNT(*) as num_facturas, COALESCE(SUM(total),0) as total_ventas
                        FROM ventas WHERE fecha BETWEEN $1 AND $2 AND estado = 'Completada'`, [start, end]),
            pool.query(`SELECT COALESCE(SUM(monto),0) as total_ingresos, COALESCE(SUM(costo),0) as total_costos
                        FROM ingresos WHERE fechaCreacion BETWEEN $1 AND $2`, [start, end]),
            pool.query(`SELECT COALESCE(SUM(monto),0) as total_egresos FROM egresos WHERE fechaCreacion BETWEEN $1 AND $2`, [start, end]),
            pool.query(`SELECT COUNT(*) as num_recargas, COALESCE(SUM(monto),0) as ingreso_recargas, COALESCE(SUM(monto-costo),0) as ganancia_recargas
                        FROM ingresos WHERE subtipo_movimiento = 'Recarga' AND fechaCreacion BETWEEN $1 AND $2`, [start, end])
        ]);

        const v = ventasRow.rows[0];
        const i = ingresosRow.rows[0];
        const e = egresosRow.rows[0];
        const r = recargasRow.rows[0];
        const utilBruta = Number(i.total_ingresos) - Number(i.total_costos);

        res.json({
            numFacturas: Number(v.num_facturas),
            totalVentas: Number(v.total_ventas),
            totalIngresos: Number(i.total_ingresos),
            totalCostos: Number(i.total_costos),
            utilidadBruta: utilBruta,
            totalEgresos: Number(e.total_egresos),
            utilidadNeta: utilBruta - Number(e.total_egresos),
            numRecargas: Number(r.num_recargas),
            ingresoRecargas: Number(r.ingreso_recargas),
            gananciaRecargas: Number(r.ganancia_recargas)
        });
    } catch(e) { handleDbError(res, e); }
});

// --- 8. RENDIMIENTO POR VENDEDOR (NUEVO) ---
router.get('/reports/sales-by-seller', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const [start, end] = toRange(startDate, endDate);
        const query = `
            SELECT
                COALESCE(e.nombre || ' ' || e.apellido, u.usuario) as vendedor,
                COUNT(v.codVenta) as num_ventas,
                COALESCE(SUM(v.total), 0) as total_vendido,
                COALESCE(AVG(v.total), 0) as ticket_promedio
            FROM ventas v
            JOIN usuarios u ON v.codVendedor = u.codUsuario
            LEFT JOIN empleado e ON u.identidad = e.identidad
            WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
            GROUP BY 1
            ORDER BY total_vendido DESC
        `;
        const result = await pool.query(query, [start, end]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
