
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const BCRYPT_ROUNDS = 12;
const { pool, generateNextId, handleDbError, updateArqueoBalance, withTenantContext, tenantQuery } = require('../config/db');
const { authenticateToken, requireAdmin, validatePasswordStrength } = require('../middleware/auth');
const { getPermissionGuardStats } = require('../middleware/permissions');
const { getSystemConfig, invalidateSystemConfigCache } = require('../config/systemConfig');
const automationService = require('../services/automationService');

// --- ENDPOINT PARA ESQUEMA DE DATOS (REQUERIDO POR IMPRESIÓN/DISEÑO) ---
const SCHEMA_TABLES = ['ventas', 'detalleventa', 'clientes', 'pacientes', 'medicamentos', 'lotes_medicamento', 'presentaciones_venta', 'configuracion', 'empleado', 'usuarios'];

const ADMIN_ROLE_NAMES = new Set(['administrador', 'admin', 'superadmin', 'super admin']);
const CASH_PERMISSIONS = new Set(['VER_POS', 'VER_CAJA', 'perm_ventas_crear', 'perm_caja_abrir', 'perm_caja_cerrar']);
const DESIGNER_PERMISSION = 'DISEÑAR_ETIQUETAS';

function requireSchemaDesignerAccess(req, res, next) {
    const role = String(req.user?.rol || '').toLowerCase();
    const permisos = Array.isArray(req.user?.permisos) ? req.user.permisos : [];
    if (ADMIN_ROLE_NAMES.has(role) || permisos.includes(DESIGNER_PERMISSION)) return next();
    return res.status(403).json({
        error: 'Acceso denegado: se requiere permiso para diseñar etiquetas',
        requiredPermission: DESIGNER_PERMISSION,
    });
}

function normalizeOptional(value) {
    return value === undefined || value === null || value === '' || value === 'Sin Caja' ? null : value;
}

