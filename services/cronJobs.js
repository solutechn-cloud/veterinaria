'use strict';

const cron = require('node-cron');
const { pool } = require('../config/db');
const emailService = require('./emailService');

// In-memory Set to prevent duplicate low-balance alerts per day per red
const alertasSaldoEnviadas = new Set();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// a) Daily report — 11:00 PM Honduras = 05:00 UTC
// ---------------------------------------------------------------------------
async function runDailyReport() {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        console.warn('[cronJobs] ADMIN_EMAIL no configurado, omitiendo reporte diario.');
        return;
    }

    try {
        console.log('[cronJobs] Generando reporte diario...');

        const [ventasRes, egresosRes, saldosRes, repRes] = await Promise.all([
            pool.query(`
                SELECT
                    COALESCE(SUM(monto), 0) AS total_ventas,
                    COALESCE(SUM(costo),  0) AS total_costos
                FROM ingresos
                WHERE TO_CHAR(fechaCreacion AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD')
                    = TO_CHAR(NOW() AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD')
            `),
            pool.query(`
                SELECT COALESCE(SUM(monto), 0) AS total_egresos
                FROM egresos
                WHERE TO_CHAR(fechaCreacion AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD')
                    = TO_CHAR(NOW() AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD')
            `),
            pool.query(`
                SELECT DISTINCT ON (red) red, saldoFinal
                FROM saldos
                ORDER BY red, fecha DESC
            `),
            pool.query(`
                SELECT estado, COUNT(*) AS cantidad
                FROM reparaciones
                GROUP BY estado
            `),
        ]);

        const totalVentas   = Number(ventasRes.rows[0].total_ventas);
        const totalCostos   = Number(ventasRes.rows[0].total_costos);
        const totalEgresos  = Number(egresosRes.rows[0].total_egresos);
        const gananciaEstimada = totalVentas - totalCostos - totalEgresos;

        const saldoRow = (red) => {
            const r = saldosRes.rows.find(s => s.red && s.red.toUpperCase() === red);
            return r ? Number(r.saldofinal) : 0;
        };

        const repCompletas  = saldosRes.rows.length; // placeholder; use repRes
        const repEstados    = repRes.rows.reduce((acc, r) => { acc[r.estado] = Number(r.cantidad); return acc; }, {});
        const completadas   = repEstados['Completada'] || repEstados['Completado'] || 0;
        const pendientes    = Object.entries(repEstados)
            .filter(([k]) => !['Completada', 'Completado', 'Entregado', 'Cancelada'].includes(k))
            .reduce((s, [, v]) => s + v, 0);

        const fecha = getHondurasDateString();

        await emailService.sendDailyReportEmail(adminEmail, {
            fecha,
            totalVentas,
            totalRecargas: 0, // campo para desglose futuro
            gananciaEstimada,
            totalEgresos,
            saldoTigoFinal:  saldoRow('TIGO'),
            saldoClaroFinal: saldoRow('CLARO'),
            reparacionesCompletadas: completadas,
            reparacionesPendientes:  pendientes,
            topProductos: [],
        });

        console.log('[cronJobs] Reporte diario enviado a', adminEmail);
    } catch (err) {
        console.error('[cronJobs] Error en reporte diario:', err.message);
    }
}

// ---------------------------------------------------------------------------
// b) Warranty expiry — 9:00 AM Honduras = 15:00 UTC
// ---------------------------------------------------------------------------
async function runWarrantyCheck() {
    try {
        console.log('[cronJobs] Revisando garantias proximas a vencer...');

        const { rows } = await pool.query(`
            SELECT
                g.idGarantia,
                g.descripcion,
                g.fechaVencimiento,
                (g.fechaVencimiento::date - CURRENT_DATE) AS dias_restantes,
                c.nombre,
                c.email
            FROM garantias g
            JOIN clientes c ON g.idCliente = c.idCliente
            WHERE g.estado NOT IN ('Vencida', 'Procesada')
              AND c.email IS NOT NULL AND c.email != ''
              AND (g.fechaVencimiento::date - CURRENT_DATE) IN (7, 3)
        `);

        if (rows.length === 0) {
            console.log('[cronJobs] No hay garantias proximas a vencer hoy.');
            return;
        }

        for (const row of rows) {
            try {
                const expiryFormatted = new Date(row.fechavencimiento)
                    .toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Tegucigalpa' });

                await emailService.sendWarrantyExpiryEmail(
                    row.email,
                    row.nombre,
                    row.idgarantia,
                    row.descripcion,
                    expiryFormatted,
                    Number(row.dias_restantes)
                );
                console.log(`[cronJobs] Alerta garantia enviada a ${row.email} (${row.idgarantia})`);
            } catch (sendErr) {
                console.error(`[cronJobs] Error enviando alerta garantia ${row.idgarantia}:`, sendErr.message);
            }
        }
    } catch (err) {
        console.error('[cronJobs] Error en warranty check:', err.message);
    }
}

