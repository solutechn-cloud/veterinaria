'use strict';

const express = require('express');
const router = express.Router();
const { pool, handleDbError, withTenantContext } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

function asInt(value) {
    const n = Number(value);
    return Number.isInteger(n) ? n : null;
}

function cleanText(value, max = 500) {
    if (value == null) return null;
    return String(value).trim().substring(0, max) || null;
}

function appointmentSelect() {
    return `
        SELECT c.*,
               p.nombre AS "pacienteNombre", p.especie, p.raza,
               cli.nombre || ' ' || COALESCE(cli.apellido, '') AS "tutorNombre",
               cli.telefono AS "tutorTelefono", cli.correo AS "tutorCorreo",
               tc.nombre AS "tipoCitaNombre", tc.color AS "tipoCitaColor",
               s.nombre AS "sucursalNombre",
               COALESCE(e.nombre || ' ' || e.apellido, u.usuario, c.id_veterinario) AS "veterinarioNombre"
        FROM citas c
        LEFT JOIN pacientes p ON p.id_paciente = c.id_paciente AND p.tenant_id = c.tenant_id
        LEFT JOIN clientes cli ON cli.identidad = c.id_tutor AND cli.tenant_id = c.tenant_id
        LEFT JOIN tipos_cita tc ON tc.id_tipo_cita = c.id_tipo_cita AND tc.tenant_id = c.tenant_id
        LEFT JOIN sucursales s ON s.id_sucursal = c.id_sucursal AND s.tenant_id = c.tenant_id
        LEFT JOIN usuarios u ON u.codUsuario::text = c.id_veterinario::text AND u.tenant_id = c.tenant_id
        LEFT JOIN empleado e ON e.identidad = u.identidad AND e.tenant_id = c.tenant_id
    `;
}

async function ensureNoAppointmentOverlap(client, req, { idCita = null, idVeterinario, idSucursal, salaRecurso, fechaInicio, fechaFin }) {
    const params = [req.tenantId, fechaInicio, fechaFin];
    let where = `
        tenant_id = $1
        AND estado NOT IN ('Cancelada','No asistio','Completada')
        AND fecha_inicio < $3
        AND fecha_fin > $2
    `;
    if (idCita) {
        params.push(idCita);
        where += ` AND id_cita <> $${params.length}`;
    }
    if (idVeterinario) {
        params.push(String(idVeterinario));
        where += ` AND id_veterinario::text = $${params.length}`;
    } else if (idSucursal && salaRecurso) {
        params.push(idSucursal);
        where += ` AND id_sucursal = $${params.length}`;
        params.push(salaRecurso);
        where += ` AND LOWER(COALESCE(sala_recurso, '')) = LOWER($${params.length})`;
    } else {
        return;
    }
    const r = await client.query(`SELECT id_cita FROM citas WHERE ${where} LIMIT 1`, params);
    if (r.rows.length > 0) {
        const err = new Error('Ya existe una cita en ese horario para el veterinario o recurso seleccionado.');
        err.statusCode = 409;
        throw err;
    }
}

async function createAppointmentReminders(client, req, citaId) {
    const { rows } = await client.query(`
        SELECT c.id_cita, c.fecha_inicio, c.id_tutor, c.id_paciente,
               p.nombre AS paciente, cli.correo, cli.nombre AS tutor
        FROM citas c
        LEFT JOIN pacientes p ON p.id_paciente = c.id_paciente AND p.tenant_id = c.tenant_id
        LEFT JOIN clientes cli ON cli.identidad = c.id_tutor AND cli.tenant_id = c.tenant_id
        WHERE c.id_cita = $1 AND c.tenant_id = $2
    `, [citaId, req.tenantId]);
    const cita = rows[0];
    if (!cita?.correo) return;

    const reminders = [
        { tipo: 'cita_24h', at: `($1::timestamptz - INTERVAL '24 hours')` },
        { tipo: 'cita_2h',  at: `($1::timestamptz - INTERVAL '2 hours')` },
    ];
    for (const r of reminders) {
        await client.query(`
            INSERT INTO recordatorios (
                tenant_id, tipo, referencia_tabla, referencia_id, id_tutor, id_paciente,
                correo_destino, asunto, cuerpo, fecha_programada
            )
            SELECT $2, $3, 'citas', $4, $5, $6, $7, $8, $9, ${r.at}
            WHERE ${r.at} > NOW()
            ON CONFLICT (tenant_id, tipo, referencia_tabla, referencia_id, fecha_programada) DO NOTHING
        `, [
            cita.fecha_inicio, req.tenantId, r.tipo, cita.id_cita, cita.id_tutor, cita.id_paciente,
            cita.correo,
            `Recordatorio de cita veterinaria para ${cita.paciente || 'su mascota'}`,
            `Hola ${cita.tutor || ''}, le recordamos la cita de ${cita.paciente || 'su mascota'} programada para ${new Date(cita.fecha_inicio).toLocaleString('es-HN')}.`,
        ]);
    }
}

function minutesFromTime(value) {
    const [h, m] = String(value || '00:00').split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function dateTimeFromMinutes(dateStr, minutes) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    return `${dateStr}T${h}:${m}:00`;
}

function appointmentOverlapsSlot(cita, slotStart, slotEnd) {
    const start = new Date(cita.fecha_inicio).getTime();
    const end = new Date(cita.fecha_fin).getTime();
    return start < slotEnd.getTime() && end > slotStart.getTime();
}