function formatDateInput(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
        if (isoMatch) return isoMatch[0];
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

async function getRoleProfile(client, tenantId, idrol) {
    const roleRes = await client.query(
        'SELECT idrol, nombre FROM roles WHERE idrol = $1 AND tenant_id = $2',
        [idrol, tenantId]
    );
    const role = roleRes.rows[0];
    if (!role) return null;

    const permRes = await client.query(
        'SELECT idPermiso FROM rol_permisos WHERE idRol = $1 AND idRol IN (SELECT idrol FROM roles WHERE tenant_id = $2)',
        [idrol, tenantId]
    );
    const permisos = permRes.rows.map(r => r.idpermiso);
    const roleName = String(role.nombre || '').toLowerCase();
    const isAdmin = ADMIN_ROLE_NAMES.has(roleName);
    const requiresCaja = !isAdmin && permisos.some(p => CASH_PERMISSIONS.has(p));
    return { ...role, permisos, isAdmin, requiresCaja };
}

async function validateUserAssignment(client, tenantId, { idrol, idCaja, id_sucursal, codUsuario = null }) {
    const role = await getRoleProfile(client, tenantId, idrol);
    if (!role) return { error: 'Rol no encontrado para esta clinica' };

    const cajaId = normalizeOptional(idCaja);
    const sucursalId = normalizeOptional(id_sucursal);

    if (role.requiresCaja && !cajaId) {
        return { error: 'Este rol requiere una caja asignada' };
    }

    if (sucursalId) {
        const sucRes = await client.query(
            'SELECT id_sucursal FROM sucursales WHERE id_sucursal = $1 AND tenant_id = $2',
            [sucursalId, tenantId]
        );
        if (!sucRes.rows.length) return { error: 'La sucursal seleccionada no existe para esta clinica' };
    }

    if (cajaId) {
        const cajaRes = await client.query(
            'SELECT idCaja, id_sucursal FROM caja WHERE idCaja = $1 AND tenant_id = $2 AND estado = $3',
            [cajaId, tenantId, 'Activo']
        );
        const caja = cajaRes.rows[0];
        if (!caja) return { error: 'La caja seleccionada no existe o esta inactiva' };
        if (sucursalId && Number(caja.id_sucursal) !== Number(sucursalId)) {
            return { error: 'La caja seleccionada no pertenece a la sucursal elegida' };
        }

        const assignedRes = await client.query(
            `SELECT codUsuario, usuario FROM usuarios
             WHERE idCaja = $1 AND tenant_id = $2 AND estado = 'Activo'
               AND ($3::int IS NULL OR codUsuario <> $3::int)
             LIMIT 1`,
            [cajaId, tenantId, codUsuario]
        );
        if (assignedRes.rows.length) {
            return { error: `La caja ya esta asignada al usuario ${assignedRes.rows[0].usuario}` };
        }
    }

    return { role, idCaja: cajaId, id_sucursal: sucursalId };
}

router.get('/schema', authenticateToken, requireSchemaDesignerAccess, async (req, res) => {
    try {
        const colQuery = `
            SELECT
                table_name as "table",
                column_name as "column",
                data_type as "type"
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
            ORDER BY table_name, ordinal_position
        `;
        // Query FK relationships from information_schema
        const fkQuery = `
            SELECT
                tc.table_name AS "fromTable",
                kcu.column_name AS "fromColumn",
                ccu.table_name AS "toTable",
                ccu.column_name AS "toColumn"
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
            AND tc.table_name = ANY($1::text[])
        `;
        const [colResult, fkResult] = await Promise.all([
            pool.query(colQuery, [SCHEMA_TABLES]),
            pool.query(fkQuery, [SCHEMA_TABLES]),
        ]);

        const schema = colResult.rows.reduce((acc, curr) => {
            if (!acc[curr.table]) acc[curr.table] = { columns: [], relations: [] };
            acc[curr.table].columns.push({ name: curr.column, type: curr.type });
            return acc;
        }, {});

        // Add FK relationships
        for (const fk of fkResult.rows) {
            if (!schema[fk.fromTable]) continue;
            const alreadyExists = schema[fk.fromTable].relations.some(r => r.foreignTable === fk.toTable && r.column === fk.fromColumn);
            if (!alreadyExists) {
                schema[fk.fromTable].relations.push({
                    column: fk.fromColumn,
                    foreignTable: fk.toTable,
                    foreignColumn: fk.toColumn,
                });
            }
        }

        res.json(schema);
    } catch(e) { handleDbError(res, e); }
});

// --- CONFIGURACIÓN DE EMPRESA (TABLA CONFIGURACION) ---
router.get('/admin/security/permission-audit', authenticateToken, requireAdmin, async (req, res) => {
    res.json(getPermissionGuardStats());
});

const mapConfigRow = (row) => ({
    nombreEmpresa:    row.nombreempresa    || '',
    rtn:              row.rtn              || '',
    direccion:        row.direccion        || '',
    telefono:         row.telefono         || '',
    correo:           row.correo           || '',
    cai:              row.cai              || '',
    rangoInicial:     row.rangoinicial     || '',
    rangoFinal:       row.rangofinal       || '',
    fechaLimite:      formatDateInput(row.fechalimite),
    facturaCorrelativoActual: Number(row.factura_correlativo_actual) || 1,
    isv:              Number(row.isv)      || 15,
    mensajeFinal:     row.mensajefinal     || 'LA FACTURA ES BENEFICIO DE TODOS, EXIJALA',
    logoBase64:       row.logo_base64      || '',
    // Automatizaciones (gestionadas desde el sistema)
    adminEmail:    row.admin_email     || process.env.ADMIN_EMAIL             || '',
    emailFrom:     row.email_from      || process.env.EMAIL_FROM              || '',
    automationSenderName: row.automation_sender_name || process.env.AUTOMATION_SENDER_NAME || 'VetCare ERP',
    backupR2Prefix: row.backup_r2_prefix || process.env.BACKUP_R2_PREFIX || 'backups',
    backupRetentionDays: Number(row.backup_retention_days ?? process.env.BACKUP_RETENTION_DAYS ?? 30),
    backupEnabled: row.backup_enabled !== false,
    backupTime: row.backup_time ? String(row.backup_time).slice(0, 5) : '02:30',
});

router.get('/config', authenticateToken, async (req, res) => {
    try {
        const r = await tenantQuery(req.tenantId, 'SELECT * FROM configuracion WHERE tenant_id = $1', [req.tenantId]);
        if (r.rows.length === 0) {
            return res.json(mapConfigRow({ isv: 15 }));
        }
        res.json(mapConfigRow(r.rows[0]));
    } catch(e) { handleDbError(res, e); }
});

router.put('/config', authenticateToken, requireAdmin, express.json({ limit: '10mb' }), async (req, res) => {
    try {
        const {
            nombreEmpresa, rtn, direccion, telefono, correo, cai,
            rangoInicial, rangoFinal, fechaLimite, isv, mensajeFinal, logoBase64,
            adminEmail, emailFrom, automationSenderName, backupR2Prefix,
            backupRetentionDays, backupEnabled, backupTime, facturaCorrelativoActual,
        } = req.body;
        await pool.query(`
            INSERT INTO configuracion (
                tenant_id, nombreempresa, rtn, direccion, telefono, correo, cai,
                rangoinicial, rangofinal, fechalimite, isv, mensajefinal, logo_base64,
                admin_email, email_from, automation_sender_name, backup_r2_prefix,
                backup_retention_days, backup_enabled, backup_time, factura_correlativo_actual
            )
            VALUES ($20, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NULLIF($19, '')::time, $21)
            ON CONFLICT (tenant_id) DO UPDATE SET
                nombreempresa = EXCLUDED.nombreempresa,
                rtn           = EXCLUDED.rtn,
                direccion     = EXCLUDED.direccion,
                telefono      = EXCLUDED.telefono,
                correo        = EXCLUDED.correo,
                cai           = EXCLUDED.cai,
                rangoinicial  = EXCLUDED.rangoinicial,
                rangofinal    = EXCLUDED.rangofinal,
                fechalimite   = EXCLUDED.fechalimite,
                isv           = EXCLUDED.isv,
                mensajefinal  = EXCLUDED.mensajefinal,
                logo_base64   = EXCLUDED.logo_base64,
                admin_email   = EXCLUDED.admin_email,
                email_from    = EXCLUDED.email_from,
                automation_sender_name = EXCLUDED.automation_sender_name,
                backup_r2_prefix = EXCLUDED.backup_r2_prefix,
                backup_retention_days = EXCLUDED.backup_retention_days,
                backup_enabled = EXCLUDED.backup_enabled,
                backup_time = EXCLUDED.backup_time,
                factura_correlativo_actual = GREATEST(EXCLUDED.factura_correlativo_actual, configuracion.factura_correlativo_actual)
        `, [
            nombreEmpresa, rtn, direccion, telefono, correo, cai,
            rangoInicial, rangoFinal, fechaLimite || null, isv, mensajeFinal, logoBase64 || null,
            adminEmail || null, emailFrom || null, automationSenderName || null,
            backupR2Prefix || 'backups', Number(backupRetentionDays || 30),
            backupEnabled !== false, backupTime || '02:30',
            req.tenantId, Number(facturaCorrelativoActual) || 1,
        ]);
        if (adminEmail) await automationService.ensureAdminRecipient(req.tenantId, adminEmail);
        invalidateSystemConfigCache();
        res.json({ message: 'Configuración actualizada' });
    } catch(e) { handleDbError(res, e); }
});

// --- LISTADO DE CAI VIGENTES (cai_facturacion) ---
const mapCaiRow = (row) => {
    const finalParts = String(row.rangofinal || '').trim().split('-');
    const inicialParts = String(row.rangoinicial || '').trim().split('-');
    const rangoFinalNum = finalParts.length >= 4 && /^\d+$/.test(finalParts[3]) ? Number(finalParts[3]) : null;
    const rangoInicialNum = inicialParts.length >= 4 && /^\d+$/.test(inicialParts[3]) ? Number(inicialParts[3]) : null;
    const correlativoActual = Number(row.correlativo_actual) || 1;
    return {
        id: row.id,
        cai: row.cai,
        rangoInicial: row.rangoinicial,
        rangoFinal: row.rangofinal,
        fechaLimite: formatDateInput(row.fechalimite),
        correlativoActual,
        estado: row.estado,
        documentosTotales: rangoFinalNum !== null && rangoInicialNum !== null ? (rangoFinalNum - rangoInicialNum + 1) : null,
        documentosRestantes: rangoFinalNum !== null ? Math.max(0, rangoFinalNum - correlativoActual + 1) : null,
        fechaRegistro: row.fecha_registro,
        registradoPor: row.registrado_por,
        agotadoEn: row.agotado_en,
    };
};

router.get('/admin/cai', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const r = await tenantQuery(
            req.tenantId,
            `SELECT * FROM cai_facturacion WHERE tenant_id = $1 ORDER BY fecha_registro DESC`,
            [req.tenantId]
        );
        res.json(r.rows.map(mapCaiRow));
    } catch (e) { handleDbError(res, e); }
});

