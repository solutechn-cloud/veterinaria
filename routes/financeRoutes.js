
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// Middleware interno para validar caja abierta
const validateOpenBox = async (idCaja, res) => {
    const result = await pool.query(`SELECT idArqueo FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
    if (result.rows.length === 0) {
        res.status(400).json({ error: 'La caja está CERRADA. Debe realizar una apertura antes de registrar movimientos.' });
        return false;
    }
    return true;
};

// ==========================================
// RUTAS ADMINISTRATIVAS (PANEL CONTROL)
// ==========================================

// --- ADMIN: STATUS DASHBOARD ---
router.get('/admin/boxes/status', authenticateToken, async (req, res) => {
    try {
        // Recalcular saldo de todas las cajas activas antes de mostrar
        const activeBoxes = await pool.query("SELECT idCaja FROM arqueo WHERE estado = 'Activo'");
        for(const box of activeBoxes.rows) {
            await updateArqueoBalance(box.idcaja, pool);
        }

        const query = `
            SELECT DISTINCT ON (c.idCaja)
                c.idCaja as "idCaja",
                c.nombre as "nombreCaja",
                a.idArqueo as "idArqueo",
                a.estado as "estadoArqueo",
                COALESCE(a.montoInicial, 0) as "montoInicial",
                COALESCE(a.montoFinal, 0) as "montoFinal",
                COALESCE(a.ganancia, 0) as "ganancia",
                a.fechaApertura as "fechaApertura",
                a.fechaCierre as "fechaCierre",
                u.usuario as "usuario",
                e.nombre || ' ' || e.apellido as "nombreEmpleado"
            FROM caja c
            LEFT JOIN arqueo a ON c.idCaja = a.idCaja
            LEFT JOIN usuarios u ON a.idUsuario = u.codUsuario
            LEFT JOIN empleado e ON u.identidad = e.identidad
            ORDER BY c.idCaja, a.fechaApertura DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) { handleDbError(res, err); }
});

// --- ADMIN: DETALLES DE UNA SESIÓN ---
router.get('/arqueo/:id/details', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Info General
        const arqueoRes = await pool.query(`
            SELECT a.*, u.usuario 
            FROM arqueo a 
            LEFT JOIN usuarios u ON a.idUsuario = u.codUsuario 
            WHERE a.idArqueo = $1`, [id]);
            
        if(arqueoRes.rows.length === 0) return res.status(404).json({error: 'Arqueo no encontrado'});

        const arqueo = arqueoRes.rows[0];
        const fechaInicio = arqueo.fechaapertura;
        const fechaFin = arqueo.fechacierre || '2099-12-31 23:59:59'; 

        // 2. Movimientos (CORREGIDO: Casting explícito a timestamp)
        const ingresos = await pool.query(`
            SELECT idIngreso as "idIngreso", descripcion, monto, costo, fechaCreacion as "fechaCreacion"
            FROM ingresos 
            WHERE idCaja = $1 
            AND fechaCreacion::timestamp >= $2::timestamp 
            AND fechaCreacion::timestamp <= $3::timestamp
            ORDER BY fechaCreacion DESC
        `, [arqueo.idcaja, fechaInicio, fechaFin]);
            
        const egresos = await pool.query(`
            SELECT idegresos as "idegresos", descripcion, monto, fechaCreacion as "fechaCreacion"
            FROM egresos 
            WHERE idCaja = $1 
            AND fechaCreacion::timestamp >= $2::timestamp 
            AND fechaCreacion::timestamp <= $3::timestamp
            ORDER BY fechaCreacion DESC
        `, [arqueo.idcaja, fechaInicio, fechaFin]);

        res.json({
            arqueo: arqueo,
            ingresos: ingresos.rows,
            egresos: egresos.rows
        });
    } catch (err) { handleDbError(res, err); }
});