// Patients
router.get('/pacientes', authenticateToken, async (req, res) => {
    try {
        const { q, id_tutor, estado = 'Activo', especie, sexo, alertas, limit = 60, offset = 0 } = req.query;
        const params = [req.tenantId];
        let where = 'WHERE p.tenant_id = $1';
        if (estado) { params.push(estado); where += ` AND p.estado = $${params.length}`; }
        if (id_tutor) { params.push(id_tutor); where += ` AND p.id_tutor = $${params.length}`; }
        if (especie) { params.push(especie); where += ` AND LOWER(p.especie) = LOWER($${params.length})`; }
        if (sexo) { params.push(sexo); where += ` AND LOWER(COALESCE(p.sexo, '')) = LOWER($${params.length})`; }
        if (alertas === 'true') where += ` AND (COALESCE(p.alergias, '') <> '' OR COALESCE(p.condiciones_cronicas, '') <> '')`;
        if (q) {
            params.push(`%${String(q).replace(/[\\%_]/g, '\\$&')}%`);
            where += ` AND (
                p.nombre ILIKE $${params.length}
                OR p.especie ILIKE $${params.length}
                OR p.raza ILIKE $${params.length}
                OR p.microchip ILIKE $${params.length}
                OR cli.nombre ILIKE $${params.length}
                OR cli.apellido ILIKE $${params.length}
                OR cli.telefono ILIKE $${params.length}
                OR cli.correo ILIKE $${params.length}
            )`;
        }
        const safeLimit = Math.min(Math.max(asInt(limit) || 60, 1), 200);
        const safeOffset = Math.max(asInt(offset) || 0, 0);
        params.push(safeLimit);
        const limitParam = params.length;
        params.push(safeOffset);
        const offsetParam = params.length;
        const { rows } = await pool.query(`
            SELECT p.*,
                   cli.nombre || ' ' || COALESCE(cli.apellido, '') AS "tutorNombre",
                   cli.telefono AS "tutorTelefono", cli.correo AS "tutorCorreo",
                   (SELECT COUNT(*)::int FROM consultas co WHERE co.tenant_id = p.tenant_id AND co.id_paciente = p.id_paciente) AS "totalConsultas",
                   (SELECT MIN(fecha_inicio) FROM citas c WHERE c.tenant_id = p.tenant_id AND c.id_paciente = p.id_paciente AND c.fecha_inicio >= NOW() AND c.estado NOT IN ('Cancelada','No asistio')) AS "proximaCita"
            FROM pacientes p
            LEFT JOIN clientes cli ON cli.identidad = p.id_tutor AND cli.tenant_id = p.tenant_id
            ${where}
            ORDER BY p.nombre
            LIMIT $${limitParam} OFFSET $${offsetParam}
        `, params);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

router.get('/tutores/:id/pacientes', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT p.*,
                   cli.nombre || ' ' || COALESCE(cli.apellido, '') AS "tutorNombre",
                   cli.telefono AS "tutorTelefono", cli.correo AS "tutorCorreo"
            FROM pacientes p
            LEFT JOIN clientes cli ON cli.identidad = p.id_tutor AND cli.tenant_id = p.tenant_id
            WHERE p.tenant_id = $1 AND p.id_tutor = $2 AND p.estado = 'Activo'
            ORDER BY p.nombre
        `, [req.tenantId, req.params.id]);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

router.get('/pacientes/:id', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return res.status(400).json({ error: 'id_paciente invalido' });
        const [patient, weights, appointments, consultations, vaccines] = await Promise.all([
            pool.query(`
                SELECT p.*, cli.nombre || ' ' || COALESCE(cli.apellido, '') AS "tutorNombre",
                       cli.telefono AS "tutorTelefono", cli.correo AS "tutorCorreo", cli.direccion AS "tutorDireccion"
                FROM pacientes p
                LEFT JOIN clientes cli ON cli.identidad = p.id_tutor AND cli.tenant_id = p.tenant_id
                WHERE p.id_paciente = $1 AND p.tenant_id = $2
            `, [id, req.tenantId]),
            pool.query('SELECT * FROM paciente_pesos WHERE id_paciente = $1 AND tenant_id = $2 ORDER BY fecha DESC LIMIT 20', [id, req.tenantId]),
            pool.query(`${appointmentSelect()} WHERE c.id_paciente = $1 AND c.tenant_id = $2 ORDER BY c.fecha_inicio DESC LIMIT 20`, [id, req.tenantId]),
            pool.query('SELECT * FROM consultas WHERE id_paciente = $1 AND tenant_id = $2 ORDER BY fecha DESC LIMIT 20', [id, req.tenantId]),
            pool.query('SELECT * FROM vacunas_aplicadas WHERE id_paciente = $1 AND tenant_id = $2 ORDER BY fecha_aplicacion DESC LIMIT 20', [id, req.tenantId]),
        ]);
        if (!patient.rows.length) return res.status(404).json({ error: 'Paciente no encontrado' });
        res.json({ ...patient.rows[0], pesos: weights.rows, citas: appointments.rows, consultas: consultations.rows, vacunas: vaccines.rows });
    } catch (e) { handleDbError(res, e); }
});

router.post('/pacientes', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        if (!b.id_tutor || !b.nombre || !b.especie) return res.status(400).json({ error: 'id_tutor, nombre y especie son requeridos' });
        const id = await withTenantContext(req.tenantId, async (client) => {
            const tutor = await client.query('SELECT identidad FROM clientes WHERE identidad = $1 AND tenant_id = $2', [b.id_tutor, req.tenantId]);
            if (!tutor.rows.length) throw Object.assign(new Error('Tutor no encontrado'), { statusCode: 404 });
            const result = await client.query(`
                INSERT INTO pacientes (
                    tenant_id, id_tutor, nombre, especie, raza, sexo, color, fecha_nacimiento,
                    fecha_nacimiento_estimada, peso_actual, microchip, estado_reproductivo,
                    alergias, condiciones_cronicas, foto_base64
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
                RETURNING id_paciente
            `, [
                req.tenantId, b.id_tutor, cleanText(b.nombre, 120), cleanText(b.especie, 60),
                cleanText(b.raza, 100), cleanText(b.sexo, 20), cleanText(b.color, 80),
                b.fecha_nacimiento || null, Boolean(b.fecha_nacimiento_estimada),
                b.peso_actual || null, cleanText(b.microchip, 80), cleanText(b.estado_reproductivo, 40),
                cleanText(b.alergias, 2000), cleanText(b.condiciones_cronicas, 2000), b.foto_base64 || null,
            ]);
            if (b.peso_actual) {
                await client.query(`
                    INSERT INTO paciente_pesos (tenant_id, id_paciente, peso, registrado_por, notas)
                    VALUES ($1,$2,$3,$4,'Peso inicial')
                `, [req.tenantId, result.rows[0].id_paciente, b.peso_actual, req.user?.codUsuario || req.user?.usuario || null]);
            }
            return result.rows[0].id_paciente;
        });
        res.status(201).json({ id_paciente: id });
    } catch (e) {
        if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
        handleDbError(res, e);
    }
});

router.put('/pacientes/:id', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return res.status(400).json({ error: 'id_paciente invalido' });
        const b = req.body || {};
        await pool.query(`
            UPDATE pacientes SET
                id_tutor=$1, nombre=$2, especie=$3, raza=$4, sexo=$5, color=$6,
                fecha_nacimiento=$7, fecha_nacimiento_estimada=$8, peso_actual=$9,
                microchip=$10, estado_reproductivo=$11, alergias=$12,
                condiciones_cronicas=$13, foto_base64=COALESCE($14, foto_base64),
                estado=COALESCE($15, estado), updated_at=NOW()
            WHERE id_paciente=$16 AND tenant_id=$17
        `, [
            b.id_tutor, cleanText(b.nombre, 120), cleanText(b.especie, 60), cleanText(b.raza, 100),
            cleanText(b.sexo, 20), cleanText(b.color, 80), b.fecha_nacimiento || null,
            Boolean(b.fecha_nacimiento_estimada), b.peso_actual || null, cleanText(b.microchip, 80),
            cleanText(b.estado_reproductivo, 40), cleanText(b.alergias, 2000),
            cleanText(b.condiciones_cronicas, 2000), b.foto_base64 || null, b.estado || null,
            id, req.tenantId,
        ]);
        res.json({ ok: true });
    } catch (e) { handleDbError(res, e); }
});

router.post('/pacientes/:id/pesos', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        const peso = Number(req.body?.peso);
        if (!id || !peso || peso <= 0) return res.status(400).json({ error: 'peso invalido' });
        await withTenantContext(req.tenantId, async (client) => {
            await client.query('INSERT INTO paciente_pesos (tenant_id,id_paciente,peso,registrado_por,notas) VALUES ($1,$2,$3,$4,$5)', [req.tenantId, id, peso, req.user?.codUsuario || req.user?.usuario || null, req.body?.notas || null]);
            await client.query('UPDATE pacientes SET peso_actual=$1, updated_at=NOW() WHERE id_paciente=$2 AND tenant_id=$3', [peso, id, req.tenantId]);
        });
        res.status(201).json({ ok: true });
    } catch (e) { handleDbError(res, e); }
});

// Appointments
router.get('/tipos-cita', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM tipos_cita WHERE tenant_id=$1 AND activo=TRUE ORDER BY nombre', [req.tenantId]);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

router.post('/tipos-cita', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        const { rows } = await pool.query(`
            INSERT INTO tipos_cita (tenant_id,nombre,duracion_minutos,color,requiere_veterinario)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (tenant_id, nombre) DO UPDATE SET duracion_minutos=EXCLUDED.duracion_minutos, color=EXCLUDED.color, activo=TRUE
            RETURNING *
        `, [req.tenantId, cleanText(b.nombre, 100), Number(b.duracion_minutos || 30), b.color || '#4f46e5', b.requiere_veterinario !== false]);
        res.status(201).json(rows[0]);
    } catch (e) { handleDbError(res, e); }
});

router.get('/agenda/veterinarios', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT u.codUsuario::text AS id_veterinario,
                   COALESCE(NULLIF(TRIM(e.nombre || ' ' || COALESCE(e.apellido, '')), ''), u.usuario) AS nombre,
                   u.usuario,
                   u.id_sucursal,
                   s.nombre AS "sucursalNombre"
            FROM usuarios u
            LEFT JOIN empleado e ON e.identidad = u.identidad AND e.tenant_id = u.tenant_id
            LEFT JOIN sucursales s ON s.id_sucursal = u.id_sucursal AND s.tenant_id = u.tenant_id
            LEFT JOIN roles r ON r.idrol = u.idrol AND r.tenant_id = u.tenant_id
            WHERE u.tenant_id = $1
              AND u.estado = 'Activo'
              AND (
                LOWER(COALESCE(r.nombre, '')) LIKE '%veterinario%'
                OR LOWER(COALESCE(r.nombre, '')) LIKE '%medico%'
                OR LOWER(COALESCE(r.nombre, '')) LIKE '%doctor%'
                OR EXISTS (
                    SELECT 1 FROM citas c
                    WHERE c.tenant_id = u.tenant_id
                      AND c.id_veterinario::text = u.codUsuario::text
                    LIMIT 1
                )
              )
            ORDER BY nombre
        `, [req.tenantId]);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

router.get('/agenda/disponibilidad/slots', authenticateToken, async (req, res) => {
    try {
        const { fecha, id_veterinario, id_sucursal, duracion = 30 } = req.query;
        if (!fecha || !id_veterinario) return res.status(400).json({ error: 'fecha e id_veterinario son requeridos' });
        const duration = Math.min(Math.max(asInt(duracion) || 30, 10), 240);
        const day = new Date(`${fecha}T12:00:00`).getDay();
        const params = [req.tenantId, String(id_veterinario), day];
        let sucursalFilter = '';
        if (id_sucursal) {
            params.push(asInt(id_sucursal));
            sucursalFilter = ` AND (id_sucursal IS NULL OR id_sucursal = $${params.length})`;
        }
        const [availability, appointments] = await Promise.all([
            pool.query(`
                SELECT *
                FROM agenda_disponibilidad
                WHERE tenant_id = $1
                  AND id_veterinario::text = $2
                  AND dia_semana = $3
                  AND activo = TRUE
                  ${sucursalFilter}
                ORDER BY hora_inicio
            `, params),
            pool.query(`
                SELECT id_cita, fecha_inicio, fecha_fin, estado
                FROM citas
                WHERE tenant_id = $1
                  AND id_veterinario::text = $2
                  AND fecha_inicio >= $3::date
                  AND fecha_inicio < ($3::date + INTERVAL '1 day')
                  AND estado NOT IN ('Cancelada','No asistio')
            `, [req.tenantId, String(id_veterinario), fecha]),
        ]);
        const rows = availability.rows.length > 0
            ? availability.rows
            : [{ hora_inicio: '08:00:00', hora_fin: '17:00:00', intervalo_minutos: duration, tipo: 'Disponible' }];
        const blocked = rows.filter(r => r.tipo === 'Bloqueado');
        const slots = [];
        for (const block of rows.filter(r => r.tipo === 'Disponible')) {
            const interval = Math.max(asInt(block.intervalo_minutos) || duration, 10);
            const startMin = minutesFromTime(block.hora_inicio);
            const endMin = minutesFromTime(block.hora_fin);
            for (let cursor = startMin; cursor + duration <= endMin; cursor += interval) {
                const inicio = dateTimeFromMinutes(fecha, cursor);
                const fin = dateTimeFromMinutes(fecha, cursor + duration);
                const slotStart = new Date(inicio);
                const slotEnd = new Date(fin);
                const blockConflict = blocked.some(b => {
                    const bStart = minutesFromTime(b.hora_inicio);
                    const bEnd = minutesFromTime(b.hora_fin);
                    return cursor < bEnd && cursor + duration > bStart;
                });
                const citaConflict = appointments.rows.some(c => appointmentOverlapsSlot(c, slotStart, slotEnd));
                slots.push({
                    inicio,
                    fin,
                    disponible: !blockConflict && !citaConflict,
                    motivo: blockConflict ? 'Bloqueado' : citaConflict ? 'Ocupado' : undefined,
                });
            }
        }
        res.json({ modo: availability.rows.length > 0 ? 'configurado' : 'predeterminado', slots });
    } catch (e) { handleDbError(res, e); }
});

router.get('/agenda/disponibilidad', authenticateToken, async (req, res) => {
    try {
        const { id_veterinario, id_sucursal, dia_semana, activo = 'true' } = req.query;
        const params = [req.tenantId];
        let where = 'WHERE ad.tenant_id = $1';
        if (id_veterinario) { params.push(String(id_veterinario)); where += ` AND ad.id_veterinario::text = $${params.length}`; }
        if (id_sucursal) { params.push(asInt(id_sucursal)); where += ` AND ad.id_sucursal = $${params.length}`; }
        if (dia_semana !== undefined && dia_semana !== '') { params.push(asInt(dia_semana)); where += ` AND ad.dia_semana = $${params.length}`; }
        if (activo !== 'all') { params.push(activo !== 'false'); where += ` AND ad.activo = $${params.length}`; }
        const { rows } = await pool.query(`
            SELECT ad.*,
                   COALESCE(NULLIF(TRIM(e.nombre || ' ' || COALESCE(e.apellido, '')), ''), u.usuario, ad.id_veterinario) AS "veterinarioNombre",
                   s.nombre AS "sucursalNombre"
            FROM agenda_disponibilidad ad
            LEFT JOIN usuarios u ON u.codUsuario::text = ad.id_veterinario::text AND u.tenant_id = ad.tenant_id
            LEFT JOIN empleado e ON e.identidad = u.identidad AND e.tenant_id = ad.tenant_id
            LEFT JOIN sucursales s ON s.id_sucursal = ad.id_sucursal AND s.tenant_id = ad.tenant_id
            ${where}
            ORDER BY ad.dia_semana, ad.hora_inicio
        `, params);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

router.post('/agenda/disponibilidad', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        if (!b.id_veterinario || b.dia_semana === undefined || !b.hora_inicio || !b.hora_fin) {
            return res.status(400).json({ error: 'Veterinario, dia, hora_inicio y hora_fin son requeridos' });
        }
        const { rows } = await pool.query(`
            INSERT INTO agenda_disponibilidad (
                tenant_id, id_veterinario, id_sucursal, dia_semana, hora_inicio,
                hora_fin, intervalo_minutos, tipo, notas
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (tenant_id, id_veterinario, dia_semana, hora_inicio, hora_fin, tipo)
            DO UPDATE SET
                id_sucursal = EXCLUDED.id_sucursal,
                intervalo_minutos = EXCLUDED.intervalo_minutos,
                notas = EXCLUDED.notas,
                activo = TRUE,
                updated_at = NOW()
            RETURNING *
        `, [
            req.tenantId, String(b.id_veterinario), b.id_sucursal || req.user?.id_sucursal || null,
            asInt(b.dia_semana), b.hora_inicio, b.hora_fin, asInt(b.intervalo_minutos) || 30,
            b.tipo === 'Bloqueado' ? 'Bloqueado' : 'Disponible', cleanText(b.notas, 500),
        ]);
        res.status(201).json(rows[0]);
    } catch (e) { handleDbError(res, e); }
});

router.put('/agenda/disponibilidad/:id', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        const b = req.body || {};
        if (!id) return res.status(400).json({ error: 'id_disponibilidad invalido' });
        await pool.query(`
            UPDATE agenda_disponibilidad SET
                id_veterinario=$1, id_sucursal=$2, dia_semana=$3, hora_inicio=$4, hora_fin=$5,
                intervalo_minutos=$6, tipo=$7, notas=$8, activo=$9, updated_at=NOW()
            WHERE id_disponibilidad=$10 AND tenant_id=$11
        `, [
            String(b.id_veterinario), b.id_sucursal || null, asInt(b.dia_semana), b.hora_inicio, b.hora_fin,
            asInt(b.intervalo_minutos) || 30, b.tipo === 'Bloqueado' ? 'Bloqueado' : 'Disponible',
            cleanText(b.notas, 500), b.activo !== false, id, req.tenantId,
        ]);
        res.json({ ok: true });
    } catch (e) { handleDbError(res, e); }
});

router.delete('/agenda/disponibilidad/:id', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        await pool.query('UPDATE agenda_disponibilidad SET activo=FALSE, updated_at=NOW() WHERE id_disponibilidad=$1 AND tenant_id=$2', [id, req.tenantId]);
        res.json({ ok: true });
    } catch (e) { handleDbError(res, e); }
});

router.get('/citas', authenticateToken, async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta, estado, id_paciente, id_veterinario, id_sucursal } = req.query;
        const params = [req.tenantId];
        let where = 'WHERE c.tenant_id = $1';
        if (fecha_desde) { params.push(fecha_desde); where += ` AND c.fecha_inicio >= $${params.length}`; }
        if (fecha_hasta) { params.push(fecha_hasta); where += ` AND c.fecha_inicio < ($${params.length}::date + INTERVAL '1 day')`; }
        if (estado) { params.push(estado); where += ` AND c.estado = $${params.length}`; }
        if (id_paciente) { params.push(id_paciente); where += ` AND c.id_paciente = $${params.length}`; }
        if (id_veterinario) { params.push(id_veterinario); where += ` AND c.id_veterinario::text = $${params.length}`; }
        if (id_sucursal) { params.push(id_sucursal); where += ` AND c.id_sucursal = $${params.length}`; }
        const { rows } = await pool.query(`${appointmentSelect()} ${where} ORDER BY c.fecha_inicio ASC LIMIT 500`, params);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

router.post('/citas', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        if (!b.fecha_inicio || !b.fecha_fin) return res.status(400).json({ error: 'fecha_inicio y fecha_fin son requeridas' });
        const id = await withTenantContext(req.tenantId, async (client) => {
            await ensureNoAppointmentOverlap(client, req, {
                idVeterinario: b.id_veterinario,
                idSucursal: b.id_sucursal || req.user?.id_sucursal || null,
                salaRecurso: b.sala_recurso || null,
                fechaInicio: b.fecha_inicio,
                fechaFin: b.fecha_fin,
            });
            const patient = b.id_paciente ? await client.query('SELECT id_tutor FROM pacientes WHERE id_paciente=$1 AND tenant_id=$2', [b.id_paciente, req.tenantId]) : { rows: [] };
            const idTutor = b.id_tutor || patient.rows[0]?.id_tutor || null;
            const result = await client.query(`
                INSERT INTO citas (tenant_id,id_paciente,id_tutor,id_tipo_cita,fecha_inicio,fecha_fin,id_veterinario,id_sucursal,sala_recurso,estado,motivo,notas,creado_por)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'Programada'),$11,$12,$13)
                RETURNING id_cita
            `, [
                req.tenantId, b.id_paciente || null, idTutor, b.id_tipo_cita || null,
                b.fecha_inicio, b.fecha_fin, b.id_veterinario || null,
                b.id_sucursal || req.user?.id_sucursal || null, cleanText(b.sala_recurso, 80),
                b.estado || 'Programada', cleanText(b.motivo, 2000), cleanText(b.notas, 2000),
                req.user?.codUsuario || req.user?.usuario || null,
            ]);
            await createAppointmentReminders(client, req, result.rows[0].id_cita);
            return result.rows[0].id_cita;
        });
        res.status(201).json({ id_cita: id });
    } catch (e) {
        if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
        handleDbError(res, e);
    }
});