router.post('/admin/cai', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { cai, rangoInicial, rangoFinal, fechaLimite, proximoNumero } = req.body || {};

        if (!cai || !String(cai).trim()) return res.status(400).json({ error: 'El CAI es obligatorio' });
        if (!fechaLimite) return res.status(400).json({ error: 'La fecha límite es obligatoria' });

        const inicialParts = String(rangoInicial || '').trim().split('-');
        const finalParts = String(rangoFinal || '').trim().split('-');
        if (inicialParts.length !== 4 || !/^\d+$/.test(inicialParts[3])) {
            return res.status(400).json({ error: 'Rango Inicial inválido. Formato esperado: NNN-NNN-NN-NNNNNNNN' });
        }
        if (finalParts.length !== 4 || !/^\d+$/.test(finalParts[3])) {
            return res.status(400).json({ error: 'Rango Final inválido. Formato esperado: NNN-NNN-NN-NNNNNNNN' });
        }
        if (inicialParts.slice(0, 3).join('-') !== finalParts.slice(0, 3).join('-')) {
            return res.status(400).json({ error: 'El Rango Inicial y el Rango Final deben tener el mismo prefijo (sucursal-punto de emisión-tipo de documento)' });
        }
        const inicialNum = Number(inicialParts[3]);
        const finalNum = Number(finalParts[3]);
        if (finalNum < inicialNum) {
            return res.status(400).json({ error: 'El Rango Final no puede ser menor que el Rango Inicial' });
        }
        const fechaLimiteDate = new Date(fechaLimite);
        if (Number.isNaN(fechaLimiteDate.getTime()) || fechaLimiteDate < new Date(new Date().toDateString())) {
            return res.status(400).json({ error: 'La Fecha Límite debe ser una fecha futura' });
        }

        // Permite arrancar más adelante del inicio del rango: si la empresa ya emitió
        // documentos en físico bajo este mismo CAI antes de migrar al sistema (ej. CAI
        // autoriza 1-50, ya se hicieron 20 en papel), el sistema debe continuar en 21,
        // no reiniciar en 1. Por defecto arranca en el número inicial del rango.
        let correlativoInicial = inicialNum;
        if (proximoNumero !== undefined && proximoNumero !== null && proximoNumero !== '') {
            const n = Number(proximoNumero);
            if (!Number.isInteger(n) || n < inicialNum || n > finalNum) {
                return res.status(400).json({ error: `El próximo número a facturar debe estar entre ${inicialNum} y ${finalNum}` });
            }
            correlativoInicial = n;
        }

        const result = await pool.query(
            `INSERT INTO cai_facturacion (tenant_id, cai, rangoinicial, rangofinal, fechalimite, correlativo_actual, estado, registrado_por, activado_en)
             VALUES ($1, $2, $3, $4, $5, $6, 'vigente', $7, NOW())
             RETURNING *`,
            [req.tenantId, String(cai).trim(), rangoInicial, rangoFinal, fechaLimite, correlativoInicial, req.user?.usuario || null]
        );
        res.status(201).json(mapCaiRow(result.rows[0]));
    } catch (e) { handleDbError(res, e); }
});