// ---------------------------------------------------------------------------
// c) Low balance monitor — every hour
// ---------------------------------------------------------------------------
async function runLowBalanceMonitor() {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;

    const umbralTigo  = Number(process.env.SALDO_TIGO_UMBRAL)  || 500;
    const umbralClaro = Number(process.env.SALDO_CLARO_UMBRAL) || 500;
    const hoyKey      = getHondurasDateString();

    try {
        const { rows } = await pool.query(`
            SELECT DISTINCT ON (red) red, saldoFinal
            FROM saldos
            ORDER BY red, fecha DESC
        `);

        for (const row of rows) {
            const red    = (row.red || '').toUpperCase();
            const saldo  = Number(row.saldofinal);
            const umbral = red === 'TIGO' ? umbralTigo : red === 'CLARO' ? umbralClaro : null;

            if (umbral === null) continue;

            const alertKey = `${red}-${hoyKey}`;
            if (saldo < umbral && !alertasSaldoEnviadas.has(alertKey)) {
                try {
                    await emailService.sendLowBalanceAlertEmail(adminEmail, red, saldo, umbral);
                    alertasSaldoEnviadas.add(alertKey);
                    console.log(`[cronJobs] Alerta saldo ${red} enviada (saldo: ${saldo}, umbral: ${umbral})`);
                } catch (sendErr) {
                    console.error(`[cronJobs] Error enviando alerta saldo ${red}:`, sendErr.message);
                }
            }
        }

        // Clean keys from previous days to avoid unbounded growth
        for (const key of alertasSaldoEnviadas) {
            if (!key.endsWith(hoyKey)) {
                alertasSaldoEnviadas.delete(key);
            }
        }
    } catch (err) {
        console.error('[cronJobs] Error en low balance monitor:', err.message);
    }
}

// ---------------------------------------------------------------------------
// d) Weekly report — Monday 8:00 AM Honduras = 14:00 UTC
// ---------------------------------------------------------------------------
async function runWeeklyReport() {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        console.warn('[cronJobs] ADMIN_EMAIL no configurado, omitiendo reporte semanal.');
        return;
    }

    try {
        console.log('[cronJobs] Generando reporte semanal...');

        const [thisWeekRes, lastWeekRes, clientesRes, stockRes] = await Promise.all([
            // Ventas + ganancia de los ultimos 7 dias
            pool.query(`
                SELECT
                    COALESCE(SUM(monto), 0) AS ventas,
                    COALESCE(SUM(monto) - SUM(costo), 0) AS ganancia
                FROM ingresos
                WHERE fechaCreacion AT TIME ZONE 'America/Tegucigalpa'
                    >= (NOW() AT TIME ZONE 'America/Tegucigalpa') - INTERVAL '7 days'
            `),
            // Ventas semana anterior (7-14 dias atras)
            pool.query(`
                SELECT COALESCE(SUM(monto), 0) AS ventas
                FROM ingresos
                WHERE fechaCreacion AT TIME ZONE 'America/Tegucigalpa'
                    BETWEEN (NOW() AT TIME ZONE 'America/Tegucigalpa') - INTERVAL '14 days'
                        AND (NOW() AT TIME ZONE 'America/Tegucigalpa') - INTERVAL '7 days'
            `),
            // Top 5 clientes por ventas en los ultimos 7 dias
            pool.query(`
                SELECT c.nombre, COALESCE(SUM(i.monto), 0) AS total
                FROM ingresos i
                JOIN clientes c ON i.identidadCliente = c.identidad
                WHERE i.fechaCreacion AT TIME ZONE 'America/Tegucigalpa'
                    >= (NOW() AT TIME ZONE 'America/Tegucigalpa') - INTERVAL '7 days'
                GROUP BY c.nombre
                ORDER BY total DESC
                LIMIT 5
            `),
            // Stock critico: accesorios/inventario con stock <= 5
            pool.query(`
                SELECT nombre AS producto, stock
                FROM inventario
                WHERE stock <= 5
                ORDER BY stock ASC
                LIMIT 10
            `),
        ]);

        const semana         = getWeekLabel(0);
        const ventas         = Number(thisWeekRes.rows[0].ventas);
        const gananciaSemana = Number(thisWeekRes.rows[0].ganancia);
        const ventasAntSemana = Number(lastWeekRes.rows[0].ventas);

        const topClientes = clientesRes.rows.map(r => ({ nombre: r.nombre, total: Number(r.total) }));
        const stockCritico = stockRes.rows.map(r => ({ producto: r.producto, stock: Number(r.stock) }));

        await emailService.sendWeeklyReportEmail(adminEmail, {
            semana,
            ventas,
            ventasAntSemana,
            gananciaSemana,
            topClientes,
            stockCritico,
        });

        console.log('[cronJobs] Reporte semanal enviado a', adminEmail);
    } catch (err) {
        console.error('[cronJobs] Error en reporte semanal:', err.message);
    }
}

