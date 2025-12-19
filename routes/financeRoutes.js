
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// ==========================================
// 1. GESTIÓN DE ARQUEO
// ==========================================

router.get('/arqueo/active', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        const result = await pool.query(
            `SELECT idArqueo as "idArqueo", idCaja as "idCaja", idUsuario as "idUsuario", 
             fechaApertura as "fechaApertura", montoInicial as "montoInicial", estado, totalVentas as "totalVentas"
             FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]
        );
        res.json(result.rows[0] || null);
    } catch (e) { handleDbError(res, e); }
});

router.post('/arqueo/open', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { montoInicial, saldoTigoInicial, saldoClaroInicial, fechaLocal } = req.body;
        const { idCaja, codUsuario } = req.user;
        const active = await client.query(`SELECT 1 FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
        if (active.rows.length > 0) return res.status(400).json({ error: 'Caja ya abierta.' });

        await client.query('BEGIN');
        const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
        const fecha = fechaLocal ? `${fechaLocal} ${new Date().toLocaleTimeString('en-US', {hour12:false})}` : getLocalTimestamp();

        await client.query(`INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, estado) VALUES ($1, $2, $3, $4, $5, 'Activo')`,
            [idArqueo, idCaja, codUsuario, fecha, montoInicial]);

        if (saldoTigoInicial !== undefined && saldoClaroInicial !== undefined) {
             const today = fechaLocal || new Date().toISOString().split('T')[0];
             const sldT = await generateNextId('saldos', 'idsaldos', 'SLD', client);
             await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'TIGO', $2, 0, $2, $3)`, [sldT, saldoTigoInicial, today]);
             const sldC = await generateNextId('saldos', 'idsaldos', 'SLD', client);
             await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'CLARO', $2, 0, $2, $3)`, [sldC, saldoClaroInicial, today]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Caja aperturada', idArqueo });
    } catch (e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.post('/arqueo/close', authenticateToken, async (req, res) => {
    try {
        const { idArqueo } = req.body;
        const { idCaja } = req.user;
        await updateArqueoBalance(idCaja, pool);
        const arqRes = await pool.query(`SELECT * FROM arqueo WHERE idArqueo = $1`, [idArqueo]);
        const arqueo = arqRes.rows[0];
        const fechaStr = new Date(arqueo.fechaapertura).toISOString().split('T')[0];
        const saldosRes = await pool.query(`SELECT red, saldoFinal FROM saldos WHERE fecha = $1`, [fechaStr]);
        let sT = 0, sC = 0;
        saldosRes.rows.forEach(s => { if (s.red === 'TIGO') sT = Number(s.saldofinal); if (s.red === 'CLARO') sC = Number(s.saldofinal); });
        const fC = getLocalTimestamp();
        await pool.query(`UPDATE arqueo SET estado = 'Cerrada', fechaCierre = $1, saldoTigoFinal = $2, saldoClaroFinal = $3 WHERE idArqueo = $4`, [fC, sT, sC, idArqueo]);
        const r = (await pool.query(`SELECT * FROM arqueo WHERE idArqueo = $1`, [idArqueo])).rows[0];
        res.json({ message: 'Cerrada', resumen: { idArqueo: r.idarqueo, montoInicial: r.montoinicial, montoFinal: r.montofinal, totalVentas: r.totalventas, TotalGastos: r.totalgastos, ganancia: r.ganancia, fechaCierre: r.fechacierre, saldoTigoFinal: r.saldotigofinal, saldoClaroFinal: r.saldoclarofinal } });
    } catch (e) { handleDbError(res, e); }
});

// ==========================================
// 2. INGRESOS Y EGRESOS
// ==========================================

router.get('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        let query = `SELECT idIngreso as "idIngreso", idCaja as "idCaja", descripcion, monto, costo, fechaCreacion as "fechaCreacion", estado FROM ingresos WHERE idCaja = $1`;
        const params = [idCaja];
        if (fecha) { query += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2`; params.push(fecha); }
        query += ` ORDER BY fechaCreacion DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo, fechaCreacion } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('ingresos', 'idIngreso', 'INGR');
        await pool.query(`INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, $6, 'Registrado')`,
            [id, idCaja, descripcion, monto, costo || 0, fechaCreacion || getLocalTimestamp()]);
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/egresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        let query = `
            SELECT e.idegresos as "idegresos", e.idCaja as "idCaja", e.descripcion, e.monto, 
                   e.fechaCreacion as "fechaCreacion", e.estado, e.categoria, e.id_socio_asignado as "idSocioAsignado",
                   s.nombre as "nombreSocio"
            FROM egresos e
            LEFT JOIN socios s ON e.id_socio_asignado = s.id_socio
            WHERE e.idCaja = $1`;
        const params = [idCaja];
        if (fecha) { query += ` AND TO_CHAR(e.fechaCreacion, 'YYYY-MM-DD') = $2`; params.push(fecha); }
        query += ` ORDER BY e.fechaCreacion DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/egresos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, fechaCreacion, categoria, id_socio_asignado } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('egresos', 'idegresos', 'EGRE');
        const socioId = id_socio_asignado || null;
        
        await pool.query(`INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado, categoria, id_socio_asignado) VALUES ($1, $2, $3, $4, $5, 'Registrado', $6, $7)`,
            [id, idCaja, descripcion, monto, fechaCreacion || getLocalTimestamp(), categoria || 'Gasto Operativo', socioId]);
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, categoria, id_socio_asignado } = req.body;
        const socioId = id_socio_asignado || null;
        await pool.query(`UPDATE egresos SET descripcion=$1, monto=$2, categoria=$3, id_socio_asignado=$4 WHERE idegresos=$5`,
            [descripcion, monto, categoria, socioId, req.params.id]);
        const r = await pool.query('SELECT idCaja FROM egresos WHERE idegresos=$1', [req.params.id]);
        if(r.rows[0]) await updateArqueoBalance(r.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT idCaja FROM egresos WHERE idegresos=$1', [req.params.id]);
        const idCaja = r.rows[0]?.idcaja;
        await pool.query('DELETE FROM egresos WHERE idegresos=$1', [req.params.id]);
        if(idCaja) await updateArqueoBalance(idCaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// Saldos y Otros...
router.get('/saldos/today', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const result = await pool.query(`SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoFinal as "saldoFinal" FROM saldos WHERE fecha = $1`, [fecha || new Date().toISOString().split('T')[0]]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.get('/saldos/status', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const result = await pool.query(`SELECT red FROM saldos WHERE fecha = $1`, [fecha || new Date().toISOString().split('T')[0]]);
        res.json({ tigo: result.rows.some(r => r.red === 'TIGO'), claro: result.rows.some(r => r.red === 'CLARO') });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
