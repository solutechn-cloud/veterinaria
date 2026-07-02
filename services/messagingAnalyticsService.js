'use strict';

const { pool } = require('../config/db');

function toDateOnly(value, fallbackDate) {
    if (!value) return fallbackDate.toISOString().slice(0, 10);
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return fallbackDate.toISOString().slice(0, 10);
    return parsed.toISOString().slice(0, 10);
}

function normalizeRange(filters = {}) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    return {
        desde: toDateOnly(filters.desde, start),
        hasta: toDateOnly(filters.hasta, end),
    };
}

function rate(value, total) {
    if (!total) return 0;
    return Number(((Number(value || 0) / Number(total || 0)) * 100).toFixed(1));
}

function mapCountRows(rows, keyName = 'key') {
    return rows.map(row => ({
        key: row[keyName] || 'sin_clasificar',
        label: row[keyName] || 'Sin clasificar',
        total: Number(row.total || 0),
    }));
}

function mapCampaign(row) {
    return {
        id: Number(row.id),
        name: row.name,
        status: row.status,
        totalRecipients: Number(row.total_recipients || 0),
        sentCount: Number(row.sent_count || 0),
        failedCount: Number(row.failed_count || 0),
        skippedCount: Number(row.skipped_count || 0),
        scheduledAt: row.scheduled_at,
        sentAt: row.sent_at,
        finishedAt: row.finished_at,
        createdAt: row.created_at,
    };
}

