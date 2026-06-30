
'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkAIQuota, getTenantLimits, getCurrentUsage } = require('../middleware/aiQuota');
const { pool } = require('../config/db');
const medicationVisionService = require('../services/ai/medicationVisionService');
const medicationRecommendationService = require('../services/ai/medicationRecommendationService');
const {
    PROCESS_INTERACTIONS, PROCESS_CLIENT_ANALYSIS, PROCESS_CASH_ANOMALY, PROCESS_RESTOCK_PREDICTION,
    PROCESS_MEDICATION_INTAKE, PROCESS_SYMPTOM_RECOMMENDATION,
    getProcessSettings, callProvider,
} = require('../services/ai/providerRegistry');

function hasPermission(req, permission) {
    const role = String(req.user?.rol || '').toLowerCase();
    if (role === 'administrador' || role === 'admin' || role === 'superadmin') return true;
    return Array.isArray(req.user?.permisos) && req.user.permisos.includes(permission);
}

// Inject req.aiProcessKey for quota middleware
const withKey = (key) => (req, _res, next) => { req.aiProcessKey = key; next(); };

function currentPeriod() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Tegucigalpa' }).slice(0, 7);
}

// GET /api/ai/quota/status
// Devuelve el estado de cuota IA del tenant autenticado.
router.get('/quota/status', authenticateToken, async (req, res) => {
    try {
        const tenantId = req.tenantId;
        if (!tenantId) return res.status(400).json({ error: 'Tenant requerido' });

        const [limits, usage] = await Promise.all([
            getTenantLimits(tenantId),
            getCurrentUsage(tenantId, currentPeriod()),
        ]);

        if (!limits) return res.status(404).json({ error: 'Plan de cuota no encontrado' });

        const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Tegucigalpa' });
        const requests_hoy = usage.fecha_reset_diario === hoy ? usage.requests_hoy : 0;
        const pct_tokens = limits.tokens_limite > 0
            ? Math.round(Number(usage.tokens_consumidos) * 100 / Number(limits.tokens_limite) * 10) / 10
            : 0;
        const estado = !limits.ai_habilitado ? 'deshabilitado'
            : pct_tokens >= 100 ? 'agotado'
            : pct_tokens >= 80 ? 'alerta'
            : 'ok';

        res.json({
            plan: limits.plan,
            ai_habilitado: limits.ai_habilitado,
            periodo: currentPeriod(),
            tokens_consumidos: Number(usage.tokens_consumidos),
            tokens_limite: Number(limits.tokens_limite),
            pct_tokens_usado: pct_tokens,
            requests_totales: Number(usage.requests_totales),
            requests_limite: Number(limits.requests_limite),
            requests_hoy,
            req_diario_limite: Number(limits.req_diario_limite),
            procesos_habilitados: limits.procesos_habilitados,
            estado,
        });
    } catch (err) {
        console.error('[AI] quota/status error:', err.message);
        res.status(500).json({ error: 'Error obteniendo estado de cuota' });
    }
});

// POST /api/ai/medicamentos/analyze-images
router.post('/medicamentos/analyze-images', authenticateToken, withKey(PROCESS_MEDICATION_INTAKE), checkAIQuota, async (req, res) => {
    try {
        if (!hasPermission(req, 'VER_INVENTARIO')) {
            return res.status(403).json({ error: 'Acceso denegado: permiso insuficiente', requiredPermission: 'VER_INVENTARIO' });
        }
        const { images, imageIds, context } = req.body || {};
        const result = await medicationVisionService.analyzeMedicationImages({
            images,
            imageIds,
            context,
            tenantId: req.tenantId,
            userId: req.user?.codUsuario || null,
        });
        res.json(result);
    } catch (err) {
        console.error('AI medicamentos analyze-images error:', err.message);
        res.status(err.statusCode || 500).json({
            error: err.statusCode ? err.message : 'No se pudo analizar el medicamento con IA',
        });
    }
});

