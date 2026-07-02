'use strict';

const { pool, setRequestTenant } = require('../config/db');
const audienceService = require('./messagingAudienceService');
const campaignService = require('./messagingCampaignService');

const FREQUENCIES = new Set(['daily', 'weekly', 'monthly']);
const STATUSES = new Set(['active', 'paused', 'archived']);
const SEND_MODES = new Set(['schedule', 'send_now']);
const HN_OFFSET_HOURS = 6;

function clean(value, max = 1000) {
    if (value == null) return '';
    return String(value).trim().substring(0, max);
}

function asPositiveInt(value, field) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        const err = new Error(`${field} invalido.`);
        err.statusCode = 400;
        throw err;
    }
    return id;
}

function normalizeChoice(value, allowed, fallback, label) {
    const normalized = clean(value || fallback, 30);
    if (!allowed.has(normalized)) {
        const err = new Error(`${label} invalido.`);
        err.statusCode = 400;
        throw err;
    }
    return normalized;
}

function normalizeRunTime(value) {
    const match = clean(value || '08:00', 8).match(/^([01]\d|2[0-3]):([0-5]\d)/);
    if (!match) {
        const err = new Error('Hora de ejecucion invalida.');
        err.statusCode = 400;
        throw err;
    }
    return `${match[1]}:${match[2]}`;
}

function normalizeDayOfWeek(value) {
    if (value === null || value === undefined || value === '') return null;
    const day = Number(value);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
        const err = new Error('Dia de semana invalido.');
        err.statusCode = 400;
        throw err;
    }
    return day;
}

function normalizeDayOfMonth(value) {
    if (value === null || value === undefined || value === '') return null;
    const day = Number(value);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
        const err = new Error('Dia del mes invalido.');
        err.statusCode = 400;
        throw err;
    }
    return day;
}

function getHondurasParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Tegucigalpa',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date).reduce((acc, item) => ({ ...acc, [item.type]: item.value }), {});
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { year, month, day, dow };
}

function addHondurasDays(parts, days) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        dow: date.getUTCDay(),
    };
}

function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function makeHondurasUtcDate(parts, runTime) {
    const [hour, minute] = runTime.split(':').map(Number);
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour + HN_OFFSET_HOURS, minute, 0, 0));
}

function computeNextRunAt(rule, from = new Date()) {
    const frequency = normalizeChoice(rule.frequency, FREQUENCIES, 'weekly', 'Frecuencia');
    const runTime = normalizeRunTime(rule.runTime || rule.run_time);
    const base = getHondurasParts(from);
    let candidate;

    if (frequency === 'daily') {
        candidate = makeHondurasUtcDate(base, runTime);
        if (candidate <= from) candidate = makeHondurasUtcDate(addHondurasDays(base, 1), runTime);
    } else if (frequency === 'weekly') {
        const target = normalizeDayOfWeek(rule.dayOfWeek ?? rule.day_of_week) ?? base.dow;
        let delta = (target - base.dow + 7) % 7;
        candidate = makeHondurasUtcDate(addHondurasDays(base, delta), runTime);
        if (candidate <= from) candidate = makeHondurasUtcDate(addHondurasDays(base, delta + 7), runTime);
    } else {
        const target = normalizeDayOfMonth(rule.dayOfMonth ?? rule.day_of_month) ?? base.day;
        let year = base.year;
        let month = base.month;
        let day = Math.min(target, daysInMonth(year, month));
        candidate = makeHondurasUtcDate({ year, month, day }, runTime);
        if (candidate <= from) {
            month += 1;
            if (month > 12) { month = 1; year += 1; }
            day = Math.min(target, daysInMonth(year, month));
            candidate = makeHondurasUtcDate({ year, month, day }, runTime);
        }
    }
    return candidate.toISOString();
}

