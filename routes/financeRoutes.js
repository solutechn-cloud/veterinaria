
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- ARQUEO CAJA ---
router.get('/arqueo/active', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { idCaja } = req.user;
    
    // 1. Buscar arqueo activo
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

    // 2. LOGICA DE DÍA NUEVO: Validar si el arqueo es de ayer
    if (activeArqueo) {
        // Extraer fecha YYYY-MM-DD de la apertura DB
        const dbDate = new Date(activeArqueo.fechaApertura).toISOString().split('T')[0];
        // Fecha actual del servidor (se asume timezone configurado o UTC manejable)
        // Para mayor seguridad usamos la fecha que viene del sistema ahora mismo
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const todayLocal = new Date(now.getTime() - offset).toISOString().split('T')[0];

        // Si la fecha de apertura NO es hoy, cerramos la caja forzosamente.
        if (dbDate !== todayLocal) {
             const idArqueo = activeArqueo.idArqueo;
             console.log(`Auto-closing expired box session ${idArqueo} (Date: ${dbDate} vs Today: ${todayLocal})`);

             // Calcular totales finales antes de cerrar
             await updateArqueoBalance(idCaja, client);
             
             // Cerrar Arqueo
             await client.query(`
                UPDATE arqueo 
                SET estado = 'Cerrada', fechaCierre = NOW()
                WHERE idArqueo = $1
             `, [idArqueo]);

             // Retornamos null para que el frontend pida "Nueva Apertura"
             activeArqueo = null;
        }
    }

    res.json(activeArqueo);
  } catch(err) { 
    handleDbError(res, err); 
  } finally {
    client.release();
  }
});

router.post('/arqueo/open', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { montoInicial, saldoTigoInicial, saldoClaroInicial, fechaLocal } = req.body;
    const { codUsuario, idCaja } = req.user;
    const today = fechaLocal || new Date().toISOString().split('T')[0];

    // Verificar si ya existe caja abierta HOY
    const check = await client.query(`SELECT * FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
    if (check.rows.length > 0) {
        await client.query(`UPDATE arqueo SET estado = 'Cerrada', fechaCierre = NOW() WHERE idArqueo = $1`, [check.rows[0].idarqueo]);
    }

    await client.query('BEGIN');
    const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
    
    await client.query(
      `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, montoFinal, estado)
       VALUES ($1, $2, $3, NOW(), $4, $4, 'Activo')`,
      [idArqueo, idCaja, codUsuario, montoInicial]
    );

    // Inicializar saldos
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
     await client.query('BEGIN');

     // Forzar actualización final
     await updateArqueoBalance(idCaja, client);
     
     // Obtener los datos calculados
     const finalData = await client.query(`SELECT montoFinal, totalVentas, totalCostos, TotalGastos, ganancia FROM arqueo WHERE idArqueo = $1`, [idArqueo]);
     const resumen = finalData.rows[0];

     await client.query(`
        UPDATE arqueo 
        SET estado = 'Cerrada', fechaCierre = NOW()
        WHERE idArqueo = $1
     `, [idArqueo]);

     await client.query('COMMIT');
     res.json({ message: 'Caja Cerrada', resumen });
  } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

// --- INGRESOS ---
router.get('/ingresos', authenticateToken, async (req, res) => {
  const { idCaja } = req.user;
  const queryCaja = req.query.idCaja || idCaja;
  const fecha = req.query.fecha; // YYYY-MM-DD

  try {
    let query = `
         SELECT idIngreso as "idIngreso", idCaja as "idCaja", descripcion, monto, costo, fechaCreacion as "fechaCreacion", estado 
         FROM ingresos 
         WHERE idCaja = $1 
    `;
    const params = [queryCaja];

    if (fecha) {
        // Filtro estricto por texto de fecha YYYY-MM-DD
        query += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2`;
        params.push(fecha);
    } else {
        // Fallback: usar fecha actual del servidor si no se envía nada
        query += ` AND fechaCreacion::date = CURRENT_DATE`;
    }

    query += ` ORDER BY fechaCreacion DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

router.post('/ingresos', authenticateToken, async (req, res) => {
  try {
    const { descripcion, monto, costo } = req.body;
    const { idCaja } = req.user;
    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR');
    
    await pool.query(
        `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, NOW(), 'Registrado')`,
        [idIngreso, idCaja, descripcion, monto, costo || 0]
    );
    
    await updateArqueoBalance(idCaja, pool);
    
    res.status(201).json({ message: 'Ingreso registrado', idIngreso });
  } catch(err) { handleDbError(res, err); }
});

router.put('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo } = req.body;
        const { idCaja } = req.user;
        await pool.query('UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4', [descripcion, monto, costo, req.params.id]);
        
        await updateArqueoBalance(idCaja, pool);
        res.json({ message: 'Ingreso actualizado' });
    } catch(err) { handleDbError(res, err); }
});

router.delete('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        await pool.query('DELETE FROM ingresos WHERE idIngreso=$1', [req.params.id]);
        
        await updateArqueoBalance(idCaja, pool);
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
    } else {
        query += ` AND fechaCreacion::date = CURRENT_DATE`;
    }

    query += ` ORDER BY fechaCreacion DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

router.post('/egresos', authenticateToken, async (req, res) => {
  try {
    const { descripcion, monto } = req.body;
    const { idCaja } = req.user;
    const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE');
    
    await pool.query(
        `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) VALUES ($1, $2, $3, $4, NOW(), 'Registrado')`,
        [idegresos, idCaja, descripcion, monto]
    );
    
    await updateArqueoBalance(idCaja, pool);

    res.status(201).json({ message: 'Egreso registrado', idegresos });
  } catch(err) { handleDbError(res, err); }
});

router.put('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto } = req.body;
        const { idCaja } = req.user;
        await pool.query('UPDATE egresos SET descripcion=$1, monto=$2 WHERE idegresos=$3', [descripcion, monto, req.params.id]);
        
        await updateArqueoBalance(idCaja, pool);
        res.json({ message: 'Egreso actualizado' });
    } catch(err) { handleDbError(res, err); }
});

router.delete('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        await pool.query('DELETE FROM egresos WHERE idegresos=$1', [req.params.id]);
        
        await updateArqueoBalance(idCaja, pool);
        res.json({ message: 'Egreso eliminado' });
    } catch(err) { handleDbError(res, err); }
});

// --- SALDOS Y RECARGAS ---
router.get('/saldos/today', authenticateToken, async (req, res) => {
  try {
    const { fecha } = req.query; 
    // Usar la fecha recibida o CURRENT_DATE
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
        
        await client.query('BEGIN');

        const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) 
             VALUES ($1, $2, $3, $4, NOW(), 'Registrado')`,
            [idegresos, idCaja, `COMPRA SALDO ${red}`, montoPagado]
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

    await client.query(`UPDATE saldos SET saldoFinal = COALESCE(saldoFinal, saldoInicio) - $1 WHERE red = $2 AND fecha = $3`, [precioPagado, red, today]);

    await updateArqueoBalance(idCaja, client);

    await client.query('COMMIT');
    res.status(201).json({ message: 'Recarga exitosa' });
  } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

module.exports = router;