function mapFailure(row) {
    return {
        id: Number(row.id),
        recipientEmail: row.recipient_email,
        recipientName: row.recipient_name,
        subject: row.subject,
        status: row.status,
        eventKey: row.event_key,
        lastError: row.last_error,
        attempts: Number(row.attempts || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

async function getAnalytics(tenantId, filters = {}) {
    const range = normalizeRange(filters);
    const params = [tenantId, range.desde, range.hasta];
    const messageWhere = `
        tenant_id = $1
        AND created_at >= $2::date
        AND created_at < ($3::date + INTERVAL '1 day')
    `;
    const eventWhere = `
        tenant_id = $1
        AND occurred_at >= $2::date
        AND occurred_at < ($3::date + INTERVAL '1 day')
    `;
    const campaignWhere = `
        tenant_id = $1
        AND created_at >= $2::date
        AND created_at < ($3::date + INTERVAL '1 day')
    `;

    const [
        totalsRes,
        statusRes,
        eventRes,
        sourceRes,
        dailyRes,
        campaignSummaryRes,
        campaignTopRes,
        upcomingRes,
        failuresRes,
        providerEventRes,
    ] = await Promise.all([
        pool.query(`
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked'))::int AS sent,
                COUNT(*) FILTER (WHERE status IN ('delivered','opened','clicked') OR delivered_at IS NOT NULL)::int AS delivered,
                COUNT(*) FILTER (WHERE status IN ('opened','clicked') OR opened_at IS NOT NULL)::int AS opened,
                COUNT(*) FILTER (WHERE status = 'clicked' OR clicked_at IS NOT NULL)::int AS clicked,
                COUNT(*) FILTER (WHERE status IN ('failed','bounced','complained'))::int AS failed,
                COUNT(*) FILTER (WHERE status IN ('queued','sending'))::int AS in_process
            FROM messaging_messages
            WHERE ${messageWhere}
        `, params),
        pool.query(`
            SELECT status AS key, COUNT(*)::int AS total
            FROM messaging_messages
            WHERE ${messageWhere}
            GROUP BY status
            ORDER BY total DESC, status ASC
        `, params),
        pool.query(`
            SELECT COALESCE(event_key, source, 'sin_clasificar') AS key, COUNT(*)::int AS total
            FROM messaging_messages
            WHERE ${messageWhere}
            GROUP BY COALESCE(event_key, source, 'sin_clasificar')
            ORDER BY total DESC
            LIMIT 12
        `, params),
        pool.query(`
            SELECT COALESCE(source, 'sin_origen') AS key, COUNT(*)::int AS total
            FROM messaging_messages
            WHERE ${messageWhere}
            GROUP BY COALESCE(source, 'sin_origen')
            ORDER BY total DESC
            LIMIT 8
        `, params),
        pool.query(`
            SELECT
                created_at::date AS day,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked'))::int AS sent,
                COUNT(*) FILTER (WHERE status IN ('failed','bounced','complained'))::int AS failed
            FROM messaging_messages
            WHERE ${messageWhere}
            GROUP BY created_at::date
            ORDER BY created_at::date ASC
        `, params),
        pool.query(`
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
                COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                COALESCE(SUM(total_recipients), 0)::int AS total_recipients,
                COALESCE(SUM(sent_count), 0)::int AS sent_count,
                COALESCE(SUM(failed_count), 0)::int AS failed_count,
                COALESCE(SUM(skipped_count), 0)::int AS skipped_count
            FROM messaging_campaigns
            WHERE ${campaignWhere}
        `, params),
        pool.query(`
            SELECT *
            FROM messaging_campaigns
            WHERE ${campaignWhere}
            ORDER BY (sent_count + failed_count + skipped_count) DESC, created_at DESC
            LIMIT 8
        `, params),
        pool.query(`
            SELECT *
            FROM messaging_campaigns
            WHERE tenant_id = $1
              AND status = 'scheduled'
              AND scheduled_at >= NOW()
            ORDER BY scheduled_at ASC
            LIMIT 8
        `, [tenantId]),
        pool.query(`
            SELECT id, recipient_email, recipient_name, subject, status, event_key, last_error, attempts, created_at, updated_at
            FROM messaging_messages
            WHERE ${messageWhere}
              AND status IN ('failed','bounced','complained')
            ORDER BY updated_at DESC
            LIMIT 8
        `, params),
        pool.query(`
            SELECT event_type AS key, COUNT(*)::int AS total
            FROM messaging_events
            WHERE ${eventWhere}
            GROUP BY event_type
            ORDER BY total DESC
            LIMIT 12
        `, params),
    ]);

    const totalsRow = totalsRes.rows[0] || {};
    const totals = {
        total: Number(totalsRow.total || 0),
        sent: Number(totalsRow.sent || 0),
        delivered: Number(totalsRow.delivered || 0),
        opened: Number(totalsRow.opened || 0),
        clicked: Number(totalsRow.clicked || 0),
        failed: Number(totalsRow.failed || 0),
        inProcess: Number(totalsRow.in_process || 0),
    };

    totals.deliveryRate = rate(totals.delivered, totals.sent);
    totals.openRate = rate(totals.opened, totals.delivered || totals.sent);
    totals.clickRate = rate(totals.clicked, totals.opened || totals.delivered || totals.sent);
    totals.failureRate = rate(totals.failed, totals.total);

    const campaignRow = campaignSummaryRes.rows[0] || {};
    const campaignSummary = {
        total: Number(campaignRow.total || 0),
        scheduled: Number(campaignRow.scheduled || 0),
        sent: Number(campaignRow.sent || 0),
        failed: Number(campaignRow.failed || 0),
        totalRecipients: Number(campaignRow.total_recipients || 0),
        sentCount: Number(campaignRow.sent_count || 0),
        failedCount: Number(campaignRow.failed_count || 0),
        skippedCount: Number(campaignRow.skipped_count || 0),
    };

    return {
        range,
        totals,
        byStatus: mapCountRows(statusRes.rows),
        byEvent: mapCountRows(eventRes.rows),
        bySource: mapCountRows(sourceRes.rows),
        providerEvents: mapCountRows(providerEventRes.rows),
        dailyTrend: dailyRes.rows.map(row => ({
            day: row.day,
            total: Number(row.total || 0),
            sent: Number(row.sent || 0),
            failed: Number(row.failed || 0),
        })),
        campaigns: {
            summary: campaignSummary,
            top: campaignTopRes.rows.map(mapCampaign),
            upcoming: upcomingRes.rows.map(mapCampaign),
        },
        recentFailures: failuresRes.rows.map(mapFailure),
    };
}

module.exports = { getAnalytics };
