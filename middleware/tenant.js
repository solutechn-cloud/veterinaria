
'use strict';

const jwt  = require('jsonwebtoken');
const { pool } = require('../config/db');

const SAAS_SUPER_SECRET = process.env.SAAS_SUPER_SECRET;

// In-memory cache: slug → { tenant, cachedAt }
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Short-lived cache keyed by tenant UUID for per-request status checks
const tenantIdCache = new Map();
const STATUS_CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Fetches a tenant by slug, using an in-memory cache to avoid repeated DB hits.
 * @param {string} slug - The tenant slug
 * @returns {Promise<object|null>}
 */
async function getTenantBySlug(slug) {
    const cached = tenantCache.get(slug);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) return cached.tenant;

    const { rows } = await pool.query(
        `SELECT id, slug, nombre_empresa, plan, estado, max_sucursales, max_usuarios, max_medicamentos, fecha_vencimiento
         FROM tenants WHERE slug = $1`,
        [slug]
    );
    if (!rows.length) return null;

    tenantCache.set(slug, { tenant: rows[0], cachedAt: Date.now() });
    return rows[0];
}

/**
 * Fetches a tenant by UUID, using a short-lived cache for authenticated request validation.
 * @param {string} id - The tenant UUID
 * @returns {Promise<object|null>}
 */
async function getTenantById(id) {
    const cached = tenantIdCache.get(id);
    if (cached && Date.now() - cached.cachedAt < STATUS_CACHE_TTL) return cached.tenant;

    const { rows } = await pool.query(
        `SELECT id, slug, estado, fecha_vencimiento FROM tenants WHERE id = $1`,
        [id]
    );
    if (!rows.length) return null;

    tenantIdCache.set(id, { tenant: rows[0], cachedAt: Date.now() });
    return rows[0];
}

/**
 * Middleware: resolves tenant from JWT and validates the tenant is still active.
 * Uses a 1-minute cache to avoid a DB hit on every request while still catching
 * suspensions/expirations within ~60 seconds.
 */
const requireTenantFromJWT = async (req, res, next) => {
    if (!req.user?.tenantId) {
        return res.status(400).json({ error: 'tenant_id requerido en token' });
    }
    req.tenantId = req.user.tenantId;
    try {
        const tenant = await getTenantById(req.user.tenantId);
        if (!tenant) {
            return res.status(403).json({ error: 'Clinica no encontrada' });
        }
        if (tenant.estado === 'suspendido') {
            return res.status(403).json({ error: 'Cuenta suspendida. Contacte al administrador.' });
        }
        if (tenant.estado === 'cancelado') {
            return res.status(403).json({ error: 'Cuenta cancelada.' });
        }
        if (tenant.fecha_vencimiento && new Date(tenant.fecha_vencimiento) < new Date()) {
            return res.status(402).json({ error: 'Suscripción vencida. Renueve su plan.' });
        }
        next();
    } catch (err) {
        console.error('Tenant status check error:', err.message);
        res.status(500).json({ error: 'Error verificando estado de cuenta' });
    }
};

/**
 * Middleware: resolves tenant from X-Tenant-ID header or subdomain.
 * Used on the login endpoint before the JWT exists.
 * Priority: header → subdomain.
 * Skips gracefully if no slug is found (public routes).
 */
const resolveTenantBySlug = async (req, res, next) => {
    if (req.tenantId) return next(); // already resolved from JWT

    let slug = req.body?.tenantSlug || req.headers['x-tenant-id'];

    if (!slug) {
        const host = req.hostname || '';
        const parts = host.split('.');
        const isRenderHost = host.endsWith('.onrender.com');
        if (parts.length >= 3 && !isRenderHost) slug = parts[0];
    }

    if (typeof slug === 'string') slug = slug.trim().toLowerCase();

    if (!slug) return next(); // public routes — no tenant required

    try {
        const tenant = await getTenantBySlug(slug);

        if (!tenant) {
            return res.status(404).json({ error: 'Clinica no encontrada' });
        }
        if (tenant.estado === 'suspendido') {
            return res.status(403).json({ error: 'Cuenta suspendida. Contacte a soporte.' });
        }
        if (tenant.estado === 'cancelado') {
            return res.status(403).json({ error: 'Cuenta cancelada.' });
        }
        if (tenant.fecha_vencimiento && new Date(tenant.fecha_vencimiento) < new Date()) {
            return res.status(402).json({ error: 'Suscripción vencida. Renueve su plan para continuar.' });
        }

        req.tenantId = tenant.id;
        req.tenant = tenant;
        next();
    } catch (err) {
        console.error('Tenant resolution error:', err.message);
        res.status(500).json({ error: 'Error interno resolviendo clinica' });
    }
};

/**
 * Middleware: verifies the Bearer token using SAAS_SUPER_SECRET and validates
 * the aud:'saas-admin' claim. Must be used instead of — not after — authenticateToken
 * on super-admin routes, because super-admin tokens are signed with a different secret.
 */
const requireSuperAdmin = (req, res, next) => {
    if (!SAAS_SUPER_SECRET) {
        console.error('[FATAL] SAAS_SUPER_SECRET no está configurado');
        return res.status(500).json({ error: 'Configuración de servidor incompleta' });
    }
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token de super-administrador requerido' });

    jwt.verify(token, SAAS_SUPER_SECRET, { algorithms: ['HS256'], audience: 'saas-admin' }, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Token de super-administrador inválido' });
        if (!decoded.isSuperAdmin) return res.status(403).json({ error: 'Acceso restringido a super-administradores' });
        req.user = decoded;
        next();
    });
};

/**
 * Removes a tenant from both slug and ID caches.
 * Call after updating a tenant record so next request re-fetches from DB.
 * @param {string} slug
 */
const invalidateTenantCache = (slug) => {
    tenantCache.delete(slug);
    for (const [id, entry] of tenantIdCache.entries()) {
        if (entry.tenant.slug === slug) { tenantIdCache.delete(id); break; }
    }
};

module.exports = { resolveTenantBySlug, requireTenantFromJWT, requireSuperAdmin, invalidateTenantCache, getTenantBySlug, getTenantById };