router.get('/admin/automation/events', authenticateToken, requireAdmin, async (req, res) => {
    res.json(automationService.getEventCatalog());
});

router.get('/admin/automation/recipients', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { adminEmail } = await getSystemConfig(req.tenantId);
        if (adminEmail) await automationService.ensureAdminRecipient(req.tenantId, adminEmail);
        res.json(await automationService.listRecipients(req.tenantId));
    } catch (e) { handleDbError(res, e); }
});

router.get('/admin/automation/recipients/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const recipient = await automationService.getRecipient(req.tenantId, Number(req.params.id));
        if (!recipient) return res.status(404).json({ error: 'Destinatario no encontrado' });
        res.json(recipient);
    } catch (e) { handleDbError(res, e); }
});

router.post('/admin/automation/recipients', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const recipient = await automationService.upsertRecipient(req.tenantId, req.body || {});
        res.status(201).json(recipient);
    } catch (e) {
        if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
        handleDbError(res, e);
    }
});

router.put('/admin/automation/recipients/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const recipient = await automationService.updateRecipient(req.tenantId, Number(req.params.id), req.body || {});
        res.json(recipient);
    } catch (e) {
        if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
        handleDbError(res, e);
    }
});

router.put('/admin/automation/recipients/:id/events', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await automationService.setRecipientEvents(req.tenantId, Number(req.params.id), req.body?.events || []);
        res.json({ message: 'Preferencias actualizadas' });
    } catch (e) { handleDbError(res, e); }
});

router.delete('/admin/automation/recipients/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await automationService.deleteRecipient(req.tenantId, Number(req.params.id));
        res.json({ message: 'Destinatario eliminado' });
    } catch (e) { handleDbError(res, e); }
});

router.get('/admin/automation/backups', authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.json(await automationService.listBackupJobs(req.tenantId));
    } catch (e) { handleDbError(res, e); }
});

