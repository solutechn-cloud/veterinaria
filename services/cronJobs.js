'use strict';

const cron = require('node-cron');
const { pool, setRequestBypass } = require('../config/db');

// Los cron jobs corren sin sesión HTTP (sin contexto de tenant) y son
// legítimamente cross-tenant, así que se ejecutan bajo bypass de RLS.
function scheduleBypass(expr, handler, opts) {
    return require('node-cron').schedule(expr, () => setRequestBypass(handler), opts);
}
const emailService = require('./emailService');
const { getSystemConfig } = require('../config/systemConfig');
const automationService = require('./automationService');
const messagingCampaignService = require('./messagingCampaignService');
const messagingAutomationService = require('./messagingAutomationService');

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
        console.warn(`[cronJobs] adminEmail not set for tenant ${tenantId ? tenantId.substring(0, 8) : 'env'}, using automation recipients only.`);
    }

    try {
        console.log(`[cronJobs] Generating daily report for tenant ${tenantId ? tenantId.substring(0, 8) : 'env'}...`);
        const hoy = getHondurasDateString();

        const tenantFilter = tenantId ? 'AND tenant_id = $2' : '';
        const baseParams   = tenantId ? [hoy, tenantId] : [hoy];

        const [ventasRow, topRow, stockRow, citasRow, vacunasRow] = await Promise.all([
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

            pool.query(`
                SELECT
                    COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE estado = 'Confirmada')::int AS confirmadas,
                    COUNT(*) FILTER (WHERE estado = 'No asistio')::int AS no_shows
                FROM citas
                WHERE TO_CHAR(fecha_inicio AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD') = $1
                  ${tenantId ? 'AND tenant_id = $2' : ''}
            `, baseParams),

            pool.query(`
                SELECT COUNT(*)::int AS total
                FROM vacunas_aplicadas
                WHERE fecha_aplicacion = $1::date
                  ${tenantId ? 'AND tenant_id = $2' : ''}
            `, baseParams),
        ]);

        const totalVentas  = Number(ventasRow.rows[0].total_ventas);
        const numFacturas  = Number(ventasRow.rows[0].num_facturas);
        const topProductos = topRow.rows.map(r => ({ producto: r.producto, cantidad: Number(r.cantidad), total: Number(r.total) }));
        const stockCritico = stockRow.rows.map(r => ({ producto: r.producto, stock: Number(r.stock) }));
        const citasHoy = Number(citasRow.rows[0]?.total || 0);
        const vacunasAplicadas = Number(vacunasRow.rows[0]?.total || 0);
        const noShows = Number(citasRow.rows[0]?.no_shows || 0);

        const reportPayload = {
            fecha: hoy,
            totalVentas,
            numFacturas,
            gananciaEstimada: 0,
            totalEgresos: 0,
            citasHoy,
            vacunasAplicadas,
            noShows,
            topProductos,
            stockCritico,
        };
        await automationService.sendEventEmail(tenantId, 'daily_report', (to, meta) =>
            emailService.sendDailyReportEmail(to, reportPayload, meta)
        );

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
        console.warn(`[cronJobs] adminEmail not set for tenant ${tenantId ? tenantId.substring(0, 8) : 'env'}, using automation recipients only.`);
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

        const weeklyPayload = {
            semana:          getWeekLabel(0),
            ventas:          Number(thisWeekRes.rows[0].ventas),
            ventasAntSemana: Number(lastWeekRes.rows[0].ventas),
            gananciaSemana:  0,
            topClientes:     clientesRes.rows.map(r => ({ nombre: r.nombre, total: Number(r.total) })),
            stockCritico:    stockRes.rows.map(r => ({ producto: r.producto, stock: Number(r.stock) })),
        };
        await automationService.sendEventEmail(tenantId, 'weekly_report', (to, meta) =>
            emailService.sendWeeklyReportEmail(to, weeklyPayload, meta)
        );

        console.log(`[cronJobs] Weekly report sent (tenant: ${tenantId ? tenantId.substring(0, 8) : 'env'})`);
    } catch (err) {
        console.error(`[cronJobs] Error in weekly report (tenant: ${tenantId ? tenantId.substring(0, 8) : 'env'}):`, err.message);
    }
}

