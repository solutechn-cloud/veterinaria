
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
const { siguienteCorrelativo } = require('../services/idSequence');

const _CONNECT_TIMEOUT_MS = parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10);
const _QUERY_TIMEOUT_MS = Math.max(1000, parseInt(process.env.DB_QUERY_TIMEOUT_MS || '60000', 10) || 60000);
const _STATEMENT_TIMEOUT_MS = Math.max(
    1000,
    parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || String(_QUERY_TIMEOUT_MS), 10) || _QUERY_TIMEOUT_MS
);

const _POOL_MAX = parseInt(process.env.DB_POOL_MAX || '10', 10);

const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
  // Keep pool small for remote DBs (Render free tier: 97 connection limit)
  max: _POOL_MAX,
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
            hour12: false, hourCycle: 'h23'
        };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(now);
        const getPart = (type) => parts.find(p => p.type === type).value;
        // Algunos motores ICU devuelven "24" en vez de "00" para la medianoche con
        // hour12:false, lo cual Postgres rechaza (date/time field value out of range).
        const hour = getPart('hour') === '24' ? '00' : getPart('hour');
        return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${hour}:${getPart('minute')}:${getPart('second')}`;
    } catch (err) {
        const d = new Date();
        d.setHours(d.getHours() - 6);
        return d.toISOString().replace('T', ' ').substring(0, 19);
    }
};

pool.on('error', (err) => {
    console.error('Unexpected error on idle DB client', err);
});

function getPoolStats() {
    const max = Number(pool.options?.max || _POOL_MAX);
    const total = Number(pool.totalCount || 0);
    const idle = Number(pool.idleCount || 0);
    const waiting = Number(pool.waitingCount || 0);
    const active = Math.max(total - idle, 0);
    const utilization = max > 0 ? Number((active / max).toFixed(2)) : null;
    return { max, total, idle, active, waiting, utilization };
}

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

function getCurrentRequestContext() {
    const store = _getTenantStore();
    return {
        tenantId: store?.tenantId || null,
        bypass: Boolean(store?.bypass),
    };
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
            if (store.tenantId) await _setTenantContext(client, store.tenantId, false);
            if (store.bypass) await client.query("SELECT set_config('app.bypass_rls', 'true', false)");
            store.client = client;
            return client;
        })().catch(err => {
            store.clientPromise = null;
            throw err;
        });
    }
    return store.clientPromise;
}

function _queueRequestClientQuery(store, client, args) {
    const previous = store.queryQueue || Promise.resolve();
    const queryPromise = previous
        .catch(() => {})
        .then(() => client.query(...args));
    store.queryQueue = queryPromise.catch(() => {});
    return queryPromise;
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
        if (store.queryQueue) await store.queryQueue.catch(() => {});
        // Reset ambas variables de contexto a vacío (no RESET, que fallaría si la
        // GUC nunca se seteó en esta conexión) para que la conexión vuelva limpia
        // al pool y no arrastre bypass/tenant a la siguiente petición.
        await client.query("SELECT set_config('app.current_tenant_id','',false), set_config('app.bypass_rls','',false)");
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
    if (store?.tenantId || store?.bypass) {
        const client = await _getRequestClient(store);
        return _queueRequestClientQuery(store, client, args);
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

// Manual-client path: any checked-out client in a tenant-scoped request must
// receive the RLS context immediately. Some routes use pool.connect() without
// BEGIN, so waiting until a transaction starts makes RLS hide tenant rows.
// When a transaction does start we also set the LOCAL context for consistency.
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
    const store = _getTenantStore();
    if (!store || (!store.tenantId && !store.bypass)) return client;

    const origQuery   = client.query.bind(client);
    const origRelease = client.release.bind(client);
    let injected = false;
    let released = false;

    try {
        if (store.tenantId) await _setTenantContext({ query: origQuery }, store.tenantId, false);
        if (store.bypass) await origQuery("SELECT set_config('app.bypass_rls', 'true', false)");
    } catch (err) {
        origRelease(err);
        throw err;
    }

    client.query = async function tenantInterceptQuery(...args) {
        if (!injected) {
            const sql = (typeof args[0] === 'string' ? args[0] : (args[0]?.text ?? '')).trim().toUpperCase();
            if (sql.startsWith('BEGIN')) {
                injected = true;
                await origQuery(...args);
                if (store.tenantId) await _setTenantContext({ query: origQuery }, store.tenantId, true);
                if (store.bypass) await origQuery("SELECT set_config('app.bypass_rls', 'true', true)");
                return;
            }
        }
        return origQuery(...args);
    };

    // Restore the original functions before the connection goes back to the pool.
    client.release = function tenantAwareRelease(err) {
        if (released) return;
        released = true;
        client.query   = origQuery;
        client.release = origRelease;
        if (err) {
            origRelease(err);
            return;
        }

        origQuery("SELECT set_config('app.current_tenant_id','',false), set_config('app.bypass_rls','',false)")
            .then(() => origRelease())
            .catch(cleanupErr => {
                console.error('[DB] Error limpiando contexto tenant:', cleanupErr.message);
                origRelease(cleanupErr);
            });
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
 * Ejecuta `fn` con el bypass de RLS activo (app.bypass_rls = 'true').
 * Para trabajos de fondo legítimamente cross-tenant (cron, cache global).
 * El bypass se resetea al terminar, así que la conexión vuelve limpia al pool.
 */
function setRequestBypass(fn) {
    const store = { bypass: true, client: null, clientPromise: null, releaseStarted: false };
    return _tenantALS.run(store, async () => {
        try {
            return await fn();
        } finally {
            await _releaseRequestClient(store);
        }
    });
}

/**
 * Middleware Express que activa el bypass de RLS para toda la petición.
 * Se usa en rutas legítimamente cross-tenant o pre-autenticación:
 * login, refresh, registro público y gestión de super-admin.
 */
function withRequestBypass(req, res, next) {
    const store = { bypass: true, client: null, clientPromise: null, releaseStarted: false };
    const cleanup = () => {
        _releaseRequestClient(store).catch(err => {
            console.error('[DB] Error liberando cliente bypass:', err.message);
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
    'ventas:codventa', 'detalleventa:coddetalleventa', 'cotizaciones:codigo',
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
        const nextId = siguienteCorrelativo(safePrefix, result.rows.map(r => r.id));

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
 * Genera el siguiente número de factura fiscal (correlativo CAI), separado del
 * codVenta interno. Formato: <prefijo de rangoInicial>-<correlativo 8 dígitos>,
 * ej. 000-001-01-00000021. El prefijo (sucursal-puntoemision-tipodoc) sale de
 * los primeros 3 grupos de "Rango Inicial" del CAI en uso.
 *
 * El CAI en uso es el más antiguo con estado 'vigente' en cai_facturacion.
 * Antes de emitir se valida que no haya vencido (fechalimite) ni agotado su
 * rango (rangofinal); al detectarlo se marca esa fila como 'vencido'/'agotado'
 * y se reintenta con el siguiente CAI vigente registrado.
 *
 * Usa pg_advisory_xact_lock + FOR UPDATE para serializar concurrencia: dos
 * ventas simultáneas nunca deben recibir el mismo número fiscal.
 *
 * Devuelve null si el tenant nunca ha registrado un CAI (caso de empresa
 * nueva que aún no factura fiscalmente), en cuyo caso la factura simplemente
 * no lleva número fiscal todavía. Si el tenant ya tuvo CAI pero el último
 * registrado se agotó o venció sin que haya otro vigente detrás, lanza un
 * error 400 (CAI_NO_DISPONIBLE) — a diferencia del caso "nunca configurado",
 * aquí sí se bloquea la emisión para no facturar fuera del rango autorizado.
 */
async function generateFacturaCorrelativo(tenantId, client = pool) {
    if (!tenantId) return null;
    const lockId = _advisoryLockId('FACTNUM', 'cai_facturacion', tenantId);

    const usingPool = client === pool;
    let txClient = client;
    if (usingPool) {
        txClient = await pool.connect();
        await txClient.query('BEGIN');
    }

    try {
        await txClient.query('SELECT pg_advisory_xact_lock($1)', [lockId]);

        const totalResult = await txClient.query(
            `SELECT COUNT(*)::int AS total FROM cai_facturacion WHERE tenant_id = $1`,
            [tenantId]
        );
        const tenantHasCai = totalResult.rows[0].total > 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const result = await txClient.query(
                `SELECT id, rangoinicial, rangofinal, correlativo_actual, fechalimite
                 FROM cai_facturacion
                 WHERE tenant_id = $1 AND estado = 'vigente'
                 ORDER BY fecha_registro ASC
                 LIMIT 1
                 FOR UPDATE`,
                [tenantId]
            );
            const row = result.rows[0];

            if (!row) {
                if (usingPool) await txClient.query('COMMIT');
                if (tenantHasCai) {
                    const err = new Error('No hay un CAI vigente registrado para facturación fiscal (el anterior se agotó o venció). Registre un nuevo CAI en Configuración → Facturación antes de continuar.');
                    err.statusCode = 400;
                    err.code = 'CAI_NO_DISPONIBLE';
                    throw err;
                }
                return null;
            }

            const parts = (row.rangoinicial || '').trim().split('-');
            if (parts.length < 4) {
                if (usingPool) await txClient.query('COMMIT');
                return null;
            }

            if (row.fechalimite && new Date(row.fechalimite) < new Date(new Date().toDateString())) {
                await txClient.query(
                    `UPDATE cai_facturacion SET estado = 'vencido', agotado_en = NOW() WHERE id = $1`,
                    [row.id]
                );
                continue;
            }

            const finalParts = (row.rangofinal || '').trim().split('-');
            const rangoFinalNum = finalParts.length >= 4 && /^\d+$/.test(finalParts[3]) ? Number(finalParts[3]) : null;
            const numero = Number(row.correlativo_actual) || 1;

            if (rangoFinalNum !== null && numero > rangoFinalNum) {
                await txClient.query(
                    `UPDATE cai_facturacion SET estado = 'agotado', agotado_en = NOW() WHERE id = $1`,
                    [row.id]
                );
                continue;
            }

            const prefix = parts.slice(0, 3).join('-');
            const numeroFactura = `${prefix}-${String(numero).padStart(8, '0')}`;
            const seAgota = rangoFinalNum !== null && (numero + 1) > rangoFinalNum;

            await txClient.query(
                `UPDATE cai_facturacion
                 SET correlativo_actual = $1,
                     estado = CASE WHEN $3 THEN 'agotado' ELSE estado END,
                     agotado_en = CASE WHEN $3 THEN NOW() ELSE agotado_en END
                 WHERE id = $2`,
                [numero + 1, row.id, seAgota]
            );

            if (usingPool) await txClient.query('COMMIT');
            return numeroFactura;
        }
    } catch (err) {
        if (usingPool) await txClient.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        if (usingPool) txClient.release();
    }
}

/**
 * Genera el siguiente número de factura interna (no fiscal), en una
 * secuencia propia y totalmente independiente del correlativo CAI
 * (factura_correlativo_actual). Así, emitir facturas internas nunca
 * consume ni salta números de la numeración fiscal autorizada.
 * Formato: NF-<correlativo 8 dígitos>, ej. NF-00000005.
 *
 * Usa pg_advisory_xact_lock + FOR UPDATE para serializar concurrencia,
 * igual que generateFacturaCorrelativo.
 */
async function generateNoFiscalCorrelativo(tenantId, client = pool) {
    if (!tenantId) return null;
    const lockId = _advisoryLockId('NOFISCALNUM', 'configuracion', tenantId);

    const usingPool = client === pool;
    let txClient = client;
    if (usingPool) {
        txClient = await pool.connect();
        await txClient.query('BEGIN');
    }

    try {
        await txClient.query('SELECT pg_advisory_xact_lock($1)', [lockId]);

        const result = await txClient.query(
            `SELECT no_fiscal_correlativo_actual
             FROM configuracion WHERE tenant_id = $1 FOR UPDATE`,
            [tenantId]
        );
        const numero = Number(result.rows[0]?.no_fiscal_correlativo_actual) || 1;
        const numeroNoFiscal = `NF-${String(numero).padStart(8, '0')}`;

        await txClient.query(
            `UPDATE configuracion SET no_fiscal_correlativo_actual = $1 WHERE tenant_id = $2`,
            [numero + 1, tenantId]
        );

        if (usingPool) await txClient.query('COMMIT');
        return numeroNoFiscal;
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
    // SAVEPOINT: si sp_anular_venta no existe, el error deja la transacción abortada
    // en Postgres (25P02) hasta hacer ROLLBACK TO SAVEPOINT; sin esto, el fallback
    // manual que sigue en el caller fallaría con "current transaction is aborted".
    await client.query('SAVEPOINT sp_anular_venta');
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
            await client.query('ROLLBACK TO SAVEPOINT sp_anular_venta');
            return null;
        }
        await client.query('ROLLBACK TO SAVEPOINT sp_anular_venta');
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

module.exports = { pool, getPoolStats, generateNextId, generateFacturaCorrelativo, generateNoFiscalCorrelativo, handleDbError, updateArqueoBalance, getLocalTimestamp, anularVenta, withTenantContext, tenantQuery, setRequestTenant, withRequestTenant, setRequestBypass, withRequestBypass, getCurrentRequestContext };
