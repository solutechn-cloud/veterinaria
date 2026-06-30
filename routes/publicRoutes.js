
'use strict';

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { pool, handleDbError } = require('../config/db');
const { getTenantBySlug } = require('../middleware/tenant');
const { validatePasswordStrength } = require('../middleware/auth');

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes de registro. Intente de nuevo en 1 hora.' },
});

const tenantCheckLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas consultas de disponibilidad. Intente de nuevo en un minuto.' },
});

const tenantBrandingLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas consultas de clinica. Intente de nuevo en un minuto.' },
});

const isTenantAvailableForLogin = (tenant) => {
    if (!tenant) return false;
    if (tenant.estado === 'suspendido' || tenant.estado === 'cancelado') return false;
    if (tenant.fecha_vencimiento && new Date(tenant.fecha_vencimiento) < new Date()) return false;
    return true;
};

// Subscription plan definitions
const PLANS = [
    {
        id: 'basico',
        nombre: 'Básico',
        precio_mensual: 49,
        precio_anual: 490,
        moneda: 'USD',
        max_sucursales: 1,
        max_usuarios: 5,
        max_medicamentos: 500,
        caracteristicas: [
            'Punto de venta',
            'Gestión de inventario (hasta 500 medicamentos)',
            'Facturación básica',
            '1 sucursal',
            'Hasta 5 usuarios',
            'Soporte por email',
        ],
    },
    {
        id: 'profesional',
        nombre: 'Profesional',
        precio_mensual: 99,
        precio_anual: 990,
        moneda: 'USD',
        max_sucursales: 5,
        max_usuarios: 20,
        max_medicamentos: 5000,
        caracteristicas: [
            'Todo lo del plan Básico',
            'Hasta 5 sucursales',
            'Hasta 20 usuarios',
            'Hasta 5,000 medicamentos',
            'Expediente clinico y formulas medicas',
            'Reportes avanzados',
            'Órdenes de compra',
            'Transferencias entre sucursales',
            'Soporte prioritario',
        ],
    },
    {
        id: 'enterprise',
        nombre: 'Enterprise',
        precio_mensual: 199,
        precio_anual: 1990,
        moneda: 'USD',
        max_sucursales: null,
        max_usuarios: null,
        max_medicamentos: null,
        caracteristicas: [
            'Todo lo del plan Profesional',
            'Sucursales ilimitadas',
            'Usuarios ilimitados',
            'Medicamentos ilimitados',
            'API de integración',
            'Respaldo automatico en Cloudflare R2',
            'Soporte 24/7 con SLA garantizado',
            'Onboarding personalizado',
        ],
    },
];

/**
 * GET /api/public/plans
 * Returns the 3 subscription tiers with pricing and features.
 */
router.get('/plans', (req, res) => {
    res.json({ data: PLANS, message: 'Planes de suscripción disponibles' });
});

/**
 * GET /api/public/tenant-check/:slug
 * Checks if a given slug is available for registration.
 */