async function runTomorrowAgenda(tenantId = null) {
    try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const fecha = tomorrow.toLocaleDateString('sv-SE', { timeZone: 'America/Tegucigalpa' });
        const params = tenantId ? [fecha, tenantId] : [fecha];
        const { rows } = await pool.query(`
            SELECT c.fecha_inicio, c.estado, c.motivo,
                   p.nombre AS paciente,
                   COALESCE(cli.nombre || ' ' || cli.apellido, cli.nombre, 'Tutor') AS tutor,
                   tc.nombre AS tipo,
                   COALESCE(e.nombre || ' ' || e.apellido, u.usuario, c.id_veterinario, 'Sin asignar') AS veterinario
            FROM citas c
            LEFT JOIN pacientes p ON p.id_paciente = c.id_paciente AND p.tenant_id = c.tenant_id
            LEFT JOIN clientes cli ON cli.identidad = c.id_tutor AND cli.tenant_id = c.tenant_id
            LEFT JOIN tipos_cita tc ON tc.id_tipo_cita = c.id_tipo_cita AND tc.tenant_id = c.tenant_id
            LEFT JOIN usuarios u ON u.codUsuario::text = c.id_veterinario::text AND u.tenant_id = c.tenant_id
            LEFT JOIN empleado e ON e.identidad = u.identidad AND e.tenant_id = c.tenant_id
            WHERE TO_CHAR(c.fecha_inicio AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD') = $1
              AND c.estado NOT IN ('Cancelada')
              ${tenantId ? 'AND c.tenant_id = $2' : ''}
            ORDER BY c.fecha_inicio ASC
            LIMIT 120
        `, params);
        const citas = rows.map(r => ({
            hora: new Date(r.fecha_inicio).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Tegucigalpa' }),
            paciente: r.paciente,
            tutor: r.tutor,
            tipo: r.tipo || r.motivo || 'Cita',
            veterinario: r.veterinario,
            estado: r.estado,
        }));
        await automationService.sendEventEmail(tenantId, 'citas_manana', (to, meta) =>
            emailService.sendAppointmentAgendaEmail(to, {
                fecha,
                citas,
                resumen: {
                    total: citas.length,
                    confirmadas: citas.filter(c => c.estado === 'Confirmada').length,
                },
            }, meta)
        );
        if (citas.length > 0) console.log(`[cronJobs] Tomorrow agenda sent (${citas.length} citas).`);
    } catch (err) {
        console.error(`[cronJobs] Error in tomorrow agenda (tenant: ${tenantId ? tenantId.substring(0, 8) : 'env'}):`, err.message);
    }
}

