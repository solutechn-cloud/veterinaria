'use strict';

const { pool } = require('../config/db');
const { getSystemConfig } = require('../config/systemConfig');
const emailService = require('./emailService');

const EVENT_CATALOG = [
    { key: 'daily_report', label: 'Resumen diario operativo', category: 'Reportes', recommendedTime: '22:30', description: 'Ventas, citas, stock critico y actividad clinica del dia.' },
    { key: 'weekly_report', label: 'Resumen semanal gerencial', category: 'Reportes', recommendedTime: '08:00', description: 'Ingresos, tutores frecuentes, inventario critico y desempeno semanal.' },
    { key: 'monthly_report', label: 'Resumen mensual gerencial', category: 'Reportes', recommendedTime: '08:30', description: 'Ventas, citas, vacunas, no-shows e inventario critico del mes.' },
    { key: 'backup_ok', label: 'Backup completado', category: 'Seguridad', recommendedTime: '02:45', description: 'Confirmacion de respaldo exitoso en Cloudflare R2.' },
    { key: 'backup_error', label: 'Backup con error', category: 'Seguridad', recommendedTime: '02:45', description: 'Alerta inmediata si el respaldo nocturno falla.' },
    { key: 'stock_critico', label: 'Inventario critico', category: 'Inventario', recommendedTime: '07:30', description: 'Medicamentos, vacunas e insumos por debajo del minimo.' },
    { key: 'vacunas_proximas', label: 'Vacunas proximas o vencidas', category: 'Clinica', recommendedTime: '08:00', description: 'Pacientes que requieren vacunacion o refuerzo.' },
    { key: 'citas_manana', label: 'Agenda de manana', category: 'Recepcion', recommendedTime: '17:00', description: 'Citas programadas para preparar recepcion y medicos.' },
    { key: 'appointment_created', label: 'Confirmacion de cita al tutor', category: 'Recepcion', recommendedTime: null, description: 'Correo inmediato cuando se programa una cita con tutor y paciente.' },
    { key: 'no_shows', label: 'Citas no asistidas', category: 'Recepcion', recommendedTime: '18:00', description: 'Seguimiento comercial de pacientes que no llegaron.' },
    { key: 'facturacion_pendiente', label: 'Facturacion pendiente', category: 'Finanzas', recommendedTime: '16:30', description: 'Consultas o servicios clinicos pendientes de cobro.' },
];

function getEventCatalog() {
    return EVENT_CATALOG;
}

async function ensureAdminRecipient(tenantId, adminEmail) {
    if (!tenantId || !adminEmail) return;
    await pool.query(`
        INSERT INTO automation_recipients (tenant_id, nombre, email, tipo, activo)
        VALUES ($1, 'Administrador principal', $2, 'persona', TRUE)
        ON CONFLICT (tenant_id, email) DO NOTHING
    `, [tenantId, adminEmail]);

    const { rows } = await pool.query(
        'SELECT id FROM automation_recipients WHERE tenant_id = $1 AND email = $2 LIMIT 1',
        [tenantId, adminEmail]
    );
    const recipientId = rows[0]?.id;
    if (!recipientId) return;

    for (const event of EVENT_CATALOG) {
        await pool.query(`
            INSERT INTO automation_recipient_events (tenant_id, recipient_id, event_key, enabled, scheduled_time)
            VALUES ($1, $2, $3, TRUE, $4)
            ON CONFLICT (tenant_id, recipient_id, event_key) DO NOTHING
        `, [tenantId, recipientId, event.key, event.recommendedTime]);
    }
}