router.post('/admin/automation/backup-now', authenticateToken, requireAdmin, async (req, res) => {
    let jobId = null;
    try {
        const started = await pool.query(`
            INSERT INTO backup_jobs (tenant_id, scope, provider, estado, started_at)
            VALUES ($1, 'all_tenants', 'cloudflare_r2', 'Ejecutando', NOW())
            RETURNING id
        `, [req.tenantId]);
        jobId = started.rows[0].id;
        const { backupDatabaseToR2 } = require('../services/r2BackupService');
        const result = await backupDatabaseToR2({ tenantId: req.tenantId, tenantSlug: 'all-tenants', scope: 'all_tenants' });
        await pool.query(`
            UPDATE backup_jobs
            SET estado = 'Completado', object_key = $1, size_bytes = $2, finished_at = NOW()
            WHERE id = $3
        `, [result.objectKey, result.size, jobId]);
        res.json({ message: 'Backup completado en Cloudflare R2', data: result });
    } catch (e) {
        if (jobId) {
            await pool.query(`UPDATE backup_jobs SET estado = 'Error', error = $1, finished_at = NOW() WHERE id = $2`, [e.message, jobId]).catch(() => {});
        }
        handleDbError(res, e);
    }
});

// --- PANEL DE CONTROL DE CAJAS ---
router.get('/admin/boxes/status', authenticateToken, async (req, res) => {
    try {
        // Obtener cajas
        const cajasRes = await pool.query(
            `SELECT idCaja as "idCaja", nombre as "nombreCaja" FROM caja WHERE tenant_id = $1 ORDER BY idCaja ASC`,
            [req.tenantId]
        );
        const cajas = cajasRes.rows;

        // Para cada caja obtener el arqueo activo de forma independiente
        const result = await Promise.all(cajas.map(async (caja) => {
            try {
                const arqRes = await pool.query(
                    `SELECT idArqueo as "idArqueo", idUsuario as "idUsuario", estado as "estadoArqueo",
                            COALESCE(montoInicial, 0) as "montoInicial",
                            COALESCE(montoFinal, 0) as "montoFinal",
                            COALESCE(ganancia, 0) as "ganancia",
                            fechaApertura as "fechaApertura", fechaCierre as "fechaCierre"
                     FROM arqueo WHERE idCaja = $1 AND estado = 'Activo' AND tenant_id = $2 LIMIT 1`,
                    [caja.idCaja, req.tenantId]
                );
                const arq = arqRes.rows[0] || null;

                let usuario = null;
                let nombreEmpleado = null;
                if (arq?.idUsuario) {
                    const uRes = await pool.query(
                        `SELECT u.usuario, COALESCE(e.nombre || ' ' || e.apellido, u.usuario) as "nombreEmpleado"
                         FROM usuarios u LEFT JOIN empleado e ON u.identidad = e.identidad
                         WHERE u.codUsuario = $1 AND u.tenant_id = $2`,
                        [arq.idUsuario, req.tenantId]
                    );
                    usuario = uRes.rows[0]?.usuario || null;
                    nombreEmpleado = uRes.rows[0]?.nombreEmpleado || null;
                }

                return { ...caja, ...arq, usuario, nombreEmpleado };
            } catch {
                return { ...caja, idArqueo: null, estadoArqueo: null, montoInicial: 0, montoFinal: 0, ganancia: 0, usuario: null, nombreEmpleado: null };
            }
        }));

        res.json(result);
    } catch(e) { handleDbError(res, e); }
});

