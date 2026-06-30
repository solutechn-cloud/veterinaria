
'use strict';

require('dotenv').config();

// Prevent process crashes from unhandled ECONNRESET on pg Client instances.
// This race condition exists in pg ≤8.x: the TLS error fires on the Client
// before pg-pool attaches its own 'error' listener during connect().
// Genuine fatal errors still exit.
process.on('uncaughtException', (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNREFUSED') {
        console.error('[DB] Error de conexión (recuperable):', err.code, '-', err.message);
        return;
    }
    console.error('[FATAL] Excepción no manejada:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('[WARN] Promise no manejada:', reason);
});
const { startCronJobs } = require('./services/cronJobs');
const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Config & Middleware
const { pool, withRequestTenant } = require('./config/db');
const { runMigrations } = require('./config/migrations');
const { authenticateToken, requireTenant } = require('./middleware/auth');
const { requireTenantFromJWT, requireSuperAdmin } = require('./middleware/tenant');
const { endpointPermissionGuard } = require('./middleware/permissions');
const { planFeatureGuard } = require('./middleware/planFeatureGuard');
const planFeaturesCache = require('./services/planFeaturesCache');

// Routes

const adminRoutes        = require('./routes/adminRoutes');
const inventoryRoutes    = require('./routes/inventoryRoutes');
const medicamentosRoutes = require('./routes/medicamentosRoutes');
const sucursalesRoutes   = require('./routes/sucursalesRoutes');
const salesRoutes        = require('./routes/salesRoutes');
const financeRoutes      = require('./routes/financeRoutes');
const reportsRoutes      = require('./routes/reportsRoutes');
const labelRoutes        = require('./routes/labelRoutes');
const accountingRoutes   = require('./routes/accountingRoutes');
const notifRoutes        = require('./routes/notificationRoutes');
const aiRoutes           = require('./routes/aiRoutes');
const dashboardRoutes    = require('./routes/dashboardRoutes');
const entregasRoutes     = require('./routes/entregasRoutes');
const loyaltyRoutes      = require('./routes/loyaltyRoutes');
const veterinaryRoutes   = require('./routes/veterinaryRoutes');

// SaaS Routes
const { router: saasAuthRoutes } = require('./routes/saasAuthRoutes');
const tenantRoutes    = require('./routes/tenantRoutes');
const publicRoutes    = require('./routes/publicRoutes');
const internalAuthRoutes = require('./routes/internalAuthRoutes');

const app  = express();
const port = process.env.PORT || 3000;

// Trust the first proxy so req.ip is the real client IP (not the proxy IP)
app.set('trust proxy', 1);

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.protocol !== 'https') {
            return res.redirect(301, `https://${req.hostname}${req.url}`);
        }
        next();
    });
}

// --- Rate limiter: per-tenant (auth limiter lives in internalAuthRoutes.js) ---
const tenantRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const tenant = req.tenantId || 'anon';
        const ip = req.clientIp || req.socket.remoteAddress || 'unknown';
        return `${tenant}:${ip}:${req.path}`;
    },
    message: { error: 'Demasiadas solicitudes. Intente de nuevo en un minuto.' },
});

// --- CORS ---
const _configuredOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];

// In non-production, always allow localhost regardless of ALLOWED_ORIGINS so the
// dev server (port 5173) and the API server (port 3000) can talk without CORS errors.
const _localOrigins = process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://localhost:5173',
       'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

const _fallback = _configuredOrigins.length === 0 && _localOrigins.length === 0
    ? ['http://localhost:3000', 'http://localhost:5173']
    : [];

const allowedOrigins = [...new Set([..._configuredOrigins, ..._localOrigins, ..._fallback])];

if (process.env.NODE_ENV === 'production' && _configuredOrigins.length === 0) {
    console.error('[FATAL] ALLOWED_ORIGINS debe estar configurado en production.');
    process.exit(1);
}

app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) cb(null, true);
        else {
            console.warn(`[CORS] Origen bloqueado: ${origin}`);
            cb(new Error('CORS: origen no permitido'));
        }
    },
    credentials: true,
}));

// --- Security headers ---
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.r2.dev; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
    );
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
});

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '15mb' }));

app.get('/healthz', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({
            status: 'ok',
            db: 'ok',
            uptime: Math.round(process.uptime()),
        });
    } catch (err) {
        console.error('[healthz] DB check failed:', err.message);
        res.status(503).json({ status: 'error', db: 'unavailable' });
    }
});

function mountRoutes() {
    // Public routes (no auth)
    app.use('/api/public', publicRoutes);

    // SaaS admin login (no auth needed on the login endpoint itself)
    app.use('/api/saas', saasAuthRoutes);

    // SaaS tenant management - requireSuperAdmin verifies SAAS_SUPER_SECRET independently
    app.use('/api/saas', requireSuperAdmin, tenantRoutes);

    app.use('/api/auth', internalAuthRoutes);

    // Propagates req.tenantId into AsyncLocalStorage so every pool.query() in the
    // async call chain automatically sets app.current_tenant_id for PostgreSQL RLS.
    const withTenant = (req, res, next) => withRequestTenant(req.tenantId, req, res, next);

    // Single authenticated router — all protected routes share ONE middleware chain so
    // rate-limiter and other middleware only add event listeners once per request.
    const apiRouter = express.Router();
    apiRouter.use(authenticateToken, requireTenantFromJWT, requireTenant, tenantRateLimiter, withTenant, planFeatureGuard, endpointPermissionGuard);
    apiRouter.use(adminRoutes);
    apiRouter.use(medicamentosRoutes);
    apiRouter.use(sucursalesRoutes);
    apiRouter.use(inventoryRoutes);
    apiRouter.use(salesRoutes);
    apiRouter.use(financeRoutes);
    apiRouter.use(dashboardRoutes);
    apiRouter.use(reportsRoutes);
    apiRouter.use(labelRoutes);
    apiRouter.use('/accounting', accountingRoutes);
    apiRouter.use(notifRoutes);
    apiRouter.use(entregasRoutes);
    apiRouter.use(loyaltyRoutes);
    apiRouter.use(veterinaryRoutes);
    apiRouter.use('/ai', aiRoutes);
    app.use('/api', apiRouter);

    if (process.env.NODE_ENV === 'production') {
        app.get('*.map', (req, res) => res.status(404).end());
    }
    app.use(express.static(path.join(__dirname, 'build')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'build', 'index.html')));

}

async function startServer() {
    try {
        await runMigrations(pool);
        mountRoutes();

        const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : (process.env.HOST || '127.0.0.1');
        app.listen(port, host, () => {
            console.log(`ERP Veterinaria SaaS running on ${host}:${port}`);
            startCronJobs();
            planFeaturesCache.load().catch(err => console.error('[planFeatures] Error al cargar cache inicial:', err.message));
            console.log('[server] Cron jobs iniciados.');
        });
    } catch (err) {
        console.error('[FATAL] Error running migrations:', err);
        process.exit(1);
    }
}

startServer();