router.put('/citas/:id', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        if (!id) return res.status(400).json({ error: 'id_cita invalido' });
        const b = req.body || {};
        await withTenantContext(req.tenantId, async (client) => {
            if (b.fecha_inicio && b.fecha_fin) {
                await ensureNoAppointmentOverlap(client, req, {
                    idCita: id,
                    idVeterinario: b.id_veterinario,
                    idSucursal: b.id_sucursal || req.user?.id_sucursal || null,
                    salaRecurso: b.sala_recurso || null,
                    fechaInicio: b.fecha_inicio,
                    fechaFin: b.fecha_fin,
                });
            }
            await client.query(`
                UPDATE citas SET
                    id_paciente=$1, id_tutor=$2, id_tipo_cita=$3, fecha_inicio=$4, fecha_fin=$5,
                    id_veterinario=$6, id_sucursal=$7, sala_recurso=$8, estado=$9,
                    motivo=$10, notas=$11, updated_at=NOW()
                WHERE id_cita=$12 AND tenant_id=$13
            `, [
                b.id_paciente || null, b.id_tutor || null, b.id_tipo_cita || null, b.fecha_inicio, b.fecha_fin,
                b.id_veterinario || null, b.id_sucursal || req.user?.id_sucursal || null,
                cleanText(b.sala_recurso, 80), b.estado || 'Programada', cleanText(b.motivo, 2000),
                cleanText(b.notas, 2000), id, req.tenantId,
            ]);
            await createAppointmentReminders(client, req, id);
        });
        res.json({ ok: true });
    } catch (e) {
        if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
        handleDbError(res, e);
    }
});

