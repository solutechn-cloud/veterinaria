'use strict';

const { pool } = require('../../config/db');
const { PROCESS_SYMPTOM_RECOMMENDATION, getProcessSettings, callProvider } = require('./providerRegistry');

const AGE_RANGES = new Set(['nino', 'adulto', 'adulto_mayor', 'desconocido']);
const SAFETY_MESSAGE = 'Revise la recomendacion. La IA puede equivocarse y no sustituye una consulta medica.';
const RED_FLAG_TERMS = [
    'dificultad respiratoria', 'no puede respirar', 'falta de aire', 'dolor de pecho',
    'convulsion', 'desmayo', 'sangrado', 'fiebre persistente', 'fiebre alta',
    'dolor intenso', 'embarazo', 'bebe', 'menor de 2', 'rigidez de cuello',
];

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        const match = String(text || '').match(/\{[\s\S]*\}/);
        if (!match) return {};
        try { return JSON.parse(match[0]); } catch { return {}; }
    }
}

function cleanText(value, max = 100) {
    return String(value || '')
        .replace(/[^\w\s,.;:()/-]/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, max);
}

function cleanList(value, maxItems, maxChars) {
    if (Array.isArray(value)) return value.map(v => cleanText(v, maxChars)).filter(Boolean).slice(0, maxItems);
    const text = String(value || '');
    return text.split(',').map(v => cleanText(v, maxChars)).filter(Boolean).slice(0, maxItems);
}

function normalizeRequest(body = {}, user = {}) {
    const symptoms = cleanList(body.symptoms || body.sintomas, 10, 80);
    if (symptoms.length === 0) {
        const err = new Error('Debe indicar al menos un sintoma');
        err.statusCode = 400;
        throw err;
    }

    const ageRange = cleanText(body.ageRange || body.rango_edad || 'desconocido', 30).toLowerCase();
    const normalizedAge = AGE_RANGES.has(ageRange) ? ageRange : 'desconocido';

    return {
        symptoms,
        ageRange: normalizedAge,
        pregnant: body.pregnant === true || body.embarazada === true,
        allergies: cleanList(body.allergies || body.alergias, 12, 60),
        currentMedications: cleanList(body.currentMedications || body.medicamentos_actuales, 12, 70),
        chronicConditions: cleanList(body.chronicConditions || body.condiciones_cronicas, 12, 80),
        requestedBranchId: body.id_sucursal || user.id_sucursal || null,
    };
}

async function resolveBranch(tenantId, requestedBranchId) {
    if (!requestedBranchId) return null;
    const { rows } = await pool.query(
        'SELECT id_sucursal FROM sucursales WHERE id_sucursal = $1 AND tenant_id = $2 AND estado = $3',
        [requestedBranchId, tenantId, 'Activa']
    );
    return rows[0]?.id_sucursal || null;
}

async function loadCandidates(tenantId, branchId) {
    const { rows } = await pool.query(`
        WITH stock AS (
            SELECT
                id_medicamento,
                COALESCE(SUM(cantidad_actual) FILTER (WHERE ($2::int IS NOT NULL AND id_sucursal = $2)), 0) AS stock_sucursal,
                COALESCE(SUM(cantidad_actual), 0) AS stock_total
            FROM lotes_medicamento
            WHERE tenant_id = $1
              AND estado = 'Activo'
              AND cantidad_actual > 0
            GROUP BY id_medicamento
        ),
        presentaciones AS (
            SELECT
                id_medicamento,
                MIN(precio_venta) FILTER (WHERE es_unidad_venta = TRUE AND activo = TRUE AND COALESCE(precio_venta, 0) > 0) AS precio_desde,
                COUNT(*) FILTER (WHERE es_unidad_venta = TRUE AND activo = TRUE AND COALESCE(precio_venta, 0) > 0) AS presentaciones_vendibles
            FROM presentaciones_venta
            WHERE tenant_id = $1
            GROUP BY id_medicamento
        )
        SELECT
            m.codigo,
            m.nombre_generico,
            m.nombre_comercial,
            m.concentracion,
            m.indicaciones,
            m.contraindicaciones,
            m.advertencias,
            m.requiere_receta,
            m.es_controlado,
            ct.nombre AS categoria,
            ff.nombre AS forma,
            COALESCE(s.stock_sucursal, 0) AS stock_sucursal,
            COALESCE(s.stock_total, 0) AS stock_total,
            COALESCE(p.precio_desde, 0) AS precio_desde
        FROM medicamentos m
        JOIN presentaciones p ON p.id_medicamento = m.codigo AND p.presentaciones_vendibles > 0
        LEFT JOIN stock s ON s.id_medicamento = m.codigo
        LEFT JOIN categorias_terapeuticas ct ON ct.id_categoria = m.id_categoria AND ct.tenant_id = $1
        LEFT JOIN formas_farmaceuticas ff ON ff.id_forma = m.id_forma AND ff.tenant_id = $1
        WHERE m.tenant_id = $1
          AND m.activo = TRUE
        ORDER BY COALESCE(s.stock_sucursal, 0) DESC, m.nombre_generico
        LIMIT 140
    `, [tenantId, branchId]);

    return rows.map(row => ({
        codigo: row.codigo,
        nombre: `${row.nombre_generico}${row.concentracion ? ` ${row.concentracion}` : ''}${row.nombre_comercial ? ` / ${row.nombre_comercial}` : ''}`,
        nombre_generico: row.nombre_generico,
        nombre_comercial: row.nombre_comercial,
        concentracion: row.concentracion,
        categoria: row.categoria,
        forma: row.forma,
        indicaciones: row.indicaciones,
        contraindicaciones: row.contraindicaciones,
        advertencias: row.advertencias,
        requiere_receta: row.requiere_receta === true,
        es_controlado: row.es_controlado === true,
        stock_sucursal: Number(row.stock_sucursal || 0),
        stock_total: Number(row.stock_total || 0),
        precio_desde: Number(row.precio_desde || 0),
    }));
}

