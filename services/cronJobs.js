'use strict';

const cron = require('node-cron');
const { pool } = require('../config/db');
const emailService = require('./emailService');
const { getSystemConfig } = require('../config/systemConfig');

function getHondurasDateString() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Tegucigalpa' });
}

function getWeekLabel(offsetWeeks = 0) {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1 - offsetWeeks * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', timeZone: 'America/Tegucigalpa' });
    return `${fmt(monday)} - ${fmt(sunday)}`;
}

async function getActiveTenants() {
    try {
        const { rows } = await pool.query(
            `SELECT id, slug FROM tenants WHERE estado = 'activo'`
        );
        return rows;
    } catch (err) {
        // tenants table may not exist yet (pre-migration); fall back to env-only mode
        console.warn('[cronJobs] tenants table not found, running in single-tenant mode:', err.message);
        return [{ id: null, slug: 'default' }];
    }
}

// ---------------------------------------------------------------------------
// a) Daily report — scoped to a single tenant
// ---------------------------------------------------------------------------
async function runDailyReport(tenantId = null) {
    const { adminEmail } = await getSystemConfig(tenantId);
    if (!adminEmail) {
        console.warn(`[cronJobs] adminEmail not set for tenant ${tenantId ? tenantId.substring(0, 8) : 'env'}, skipping daily report.`);
        return;
    }

    try {
        console.log(`[cronJobs] Generating daily report for tenant ${tenantId ? tenantId.substring(0, 8) : 'env'}...`);
        const hoy = getHondurasDateString();

        const tenantFilter = tenantId ? 'AND tenant_id = $2' : '';
        const baseParams   = tenantId ? [hoy, tenantId] : [hoy];

        const [ventasRow, topRow, stockRow] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(codVenta)         AS num_facturas,
                    COALESCE(SUM(total), 0) AS total_ventas,
                    COALESCE(SUM(isv_calculado), 0) AS isv_total
                FROM ventas
                WHERE TO_CHAR(fecha AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD') = $1
                  AND estado = 'Completada'
                  ${tenantFilter}
            `, baseParams),

            pool.query(`
                SELECT
                    COALESCE(m.nombre_comercial, m.nombre_generico, dv.producto, 'Medicamento') AS producto,
                    SUM(dv.cantidad) AS cantidad,
                    SUM(dv.cantidad * COALESCE(dv.precioUnitario, dv.precioVenta, 0)) AS total
                FROM detalleventa dv
                JOIN ventas v ON dv.idVenta = v.codVenta
                LEFT JOIN presentaciones_venta pv ON dv.id_presentacion = pv.id_presentacion
                LEFT JOIN medicamentos m ON pv.id_medicamento = m.codigo
                WHERE TO_CHAR(v.fecha AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD') = $1
                  AND v.estado = 'Completada' AND dv.tipoProducto = 'MEDICAMENTO'
                  ${tenantId ? 'AND v.tenant_id = $2' : ''}
                GROUP BY 1
                ORDER BY total DESC
                LIMIT 5
            `, baseParams),

            pool.query(`
                SELECT m.nombre_generico AS producto, SUM(l.cantidad_actual) AS stock
                FROM lotes_medicamento l
                JOIN medicamentos m ON l.id_medicamento = m.codigo
                WHERE l.estado = 'Activo' AND l.cantidad_actual <= m.stock_minimo
                  ${tenantId ? 'AND m.tenant_id = $1' : ''}
                GROUP BY m.nombre_generico
                ORDER BY stock ASC
                LIMIT 5
            `, tenantId ? [tenantId] : []),
        ]);

        const totalVentas  = Number(ventasRow.rows[0].total_ventas);
        const numFacturas  = Number(ventasRow.rows[0].num_facturas);
        const topProductos = topRow.rows.map(r => ({ producto: r.producto, cantidad: Number(r.cantidad), total: Number(r.total) }));
        const stockCritico = stockRow.rows.map(r => ({ producto: r.producto, stock: Number(r.stock) }));

        await emailService.sendDailyReportEmail(adminEmail, {
            fecha: hoy,
            totalVentas,
            numFacturas,
            gananciaEstimada: 0,
            totalEgresos: 0,
            saldoTigoFinal: 0,
            saldoClaroFinal: 0,
            reparacionesCompletadas: 0,
            reparacionesPendientes: 0,
            topProductos,
            stockCritico,
        });

        console.log(`[cronJobs] Daily report sent (tenant: ${tenantId ? tenantId.substring(0, 8) : 'env'})`);
    } catch (err) {
        console.error(`[cronJobs] Error in daily report (tenant: ${tenantId ? tenantId.substring(0, 8) : 'env'}):`, err.message);
    }
}

// ---------------------------------------------------------------------------
// b) Weekly report — scoped to a single tenant
// ---------------------------------------------------------------------------
async function runWeeklyReport(tenantId = null) {
    const { adminEmail } = await getSystemConfig(tenantId);
    if (!adminEmail) {
        console.warn(`[cronJobs] adminEmail not set for tenant ${tenantId ? tenantId.substring(0, 8) : 'env'}, skipping weekly report.`);
        return;
    }

    try {
        console.log(`[cronJobs] Generating weekly report for tenant ${tenantId ? tenantId.substring(0, 8) : 'env'}...`);

        const tf = tenantId ? 'AND tenant_id = $1' : '';
        const tp = tenantId ? [tenantId] : [];

        const [thisWeekRes, lastWeekRes, clientesRes, stockRes] = await Promise.all([
            pool.query(`
                SELECT
                    COALESCE(SUM(total), 0) AS ventas,
                    COALESCE(SUM(isv_calculado), 0) AS isv
                FROM ventas
                WHERE fecha AT TIME ZONE 'America/Tegucigalpa'
                    >= (NOW() AT TIME ZONE 'America/Tegucigalpa') - INTERVAL '7 days'
                  AND estado = 'Completada'
                  ${tf}
            `, tp),

            pool.query(`
                SELECT COALESCE(SUM(total), 0) AS ventas
                FROM ventas
                WHERE fecha AT TIME ZONE 'America/Tegucigalpa'
                    BETWEEN (NOW() AT TIME ZONE 'America/Tegucigalpa') - INTERVAL '14 days'
                        AND (NOW() AT TIME ZONE 'America/Tegucigalpa') - INTERVAL '7 days'
                  AND estado = 'Completada'
                  ${tf}
            `, tp),

            pool.query(`
                SELECT
                    COALESCE(c.nombre || ' ' || c.apellido, 'Consumidor Final') AS nombre,
                    COALESCE(SUM(v.total), 0) AS total
                FROM ventas v
                LEFT JOIN clientes c ON v.identidadCliente = c.identidad
                WHERE v.fecha AT TIME ZONE 'America/Tegucigalpa'
                    >= (NOW() AT TIME ZONE 'America/Tegucigalpa') - INTERVAL '7 days'
                  AND v.estado = 'Completada'
                  ${tenantId ? 'AND v.tenant_id = $1' : ''}
                GROUP BY 1
                ORDER BY total DESC
                LIMIT 5
            `, tp),

            pool.query(`
                SELECT m.nombre_generico AS producto, SUM(l.cantidad_actual) AS stock
                FROM lotes_medicamento l
                JOIN medicamentos m ON l.id_medicamento = m.codigo
                WHERE l.estado = 'Activo' AND l.cantidad_actual <= m.stock_minimo
                  ${tenantId ? 'AND m.tenant_id = $1' : ''}
                GROUP BY m.nombre_generico
                ORDER BY stock ASC
                LIMIT 10
            `, tp),
        ]);

        await emailService.sendWeeklyReportEmail(adminEmail, {
            semana:          getWeekLabel(0),
            ventas:          Number(thisWeekRes.rows[0].ventas),
            ventasAntSemana: Number(lastWeekRes.rows[0].ventas),
            gananciaSemana:  0,
            topClientes:     clientesRes.rows.map(r => ({ nombre: r.nombre, total: Number(r.total) })),
            stockCritico:    stockRes.rows.map(r => ({ producto: r.producto, stock: Number(r.stock) })),
        });

        console.log(`[cronJobs] Weekly report sent (tenant: ${tenantId ? tenantId.substring(0, 8) : 'env'})`);
    } catch (err) {
        console.error(`[cronJobs] Error in weekly report (tenant: ${tenantId ? tenantId.substring(0, 8) : 'env'}):`, err.message);
    }
}

async function runVeterinaryReminders(tenantId = null) {
    try {
        const params = tenantId ? [tenantId] : [];
        const tenantFilter = tenantId ? 'AND tenant_id = $1' : '';
        const { rows } = await pool.query(`
            SELECT *
            FROM recordatorios
            WHERE estado = 'Pendiente'
              AND fecha_programada <= NOW()
              AND correo_destino IS NOT NULL
              ${tenantFilter}
            ORDER BY fecha_programada ASC
            LIMIT 50
        `, params);

        for (const reminder of rows) {
            try {
                await emailService.sendVeterinaryReminderEmail(reminder.correo_destino, reminder);
                await pool.query(`
                    UPDATE recordatorios
                    SET estado='Enviado', fecha_envio=NOW(), intentos=intentos+1, ultimo_error=NULL
                    WHERE id_recordatorio=$1
                `, [reminder.id_recordatorio]);
            } catch (err) {
                await pool.query(`
                    UPDATE recordatorios
                    SET intentos=intentos+1,
                        ultimo_error=$2,
                        estado=CASE WHEN intentos + 1 >= 3 THEN 'Error' ELSE 'Pendiente' END
                    WHERE id_recordatorio=$1
                `, [reminder.id_recordatorio, err.message.substring(0, 1000)]);
            }
        }
        if (rows.length > 0) console.log(`[cronJobs] Veterinary reminders processed: ${rows.length}`);
    } catch (err) {
        if (!/relation "recordatorios" does not exist/i.test(err.message)) {
            console.error('[cronJobs] Error processing veterinary reminders:', err.message);
        }
    }
}

// ---------------------------------------------------------------------------
// Register all cron jobs — fan out per active tenant
// ---------------------------------------------------------------------------
function startCronJobs() {
    // Daily report — 11:00 PM Honduras (UTC-6) = 05:00 UTC
    cron.schedule('0 5 * * *', async () => {
        const tenants = await getActiveTenants();
        await Promise.allSettled(tenants.map(t => runDailyReport(t.id)));
    }, { timezone: 'UTC' });

    // Weekly report — Monday 8:00 AM Honduras = 14:00 UTC
    cron.schedule('0 14 * * 1', async () => {
        const tenants = await getActiveTenants();
        await Promise.allSettled(tenants.map(t => runWeeklyReport(t.id)));
    }, { timezone: 'UTC' });

    // Daily database backup — midnight Honduras (UTC-6) = 06:00 UTC
    // Backup runs once (global), not per-tenant; email uses env var
    cron.schedule('0 6 * * *', async () => {
        if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return;
        try {
            const { backupDatabase, deleteOldBackups } = require('./googleDriveService');
            const result = await backupDatabase();
            await deleteOldBackups(30);
            if (result.success && process.env.ADMIN_EMAIL) {
                const { sendBackupConfirmationEmail } = require('./emailService');
                const sizeKB = Math.round((result.size || 0) / 1024);
                await sendBackupConfirmationEmail(
                    process.env.ADMIN_EMAIL,
                    new Date().toLocaleDateString('es-HN'),
                    `${sizeKB} KB`,
                    result.webViewLink
                );
            }
            console.log('[BACKUP] Backup exitoso:', result.filename);
        } catch (err) {
            console.error('[BACKUP] Error en backup automático:', err.message);
        }
    }, { timezone: 'UTC' });

    // Monthly quota usage cleanup — 2nd of each month at 07:00 UTC (01:00 AM Honduras)
    // Removes ai_quota_usage rows older than 13 months to keep rolling year data.
    cron.schedule('0 7 2 * *', async () => {
        try {
            const cutoff = new Date();
            cutoff.setMonth(cutoff.getMonth() - 13);
            const periodo_corte = cutoff.toLocaleDateString('sv-SE', { timeZone: 'America/Tegucigalpa' }).slice(0, 7);
            const { rowCount } = await pool.query(
                `DELETE FROM ai_quota_usage WHERE periodo < $1`,
                [periodo_corte]
            );
            if (rowCount > 0) {
                console.log(`[cronJobs] Limpieza cuota IA: eliminados ${rowCount} registros anteriores a ${periodo_corte}`);
            }
        } catch (err) {
            console.error('[cronJobs] Error limpiando cuota IA antigua:', err.message);
        }
    }, { timezone: 'UTC' });

    // Loyalty points expiration — 2:00 AM Honduras (UTC-6) = 08:00 UTC
    cron.schedule('0 8 * * *', async () => {
        const { expirePoints } = require('./loyalty/loyaltyEngine');
        const tenants = await getActiveTenants();
        for (const t of tenants) {
            if (!t.id) continue;
            try {
                const expired = await expirePoints(t.id);
                if (expired > 0) {
                    console.log(`[loyalty] Expired ${expired} points for tenant ${t.id.substring(0, 8)}`);
                }
            } catch (err) {
                console.error(`[loyalty] expirePoints error (tenant ${t.id?.substring(0, 8)}):`, err.message);
            }
        }
    }, { timezone: 'UTC' });

    // Veterinary reminders every 15 minutes.
    cron.schedule('*/15 * * * *', async () => {
        const tenants = await getActiveTenants();
        await Promise.allSettled(tenants.map(t => runVeterinaryReminders(t.id)));
    }, { timezone: 'UTC' });

    console.log('[cronJobs] Cron jobs registered: daily report, weekly report, Drive backup, AI quota cleanup, loyalty expiry, veterinary reminders.');
}

module.exports = { startCronJobs, runDailyReport, runWeeklyReport, runVeterinaryReminders };