router.patch('/citas/:id/estado', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        const estado = req.body?.estado;
        await pool.query('UPDATE citas SET estado=$1, updated_at=NOW() WHERE id_cita=$2 AND tenant_id=$3', [estado, id, req.tenantId]);
        res.json({ ok: true });
    } catch (e) { handleDbError(res, e); }
});

router.post('/citas/:id/check-in', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        await pool.query("UPDATE citas SET estado='En espera', updated_at=NOW() WHERE id_cita=$1 AND tenant_id=$2", [id, req.tenantId]);
        res.json({ ok: true });
    } catch (e) { handleDbError(res, e); }
});

// Consultations
router.get('/consultas', authenticateToken, async (req, res) => {
    try {
        const { id_paciente, estado, q, desde, hasta, limit = 60, offset = 0 } = req.query;
        const params = [req.tenantId];
        let where = 'WHERE co.tenant_id = $1';
        if (id_paciente) { params.push(id_paciente); where += ` AND co.id_paciente = $${params.length}`; }
        if (estado) { params.push(estado); where += ` AND co.estado = $${params.length}`; }
        if (desde) { params.push(desde); where += ` AND co.fecha >= $${params.length}`; }
        if (hasta) { params.push(hasta); where += ` AND co.fecha < ($${params.length}::date + INTERVAL '1 day')`; }
        if (q) {
            params.push(`%${String(q).replace(/[\\%_]/g, '\\$&')}%`);
            where += ` AND (
                co.motivo ILIKE $${params.length}
                OR co.subjetivo ILIKE $${params.length}
                OR co.objetivo ILIKE $${params.length}
                OR co.evaluacion ILIKE $${params.length}
                OR co.plan ILIKE $${params.length}
                OR p.nombre ILIKE $${params.length}
                OR cli.nombre ILIKE $${params.length}
                OR cli.apellido ILIKE $${params.length}
            )`;
        }
        const safeLimit = Math.min(Math.max(asInt(limit) || 60, 1), 200);
        const safeOffset = Math.max(asInt(offset) || 0, 0);
        params.push(safeLimit);
        const limitParam = params.length;
        params.push(safeOffset);
        const offsetParam = params.length;
        const { rows } = await pool.query(`
            SELECT co.*, p.nombre AS "pacienteNombre", p.especie,
                   cli.nombre || ' ' || COALESCE(cli.apellido,'') AS "tutorNombre"
            FROM consultas co
            JOIN pacientes p ON p.id_paciente = co.id_paciente AND p.tenant_id = co.tenant_id
            LEFT JOIN clientes cli ON cli.identidad = co.id_tutor AND cli.tenant_id = co.tenant_id
            ${where}
            ORDER BY co.fecha DESC
            LIMIT $${limitParam} OFFSET $${offsetParam}
        `, params);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

router.get('/consultas/:id', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        const [consulta, diagnosticos, tratamientos] = await Promise.all([
            pool.query('SELECT * FROM consultas WHERE id_consulta=$1 AND tenant_id=$2', [id, req.tenantId]),
            pool.query('SELECT * FROM consulta_diagnosticos WHERE id_consulta=$1 AND tenant_id=$2 ORDER BY id', [id, req.tenantId]),
            pool.query('SELECT * FROM consulta_tratamientos WHERE id_consulta=$1 AND tenant_id=$2 ORDER BY id', [id, req.tenantId]),
        ]);
        if (!consulta.rows.length) return res.status(404).json({ error: 'Consulta no encontrada' });
        res.json({ ...consulta.rows[0], diagnosticos: diagnosticos.rows, tratamientos: tratamientos.rows });
    } catch (e) { handleDbError(res, e); }
});

router.post('/consultas', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        if (!b.id_paciente) return res.status(400).json({ error: 'id_paciente es requerido' });
        const id = await withTenantContext(req.tenantId, async (client) => {
            const patient = await client.query('SELECT id_tutor FROM pacientes WHERE id_paciente=$1 AND tenant_id=$2', [b.id_paciente, req.tenantId]);
            if (!patient.rows.length) throw Object.assign(new Error('Paciente no encontrado'), { statusCode: 404 });
            const r = await client.query(`
                INSERT INTO consultas (
                    tenant_id,id_paciente,id_tutor,id_cita,id_veterinario,motivo,subjetivo,objetivo,evaluacion,plan,
                    peso,temperatura,frecuencia_cardiaca,frecuencia_respiratoria,condicion_corporal,notas_alta,estado
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,COALESCE($17,'Abierta'))
                RETURNING id_consulta
            `, [
                req.tenantId, b.id_paciente, b.id_tutor || patient.rows[0].id_tutor, b.id_cita || null,
                b.id_veterinario || req.user?.codUsuario || null, cleanText(b.motivo, 2000),
                cleanText(b.subjetivo, 6000), cleanText(b.objetivo, 6000), cleanText(b.evaluacion, 6000),
                cleanText(b.plan, 6000), b.peso || null, b.temperatura || null,
                b.frecuencia_cardiaca || null, b.frecuencia_respiratoria || null,
                cleanText(b.condicion_corporal, 20), cleanText(b.notas_alta, 4000), b.estado || 'Abierta',
            ]);
            if (b.peso) {
                await client.query('INSERT INTO paciente_pesos (tenant_id,id_paciente,peso,registrado_por,notas) VALUES ($1,$2,$3,$4,$5)', [req.tenantId, b.id_paciente, b.peso, req.user?.codUsuario || req.user?.usuario || null, `Consulta ${r.rows[0].id_consulta}`]);
                await client.query('UPDATE pacientes SET peso_actual=$1, updated_at=NOW() WHERE id_paciente=$2 AND tenant_id=$3', [b.peso, b.id_paciente, req.tenantId]);
            }
            if (b.id_cita) await client.query("UPDATE citas SET estado='En consulta', updated_at=NOW() WHERE id_cita=$1 AND tenant_id=$2", [b.id_cita, req.tenantId]);
            for (const d of Array.isArray(b.diagnosticos) ? b.diagnosticos : []) {
                if (d.diagnostico) await client.query('INSERT INTO consulta_diagnosticos (tenant_id,id_consulta,diagnostico,codigo,notas) VALUES ($1,$2,$3,$4,$5)', [req.tenantId, r.rows[0].id_consulta, d.diagnostico, d.codigo || null, d.notas || null]);
            }
            for (const t of Array.isArray(b.tratamientos) ? b.tratamientos : []) {
                if (t.descripcion) await client.query('INSERT INTO consulta_tratamientos (tenant_id,id_consulta,descripcion,id_medicamento,dosis,frecuencia,duracion,instrucciones) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [req.tenantId, r.rows[0].id_consulta, t.descripcion, t.id_medicamento || null, t.dosis || null, t.frecuencia || null, t.duracion || null, t.instrucciones || null]);
            }
            return r.rows[0].id_consulta;
        });
        res.status(201).json({ id_consulta: id });
    } catch (e) {
        if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
        handleDbError(res, e);
    }
});