function mapRule(row) {
    return {
        id: Number(row.id),
        name: row.name,
        audienceType: row.audience_type,
        templateId: Number(row.template_id),
        templateName: row.template_name || null,
        templateSubject: row.template_subject || null,
        frequency: row.frequency,
        runTime: String(row.run_time || '08:00').substring(0, 5),
        dayOfWeek: row.day_of_week == null ? null : Number(row.day_of_week),
        dayOfMonth: row.day_of_month == null ? null : Number(row.day_of_month),
        sendMode: row.send_mode,
        status: row.status,
        metadata: row.metadata || {},
        lastRunAt: row.last_run_at,
        nextRunAt: row.next_run_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapRun(row) {
    return {
        id: Number(row.id),
        automationId: Number(row.automation_id),
        campaignId: row.campaign_id ? Number(row.campaign_id) : null,
        campaignName: row.campaign_name || null,
        status: row.status,
        recipientsCount: Number(row.recipients_count || 0),
        error: row.error,
        metadata: row.metadata || {},
        startedAt: row.started_at,
        finishedAt: row.finished_at,
    };
}

async function getTemplate(tenantId, templateId) {
    const { rows } = await pool.query(`
        SELECT id, name, subject, body, active
        FROM messaging_templates
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
    `, [tenantId, templateId]);
    if (!rows[0] || rows[0].active === false) {
        const err = new Error('Plantilla no encontrada o archivada.');
        err.statusCode = 400;
        throw err;
    }
    return rows[0];
}

function normalizePayload(payload = {}, current = null) {
    const merged = {
        name: Object.prototype.hasOwnProperty.call(payload, 'name') ? clean(payload.name, 180) : current?.name,
        audienceType: Object.prototype.hasOwnProperty.call(payload, 'audienceType') ? audienceService.validateAudienceType(payload.audienceType) : current?.audienceType,
        templateId: Object.prototype.hasOwnProperty.call(payload, 'templateId') ? asPositiveInt(payload.templateId, 'Plantilla') : current?.templateId,
        frequency: Object.prototype.hasOwnProperty.call(payload, 'frequency') ? normalizeChoice(payload.frequency, FREQUENCIES, 'weekly', 'Frecuencia') : current?.frequency,
        runTime: Object.prototype.hasOwnProperty.call(payload, 'runTime') ? normalizeRunTime(payload.runTime) : current?.runTime,
        dayOfWeek: Object.prototype.hasOwnProperty.call(payload, 'dayOfWeek') ? normalizeDayOfWeek(payload.dayOfWeek) : current?.dayOfWeek,
        dayOfMonth: Object.prototype.hasOwnProperty.call(payload, 'dayOfMonth') ? normalizeDayOfMonth(payload.dayOfMonth) : current?.dayOfMonth,
        sendMode: Object.prototype.hasOwnProperty.call(payload, 'sendMode') ? normalizeChoice(payload.sendMode, SEND_MODES, 'schedule', 'Modo de envio') : current?.sendMode,
        status: Object.prototype.hasOwnProperty.call(payload, 'status') ? normalizeChoice(payload.status, STATUSES, 'active', 'Estado') : current?.status,
    };
    if (!merged.name || !merged.templateId || !merged.audienceType) {
        const err = new Error('Nombre, audiencia y plantilla son requeridos.');
        err.statusCode = 400;
        throw err;
    }
    return merged;
}

async function listAutomations(tenantId) {
    const { rows } = await pool.query(`
        SELECT r.*, t.name AS template_name, t.subject AS template_subject
        FROM messaging_automation_rules r
        LEFT JOIN messaging_templates t ON t.tenant_id = r.tenant_id AND t.id = r.template_id
        WHERE r.tenant_id = $1 AND r.status <> 'archived'
        ORDER BY r.status ASC, r.next_run_at ASC NULLS LAST, r.id DESC
    `, [tenantId]);
    return rows.map(mapRule);
}

async function createAutomation(tenantId, payload, user = {}) {
    const data = normalizePayload(payload, {
        audienceType: 'all_tutors',
        frequency: 'weekly',
        runTime: '08:00',
        dayOfWeek: 1,
        dayOfMonth: 1,
        sendMode: 'schedule',
        status: 'active',
    });
    await getTemplate(tenantId, data.templateId);
    const nextRunAt = data.status === 'active' ? computeNextRunAt(data) : null;
    const { rows } = await pool.query(`
        INSERT INTO messaging_automation_rules (
            tenant_id, name, audience_type, template_id, frequency, run_time,
            day_of_week, day_of_month, send_mode, status, next_run_at, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
    `, [
        tenantId, data.name, data.audienceType, data.templateId, data.frequency,
        data.runTime, data.dayOfWeek, data.dayOfMonth, data.sendMode, data.status,
        nextRunAt, user.usuario || user.codUsuario || null,
    ]);
    return mapRule(rows[0]);
}

async function updateAutomation(tenantId, id, payload) {
    const currentRes = await pool.query(`
        SELECT r.*, t.name AS template_name, t.subject AS template_subject
        FROM messaging_automation_rules r
        LEFT JOIN messaging_templates t ON t.tenant_id = r.tenant_id AND t.id = r.template_id
        WHERE r.tenant_id = $1 AND r.id = $2
    `, [tenantId, id]);
    if (!currentRes.rows[0]) {
        const err = new Error('Automatizacion no encontrada.');
        err.statusCode = 404;
        throw err;
    }
    const data = normalizePayload(payload, mapRule(currentRes.rows[0]));
    await getTemplate(tenantId, data.templateId);
    const nextRunAt = data.status === 'active' ? computeNextRunAt(data) : null;
    const { rows } = await pool.query(`
        UPDATE messaging_automation_rules
        SET name = $3, audience_type = $4, template_id = $5, frequency = $6,
            run_time = $7, day_of_week = $8, day_of_month = $9, send_mode = $10,
            status = $11, next_run_at = $12, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
    `, [tenantId, id, data.name, data.audienceType, data.templateId, data.frequency, data.runTime, data.dayOfWeek, data.dayOfMonth, data.sendMode, data.status, nextRunAt]);
    return mapRule(rows[0]);
}

async function listRuns(tenantId, automationId) {
    const { rows } = await pool.query(`
        SELECT r.*, c.name AS campaign_name
        FROM messaging_automation_runs r
        LEFT JOIN messaging_campaigns c ON c.tenant_id = r.tenant_id AND c.id = r.campaign_id
        WHERE r.tenant_id = $1 AND r.automation_id = $2
        ORDER BY r.started_at DESC
        LIMIT 50
    `, [tenantId, automationId]);
    return rows.map(mapRun);
}

async function markRun(runId, tenantId, status, data = {}) {
    const { rows } = await pool.query(`
        UPDATE messaging_automation_runs
        SET status = $3, campaign_id = COALESCE($4, campaign_id),
            recipients_count = COALESCE($5, recipients_count),
            error = $6, metadata = metadata || $7::jsonb,
            finished_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
    `, [
        tenantId,
        runId,
        status,
        data.campaignId || null,
        Number.isFinite(data.recipientsCount) ? data.recipientsCount : null,
        data.error || null,
        JSON.stringify(data.metadata || {}),
    ]);
    return rows[0] ? mapRun(rows[0]) : null;
}

async function executeAutomation(tenantId, rule, user = {}, manual = false) {
    const { rows } = await pool.query(`
        INSERT INTO messaging_automation_runs (tenant_id, automation_id, status, metadata)
        VALUES ($1, $2, 'running', $3::jsonb)
        RETURNING id
    `, [tenantId, rule.id, JSON.stringify({ manual })]);
    const runId = Number(rows[0].id);

    try {
        const preview = await audienceService.previewAudience(tenantId, rule.audience_type);
        if (preview.total === 0) {
            return markRun(runId, tenantId, 'skipped', { recipientsCount: 0, metadata: { reason: 'audiencia_sin_correos' } });
        }
        const template = await getTemplate(tenantId, Number(rule.template_id));
        const stamp = new Date().toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const campaign = await campaignService.createCampaign(tenantId, {
            name: `${rule.name} - ${stamp}`,
            subject: template.subject,
            body: template.body,
            audienceType: rule.audience_type,
            templateId: Number(rule.template_id),
        }, user);
        if (rule.send_mode === 'send_now') {
            await campaignService.sendCampaign(tenantId, campaign.id, user);
        } else {
            await campaignService.scheduleCampaign(tenantId, campaign.id, new Date(Date.now() + 60000).toISOString(), user);
        }
        return markRun(runId, tenantId, 'completed', {
            campaignId: campaign.id,
            recipientsCount: preview.total,
            metadata: { sendMode: rule.send_mode },
        });
    } catch (err) {
        return markRun(runId, tenantId, 'failed', { error: clean(err.message || err, 2000) });
    }
}

async function runAutomationNow(tenantId, id, user = {}) {
    return setRequestTenant(tenantId, async () => {
        const { rows } = await pool.query('SELECT * FROM messaging_automation_rules WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
        if (!rows[0]) {
            const err = new Error('Automatizacion no encontrada.');
            err.statusCode = 404;
            throw err;
        }
        return executeAutomation(tenantId, rows[0], user, true);
    });
}

async function processDueAutomations(tenantId, limit = 3) {
    if (!tenantId) return 0;
    return setRequestTenant(tenantId, async () => {
        const { rows } = await pool.query(`
            WITH due AS (
                SELECT id
                FROM messaging_automation_rules
                WHERE tenant_id = $1 AND status = 'active' AND next_run_at <= NOW()
                ORDER BY next_run_at ASC, id ASC
                LIMIT $2
                FOR UPDATE SKIP LOCKED
            )
            UPDATE messaging_automation_rules r
            SET next_run_at = NOW() + INTERVAL '5 minutes', updated_at = NOW()
            FROM due
            WHERE r.id = due.id
            RETURNING r.*
        `, [tenantId, Math.max(1, Math.min(10, Number(limit) || 3))]);
        for (const rule of rows) {
            await executeAutomation(tenantId, rule, { usuario: 'automation-scheduler' }, false);
            await pool.query(`
                UPDATE messaging_automation_rules
                SET last_run_at = NOW(), next_run_at = $3, updated_at = NOW()
                WHERE tenant_id = $1 AND id = $2
            `, [tenantId, rule.id, computeNextRunAt(rule, new Date(Date.now() + 60000))]);
        }
        if (rows.length > 0) console.log(`[messaging-automations] Procesadas ${rows.length} reglas para tenant ${tenantId.substring(0, 8)}.`);
        return rows.length;
    });
}

module.exports = {
    listAutomations,
    createAutomation,
    updateAutomation,
    listRuns,
    runAutomationNow,
    processDueAutomations,
    computeNextRunAt,
};
