'use strict';

const { pool } = require('../config/db');

const VALID_CATEGORIES = new Set(['marketing', 'clinical', 'operations', 'reports', 'custom']);

function clean(value, max = 1000) {
    if (value == null) return '';
    return String(value).trim().substring(0, max);
}

function normalizeCategory(value) {
    const category = clean(value || 'custom', 40);
    return VALID_CATEGORIES.has(category) ? category : 'custom';
}

function normalizePage(filters = {}) {
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(filters.pageSize || 25)));
    return { page, pageSize, offset: (page - 1) * pageSize };
}

function validatePayload(payload = {}, partial = false) {
    const data = {
        name: clean(payload.name, 180),
        category: payload.category ? normalizeCategory(payload.category) : (partial ? null : 'custom'),
        subject: clean(payload.subject, 500),
        body: clean(payload.body, 20000),
        active: typeof payload.active === 'boolean' ? payload.active : null,
    };

    if (!partial && (!data.name || !data.subject || !data.body)) {
        const err = new Error('Nombre, asunto y cuerpo son requeridos.');
        err.statusCode = 400;
        throw err;
    }

    return data;
}

function mapTemplate(row) {
    return {
        id: Number(row.id),
        name: row.name,
        category: row.category,
        subject: row.subject,
        body: row.body,
        active: Boolean(row.active),
        systemKey: row.system_key,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

async function listTemplates(tenantId, filters = {}) {
    const { page, pageSize, offset } = normalizePage(filters);
    const values = [tenantId];
    const where = ['tenant_id = $1'];

    if (filters.category) {
        values.push(normalizeCategory(filters.category));
        where.push(`category = $${values.length}`);
    }

    if (filters.active !== undefined && filters.active !== '') {
        values.push(String(filters.active) !== 'false');
        where.push(`active = $${values.length}`);
    }

    if (filters.q) {
        values.push(`%${String(filters.q).trim()}%`);
        where.push(`(name ILIKE $${values.length} OR subject ILIKE $${values.length})`);
    }

    const clause = where.join(' AND ');
    const [data, count] = await Promise.all([
        pool.query(`
            SELECT *
            FROM messaging_templates
            WHERE ${clause}
            ORDER BY active DESC, category ASC, name ASC
            LIMIT $${values.length + 1} OFFSET $${values.length + 2}
        `, [...values, pageSize, offset]),
        pool.query(`SELECT COUNT(*)::int AS total FROM messaging_templates WHERE ${clause}`, values),
    ]);

    return {
        data: data.rows.map(mapTemplate),
        total: Number(count.rows[0]?.total || 0),
        page,
        pageSize,
    };
}

async function createTemplate(tenantId, payload, user = {}) {
    const data = validatePayload(payload);
    const { rows } = await pool.query(`
        INSERT INTO messaging_templates (tenant_id, name, category, subject, body, active, created_by)
        VALUES ($1, $2, $3, $4, $5, TRUE, $6)
        RETURNING *
    `, [tenantId, data.name, data.category, data.subject, data.body, user.usuario || user.codUsuario || null]);
    return mapTemplate(rows[0]);
}

async function updateTemplate(tenantId, id, payload) {
    const data = validatePayload(payload, true);
    const { rows } = await pool.query(`
        UPDATE messaging_templates
        SET name = COALESCE(NULLIF($3, ''), name),
            category = COALESCE($4, category),
            subject = COALESCE(NULLIF($5, ''), subject),
            body = COALESCE(NULLIF($6, ''), body),
            active = COALESCE($7, active),
            updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
    `, [tenantId, id, data.name, data.category, data.subject, data.body, data.active]);

    if (!rows[0]) {
        const err = new Error('Plantilla no encontrada.');
        err.statusCode = 404;
        throw err;
    }

    return mapTemplate(rows[0]);
}

async function archiveTemplate(tenantId, id) {
    return updateTemplate(tenantId, id, { active: false });
}

module.exports = {
    listTemplates,
    createTemplate,
    updateTemplate,
    archiveTemplate,
};
