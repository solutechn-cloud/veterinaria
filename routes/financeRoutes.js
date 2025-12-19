
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- ARQUEO ACTIVO ---
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

// --- APERTURA DE CAJA ---
router.post('/arqueo/open', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { montoInicial, saldoTigoInicial, saldoClaroInicial, fechaLocal } = req.body;
        const { idCaja, codUsuario } = req.user;

        const active = await client.query(`SELECT 1 FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
        if (active.rows.length > 0) return res.status(400).json({ error: 'La caja ya tiene una sesión activa.' });

        await client.query('BEGIN');
        const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
        const fecha = fechaLocal ? `${fechaLocal} ${new Date().toLocaleTimeString('en-US', {hour12:false})}` : getLocalTimestamp();

        await client.query(
            `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, estado) 
             VALUES ($1, $2, $3, $4, $5, 'Activo')`,
            [idArqueo, idCaja, codUsuario, fecha, montoInicial]
        );

        // Inicializar saldos de recargas
        const today = fechaLocal || new Date().toISOString().split('T')[0];
        const reds = ['TIGO', 'CLARO'];
        for (const red of reds) {
            const initialVal = red === 'TIGO' ? (saldoTigoInicial || 0) : (saldoClaroInicial || 0);
            const check = await client.query(`SELECT 1 FROM saldos WHERE red = $1 AND fecha = $2`, [red, today]);
            if (check.rows.length === 0) {
                const sldId = await generateNextId('saldos', 'idsaldos', 'SLD', client);
                await client.query(`INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, $2, $3, 0, $3, $4)`, [sldId, red, initialVal, today]);
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Caja aperturada', idArqueo });
    } catch (e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

// --- CIERRE DE CAJA ---
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
        
        await pool.query(
            `UPDATE arqueo SET estado = 'Cerrada', fechaCierre = $1, saldoTigoFinal = $2, saldoClaroFinal = $3 WHERE idArqueo = $4`,
            [getLocalTimestamp(), sT, sC, idArqueo]
        );
        
        const arqFinal = await pool.query(`SELECT * FROM arqueo WHERE idArqueo = $1`, [idArqueo]);
        res.json({ message: 'Caja cerrada', resumen: arqFinal.rows[0] });
    } catch (e) { handleDbError(res, e); }
});

// --- DETALLES DE SESIÓN (AUDITORÍA) ---
router.get('/arqueo/:id/details', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const arqRes = await pool.query(`SELECT * FROM arqueo WHERE idArqueo = $1`, [id]);
        if (arqRes.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
        const arq = arqRes.rows[0];
        const fechaIni = arq.fechaapertura;
        // Para sesiones cerradas, limitar al momento del cierre
        const fechaFin = arq.fechacierre || '9999-12-31';

        const ingRes = await pool.query(
            `SELECT idIngreso as "idIngreso", descripcion, monto, costo, fechaCreacion as "fechaCreacion" 
             FROM ingresos WHERE idCaja = $1 AND fechaCreacion >= $2 AND fechaCreacion <= $3 ORDER BY fechaCreacion ASC`,
            [arq.idcaja, fechaIni, fechaFin]
        );

        const egrRes = await pool.query(
            `SELECT idegresos as "idegresos", descripcion, monto, fechaCreacion as "fechaCreacion" 
             FROM egresos WHERE idCaja = $1 AND fechaCreacion >= $2 AND fechaCreacion <= $3 ORDER BY fechaCreacion ASC`,
            [arq.idcaja, fechaIni, fechaFin]
        );

        res.json({
            arqueo: { idArqueo: arq.idarqueo, idCaja: arq.idcaja, montoInicial: arq.montoinicial, estado: arq.estado, fechaApertura: arq.fechaapertura, fechaCierre: arq.fechacierre, ganancia: arq.ganancia },
            ingresos: ingRes.rows,
            egresos: egrRes.rows
        });
    } catch (e) { handleDbError(res, e); }
});

// --- REAPERTURA DE CAJA (ADMIN) ---
router.put('/arqueo/:id/reopen', authenticateToken, async (req, res) => {
    try {
        await pool.query(`UPDATE arqueo SET estado = 'Activo', fechaCierre = NULL WHERE idArqueo = $1`, [req.params.id]);
        res.json({ message: 'Caja reabierta' });
    } catch (e) { handleDbError(res, e); }
});

// --- ACTUALIZAR MONTO INICIAL (ADMIN) ---
router.put('/arqueo/:id/initial', authenticateToken, async (req, res) => {
    try {
        const { montoInicial } = req.body;
        const result = await pool.query(`UPDATE arqueo SET montoInicial = $1 WHERE idArqueo = $2 RETURNING idCaja`, [montoInicial, req.params.id]);
        if (result.rows.length > 0) await updateArqueoBalance(result.rows[0].idcaja);
        res.json({ message: 'Monto inicial actualizado' });
    } catch (e) { handleDbError(res, e); }
});

// --- HISTORIAL DE SESIONES POR CAJA ---
router.get('/admin/boxes/:idCaja/history', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.idArqueo as "idArqueo", a.fechaApertura as "fechaApertura", a.fechaCierre as "fechaCierre",
                   a.montoInicial as "montoInicial", a.montoFinal as "montoFinal", a.estado,
                   u.usuario, (e.nombre || ' ' || e.apellido) as "nombreEmpleado"
            FROM arqueo a
            JOIN usuarios u ON a.idUsuario = u.codUsuario
            JOIN empleado e ON u.identidad = e.identidad
            WHERE a.idCaja = $1
            ORDER BY a.fechaApertura DESC
            LIMIT 50
        `, [req.params.idCaja]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- SALDOS STATUS ---
