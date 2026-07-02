'use strict';

const crypto = require('crypto');
const { Resend } = require('resend');
const { pool, getCurrentRequestContext } = require('../config/db');

let resendClient = null;

function getResendClient() {
    if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
}

function resolveTenantId(tenantId) {
    return tenantId || getCurrentRequestContext()?.tenantId || null;
}

function cleanText(value, max = 1000) {
    if (value == null) return null;
    return String(value).trim().substring(0, max) || null;
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function assertEmail(value) {
    const email = normalizeEmail(value);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const err = new Error('Correo electronico invalido.');
        err.statusCode = 400;
        throw err;
    }
    return email;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function textToHtml(text) {
    return `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1f2937;">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
}

function extractProviderId(response) {
    return response?.data?.id || response?.id || null;
}

function mapMessageRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        channel: row.channel,
        source: row.source,
        eventKey: row.event_key,
        templateKey: row.template_key,
        fromEmail: row.from_email,
        recipientEmail: row.recipient_email,
        recipientName: row.recipient_name,
        subject: row.subject,
        status: row.status,
        provider: row.provider,
        providerMessageId: row.provider_message_id,
        relatedTable: row.related_table,
        relatedId: row.related_id,
        scheduledAt: row.scheduled_at,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        openedAt: row.opened_at,
        clickedAt: row.clicked_at,
        failedAt: row.failed_at,
        attempts: Number(row.attempts || 0),
        lastError: row.last_error,
        metadata: row.metadata || {},
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function normalizePage(filters = {}) {
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(filters.pageSize || 25)));
    return { page, pageSize, offset: (page - 1) * pageSize };
}

function buildFilters(tenantId, filters = {}) {
    const where = ['tenant_id = $1'];
    const values = [tenantId];
    const add = (sql, value) => {
        values.push(value);
        where.push(sql.replace('?', `$${values.length}`));
    };

    if (filters.status) add('status = ?', String(filters.status));
    if (filters.eventKey) add('event_key = ?', String(filters.eventKey));
    if (filters.desde) add('created_at >= ?::timestamptz', String(filters.desde));
    if (filters.hasta) add('created_at < (?::date + INTERVAL \'1 day\')', String(filters.hasta));
    if (filters.q) {
        values.push(`%${String(filters.q).trim()}%`);
        where.push(`(recipient_email ILIKE $${values.length} OR subject ILIKE $${values.length} OR COALESCE(event_key, '') ILIKE $${values.length})`);
    }
    return { where: where.join(' AND '), values };
}

async function insertEvent(tenantId, messageId, eventType, payload = {}, providerEventId = null) {
    await pool.query(`
        INSERT INTO messaging_events (tenant_id, message_id, provider, provider_event_id, event_type, payload, occurred_at)
        VALUES ($1, $2, 'resend', $3, $4, $5::jsonb, NOW())
        ON CONFLICT (provider, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING
    `, [tenantId, messageId, providerEventId, eventType, JSON.stringify(payload || {})]);
}

async function sendTracked(messageId, email) {
    const response = await getResendClient().emails.send(email);
    if (response?.error) {
        const err = new Error(response.error.message || 'Resend rechazo el envio.');
        err.providerError = response.error;
        throw err;
    }
    const providerMessageId = extractProviderId(response);
    await pool.query(`
        UPDATE messaging_messages
        SET status = 'sent',
            provider_message_id = COALESCE($2, provider_message_id),
            sent_at = NOW(),
            failed_at = NULL,
            last_error = NULL,
            updated_at = NOW()
        WHERE id = $1
    `, [messageId, providerMessageId]);
    return { providerMessageId, response };
}

async function sendEmail(payload) {
    const tenantId = resolveTenantId(payload.tenantId);
    const to = assertEmail(payload.to);
    const subject = cleanText(payload.subject, 500);
    const html = payload.html || textToHtml(payload.text || payload.body || '');
    const text = cleanText(payload.text || payload.body, 20000);
    const from = cleanText(payload.from, 255) || process.env.EMAIL_FROM || 'ERPSmartCloud <noreply@erpsmartcloud.com>';
    if (!subject) {
        const err = new Error('El asunto del correo es requerido.');
        err.statusCode = 400;
        throw err;
    }

    if (!tenantId) {
        const response = await getResendClient().emails.send({ from, to, subject, html, text: text || undefined });
        if (response?.error) throw new Error(response.error.message || 'Resend rechazo el envio.');
        return { success: true, providerMessageId: extractProviderId(response), tracked: false };
    }

    let messageId = null;
    try {
        const inserted = await pool.query(`
            INSERT INTO messaging_messages (
                tenant_id, source, event_key, template_key, from_email, recipient_email,
                recipient_name, subject, html_body, text_body, status, provider,
                related_table, related_id, attempts, metadata, created_by
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sending','resend',$11,$12,1,$13::jsonb,$14)
            RETURNING id
        `, [
            tenantId,
            cleanText(payload.source, 80),
            cleanText(payload.eventKey, 80),
            cleanText(payload.templateKey, 80),
            from,
            to,
            cleanText(payload.recipientName, 180),
            subject,
            html,
            text,
            cleanText(payload.relatedTable, 80),
            cleanText(payload.relatedId, 120),
            JSON.stringify(payload.metadata || {}),
            cleanText(payload.createdBy, 80),
        ]);
        messageId = inserted.rows[0].id;
        const sent = await sendTracked(messageId, { from, to, subject, html, text: text || undefined });
        await insertEvent(tenantId, messageId, 'sent', sent.response, sent.providerMessageId);
        return { success: true, id: Number(messageId), providerMessageId: sent.providerMessageId, tracked: true };
    } catch (err) {
        if (messageId) {
            await pool.query(`
                UPDATE messaging_messages
                SET status = 'failed', last_error = $2, failed_at = NOW(), updated_at = NOW()
                WHERE id = $1
            `, [messageId, String(err.message || err).substring(0, 2000)]).catch(() => {});
            await insertEvent(tenantId, messageId, 'failed', { error: err.message }).catch(() => {});
        }
        throw err;
    }
}

async function listMessages(tenantId, filters = {}) {
    const { page, pageSize, offset } = normalizePage(filters);
    const built = buildFilters(tenantId, filters);
    const dataParams = [...built.values, pageSize, offset];
    const limitParam = built.values.length + 1;
    const offsetParam = built.values.length + 2;

    const [dataRes, countRes, summaryRes] = await Promise.all([
        pool.query(`
            SELECT *
            FROM messaging_messages
            WHERE ${built.where}
            ORDER BY created_at DESC
            LIMIT $${limitParam} OFFSET $${offsetParam}
        `, dataParams),
        pool.query(`SELECT COUNT(*)::int AS total FROM messaging_messages WHERE ${built.where}`, built.values),
        pool.query(`
            SELECT status, COUNT(*)::int AS total
            FROM messaging_messages
            WHERE tenant_id = $1
            GROUP BY status
        `, [tenantId]),
    ]);

    const summary = {};
    for (const row of summaryRes.rows) summary[row.status] = Number(row.total);
    return {
        data: dataRes.rows.map(mapMessageRow),
        total: Number(countRes.rows[0]?.total || 0),
        page,
        pageSize,
        summary,
    };
}

async function getMessageEvents(tenantId, id) {
    const { rows } = await pool.query(`
        SELECT id, event_type, provider_event_id, payload, occurred_at, created_at
        FROM messaging_events
        WHERE tenant_id = $1 AND message_id = $2
        ORDER BY occurred_at DESC, id DESC
    `, [tenantId, id]);
    return rows.map(row => ({
        id: Number(row.id),
        eventType: row.event_type,
        providerEventId: row.provider_event_id,
        payload: row.payload,
        occurredAt: row.occurred_at,
        createdAt: row.created_at,
    }));
}

async function resendMessage(tenantId, id, user = {}) {
    const { rows } = await pool.query(
        'SELECT * FROM messaging_messages WHERE tenant_id = $1 AND id = $2 LIMIT 1',
        [tenantId, id]
    );
    const message = rows[0];
    if (!message) {
        const err = new Error('Mensaje no encontrado.');
        err.statusCode = 404;
        throw err;
    }

    await pool.query(`
        UPDATE messaging_messages
        SET status = 'sending', attempts = attempts + 1, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
    `, [tenantId, id]);
    await insertEvent(tenantId, id, 'resend_requested', { user: user.usuario || user.codUsuario || null });

    try {
        const sent = await sendTracked(id, {
            from: message.from_email || process.env.EMAIL_FROM,
            to: message.recipient_email,
            subject: message.subject,
            html: message.html_body || textToHtml(message.text_body || ''),
            text: message.text_body || undefined,
        });
        await insertEvent(tenantId, id, 'resent', sent.response, sent.providerMessageId);
        return { success: true, providerMessageId: sent.providerMessageId };
    } catch (err) {
        await pool.query(`
            UPDATE messaging_messages
            SET status = 'failed', last_error = $3, failed_at = NOW(), updated_at = NOW()
            WHERE tenant_id = $1 AND id = $2
        `, [tenantId, id, String(err.message || err).substring(0, 2000)]);
        await insertEvent(tenantId, id, 'failed', { error: err.message });
        throw err;
    }
}

async function sendManualMessage(tenantId, payload, user = {}) {
    return sendEmail({
        tenantId,
        to: payload.to,
        subject: payload.subject,
        html: payload.html || textToHtml(payload.body || payload.text || ''),
        text: payload.text || payload.body || '',
        source: 'manual',
        eventKey: 'manual_email',
        templateKey: 'manual_basic',
        metadata: { manual: true },
        createdBy: user.usuario || user.codUsuario || null,
    });
}

function parseWebhookPayload(rawBody) {
    const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '{}');
    return { body, payload: JSON.parse(body || '{}') };
}

function decodeSecret(secret) {
    const value = String(secret || '').replace(/^whsec_/, '');
    return Buffer.from(value, 'base64');
}

function verifyResendSignature(body, headers = {}) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return true;
    const id = headers['svix-id'];
    const timestamp = headers['svix-timestamp'];
    const signature = headers['svix-signature'];
    if (!id || !timestamp || !signature) return false;
    const signed = `${id}.${timestamp}.${body}`;
    const digest = crypto.createHmac('sha256', decodeSecret(secret)).update(signed).digest('base64');
    return String(signature).split(' ').some(part => {
        const candidate = part.replace(/^v1,/, '').trim();
        if (!candidate) return false;
        try {
            return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(digest));
        } catch {
            return false;
        }
    });
}

function getProviderMessageId(payload) {
    return payload?.data?.email_id || payload?.data?.id || payload?.email_id || payload?.id || null;
}

function statusFromResendEvent(type) {
    const value = String(type || '').toLowerCase();
    if (value.includes('delivered')) return { status: 'delivered', column: 'delivered_at' };
    if (value.includes('opened')) return { status: 'opened', column: 'opened_at' };
    if (value.includes('clicked')) return { status: 'clicked', column: 'clicked_at' };
    if (value.includes('bounced')) return { status: 'bounced', column: 'failed_at' };
    if (value.includes('complained')) return { status: 'complained', column: 'failed_at' };
    if (value.includes('failed')) return { status: 'failed', column: 'failed_at' };
    if (value.includes('sent')) return { status: 'sent', column: 'sent_at' };
    return { status: null, column: null };
}

async function processResendWebhook(rawBody, headers = {}) {
    const { body, payload } = parseWebhookPayload(rawBody);
    if (!verifyResendSignature(body, headers)) {
        const err = new Error('Firma de webhook invalida.');
        err.statusCode = 401;
        throw err;
    }

    const eventType = payload.type || payload.event || 'unknown';
    const providerMessageId = getProviderMessageId(payload);
    if (!providerMessageId) return { ok: true, ignored: true };

    const { rows } = await pool.query(
        'SELECT id, tenant_id FROM messaging_messages WHERE provider = $1 AND provider_message_id = $2 LIMIT 1',
        ['resend', providerMessageId]
    );
    const message = rows[0];
    if (!message) return { ok: true, ignored: true };

    const providerEventId = payload.id || `${providerMessageId}:${eventType}:${payload.created_at || Date.now()}`;
    await insertEvent(message.tenant_id, message.id, eventType, payload, providerEventId);

    const mapped = statusFromResendEvent(eventType);
    if (mapped.status && mapped.column) {
        await pool.query(`
            UPDATE messaging_messages
            SET status = CASE
                    WHEN $3 IN ('failed','bounced','complained') THEN $3
                    WHEN status IN ('failed','bounced','complained') THEN status
                    WHEN CASE $3
                        WHEN 'sent' THEN 2
                        WHEN 'delivered' THEN 3
                        WHEN 'opened' THEN 4
                        WHEN 'clicked' THEN 5
                        ELSE 0
                    END >= CASE status
                        WHEN 'sent' THEN 2
                        WHEN 'delivered' THEN 3
                        WHEN 'opened' THEN 4
                        WHEN 'clicked' THEN 5
                        ELSE 0
                    END THEN $3
                    ELSE status
                END,
                ${mapped.column} = COALESCE(${mapped.column}, NOW()),
                updated_at = NOW(),
                last_error = CASE WHEN $3 IN ('failed','bounced','complained') THEN COALESCE($4, last_error) ELSE last_error END
            WHERE tenant_id = $1 AND id = $2
        `, [message.tenant_id, message.id, mapped.status, payload?.data?.reason || payload?.data?.error || null]);
    }
    return { ok: true };
}

module.exports = {
    sendEmail,
    listMessages,
    getMessageEvents,
    resendMessage,
    sendManualMessage,
    processResendWebhook,
};
