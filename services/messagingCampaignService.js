'use strict';

const { pool, setRequestTenant } = require('../config/db');
const messagingService = require('./messagingService');
const audienceService = require('./messagingAudienceService');
const { interpolate, renderCampaignHtml } = require('./messagingCampaignRenderer');

const {
    getAudienceRows,
    listAudienceDefinitions,
    previewAudience,
    validateAudienceType,
} = audienceService;

function clean(value, max = 1000) {
    if (value == null) return '';
    return String(value).trim().substring(0, max);
}

function normalizePage(filters = {}) {
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(filters.pageSize || 25)));
    return { page, pageSize, offset: (page - 1) * pageSize };
}

function normalizeTemplateId(value) {
    if (value == null || value === '') return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeScheduledAt(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        const err = new Error('Fecha programada invalida.');
        err.statusCode = 400;
        throw err;
    }
    return date.toISOString();
}

function validateCampaignPayload(payload = {}, partial = false) {
    const data = {
        name: clean(payload.name, 180),
        subject: clean(payload.subject, 500),
        body: clean(payload.body, 20000),
        audienceType: payload.audienceType ? validateAudienceType(payload.audienceType) : (partial ? null : 'all_tutors'),
        templateId: Object.prototype.hasOwnProperty.call(payload, 'templateId') ? normalizeTemplateId(payload.templateId) : undefined,
        scheduledAt: Object.prototype.hasOwnProperty.call(payload, 'scheduledAt') ? normalizeScheduledAt(payload.scheduledAt) : undefined,
    };
    if (!partial && (!data.name || !data.subject || !data.body)) {
        const err = new Error('Nombre, asunto y mensaje son requeridos.');
        err.statusCode = 400;
        throw err;
    }
    return data;
}

