
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');

const _CONNECT_TIMEOUT_MS = parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10);
const _QUERY_TIMEOUT_MS = Math.max(1000, parseInt(process.env.DB_QUERY_TIMEOUT_MS || '60000', 10) || 60000);
const _STATEMENT_TIMEOUT_MS = Math.max(
    1000,
    parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || String(_QUERY_TIMEOUT_MS), 10) || _QUERY_TIMEOUT_MS
);

const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
  // Keep pool small for remote DBs (Render free tier: 97 connection limit)
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  // Close idle connections after 20 s so Render doesn't reset them first
  idleTimeoutMillis: 20000,
  // Fail fast if the pool is full — don't queue forever
  connectionTimeoutMillis: 10000,
  // Keepalive detects TCP connections that Render silently dropped
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // Set stable session defaults at connection startup instead of before every query.
  options: `-c timezone=America/Tegucigalpa -c statement_timeout=${_STATEMENT_TIMEOUT_MS}`,
});

const getLocalTimestamp = () => {
    try {
        const now = new Date();
        const options = {
            timeZone: 'America/Tegucigalpa',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(now);
        const getPart = (type) => parts.find(p => p.type === type).value;
        return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
    } catch (err) {
        const d = new Date();
        d.setHours(d.getHours() - 6);
        return d.toISOString().replace('T', ' ').substring(0, 19);
    }
};

pool.on('error', (err) => {
    console.error('Unexpected error on idle DB client', err);
});

// Per-request tenant context propagation via AsyncLocalStorage.
// withRequestTenant(...) is called by the withTenant Express middleware.
// pool.query reuses one tenant-scoped client per request; pool.connect keeps
// manual transactions safe by injecting SET LOCAL after BEGIN.
//
//   pool.query  — single-statement path: wraps in its own BEGIN/set_config/COMMIT
//   pool.connect — manual-transaction path: intercepts the caller's BEGIN and injects
//                  set_config right after, so client.query() calls in salesRoutes,
//                  serviceRoutes, adminRoutes, etc. all get app.current_tenant_id set
//                  without any changes to those route files.
const _tenantALS = new AsyncLocalStorage();
const _rawPoolConnect = pool.connect.bind(pool);

function _getTenantStore() {
    const store = _tenantALS.getStore();
    if (!store) return null;
    if (typeof store === 'string') return { tenantId: store };
    return store;
}

function _connectWithTimeout() {
    let timeoutId;
    const connectPromise = _rawPoolConnect();
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const err = new Error(`DB_CONNECT_TIMEOUT: sin respuesta de la base de datos en ${_CONNECT_TIMEOUT_MS / 1000}s`);
            err.code = 'DB_CONNECT_TIMEOUT';
            reject(err);
        }, _CONNECT_TIMEOUT_MS);
    });
    return Promise.race([connectPromise, timeoutPromise])
        .then(client => { clearTimeout(timeoutId); return client; })
        .catch(err  => { clearTimeout(timeoutId); throw err; });
}

async function _connectWithRetry(label) {
    try {
        return await _connectWithTimeout();
    } catch (err) {
        if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'EPIPE') {
            console.warn(`[DB] ${label} falló (${err.code}), reintentando...`);
            return _connectWithTimeout();
        }
        throw err;
    }
}

async function _setTenantContext(client, tenantId, local = false) {
    if (!tenantId) return;
    await client.query(
        "SELECT set_config('app.current_tenant_id', $1, $2)",
        [String(tenantId), Boolean(local)]
    );
}

async function _getRequestClient(store) {
    if (store.client) return store.client;
    if (!store.clientPromise) {
        store.clientPromise = (async () => {
            const client = await _connectWithRetry('request tenant client');
            await _setTenantContext(client, store.tenantId, false);
            store.client = client;
            return client;
        })().catch(err => {
            store.clientPromise = null;
            throw err;
        });
    }
    return store.clientPromise;
}

async function _releaseRequestClient(store) {
    if (!store || store.releaseStarted) return;
    store.releaseStarted = true;

    let client = store.client;
    if (!client && store.clientPromise) {
        client = await store.clientPromise.catch(() => null);
    }
    store.client = null;
    store.clientPromise = null;
    if (!client) return;

    try {
        await client.query('RESET app.current_tenant_id');
        client.release();
    } catch (err) {
        console.error('[DB] Error limpiando contexto tenant:', err.message);
        client.release(err);
    }
}

// Single-statement path: use _connectWithTimeout so there is no double set_config
// when pool.connect (overridden below) would also inject it.
pool.query = async function tenantAwareQuery(...args) {
    const store = _getTenantStore();
    if (store?.tenantId) {
        const client = await _getRequestClient(store);
        return client.query(...args);
    }

    let client;
    try {
        client = await _connectWithRetry('pool.query');
    } catch (connErr) {
        if (connErr.code === 'ECONNRESET' || connErr.code === 'ECONNREFUSED' || connErr.code === 'EPIPE') {
            console.warn('[DB] tenantAwareQuery connect falló (' + connErr.code + '), reintentando...');
            client = await _connectWithTimeout();
        } else {
            throw connErr;
        }
    }
    try {
        return await client.query(...args);
    } finally {
        if (client) client.release();
    }
};

