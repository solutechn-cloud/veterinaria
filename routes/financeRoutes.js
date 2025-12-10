
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- ARQUEO CAJA ---
router.get('/arqueo/active', authenticateToken, async (req, res) => {
  try {
    const { idCaja } = req.user;
    const result = await pool.query(
      `SELECT idArqueo as "idArqueo", idCaja as "idCaja", idUsuario as "idUsuario", fechaApertura as "fechaApertura", montoInicial as "montoInicial", estado 
       FROM arqueo WHERE idCaja = $1 AND estado = 'Activo' ORDER BY fechaApertura DESC LIMIT 1`,
      [idCaja]
    );
    res.json(result.rows[0] || null);
  } catch(err) { handleDbError(res, err); }
});

router.post('/arqueo/open', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { montoInicial, saldoTigoInicial, saldoClaroInicial } = req.body;
    const { codUsuario, idCaja } = req.user;
    
    const check = await client.query(`SELECT * FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
    if (check.rows.length > 0) return res.status(400).json({ error: 'Caja ya abierta.' });

    await client.query('BEGIN');
    const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
    await client.query(
      `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, estado)
       VALUES ($1, $2, $3, NOW(), $4, 'Activo')`,
      [idArqueo, idCaja, codUsuario, montoInicial]
    );

    const today = new Date().toISOString().split('T')[0];
    const checkSaldos = await client.query('SELECT * FROM saldos WHERE fecha = $1', [today]);
    
    if (checkSaldos.rows.length === 0) {
      const idSaldoTigo = await generateNextId('saldos', 'idsaldos', 'SAL', client);
      // Hack simple para ID consecutivo
      const parts = idSaldoTigo.split('-');
      const nextNum = parseInt(parts[1]) + 1;
      const idSaldoClaro = `${parts[0]}-${nextNum.toString().padStart(4,'0')}`;

      await client.query(
        `INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'TIGO', $2, 0, $2, $3)`,
        [idSaldoTigo, saldoTigoInicial || 0, today]
      );
      await client.query(
        `INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'CLARO', $2, 0, $2, $3)`,
        [idSaldoClaro, saldoClaroInicial || 0, today]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ message: 'Caja Aperturada', idArqueo });
  } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

router.post('/arqueo/close', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
     const { idArqueo } = req.body;
     const { idCaja } = req.user;
     await client.query('BEGIN');

     const ingresosRes = await client.query(`
        SELECT COALESCE(SUM(monto), 0) as total_ingresos, COALESCE(SUM(costo), 0) as costo_ingresos
        FROM ingresos 
        WHERE idCaja = $1 AND fechaCreacion >= (SELECT fechaApertura FROM arqueo WHERE idArqueo = $2)
     `, [idCaja, idArqueo]);
     
     const egresosRes = await client.query(`
        SELECT COALESCE(SUM(monto), 0) as total_egresos
        FROM egresos 
        WHERE idCaja = $1 AND fechaCreacion >= (SELECT fechaApertura FROM arqueo WHERE idArqueo = $2)
     `, [idCaja, idArqueo]);

     const totalIngresos = parseFloat(ingresosRes.rows[0].total_ingresos);
     const totalCostos = parseFloat(ingresosRes.rows[0].costo_ingresos);
     const totalEgresos = parseFloat(egresosRes.rows[0].total_egresos);
     const ganancia = totalIngresos - totalCostos;

     const arqueoInfo = await client.query(`SELECT montoInicial FROM arqueo WHERE idArqueo = $1`, [idArqueo]);
     const montoInicial = parseFloat(arqueoInfo.rows[0].montoInicial || 0);
     const montoFinal = montoInicial + totalIngresos - totalEgresos;

     await client.query(`
        UPDATE arqueo 
        SET estado = 'Cerrada', fechaCierre = NOW(), 
            montoFinal = $1, totalVentas = $2, totalCostos = $3, TotalGastos = $4, ganancia = $5
        WHERE idArqueo = $6
     `, [montoFinal, totalIngresos, totalCostos, totalEgresos, ganancia, idArqueo]);

     await client.query('COMMIT');
     res.json({ message: 'Caja Cerrada', resumen: { montoFinal, totalIngresos, totalCostos, totalEgresos, ganancia } });
  } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

// --- INGRESOS ---
router.get('/ingresos', authenticateToken, async (req, res) => {
  const { idCaja } = req.query;
  try {
    // Increased limit to ensure correct calculations in frontend if paging is not implemented yet
    const result = await pool.query(`SELECT idIngreso as "idIngreso", idCaja as "idCaja", descripcion, monto, costo, fechaCreacion as "fechaCreacion", estado FROM ingresos WHERE idCaja = $1 ORDER BY fechaCreacion DESC LIMIT 500`, [idCaja]);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

router.post('/ingresos', authenticateToken, async (req, res) => {
  try {
    const { descripcion, monto, costo } = req.body;
    const { idCaja } = req.user;
    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR');
    await pool.query(`INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, NOW(), 'Registrado')`,
      [idIngreso, idCaja, descripcion, monto, costo || 0]);
    res.status(201).json({ message: 'Ingreso registrado', idIngreso });
  } catch(err) { handleDbError(res, err); }
});

router.put('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo } = req.body;
        await pool.query('UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4', [descripcion, monto, costo, req.params.id]);
        res.json({ message: 'Ingreso actualizado' });
    } catch(err) { handleDbError(res, err); }
});

router.delete('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM ingresos WHERE idIngreso=$1', [req.params.id]);
        res.json({ message: 'Ingreso eliminado' });
    } catch(err) { handleDbError(res, err); }
});

// --- EGRESOS ---
router.get('/egresos', authenticateToken, async (req, res) => {
  const { idCaja } = req.query;
  try {
    const result = await pool.query(`SELECT idegresos as "idegresos", idCaja as "idCaja", descripcion, monto, fechaCreacion as "fechaCreacion", estado FROM egresos WHERE idCaja = $1 ORDER BY fechaCreacion DESC LIMIT 500`, [idCaja]);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

router.post('/egresos', authenticateToken, async (req, res) => {
  try {
    const { descripcion, monto } = req.body;
    const { idCaja } = req.user;
    const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE');
    await pool.query(`INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) VALUES ($1, $2, $3, $4, NOW(), 'Registrado')`,
      [idegresos, idCaja, descripcion, monto]);
    res.status(201).json({ message: 'Egreso registrado', idegresos });
  } catch(err) { handleDbError(res, err); }
});

router.put('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto } = req.body;
        await pool.query('UPDATE egresos SET descripcion=$1, monto=$2 WHERE idegresos=$3', [descripcion, monto, req.params.id]);
        res.json({ message: 'Egreso actualizado' });
    } catch(err) { handleDbError(res, err); }
});

router.delete('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM egresos WHERE idegresos=$1', [req.params.id]);
        res.json({ message: 'Egreso eliminado' });
    } catch(err) { handleDbError(res, err); }
});

// --- SALDOS ---
router.get('/saldos/today', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(`SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha FROM saldos WHERE fecha = $1`, [today]);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

router.post('/saldos/buy', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, montoPagado, montoRecibido } = req.body;
        const { idCaja } = req.user;
        await client.query('BEGIN');

        const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) 
             VALUES ($1, $2, $3, $4, NOW(), 'Registrado')`,
            [idegresos, idCaja, `COMPRA SALDO ${red}`, montoPagado]
        );

        const today = new Date().toISOString().split('T')[0];
        const check = await client.query('SELECT idsaldos FROM saldos WHERE red=$1 AND fecha=$2', [red, today]);
        
        if (check.rows.length === 0) {
             const idSaldo = await generateNextId('saldos', 'idsaldos', 'SAL', client);
             await client.query(
                `INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, $2, 0, $3, $3, $4)`,
                [idSaldo, red, montoRecibido, today]
             );
        } else {
            await client.query(`UPDATE saldos SET saldoComprado = COALESCE(saldoComprado, 0) + $1, saldoFinal = COALESCE(saldoFinal, 0) + $1 WHERE red = $2 AND fecha = $3`, 
            [montoRecibido, red, today]);
        }
        await client.query('COMMIT');
        res.status(201).json({ message: 'Saldo comprado registrado' });
    } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

