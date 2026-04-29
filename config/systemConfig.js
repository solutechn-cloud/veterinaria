'use strict';

const { pool } = require('./db');

// Run once at first use to ensure columns exist (idempotent)
let _migrated = false;
async function ensureColumns() {
    if (_migrated) return;
    await pool.query(`
        ALTER TABLE configuracion
            ADD COLUMN IF NOT EXISTS admin_email       VARCHAR(255),
            ADD COLUMN IF NOT EXISTS email_from        VARCHAR(255),
            ADD COLUMN IF NOT EXISTS saldo_tigo_umbral NUMERIC(12,2) DEFAULT 500,
            ADD COLUMN IF NOT EXISTS saldo_claro_umbral NUMERIC(12,2) DEFAULT 500,
            ADD COLUMN IF NOT EXISTS drive_folder_id   VARCHAR(255)
    `);
    _migrated = true;
}

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

async function getSystemConfig() {
    const now = Date.now();
    if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache;

    try {
        await ensureColumns();
        const r = await pool.query(
            'SELECT admin_email, email_from, saldo_tigo_umbral, saldo_claro_umbral, drive_folder_id FROM configuracion WHERE id = 1'
        );
        const row = r.rows[0] || {};
        _cache = {
            adminEmail:       row.admin_email                               || process.env.ADMIN_EMAIL                || '',
            emailFrom:        row.email_from                                || process.env.EMAIL_FROM                 || 'ERPSmartCloud <noreply@erpsmartcloud.com>',
            saldoTigoUmbral:  Number(row.saldo_tigo_umbral  ?? process.env.SALDO_TIGO_UMBRAL  ?? 500),
            saldoClaroUmbral: Number(row.saldo_claro_umbral ?? process.env.SALDO_CLARO_UMBRAL ?? 500),
            driveFolderId:    row.drive_folder_id                           || process.env.GOOGLE_DRIVE_FOLDER_ID     || 'root',
        };
    } catch (err) {
        console.warn('[systemConfig] DB error, using env fallback:', err.message);
        _cache = {
            adminEmail:       process.env.ADMIN_EMAIL                || '',
            emailFrom:        process.env.EMAIL_FROM                 || 'ERPSmartCloud <noreply@erpsmartcloud.com>',
            saldoTigoUmbral:  Number(process.env.SALDO_TIGO_UMBRAL  ?? 500),
            saldoClaroUmbral: Number(process.env.SALDO_CLARO_UMBRAL ?? 500),
            driveFolderId:    process.env.GOOGLE_DRIVE_FOLDER_ID     || 'root',
        };
    }
    _cacheTime = Date.now();
    return _cache;
}

function invalidateSystemConfigCache() {
    _cache = null;
    _cacheTime = 0;
}

module.exports = { getSystemConfig, invalidateSystemConfigCache };
