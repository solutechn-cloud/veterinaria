'use strict';

const express = require('express');
const router = express.Router();
const { pool, handleDbError } = require('../config/db');

const ADMIN_DASHBOARD_PERMS = new Set(['VER_REPORTES', 'VER_CONTABILIDAD', 'GESTIONAR_PANEL_CAJAS', 'VER_ADMIN']);
const CASHIER_DASHBOARD_PERMS = new Set(['VER_POS', 'VER_CAJA']);
const INVENTORY_DASHBOARD_PERMS = new Set(['VER_INVENTARIO']);
const FINANCE_DASHBOARD_PERMS = new Set(['VER_CONTABILIDAD', 'VER_REPORTES']);

function userPerms(req) {
    return Array.isArray(req.user?.permisos) ? req.user.permisos : [];
}

function isAdminRole(req) {
    const role = String(req.user?.rol || '').toLowerCase();
    return ['administrador', 'admin', 'superadmin'].includes(role);
}

function hasAny(req, permissions) {
    if (isAdminRole(req)) return true;
    const perms = userPerms(req);
    return perms.some(p => permissions.has(p));
}

function requireAny(permissions) {
    return (req, res, next) => {
        if (hasAny(req, permissions)) return next();
        return res.status(403).json({
            error: 'Acceso denegado: permiso insuficiente para este dashboard',
        });
    };
}

function todayRange() {
    return ['CURRENT_DATE', "CURRENT_DATE + INTERVAL '1 day'"];
}

router.get('/dashboard/me', async (req, res) => {
    try {
        const canAdmin = hasAny(req, ADMIN_DASHBOARD_PERMS);
        const canCashier = hasAny(req, CASHIER_DASHBOARD_PERMS);
        const canInventory = hasAny(req, INVENTORY_DASHBOARD_PERMS);
        const canFinance = hasAny(req, FINANCE_DASHBOARD_PERMS);

        let profile = 'limited';
        if (canAdmin) profile = canFinance && !hasAny(req, new Set(['GESTIONAR_PANEL_CAJAS', 'VER_ADMIN'])) ? 'finance' : 'admin';
        else if (canCashier) profile = 'cashier';
        else if (canInventory) profile = 'inventory';

        res.json({
            profile,
            permissions: {
                canAdmin,
                canCashier,
                canInventory,
                canFinance,
                canPos: hasAny(req, new Set(['VER_POS'])),
                canCaja: hasAny(req, new Set(['VER_CAJA'])),
                canReports: hasAny(req, new Set(['VER_REPORTES'])),
                canAccounting: hasAny(req, new Set(['VER_CONTABILIDAD'])),
                canManageBoxes: hasAny(req, new Set(['GESTIONAR_PANEL_CAJAS'])),
            },
            user: {
                codUsuario: req.user?.codUsuario,
                usuario: req.user?.usuario,
                nombreEmpleado: req.user?.nombreEmpleado,
                rol: req.user?.rol,
                idCaja: req.user?.idCaja || null,
                id_sucursal: req.user?.id_sucursal || null,
                sucursal_nombre: req.user?.sucursal_nombre || null,
            },
        });
    } catch (e) { handleDbError(res, e); }
});

