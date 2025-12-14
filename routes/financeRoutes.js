
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// ==========================================
// 1. GESTIÓN DE ARQUEO (APERTURA/CIERRE)
// ==========================================

// Obtener arqueo activo
router.get('/arqueo/active', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        const result = await pool.query(
            `SELECT 
                idArqueo as "idArqueo",
                idCaja as "idCaja",
                idUsuario as "idUsuario",
                fechaApertura as "fechaApertura",
                montoInicial as "montoInicial",
                estado,
                totalVentas as "totalVentas"
             FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`,
            [idCaja]
        );
        res.json(result.rows[0] || null);
    } catch (e) { handleDbError(res, e); }
});

// Aperturar Caja
router.post('/arqueo/open', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { montoInicial, saldoTigoInicial, saldoClaroInicial, fechaLocal } = req.body;
        const { idCaja, codUsuario } = req.user;

        const active = await client.query(`SELECT 1 FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
        if (active.rows.length > 0) return res.status(400).json({ error: 'Ya existe una caja abierta.' });

        await client.query('BEGIN');

        const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
        // Usar fecha local enviada o generar una timestamp completa
        const fecha = fechaLocal ? `${fechaLocal} ${new Date().toLocaleTimeString('en-US', {hour12:false})}` : getLocalTimestamp();

        await client.query(
            `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, estado)
             VALUES ($1, $2, $3, $4, $5, 'Activo')`,
            [idArqueo, idCaja, codUsuario, fecha, montoInicial]
        );

        // Registrar Saldos Iniciales
        if (saldoTigoInicial !== undefined && saldoClaroInicial !== undefined) {
             const today = fechaLocal || new Date().toISOString().split('T')[0];
             const checkSaldos = await client.query(`SELECT 1 FROM saldos WHERE fecha = $1`, [today]);
             
             if (checkSaldos.rows.length === 0) {
                 const idSaldosTigo = await generateNextId('saldos', 'idsaldos', 'SLD', client);
                 await client.query(
                     `INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'TIGO', $2, 0, $2, $3)`,
                     [idSaldosTigo, saldoTigoInicial, today]
                 );

                 // Hack para ID unico rapido
                 const parts = idSaldosTigo.split('-');
                 const nextNum = parseInt(parts[1]) + 1;
                 const idSaldosClaroSafe = `${parts[0]}-${nextNum.toString().padStart(4,'0')}`;

                 await client.query(
                     `INSERT INTO saldos (idsaldos, red, saldoInicio, saldoComprado, saldoFinal, fecha) VALUES ($1, 'CLARO', $2, 0, $2, $3)`,
                     [idSaldosClaroSafe, saldoClaroInicial, today]
                 );
             }
        }

        await client.query('COMMIT');
        res.json({ message: 'Caja aperturada', idArqueo });
    } catch (e) {
        await client.query('ROLLBACK');
        handleDbError(res, e);
    } finally {
        client.release();
    }
});

// Cerrar Caja
router.post('/arqueo/close', authenticateToken, async (req, res) => {
    try {
        const { idArqueo } = req.body;
        const { idCaja } = req.user;

        await updateArqueoBalance(idCaja, pool);

        const arqRes = await pool.query(`SELECT * FROM arqueo WHERE idArqueo = $1`, [idArqueo]);
        if (arqRes.rows.length === 0) return res.status(404).json({ error: 'Arqueo no encontrado' });
        const arqueo = arqRes.rows[0];

        const fechaStr = new Date(arqueo.fechaapertura).toISOString().split('T')[0]; // Postgres returns lowercase column names by default on SELECT *
        const saldosRes = await pool.query(`SELECT red, saldoFinal FROM saldos WHERE fecha = $1`, [fechaStr]);
        
        let saldoTigo = 0, saldoClaro = 0;
        saldosRes.rows.forEach(s => {
            if (s.red === 'TIGO') saldoTigo = Number(s.saldofinal); // lowercase from driver
            if (s.red === 'CLARO') saldoClaro = Number(s.saldofinal);
        });

        const fechaCierre = getLocalTimestamp();
        await pool.query(
            `UPDATE arqueo SET estado = 'Cerrada', fechaCierre = $1, saldoTigoFinal = $2, saldoClaroFinal = $3 WHERE idArqueo = $4`,
            [fechaCierre, saldoTigo, saldoClaro, idArqueo]
        );

        // Volver a leer para retornar datos actualizados
        const finalRes = await pool.query(`SELECT * FROM arqueo WHERE idArqueo = $1`, [idArqueo]);
        
        // Mapear a camelCase para el frontend
        const r = finalRes.rows[0];
        const resumen = {
            idArqueo: r.idarqueo,
            montoInicial: r.montoinicial,
            montoFinal: r.montofinal,
            totalVentas: r.totalventas,
            TotalGastos: r.totalgastos,
            ganancia: r.ganancia,
            fechaCierre: r.fechacierre,
            saldoTigoFinal: r.saldotigofinal,
            saldoClaroFinal: r.saldoclarofinal
        };

        res.json({
            message: 'Caja cerrada correctamente',
            resumen
        });

    } catch (e) { handleDbError(res, e); }
});

// ==========================================
// 2. INGRESOS Y EGRESOS
// ==========================================

router.get('/ingresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        // Usar alias explícitos para evitar problemas de mayúsculas/minúsculas
        let query = `SELECT idIngreso as "idIngreso", idCaja as "idCaja", descripcion, monto, costo, fechaCreacion as "fechaCreacion", estado FROM ingresos WHERE idCaja = $1`;
        const params = [idCaja];
        
        if (fecha) {
            query += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2`;
            params.push(fecha);
        }
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
        const fecha = fechaCreacion || getLocalTimestamp();

        await pool.query(
            `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, $6, 'Registrado')`,
            [id, idCaja, descripcion, monto, costo || 0, fecha]
        );
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'Ingreso registrado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, costo } = req.body;
        const { idCaja } = req.user;
        await pool.query(
            `UPDATE ingresos SET descripcion=$1, monto=$2, costo=$3 WHERE idIngreso=$4`,
            [descripcion, monto, costo || 0, req.params.id]
        );
        await updateArqueoBalance(idCaja);
        res.json({ message: 'Ingreso actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/ingresos/:id', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        await pool.query('DELETE FROM ingresos WHERE idIngreso=$1', [req.params.id]);
        await updateArqueoBalance(idCaja);
        res.json({ message: 'Ingreso eliminado' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/egresos', authenticateToken, async (req, res) => {
    try {
        const { idCaja, fecha } = req.query;
        let query = `SELECT idegresos as "idegresos", idCaja as "idCaja", descripcion, monto, fechaCreacion as "fechaCreacion", estado FROM egresos WHERE idCaja = $1`;
        const params = [idCaja];
        if (fecha) {
            query += ` AND TO_CHAR(fechaCreacion, 'YYYY-MM-DD') = $2`;
            params.push(fecha);
        }
        query += ` ORDER BY fechaCreacion DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/egresos', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto, fechaCreacion } = req.body;
        const { idCaja } = req.user;
        const id = await generateNextId('egresos', 'idegresos', 'EGRE');
        const fecha = fechaCreacion || getLocalTimestamp();

        await pool.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, 'Registrado')`,
            [id, idCaja, descripcion, monto, fecha]
        );
        await updateArqueoBalance(idCaja);
        res.status(201).json({ message: 'Egreso registrado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { descripcion, monto } = req.body;
        const { idCaja } = req.user;
        await pool.query(
            `UPDATE egresos SET descripcion=$1, monto=$2 WHERE idegresos=$3`,
            [descripcion, monto, req.params.id]
        );
        await updateArqueoBalance(idCaja);
        res.json({ message: 'Egreso actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/egresos/:id', authenticateToken, async (req, res) => {
    try {
        const { idCaja } = req.user;
        await pool.query('DELETE FROM egresos WHERE idegresos=$1', [req.params.id]);
        await updateArqueoBalance(idCaja);
        res.json({ message: 'Egreso eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// ==========================================
// 3. SALDOS Y RECARGAS
// ==========================================

router.get('/saldos/today', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const dateStr = fecha || new Date().toISOString().split('T')[0];
        const result = await pool.query(`SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoFinal as "saldoFinal" FROM saldos WHERE fecha = $1`, [dateStr]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.get('/saldos/status', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const dateStr = fecha || new Date().toISOString().split('T')[0];
        const result = await pool.query(`SELECT red FROM saldos WHERE fecha = $1`, [dateStr]);
        const status = {
            tigo: result.rows.some(r => r.red === 'TIGO'),
            claro: result.rows.some(r => r.red === 'CLARO')
        };
        res.json(status);
    } catch(e) { handleDbError(res, e); }
});

router.post('/saldos/buy', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { red, montoPagado, montoRecibido, fechaLocal } = req.body;
        const { idCaja } = req.user;
        const today = fechaLocal || new Date().toISOString().split('T')[0];

        await client.query('BEGIN');

        const idEgreso = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) VALUES ($1, $2, $3, $4, NOW(), 'Compra Saldo')`,
            [idEgreso, idCaja, `Compra Saldo ${red}`, montoPagado]
        );

        await client.query(
            `UPDATE saldos 
             SET saldoComprado = saldoComprado + $1, saldoFinal = saldoFinal + $1 
             WHERE red = $2 AND fecha = $3`,
            [montoRecibido, red, today]
        );

        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'Saldo comprado' });
    } catch(e) { 
        await client.query('ROLLBACK');
        handleDbError(res, e); 
    } finally { client.release(); }
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
            `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) VALUES ($1, $2, $3, $4, $5, NOW(), 'Recarga')`,
            [idIngreso, idCaja, `${tipo} ${red} - ${descripcion}`, precioCobrado, precioPagado]
        );

        await client.query(
            `UPDATE saldos SET saldoFinal = saldoFinal - $1 WHERE red = $2 AND fecha = $3`,
            [precioPagado, red, today]
        );

        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'Recarga exitosa' });
    } catch(e) { 
        await client.query('ROLLBACK');
        handleDbError(res, e); 
    } finally { client.release(); }
});

// ==========================================
// 4. ADMIN DASHBOARD DE CAJAS
// ==========================================

router.get('/admin/boxes/status', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                c.idCaja as "idCaja", 
                c.nombre as "nombreCaja",
                a.idArqueo as "idArqueo",
                a.estado as "estadoArqueo",
                a.montoInicial as "montoInicial",
                a.montoFinal as "montoFinal",
                a.ganancia,
                TO_CHAR(a.fechaApertura, 'YYYY-MM-DD HH24:MI:SS') as "fechaApertura",
                TO_CHAR(a.fechaCierre, 'YYYY-MM-DD HH24:MI:SS') as "fechaCierre",
                u.usuario,
                e.nombre || ' ' || e.apellido as "nombreEmpleado"
            FROM caja c
            LEFT JOIN arqueo a ON c.idCaja = a.idCaja AND (a.estado = 'Activo' OR a.fechaApertura >= CURRENT_DATE)
            LEFT JOIN usuarios u ON a.idUsuario = u.codUsuario
            LEFT JOIN empleado e ON u.identidad = e.identidad
            ORDER BY a.fechaApertura DESC NULLS LAST
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.get('/arqueo/:id/details', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        // Aliases explícitos
        const query = `
            SELECT 
                idArqueo as "idArqueo",
                idCaja as "idCaja",
                idUsuario as "idUsuario",
                TO_CHAR(fechaApertura, 'YYYY-MM-DD HH24:MI:SS') as "fechaApertura",
                TO_CHAR(fechaCierre, 'YYYY-MM-DD HH24:MI:SS') as "fechaCierre",
                montoInicial as "montoInicial",
                montoFinal as "montoFinal",
                estado,
                totalVentas as "totalVentas",
                ganancia
            FROM arqueo WHERE idArqueo = $1
        `;
        const arqRes = await pool.query(query, [id]);
        if(arqRes.rows.length === 0) return res.status(404).json({error: 'No encontrado'});
        
        const arqueo = arqRes.rows[0];
        const start = arqueo.fechaApertura; 
        
        let end = getLocalTimestamp();
        if (arqueo.fechaCierre) {
            end = arqueo.fechaCierre;
        }

        const ingRes = await pool.query(`SELECT idIngreso as "idIngreso", descripcion, monto, costo, fechaCreacion as "fechaCreacion" FROM ingresos WHERE idCaja = $1 AND fechaCreacion >= $2 AND fechaCreacion <= $3 ORDER BY fechaCreacion DESC`, [arqueo.idCaja, start, end]);
        const egrRes = await pool.query(`SELECT idegresos as "idegresos", descripcion, monto, fechaCreacion as "fechaCreacion" FROM egresos WHERE idCaja = $1 AND fechaCreacion >= $2 AND fechaCreacion <= $3 ORDER BY fechaCreacion DESC`, [arqueo.idCaja, start, end]);

        res.json({
            arqueo,
            ingresos: ingRes.rows,
            egresos: egrRes.rows
        });
    } catch(e) { handleDbError(res, e); }
});

router.put('/arqueo/:id/reopen', authenticateToken, async (req, res) => {
    try {
        await pool.query(`UPDATE arqueo SET estado = 'Activo', fechaCierre = NULL WHERE idArqueo = $1`, [req.params.id]);
        
        // Obtener ID de caja para recalcular
        const r = await pool.query(`SELECT idCaja FROM arqueo WHERE idArqueo = $1`, [req.params.id]);
        if(r.rows.length > 0) {
            await updateArqueoBalance(r.rows[0].idcaja, pool); // La librería devuelve minusculas si no se alisa, pero updateArqueoBalance maneja el string
        }
        
        res.json({ message: 'Caja reabierta' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/arqueo/:id/initial', authenticateToken, async (req, res) => {
    try {
        const { montoInicial } = req.body;
        await pool.query(`UPDATE arqueo SET montoInicial = $1 WHERE idArqueo = $2`, [montoInicial, req.params.id]);
        
        const r = await pool.query(`SELECT idCaja FROM arqueo WHERE idArqueo = $1`, [req.params.id]);
        if(r.rows.length > 0) {
            await updateArqueoBalance(r.rows[0].idcaja, pool);
        }
        res.json({ message: 'Monto inicial actualizado' });
    } catch(e) { handleDbError(res, e); }
});

// --- NUEVOS ENDPOINTS ADMIN SALDOS ---
router.get('/admin/saldos', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
        
        const query = `SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha FROM saldos WHERE fecha = $1`;
        const result = await pool.query(query, [fecha]);
        res.json(result.rows);
    } catch (err) { handleDbError(res, err); }
});

router.put('/admin/saldos/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { saldoInicio, saldoFinal } = req.body;
        
        await pool.query(
            `UPDATE saldos SET saldoInicio = $1, saldoFinal = $2 WHERE idsaldos = $3`,
            [saldoInicio, saldoFinal, id]
        );
        res.json({ message: 'Saldos actualizados correctamente' });
    } catch (err) { handleDbError(res, err); }
});

module.exports = router;
