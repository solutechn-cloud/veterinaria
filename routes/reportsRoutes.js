
const express = require('express');
const router = express.Router();
const { pool, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- 1. TENDENCIA DE VENTAS (Gráfico Mensual) ---
router.get('/reports/sales-trend', authenticateToken, async (req, res) => {
    try {
        const { year } = req.query;
        // Agrupa ventas por mes del año seleccionado
        const query = `
            SELECT TO_CHAR(fecha, 'Month') as mes, EXTRACT(MONTH FROM fecha) as num_mes, SUM(total) as total
            FROM ventas
            WHERE EXTRACT(YEAR FROM fecha) = $1 AND estado = 'Completada'
            GROUP BY 1, 2
            ORDER BY 2
        `;
        const result = await pool.query(query, [year || new Date().getFullYear()]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 2. TOP PRODUCTOS VENDIDOS (Filtrado por Rango) ---
router.get('/reports/top-products', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        // Une detalleventa con telefonos y accesorios para obtener nombres
        const query = `
            SELECT 
                COALESCE(t.marca || ' ' || t.modelo, a.descripcion, dv.descripcionProducto) as producto,
                SUM(dv.cantidad) as cantidad,
                SUM(dv.cantidad * dv.precioVenta) as total_vendido
            FROM detalleventa dv
            JOIN ventas v ON dv.idVenta = v.codVenta
            LEFT JOIN telefonos t ON dv.idTelefono = t.codigo
            LEFT JOIN accesorios a ON dv.idAccesorio = a.codAccesorio
            WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
            GROUP BY 1
            ORDER BY 2 DESC
            LIMIT 10
        `;
        const result = await pool.query(query, [startDate, endDate]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 3. REPORTE DE RECARGAS (Ganancias por Red) ---
router.get('/reports/recharges-profit', authenticateToken, async (req, res) => {
    try {
        const { year } = req.query;
        const query = `
            SELECT 
                red,
                TO_CHAR(fechaCreacion, 'Month') as mes,
                SUM(monto - costo) as ganancia,
                SUM(monto) as venta_total
            FROM ingresos
            WHERE descripcion LIKE 'RECARGA%' AND EXTRACT(YEAR FROM fechaCreacion) = $1
            GROUP BY 1, 2, EXTRACT(MONTH FROM fechaCreacion)
            ORDER BY EXTRACT(MONTH FROM fechaCreacion)
        `;
        const result = await pool.query(query, [year || new Date().getFullYear()]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 4. VALORACIÓN DE INVENTARIO (Actual) ---
router.get('/reports/inventory-valuation', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                'Telefonos' as categoria, 
                COUNT(*) as cantidad, 
                SUM(precioCompra) as costo_total, 
                SUM(precioVenta) as venta_proyectada 
            FROM telefonos WHERE estado = 'Disponible'
            UNION ALL
            SELECT 
                'Accesorios' as categoria, 
                SUM(cantidad) as cantidad, 
                SUM(precioCompra * cantidad) as costo_total, 
                SUM(precioVenta * cantidad) as venta_proyectada 
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
        const query = `
            SELECT 
                c.identidad, c.nombre || ' ' || c.apellido as nombre, 
                COUNT(v.codVenta) as compras, 
                SUM(v.total) as total_gastado
            FROM ventas v
            JOIN clientes c ON v.identidadCliente = c.identidad
            WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
            GROUP BY 1, 2
            ORDER BY 4 DESC
            LIMIT 20
        `;
        const result = await pool.query(query, [startDate, endDate]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- 6. VENTAS DIARIAS DETALLADAS ---
router.get('/reports/daily-sales', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const query = `
            SELECT 
                v.fecha, 
                COUNT(v.codVenta) as num_ventas, 
                SUM(v.total) as total_dia,
                u.usuario as vendedor
            FROM ventas v
            JOIN usuarios u ON v.codVendedor = u.codUsuario
            WHERE v.fecha BETWEEN $1 AND $2 AND v.estado = 'Completada'
            GROUP BY 1, 4
            ORDER BY 1 DESC
        `;
        const result = await pool.query(query, [startDate, endDate]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