router.get('/dashboard/admin', requireAny(ADMIN_DASHBOARD_PERMS), async (req, res) => {
    try {
        const year = Number(req.query.year || new Date().getFullYear());
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
            return res.status(400).json({ error: 'Año inválido' });
        }

        const [ventasHoy, costosHoy, trend, valuation, boxes, lowStock, pacientesRes, especiesRes, serviciosRes] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::int AS "numFacturas",
                       COALESCE(SUM(total), 0) AS "totalVentas",
                       COALESCE(SUM(isv_calculado), 0) AS "isvTotal"
                FROM ventas
                WHERE fecha >= ${todayRange()[0]} AND fecha < ${todayRange()[1]}
                  AND estado = 'Completada' AND tenant_id = $1
            `, [req.tenantId]),
            pool.query(`
                SELECT COALESCE(SUM(dv.cantidad_base_descontada * COALESCE(l.precio_compra_unitario, 0)), 0) AS "totalCostos"
                FROM detalleventa dv
                JOIN ventas v ON dv.idVenta = v.codVenta
                LEFT JOIN lotes_medicamento l ON dv.id_lote = l.id_lote AND l.tenant_id = $1
                WHERE v.fecha >= ${todayRange()[0]} AND v.fecha < ${todayRange()[1]}
                  AND v.estado = 'Completada' AND dv.tipoProducto = 'MEDICAMENTO'
                  AND v.tenant_id = $1
            `, [req.tenantId]),
            pool.query(`
                SELECT TRIM(TO_CHAR(fecha, 'Month')) AS mes,
                       EXTRACT(MONTH FROM fecha)::int AS num_mes,
                       COALESCE(SUM(total), 0) AS total,
                       COUNT(codVenta)::int AS num_ventas
                FROM ventas
                WHERE EXTRACT(YEAR FROM fecha) = $1 AND estado = 'Completada'
                  AND tenant_id = $2
                GROUP BY 1, 2
                ORDER BY 2
            `, [year, req.tenantId]),
            pool.query(`
                SELECT COALESCE(SUM(l.cantidad_actual * COALESCE(l.precio_compra_unitario, 0)), 0) AS "costoInventario",
                       COUNT(DISTINCT l.id_medicamento)::int AS "medicamentosConStock"
                FROM lotes_medicamento l
                WHERE l.estado = 'Activo' AND l.cantidad_actual > 0 AND l.tenant_id = $1
            `, [req.tenantId]),
            pool.query(`
                SELECT c.idCaja AS "idCaja", c.nombre AS "nombreCaja",
                       c.id_sucursal AS "idSucursal", s.nombre AS "sucursalNombre",
                       a.idArqueo AS "idArqueo", a.idUsuario AS "idUsuario",
                       a.estado AS "estadoArqueo", COALESCE(a.montoInicial, 0) AS "montoInicial",
                       COALESCE(a.montoFinal, 0) AS "montoFinal", COALESCE(a.ganancia, 0) AS ganancia,
                       a.fechaApertura AS "fechaApertura", a.fechaCierre AS "fechaCierre",
                       COALESCE(e.nombre || ' ' || e.apellido, u.usuario) AS "nombreEmpleado",
                       u.usuario
                FROM caja c
                LEFT JOIN sucursales s ON c.id_sucursal = s.id_sucursal AND s.tenant_id = c.tenant_id
                LEFT JOIN arqueo a ON a.idCaja = c.idCaja AND a.tenant_id = c.tenant_id AND a.estado = 'Activo'
                LEFT JOIN usuarios u ON a.idUsuario::text = u.codUsuario::text AND u.tenant_id = c.tenant_id
                LEFT JOIN empleado e ON u.identidad = e.identidad AND e.tenant_id = c.tenant_id
                WHERE c.tenant_id = $1
                ORDER BY c.idCaja
            `, [req.tenantId]),
            pool.query(`
                SELECT m.codigo, m.nombre_generico AS "nombreGenerico",
                       m.stock_minimo AS "stockMinimo", m.punto_reorden AS "puntoReorden",
                       COALESCE(SUM(l.cantidad_actual), 0) AS "stockActual"
                FROM medicamentos m
                LEFT JOIN lotes_medicamento l ON m.codigo = l.id_medicamento
                    AND l.estado = 'Activo' AND l.tenant_id = $1
                WHERE m.activo = TRUE AND m.tenant_id = $1
                GROUP BY m.codigo, m.nombre_generico, m.stock_minimo, m.punto_reorden
                HAVING COALESCE(SUM(l.cantidad_actual), 0) <= m.stock_minimo
                ORDER BY COALESCE(SUM(l.cantidad_actual), 0) ASC
                LIMIT 10
            `, [req.tenantId]),
            // Resumen clínico: mascotas registradas y propietarios vinculados.
            pool.query(`
                SELECT COUNT(*)::int AS "totalPacientes",
                       COUNT(DISTINCT id_tutor)::int AS "totalPropietarios"
                FROM pacientes WHERE tenant_id = $1
            `, [req.tenantId]),
            // Distribución de mascotas por especie.
            pool.query(`
                SELECT COALESCE(NULLIF(TRIM(especie), ''), 'Otros') AS especie,
                       COUNT(*)::int AS total
                FROM pacientes WHERE tenant_id = $1
                GROUP BY 1 ORDER BY total DESC LIMIT 6
            `, [req.tenantId]),
            // Totales por servicio (eventos clínicos del año en curso).
            pool.query(`
                SELECT tipo, COUNT(*)::int AS total
                FROM paciente_eventos_clinicos
                WHERE tenant_id = $1 AND estado <> 'Anulado'
                  AND fecha_evento >= date_trunc('year', CURRENT_DATE)
                GROUP BY tipo ORDER BY total DESC
            `, [req.tenantId]),
        ]);

        const sales = ventasHoy.rows[0] || {};
        const costs = costosHoy.rows[0] || {};
        const valuationRow = valuation.rows[0] || {};
        const totalVentas = Number(sales.totalVentas || 0);
        const totalCostos = Number(costs.totalCostos || 0);

        res.json({
            kpis: {
                totalVentas,
                numFacturas: Number(sales.numFacturas || 0),
                totalCostos,
                gananciaEstimada: totalVentas - totalCostos,
                isvTotal: Number(sales.isvTotal || 0),
                costoInventario: Number(valuationRow.costoInventario || 0),
                medicamentosConStock: Number(valuationRow.medicamentosConStock || 0),
                cajasActivas: boxes.rows.filter(b => b.estadoArqueo === 'Activo').length,
            },
            clinica: {
                totalPacientes: Number(pacientesRes.rows[0]?.totalPacientes || 0),
                totalPropietarios: Number(pacientesRes.rows[0]?.totalPropietarios || 0),
            },
            especies: especiesRes.rows,
            serviceBreakdown: serviciosRes.rows,
            salesTrend: trend.rows,
            boxes: boxes.rows,
            lowStock: lowStock.rows,
        });
    } catch (e) { handleDbError(res, e); }
});

router.get('/dashboard/cashier', requireAny(CASHIER_DASHBOARD_PERMS), async (req, res) => {
    try {
        const assignedRes = await pool.query(`
            SELECT u.idCaja AS "idCaja", u.id_sucursal AS "idSucursal",
                   c.nombre AS "nombreCaja", c.estado AS "estadoCaja",
                   c.id_sucursal AS "idSucursalCaja", s.nombre AS "sucursalNombre"
            FROM usuarios u
            LEFT JOIN caja c ON u.idCaja = c.idCaja AND c.tenant_id = u.tenant_id
            LEFT JOIN sucursales s ON c.id_sucursal = s.id_sucursal AND s.tenant_id = u.tenant_id
            WHERE u.codUsuario = $1 AND u.tenant_id = $2
            LIMIT 1
        `, [req.user.codUsuario, req.tenantId]);

        const assigned = assignedRes.rows[0] || {};
        const idCaja = assigned.idCaja && assigned.idCaja !== 'Sin Caja' ? assigned.idCaja : null;
        if (!idCaja) {
            return res.json({
                cajaAsignada: false,
                reason: 'USER_WITHOUT_CASH_REGISTER',
                caja: null,
                activeArqueo: null,
                today: { numFacturas: 0, totalVentas: 0 },
                turno: { numFacturas: 0, totalVentas: 0 },
                recentSales: [],
            });
        }
        if (!assigned.nombreCaja) {
            return res.json({
                cajaAsignada: false,
                reason: 'ASSIGNED_CASH_REGISTER_NOT_FOUND',
                caja: { idCaja },
                activeArqueo: null,
                today: { numFacturas: 0, totalVentas: 0 },
                turno: { numFacturas: 0, totalVentas: 0 },
                recentSales: [],
            });
        }

        const [activeRes, todayRes] = await Promise.all([
            pool.query(`
                SELECT idArqueo AS "idArqueo", idCaja AS "idCaja",
                       montoInicial AS "montoInicial", estado, fechaApertura AS "fechaApertura"
                FROM arqueo
                WHERE idCaja = $1 AND estado = 'Activo' AND tenant_id = $2
                LIMIT 1
            `, [idCaja, req.tenantId]),
            pool.query(`
                SELECT COUNT(*)::int AS "numFacturas", COALESCE(SUM(total), 0) AS "totalVentas"
                FROM ventas
                WHERE codVendedor::text = $1::text
                  AND fecha >= ${todayRange()[0]} AND fecha < ${todayRange()[1]}
                  AND estado = 'Completada' AND tenant_id = $2
            `, [req.user.codUsuario, req.tenantId]),
        ]);

        const activeArqueo = activeRes.rows[0] || null;
        let turno = { numFacturas: 0, totalVentas: 0 };
        let recentSales = [];
        if (activeArqueo) {
            const [turnoRes, recentRes] = await Promise.all([
                pool.query(`
                    SELECT COUNT(*)::int AS "numFacturas", COALESCE(SUM(total), 0) AS "totalVentas"
                    FROM ventas
                    WHERE idCaja = $1 AND codVendedor::text = $2::text
                      AND fecha >= $3 AND estado = 'Completada' AND tenant_id = $4
                `, [idCaja, req.user.codUsuario, activeArqueo.fechaApertura, req.tenantId]),
                pool.query(`
                    SELECT codVenta AS "codVenta", fecha, total, estado, tipoCompra AS "tipoCompra"
                    FROM ventas
                    WHERE idCaja = $1 AND codVendedor::text = $2::text AND tenant_id = $3
                    ORDER BY fecha DESC
                    LIMIT 5
                `, [idCaja, req.user.codUsuario, req.tenantId]),
            ]);
            turno = {
                numFacturas: Number(turnoRes.rows[0]?.numFacturas || 0),
                totalVentas: Number(turnoRes.rows[0]?.totalVentas || 0),
            };
            recentSales = recentRes.rows;
        }

        res.json({
            cajaAsignada: true,
            caja: {
                idCaja,
                nombre: assigned.nombreCaja,
                estado: assigned.estadoCaja,
                id_sucursal: assigned.idSucursalCaja,
                sucursalNombre: assigned.sucursalNombre,
            },
            activeArqueo,
            today: {
                numFacturas: Number(todayRes.rows[0]?.numFacturas || 0),
                totalVentas: Number(todayRes.rows[0]?.totalVentas || 0),
            },
            turno,
            recentSales,
        });
    } catch (e) { handleDbError(res, e); }
});

router.get('/dashboard/inventory', requireAny(INVENTORY_DASHBOARD_PERMS), async (req, res) => {
    try {
        const sucursalId = req.user?.id_sucursal || req.query.id_sucursal || null;
        const params = [req.tenantId];
        let stockSucursalFilter = '';
        let transferSucursalFilter = '';
        let ordersSucursalFilter = '';
        if (sucursalId) {
            params.push(sucursalId);
            stockSucursalFilter = `AND l.id_sucursal = $${params.length}`;
            transferSucursalFilter = `AND (t.id_sucursal_origen = $${params.length} OR t.id_sucursal_destino = $${params.length})`;
            ordersSucursalFilter = `AND oc.id_sucursal = $${params.length}`;
        }

        const [lowStock, expirations, transfers, orders] = await Promise.all([
            pool.query(`
                SELECT m.codigo, m.nombre_generico AS "nombreGenerico",
                       m.stock_minimo AS "stockMinimo", m.punto_reorden AS "puntoReorden",
                       COALESCE(SUM(l.cantidad_actual), 0) AS "stockActual"
                FROM medicamentos m
                LEFT JOIN lotes_medicamento l ON m.codigo = l.id_medicamento
                    AND l.estado = 'Activo' AND l.tenant_id = $1 ${stockSucursalFilter}
                WHERE m.activo = TRUE AND m.tenant_id = $1
                GROUP BY m.codigo, m.nombre_generico, m.stock_minimo, m.punto_reorden
                HAVING COALESCE(SUM(l.cantidad_actual), 0) <= m.stock_minimo
                ORDER BY COALESCE(SUM(l.cantidad_actual), 0) ASC
                LIMIT 20
            `, params),
            pool.query(`
                SELECT m.codigo, m.nombre_generico AS "nombreGenerico",
                       l.numero_lote AS "numeroLote", l.fecha_vencimiento AS "fechaVencimiento",
                       l.cantidad_actual AS "cantidadActual",
                       (l.fecha_vencimiento - CURRENT_DATE) AS "diasParaVencer"
                FROM lotes_medicamento l
                JOIN medicamentos m ON l.id_medicamento = m.codigo AND m.tenant_id = l.tenant_id
                WHERE l.estado = 'Activo' AND l.cantidad_actual > 0
                  AND l.fecha_vencimiento <= CURRENT_DATE + 90
                  AND l.tenant_id = $1 ${stockSucursalFilter}
                ORDER BY l.fecha_vencimiento ASC
                LIMIT 20
            `, params),
            pool.query(`
                SELECT COUNT(*)::int AS pendientes
                FROM transferencias_sucursal t
                WHERE t.estado = 'Pendiente' AND t.tenant_id = $1 ${transferSucursalFilter}
            `, params),
            pool.query(`
                SELECT COUNT(*)::int AS pendientes
                FROM ordenes_compra oc
                WHERE oc.estado IN ('Pendiente', 'Enviada', 'Parcialmente recibida')
                  AND oc.tenant_id = $1 ${ordersSucursalFilter}
            `, params),
        ]);

        res.json({
            sucursalId: sucursalId ? Number(sucursalId) : null,
            lowStock: lowStock.rows,
            expirations: expirations.rows,
            transferenciasPendientes: Number(transfers.rows[0]?.pendientes || 0),
            ordenesPendientes: Number(orders.rows[0]?.pendientes || 0),
        });
    } catch (e) { handleDbError(res, e); }
});

router.get('/dashboard/finance', requireAny(FINANCE_DASHBOARD_PERMS), async (req, res) => {
    try {
        const [ventas, cajas] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::int AS "numFacturas",
                       COALESCE(SUM(total), 0) AS "totalVentas",
                       COALESCE(SUM(isv_calculado), 0) AS "isvTotal"
                FROM ventas
                WHERE fecha >= ${todayRange()[0]} AND fecha < ${todayRange()[1]}
                  AND estado = 'Completada' AND tenant_id = $1
            `, [req.tenantId]),
            pool.query(`
                SELECT COUNT(*) FILTER (WHERE estado = 'Activo')::int AS "cajasAbiertas",
                       COUNT(*) FILTER (WHERE estado = 'Cerrada' AND fechaCierre >= CURRENT_DATE)::int AS "cierresHoy",
                       COALESCE(SUM(totalVentas), 0) AS "ventasRegistradasCaja"
                FROM arqueo
                WHERE tenant_id = $1 AND fechaApertura >= CURRENT_DATE
            `, [req.tenantId]),
        ]);

        res.json({
            ventas: ventas.rows[0] || { numFacturas: 0, totalVentas: 0, isvTotal: 0 },
            cajas: cajas.rows[0] || { cajasAbiertas: 0, cierresHoy: 0, ventasRegistradasCaja: 0 },
        });
    } catch (e) { handleDbError(res, e); }
});

module.exports = router;