router.post('/recargas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { red, tipo, descripcion, precioCobrado, precioPagado } = req.body;
    const { idCaja } = req.user;
    await client.query('BEGIN');

    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, NOW(), 'Registrado')`,
      [idIngreso, idCaja, `RECARGA ${red}: ${descripcion}`, precioCobrado, precioPagado]
    );

    const idRecargas = await generateNextId('recargas', 'idRecargas', 'REC', client);
    await client.query(
      `INSERT INTO recargas (idRecargas, red, tipo, descripcion, precioCobrado, precioPagado, estado) VALUES ($1, $2, $3, $4, $5, $6, 'Completada')`,
      [idRecargas, red, tipo, descripcion, precioCobrado, precioPagado]
    );

    const today = new Date().toISOString().split('T')[0];
    await client.query(`UPDATE saldos SET saldoFinal = COALESCE(saldoFinal, saldoInicio) - $1 WHERE red = $2 AND fecha = $3`, [precioPagado, red, today]);

    await client.query('COMMIT');
    res.status(201).json({ message: 'Recarga exitosa' });
  } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

// --- PAQUETES ---
router.get('/paquetes', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT idPaquete as "idPaquete", red, nombre, precio, costo, estado FROM paquetes ORDER BY red, precio');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/paquetes', authenticateToken, async (req, res) => {
    try {
        const { red, nombre, precio, costo } = req.body;
        const id = await generateNextId('paquetes', 'idPaquete', 'PAQ');
        await pool.query('INSERT INTO paquetes VALUES ($1,$2,$3,$4,$5,$6)', [id, red, nombre, precio, costo, 'Activo']);
        res.status(201).json({ message: 'Paquete creado', id });
    } catch(e) { handleDbError(res, e); }
});

router.put('/paquetes/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, precio, costo, estado } = req.body;
        await pool.query('UPDATE paquetes SET nombre=$1, precio=$2, costo=$3, estado=$4 WHERE idPaquete=$5', [nombre, precio, costo, estado, req.params.id]);
        res.json({ message: 'Actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/paquetes/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM paquetes WHERE idPaquete=$1', [req.params.id]);
        res.json({ message: 'Eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- COSTOS ---
router.get('/costos', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT codCostos as "codCostos", tipo, descripcion, monto, estado FROM costos');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/costos', authenticateToken, async (req, res) => {
    try {
        const { tipo, descripcion, monto, estado } = req.body;
        const id = await generateNextId('costos', 'codCostos', 'CST');
        await pool.query('INSERT INTO costos VALUES ($1,$2,$3,$4,$5)', [id, tipo, descripcion, monto, estado]);
        res.status(201).json({ message: 'Costo registrado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/costos/:id', authenticateToken, async (req, res) => {
    try {
        const { tipo, descripcion, monto, estado } = req.body;
        await pool.query('UPDATE costos SET tipo=$1, descripcion=$2, monto=$3, estado=$4 WHERE codCostos=$5', [tipo, descripcion, monto, estado, req.params.id]);
        res.json({ message: 'Costo actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/costos/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM costos WHERE codCostos=$1', [req.params.id]);
        res.json({ message: 'Costo eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- ADMIN DASHBOARD ---
router.get('/admin/cajas-status', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.idCaja as "idCaja", c.nombre as "nombreCaja", a.idArqueo as "idArqueo", a.estado as "estadoArqueo", a.fechaApertura as "fechaApertura", a.montoInicial as "montoInicial", a.ganancia, u.usuario
            FROM caja c
            LEFT JOIN arqueo a ON c.idCaja = a.idCaja AND a.fechaApertura = (SELECT MAX(fechaApertura) FROM arqueo WHERE idCaja = c.idCaja)
            LEFT JOIN usuarios u ON a.idUsuario = u.codUsuario
            ORDER BY c.idCaja
        `);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/admin/reopen-box', authenticateToken, async (req, res) => {
    try {
        const { idArqueo } = req.body;
        await pool.query(`UPDATE arqueo SET estado = 'Activo', fechaCierre = NULL, montoFinal = NULL WHERE idArqueo = $1`, [idArqueo]);
        res.json({ message: 'Caja reabierta exitosamente' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