router.get('/tenant-check/:slug', tenantCheckLimiter, async (req, res) => {
    const { slug } = req.params;

    if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
        return res.status(400).json({ error: 'slug debe tener entre 3 y 50 caracteres (letras minúsculas, números y guiones)' });
    }

    try {
        const existing = await getTenantBySlug(slug);
        if (existing) {
            return res.json({ data: { available: false, slug }, message: 'El slug no está disponible' });
        }
        res.json({ data: { available: true, slug }, message: 'El slug está disponible' });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * GET /api/public/tenant-branding/:slug
 * Returns public, non-sensitive branding for the tenant login screen.
 */
router.get('/tenant-branding/:slug', tenantBrandingLimiter, async (req, res) => {
    const { slug } = req.params;

    if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
        return res.status(400).json({ error: 'slug debe tener entre 3 y 50 caracteres (letras minusculas, numeros y guiones)' });
    }

    try {
        const tenant = await getTenantBySlug(slug);
        if (!tenant) {
            return res.status(404).json({ error: 'Clinica no encontrada' });
        }

        const configResult = await pool.query(
            `SELECT nombreempresa, logo_base64
             FROM configuracion
             WHERE tenant_id = $1
             LIMIT 1`,
            [tenant.id]
        );
        const config = configResult.rows[0] || {};
        const activo = isTenantAvailableForLogin(tenant);

        res.json({
            data: {
                slug: tenant.slug,
                nombreEmpresa: config.nombreempresa || tenant.nombre_empresa || tenant.slug,
                logoBase64: config.logo_base64 || '',
                activo,
            },
            message: activo ? 'Branding de clinica disponible' : 'Clinica no disponible',
        });
    } catch (err) {
        handleDbError(res, err);
    }
});

/**
 * POST /api/public/register
 * Self-service tenant registration.
 * Creates tenant in 'prueba' estado with a 14-day trial.
 */
router.post('/register', registerLimiter, async (req, res) => {
    const {
        slug, nombre_empresa, admin_email, admin_password,
        plan = 'basico'
    } = req.body;

    if (!slug || !nombre_empresa || !admin_email || !admin_password) {
        return res.status(400).json({ error: 'slug, nombre_empresa, admin_email y admin_password son requeridos' });
    }
    if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
        return res.status(400).json({ error: 'slug debe tener entre 3 y 50 caracteres (letras minúsculas, números y guiones)' });
    }
    const passwordError = validatePasswordStrength(admin_password);
    if (passwordError) {
        return res.status(400).json({ error: passwordError });
    }
    if (!['basico', 'profesional'].includes(plan)) {
        return res.status(400).json({ error: 'plan inválido para auto-registro. Use: basico o profesional' });
    }

    const selectedPlan = PLANS.find(p => p.id === plan);
    const trialDays = 14;
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + trialDays);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify slug not taken inside the transaction for consistency
        const slugCheck = await client.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
        if (slugCheck.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `El slug '${slug}' ya está en uso. Por favor elige otro.` });
        }

        // 1. Create tenant in trial mode
        const tenantResult = await client.query(
            `INSERT INTO tenants (slug, nombre_empresa, plan, estado, max_sucursales, max_usuarios, max_medicamentos, fecha_vencimiento)
             VALUES ($1, $2, $3, 'prueba', $4, $5, $6, $7)
             RETURNING id, slug, nombre_empresa, plan, estado, fecha_vencimiento`,
            [
                slug, nombre_empresa, plan,
                selectedPlan.max_sucursales ?? 999,
                selectedPlan.max_usuarios ?? 999,
                selectedPlan.max_medicamentos ?? 999999,
                fechaVencimiento.toISOString()
            ]
        );
        const tenant = tenantResult.rows[0];

        // 2. Default configuracion (one row per tenant via UNIQUE(tenant_id))
        await client.query(
            `INSERT INTO configuracion (tenant_id, nombreempresa, isv, descuento_tercera_edad, isv_tasa_general)
             VALUES ($1, $2, 15.00, 25.00, 15.00)
             ON CONFLICT (tenant_id) DO NOTHING`,
            [tenant.id, nombre_empresa]
        );

        // 3. Default roles
        const rolesResult = await client.query(
            `INSERT INTO roles (nombre, tenant_id)
             VALUES ('Administrador', $1), ('Cajero', $1), ('Bodeguero', $1)
             RETURNING idrol, nombre`,
            [tenant.id]
        );
        const adminRole = rolesResult.rows.find(r => r.nombre === 'Administrador');

        // 4. All permissions for Administrador
        if (adminRole) {
            await client.query(
                `INSERT INTO rol_permisos (idRol, idPermiso)
                 SELECT $1, idPermiso FROM permisos ON CONFLICT DO NOTHING`,
                [adminRole.idrol]
            );
        }

        // 5. Create admin user (requires password change on first login)
        const bcrypt = require('bcryptjs');
        const hashed = await bcrypt.hash(admin_password, 12);
        await client.query(
            `INSERT INTO usuarios (usuario, password, idrol, estado, tenant_id, requires_password_change)
             VALUES ($1, $2, $3, 'Activo', $4, FALSE)`,
            [admin_email, hashed, adminRole?.idrol, tenant.id]
        );

        // 6. Default branch
        await client.query(
            `INSERT INTO sucursales (codigo, nombre, estado, tenant_id)
             VALUES ('SUC-001', 'Sucursal Principal', 'Activa', $1)
             ON CONFLICT DO NOTHING`,
            [tenant.id]
        );

        await client.query('COMMIT');

        res.status(201).json({
            data: {
                tenant,
                trial_days: trialDays,
                trial_ends: fechaVencimiento.toISOString(),
            },
            message: `Clinica '${nombre_empresa}' registrada correctamente. Su período de prueba de ${trialDays} días comienza ahora.`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            if (err.constraint === 'tenants_slug_key') {
                return res.status(409).json({ error: `El slug '${slug}' ya está en uso. Por favor elige otro.` });
            }
            if (err.constraint === 'usuarios_usuario_key') {
                return res.status(409).json({ error: `El correo '${req.body.admin_email}' ya está registrado. Use otro correo.` });
            }
            return res.status(409).json({ error: 'Conflicto de datos únicos. Verifique slug y correo.', detail: err.constraint });
        }
        handleDbError(res, err);
    } finally {
        client.release();
    }
});

module.exports = router;
