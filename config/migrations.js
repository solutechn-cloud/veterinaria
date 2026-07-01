const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../scripts/migrations');
const MIGRATION_LOCK_KEY = 'smartcloud:schema_migrations';

function splitSqlStatements(sql) {
    const statements = [];
    let current = '';
    let i = 0;
    let singleQuote = false;
    let doubleQuote = false;
    let dollarTag = null;

    while (i < sql.length) {
        const ch = sql[i];
        const next = sql[i + 1];

        if (dollarTag) {
            if (sql.startsWith(dollarTag, i)) {
                current += dollarTag;
                i += dollarTag.length;
                dollarTag = null;
                continue;
            }
            current += ch;
            i += 1;
            continue;
        }

        if (singleQuote) {
            current += ch;
            if (ch === "'" && next === "'") {
                current += next;
                i += 2;
                continue;
            }
            if (ch === "'") singleQuote = false;
            i += 1;
            continue;
        }

        if (doubleQuote) {
            current += ch;
            if (ch === '"' && next === '"') {
                current += next;
                i += 2;
                continue;
            }
            if (ch === '"') doubleQuote = false;
            i += 1;
            continue;
        }

        if (ch === '-' && next === '-') {
            while (i < sql.length && sql[i] !== '\n') i += 1;
            continue;
        }

        if (ch === '/' && next === '*') {
            i += 2;
            while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
            i += 2;
            continue;
        }

        if (ch === "'") {
            singleQuote = true;
            current += ch;
            i += 1;
            continue;
        }

        if (ch === '"') {
            doubleQuote = true;
            current += ch;
            i += 1;
            continue;
        }

        if (ch === '$') {
            const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
            if (match) {
                dollarTag = match[0];
                current += dollarTag;
                i += dollarTag.length;
                continue;
            }
        }

        if (ch === ';') {
            const statement = current.trim();
            if (statement) statements.push(statement);
            current = '';
            i += 1;
            continue;
        }

        current += ch;
        i += 1;
    }

    const tail = current.trim();
    if (tail) statements.push(tail);
    return statements;
}

/**
 * Applies all pending SQL migrations from scripts/migrations/ in alphabetical order.
 * Tracks applied versions in schema_migrations.
 */
async function runMigrations(pool) {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        console.log('[migrations] Directory not found, skipping.');
        return;
    }

    const client = await pool.connect();
    let lockAcquired = false;
    try {
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_KEY]);
        lockAcquired = true;
        await applyPendingMigrations(client);
    } finally {
        try {
            if (lockAcquired) {
                await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_KEY]);
            }
        } finally {
            client.release();
        }
    }
}

async function applyPendingMigrations(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    VARCHAR(100) PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    if (files.length === 0) {
        console.log('[migrations] No migration files found.');
        return;
    }

    const { rows: applied } = await client.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(applied.map(r => r.version));

    for (const file of files) {
        const version = path.basename(file, '.sql');
        if (appliedSet.has(version)) continue;

        console.log(`[migrations] Applying: ${file}`);
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        // Send one statement at a time without breaking DO $$ / function bodies.
        const statements = splitSqlStatements(sql);
        for (const stmt of statements) {
            await client.query(stmt);
        }
        await client.query(
            'INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING',
            [version]
        );
        console.log(`[migrations] Applied:  ${file}`);
        appliedSet.add(version);
    }

    console.log('[migrations] All migrations up to date.');
}

module.exports = { runMigrations, splitSqlStatements };
