
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

router.get('/arqueo/active', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        const query = `
            SELECT idArqueo as "idArqueo", idCaja as "idCaja", montoInicial as "montoInicial", 
            montoFinal as "montoFinal", totalVentas as "totalVentas", TotalGastos as "TotalGastos", ganancia, estado,
            TO_CHAR(fechaApertura, 'YYYY-MM-DD HH24:MI:SS') as "fechaApertura"
            FROM arqueo WHERE idCaja = $1 AND estado = 'Activo' LIMIT 1
        `;
        const result = await pool.query(query, [idCaja]);
        res.json(result.rows[0] || null);
    } catch(e) { handleDbError(res, e); }
});

router.get('/saldos/status', authenticateToken, async (req, res) => {
    try {
        const hndDate = getLocalTimestamp().substring(0, 10);
        const result = await pool.query(`
            SELECT 
                EXISTS(SELECT 1 FROM saldos WHERE red = 'TIGO' AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1) as tigo,
                EXISTS(SELECT 1 FROM saldos WHERE red = 'CLARO' AND TO_CHAR(fecha, 'YYYY-MM-DD') = $1) as claro
        `, [hndDate]);
        res.json(result.rows[0]);
    } catch(e) { handleDbError(res, e); }
});

router.post('/arqueo/open', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { montoInicial, saldoTigoInicial, saldoClaroInicial } = req.body;
        const { codUsuario, idCaja } = req.user;
        const hndTime = getLocalTimestamp();
        const hndDate = hndTime.substring(0, 10);

        await client.query('BEGIN');
        const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
        await client.query(
            `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, montoFinal, estado, totalVentas, totalCostos, TotalGastos, ganancia) 
             VALUES ($1, $2, $3, $4, $5, $5, 'Activo', 0, 0, 0, 0)`,
            [idArqueo, idCaja, codUsuario, hndTime, montoInicial]
        );

        if (saldoTigoInicial > 0) {
            const idS = await generateNextId('saldos', 'idsaldos', 'SLD', client);
            await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'TIGO', $2, 0, $2, $3)`, [idS, saldoTigoInicial, hndDate]);
        }
        if (saldoClaroInicial > 0) {
            const idS = await generateNextId('saldos', 'idsaldos', 'SLD', client);
            await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'CLARO', $2, 0, $2, $3)`, [idS, saldoClaroInicial, hndDate]);
        }

        await client.query('COMMIT');
        res.status(201).json({ idArqueo });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.post('/arqueo/close', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { idArqueo } = req.body;
        const { idCaja } = req.user;
        const hndDate = getLocalTimestamp().substring(0, 10);
        
        await client.query('BEGIN');
        await updateArqueoBalance(idCaja, client);
        
        // Obtener saldos finales de recargas para el reporte
        const saldosRes = await client.query(`SELECT red, saldoFinal FROM saldos WHERE TO_CHAR(fecha, 'YYYY-MM-DD') = $1`, [hndDate]);
        const saldoTigo = saldosRes.rows.find(s => s.red === 'TIGO')?.saldofinal || 0;
        const saldoClaro = saldosRes.rows.find(s => s.red === 'CLARO')?.saldofinal || 0;

        await client.query(`UPDATE arqueo SET estado = 'Cerrada', fechaCierre = $1, saldoTigoFinal = $2, saldoClaroFinal = $3 WHERE idArqueo = $4`, [getLocalTimestamp(), saldoTigo, saldoClaro, idArqueo]);
        
        const resRes = await client.query('SELECT * FROM arqueo WHERE idArqueo = $1', [idArqueo]);
        
        await client.query('COMMIT');
        res.json({ resumen: resRes.rows[0] });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.get('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        const result = await pool.query(`
            SELECT idIngreso, descripcion, monto, costo, subtipo_movimiento, TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion"
            FROM ingresos WHERE idCaja = $1 AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2 ORDER BY fechaCreacion DESC
        `, [idCaja, fecha]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo, subtipo_movimiento, fechaCreacion } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('ingresos', 'idIngreso', 'INGR');
        await pool.query(`INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,$6,$7,'Registrado')`,
            [id, idCaja, descripcion, monto, costo || 0, subtipo_movimiento || 'Reparacion', fechaCreacion || getLocalTimestamp()]);
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/egresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        const result = await pool.query(`
            SELECT idegresos, descripcion, monto, subtipo_egreso, id_socio_asignado, TO_CHAR(fechaCreacion, 'YYYY-MM-DD HH24:MI:SS') as "fechaCreacion"
            FROM egresos WHERE idCaja = $1 AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2 ORDER BY fechaCreacion DESC
        `, [idCaja, fecha]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/egresos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, subtipo_egreso, id_socio_asignado, fechaCreacion } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('egresos', 'idegresos', 'EGRE');
        await pool.query(`INSERT INTO egresos (idegresos, idCaja, descripcion, monto, subtipo_egreso, id_socio_asignado, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,$6,$7,'Registrado')`,
            [id, idCaja, descripcion, monto, subtipo_egreso, id_socio_asignado || null, fechaCreacion || getLocalTimestamp()]);
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/saldos/today', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const r = await pool.query(`SELECT idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha FROM saldos WHERE TO_CHAR(fecha, 'YYYY-MM-DD') = $1`, [fecha]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/saldos/buy', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, montoPagado, montoRecibido, fechaLocal } = req.body;
        const { idCaja } = req.user;
        await client.query('BEGIN');
        await client.query('UPDATE saldos SET saldoComprado = saldoComprado + $1, saldoFinal = saldoFinal + $1 WHERE red = $2 AND TO_CHAR(fecha, \'YYYY-MM-DD\') = $3', [montoRecibido, red, fechaLocal]);
        const idEgre = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query('INSERT INTO egresos (idegresos, idCaja, descripcion, monto, subtipo_egreso, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [idEgre, idCaja, `Compra de Saldo ${red}`, montoPagado, 'Compra Saldo', getLocalTimestamp(), 'Registrado']);
        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.post('/recargas', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, tipo, descripcion, precioCobrado, precioPagado, fechaLocal } = req.body;
        const { idCaja } = req.user;
        await client.query('BEGIN');
        await client.query('UPDATE saldos SET saldoFinal = saldoFinal - $1 WHERE red = $2 AND TO_CHAR(fecha, \'YYYY-MM-DD\') = $3', [precioPagado, red, fechaLocal]);
        const idIngre = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
        await client.query('INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [idIngre, idCaja, `RECARGA ${red}: ${descripcion}`, precioCobrado, precioPagado, 'Recarga', getLocalTimestamp(), 'Registrado']);
        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

module.exports = router;