// Manual-transaction path: intercept the caller's BEGIN on every checked-out
// client and inject set_config immediately after it, within the same transaction.
// Routes that use pool.connect() + client.query('BEGIN') get RLS context for free.
pool.connect = async function tenantAwareConnect() {
    // Retry once on recoverable connection errors; enforce wall-clock timeout.
    let client;
    try {
        client = await _connectWithTimeout();
    } catch (err) {
        if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'EPIPE') {
            console.warn('[DB] pool.connect falló (' + err.code + '), reintentando...');
            client = await _connectWithTimeout();
        } else {
            throw err;
        }
    }
    const tenantId = _getTenantStore()?.tenantId;
    if (!tenantId) return client;

    const origQuery   = client.query.bind(client);
    const origRelease = client.release.bind(client);
    let injected = false;

    client.query = async function tenantInterceptQuery(...args) {
        if (!injected) {
            const sql = (typeof args[0] === 'string' ? args[0] : (args[0]?.text ?? '')).trim().toUpperCase();
            if (sql.startsWith('BEGIN')) {
                injected = true;
                await origQuery(...args);
                await _setTenantContext({ query: origQuery }, tenantId, true);
                return;
            }
        }
        return origQuery(...args);
    };

    // Restore the original functions before the connection goes back to the pool.
    client.release = function tenantAwareRelease(err) {
        client.query   = origQuery;
        client.release = origRelease;
        origRelease(err);
    };

    return client;
};

function setRequestTenant(tenantId, fn) {
    if (!tenantId) return fn();
    const store = { tenantId: String(tenantId), client: null, clientPromise: null, releaseStarted: false };
    return _tenantALS.run(store, async () => {
        try {
            return await fn();
        } finally {
            await _releaseRequestClient(store);
        }
    });
}

function withRequestTenant(tenantId, req, res, next) {
    if (!tenantId) return next();

    const store = { tenantId: String(tenantId), client: null, clientPromise: null, releaseStarted: false };
    const cleanup = () => {
        _releaseRequestClient(store).catch(err => {
            console.error('[DB] Error liberando cliente tenant:', err.message);
        });
    };

    res.once('finish', cleanup);
    res.once('close', cleanup);
    return _tenantALS.run(store, next);
}

/**
 * Genera el siguiente ID secuencial para una tabla.
 *
 * Usa pg_advisory_xact_lock keyed al prefix+tabla+columna para serializar
 * llamadas concurrentes. Cuando se pasa un `client` de transacción activa, el
 * lock se mantiene hasta que el COMMIT del caller confirma la INSERT — eliminando
 * la carrera completamente. Cuando se llama sin client (pool), abre una mini
 * transacción propia: el lock protege el SELECT pero la INSERT del caller queda
 * fuera; en Node.js single-thread la ventana es prácticamente cero.
 */
const ALLOWED_ID_COMBOS = new Set([
    // Finanzas
    'arqueo:idarqueo',
    // Acceso (usuarios.codUsuario y roles.idrol son SERIAL — no usar generateNextId para esos)
    'caja:idcaja',
    // Infraestructura
    'proveedores:codproveedor',
    // Ventas
    'ventas:codventa', 'detalleventa:coddetalleventa',
    // Veterinaria
    'medicamentos:codigo',
    'ordenes_compra:codigo', 'recepciones_compra:codigo',
    'transferencias_sucursal:codigo',
]);

function _advisoryLockId(prefix, table, column) {
    let h = 5381;
    const s = `${prefix}:${table}:${column}`;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
    }
    return h;
}

async function generateNextId(table, column, prefix, client = pool) {
    const key = `${table.toLowerCase()}:${column.toLowerCase()}`;
    if (!ALLOWED_ID_COMBOS.has(key)) {
        throw new Error(`generateNextId: combinación no permitida: ${table}/${column}`);
    }
    const safeTable  = table.replace(/[^a-z_]/gi, '');
    const safeColumn = column.replace(/[^a-z_]/gi, '');
    const safePrefix = prefix.replace(/[^A-Z0-9_]/gi, '');
    const lockId     = _advisoryLockId(safePrefix, safeTable, safeColumn);

    const usingPool = client === pool;
    let txClient = client;
    if (usingPool) {
        txClient = await pool.connect();
        await txClient.query('BEGIN');
    }

    try {
        await txClient.query('SELECT pg_advisory_xact_lock($1)', [lockId]);

        const result = await txClient.query(
            `SELECT ${safeColumn} AS id
             FROM ${safeTable}
             WHERE ${safeColumn} LIKE $1
             ORDER BY LENGTH(${safeColumn}) DESC, ${safeColumn} DESC
             LIMIT 1`,
            [`${safePrefix}-%`]
        );
        let maxNum = 0;
        if (result.rows.length > 0) {
            const parts = result.rows[0].id.split(`${safePrefix}-`);
            if (parts.length === 2 && /^\d+$/.test(parts[1])) {
                maxNum = parseInt(parts[1], 10);
            }
        }
        const nextId = `${safePrefix}-${(maxNum + 1).toString().padStart(4, '0')}`;

        if (usingPool) await txClient.query('COMMIT');
        return nextId;
    } catch (err) {
        if (usingPool) await txClient.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        if (usingPool) txClient.release();
    }
}