router.put('/consultas/:id', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        const b = req.body || {};
        await withTenantContext(req.tenantId, async (client) => {
            await client.query(`
                UPDATE consultas SET
                    motivo=$1, subjetivo=$2, objetivo=$3, evaluacion=$4, plan=$5, peso=$6,
                    temperatura=$7, frecuencia_cardiaca=$8, frecuencia_respiratoria=$9,
                    condicion_corporal=$10, notas_alta=$11, estado=$12, updated_at=NOW()
                WHERE id_consulta=$13 AND tenant_id=$14
            `, [b.motivo || null, b.subjetivo || null, b.objetivo || null, b.evaluacion || null, b.plan || null, b.peso || null, b.temperatura || null, b.frecuencia_cardiaca || null, b.frecuencia_respiratoria || null, b.condicion_corporal || null, b.notas_alta || null, b.estado || 'Abierta', id, req.tenantId]);
            await client.query('DELETE FROM consulta_diagnosticos WHERE id_consulta=$1 AND tenant_id=$2', [id, req.tenantId]);
            await client.query('DELETE FROM consulta_tratamientos WHERE id_consulta=$1 AND tenant_id=$2', [id, req.tenantId]);
            for (const d of Array.isArray(b.diagnosticos) ? b.diagnosticos : []) {
                if (d.diagnostico) await client.query('INSERT INTO consulta_diagnosticos (tenant_id,id_consulta,diagnostico,codigo,notas) VALUES ($1,$2,$3,$4,$5)', [req.tenantId, id, d.diagnostico, d.codigo || null, d.notas || null]);
            }
            for (const t of Array.isArray(b.tratamientos) ? b.tratamientos : []) {
                if (t.descripcion) await client.query('INSERT INTO consulta_tratamientos (tenant_id,id_consulta,descripcion,id_medicamento,dosis,frecuencia,duracion,instrucciones) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [req.tenantId, id, t.descripcion, t.id_medicamento || null, t.dosis || null, t.frecuencia || null, t.duracion || null, t.instrucciones || null]);
            }
        });
        res.json({ ok: true });
    } catch (e) { handleDbError(res, e); }
});

