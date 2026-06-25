'use strict';

const { pool } = require('./db');

// Per-tenant config cache: Map<tenantId, { data, cachedAt }>
const _cache = new Map();
const CACHE_TTL = 60_000; // 60 seconds

// Run once at first use to ensure columns exist (idempotent)
let _migrated = false;
async function ensureColumns() {
    if (_migrated) return;
    try {
        await pool.query(`
            ALTER TABLE configuracion
                ADD COLUMN IF NOT EXISTS admin_email        VARCHAR(255),
                ADD COLUMN IF NOT EXISTS email_from         VARCHAR(255),
                ADD COLUMN IF NOT EXISTS automation_sender_name VARCHAR(120),
                ADD COLUMN IF NOT EXISTS backup_r2_prefix VARCHAR(255) DEFAULT 'backups',
                ADD COLUMN IF NOT EXISTS backup_retention_days INTEGER DEFAULT 30,
                ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS backup_time TIME DEFAULT '02:30'
        `);
    } catch (_) { /* already exists or no-op */ }
    _migrated = true;
}

const ENV_FALLBACK = () => ({
    adminEmail:       process.env.ADMIN_EMAIL                 || '',
    emailFrom:        process.env.EMAIL_FROM                  || 'VetCare ERP <noreply@erpsmartcloud.com>',
    automationSenderName: process.env.AUTOMATION_SENDER_NAME  || 'VetCare ERP',
    backupR2Prefix:   process.env.BACKUP_R2_PREFIX            || 'backups',
    backupRetentionDays: Number(process.env.BACKUP_RETENTION_DAYS ?? 30),
    backupEnabled:    process.env.BACKUP_ENABLED !== 'false',
    backupTime:       process.env.BACKUP_TIME                 || '02:30',
});

/**
 * Get system configuration for a specific tenant.
 * @param {string|null} tenantId - UUID of the tenant, or null for env-var fallback
 */
async function getSystemConfig(tenantId = null) {
    const cacheKey = tenantId || '__env__';
    const now = Date.now();
    const cached = _cache.get(cacheKey);
    if (cached && (now - cached.cachedAt) < CACHE_TTL) return cached.data;

    try {
        await ensureColumns();
        let r;
        if (tenantId) {
            r = await pool.query(
                `SELECT admin_email, email_from, automation_sender_name, backup_r2_prefix,
                        backup_retention_days, backup_enabled, backup_time
                 FROM configuracion WHERE tenant_id = $1`,
                [tenantId]
            );
        } else {
            // Legacy / super-admin context: use env vars
            const data = ENV_FALLBACK();
            _cache.set(cacheKey, { data, cachedAt: now });
            return data;
        }
        const row = r.rows[0] || {};
        const data = {
            adminEmail:       row.admin_email                              || process.env.ADMIN_EMAIL  || '',
            emailFrom:        row.email_from                               || process.env.EMAIL_FROM   || 'VetCare ERP <noreply@erpsmartcloud.com>',
            automationSenderName: row.automation_sender_name               || process.env.AUTOMATION_SENDER_NAME || 'VetCare ERP',
            backupR2Prefix:   row.backup_r2_prefix                         || process.env.BACKUP_R2_PREFIX || 'backups',
            backupRetentionDays: Number(row.backup_retention_days ?? process.env.BACKUP_RETENTION_DAYS ?? 30),
            backupEnabled:    row.backup_enabled !== false && process.env.BACKUP_ENABLED !== 'false',
            backupTime:       row.backup_time ? String(row.backup_time).slice(0, 5) : (process.env.BACKUP_TIME || '02:30'),
        };
        _cache.set(cacheKey, { data, cachedAt: now });
        return data;
    } catch (err) {
        console.warn('[systemConfig] DB error, using env fallback:', err.message);
        const data = ENV_FALLBACK();
        _cache.set(cacheKey, { data, cachedAt: now });
        return data;
    }
}

function invalidateSystemConfigCache(tenantId = null) {
    if (tenantId) _cache.delete(tenantId);
    else _cache.clear();
}

module.exports = { getSystemConfig, invalidateSystemConfigCache };