function findLocalRedFlags(input) {
    const text = [
        ...input.symptoms,
        ...input.chronicConditions,
        input.pregnant ? 'embarazo' : '',
        input.ageRange === 'nino' ? 'nino' : '',
    ].join(' ').toLowerCase();
    const reasons = RED_FLAG_TERMS.filter(term => text.includes(term));
    if (input.pregnant) reasons.push('embarazo');
    return [...new Set(reasons)].slice(0, 6);
}

function buildPrompts(input, candidates, redFlags) {
    const systemPrompt = `Eres un asistente veterinario seguro para punto de venta en Honduras.
No diagnostiques enfermedades. No inventes medicamentos. Solo puedes usar codigos de la lista de inventario.
Puedes evaluar todo el inventario, pero si un producto requiere receta o es controlado debes marcarlo como requiere validacion profesional.
Si hay signos de alarma, embarazo, ninos pequenos, alergias o posibles interacciones, prioriza derivacion medica.
Responde solo JSON valido con el esquema solicitado.`;

    const safeCandidates = candidates.map(m => ({
        codigo: m.codigo,
        nombre: m.nombre,
        categoria: m.categoria || '',
        forma: m.forma || '',
        indicaciones: cleanText(m.indicaciones, 260),
        advertencias: cleanText(m.advertencias, 260),
        contraindicaciones: cleanText(m.contraindicaciones, 220),
        requiere_receta: m.requiere_receta,
        es_controlado: m.es_controlado,
        stock_sucursal: m.stock_sucursal,
        stock_total: m.stock_total,
    }));

    const userPrompt = `Consulta estructurada:
${JSON.stringify({
        symptoms: input.symptoms,
        ageRange: input.ageRange,
        pregnant: input.pregnant,
        allergies: input.allergies,
        currentMedications: input.currentMedications,
        chronicConditions: input.chronicConditions,
        localRedFlags: redFlags,
    })}

Inventario candidato real:
${JSON.stringify(safeCandidates)}

Devuelve exactamente:
{
  "requiresMedicalReferral": false,
  "referralReasons": [],
  "summary": "orientacion breve para el cajero",
  "recommendations": [
    {
      "codigo": "MED-0001",
      "reason": "motivo de sugerencia sin diagnosticar",
      "confidence": 0.8,
      "warnings": ["advertencia concreta"],
      "professionalValidationRequired": false
    }
  ],
  "notRecommended": [
    {
      "codigo": "MED-0002",
      "reason": "motivo de exclusion o precaucion"
    }
  ]
}`;

    return { systemPrompt, userPrompt };
}

function availabilityFor(candidate) {
    if (candidate.stock_sucursal > 0) return 'in_current_branch';
    if (candidate.stock_total > 0) return 'other_branch';
    return 'out_of_stock';
}

function normalizeConfidence(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(1, num));
}

