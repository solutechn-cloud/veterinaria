'use strict';

const { pool } = require('../config/db');

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentPeriod() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Tegucigalpa' }).slice(0, 7); // 'YYYY-MM'
}

function currentDateHN() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Tegucigalpa' }); // 'YYYY-MM-DD'
}

function toFiniteNumber(value, fallback = 0) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeDateOnly(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return value.toLocaleDateString('sv-SE', { timeZone: 'America/Tegucigalpa' });
    }
    return String(value).slice(0, 10);
}

function normalizeProcessList(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
    } catch {
        // Fall back to Postgres text-array parsing below.
    }
    return value
        .replace(/[{}\[\]"]/g, '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

// ── Obtener límites efectivos del tenant ─────────────────────────────────────

async function getTenantLimits(tenantId) {
    const { rows } = await pool.query(`
        SELECT
            t.ai_habilitado,
            t.plan,
            COALESCE(t.ai_tokens_override,    p.tokens_mensual)    AS tokens_limite,
            COALESCE(t.ai_requests_override,  p.requests_mensual)  AS requests_limite,
            COALESCE(t.ai_req_diario_override, p.requests_diario)  AS req_diario_limite,
            p.procesos_habilitados
        FROM tenants t
        JOIN ai_quota_plans p ON p.plan = t.plan
        WHERE t.id = $1
    `, [tenantId]);
    return rows[0] || null;
}

// ── Obtener uso actual del periodo ───────────────────────────────────────────

async function getCurrentUsage(tenantId, periodo) {
    const { rows } = await pool.query(`
        SELECT tokens_consumidos, requests_totales, requests_hoy, fecha_reset_diario
        FROM ai_quota_usage
        WHERE tenant_id = $1 AND periodo = $2
    `, [tenantId, periodo]);
    return rows[0] || { tokens_consumidos: 0, requests_totales: 0, requests_hoy: 0, fecha_reset_diario: null };
}

// ── Middleware: verificar cuota ANTES de llamar a la IA ──────────────────────

async function checkAIQuota(req, res, next) {
    const tenantId = req.tenantId;
    if (!tenantId) return next();

    try {
        const limits = await getTenantLimits(tenantId);
        if (!limits) return next();

        // IA completamente deshabilitada para este tenant
        if (!limits.ai_habilitado) {
            return res.status(403).json({
                error: 'La IA está deshabilitada para su cuenta',
                code: 'AI_DISABLED',
            });
        }

        // Verificar si el proceso está habilitado para este plan
        const normalizedLimits = {
            ...limits,
            tokens_limite: toFiniteNumber(limits.tokens_limite),
            requests_limite: toFiniteNumber(limits.requests_limite),
            req_diario_limite: toFiniteNumber(limits.req_diario_limite),
            procesos_habilitados: normalizeProcessList(limits.procesos_habilitados),
        };

        const processKey = req.aiProcessKey; // se inyecta en cada ruta
        if (processKey && !normalizedLimits.procesos_habilitados.includes(processKey)) {
            return res.status(403).json({
                error: `El proceso "${processKey}" no está disponible en su plan "${limits.plan}"`,
                code: 'AI_PROCESS_NOT_IN_PLAN',
                plan: limits.plan,
            });
        }

        const periodo = currentPeriod();
        const hoy = currentDateHN();
        const usage = await getCurrentUsage(tenantId, periodo);

        // Reset diario si cambió el día
        const usageNumbers = {
            tokens_consumidos: toFiniteNumber(usage.tokens_consumidos),
            requests_totales: toFiniteNumber(usage.requests_totales),
            requests_hoy: toFiniteNumber(usage.requests_hoy),
        };
        const fechaResetDiario = normalizeDateOnly(usage.fecha_reset_diario);
        const requests_hoy = fechaResetDiario === hoy ? usageNumbers.requests_hoy : 0;

        // Guardar límites en req para el post-call
        req.aiQuota = {
            limits: normalizedLimits,
            periodo,
            hoy,
            usage: { ...usage, ...usageNumbers, fecha_reset_diario: fechaResetDiario },
            requests_hoy,
        };

        // Verificar tope de tokens mensual
        if (normalizedLimits.tokens_limite > 0 && usageNumbers.tokens_consumidos >= normalizedLimits.tokens_limite) {
            const resetAt = new Date();
            resetAt.setMonth(resetAt.getMonth() + 1);
            resetAt.setDate(1);
            resetAt.setHours(0, 0, 0, 0);
            return res.status(429).json({
                error: 'Cuota de IA agotada para este período',
                code: 'AI_QUOTA_EXCEEDED',
                detail: {
                    tokens_consumidos: usageNumbers.tokens_consumidos,
                    tokens_limite: normalizedLimits.tokens_limite,
                    periodo,
                    reset_at: resetAt.toISOString(),
                    plan: limits.plan,
                },
            });
        }

        // Verificar tope de requests mensual
        if (normalizedLimits.requests_limite > 0 && usageNumbers.requests_totales >= normalizedLimits.requests_limite) {
            return res.status(429).json({
                error: 'Límite mensual de solicitudes de IA alcanzado',
                code: 'AI_REQUESTS_EXCEEDED',
                detail: {
                    requests_totales: usageNumbers.requests_totales,
                    requests_limite: normalizedLimits.requests_limite,
                    periodo,
                    plan: limits.plan,
                },
            });
        }

        // Verificar tope diario anti-abuso
        if (normalizedLimits.req_diario_limite > 0 && requests_hoy >= normalizedLimits.req_diario_limite) {
            return res.status(429).json({
                error: 'Límite diario de solicitudes de IA alcanzado',
                code: 'AI_DAILY_LIMIT_EXCEEDED',
                detail: {
                    requests_hoy,
                    req_diario_limite: normalizedLimits.req_diario_limite,
                    reset_at: hoy + 'T23:59:59',
                    plan: limits.plan,
                },
            });
        }

        next();
    } catch (err) {
        console.error('[aiQuota] Error verificando cuota:', err.message);
        // Fail open: si la BD falla, dejamos pasar para no interrumpir el servicio
        next();
    }
}

// ── Post-call: acumular uso después de llamada exitosa ───────────────────────

async function recordAIUsage(tenantId, usage, processKey) {
    if (!tenantId || !usage) return;

    const tokensUsed = Number(
        usage.total_tokens ||                                                    // OpenAI
        usage.totalTokenCount ||                                                 // Gemini usageMetadata
        (usage.prompt_tokens || 0) + (usage.completion_tokens || 0) ||          // OpenAI fallback
        (usage.input_tokens || 0) + (usage.output_tokens || 0) ||               // Anthropic
        (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0) ||    // Gemini fallback
        0
    );
    if (!Number.isFinite(tokensUsed) || tokensUsed <= 0) return;

    const periodo = currentPeriod();
    const hoy = currentDateHN();

    try {
        const { rows } = await pool.query(`
            INSERT INTO ai_quota_usage
                (tenant_id, periodo, tokens_consumidos, requests_totales, requests_hoy, fecha_reset_diario, updated_at)
            VALUES ($1, $2, $3, 1, 1, $4, NOW())
            ON CONFLICT (tenant_id, periodo) DO UPDATE SET
                tokens_consumidos = ai_quota_usage.tokens_consumidos + EXCLUDED.tokens_consumidos,
                requests_totales  = ai_quota_usage.requests_totales  + 1,
                requests_hoy      = CASE
                    WHEN ai_quota_usage.fecha_reset_diario = $4 THEN ai_quota_usage.requests_hoy + 1
                    ELSE 1
                END,
                fecha_reset_diario = $4,
                updated_at         = NOW()
            RETURNING tokens_consumidos, requests_totales, alerta_80_enviada, alerta_100_enviada
        `, [tenantId, periodo, tokensUsed, hoy]);

        const row = rows[0];
        if (!row) return;

        // Obtener límite para calcular alertas
        const limitsR = await pool.query(`
            SELECT COALESCE(t.ai_tokens_override, p.tokens_mensual) AS tokens_limite
            FROM tenants t JOIN ai_quota_plans p ON p.plan = t.plan WHERE t.id = $1
        `, [tenantId]);
        const limite = Number(limitsR.rows[0]?.tokens_limite || 0);
        if (!limite) return;

        const pct = row.tokens_consumidos * 100 / limite;

        // Alerta 80%
        if (pct >= 80 && !row.alerta_80_enviada) {
            await pool.query(`
                UPDATE ai_quota_usage SET alerta_80_enviada = TRUE, updated_at = NOW()
                WHERE tenant_id = $1 AND periodo = $2
            `, [tenantId, periodo]);
            await createQuotaNotification(tenantId, 80, row.tokens_consumidos, limite, periodo);
        }

        // Alerta 100% — cuota agotada
        if (pct >= 100 && !row.alerta_100_enviada) {
            await pool.query(`
                UPDATE ai_quota_usage
                SET alerta_100_enviada = TRUE, ultimo_exceso_at = NOW(), updated_at = NOW()
                WHERE tenant_id = $1 AND periodo = $2
            `, [tenantId, periodo]);
            await createQuotaNotification(tenantId, 100, row.tokens_consumidos, limite, periodo);
        }
    } catch (err) {
        console.error('[aiQuota] Error registrando uso:', err.message);
    }
}

// ── Notificación interna al admin del tenant ─────────────────────────────────

async function createQuotaNotification(tenantId, pct, tokensUsados, tokensLimite, periodo) {
    try {
        const mensaje = pct >= 100
            ? `Cuota de IA agotada en ${periodo}. Se usaron ${tokensUsados.toLocaleString()} tokens (límite: ${tokensLimite.toLocaleString()}). Contacte a soporte para ampliar su plan.`
            : `Has usado el ${pct}% de tu cuota de IA en ${periodo}. Tokens: ${tokensUsados.toLocaleString()} / ${tokensLimite.toLocaleString()}.`;

        await pool.query(`
            INSERT INTO notificaciones (tenant_id, tipo, titulo, cuerpo, leida, fecha_creacion)
            VALUES ($1, 'alerta_cuota_ia', $2, $3, FALSE, NOW())
        `, [
            tenantId,
            pct >= 100 ? 'Cuota de IA agotada' : `Alerta: ${pct}% de cuota de IA usada`,
            mensaje,
        ]);
    } catch {
        // Si la tabla de notificaciones no tiene esa estructura, ignorar silenciosamente
    }
}

module.exports = { checkAIQuota, recordAIUsage, getTenantLimits, getCurrentUsage };