router.get('/admin/boxes/:id/history', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT idArqueo as "idArqueo", fechaApertura as "fechaApertura", fechaCierre as "fechaCierre", montoInicial as "montoInicial", montoFinal as "montoFinal", estado
            FROM arqueo WHERE idCaja = $1 AND tenant_id = $2 ORDER BY fechaApertura DESC
        `;
        const result = await pool.query(query, [req.params.id, req.tenantId]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.put('/admin/arqueo/:id/reopen', authenticateToken, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const arqRes = await client.query(
            'SELECT idArqueo, idCaja, estado FROM arqueo WHERE idArqueo = $1 AND tenant_id = $2',
            [req.params.id, req.tenantId]
        );
        if (arqRes.rows.length === 0) throw new Error('Arqueo no encontrado');
        const arqueo = arqRes.rows[0];

        if (arqueo.estado === 'Activo') throw new Error('Esta caja ya está activa');

        const activeCheck = await client.query(
            "SELECT idArqueo FROM arqueo WHERE idCaja = $1 AND estado = 'Activo' AND tenant_id = $2",
            [arqueo.idcaja, req.tenantId]
        );
        if (activeCheck.rows.length > 0) throw new Error('Ya existe una sesión activa para esta caja. Ciérrela primero.');

        await client.query(
            "UPDATE arqueo SET estado = 'Activo', fechaCierre = NULL WHERE idArqueo = $1 AND tenant_id = $2",
            [req.params.id, req.tenantId]
        );

        await updateArqueoBalance(arqueo.idcaja, client, req.tenantId);
        await client.query('COMMIT');
        res.json({ message: 'Caja reaperturada correctamente' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.codUsuario as "codUsuario", u.usuario, u.identidad, u.idCaja as "idCaja", u.idrol, u.estado,
            u.id_sucursal,
            COALESCE(u.requires_password_change, FALSE) as "requiresPasswordChange",
            e.nombre || ' ' || e.apellido as "nombreEmpleado", r.nombre as "nombreRol",
            s.nombre as "sucursal_nombre"
            FROM usuarios u
            LEFT JOIN empleado e ON u.identidad = e.identidad AND e.tenant_id = $1
            LEFT JOIN roles r ON u.idrol::text = r.idrol::text AND r.tenant_id = $1
            LEFT JOIN sucursales s ON u.id_sucursal = s.id_sucursal AND s.tenant_id = $1
            WHERE u.tenant_id = $1
        `, [req.tenantId]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/users', authenticateToken, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        const { usuario, identidad, idrol, idCaja, estado, id_sucursal } = req.body;
        if (!usuario || typeof usuario !== 'string' || usuario.length < 3 || usuario.length > 50) {
            return res.status(400).json({ error: 'usuario debe tener entre 3 y 50 caracteres' });
        }
        if (!identidad || typeof identidad !== 'string' || identidad.length > 20) {
            return res.status(400).json({ error: 'identidad es requerida (máx 20 caracteres)' });
        }
        if (!idrol) return res.status(400).json({ error: 'idrol es requerido' });
        if (!estado) return res.status(400).json({ error: 'estado es requerido' });
        const assignment = await validateUserAssignment(client, req.tenantId, { idrol, idCaja, id_sucursal });
        if (assignment.error) return res.status(400).json({ error: assignment.error });

        const tempPassword = 'Sc-' + crypto.randomBytes(8).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
        // codUsuario is SERIAL — let the DB auto-generate it
        const result = await client.query(
            `INSERT INTO usuarios (usuario, password, identidad, idCaja, idrol, id_sucursal, estado, requires_password_change, tenant_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
             RETURNING codUsuario`,
            [usuario, hashedPassword, identidad, assignment.idCaja, idrol, assignment.id_sucursal, estado, req.tenantId]);
        const codUsuario = result.rows[0].codusuario;
        res.status(201).json({ message: 'OK', codUsuario, tempPassword });
    } catch(e) { handleDbError(res, e); } finally { client.release(); }
});

router.put('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        const { usuario, password, identidad, idrol, idCaja, estado, id_sucursal } = req.body;
        const assignment = await validateUserAssignment(client, req.tenantId, {
            idrol,
            idCaja,
            id_sucursal,
            codUsuario: req.params.id,
        });
        if (assignment.error) return res.status(400).json({ error: assignment.error });

        let query = `UPDATE usuarios SET usuario=$1, identidad=$2, idrol=$3, idCaja=$4, id_sucursal=$5, estado=$6`;
        let params = [usuario, identidad, idrol, assignment.idCaja, assignment.id_sucursal, estado];
        if (password && password.trim() !== '') {
            const pwErr = validatePasswordStrength(password);
            if (pwErr) return res.status(400).json({ error: pwErr });
            const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
            query += `, password=$${params.length + 1}`;
            params.push(hashedPassword);
        }
        query += ` WHERE codUsuario=$${params.length + 1} AND tenant_id=$${params.length + 2}`;
        params.push(req.params.id);
        params.push(req.tenantId);
        await client.query(query, params);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); } finally { client.release(); }
});

router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (req.params.id === req.user.codUsuario) {
            return res.status(400).json({ error: 'No puede eliminar su propia cuenta' });
        }
        await pool.query('DELETE FROM usuarios WHERE codUsuario=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/empleados', authenticateToken, async (req, res) => {
    try {
        const { id_sucursal } = req.query;
        let query = `
            SELECT e.identidad, e.nombre, e.apellido, e.direccion, e.telefono, e.estado,
                   e.id_sucursal, s.nombre AS "sucursal_nombre"
            FROM empleado e
            LEFT JOIN sucursales s ON e.id_sucursal = s.id_sucursal AND s.tenant_id = $1
            WHERE e.tenant_id = $1
        `;
        const params = [req.tenantId];
        if (id_sucursal) { params.push(id_sucursal); query += ` AND e.id_sucursal = $${params.length}`; }
        query += ' ORDER BY e.nombre';
        const r = await pool.query(query, params);
        res.json(r.rows);
    } catch(e) {
        if (e.code === '42703') {
            // id_sucursal column not yet migrated — return without sucursal info
            try {
                const r = await pool.query('SELECT * FROM empleado WHERE tenant_id = $1 ORDER BY nombre', [req.tenantId]);
                res.json(r.rows);
            } catch(e2) { handleDbError(res, e2); }
        } else { handleDbError(res, e); }
    }
});