async function listRecipients(tenantId) {
    const { rows } = await pool.query(`
        SELECT
            r.id, r.nombre, r.email, r.tipo, r.activo, r.created_at, r.updated_at,
            COALESCE(
                json_agg(
                    json_build_object(
                        'eventKey', e.event_key,
                        'enabled', e.enabled,
                        'scheduledTime', TO_CHAR(e.scheduled_time, 'HH24:MI')
                    )
                    ORDER BY e.event_key
                ) FILTER (WHERE e.id IS NOT NULL),
                '[]'::json
            ) AS events
        FROM automation_recipients r
        LEFT JOIN automation_recipient_events e ON e.recipient_id = r.id AND e.tenant_id = r.tenant_id
        WHERE r.tenant_id = $1
        GROUP BY r.id
        ORDER BY r.activo DESC, r.nombre ASC
    `, [tenantId]);
    return rows;
}

async function upsertRecipient(tenantId, payload) {
    const nombre = String(payload.nombre || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const tipo = payload.tipo === 'grupo' ? 'grupo' : 'persona';
    const activo = payload.activo !== false;
    if (!nombre || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const err = new Error('Nombre y correo valido son requeridos.');
        err.statusCode = 400;
        throw err;
    }

    const params = [tenantId, nombre, email, tipo, activo];
    const { rows } = await pool.query(`
        INSERT INTO automation_recipients (tenant_id, nombre, email, tipo, activo)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, email) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            tipo = EXCLUDED.tipo,
            activo = EXCLUDED.activo,
            updated_at = NOW()
        RETURNING *
    `, params);

    if (Array.isArray(payload.events)) {
        await setRecipientEvents(tenantId, rows[0].id, payload.events);
    }
    return rows[0];
}

async function setRecipientEvents(tenantId, recipientId, events) {
    const allowed = new Set(EVENT_CATALOG.map(e => e.key));
    for (const event of events) {
        const eventKey = event.eventKey || event.event_key;
        if (!allowed.has(eventKey)) continue;
        await pool.query(`
            INSERT INTO automation_recipient_events (tenant_id, recipient_id, event_key, enabled, scheduled_time)
            VALUES ($1, $2, $3, $4, NULLIF($5, '')::time)
            ON CONFLICT (tenant_id, recipient_id, event_key) DO UPDATE SET
                enabled = EXCLUDED.enabled,
                scheduled_time = EXCLUDED.scheduled_time,
                updated_at = NOW()
        `, [tenantId, recipientId, eventKey, event.enabled !== false, event.scheduledTime || event.scheduled_time || null]);
    }
}

async function deleteRecipient(tenantId, id) {
    await pool.query('DELETE FROM automation_recipients WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
}

async function getRecipientEmails(tenantId, eventKey) {
    const { rows } = await pool.query(`
        SELECT DISTINCT r.email
        FROM automation_recipients r
        JOIN automation_recipient_events e ON e.recipient_id = r.id AND e.tenant_id = r.tenant_id
        WHERE r.tenant_id = $1 AND r.activo = TRUE AND e.event_key = $2 AND e.enabled = TRUE
    `, [tenantId, eventKey]);
    if (rows.length) return rows.map(r => r.email);

    const cfg = await getSystemConfig(tenantId);
    return cfg.adminEmail ? [cfg.adminEmail] : [];
}

async function sendEventEmail(tenantId, eventKey, sendFn) {
    const recipients = await getRecipientEmails(tenantId, eventKey);
    if (!recipients.length) return { sent: 0 };
    await Promise.all(recipients.map(email => sendFn(email)));
    return { sent: recipients.length };
}

async function listBackupJobs(tenantId, limit = 20) {
    const { rows } = await pool.query(`
        SELECT id, tenant_id, scope, provider, estado, object_key, size_bytes, started_at, finished_at, error, created_at
        FROM backup_jobs
        WHERE tenant_id IS NULL OR tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2
    `, [tenantId, limit]);
    return rows;
}

module.exports = {
    getEventCatalog,
    ensureAdminRecipient,
    listRecipients,
    upsertRecipient,
    setRecipientEvents,
    deleteRecipient,
    getRecipientEmails,
    sendEventEmail,
    listBackupJobs,
};
