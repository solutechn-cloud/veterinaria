'use strict';

const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const { pool, withRequestTenant } = require('../config/db');
const { authenticateToken, requireTenant, JWT_SECRET } = require('../middleware/auth');
const { resolveTenantBySlug, requireTenantFromJWT, getTenantBySlug } = require('../middleware/tenant');
const {
    REFRESH_SECRET,
    REFRESH_COOKIE_NAME,
    setRefreshCookie,
    clearRefreshCookie,
    readCookie,
} = require('../middleware/cookieAuth');
const { getFeaturesForPlan } = require('../services/planFeaturesCache');

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Intente de nuevo en 15 minutos.' },
});

// Registers a login attempt via SP with manual fallback (tenant-scoped)
async function _registrarIntentoLogin(usuario, exitoso, ip, userAgent, tenantId = null) {
    const safeIp = (ip && ip !== '::1' && ip !== '::ffff:127.0.0.1') ? ip : '127.0.0.1';
    try {
        const spRes = await pool.query(
            `SELECT sp_registrar_intento_login($1, $2, $3::inet, $4, $5) AS resultado`,
            [usuario, exitoso, safeIp, userAgent || null, tenantId]
        );
        const resultado = spRes.rows[0]?.resultado;
        if (resultado && resultado.bloqueado) {
            console.warn(`Usuario bloqueado por intentos fallidos: ${usuario} desde IP ${safeIp}`);
        }
    } catch (spErr) {
        try {
            await pool.query(
                `INSERT INTO login_intentos(usuario, ip_address, exitoso, user_agent, tenant_id)
                 VALUES ($1, $2::inet, $3, $4, $5)`,
                [usuario, safeIp, exitoso, userAgent || null, tenantId]
            );
            const tenantFilter = tenantId ? ' AND tenant_id = $2' : '';
            if (!exitoso) {
                await pool.query(
                    `UPDATE usuarios SET
                         intentos_fallidos = COALESCE(intentos_fallidos, 0) + 1,
                         bloqueado_hasta = CASE
                             WHEN COALESCE(intentos_fallidos, 0) + 1 >= 5
                             THEN NOW() + INTERVAL '15 minutes'
                             ELSE bloqueado_hasta
                         END
                     WHERE usuario = $1${tenantFilter}`,
                    tenantId ? [usuario, tenantId] : [usuario]
                );
            } else {
                await pool.query(
                    `UPDATE usuarios SET intentos_fallidos = 0, ultimo_login = NOW()
                     WHERE usuario = $1${tenantFilter}`,
                    tenantId ? [usuario, tenantId] : [usuario]
                );
            }
        } catch (fallbackErr) {
            console.error('Error registrando intento de login:', fallbackErr.message);
        }
    }
}