router.post('/empleados', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { identidad, nombre, apellido, direccion, telefono, estado, id_sucursal } = req.body;
        try {
            await pool.query(
                'INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono, estado, id_sucursal, fechaCreacion, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), $8)',
                [identidad, nombre, apellido, direccion, telefono, estado, id_sucursal || null, req.tenantId]
            );
        } catch(e2) {
            if (e2.code !== '42703') throw e2;
            await pool.query(
                'INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono, estado, fechaCreacion, tenant_id) VALUES ($1,$2,$3,$4,$5,$6, NOW(), $7)',
                [identidad, nombre, apellido, direccion, telefono, estado, req.tenantId]
            );
        }
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/empleados/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { nombre, apellido, direccion, telefono, estado, id_sucursal } = req.body;
        try {
            await pool.query(
                'UPDATE empleado SET nombre=$1, apellido=$2, direccion=$3, telefono=$4, estado=$5, id_sucursal=$6 WHERE identidad=$7 AND tenant_id=$8',
                [nombre, apellido, direccion, telefono, estado, id_sucursal || null, req.params.id, req.tenantId]
            );
        } catch(e2) {
            if (e2.code !== '42703') throw e2;
            await pool.query(
                'UPDATE empleado SET nombre=$1, apellido=$2, direccion=$3, telefono=$4, estado=$5 WHERE identidad=$6 AND tenant_id=$7',
                [nombre, apellido, direccion, telefono, estado, req.params.id, req.tenantId]
            );
        }
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// Transfer employee to another branch and optionally reassign caja
router.post('/empleados/:id/transferir', authenticateToken, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id_sucursal_destino, nueva_idCaja } = req.body;
        if (!id_sucursal_destino) return res.status(400).json({ error: 'id_sucursal_destino es requerido' });
        await client.query('BEGIN');
        await client.query(
            'UPDATE empleado SET id_sucursal=$1 WHERE identidad=$2 AND tenant_id=$3',
            [id_sucursal_destino, req.params.id, req.tenantId]
        );
        if (nueva_idCaja) {
            const userRes = await client.query('SELECT codUsuario, idrol FROM usuarios WHERE identidad=$1 AND tenant_id=$2 LIMIT 1', [req.params.id, req.tenantId]);
            if (userRes.rows.length) {
                const assignment = await validateUserAssignment(client, req.tenantId, {
                    idrol: userRes.rows[0].idrol,
                    idCaja: nueva_idCaja,
                    id_sucursal: id_sucursal_destino,
                    codUsuario: userRes.rows[0].codusuario,
                });
                if (assignment.error) throw new Error(assignment.error);
            }
            await client.query(
                'UPDATE usuarios SET idCaja=$1, id_sucursal=$2 WHERE identidad=$3 AND tenant_id=$4',
                [nueva_idCaja, id_sucursal_destino, req.params.id, req.tenantId]
            );
        } else {
            await client.query(
                'UPDATE usuarios SET id_sucursal=$1 WHERE identidad=$2 AND tenant_id=$3',
                [id_sucursal_destino, req.params.id, req.tenantId]
            );
        }
        await client.query('COMMIT');
        res.json({ message: 'Empleado transferido correctamente' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.delete('/empleados/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM empleado WHERE identidad=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/roles', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const roles = await pool.query('SELECT idrol, nombre, estado FROM roles WHERE tenant_id = $1', [req.tenantId]);
        const rolesWithPerms = await Promise.all(roles.rows.map(async (rol) => {
            // rol_permisos has no tenant_id — scope via roles subquery
            const perms = await pool.query(
                'SELECT idPermiso FROM rol_permisos WHERE idRol = $1 AND idRol IN (SELECT idrol FROM roles WHERE tenant_id = $2)',
                [rol.idrol, req.tenantId]
            );
            return { ...rol, permisos: perms.rows.map(p => p.idpermiso) };
        }));
        res.json(rolesWithPerms);
    } catch(e) { handleDbError(res, e); }
});

router.post('/roles', authenticateToken, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        const { nombre, estado, permisos } = req.body;
        await client.query('BEGIN');
        // idrol is SERIAL — let the DB auto-generate it
        const r = await client.query(
            'INSERT INTO roles (nombre, estado, tenant_id) VALUES ($1, $2, $3) RETURNING idrol',
            [nombre, estado, req.tenantId]
        );
        const idRol = r.rows[0].idrol;
        if (permisos && Array.isArray(permisos)) {
            for (const pid of permisos) {
                await client.query('INSERT INTO rol_permisos (idRol, idPermiso) VALUES ($1, $2)', [idRol, pid]);
            }
        }
        await client.query('COMMIT');
        res.status(201).json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.put('/roles/:id', authenticateToken, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        const { nombre, estado, permisos } = req.body;
        await client.query('BEGIN');
        await client.query(
            'UPDATE roles SET nombre=$1, estado=$2 WHERE idrol=$3 AND tenant_id=$4',
            [nombre, estado, req.params.id, req.tenantId]
        );
        // rol_permisos scoped via roles — only delete if role belongs to this tenant
        await client.query(
            'DELETE FROM rol_permisos WHERE idRol=$1 AND idRol IN (SELECT idrol FROM roles WHERE tenant_id=$2)',
            [req.params.id, req.tenantId]
        );
        if (permisos && Array.isArray(permisos)) {
            for (const pid of permisos) {
                await client.query('INSERT INTO rol_permisos (idRol, idPermiso) VALUES ($1, $2)', [req.params.id, pid]);
            }
        }
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.delete('/roles/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM roles WHERE idrol=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// permisos is a global catalog — no tenant_id filter
router.get('/permisos', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT idPermiso as "idPermiso", nombre, modulo
            FROM permisos
            ORDER BY
                CASE modulo
                    WHEN 'Comercial' THEN 1
                    WHEN 'Clinica' THEN 2
                    WHEN 'Inventario' THEN 3
                    WHEN 'Finanzas' THEN 4
                    WHEN 'Administracion' THEN 5
                    ELSE 9
                END,
                nombre
        `);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.get('/cajas', authenticateToken, async (req, res) => {
    try {
        const { id_sucursal } = req.query;
        let query = `
            SELECT c.idCaja as "idCaja", c.nombre, c.estado, c.id_sucursal, s.nombre AS "sucursal_nombre"
            FROM caja c
            LEFT JOIN sucursales s ON c.id_sucursal = s.id_sucursal AND s.tenant_id = $1
            WHERE c.tenant_id = $1
        `;
        const params = [req.tenantId];
        if (id_sucursal) { params.push(id_sucursal); query += ` AND c.id_sucursal = $${params.length}`; }
        query += ' ORDER BY c.idCaja';
        const r = await pool.query(query, params);
        res.json(r.rows);
    } catch(e) {
        if (e.code === '42703') {
            // id_sucursal column not yet migrated — return without sucursal info
            try {
                const r = await pool.query(`SELECT idCaja as "idCaja", nombre, estado FROM caja WHERE tenant_id = $1 ORDER BY idCaja`, [req.tenantId]);
                res.json(r.rows);
            } catch(e2) { handleDbError(res, e2); }
        } else { handleDbError(res, e); }
    }
});

router.post('/cajas', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { nombre, id_sucursal } = req.body;
        if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
        if (!id_sucursal) return res.status(400).json({ error: 'id_sucursal es requerido' });
        const idCaja = await withTenantContext(req.tenantId, async (client) => {
            const id = await generateNextId('caja', 'idCaja', 'CAJA', client);
            await client.query(
                'INSERT INTO caja (idCaja, nombre, estado, id_sucursal, tenant_id) VALUES ($1, $2, $3, $4, $5)',
                [id, nombre, 'Activo', id_sucursal, req.tenantId]
            );
            return id;
        });
        res.status(201).json({ message: 'OK', idCaja });
    } catch(e) { handleDbError(res, e); }
});

router.put('/cajas/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { nombre, estado, id_sucursal } = req.body;
        if (estado && !['Activo', 'Inactivo'].includes(estado)) {
            return res.status(400).json({ error: 'estado debe ser Activo o Inactivo' });
        }
        await pool.query(
            'UPDATE caja SET nombre=$1, estado=$2, id_sucursal=$3 WHERE idCaja=$4 AND tenant_id=$5',
            [nombre, estado, id_sucursal || null, req.params.id, req.tenantId]
        );
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/cajas/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM caja WHERE idCaja=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
