
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// SQL para obtener hora local (Honduras UTC-6) en lugar de UTC del servidor
const LOCAL_TIMESTAMP = "(NOW() AT TIME ZONE 'UTC' AT TIME ZONE 'America/Tegucigalpa')";

// Middleware interno para validar caja abierta
const validateOpenBox = async (idCaja, res) => {
    const result = await pool.query(`SELECT idArqueo FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
    if (result.rows.length === 0) {
        res.status(400).json({ error: 'La caja está CERRADA. Debe realizar una apertura antes de registrar movimientos.' });
        return false;
    }
    return true;
};

// Función auxiliar para actualizar balance (Re-declarada aquí para uso interno de rutas si no se importa)
// Asegura que no devuelva NaN
const updateArqueoBalanceInternal = async (idCaja, client) => {
    try {
        // 1. Obtener datos de la sesión activa
        const arqRes = await client.query(
            `SELECT idArqueo, montoInicial, fechaApertura FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, 
            [idCaja]
        );
        
        if (arqRes.rows.length === 0) return;

        const { idArqueo, montoInicial, fechaApertura } = arqRes.rows[0];

        // 2. Calcular sumatorias usando COALESCE para evitar NULL
        const ingRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0) as total, COALESCE(SUM(costo), 0) as costo
            FROM ingresos 
            WHERE idCaja = $1 AND fechaCreacion >= $2
        `, [idCaja, fechaApertura]);

        const egrRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0) as total
            FROM egresos 
            WHERE idCaja = $1 AND fechaCreacion >= $2
        `, [idCaja, fechaApertura]);

        const totalIngresos = Number(ingRes.rows[0].total);
        const totalCostos = Number(ingRes.rows[0].costo);
        const totalEgresos = Number(egrRes.rows[0].total);
        const baseInicial = Number(montoInicial);

        // Fórmula: Final = Inicial + Ingresos - Egresos
        const montoFinal = (baseInicial + totalIngresos) - totalEgresos;
        const ganancia = totalIngresos - totalCostos;

        // 3. Impactar en base de datos
        await client.query(`
            UPDATE arqueo 
            SET totalVentas = $1, totalCostos = $2, TotalGastos = $3, montoFinal = $4, ganancia = $5
            WHERE idArqueo = $6
        `, [totalIngresos, totalCostos, totalEgresos, montoFinal, ganancia, idArqueo]);
        
    } catch (err) {
        console.error("Error actualizando balance:", err);
    }
};

// --- ADMIN: STATUS DASHBOARD ---
router.get('/admin/boxes/status', authenticateToken, async (req, res) => {
    try {
        // Recalcular saldo de todas las cajas activas antes de mostrar
        const activeBoxes = await pool.query("SELECT idCaja FROM arqueo WHERE estado = 'Activo'");
        for(const box of activeBoxes.rows) {
            await updateArqueoBalanceInternal(box.idcaja, pool);
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

// --- ADMIN: DETALLES DE UNA SESIÓN (CORREGIDO) ---
router.get('/arqueo/:id/details', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Obtener Info General del Arqueo y sus fechas límite
        const arqueoRes = await pool.query(`
            SELECT a.*, u.usuario 
            FROM arqueo a 
            LEFT JOIN usuarios u ON a.idUsuario = u.codUsuario 
            WHERE a.idArqueo = $1`, [id]);
            
        if(arqueoRes.rows.length === 0) return res.status(404).json({error: 'Arqueo no encontrado'});

        const arqueo = arqueoRes.rows[0];
        const fechaInicio = arqueo.fechaapertura;
        // Si está cerrada, usar fechaCierre. Si está activa, usar NOW() del futuro para incluir todo.
        // Usamos un timestamp muy lejano si es null para asegurar que traiga todo lo reciente.
        const fechaFin = arqueo.fechacierre || '2099-12-31 23:59:59'; 

        // 2. Movimientos (Filtrar por Rango de Tiempo de esa sesión específica)
        // Eliminamos filtros de "HOY" y usamos estrictamente >= FechaApertura
        const ingresos = await pool.query(`
            SELECT idIngreso as "idIngreso", descripcion, monto, costo, fechaCreacion as "fechaCreacion"
            FROM ingresos 
            WHERE idCaja = $1 
            AND fechaCreacion >= $2 
            AND fechaCreacion <= $3
            ORDER BY fechaCreacion DESC
        `, [arqueo.idcaja, fechaInicio, fechaFin]);
            
        const egresos = await pool.query(`
            SELECT idegresos as "idegresos", descripcion, monto, fechaCreacion as "fechaCreacion"
            FROM egresos 
            WHERE idCaja = $1 
            AND fechaCreacion >= $2 
            AND fechaCreacion <= $3
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
        
        // Recalcular todo
        await updateArqueoBalanceInternal(arq.rows[0].idcaja, client);
        
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


// --- ARQUEO CAJA (USER) ---
router.get('/arqueo/active', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { idCaja } = req.user;
    
    // Recalcular saldo al vuelo
    try { await updateArqueoBalanceInternal(idCaja, client); } catch (e) { console.error(e); }

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

    const check = await client.query(`SELECT * FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
    if (check.rows.length > 0) {
        // Cerrar caja anterior si quedó abierta
        await client.query(`UPDATE arqueo SET estado = 'Cerrada', fechaCierre = ${LOCAL_TIMESTAMP} WHERE idArqueo = $1`, [check.rows[0].idarqueo]);
    }

    await client.query('BEGIN');
    const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
    
    await client.query(
      `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, montoFinal, estado)
       VALUES ($1, $2, $3, ${LOCAL_TIMESTAMP}, $4, $4, 'Activo')`,
      [idArqueo, idCaja, codUsuario, montoInicial]
    );

    // Inicializar saldos si aplica
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

     await updateArqueoBalanceInternal(idCaja, client);
     
     const finalData = await client.query(`SELECT montoFinal, totalVentas, totalCostos, TotalGastos, ganancia FROM arqueo WHERE idArqueo = $1`, [idArqueo]);
     const resumen = finalData.rows[0];

     await client.query(`
        UPDATE arqueo 
        SET estado = 'Cerrada', fechaCierre = ${LOCAL_TIMESTAMP}
        WHERE idArqueo = $1
     `, [idArqueo]);

     await client.query('COMMIT');
     res.json({ message: 'Caja Cerrada', resumen });
  } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

// Importante: Exportar el router al final
module.exports = router;
