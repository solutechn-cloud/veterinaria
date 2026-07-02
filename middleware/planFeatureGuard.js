const { planHasFeature, tenantHasFeature } = require('../services/planFeaturesCache');

const ROUTE_PLAN_FEATURES = [
    { pattern: /^\/api\/loyalty\b/, feature: 'modulo_lealtad' },
    { pattern: /^\/api\/transferencias\b/, feature: 'modulo_transferencias' },
    { pattern: /^\/api\/entregas\b/, feature: 'modulo_entregas' },
    { pattern: /^\/api\/sucursales\b/, methods: ['POST'], feature: 'modulo_sucursales' },
    { pattern: /^\/api\/ordenes-compra\b/, feature: 'modulo_ordenes_compra' },
    { pattern: /^\/api\/accounting\b/, feature: 'modulo_contabilidad' },
    { pattern: /^\/api\/labels\b/, feature: 'modulo_etiquetas' },
    { pattern: /^\/api\/schema\b/, feature: 'modulo_etiquetas' },
    { pattern: /^\/api\/proveedores\b/, feature: 'modulo_proveedores' },
    { pattern: /^\/api\/admin\/boxes\b/, feature: 'modulo_panel_cajas' },
    { pattern: /^\/api\/admin\/arqueo\b/, feature: 'modulo_panel_cajas' },
    { pattern: /^\/api\/tutores\b/, feature: 'modulo_pacientes' },
    { pattern: /^\/api\/pacientes\b/, feature: 'modulo_pacientes' },
    { pattern: /^\/api\/citas\b/, feature: 'modulo_citas' },
    { pattern: /^\/api\/tipos-cita\b/, feature: 'modulo_citas' },
    { pattern: /^\/api\/consultas\b/, feature: 'modulo_expediente' },
    { pattern: /^\/api\/vacunas\b/, feature: 'modulo_vacunas' },
    { pattern: /^\/api\/recordatorios\b/, feature: 'modulo_recordatorios' },
    { pattern: /^\/api\/clinica\/flowboard\b/, feature: 'modulo_hospitalizacion' },
    { pattern: /^\/api\/consultorio\b/, feature: 'modulo_consultorio' },
    { pattern: /^\/api\/messaging\b/, feature: 'modulo_mensajeria' },
];

const PLAN_ORDER = ['basico', 'profesional', 'enterprise'];

async function planFeatureGuard(req, res, next) {
    const url = req.originalUrl.split('?')[0];
    const method = String(req.method || '').toUpperCase();
    const rule = ROUTE_PLAN_FEATURES.find(r =>
        r.pattern.test(url)
        && (!Array.isArray(r.methods) || r.methods.map(m => String(m).toUpperCase()).includes(method))
    );
    if (!rule) return next();
    if (req.user?.isSuperAdmin) return next();

    const tenantPlan = req.user?.tenantPlan || null;
    const tenantId = req.tenantId || req.user?.tenantId || null;

    if (await tenantHasFeature(tenantId, tenantPlan, rule.feature)) return next();

    let minimumPlan = null;
    for (const plan of PLAN_ORDER) {
        if (await planHasFeature(plan, rule.feature)) {
            minimumPlan = plan;
            break;
        }
    }

    return res.status(403).json({
        error: `Modulo no disponible en el plan "${tenantPlan || 'actual'}"`,
        code: 'PLAN_FEATURE_REQUIRED',
        requiredFeature: rule.feature,
        currentPlan: tenantPlan,
        minimumPlan,
        upgradeRequired: true,
    });
}

module.exports = { planFeatureGuard, ROUTE_PLAN_FEATURES };