router.get('/saldos/status', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const result = await pool.query(
            `SELECT 
                EXISTS(SELECT 1 FROM saldos WHERE red = 'TIGO' AND fecha = $1) as tigo,
                EXISTS(SELECT 1 FROM saldos WHERE red = 'CLARO' AND fecha = $1) as claro`,
            [fecha]
        );
        res.json(result.rows[0]);
    } catch (e) { handleDbError(res, e); }
});

// --- INGRESOS ---
router.get('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        let q = `SELECT idIngreso as "idIngreso", descripcion, monto, costo, fechaCreacion as "fechaCreacion" FROM ingresos WHERE idCaja = $1`;
        const params = [idCaja];
        if (fecha) { q += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2`; params.push(fecha); }
        q += ` ORDER BY fechaCreacion DESC`;
        const r = await pool.query(q, params);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo, fechaCreacion } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('ingresos', 'idIngreso', 'INGR');
        await pool.query(`INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,$6,'Registrado')`,
            [id, idCaja, descripcion, monto, costo || 0, fechaCreacion || getLocalTimestamp()]);
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo } = req.body;
        const r = await pool.query('UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4 RETURNING idCaja', [descripcion, monto, costo, req.params.id]);
        if (r.rows.length > 0) await updateArqueoBalance(r.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('DELETE FROM ingresos WHERE idIngreso=$1 RETURNING idCaja', [req.params.id]);
        if (r.rows.length > 0) await updateArqueoBalance(r.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- EGRESOS ---
router.get('/egresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        let q = `SELECT idegresos as "idegresos", descripcion, monto, fechaCreacion as "fechaCreacion" FROM egresos WHERE idCaja = $1`;
        const params = [idCaja];
        if (fecha) { q += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2`; params.push(fecha); }
        q += ` ORDER BY fechaCreacion DESC`;
        const r = await pool.query(q, params);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/egresos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, fechaCreacion } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('egresos', 'idegresos', 'EGRE');
        await pool.query(`INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,'Registrado')`,
            [id, idCaja, descripcion, monto, fechaCreacion || getLocalTimestamp()]);
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto } = req.body;
        const r = await pool.query('UPDATE egresos SET descripcion=$1, monto=$2 WHERE idegresos=$3 RETURNING idCaja', [descripcion, monto, req.params.id]);
        if (r.rows.length > 0) await updateArqueoBalance(r.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('DELETE FROM egresos WHERE idegresos=$1 RETURNING idCaja', [req.params.id]);
        if (r.rows.length > 0) await updateArqueoBalance(r.rows[0].idcaja);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- SALDOS ---
router.get('/saldos/today', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoFinal as "saldoFinal" FROM saldos WHERE fecha = $1`, [req.query.fecha || new Date().toISOString().split('T')[0]]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/saldos/buy', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, montoPagado, montoRecibido, fechaLocal } = req.body;
        const { idCaja } = req.user;
        const today = fechaLocal || new Date().toISOString().split('T')[0];
        await client.query('BEGIN');
        const idEgre = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(`INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,'Compra Saldo')`,
            [idEgre, idCaja, `Compra Saldo ${red}`, montoPagado, getLocalTimestamp()]);
        await client.query(`UPDATE saldos SET saldoComprado = saldoComprado + $1, saldoFinal = saldoFinal + $1 WHERE red = $2 AND fecha = $3`, [montoRecibido, red, today]);
        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.post('/recargas', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, descripcion, precioCobrado, precioPagado, fechaLocal } = req.body;
        const { idCaja } = req.user;
        const today = fechaLocal || new Date().toISOString().split('T')[0];
        await client.query('BEGIN');
        const idIngre = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
        await client.query(`INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1,$2,$3,$4,$5,$6,'Venta Recarga')`,
            [idIngre, idCaja, `RECARGA ${red}: ${descripcion}`, precioCobrado, precioPagado, getLocalTimestamp()]);
        await client.query(`UPDATE saldos SET saldoFinal = saldoFinal - $1 WHERE red = $2 AND fecha = $3`, [precioPagado, red, today]);
        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.get('/admin/saldos', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoFinal as "saldoFinal" FROM saldos WHERE fecha = $1`, [req.query.fecha]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.put('/admin/saldos/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query(`UPDATE saldos SET saldoInicio = $1, saldoFinal = $2 WHERE idsaldos = $3`, [req.body.saldoInicio, req.body.saldoFinal, req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