// POST /api/ai/recommendations/symptoms
router.post('/recommendations/symptoms', authenticateToken, withKey(PROCESS_SYMPTOM_RECOMMENDATION), checkAIQuota, async (req, res) => {
    try {
        const result = await medicationRecommendationService.recommendBySymptoms({
            body: req.body || {},
            tenantId: req.tenantId,
            user: req.user || {},
        });
        res.json(result);
    } catch (err) {
        console.error('AI recommendations symptoms error:', err.message);
        res.status(err.statusCode || 500).json({
            error: err.statusCode ? err.message : 'No se pudo generar la recomendacion con IA',
        });
    }
});

// POST /api/ai/recomendar-por-sintomas (legacy)
router.post('/recomendar-por-sintomas', authenticateToken, withKey(PROCESS_SYMPTOM_RECOMMENDATION), checkAIQuota, async (req, res) => {
    try {
        const legacyResult = await medicationRecommendationService.recommendBySymptoms({
            body: {
                symptoms: req.body?.symptoms || req.body?.sintomas,
                ageRange: req.body?.ageRange || req.body?.rango_edad || 'desconocido',
                pregnant: req.body?.pregnant || req.body?.embarazada,
                allergies: req.body?.allergies || req.body?.alergias,
                currentMedications: req.body?.currentMedications || req.body?.medicamentos_actuales,
                chronicConditions: req.body?.chronicConditions || req.body?.condiciones_cronicas,
                id_sucursal: req.body?.id_sucursal,
            },
            tenantId: req.tenantId,
            user: req.user || {},
        });
        res.json(legacyResult);
    } catch (err) {
        console.error('AI recomendar-por-sintomas error:', err.message);
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'No se pudo generar la recomendacion con IA' });
    }
});

// POST /api/ai/verificar-interacciones
router.post('/verificar-interacciones', authenticateToken, withKey(PROCESS_INTERACTIONS), checkAIQuota, async (req, res) => {
    try {
        const { medicamento_nuevo, id_cliente } = req.body;
        if (!medicamento_nuevo) return res.status(400).json({ error: 'medicamento_nuevo es requerido' });

        let medicamentosActuales = [];
        let alergias = [];

        if (id_cliente) {
            const clienteR = await pool.query(
                `SELECT medicamentos_habituales, alergias_conocidas FROM clientes WHERE identidad = $1 AND tenant_id = $2`,
                [id_cliente, req.tenantId]
            );
            if (clienteR.rows.length > 0) {
                const c = clienteR.rows[0];
                if (c.medicamentos_habituales) medicamentosActuales = c.medicamentos_habituales.split(',').map(s => s.trim()).filter(Boolean);
                if (c.alergias_conocidas) alergias = c.alergias_conocidas.split(',').map(s => s.trim()).filter(Boolean);
            }
        }

        if (medicamentosActuales.length === 0 && alergias.length === 0) {
            return res.json({ interacciones: [], nivel_riesgo_global: 'bajo', mensaje_veterinario: 'Sin medicamentos actuales registrados para verificar.' });
        }

        const settings = await getProcessSettings(PROCESS_INTERACTIONS, req.tenantId);
        const systemPrompt = `Eres un veterinario clinico experto en interacciones medicamentosas. Analiza si el medicamento nuevo puede interactuar con los actuales del paciente. Responde solo con el JSON especificado, en espanol.`;
        const userPrompt = `Medicamento NUEVO: ${medicamento_nuevo}\nMedicamentos ACTUALES: ${medicamentosActuales.join(', ') || 'ninguno'}\nAlergias: ${alergias.join(', ') || 'ninguna'}\n\nDevuelve exactamente:\n{"interacciones":[{"medicamento_involucrado":"","descripcion":"","nivel_severidad":"leve|moderada|grave","recomendacion":""}],"nivel_riesgo_global":"bajo|moderado|alto","alerta_alergia":false,"descripcion_alergia":null,"mensaje_veterinario":""}`;
        const { text } = await callProvider({ settings, systemPrompt, userPrompt, tenantId: req.tenantId });
        let parsed;
        try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
        res.json(parsed || { interacciones: [], nivel_riesgo_global: 'desconocido', mensaje_veterinario: text });
    } catch (err) {
        console.error('AI verificar-interacciones error:', err.message);
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Error interno' });
    }
});