// --- ADMIN: EDITAR MONTO INICIAL ---
router.put('/arqueo/:id/initial', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { montoInicial } = req.body;
        const { id } = req.params;

        await client.query('BEGIN');
        
        const arq = await client.query('SELECT idCaja FROM arqueo WHERE idArqueo = $1', [id]);
        if(arq.rows.length === 0) throw new Error('Arqueo no encontrado');

        await client.query('UPDATE arqueo SET montoInicial = $1 WHERE idArqueo = $2', [montoInicial, id]);
        
        await updateArqueoBalance(arq.rows[0].idcaja, client);
        
        await client.query('COMMIT');
        res.json({ message: 'Monto inicial corregido y saldos recalculados.' });
    } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

// --- ADMIN: REABRIR CAJA ---
router.put('/arqueo/:id/reopen', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const targetBox = await client.query('SELECT idCaja FROM arqueo WHERE idArqueo = $1', [id]);
        if(targetBox.rows.length === 0) throw new Error('Arqueo no existe');
        const idCaja = targetBox.rows[0].idcaja;

        const activeCheck = await client.query("SELECT idArqueo FROM arqueo WHERE idCaja = $1 AND estado = 'Activo' AND idArqueo != $2", [idCaja, id]);
        if (activeCheck.rows.length > 0) {
            return res.status(400).json({ error: `Ya existe una sesión activa para esta caja.` });
        }

        await client.query("UPDATE arqueo SET estado = 'Activo', fechaCierre = NULL WHERE idArqueo = $1", [id]);
        res.json({ message: 'Caja reabierta exitosamente.' });
    } catch (err) { handleDbError(res, err); } finally { client.release(); }
});


// ==========================================
// RUTAS OPERATIVAS (CAJERO)
// ==========================================

// --- ARQUEO CAJA ---
router.get('/arqueo/active', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { idCaja } = req.user;
    
    try { await updateArqueoBalance(idCaja, client); } catch (e) { console.error(e); }

    const result = await client.query(
      `SELECT idArqueo as "idArqueo", idCaja as "idCaja", idUsuario as "idUsuario", 
              fechaApertura as "fechaApertura", montoInicial as "montoInicial", 
              montoFinal as "montoFinal", estado 
       FROM arqueo 
       WHERE idCaja = $1 AND estado = 'Activo' 
       ORDER BY fechaApertura DESC LIMIT 1`,
      [idCaja]
    );

    let activeArqueo = result.rows[0] || null;
    res.json(activeArqueo);
  } catch(err) { handleDbError(res, err); } finally { client.release(); }
});

