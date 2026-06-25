
'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { pool, handleDbError } = require('../config/db');
const { authenticateToken, validatePasswordStrength } = require('../middleware/auth');
const { requireSuperAdmin, getTenantBySlug } = require('../middleware/tenant');

// Dedicated secret for super-admin tokens — must differ from JWT_SECRET
const SAAS_SUPER_SECRET = process.env.SAAS_SUPER_SECRET;
const SAAS_ADMIN_SECRET = process.env.SAAS_ADMIN_SECRET;

if (!SAAS_SUPER_SECRET || Buffer.byteLength(SAAS_SUPER_SECRET, 'utf8') < 32) {
    console.error('[FATAL] SAAS_SUPER_SECRET debe estar configurado con al menos 32 bytes.');
    process.exit(1);
}

// HMAC-based constant-time comparison — eliminates length oracle
const _HMAC_KEY = crypto.randomBytes(32);
function safeCompare(a, b) {
    const ha = crypto.createHmac('sha256', _HMAC_KEY).update(a).digest();
    const hb = crypto.createHmac('sha256', _HMAC_KEY).update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
}

const superAdminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de acceso. Intente de nuevo en 15 minutos.' },
});

function httpError(statusCode, message) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

/**
 * POST /api/saas/admin/login
 * Authenticates the super-admin using SAAS_ADMIN_SECRET.
 * Returns a JWT signed with SAAS_SUPER_SECRET (separate from tenant JWTs).
 */
router.post('/admin/login', superAdminLimiter, (req, res) => {
    if (!SAAS_ADMIN_SECRET) {
        console.error('[FATAL] SAAS_ADMIN_SECRET no configurado');
        return res.status(500).json({ error: 'Configuración de servidor incompleta' });
    }

    const { secret } = req.body;
    if (!secret) return res.status(400).json({ error: 'secret es requerido' });

    const equal = safeCompare(Buffer.from(secret), Buffer.from(SAAS_ADMIN_SECRET));

    if (!equal) {
        return res.status(401).json({ error: 'Credenciales de super-administrador inválidas' });
    }

    const token = jwt.sign(
        { isSuperAdmin: true, adminId: 'superadmin', aud: 'saas-admin' },
        SAAS_SUPER_SECRET,
        { expiresIn: '4h', algorithm: 'HS256' }
    );

    res.json({
        data: { token, adminId: 'superadmin' },
        message: 'Sesión de super-administrador iniciada'
    });
});

/**
 * POST /api/saas/tenants/:slug/provision-admin
 * Creates the first admin user for a tenant. Only callable by super-admin.
 */
router.post('/tenants/:slug/provision-admin', requireSuperAdmin, async (req, res) => {
    const { slug } = req.params;
    const { usuario, password } = req.body;

    if (!usuario || !password) {
        return res.status(400).json({ error: 'usuario y password son requeridos' });
    }
    const pwErr = validatePasswordStrength(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const client = await pool.connect();
    let inTransaction = false;
    try {
        const tenant = await getTenantBySlug(slug);
        if (!tenant) throw httpError(404, 'Tenant no encontrado');

        await client.query('BEGIN');
        inTransaction = true;

        const roleRes = await client.query(
            `SELECT idrol FROM roles WHERE LOWER(nombre) = 'administrador' AND tenant_id = $1 LIMIT 1`,
            [tenant.id]
        );
        if (!roleRes.rows.length) {
            throw httpError(409, 'Rol Administrador no encontrado para este tenant.');
        }
        const adminRoleId = roleRes.rows[0].idrol;

        const existCheck = await client.query(
            `SELECT codUsuario FROM usuarios WHERE usuario = $1 AND tenant_id = $2`,
            [usuario, tenant.id]
        );
        if (existCheck.rows.length) {
            throw httpError(409, 'Ya existe un usuario con ese nombre en este tenant');
        }

        const hashed = await bcrypt.hash(password, 12);
        const userResult = await client.query(
            `INSERT INTO usuarios (usuario, password, idrol, estado, tenant_id, requires_password_change)
             VALUES ($1, $2, $3, 'Activo', $4, TRUE)
             RETURNING codUsuario, usuario, estado`,
            [usuario, hashed, adminRoleId, tenant.id]
        );

        await client.query('COMMIT');
        inTransaction = false;

        res.status(201).json({
            data: {
                usuario: userResult.rows[0],
                tenant: { id: tenant.id, slug: tenant.slug, nombre_empresa: tenant.nombre_empresa }
            },
            message: `Usuario administrador creado para tenant '${tenant.nombre_empresa}'.`
        });
    } catch (err) {
        if (inTransaction) await client.query('ROLLBACK').catch(() => {});
        if (err.statusCode) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        handleDbError(res, err);
    } finally {
        client.release();
    }
});

/**
 * POST /api/saas/backup-now
 * Runs a full database backup. Restricted to SaaS super-admin because the dump
 * contains all tenants.
 */
router.post('/backup-now', requireSuperAdmin, async (req, res) => {
    try {
        const { backupDatabaseToR2 } = require('../services/r2BackupService');
        const result = await backupDatabaseToR2({ tenantSlug: 'all-tenants', scope: 'all_tenants' });
        res.json({ data: result, message: 'Backup completado en Cloudflare R2' });
    } catch (err) {
        console.error('[saasAuthRoutes] backup-now error:', err.message);
        res.status(500).json({ error: 'Error ejecutando backup' });
    }
});

module.exports = { router, SAAS_SUPER_SECRET };
