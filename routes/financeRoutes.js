
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- ARQUEO: OBTENER ACTIVO (POR CAJA) ---
router.get('/arqueo/active', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        // Buscamos si esta caja específica tiene un turno abierto.
        // Quitamos el filtro de fecha aquí porque el estado 'Activo' ya define la sesión actual.
        const query = `
            SELECT idArqueo as "idArqueo", idCaja as "idCaja", montoInicial as "montoInicial", 
            montoFinal as "montoFinal", totalVentas as "totalVentas", ganancia, estado,
            TO_CHAR(fechaApertura AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD HH24:MI:SS') as "fechaApertura"
            FROM arqueo 
            WHERE idCaja = $1 AND estado = 'Activo' 
            LIMIT 1
        `;
        const result = await pool.query(query, [idCaja]);
        res.json(result.rows[0] || null);
    } catch(e) { handleDbError(res, e); }
});

// --- SALDOS: VALIDAR SI YA SE INGRESARON HOY (GLOBAL) ---
router.get('/saldos/status', authenticateToken, async (req, res) => {
    try {
        const hndDate = getLocalTimestamp().substring(0, 10);
        const query = `
            SELECT 
                EXISTS(SELECT 1 FROM saldos WHERE red = 'TIGO' AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1) as tigo,
                EXISTS(SELECT 1 FROM saldos WHERE red = 'CLARO' AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1) as claro
        `;
        const result = await pool.query(query, [hndDate]);
        res.json(result.rows[0]);
    } catch(e) { handleDbError(res, e); }
});

// --- ARQUEO: APERTURA DE CAJA ---
router.post('/arqueo/open', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { montoInicial, saldoTigoInicial, saldoClaroInicial } = req.body;
        const { codUsuario, idCaja } = req.user;
        const hndTimestamp = getLocalTimestamp();
        const hndDate = hndTimestamp.substring(0, 10);

        await client.query('BEGIN');

        // 1. Crear el Arqueo para la caja
        const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
        await client.query(
            `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, montoFinal, estado, totalVentas, totalCostos, TotalGastos, ganancia) 
             VALUES ($1, $2, $3, $4, $5, $5, 'Activo', 0, 0, 0, 0)`,
            [idArqueo, idCaja, codUsuario, hndTimestamp, montoInicial]
        );

        // 2. Registrar Saldos de Recargas (Solo si no existen para hoy)
        if (saldoTigoInicial > 0) {
            const checkTigo = await client.query(`SELECT 1 FROM saldos WHERE red = 'TIGO' AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1`, [hndDate]);
            if (checkTigo.rows.length === 0) {
                const idS = await generateNextId('saldos', 'idsaldos', 'SLD', client);
                await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'TIGO', $2, 0, $2, $3)`, [idS, saldoTigoInicial, hndDate]);
            }
        }

        if (saldoClaroInicial > 0) {
            const checkClaro = await client.query(`SELECT 1 FROM saldos WHERE red = 'CLARO' AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1`, [hndDate]);
            if (checkClaro.rows.length === 0) {
                const idS = await generateNextId('saldos', 'idsaldos', 'SLD', client);
                await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'CLARO', $2, 0, $2, $3)`, [idS, saldoClaroInicial, hndDate]);
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Caja abierta correctamente', idArqueo });
    } catch(e) { 
        await client.query('ROLLBACK'); 
        handleDbError(res, e); 
    } finally { client.release(); }
});

// --- SALDOS: OBTENER LOS DE HOY ---
router.get('/saldos/today', authenticateToken, async (req, res) => {
    try {
        const hndDate = getLocalTimestamp().substring(0, 10);
        const r = await pool.query(`SELECT idsaldos, red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha FROM saldos WHERE TO_CHAR(fecha, 'YYYY-MM-DD') = $1`, [hndDate]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

// Los demás métodos (ingresos, egresos) ya fueron actualizados con updateArqueoBalance que usa el timezone corregido
module.exports = router;