async function runMonthlyReport(tenantId = null) {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);
        const mes = start.toLocaleString('es-HN', { month: 'long', year: 'numeric', timeZone: 'America/Tegucigalpa' });
        const startStr = start.toISOString();
        const endStr = end.toISOString();
        const params = tenantId ? [startStr, endStr, tenantId] : [startStr, endStr];

        const [ventasRes, topRes, stockRes, citasRes, vacunasRes] = await Promise.all([
            pool.query(`
                SELECT COALESCE(SUM(total),0) AS ventas, COALESCE(SUM(isv_calculado),0) AS isv, COUNT(*)::int AS facturas
                FROM ventas
                WHERE fecha >= $1 AND fecha < $2 AND estado='Completada'
                ${tenantId ? 'AND tenant_id = $3' : ''}
            `, params),
            pool.query(`
                SELECT COALESCE(m.nombre_comercial, m.nombre_generico, dv.producto, 'Item') AS producto,
                       SUM(dv.cantidad) AS qty,
                       SUM(dv.cantidad * COALESCE(dv.precioUnitario, dv.precioVenta, 0)) AS total
                FROM detalleventa dv
                JOIN ventas v ON dv.idVenta = v.codVenta
                LEFT JOIN presentaciones_venta pv ON dv.id_presentacion = pv.id_presentacion
                LEFT JOIN medicamentos m ON pv.id_medicamento = m.codigo
                WHERE v.fecha >= $1 AND v.fecha < $2 AND v.estado='Completada'
                  ${tenantId ? 'AND v.tenant_id = $3' : ''}
                GROUP BY 1
                ORDER BY total DESC
                LIMIT 8
            `, params),
            pool.query(`
                SELECT m.nombre_generico AS producto, SUM(l.cantidad_actual) AS stock
                FROM lotes_medicamento l
                JOIN medicamentos m ON l.id_medicamento = m.codigo
                WHERE l.estado = 'Activo' AND l.cantidad_actual <= m.stock_minimo
                  ${tenantId ? 'AND m.tenant_id = $1' : ''}
                GROUP BY m.nombre_generico
                ORDER BY stock ASC
                LIMIT 8
            `, tenantId ? [tenantId] : []),
            pool.query(`
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE estado = 'No asistio')::int AS no_shows
                FROM citas
                WHERE fecha_inicio >= $1 AND fecha_inicio < $2
                  ${tenantId ? 'AND tenant_id = $3' : ''}
            `, params),
            pool.query(`
                SELECT COUNT(*)::int AS total
                FROM vacunas_aplicadas
                WHERE fecha_aplicacion >= $1::date AND fecha_aplicacion < $2::date
                  ${tenantId ? 'AND tenant_id = $3' : ''}
            `, params),
        ]);

        await automationService.sendEventEmail(tenantId, 'monthly_report', (to, meta) =>
            emailService.sendMonthlyManagementReportEmail(to, {
                mes,
                ventas: Number(ventasRes.rows[0]?.ventas || 0),
                isv: Number(ventasRes.rows[0]?.isv || 0),
                numFacturas: Number(ventasRes.rows[0]?.facturas || 0),
                citas: Number(citasRes.rows[0]?.total || 0),
                vacunas: Number(vacunasRes.rows[0]?.total || 0),
                noShows: Number(citasRes.rows[0]?.no_shows || 0),
                topItems: topRes.rows,
                stockCritico: stockRes.rows,
            }, meta)
        );
        console.log(`[cronJobs] Monthly report sent for ${mes}.`);
    } catch (err) {
        console.error(`[cronJobs] Error in monthly report (tenant: ${tenantId ? tenantId.substring(0, 8) : 'env'}):`, err.message);
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
                await emailService.sendVeterinaryReminderEmail(reminder.correo_destino, reminder, {
                    tenantId: reminder.tenant_id || tenantId,
                    eventKey: reminder.tipo || 'recordatorio_veterinario',
                    source: 'recordatorios',
                    relatedTable: 'recordatorios',
                    relatedId: reminder.id_recordatorio,
                });
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
async function runScheduledMessagingCampaigns(tenantId = null) {
    if (!tenantId) return 0;
    try {
        const processed = await messagingCampaignService.processDueCampaigns(tenantId, 3);
        if (processed > 0) {
            console.log(`[cronJobs] Campanas programadas procesadas (${processed}) tenant ${tenantId.substring(0, 8)}.`);
        }
        return processed;
    } catch (err) {
        console.error(`[cronJobs] Error procesando campanas programadas (tenant: ${tenantId.substring(0, 8)}):`, err.message);
        return 0;
    }
}

function startCronJobs() {
    // Daily report — 11:00 PM Honduras (UTC-6) = 05:00 UTC
    scheduleBypass('0 5 * * *', async () => {
        const tenants = await getActiveTenants();
        await Promise.allSettled(tenants.map(t => runDailyReport(t.id)));
    }, { timezone: 'UTC' });

    // Weekly report — Monday 8:00 AM Honduras = 14:00 UTC
    scheduleBypass('0 14 * * 1', async () => {
        const tenants = await getActiveTenants();
        await Promise.allSettled(tenants.map(t => runWeeklyReport(t.id)));
    }, { timezone: 'UTC' });

    // Tomorrow agenda - 5:00 PM Honduras = 23:00 UTC
    scheduleBypass('0 23 * * *', async () => {
        const tenants = await getActiveTenants();
        await Promise.allSettled(tenants.map(t => runTomorrowAgenda(t.id)));
    }, { timezone: 'UTC' });

    // Monthly management report - 1st day, 8:30 AM Honduras = 14:30 UTC
    scheduleBypass('30 14 1 * *', async () => {
        const tenants = await getActiveTenants();
        await Promise.allSettled(tenants.map(t => runMonthlyReport(t.id)));
    }, { timezone: 'UTC' });

    // Daily database backup — 2:30 AM Honduras (UTC-6) = 08:30 UTC.
    // Backup runs once globally because the database contains all tenants.
    scheduleBypass('30 8 * * *', async () => {
        const { backupEnabled, backupRetentionDays, backupR2Prefix } = await getSystemConfig();
        if (!backupEnabled) return;
        let jobId = null;
        try {
            const started = await pool.query(`
                INSERT INTO backup_jobs (tenant_id, scope, provider, estado, started_at)
                VALUES (NULL, 'all_tenants', 'cloudflare_r2', 'Ejecutando', NOW())
                RETURNING id
            `);
            jobId = started.rows[0].id;
            const { backupDatabaseToR2, deleteOldR2Backups } = require('./r2BackupService');
            const result = await backupDatabaseToR2({ tenantSlug: 'all-tenants', scope: 'all_tenants', prefix: backupR2Prefix });
            await deleteOldR2Backups(backupRetentionDays, backupR2Prefix);
            await pool.query(`
                UPDATE backup_jobs
                SET estado = 'Completado', object_key = $1, size_bytes = $2, finished_at = NOW()
                WHERE id = $3
            `, [result.objectKey, result.size, jobId]);

            const tenants = await getActiveTenants();
            await Promise.allSettled(tenants.filter(t => t.id).map(t =>
                automationService.sendEventEmail(t.id, 'backup_ok', (to, meta) =>
                    emailService.sendBackupConfirmationEmail(
                        to,
                        new Date().toLocaleDateString('es-HN'),
                        `${Math.round((result.size || 0) / 1024)} KB`,
                        result.objectKey,
                        meta
                    )
                )
            ));
            console.log('[BACKUP] Backup exitoso:', result.filename);
        } catch (err) {
            if (jobId) {
                await pool.query(`UPDATE backup_jobs SET estado = 'Error', error = $1, finished_at = NOW() WHERE id = $2`, [err.message, jobId]).catch(() => {});
            }
            console.error('[BACKUP] Error en backup automatico:', err.message);
        }
    }, { timezone: 'UTC' });

    // Monthly quota usage cleanup — 2nd of each month at 07:00 UTC (01:00 AM Honduras)
    // Removes ai_quota_usage rows older than 13 months to keep rolling year data.
    scheduleBypass('0 7 2 * *', async () => {
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
    scheduleBypass('0 8 * * *', async () => {
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
    scheduleBypass('*/15 * * * *', async () => {
        const tenants = await getActiveTenants();
        await Promise.allSettled(tenants.map(t => runVeterinaryReminders(t.id)));
    }, { timezone: 'UTC' });

    // Scheduled messaging automations and campaigns every 5 minutes.
    scheduleBypass('*/5 * * * *', async () => {
        const tenants = await getActiveTenants();
        await Promise.allSettled(tenants.filter(t => t.id).map(async t => {
            await messagingAutomationService.processDueAutomations(t.id, 3).catch(err =>
                console.error(`[cronJobs] Error procesando automatizaciones de mensajeria (tenant: ${t.id.substring(0, 8)}):`, err.message)
            );
            return runScheduledMessagingCampaigns(t.id);
        }));
    }, { timezone: 'UTC' });

    console.log('[cronJobs] Cron jobs registered: reports, agenda, R2 backup, AI quota cleanup, loyalty, reminders and messaging automations.');
}

module.exports = { startCronJobs, runDailyReport, runWeeklyReport, runMonthlyReport, runTomorrowAgenda, runVeterinaryReminders, runScheduledMessagingCampaigns };
