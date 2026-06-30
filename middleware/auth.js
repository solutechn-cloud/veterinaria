
'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET no está configurado. El servidor no puede arrancar de forma segura.');
    process.exit(1);
}
if (Buffer.byteLength(JWT_SECRET, 'utf8') < 32) {
    console.error('[FATAL] JWT_SECRET debe tener al menos 32 bytes (256 bits) de entropía.');
    process.exit(1);
}

// Shared password complexity validator — used by login and admin reset
function validatePasswordStrength(pw) {
    if (!pw || pw.length < 8)    return 'La contraseña debe tener al menos 8 caracteres';
    if (!/[A-Z]/.test(pw))       return 'Debe contener al menos una mayúscula';
    if (!/[0-9]/.test(pw))       return 'Debe contener al menos un número';
    return null;
}

const requireAdmin = (req, res, next) => {
    const rolLower = req.user?.rol?.toLowerCase();
    if (!req.user || (rolLower !== 'administrador' && rolLower !== 'admin' && rolLower !== 'superadmin')) {
        return res.status(403).json({ error: 'Acceso denegado: se requiere rol de administrador' });
    }
    next();
};

/**
 * Verifies the Bearer JWT and attaches req.user.
 * Algorithm pinned to HS256 to prevent "none" algorithm attacks.
 * Also sets req.tenantId from the token payload when present.
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Token de autenticación requerido' });

    jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Sesión expirada', code: 'TOKEN_EXPIRED' });
            }
            return res.status(403).json({ error: 'Token inválido', code: 'TOKEN_INVALID' });
        }
        req.user = user;
        req.tenantId = user.tenantId || null;
        // Use Express sanitized req.ip (requires app.set('trust proxy', N))
        req.clientIp = req.ip || req.socket.remoteAddress;
        next();
    });
};

/**
 * Middleware: ensures req.tenantId is present (set by authenticateToken).
 * Use after authenticateToken on routes that require tenant context.
 */
const requireTenant = (req, res, next) => {
    if (!req.tenantId) {
        return res.status(400).json({ error: 'Contexto de clinica no disponible. Vuelva a iniciar sesión.' });
    }
    next();
};

module.exports = { authenticateToken, requireAdmin, requireTenant, validatePasswordStrength, JWT_SECRET };