// Vaccines
router.get('/vacunas/protocolos', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM vacunas_protocolos WHERE tenant_id=$1 AND activo=TRUE ORDER BY especie,nombre', [req.tenantId]);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

router.post('/vacunas/protocolos', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        const { rows } = await pool.query(`
            INSERT INTO vacunas_protocolos (tenant_id,nombre,especie,edad_inicial_dias,intervalo_dias,dosis_totales,id_medicamento)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (tenant_id,nombre,especie) DO UPDATE SET intervalo_dias=EXCLUDED.intervalo_dias, dosis_totales=EXCLUDED.dosis_totales, id_medicamento=EXCLUDED.id_medicamento, activo=TRUE
            RETURNING *
        `, [req.tenantId, b.nombre, b.especie, b.edad_inicial_dias || 0, b.intervalo_dias || null, b.dosis_totales || 1, b.id_medicamento || null]);
        res.status(201).json(rows[0]);
    } catch (e) { handleDbError(res, e); }
});

router.get('/vacunas/aplicadas', authenticateToken, async (req, res) => {
    try {
        const { id_paciente, desde, hasta } = req.query;
        const params = [req.tenantId];
        let where = 'WHERE va.tenant_id=$1';
        if (id_paciente) { params.push(id_paciente); where += ` AND va.id_paciente=$${params.length}`; }
        if (desde) { params.push(desde); where += ` AND va.fecha_aplicacion >= $${params.length}`; }
        if (hasta) { params.push(hasta); where += ` AND va.fecha_aplicacion <= $${params.length}`; }
        const { rows } = await pool.query(`
            SELECT va.*, p.nombre AS "pacienteNombre", p.especie,
                   cli.nombre || ' ' || COALESCE(cli.apellido,'') AS "tutorNombre"
            FROM vacunas_aplicadas va
            JOIN pacientes p ON p.id_paciente=va.id_paciente AND p.tenant_id=va.tenant_id
            LEFT JOIN clientes cli ON cli.identidad=p.id_tutor AND cli.tenant_id=p.tenant_id
            ${where}
            ORDER BY va.fecha_aplicacion DESC
            LIMIT 300
        `, params);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

router.post('/vacunas/aplicar', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        if (!b.id_paciente || !b.nombre_vacuna) return res.status(400).json({ error: 'id_paciente y nombre_vacuna son requeridos' });
        const id = await withTenantContext(req.tenantId, async (client) => {
            let loteId = b.id_lote || null;
            if (b.id_medicamento && !loteId) {
                const lote = await client.query(`
                    SELECT id_lote FROM lotes_medicamento
                    WHERE tenant_id=$1 AND id_medicamento=$2 AND estado='Activo' AND cantidad_actual > 0
                    ORDER BY fecha_vencimiento ASC LIMIT 1
                `, [req.tenantId, b.id_medicamento]);
                loteId = lote.rows[0]?.id_lote || null;
            }
            if (b.id_medicamento && loteId) {
                const upd = await client.query(`
                    UPDATE lotes_medicamento
                    SET cantidad_actual = cantidad_actual - 1
                    WHERE tenant_id=$1 AND id_lote=$2 AND cantidad_actual >= 1
                    RETURNING id_lote
                `, [req.tenantId, loteId]);
                if (!upd.rows.length) throw Object.assign(new Error('Stock insuficiente para aplicar vacuna'), { statusCode: 400 });
                await client.query(`
                    INSERT INTO kardex_inventario (tipo_producto,cod_medicamento,id_lote,tipo_movimiento,cantidad,referencia_doc,registrado_por,observaciones,tenant_id)
                    VALUES ('MEDICAMENTO',$1,$2,'Vacunacion',1,$3,$4,$5,$6)
                `, [b.id_medicamento, loteId, `VAC-${b.id_paciente}`, req.user?.codUsuario || req.user?.usuario || null, b.nombre_vacuna, req.tenantId]);
            }
            const r = await client.query(`
                INSERT INTO vacunas_aplicadas (tenant_id,id_paciente,id_protocolo,id_medicamento,id_lote,nombre_vacuna,fecha_aplicacion,proxima_dosis,veterinario,notas)
                VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,CURRENT_DATE),$8,$9,$10)
                RETURNING id_vacuna_aplicada
            `, [req.tenantId, b.id_paciente, b.id_protocolo || null, b.id_medicamento || null, loteId, b.nombre_vacuna, b.fecha_aplicacion || null, b.proxima_dosis || null, b.veterinario || req.user?.codUsuario || null, b.notas || null]);
            if (b.proxima_dosis) {
                const patient = await client.query(`
                    SELECT p.id_tutor, cli.correo, cli.nombre AS tutor, p.nombre AS paciente
                    FROM pacientes p LEFT JOIN clientes cli ON cli.identidad=p.id_tutor AND cli.tenant_id=p.tenant_id
                    WHERE p.id_paciente=$1 AND p.tenant_id=$2
                `, [b.id_paciente, req.tenantId]);
                const info = patient.rows[0];
                if (info?.correo) {
                    await client.query(`
                        INSERT INTO recordatorios (tenant_id,tipo,referencia_tabla,referencia_id,id_tutor,id_paciente,correo_destino,asunto,cuerpo,fecha_programada)
                        VALUES ($1,'vacuna_proxima','vacunas_aplicadas',$2,$3,$4,$5,$6,$7,($8::date - INTERVAL '7 days'))
                        ON CONFLICT (tenant_id,tipo,referencia_tabla,referencia_id,fecha_programada) DO NOTHING
                    `, [req.tenantId, r.rows[0].id_vacuna_aplicada, info.id_tutor, b.id_paciente, info.correo, `Proxima vacuna de ${info.paciente}`, `Hola ${info.tutor || ''}, ${info.paciente} tiene una proxima dosis de ${b.nombre_vacuna} programada para ${b.proxima_dosis}.`, b.proxima_dosis]);
                }
            }
            return r.rows[0].id_vacuna_aplicada;
        });
        res.status(201).json({ id_vacuna_aplicada: id });
    } catch (e) {
        if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
        handleDbError(res, e);
    }
});

// Services
router.get('/servicios-veterinarios', authenticateToken, async (req, res) => {
    try {
        const { q, categoria, activo = 'true' } = req.query;
        const params = [req.tenantId];
        let where = 'WHERE tenant_id=$1';
        if (activo !== 'all') { params.push(activo === 'true'); where += ` AND activo=$${params.length}`; }
        if (categoria) { params.push(categoria); where += ` AND categoria=$${params.length}`; }
        if (q) { params.push(`%${String(q).replace(/[\\%_]/g, '\\$&')}%`); where += ` AND (nombre ILIKE $${params.length} OR categoria ILIKE $${params.length})`; }
        const { rows } = await pool.query(`SELECT * FROM servicios_veterinarios ${where} ORDER BY categoria,nombre`, params);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

router.post('/servicios-veterinarios', authenticateToken, async (req, res) => {
    try {
        const b = req.body || {};
        if (!b.nombre) return res.status(400).json({ error: 'nombre es requerido' });
        const { rows } = await pool.query(`
            INSERT INTO servicios_veterinarios (tenant_id,codigo,nombre,categoria,descripcion,duracion_minutos,precio,tipo_isv,requiere_paciente)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *
        `, [req.tenantId, b.codigo || null, b.nombre, b.categoria || 'Consulta', b.descripcion || null, b.duracion_minutos || 30, b.precio || 0, b.tipo_isv || 'exento', b.requiere_paciente !== false]);
        res.status(201).json(rows[0]);
    } catch (e) { handleDbError(res, e); }
});

router.put('/servicios-veterinarios/:id', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        const b = req.body || {};
        await pool.query(`
            UPDATE servicios_veterinarios SET codigo=$1,nombre=$2,categoria=$3,descripcion=$4,duracion_minutos=$5,precio=$6,tipo_isv=$7,requiere_paciente=$8,activo=$9
            WHERE id_servicio=$10 AND tenant_id=$11
        `, [b.codigo || null, b.nombre, b.categoria || 'Consulta', b.descripcion || null, b.duracion_minutos || 30, b.precio || 0, b.tipo_isv || 'exento', b.requiere_paciente !== false, b.activo !== false, id, req.tenantId]);
        res.json({ ok: true });
    } catch (e) { handleDbError(res, e); }
});

// Reminders
router.get('/recordatorios', authenticateToken, async (req, res) => {
    try {
        const { estado, tipo, id_paciente } = req.query;
        const params = [req.tenantId];
        let where = 'WHERE r.tenant_id=$1';
        if (estado) { params.push(estado); where += ` AND r.estado=$${params.length}`; }
        if (tipo) { params.push(tipo); where += ` AND r.tipo=$${params.length}`; }
        if (id_paciente) { params.push(id_paciente); where += ` AND r.id_paciente=$${params.length}`; }
        const { rows } = await pool.query(`
            SELECT r.*, p.nombre AS "pacienteNombre", cli.nombre || ' ' || COALESCE(cli.apellido,'') AS "tutorNombre"
            FROM recordatorios r
            LEFT JOIN pacientes p ON p.id_paciente=r.id_paciente AND p.tenant_id=r.tenant_id
            LEFT JOIN clientes cli ON cli.identidad=r.id_tutor AND cli.tenant_id=r.tenant_id
            ${where}
            ORDER BY r.fecha_programada DESC
            LIMIT 300
        `, params);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

router.post('/recordatorios/:id/enviar', authenticateToken, async (req, res) => {
    try {
        const id = asInt(req.params.id);
        const { rows } = await pool.query('SELECT * FROM recordatorios WHERE id_recordatorio=$1 AND tenant_id=$2', [id, req.tenantId]);
        if (!rows.length) return res.status(404).json({ error: 'Recordatorio no encontrado' });
        await emailService.sendVeterinaryReminderEmail(rows[0].correo_destino, rows[0]).catch(err => { throw err; });
        await pool.query("UPDATE recordatorios SET estado='Enviado', fecha_envio=NOW(), intentos=intentos+1, ultimo_error=NULL WHERE id_recordatorio=$1 AND tenant_id=$2", [id, req.tenantId]);
        res.json({ ok: true });
    } catch (e) { handleDbError(res, e); }
});

// Flowboard
router.get('/clinica/flowboard', authenticateToken, async (req, res) => {
    try {
        const date = req.query.fecha || new Date().toISOString().slice(0, 10);
        const { rows } = await pool.query(`
            ${appointmentSelect()}
            WHERE c.tenant_id=$1
              AND c.fecha_inicio >= $2::date
              AND c.fecha_inicio < ($2::date + INTERVAL '1 day')
              AND c.estado IN ('Confirmada','En espera','En consulta','Completada')
            ORDER BY c.fecha_inicio ASC
        `, [req.tenantId, date]);
        res.json(rows);
    } catch (e) { handleDbError(res, e); }
});

module.exports = router;