// POST /api/ai/analizar-cliente
router.post('/analizar-cliente', authenticateToken, withKey(PROCESS_CLIENT_ANALYSIS), checkAIQuota, async (req, res) => {
    try {
        const { idCliente } = req.body;
        if (!idCliente) return res.status(400).json({ error: 'idCliente es requerido' });

        const [clienteR, comprasR, totalR] = await Promise.all([
            pool.query(`SELECT identidad, nombre, apellido, condiciones_cronicas, alergias_conocidas,
                               fecha_nacimiento, EXTRACT(YEAR FROM AGE(fecha_nacimiento)) >= 60 AS es_adulto_mayor
                        FROM clientes WHERE identidad = $1 AND tenant_id = $2`, [idCliente, req.tenantId]),
            pool.query(`SELECT v.fecha, dv.producto AS medicamento, dv.precioUnitario AS monto, dv.cantidad
                        FROM ventas v JOIN detalleventa dv ON v.codVenta = dv.idVenta
                        WHERE v.identidadCliente = $1 AND v.estado = 'Completada' AND v.tenant_id = $2
                        ORDER BY v.fecha DESC LIMIT 20`, [idCliente, req.tenantId]),
            pool.query(`SELECT COALESCE(SUM(v.total),0) AS "totalGastado", COALESCE(AVG(v.total),0) AS "promedioCompra", COUNT(DISTINCT v.codVenta) AS frecuencia
                        FROM ventas v WHERE v.identidadCliente = $1 AND v.estado = 'Completada' AND v.tenant_id = $2`, [idCliente, req.tenantId])
        ]);

        if (clienteR.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
        const cliente = clienteR.rows[0];
        const categoriasCompra = comprasR.rows.slice(0, 20).map(c => c.medicamento || 'producto').reduce((acc, m) => { acc[m] = (acc[m] || 0) + 1; return acc; }, {});

        const settings = await getProcessSettings(PROCESS_CLIENT_ANALYSIS, req.tenantId);
        const systemPrompt = `Eres un analista CRM para una clinica veterinaria en Honduras. Analiza el historial del cliente y sugiere acciones de fidelizacion. Responde solo con el JSON especificado, en espanol.`;
        const userPrompt = `Total gastado: L ${totalR.rows[0].totalGastado}\nPromedio: L ${totalR.rows[0].promedioCompra}\nFrecuencia: ${totalR.rows[0].frecuencia}\nProductos frecuentes: ${JSON.stringify(categoriasCompra)}\nCondiciones cronicas: ${cliente.condiciones_cronicas ? 'Si' : 'No'}\nAdulto mayor: ${cliente.es_adulto_mayor ? 'Si' : 'No'}\n\nDevuelve exactamente:\n{"resumen":"","perfil_cliente":"","medicamentos_frecuentes":[],"sugerencia_accion":"","valor_estimado_futuro":"","recordatorio_descuento":""}`;
        const { text } = await callProvider({ settings, systemPrompt, userPrompt, tenantId: req.tenantId });
        let parsed;
        try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
        res.json(parsed || { resumen: text, perfil_cliente: 'No determinado', sugerencia_accion: 'Revisar manualmente' });
    } catch (err) {
        console.error('AI analizar-cliente error:', err.message);
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Error interno' });
    }
});

// GET /api/ai/anomaly-check/:idArqueo
router.get('/anomaly-check/:idArqueo', authenticateToken, withKey(PROCESS_CASH_ANOMALY), checkAIQuota, async (req, res) => {
    try {
        const { idArqueo } = req.params;
        const arqueoR = await pool.query(
            `SELECT idArqueo, idCaja, fechaApertura AS fecha, montoInicial, totalVentas, TotalGastos AS "totalEgresos", ganancia
             FROM arqueo WHERE idArqueo = $1 AND tenant_id = $2`,
            [idArqueo, req.tenantId]
        );
        if (arqueoR.rows.length === 0) return res.status(404).json({ error: 'Arqueo no encontrado' });

        const arqueo = arqueoR.rows[0];
        const historialR = await pool.query(
            `SELECT fechaApertura AS fecha, montoInicial, totalVentas, TotalGastos AS totalegresos, ganancia
             FROM arqueo WHERE idCaja = $1 AND idArqueo != $2 AND estado = 'Cerrado' AND tenant_id = $3
             ORDER BY fechaApertura DESC LIMIT 30`,
            [arqueo.idcaja || arqueo.idCaja, idArqueo, req.tenantId]
        );

        const settings = await getProcessSettings(PROCESS_CASH_ANOMALY, req.tenantId);
        const systemPrompt = `Eres un auditor financiero para clinicas veterinarias en Honduras. Detecta anomalias en el cierre de caja comparando con el historico. Responde solo con el JSON especificado.`;
        const userPrompt = `Arqueo actual: Inicial L${arqueo.montoInicial} Ventas L${arqueo.totalVentas} Egresos L${arqueo.totalEgresos} Ganancia L${arqueo.ganancia}\nHistorico (${historialR.rows.length} cierres):\n${historialR.rows.slice(0,5).map(a => `- Ventas L${a.totalventas||0} Ganancia L${a.ganancia||0}`).join('\n')}\n\nDevuelve exactamente:\n{"es_anomal":false,"nivel_riesgo":"bajo","observaciones":"","recomendacion":""}`;
        const { text } = await callProvider({ settings, systemPrompt, userPrompt, tenantId: req.tenantId });
        let parsed;
        try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
        res.json(parsed || { es_anomal: false, nivel_riesgo: 'bajo', observaciones: text, recomendacion: 'Revisar manualmente' });
    } catch (err) {
        console.error('AI anomaly-check error:', err.message);
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Error interno' });
    }
});

// POST /api/ai/quota/request-upgrade
// Guarda una solicitud de ampliación de tokens y notifica al SaaS admin.
router.post('/quota/request-upgrade', authenticateToken, async (req, res) => {
    try {
        const tenantId = req.tenantId;
        if (!tenantId) return res.status(400).json({ error: 'Tenant requerido' });

        const { paquete_solicitado, motivo } = req.body || {};
        const PAQUETES_VALIDOS = ['+100K tokens', '+500K tokens', '+1M tokens', 'Plan Profesional', 'Plan Enterprise', 'Personalizado'];
        if (!paquete_solicitado || !PAQUETES_VALIDOS.includes(paquete_solicitado)) {
            return res.status(400).json({ error: 'Paquete solicitado inválido', opciones: PAQUETES_VALIDOS });
        }
        if (motivo && String(motivo).length > 1000) {
            return res.status(400).json({ error: 'El motivo no puede superar 1000 caracteres' });
        }

        const [limitsR, tenantR] = await Promise.all([
            getTenantLimits(tenantId),
            pool.query('SELECT slug, nombre_empresa, plan FROM tenants WHERE id = $1', [tenantId]),
        ]);
        const usage   = await getCurrentUsage(tenantId, currentPeriod());
        const limite  = Number(limitsR?.tokens_limite || 0);
        const consumido = Number(usage.tokens_consumidos || 0);
        const pct     = limite > 0 ? Math.round(consumido * 100 / limite * 10) / 10 : 0;
        const tenant  = tenantR.rows[0] || {};

        // Guardar solicitud en DB
        const { rows } = await pool.query(`
            INSERT INTO ai_upgrade_requests
                (tenant_id, plan_actual, tokens_consumidos, tokens_limite, pct_usado, paquete_solicitado, motivo)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING id, created_at
        `, [tenantId, tenant.plan, consumido, limite, pct, paquete_solicitado, motivo?.trim() || null]);

        // Notificar por email (fail-open)
        const adminEmail = process.env.SAAS_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
        if (adminEmail) {
            const { sendTokenUpgradeRequestEmail } = require('../services/emailService');
            sendTokenUpgradeRequestEmail(adminEmail, {
                empresa: tenant.nombre_empresa || tenant.slug,
                slug: tenant.slug,
                plan: tenant.plan,
                pct,
                tokensUsados: consumido,
                tokensLimite: limite,
                paquete: paquete_solicitado,
                motivo: motivo?.trim() || '',
                periodo: currentPeriod(),
            }).catch(() => {});
        }

        res.status(201).json({
            message: 'Solicitud enviada correctamente. Nuestro equipo la revisará en breve.',
            id: rows[0].id,
            created_at: rows[0].created_at,
        });
    } catch (err) {
        console.error('[AI] quota/request-upgrade error:', err.message);
        res.status(500).json({ error: 'No se pudo registrar la solicitud. Intenta de nuevo.' });
    }
});

// GET /api/ai/quota/upgrade-requests
// Historial de solicitudes del tenant.
router.get('/quota/upgrade-requests', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT id, paquete_solicitado, motivo, estado, respuesta_admin, created_at, updated_at
            FROM ai_upgrade_requests
            WHERE tenant_id = $1
            ORDER BY created_at DESC
            LIMIT 20
        `, [req.tenantId]);
        res.json(rows);
    } catch (err) {
        console.error('[AI] quota/upgrade-requests error:', err.message);
        res.status(500).json({ error: 'Error obteniendo solicitudes' });
    }
});

// GET /api/ai/predecir-reabastecimiento/:codMedicamento
router.get('/predecir-reabastecimiento/:codMedicamento', authenticateToken, withKey(PROCESS_RESTOCK_PREDICTION), checkAIQuota, async (req, res) => {
    try {
        const { codMedicamento } = req.params;
        const [medR, historialR] = await Promise.all([
            pool.query(`SELECT m.nombre_generico, m.concentracion, m.stock_minimo, m.punto_reorden,
                               COALESCE(SUM(l.cantidad_actual), 0) AS "stockActual"
                        FROM medicamentos m
                        LEFT JOIN lotes_medicamento l ON m.codigo = l.id_medicamento AND l.estado = 'Activo' AND l.tenant_id = $2
                        WHERE m.codigo = $1 AND m.tenant_id = $2 GROUP BY m.codigo`, [codMedicamento, req.tenantId]),
            pool.query(`SELECT DATE(v.fecha) AS fecha, SUM(dv.cantidad_base_descontada) AS cantidad
                        FROM detalleventa dv JOIN ventas v ON dv.idVenta = v.codVenta
                        WHERE dv.id_presentacion IN (SELECT id_presentacion FROM presentaciones_venta WHERE id_medicamento = $1)
                          AND v.estado = 'Completada' AND v.fecha >= NOW() - INTERVAL '60 days' AND v.tenant_id = $2
                        GROUP BY DATE(v.fecha) ORDER BY fecha DESC`, [codMedicamento, req.tenantId])
        ]);

        if (medR.rows.length === 0) return res.status(404).json({ error: 'Medicamento no encontrado' });
        const med = medR.rows[0];

        const settings = await getProcessSettings(PROCESS_RESTOCK_PREDICTION, req.tenantId);
        const systemPrompt = `Eres un experto en gestion de inventario veterinario en Honduras. Predice cuanto stock pedir basandote en el historial de ventas. Responde solo con el JSON especificado.`;
        const userPrompt = `Medicamento: ${med.nombre_generico} (${med.concentracion||''})\nStock actual: ${med.stockActual||0}\nStock minimo: ${med.stock_minimo||0}\nPunto reorden: ${med.punto_reorden||0}\nHistorial (${historialR.rows.length} dias):\n${historialR.rows.map(v=>`- ${v.fecha}: ${v.cantidad}`).join('\n')||'Sin historial'}\n\nDevuelve exactamente:\n{"cantidad_sugerida":0,"dias_stock_actual":0,"frecuencia_pedido_sugerida":"mensual","justificacion":"","alertas":[]}`;
        const { text } = await callProvider({ settings, systemPrompt, userPrompt, tenantId: req.tenantId });
        let parsed;
        try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
        res.json(parsed || { cantidad_sugerida: 0, justificacion: text, alertas: [] });
    } catch (err) {
        console.error('AI predecir-reabastecimiento error:', err.message);
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Error interno' });
    }
});

module.exports = router;