/**
 * Recalcula y actualiza el balance del arqueo activo de una caja.
 * Excluye depósitos KrediYa (van al banco, no a caja física).
 */
async function updateArqueoBalance(idCaja, client = pool, tenantId = null) {
    try {
        const tenantFilter = tenantId ? 'AND tenant_id = $2' : '';
        const arqParams    = tenantId ? [idCaja, tenantId] : [idCaja];

        const arqRes = await client.query(
            `SELECT idArqueo, montoInicial FROM arqueo WHERE idCaja = $1 AND estado = 'Activo' ${tenantFilter}`,
            arqParams
        );
        if (arqRes.rows.length === 0) return;

        const { idarqueo, montoinicial } = arqRes.rows[0];
        const hndDate = getLocalTimestamp().substring(0, 10);

        const ventasParams = tenantId ? [idCaja, hndDate, tenantId] : [idCaja, hndDate];
        const ventasRes = await client.query(`
            SELECT COALESCE(SUM(total), 0) AS total
            FROM ventas
            WHERE idCaja = $1
              AND TO_CHAR(fecha, 'YYYY-MM-DD') = $2
              AND estado = 'Completada'
              ${tenantId ? 'AND tenant_id = $3' : ''}
        `, ventasParams);

        const totalVentas = Number(ventasRes.rows[0].total);
        const montoFinal  = Number(montoinicial) + totalVentas;

        await client.query(`
            UPDATE arqueo
            SET totalVentas = $1, totalCostos = 0, TotalGastos = 0,
                montoFinal  = $2, ganancia    = $1
            WHERE idArqueo = $3
        `, [totalVentas, montoFinal, idarqueo]);
    } catch (err) {
        console.error('Error updateArqueoBalance:', err.message);
        throw err;
    }
}

/**
 * Anula una venta y revierte el inventario usando el stored procedure sp_anular_venta.
 * Si el SP no existe en la DB (migración pendiente), ejecuta la lógica manualmente.
 */
async function anularVenta(codVenta, codUsuario, motivo = 'Sin motivo', client = pool, tenantId = null) {
    try {
        const spRes = await client.query(
            `SELECT sp_anular_venta($1, $2, $3, $4) AS resultado`,
            [codVenta, codUsuario, motivo, tenantId || null]
        );
        const resultado = spRes.rows[0].resultado;
        // SP retorna JSONB: { ok: true, codVenta, lineas_revertidas }
        if (resultado && typeof resultado === 'object') {
            if (resultado.ok === false) throw new Error(resultado.error || 'SP reportó error al anular');
            return true; // ok: true → éxito
        }
        return Boolean(resultado);
    } catch (err) {
        if (err.message && err.message.includes('does not exist')) {
            console.warn('sp_anular_venta no encontrado, usando lógica manual.');
            return null;
        }
        throw err;
    }
}

const handleDbError = (res, err) => {
    const status = err.code === '23505' ? 409 : err.code === '23503' ? 400 : 500;
    const message = err.code === '23505'
        ? 'Ya existe un registro con ese identificador'
        : err.code === '23503'
        ? 'Referencia inválida: el registro relacionado no existe'
        : 'Error interno del servidor';
    console.error('DB Error:', err.message, err.code);
    res.status(status).json({ error: message });
};

/**
 * Execute a callback inside a tenant-scoped transaction.
 * Sets app.current_tenant_id (LOCAL) so PostgreSQL RLS policies apply.
 * Use for multi-statement operations that need a transaction.
 *
 * @param {string} tenantId - UUID of the current tenant
 * @param {function} fn - async (client) => result
 * @returns {Promise<any>} result of fn
 */
async function withTenantContext(tenantId, fn) {
    const client = await _connectWithRetry('withTenantContext');
    try {
        await client.query('BEGIN');
        await _setTenantContext(client, tenantId, true);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Run a single parameterized query inside a tenant-scoped transaction.
 * Convenience wrapper around withTenantContext for one-shot queries.
 *
 * @param {string} tenantId - UUID of the current tenant
 * @param {string} text - SQL query
 * @param {any[]} values - query parameters
 */
async function tenantQuery(tenantId, text, values = []) {
    return withTenantContext(tenantId, (client) => client.query(text, values));
}

module.exports = { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp, anularVenta, withTenantContext, tenantQuery, setRequestTenant, withRequestTenant };