// POST /api/auth/login
router.post('/login', authLimiter, resolveTenantBySlug, async (req, res) => {
    const { usuario, password, tenantSlug } = req.body;
    if (!usuario || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    const clientIp = req.ip || req.socket.remoteAddress || '0.0.0.0';
    console.log(`[LOGIN] Intento: usuario="${usuario}" slug="${tenantSlug}" ip=${clientIp}`);

    let resolvedTenantId   = req.tenantId   || null;
    let resolvedTenantSlug = req.tenant?.slug || tenantSlug || null;

    if (!resolvedTenantId && tenantSlug) {
        try {
            const tenant = await getTenantBySlug(tenantSlug);
            if (tenant) {
                if (tenant.estado === 'suspendido') {
                    return res.status(403).json({ error: 'La cuenta de la clinica está suspendida. Contacte al administrador.' });
                }
                if (tenant.estado === 'cancelado') {
                    return res.status(403).json({ error: 'La cuenta de la clinica fue cancelada.' });
                }
                if (tenant.fecha_vencimiento && new Date(tenant.fecha_vencimiento) < new Date()) {
                    return res.status(403).json({ error: 'La suscripción de la clinica ha vencido. Contacte al administrador.' });
                }
                resolvedTenantId   = tenant.id;
                resolvedTenantSlug = tenant.slug;
            }
        } catch (e) {
            console.error('Tenant lookup error on login:', e.message);
        }
    }

    if (!resolvedTenantId) {
        return res.status(400).json({ error: 'tenantSlug es requerido para iniciar sesión' });
    }

    try {
        const result = await pool.query(`
            SELECT u.codUsuario as "codUsuario", u.usuario, u.password, u.identidad,
                   u.idCaja as "idCaja", u.idrol, u.estado,
                   u.id_sucursal as "idSucursal",
                   u.bloqueado_hasta as "bloqueadoHasta",
                   COALESCE(u.requires_password_change, FALSE) as "requiresPasswordChange",
                   r.nombre as "rol_nombre", e.nombre as "emp_nombre", e.apellido as "emp_apellido",
                   s.nombre as "sucursal_nombre"
            FROM usuarios u
            LEFT JOIN roles r ON u.idrol = r.idrol AND r.tenant_id = u.tenant_id
            LEFT JOIN empleado e ON u.identidad = e.identidad AND e.tenant_id = u.tenant_id
            LEFT JOIN sucursales s ON u.id_sucursal = s.id_sucursal AND s.tenant_id = u.tenant_id
            WHERE u.usuario = $1 AND u.tenant_id = $2
        `, [usuario, resolvedTenantId]);

        const userRaw = result.rows[0];
        if (!userRaw) {
            await _registrarIntentoLogin(usuario, false, clientIp, req.headers['user-agent'], resolvedTenantId);
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        if (userRaw.bloqueadoHasta && new Date(userRaw.bloqueadoHasta) > new Date()) {
            const minutosRestantes = Math.ceil((new Date(userRaw.bloqueadoHasta) - new Date()) / 60000);
            return res.status(429).json({
                error: `Cuenta bloqueada temporalmente. Intente de nuevo en ${minutosRestantes} minuto(s).`
            });
        }

        if (userRaw.estado !== 'Activo') {
            return res.status(403).json({ error: 'Cuenta inactiva. Contacte al administrador.' });
        }

        const validPassword = userRaw.password?.startsWith('$2a$') || userRaw.password?.startsWith('$2b$')
            ? await bcrypt.compare(password, userRaw.password)
            : false;

        if (!validPassword) {
            await _registrarIntentoLogin(usuario, false, clientIp, req.headers['user-agent'], resolvedTenantId);
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        await _registrarIntentoLogin(usuario, true, clientIp, req.headers['user-agent'], resolvedTenantId);

        const permResult = await pool.query(
            `SELECT idPermiso FROM rol_permisos
             WHERE idRol = $1
               AND idRol IN (SELECT idrol FROM roles WHERE tenant_id = $2)`,
            [userRaw.idrol, resolvedTenantId]
        );
        const permisos = permResult.rows.map(r => r.idpermiso);

        // Cargar plan del tenant + features disponibles para el plan
        const tenantPlanRow = await pool.query('SELECT plan FROM tenants WHERE id=$1', [resolvedTenantId]);
        const tenantPlan = tenantPlanRow.rows[0]?.plan || 'basico';
        const planFeatures = await getFeaturesForPlan(tenantPlan);

        const userData = {
            codUsuario: userRaw.codUsuario,
            usuario: userRaw.usuario,
            rol: userRaw.rol_nombre || 'Sin Rol',
            idCaja: userRaw.idCaja || 'Sin Caja',
            id_sucursal: userRaw.idSucursal || null,
            sucursal_nombre: userRaw.sucursal_nombre || null,
            nombreEmpleado: userRaw.emp_nombre ? `${userRaw.emp_nombre} ${userRaw.emp_apellido}` : 'Empleado',
            permisos,
            requiresPasswordChange: userRaw.requiresPasswordChange || false,
            tenantId: resolvedTenantId,
            tenantSlug: resolvedTenantSlug,
            tenantPlan,
            planFeatures,
        };

        const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '8h' });
        const refreshToken = jwt.sign(
            { codUsuario: userData.codUsuario, tenantId: resolvedTenantId, tokenType: 'refresh' },
            REFRESH_SECRET,
            { expiresIn: '7d' }
        );
        setRefreshCookie(res, refreshToken);
        res.json({ token, user: userData });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/auth/refresh
router.post('/refresh', authLimiter, async (req, res) => {
    const refreshToken = readCookie(req, REFRESH_COOKIE_NAME) || req.body?.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token requerido' });
    try {
        const decoded = jwt.verify(refreshToken, REFRESH_SECRET, { algorithms: ['HS256'] });
        if (decoded.tokenType !== 'refresh') return res.status(403).json({ error: 'Token inválido' });

        const result = await pool.query(`
            SELECT u.codUsuario as "codUsuario", u.usuario, u.identidad,
                   u.idCaja as "idCaja", u.idrol, u.estado, u.tenant_id as "tenantId",
                   u.id_sucursal as "idSucursal",
                   r.nombre as "rol_nombre", e.nombre as "emp_nombre", e.apellido as "emp_apellido",
                   s.nombre as "sucursal_nombre", t.slug as "tenantSlug"
            FROM usuarios u
            LEFT JOIN roles r ON u.idrol = r.idrol AND r.tenant_id = u.tenant_id
            LEFT JOIN empleado e ON u.identidad = e.identidad AND e.tenant_id = u.tenant_id
            LEFT JOIN sucursales s ON u.id_sucursal = s.id_sucursal AND s.tenant_id = u.tenant_id
            LEFT JOIN tenants t ON t.id = u.tenant_id
            WHERE u.codUsuario = $1 AND u.tenant_id = $2 AND u.estado = 'Activo'
        `, [decoded.codUsuario, decoded.tenantId]);

        const userRaw = result.rows[0];
        if (!userRaw) return res.status(403).json({ error: 'Usuario no encontrado o inactivo' });

        const tenantIdForCheck = decoded.tenantId || userRaw.tenantId || null;
        if (tenantIdForCheck) {
            const tenantCheck = await pool.query(
                `SELECT estado, fecha_vencimiento FROM tenants WHERE id = $1`,
                [tenantIdForCheck]
            );
            const t = tenantCheck.rows[0];
            if (!t || t.estado === 'suspendido' || t.estado === 'cancelado') {
                return res.status(403).json({ error: 'Acceso suspendido. Contacte al administrador.' });
            }
            if (t.fecha_vencimiento && new Date(t.fecha_vencimiento) < new Date()) {
                return res.status(402).json({ error: 'Suscripción vencida. Renueve su plan.' });
            }
        }

        const permResult = await pool.query(
            `SELECT idPermiso FROM rol_permisos
             WHERE idRol = $1
               AND idRol IN (SELECT idrol FROM roles WHERE tenant_id = $2)`,
            [userRaw.idrol, tenantIdForCheck]
        );
        const permisos = permResult.rows.map(r => r.idpermiso);
        const tenantId = decoded.tenantId || userRaw.tenantId || null;

        // Cargar plan del tenant + features
        const tenantPlanRow2 = await pool.query('SELECT plan FROM tenants WHERE id=$1', [tenantId]);
        const tenantPlan2 = tenantPlanRow2.rows[0]?.plan || 'basico';
        const planFeatures2 = await getFeaturesForPlan(tenantPlan2);

        const userData = {
            codUsuario: userRaw.codUsuario,
            usuario: userRaw.usuario,
            rol: userRaw.rol_nombre || 'Sin Rol',
            idCaja: userRaw.idCaja || 'Sin Caja',
            id_sucursal: userRaw.idSucursal || null,
            sucursal_nombre: userRaw.sucursal_nombre || null,
            nombreEmpleado: userRaw.emp_nombre ? `${userRaw.emp_nombre} ${userRaw.emp_apellido}` : 'Empleado',
            permisos,
            tenantId,
            tenantSlug: userRaw.tenantSlug || null,
            tenantPlan: tenantPlan2,
            planFeatures: planFeatures2,
        };

        const newToken = jwt.sign(userData, JWT_SECRET, { expiresIn: '8h' });
        const nextRefreshToken = jwt.sign(
            { codUsuario: userData.codUsuario, tenantId, tokenType: 'refresh' },
            REFRESH_SECRET,
            { expiresIn: '7d' }
        );
        setRefreshCookie(res, nextRefreshToken);
        res.json({ token: newToken, user: userData });
    } catch (err) {
        res.status(403).json({ error: 'Refresh token inválido o expirado' });
    }
});

// POST /api/auth/logout
router.post('/logout', authLimiter, (req, res) => {
    clearRefreshCookie(res);
    res.status(204).end();
});

// POST /api/auth/change-password
router.post(
    '/change-password',
    authenticateToken,
    requireTenantFromJWT,
    requireTenant,
    (req, res, next) => withRequestTenant(req.tenantId, req, res, next),
    async (req, res) => {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Se requieren contraseña actual y nueva' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
        }
        if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
            return res.status(400).json({ error: 'La contraseña debe contener al menos una mayúscula y un número' });
        }
        try {
            const result = await pool.query(
                'SELECT password FROM usuarios WHERE codUsuario = $1 AND tenant_id = $2',
                [req.user.codUsuario, req.tenantId]
            );
            const userRaw = result.rows[0];
            if (!userRaw) return res.status(404).json({ error: 'Usuario no encontrado' });

            const valid = userRaw.password?.startsWith('$2a$') || userRaw.password?.startsWith('$2b$')
                ? await bcrypt.compare(currentPassword, userRaw.password)
                : false;
            if (!valid) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });

            const hashed = await bcrypt.hash(newPassword, 12);
            await pool.query(
                `UPDATE usuarios SET password = $1, requires_password_change = FALSE,
                 password_changed_at = NOW() WHERE codUsuario = $2 AND tenant_id = $3`,
                [hashed, req.user.codUsuario, req.tenantId]
            );
            res.json({ message: 'Contraseña actualizada correctamente' });
        } catch (err) {
            console.error('Change password error:', err.message);
            res.status(500).json({ error: 'Error interno' });
        }
    }
);

module.exports = router;