router.post('/arqueo/open', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { montoInicial, saldoTigoInicial, saldoClaroInicial, fechaLocal } = req.body;
    const { codUsuario, idCaja } = req.user;
    const today = fechaLocal || new Date().toISOString().split('T')[0];
    const localTimestamp = getLocalTimestamp();

    const check = await client.query(`SELECT * FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
    if (check.rows.length > 0) {
        await client.query(`UPDATE arqueo SET estado = 'Cerrada', fechaCierre = $2 WHERE idArqueo = $1`, [check.rows[0].idarqueo, localTimestamp]);
    }

    await client.query('BEGIN');
    const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
    
    await client.query(
      `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, montoFinal, estado)
       VALUES ($1, $2, $3, $4, $5, $5, 'Activo')`,
      [idArqueo, idCaja, codUsuario, localTimestamp, montoInicial]
    );

    for(const red of ['TIGO', 'CLARO']) {
        const saldoIni = red === 'TIGO' ? saldoTigoInicial : saldoClaroInicial;
        if(saldoIni !== undefined) {
             const checkSaldo = await client.query('SELECT * FROM saldos WHERE red=$1 AND fecha = $2', [red, today]);
             if (checkSaldo.rows.length === 0) {
                  const idSaldo = await generateNextId('saldos', 'idsaldos', 'SAL', client);
                  await client.query(
                    `INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, $2, $3, 0, $3, $4)`,
                    [idSaldo, red, saldoIni, today]
                  );
             }
        }
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
     const localTimestamp = getLocalTimestamp();
     await client.query('BEGIN');

     await updateArqueoBalance(idCaja, client);
     
     const finalData = await client.query(`SELECT montoFinal, totalVentas, totalCostos, TotalGastos, ganancia FROM arqueo WHERE idArqueo = $1`, [idArqueo]);
     const resumen = finalData.rows[0];

     await client.query(`
        UPDATE arqueo 
        SET estado = 'Cerrada', fechaCierre = $2
        WHERE idArqueo = $1
     `, [idArqueo, localTimestamp]);

     await client.query('COMMIT');
     res.json({ message: 'Caja Cerrada', resumen });
  } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

// --- INGRESOS ---
router.get('/ingresos', authenticateToken, async (req, res) => {
  const { idCaja } = req.user;
  const queryCaja = req.query.idCaja || idCaja;
  const fecha = req.query.fecha; 

  try {
    let query = `
         SELECT idIngreso as "idIngreso", idCaja as "idCaja", descripcion, monto, costo, fechaCreacion as "fechaCreacion", estado 
         FROM ingresos 
         WHERE idCaja = $1 
    `;
    const params = [queryCaja];

    if (fecha) {
        query += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2`;
        params.push(fecha);
    }

    query += ` ORDER BY fechaCreacion DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

router.post('/ingresos', authenticateToken, async (req, res) => {
  try {
    const { descripcion, monto, costo, fechaCreacion } = req.body;
    const { idCaja } = req.user;
    
    if (!(await validateOpenBox(idCaja, res))) return;

    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR');
    
    // USAR FECHA DEL CLIENTE SI SE ENVIA, SINO FALLBACK AL SERVIDOR
    const timestampToUse = fechaCreacion || getLocalTimestamp();
    
    await pool.query(
        `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, $6, 'Registrado')`,
        [idIngreso, idCaja, descripcion, monto, costo || 0, timestampToUse]
    );
    
    await updateArqueoBalance(idCaja, pool);
    
    res.status(201).json({ message: 'Ingreso registrado', idIngreso });
  } catch(err) { handleDbError(res, err); }
});

router.put('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo } = req.body;
        await pool.query('UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4 RETURNING idCaja', [descripcion, monto, costo, req.params.id])
            .then(async (r) => {
                if(r.rows.length > 0) await updateArqueoBalance(r.rows[0].idcaja, pool);
            });
        
        res.json({ message: 'Ingreso actualizado' });
    } catch(err) { handleDbError(res, err); }
});

router.delete('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM ingresos WHERE idIngreso=$1 RETURNING idCaja', [req.params.id]);
        if(result.rows.length > 0) await updateArqueoBalance(result.rows[0].idcaja, pool);
        
        res.json({ message: 'Ingreso eliminado' });
    } catch(err) { handleDbError(res, err); }
});

// --- EGRESOS ---
router.get('/egresos', authenticateToken, async (req, res) => {
  const { idCaja } = req.user;
  const queryCaja = req.query.idCaja || idCaja;
  const fecha = req.query.fecha;

  try {
    let query = `
         SELECT idegresos as "idegresos", idCaja as "idCaja", descripcion, monto, fechaCreacion as "fechaCreacion", estado 
         FROM egresos 
         WHERE idCaja = $1 
    `;
    const params = [queryCaja];

    if (fecha) {
        query += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2`;
        params.push(fecha);
    } 

    query += ` ORDER BY fechaCreacion DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

router.post('/egresos', authenticateToken, async (req, res) => {
  try {
    const { descripcion, monto, fechaCreacion } = req.body;
    const { idCaja } = req.user;
    
    if (!(await validateOpenBox(idCaja, res))) return;

    const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE');
    
    // USAR FECHA DEL CLIENTE SI SE ENVIA, SINO FALLBACK AL SERVIDOR
    const timestampToUse = fechaCreacion || getLocalTimestamp();
    
    await pool.query(
        `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, 'Registrado')`,
        [idegresos, idCaja, descripcion, monto, timestampToUse]
    );
    
    await updateArqueoBalance(idCaja, pool);

    res.status(201).json({ message: 'Egreso registrado', idegresos });
  } catch(err) { handleDbError(res, err); }
});

router.put('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto } = req.body;
        await pool.query('UPDATE egresos SET descripcion=$1, monto=$2 WHERE idegresos=$3 RETURNING idCaja', [descripcion, monto, req.params.id])
            .then(async (r) => {
                if(r.rows.length > 0) await updateArqueoBalance(r.rows[0].idcaja, pool);
            });
        res.json({ message: 'Egreso actualizado' });
    } catch(err) { handleDbError(res, err); }
});

router.delete('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM egresos WHERE idegresos=$1 RETURNING idCaja', [req.params.id]);
        if(result.rows.length > 0) await updateArqueoBalance(result.rows[0].idcaja, pool);
        res.json({ message: 'Egreso eliminado' });
    } catch(err) { handleDbError(res, err); }
});

// --- SALDOS, COMPRAS, RECARGAS ---
router.get('/saldos/today', authenticateToken, async (req, res) => {
  try {
    const { fecha } = req.query; 
    const targetDate = fecha || new Date().toISOString().split('T')[0];
    const query = `SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha FROM saldos WHERE fecha = $1`;
    const result = await pool.query(query, [targetDate]);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

router.get('/saldos/status', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const targetDate = fecha || new Date().toISOString().split('T')[0];
        const query = 'SELECT red FROM saldos WHERE fecha = $1';
        const result = await pool.query(query, [targetDate]);
        const hasTigo = result.rows.some(r => r.red === 'TIGO');
        const hasClaro = result.rows.some(r => r.red === 'CLARO');
        res.json({ tigo: hasTigo, claro: hasClaro });
    } catch(err) { handleDbError(res, err); }
});

router.post('/saldos/buy', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, montoPagado, montoRecibido, fechaLocal } = req.body;
        const { idCaja } = req.user;
        const today = fechaLocal || new Date().toISOString().split('T')[0];
        
        // El cliente envía "fechaLocal" que es solo fecha (YYYY-MM-DD), necesitamos timestamp
        // Usar hora actual del servidor (ya ajustada) o construirla
        const localTimestamp = getLocalTimestamp();
        
        await client.query('BEGIN');

        const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) 
             VALUES ($1, $2, $3, $4, $5, 'Registrado')`,
            [idegresos, idCaja, `COMPRA SALDO ${red}`, montoPagado, localTimestamp]
        );

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
        
        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.status(201).json({ message: 'Saldo comprado registrado' });
    } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

router.post('/recargas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { red, tipo, descripcion, precioCobrado, precioPagado, fechaLocal } = req.body;
    const { idCaja } = req.user;
    const today = fechaLocal || new Date().toISOString().split('T')[0];
    const localTimestamp = getLocalTimestamp();

    await client.query('BEGIN');

    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, $6, 'Registrado')`,
      [idIngreso, idCaja, `RECARGA ${red}: ${descripcion}`, precioCobrado, precioPagado, localTimestamp]
    );

    const idRecargas = await generateNextId('recargas', 'idRecargas', 'REC', client);
    await client.query(
      `INSERT INTO recargas (idRecargas, red, tipo, descripcion, precioCobrado, precioPagado, estado) VALUES ($1, $2, $3, $4, $5, $6, 'Completada')`,
      [idRecargas, red, tipo, descripcion, precioCobrado, precioPagado]
    );

    await client.query(`UPDATE saldos SET saldoFinal = COALESCE(saldoFinal, saldoInicio) - $1 WHERE red = $2 AND fecha = $3`, [precioPagado, red, today]);

    await updateArqueoBalance(idCaja, client);

    await client.query('COMMIT');
    res.status(201).json({ message: 'Recarga exitosa' });
  } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

module.exports = router;
