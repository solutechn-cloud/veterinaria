
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

    // 2. Validar si el arqueo es del día actual (Logica de "Día Nuevo, Caja Nueva")
    if (activeArqueo) {
        const dbDate = new Date(activeArqueo.fechaApertura).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];

        // Si la caja está abierta pero es de un día anterior, la cerramos automáticamente
        if (dbDate !== today) {
             const idArqueo = activeArqueo.idArqueo;
             console.log(`Auto-closing expired box session: ${idArqueo}`);

             // Calcular totales para el cierre automático
             const ingresosRes = await client.query(`
                SELECT COALESCE(SUM(monto), 0) as total_ingresos, COALESCE(SUM(costo), 0) as costo_ingresos
                FROM ingresos 
                WHERE idCaja = $1 AND fechaCreacion >= $2 AND fechaCreacion < $3::date + 1
             `, [idCaja, activeArqueo.fechaApertura, dbDate]);
             
             const egresosRes = await client.query(`
                SELECT COALESCE(SUM(monto), 0) as total_egresos
                FROM egresos 
                WHERE idCaja = $1 AND fechaCreacion >= $2 AND fechaCreacion < $3::date + 1
             `, [idCaja, activeArqueo.fechaApertura, dbDate]);

             const totalIngresos = parseFloat(ingresosRes.rows[0].total_ingresos);
             const totalCostos = parseFloat(ingresosRes.rows[0].costo_ingresos);
             const totalEgresos = parseFloat(egresosRes.rows[0].total_egresos);
             const ganancia = totalIngresos - totalCostos;
             const montoFinal = parseFloat(activeArqueo.montoInicial) + totalIngresos - totalEgresos;

             await client.query(`
                UPDATE arqueo 
                SET estado = 'Cerrada', fechaCierre = NOW(), 
                    montoFinal = $1, totalVentas = $2, totalCostos = $3, TotalGastos = $4, ganancia = $5
                WHERE idArqueo = $6
             `, [montoFinal, totalIngresos, totalCostos, totalEgresos, ganancia, idArqueo]);

             // Retornamos null para forzar al usuario a abrir caja hoy
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
        // Doble verificación: Si la caja activa es de hoy, error. Si es vieja, el endpoint GET debió cerrarla, pero por seguridad:
        const activeDate = new Date(check.rows[0].fechaapertura).toISOString().split('T')[0];
        if (activeDate === today) {
            return res.status(400).json({ error: 'Caja ya abierta para el día de hoy.' });
        }
        // Si llegamos aqui y hay caja vieja activa, forzamos cierre previo (safety net)
        await client.query(`UPDATE arqueo SET estado = 'Cerrada', fechaCierre = NOW() WHERE idArqueo = $1`, [check.rows[0].idarqueo]);
    }

    await client.query('BEGIN');
    const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
    
    // IMPORTANTE: montoFinal inicia igual al montoInicial
    await client.query(
      `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, montoFinal, estado)
       VALUES ($1, $2, $3, NOW(), $4, $4, 'Activo')`,
      [idArqueo, idCaja, codUsuario, montoInicial]
    );

    // Inicializar saldos si no existen
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

     // Calcular totales basados en el rango de tiempo de la caja
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
     const montoInicial = parseFloat(arqueoInfo.rows[0].montoinicial || 0);
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

// --- INGRESOS (Solo Hoy) ---
router.get('/ingresos', authenticateToken, async (req, res) => {
  const { idCaja } = req.user; // Usar ID del token por seguridad, o query si es admin
  const queryCaja = req.query.idCaja || idCaja;

  try {
    // FILTRO: Solo registros del día actual (CURRENT_DATE)
    const result = await pool.query(
        `SELECT idIngreso as "idIngreso", idCaja as "idCaja", descripcion, monto, costo, fechaCreacion as "fechaCreacion", estado 
         FROM ingresos 
         WHERE idCaja = $1 AND fechaCreacion::date = CURRENT_DATE 
         ORDER BY fechaCreacion DESC`, 
        [queryCaja]
    );
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
    
    // Actualizar Saldo Caja
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

// --- EGRESOS (Solo Hoy) ---
router.get('/egresos', authenticateToken, async (req, res) => {
  const { idCaja } = req.user;
  const queryCaja = req.query.idCaja || idCaja;

  try {
    // FILTRO: Solo registros del día actual
    const result = await pool.query(
        `SELECT idegresos as "idegresos", idCaja as "idCaja", descripcion, monto, fechaCreacion as "fechaCreacion", estado 
         FROM egresos 
         WHERE idCaja = $1 AND fechaCreacion::date = CURRENT_DATE 
         ORDER BY fechaCreacion DESC`, 
        [queryCaja]
    );
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
    
    // Actualizar Saldo Caja
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
    let query = `SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha FROM saldos WHERE fecha = $1`;
    let params = [fecha];
    
    if(!fecha) {
         query = `SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha FROM saldos WHERE fecha = CURRENT_DATE`;
         params = [];
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

router.get('/saldos/status', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        // Verifica si existen saldos para la fecha dada
        const query = 'SELECT red FROM saldos WHERE fecha = $1';
        const result = await pool.query(query, [fecha || new Date().toISOString().split('T')[0]]);
        
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

        // Registro del Gasto
        const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) 
             VALUES ($1, $2, $3, $4, NOW(), 'Registrado')`,
            [idegresos, idCaja, `COMPRA SALDO ${red}`, montoPagado]
        );

        // Actualización de Saldo (Airtime)
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

    // 1. Ingreso de efectivo a caja
    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, NOW(), 'Registrado')`,
      [idIngreso, idCaja, `RECARGA ${red}: ${descripcion}`, precioCobrado, precioPagado]
    );

    // 2. Registro de transaccion
    const idRecargas = await generateNextId('recargas', 'idRecargas', 'REC', client);
    await client.query(
      `INSERT INTO recargas (idRecargas, red, tipo, descripcion, precioCobrado, precioPagado, estado) VALUES ($1, $2, $3, $4, $5, $6, 'Completada')`,
      [idRecargas, red, tipo, descripcion, precioCobrado, precioPagado]
    );

    // 3. Descuento del saldo de la Red (Airtime)
    await client.query(`UPDATE saldos SET saldoFinal = COALESCE(saldoFinal, saldoInicio) - $1 WHERE red = $2 AND fecha = $3`, [precioPagado, red, today]);

    // 4. Actualizar Caja (Monto Final)
    await updateArqueoBalance(idCaja, client);

    await client.query('COMMIT');
    res.status(201).json({ message: 'Recarga exitosa' });
  } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

module.exports = router;