// ---------------------------------------------------------------------------
// Register all cron jobs
// ---------------------------------------------------------------------------
function startCronJobs() {
    if (!process.env.ADMIN_EMAIL) {
        console.warn('[cronJobs] ADMIN_EMAIL no configurado. Los cron jobs de notificaciones no se iniciaran.');
        return;
    }

    // Daily report — 11:00 PM Honduras (UTC-6) = 05:00 UTC
    cron.schedule('0 5 * * *', runDailyReport, { timezone: 'UTC' });

    // Warranty expiry check — 9:00 AM Honduras = 15:00 UTC
    cron.schedule('0 15 * * *', runWarrantyCheck, { timezone: 'UTC' });

    // Low balance monitor — every hour
    cron.schedule('0 * * * *', runLowBalanceMonitor, { timezone: 'UTC' });

    // Weekly report — Monday 8:00 AM Honduras = 14:00 UTC
    cron.schedule('0 14 * * 1', runWeeklyReport, { timezone: 'UTC' });

    // Alerta semanal de consignaciones vencidas/sin movimiento — Viernes 5PM Honduras = Viernes 23:00 UTC
    cron.schedule('0 23 * * 5', async () => {
      if (!process.env.ADMIN_EMAIL) return;
      try {
        // Get consignments older than 30 days that haven't been settled
        const result = await pool.query(`
          SELECT c.idConsignacion, c.fechaConsignacion, c.estado,
                 cli.nombre || ' ' || cli.apellido as consignatario,
                 COUNT(dc.id) as totalEquipos,
                 (CURRENT_DATE - c.fechaConsignacion::date) as diasTranscurridos
          FROM consignaciones c
          JOIN clientes cli ON c.idCliente = cli.idCliente
          LEFT JOIN detalle_consignacion dc ON c.idConsignacion = dc.idConsignacion
          WHERE c.estado = 'Activa'
            AND (CURRENT_DATE - c.fechaConsignacion::date) > 30
          GROUP BY c.idConsignacion, c.fechaConsignacion, c.estado, consignatario
          ORDER BY diasTranscurridos DESC
        `);

        if (result.rows.length === 0) return;

        // Build simple email report
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const rows = result.rows.map(r =>
          `<tr><td>${r.consignatario}</td><td>${r.totalequipos}</td><td>${r.diastranscurridos} días</td></tr>`
        ).join('');

        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'SmartCloud <noreply@erpsmartcloud.com>',
          to: process.env.ADMIN_EMAIL,
          subject: `⚠️ ${result.rows.length} consignación(es) sin liquidar — Semana del ${new Date().toLocaleDateString('es-HN')}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#dc2626">Consignaciones sin liquidar</h2>
            <p>Las siguientes consignaciones llevan más de 30 días activas sin ser liquidadas:</p>
            <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%">
              <thead><tr style="background:#f3f4f6"><th>Consignatario</th><th>Equipos</th><th>Tiempo</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="color:#6b7280;font-size:12px">Sistema ERP SmartCloud</p>
          </div>`
        });
        console.log('[CRON] Alertas consignaciones enviadas:', result.rows.length);
      } catch(err) {
        console.error('[CRON] Error alertas consignaciones:', err.message);
      }
    }, { timezone: 'UTC' });

    // Daily database backup — midnight Honduras (UTC-6) = 06:00 UTC
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

    console.log('[cronJobs] Cron jobs registrados: reporte diario, garantias, saldo bajo, reporte semanal, backup Drive.');
}

module.exports = { startCronJobs, runDailyReport, runWarrantyCheck, runLowBalanceMonitor, runWeeklyReport };