function mapCampaign(row) {
    return {
        id: Number(row.id),
        name: row.name,
        subject: row.subject,
        body: row.body,
        audienceType: row.audience_type,
        templateId: row.template_id ? Number(row.template_id) : null,
        status: row.status,
        totalRecipients: Number(row.total_recipients || 0),
        sentCount: Number(row.sent_count || 0),
        failedCount: Number(row.failed_count || 0),
        skippedCount: Number(row.skipped_count || 0),
        metadata: row.metadata || {},
        createdBy: row.created_by,
        scheduledAt: row.scheduled_at,
        queuedAt: row.queued_at,
        sentAt: row.sent_at,
        finishedAt: row.finished_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapRecipient(row) {
    return {
        id: Number(row.id),
        campaignId: Number(row.campaign_id),
        clienteId: row.cliente_id,
        recipientEmail: row.recipient_email,
        recipientName: row.recipient_name,
        status: row.status,
        messageId: row.message_id ? Number(row.message_id) : null,
        error: row.error,
        sentAt: row.sent_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

async function getTenantName(tenantId) {
    const { rows } = await pool.query('SELECT nombre_empresa FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    return rows[0]?.nombre_empresa || 'Clinica veterinaria';
}

async function listCampaigns(tenantId, filters = {}) {
    const { page, pageSize, offset } = normalizePage(filters);
    const where = ['tenant_id = $1'];
    const values = [tenantId];
    if (filters.status) {
        values.push(String(filters.status));
        where.push(`status = $${values.length}`);
    }
    if (filters.q) {
        values.push(`%${String(filters.q).trim()}%`);
        where.push(`(name ILIKE $${values.length} OR subject ILIKE $${values.length})`);
    }
    const clause = where.join(' AND ');
    const [data, count] = await Promise.all([
        pool.query(`
            SELECT *
            FROM messaging_campaigns
            WHERE ${clause}
            ORDER BY created_at DESC
            LIMIT $${values.length + 1} OFFSET $${values.length + 2}
        `, [...values, pageSize, offset]),
        pool.query(`SELECT COUNT(*)::int AS total FROM messaging_campaigns WHERE ${clause}`, values),
    ]);
    return { data: data.rows.map(mapCampaign), total: Number(count.rows[0]?.total || 0), page, pageSize };
}

async function createCampaign(tenantId, payload, user = {}) {
    const data = validateCampaignPayload(payload);
    const { rows } = await pool.query(`
        INSERT INTO messaging_campaigns (tenant_id, name, subject, body, audience_type, template_id, scheduled_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `, [tenantId, data.name, data.subject, data.body, data.audienceType, data.templateId || null, data.scheduledAt || null, user.usuario || user.codUsuario || null]);
    return mapCampaign(rows[0]);
}

async function updateCampaign(tenantId, id, payload) {
    const data = validateCampaignPayload(payload, true);
    const current = await pool.query(
        'SELECT status FROM messaging_campaigns WHERE tenant_id = $1 AND id = $2',
        [tenantId, id]
    );
    if (!current.rows[0]) {
        const err = new Error('Campana no encontrada.');
        err.statusCode = 404;
        throw err;
    }
    if (!['draft', 'scheduled'].includes(current.rows[0].status)) {
        const err = new Error('Solo se pueden editar campanas en borrador o programadas.');
        err.statusCode = 409;
        throw err;
    }
    const { rows } = await pool.query(`
        UPDATE messaging_campaigns
        SET name = COALESCE(NULLIF($3, ''), name),
            subject = COALESCE(NULLIF($4, ''), subject),
            body = COALESCE(NULLIF($5, ''), body),
            audience_type = COALESCE($6, audience_type),
            template_id = CASE WHEN $7::boolean THEN $8 ELSE template_id END,
            scheduled_at = CASE WHEN $9::boolean THEN $10::timestamptz ELSE scheduled_at END,
            updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
    `, [
        tenantId,
        id,
        data.name,
        data.subject,
        data.body,
        data.audienceType,
        data.templateId !== undefined,
        data.templateId || null,
        data.scheduledAt !== undefined,
        data.scheduledAt || null,
    ]);
    return mapCampaign(rows[0]);
}

async function listRecipients(tenantId, campaignId) {
    const { rows } = await pool.query(`
        SELECT *
        FROM messaging_campaign_recipients
        WHERE tenant_id = $1 AND campaign_id = $2
        ORDER BY id ASC
    `, [tenantId, campaignId]);
    return rows.map(mapRecipient);
}

async function seedRecipients(tenantId, campaign) {
    const recipients = await getAudienceRows(tenantId, campaign.audience_type);
    for (const item of recipients) {
        await pool.query(`
            INSERT INTO messaging_campaign_recipients (
                tenant_id, campaign_id, cliente_id, recipient_email, recipient_name, status
            )
            VALUES ($1, $2, $3, $4, $5, 'pending')
            ON CONFLICT (campaign_id, recipient_email) DO NOTHING
        `, [tenantId, campaign.id, item.clienteId, item.recipientEmail, item.recipientName]);
    }
    await pool.query(`
        UPDATE messaging_campaigns
        SET total_recipients = (
                SELECT COUNT(*) FROM messaging_campaign_recipients
                WHERE tenant_id = $1 AND campaign_id = $2
            ),
            updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
    `, [tenantId, campaign.id]);
}

async function processCampaign(tenantId, campaignId, user = {}) {
    return setRequestTenant(tenantId, async () => {
        const campaignRes = await pool.query(
            'SELECT * FROM messaging_campaigns WHERE tenant_id = $1 AND id = $2',
            [tenantId, campaignId]
        );
        const campaign = campaignRes.rows[0];
        if (!campaign || campaign.status !== 'sending') return;

        const empresa = await getTenantName(tenantId);
        const recipients = await listRecipients(tenantId, campaignId);
        let sent = 0;
        let failed = 0;
        let skipped = 0;

        for (const recipient of recipients) {
            if (recipient.status !== 'pending') {
                if (recipient.status === 'sent') sent += 1;
                if (recipient.status === 'failed') failed += 1;
                if (recipient.status === 'skipped') skipped += 1;
                continue;
            }

            const context = { nombre: recipient.recipientName, correo: recipient.recipientEmail, empresa };
            try {
                const subject = interpolate(campaign.subject, context);
                const html = renderCampaignHtml(campaign.body, context);
                const result = await messagingService.sendEmail({
                    tenantId,
                    to: recipient.recipientEmail,
                    recipientName: recipient.recipientName,
                    subject,
                    html,
                    text: interpolate(campaign.body, context),
                    source: 'campaign',
                    eventKey: 'campaign_email',
                    templateKey: 'campaign_basic',
                    relatedTable: 'messaging_campaigns',
                    relatedId: String(campaignId),
                    metadata: { campaignId, audienceType: campaign.audience_type },
                    createdBy: user.usuario || user.codUsuario || campaign.created_by || null,
                });
                await pool.query(`
                    UPDATE messaging_campaign_recipients
                    SET status = 'sent', message_id = $4, sent_at = NOW(), error = NULL, updated_at = NOW()
                    WHERE tenant_id = $1 AND campaign_id = $2 AND id = $3
                `, [tenantId, campaignId, recipient.id, result.id || null]);
                sent += 1;
            } catch (err) {
                failed += 1;
                await pool.query(`
                    UPDATE messaging_campaign_recipients
                    SET status = 'failed', error = $4, updated_at = NOW()
                    WHERE tenant_id = $1 AND campaign_id = $2 AND id = $3
                `, [tenantId, campaignId, recipient.id, String(err.message || err).substring(0, 2000)]);
            }

            await pool.query(`
                UPDATE messaging_campaigns
                SET sent_count = $3, failed_count = $4, skipped_count = $5, updated_at = NOW()
                WHERE tenant_id = $1 AND id = $2
            `, [tenantId, campaignId, sent, failed, skipped]);
        }

        await pool.query(`
            UPDATE messaging_campaigns
            SET status = CASE WHEN $3 = 0 AND $4 > 0 THEN 'failed' ELSE 'sent' END,
                sent_count = $3,
                failed_count = $4,
                skipped_count = $5,
                finished_at = NOW(),
                updated_at = NOW()
            WHERE tenant_id = $1 AND id = $2
        `, [tenantId, campaignId, sent, failed, skipped]);
    });
}

async function sendCampaign(tenantId, id, user = {}) {
    const { rows } = await pool.query(
        'SELECT * FROM messaging_campaigns WHERE tenant_id = $1 AND id = $2',
        [tenantId, id]
    );
    const campaign = rows[0];
    if (!campaign) {
        const err = new Error('Campana no encontrada.');
        err.statusCode = 404;
        throw err;
    }
    if (!['draft', 'failed', 'scheduled'].includes(campaign.status)) {
        const err = new Error('La campana ya fue enviada o esta en proceso.');
        err.statusCode = 409;
        throw err;
    }

    await seedRecipients(tenantId, campaign);
    const count = await pool.query(`
        SELECT COUNT(*)::int AS total
        FROM messaging_campaign_recipients
        WHERE tenant_id = $1 AND campaign_id = $2
    `, [tenantId, id]);

    if (Number(count.rows[0]?.total || 0) === 0) {
        const err = new Error('La audiencia seleccionada no tiene correos validos.');
        err.statusCode = 400;
        throw err;
    }

    const updated = await pool.query(`
        UPDATE messaging_campaigns
        SET status = 'sending', sent_at = NOW(), finished_at = NULL,
            sent_count = 0, failed_count = 0, skipped_count = 0, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
    `, [tenantId, id]);

    setImmediate(() => {
        processCampaign(tenantId, id, user).catch(err => {
            console.error('[messaging-campaigns] Error enviando campana:', err.message);
        });
    });

    return mapCampaign(updated.rows[0]);
}

async function scheduleCampaign(tenantId, id, scheduledAt, user = {}) {
    const date = normalizeScheduledAt(scheduledAt);
    if (!date) {
        const err = new Error('La fecha programada es requerida.');
        err.statusCode = 400;
        throw err;
    }

    const { rows } = await pool.query(`
        UPDATE messaging_campaigns
        SET status = 'scheduled',
            scheduled_at = $3,
            queued_at = NOW(),
            updated_at = NOW(),
            metadata = metadata || jsonb_build_object('scheduledBy', $4)
        WHERE tenant_id = $1
          AND id = $2
          AND status IN ('draft', 'failed', 'scheduled')
        RETURNING *
    `, [tenantId, id, date, user.usuario || user.codUsuario || 'system']);

    if (!rows[0]) {
        const err = new Error('Campana no encontrada o no disponible para programar.');
        err.statusCode = 404;
        throw err;
    }

    return mapCampaign(rows[0]);
}

async function cancelCampaign(tenantId, id, user = {}) {
    const { rows } = await pool.query(`
        UPDATE messaging_campaigns
        SET status = 'cancelled',
            updated_at = NOW(),
            metadata = metadata || jsonb_build_object('cancelledBy', $3)
        WHERE tenant_id = $1
          AND id = $2
          AND status IN ('draft', 'scheduled', 'failed')
        RETURNING *
    `, [tenantId, id, user.usuario || user.codUsuario || 'system']);

    if (!rows[0]) {
        const err = new Error('Campana no encontrada o no disponible para cancelar.');
        err.statusCode = 404;
        throw err;
    }

    return mapCampaign(rows[0]);
}

async function processDueCampaigns(tenantId, limit = 3) {
    return setRequestTenant(tenantId, async () => {
        const { rows } = await pool.query(`
            WITH due AS (
                SELECT id
                FROM messaging_campaigns
                WHERE tenant_id = $1
                  AND status = 'scheduled'
                  AND scheduled_at <= NOW()
                ORDER BY scheduled_at ASC, id ASC
                LIMIT $2
                FOR UPDATE SKIP LOCKED
            )
            UPDATE messaging_campaigns c
            SET status = 'sending',
                sent_at = NOW(),
                finished_at = NULL,
                sent_count = 0,
                failed_count = 0,
                skipped_count = 0,
                updated_at = NOW()
            FROM due
            WHERE c.id = due.id
            RETURNING c.*
        `, [tenantId, Math.max(1, Math.min(10, Number(limit) || 3))]);

        for (const campaign of rows) {
            await seedRecipients(tenantId, campaign);
            const count = await pool.query(`
                SELECT COUNT(*)::int AS total
                FROM messaging_campaign_recipients
                WHERE tenant_id = $1 AND campaign_id = $2
            `, [tenantId, campaign.id]);

            if (Number(count.rows[0]?.total || 0) === 0) {
                await pool.query(`
                    UPDATE messaging_campaigns
                    SET status = 'failed',
                        finished_at = NOW(),
                        metadata = metadata || jsonb_build_object('schedulerError', 'Audiencia sin correos validos'),
                        updated_at = NOW()
                    WHERE tenant_id = $1 AND id = $2
                `, [tenantId, campaign.id]);
                continue;
            }

            await processCampaign(tenantId, campaign.id, { usuario: 'scheduler' });
        }

        return rows.length;
    });
}

module.exports = {
    previewAudience,
    listAudienceDefinitions,
    listCampaigns,
    createCampaign,
    updateCampaign,
    listRecipients,
    sendCampaign,
    scheduleCampaign,
    cancelCampaign,
    processDueCampaigns,
};
