const { planHasFeature } = require('../services/planFeaturesCache');

// Mapa de rutas → feature key requerida
const ROUTE_PLAN_FEATURES = [
    { pattern: /^\/api\/loyalty\b/,              feature: 'modulo_lealtad' },
    { pattern: /^\/api\/transferencias\b/,       feature: 'modulo_transferencias' },
    { pattern: /^\/api\/entregas\b/,             feature: 'modulo_entregas' },
    { pattern: /^\/api\/sucursales\b/,           feature: 'modulo_sucursales' },
    { pattern: /^\/api\/ordenes-compra\b/,       feature: 'modulo_ordenes_compra' },
    { pattern: /^\/api\/accounting\b/,           feature: 'modulo_contabilidad' },
    { pattern: /^\/api\/labels\b/,               feature: 'modulo_etiquetas' },
    { pattern: /^\/api\/schema\b/,               feature: 'modulo_etiquetas' },
    { pattern: /^\/api\/proveedores\b/,          feature: 'modulo_proveedores' },
    { pattern: /^\/api\/admin\/boxes\b/,         feature: 'modulo_panel_cajas' },
    { pattern: /^\/api\/admin\/arqueo\b/,        feature: 'modulo_panel_cajas' },
    { pattern: /^\/api\/tutores\b/,              feature: 'modulo_pacientes' },
    { pattern: /^\/api\/pacientes\b/,            feature: 'modulo_pacientes' },
    { pattern: /^\/api\/citas\b/,                feature: 'modulo_citas' },
    { pattern: /^\/api\/tipos-cita\b/,           feature: 'modulo_citas' },
    { pattern: /^\/api\/consultas\b/,            feature: 'modulo_expediente' },
    { pattern: /^\/api\/vacunas\b/,              feature: 'modulo_vacunas' },
    { pattern: /^\/api\/recordatorios\b/,        feature: 'modulo_recordatorios' },
    { pattern: /^\/api\/clinica\/flowboard\b/,   feature: 'modulo_hospitalizacion' },
];

const PLAN_ORDER = ['basico', 'profesional', 'enterprise'];

async function planFeatureGuard(req, res, next) {
    const url = req.originalUrl.split('?')[0];
    const rule = ROUTE_PLAN_FEATURES.find(r => r.pattern.test(url));
    if (!rule) return next(); // ruta no gateada → pasar

    // SuperAdmin bypasa todo
    if (req.user?.isSuperAdmin) return next();

    const tenantPlan = req.user?.tenantPlan;
    if (!tenantPlan) {
        // Si no hay plan en el token, es un token antiguo → dejar pasar con degradación
        // (no bloquear usuarios existentes hasta que renueven sesión)
        return next();
    }

    if (await planHasFeature(tenantPlan, rule.feature)) return next();

    // Encontrar el plan mínimo que incluye la feature
    let minimumPlan = null;
    for (const p of PLAN_ORDER) {
        if (await planHasFeature(p, rule.feature)) { minimumPlan = p; break; }
    }

    return res.status(403).json({
        error: `Módulo no disponible en el plan "${tenantPlan}"`,
        code: 'PLAN_FEATURE_REQUIRED',
        requiredFeature: rule.feature,
        currentPlan: tenantPlan,
        minimumPlan,
        upgradeRequired: true,
    });
}

module.exports = { planFeatureGuard, ROUTE_PLAN_FEATURES };