function normalizeResult(raw, candidates, settings, redFlags) {
    const byCode = new Map(candidates.map(c => [c.codigo, c]));
    const recommendations = [];
    const seen = new Set();

    for (const rec of Array.isArray(raw.recommendations) ? raw.recommendations : []) {
        const code = cleanText(rec.codigo, 30);
        const med = byCode.get(code);
        if (!med || seen.has(code)) continue;
        seen.add(code);
        const warnings = cleanList(rec.warnings, 6, 140);
        if (med.requiere_receta || med.es_controlado) {
            warnings.unshift('Requiere validacion profesional antes de dispensar.');
        }
        recommendations.push({
            codigo: med.codigo,
            nombre: med.nombre,
            reason: cleanText(rec.reason, 260) || 'Producto relacionado con la consulta registrada.',
            confidence: normalizeConfidence(rec.confidence || 0.5),
            availability: availabilityFor(med),
            stockCurrentBranch: med.stock_sucursal,
            stockTotal: med.stock_total,
            requiresPrescription: med.requiere_receta,
            isControlled: med.es_controlado,
            warnings: [...new Set(warnings)].slice(0, 6),
        });
    }

    const notRecommended = [];
    const notSeen = new Set();
    for (const item of Array.isArray(raw.notRecommended) ? raw.notRecommended : []) {
        const code = cleanText(item.codigo, 30);
        const med = byCode.get(code);
        if (!med || notSeen.has(code)) continue;
        notSeen.add(code);
        notRecommended.push({
            codigo: med.codigo,
            nombre: med.nombre,
            reason: cleanText(item.reason, 220) || 'No recomendado para esta consulta.',
        });
    }

    const referralReasons = [
        ...cleanList(raw.referralReasons, 8, 140),
        ...redFlags.map(flag => `Signo de alarma detectado: ${flag}`),
    ];

    return {
        provider: settings.provider,
        model: settings.model,
        requiresMedicalReferral: Boolean(raw.requiresMedicalReferral) || redFlags.length > 0,
        referralReasons: [...new Set(referralReasons)].slice(0, 8),
        summary: cleanText(raw.summary, 360) || 'Revise los sintomas y confirme disponibilidad antes de vender.',
        recommendations: recommendations.slice(0, 6),
        notRecommended: notRecommended.slice(0, 8),
        safetyMessage: SAFETY_MESSAGE,
    };
}

async function logRecommendation({ tenantId, userId, settings, status, durationMs, branchId, candidateCount, recommendationCount, usage, error }) {
    try {
        await pool.query(`
            INSERT INTO ai_analysis_logs
                (tenant_id, user_id, process_key, provider, model, status, duration_ms, image_count, image_metadata, token_usage, error_summary)
            VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10)
        `, [
            tenantId || null,
            userId || null,
            PROCESS_SYMPTOM_RECOMMENDATION,
            settings.provider,
            settings.model,
            status,
            durationMs,
            JSON.stringify({ branchId, candidateCount, recommendationCount }),
            usage ? JSON.stringify(usage) : null,
            error ? String(error).substring(0, 500) : null,
        ]);
    } catch (err) {
        console.warn('[ai logs] no se pudo registrar recomendacion:', err.message);
    }
}

async function recommendBySymptoms({ body, tenantId, user }) {
    const started = Date.now();
    const input = normalizeRequest(body, user);
    const branchId = await resolveBranch(tenantId, input.requestedBranchId);
    const settings = await getProcessSettings(PROCESS_SYMPTOM_RECOMMENDATION, tenantId);
    const candidates = await loadCandidates(tenantId, branchId);
    const redFlags = findLocalRedFlags(input);

    if (candidates.length === 0) {
        return {
            provider: settings.provider,
            model: settings.model,
            requiresMedicalReferral: redFlags.length > 0,
            referralReasons: redFlags.map(flag => `Signo de alarma detectado: ${flag}`),
            summary: 'No hay medicamentos vendibles disponibles en el inventario para evaluar.',
            recommendations: [],
            notRecommended: [],
            safetyMessage: SAFETY_MESSAGE,
        };
    }

    try {
        const { systemPrompt, userPrompt } = buildPrompts(input, candidates, redFlags);
        const aiResponse = await callProvider({ settings, systemPrompt, userPrompt, tenantId });
        const normalized = normalizeResult(parseJson(aiResponse.text), candidates, settings, redFlags);
        await logRecommendation({
            tenantId,
            userId: user?.codUsuario,
            settings,
            status: 'success',
            durationMs: Date.now() - started,
            branchId,
            candidateCount: candidates.length,
            recommendationCount: normalized.recommendations.length,
            usage: aiResponse.usage,
        });
        return normalized;
    } catch (err) {
        await logRecommendation({
            tenantId,
            userId: user?.codUsuario,
            settings,
            status: 'error',
            durationMs: Date.now() - started,
            branchId,
            candidateCount: candidates.length,
            recommendationCount: 0,
            error: err.message,
        });
        throw err;
    }
}

module.exports = {
    PROCESS_SYMPTOM_RECOMMENDATION,
    recommendBySymptoms,
};
