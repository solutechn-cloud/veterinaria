'use strict';

const { pool } = require('../config/db');

const AUDIENCE_DEFINITIONS = [
    { value: 'all_tutors', label: 'Todos los tutores', hint: 'Tutores con correo valido y activo.', group: 'General' },
    { value: 'active_patients', label: 'Tutores con pacientes activos', hint: 'Pacientes con expediente activo.', group: 'General' },
    { value: 'recent_tutors', label: 'Tutores recientes', hint: 'Clientes creados en los ultimos 90 dias.', group: 'General' },
    { value: 'appointment_upcoming', label: 'Citas proximas', hint: 'Tutores con citas futuras no cerradas.', group: 'Agenda' },
    { value: 'appointment_tomorrow', label: 'Citas de manana', hint: 'Recordatorio operativo para las citas de manana.', group: 'Agenda' },
    { value: 'vaccines_due', label: 'Vacunas vencidas', hint: 'Pacientes con proxima dosis vencida o para hoy.', group: 'Medicina preventiva' },
    { value: 'vaccines_next_30', label: 'Vacunas proximos 30 dias', hint: 'Pacientes con vacuna o refuerzo por vencer.', group: 'Medicina preventiva' },
    { value: 'inactive_tutors', label: 'Tutores inactivos', hint: 'Tutores sin actividad clinica reciente.', group: 'Retencion' },
    { value: 'species_canine', label: 'Pacientes caninos', hint: 'Campanas enfocadas en perros.', group: 'Especies' },
    { value: 'species_feline', label: 'Pacientes felinos', hint: 'Campanas enfocadas en gatos.', group: 'Especies' },
];

const VALID_AUDIENCES = new Set(AUDIENCE_DEFINITIONS.map(item => item.value));
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, max = 1000) {
    if (value == null) return '';
    return String(value).trim().substring(0, max);
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function validateAudienceType(value) {
    const audienceType = clean(value || 'all_tutors', 40);
    if (!VALID_AUDIENCES.has(audienceType)) {
        const err = new Error('Audiencia invalida.');
        err.statusCode = 400;
        throw err;
    }
    return audienceType;
}

function audienceCondition(type) {
    const activePatient = `
        EXISTS (
            SELECT 1 FROM pacientes p
            WHERE p.tenant_id = c.tenant_id
              AND p.id_tutor = c.identidad
              AND COALESCE(p.estado, 'Activo') = 'Activo'
        )`;
    const upcomingAppointment = `
        EXISTS (
            SELECT 1 FROM citas ci
            WHERE ci.tenant_id = c.tenant_id
              AND ci.id_tutor = c.identidad
              AND ci.fecha_inicio >= NOW()
              AND ci.estado NOT IN ('Cancelada', 'No asistio', 'Completada')
        )`;
    const vaccineJoin = `
        EXISTS (
            SELECT 1
            FROM pacientes p
            JOIN vacunas_aplicadas va
              ON va.tenant_id = p.tenant_id
             AND va.id_paciente = p.id_paciente
            WHERE p.tenant_id = c.tenant_id
              AND p.id_tutor = c.identidad`;

    switch (type) {
        case 'active_patients':
            return `AND ${activePatient}`;
        case 'recent_tutors':
            return `AND c.fechaCreacion >= NOW() - INTERVAL '90 days'`;
        case 'appointment_upcoming':
            return `AND ${upcomingAppointment}`;
        case 'appointment_tomorrow':
            return `AND EXISTS (
                SELECT 1 FROM citas ci
                WHERE ci.tenant_id = c.tenant_id
                  AND ci.id_tutor = c.identidad
                  AND ci.fecha_inicio >= CURRENT_DATE + INTERVAL '1 day'
                  AND ci.fecha_inicio < CURRENT_DATE + INTERVAL '2 days'
                  AND ci.estado NOT IN ('Cancelada', 'No asistio', 'Completada')
            )`;
        case 'vaccines_due':
            return `AND ${vaccineJoin}
              AND va.proxima_dosis IS NOT NULL
              AND va.proxima_dosis <= CURRENT_DATE
        )`;
        case 'vaccines_next_30':
            return `AND ${vaccineJoin}
              AND va.proxima_dosis > CURRENT_DATE
              AND va.proxima_dosis <= CURRENT_DATE + INTERVAL '30 days'
        )`;
        case 'inactive_tutors':
            return `AND ${activePatient}
                AND NOT EXISTS (
                    SELECT 1 FROM citas ci
                    WHERE ci.tenant_id = c.tenant_id
                      AND ci.id_tutor = c.identidad
                      AND ci.fecha_inicio >= NOW() - INTERVAL '180 days'
                      AND ci.estado IN ('Confirmada', 'En espera', 'En consulta', 'Completada')
                )`;
        case 'species_canine':
            return `AND EXISTS (
                SELECT 1 FROM pacientes p
                WHERE p.tenant_id = c.tenant_id
                  AND p.id_tutor = c.identidad
                  AND COALESCE(p.estado, 'Activo') = 'Activo'
                  AND LOWER(TRIM(p.especie)) IN ('canino', 'canina', 'perro')
            )`;
        case 'species_feline':
            return `AND EXISTS (
                SELECT 1 FROM pacientes p
                WHERE p.tenant_id = c.tenant_id
                  AND p.id_tutor = c.identidad
                  AND COALESCE(p.estado, 'Activo') = 'Activo'
                  AND LOWER(TRIM(p.especie)) IN ('felino', 'felina', 'gato')
            )`;
        default:
            return '';
    }
}

async function getAudienceRows(tenantId, audienceType) {
    const type = validateAudienceType(audienceType);
    const sql = `
        SELECT DISTINCT c.identidad, c.nombre, c.apellido, c.correo
        FROM clientes c
        WHERE c.tenant_id = $1
          AND c.correo IS NOT NULL
          AND TRIM(c.correo) <> ''
          AND COALESCE(c.sin_correo, FALSE) = FALSE
          ${audienceCondition(type)}
        ORDER BY c.nombre ASC NULLS LAST
        LIMIT 5000
    `;
    const { rows } = await pool.query(sql, [tenantId]);
    const seen = new Set();
    return rows.reduce((recipients, row) => {
        const email = normalizeEmail(row.correo);
        if (!VALID_EMAIL.test(email) || seen.has(email)) return recipients;
        seen.add(email);
        recipients.push({
            clienteId: row.identidad,
            recipientEmail: email,
            recipientName: clean(`${row.nombre || ''} ${row.apellido || ''}`, 180) || row.nombre || email,
        });
        return recipients;
    }, []);
}

async function previewAudience(tenantId, audienceType) {
    const type = validateAudienceType(audienceType);
    const recipients = await getAudienceRows(tenantId, type);
    return {
        audienceType: type,
        total: recipients.length,
        definition: AUDIENCE_DEFINITIONS.find(item => item.value === type) || null,
        sample: recipients.slice(0, 8),
    };
}

function listAudienceDefinitions() {
    return AUDIENCE_DEFINITIONS;
}

module.exports = {
    getAudienceRows,
    listAudienceDefinitions,
    previewAudience,
    validateAudienceType,
};
