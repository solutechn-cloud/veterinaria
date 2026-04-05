
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- REPARACIONES ---
router.get('/reparaciones', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT r.*, c.nombre || ' ' || c.apellido as "nombre_cliente"
            FROM reparaciones r
            LEFT JOIN clientes c ON r.identidad_cliente = c.identidad
            ORDER BY r.fecha_ingreso DESC
        `;
        const r = await pool.query(query);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/reparaciones', authenticateToken, async (req, res) => {
    try {
        const { identidad_cliente, descripcion_falla, imei_equipo, marca, modelo, costo_tecnico, precio_cliente, nombre_tecnico, estado_reparacion, complementos, fecha_entrega_estimada } = req.body;
        const hndTime = getLocalTimestamp();
        await pool.query(
            `INSERT INTO reparaciones (identidad_cliente, descripcion_falla, imei_equipo, marca, modelo, costo_tecnico, precio_cliente, nombre_tecnico, estado_reparacion, complementos, fecha_ingreso, fecha_entrega_estimada, pago_tecnico_estado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, 'Pendiente')`,
            [identidad_cliente, descripcion_falla, imei_equipo, marca, modelo, costo_tecnico, precio_cliente, nombre_tecnico, estado_reparacion || 'Pendiente', complementos, hndTime, fecha_entrega_estimada || null]
        );
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/reparaciones/:id', authenticateToken, async (req, res) => {
    try {
        const { identidad_cliente, descripcion_falla, imei_equipo, marca, modelo, costo_tecnico, precio_cliente, nombre_tecnico, estado_reparacion, complementos, fecha_entrega_estimada } = req.body;
        await pool.query(
            `UPDATE reparaciones SET identidad_cliente=$1, descripcion_falla=$2, imei_equipo=$3, marca=$4, modelo=$5, costo_tecnico=$6, precio_cliente=$7, nombre_tecnico=$8, estado_reparacion=$9, complementos=$10, fecha_entrega_estimada=$11
             WHERE id_reparacion=$12`,
            [identidad_cliente, descripcion_falla, imei_equipo, marca, modelo, costo_tecnico, precio_cliente, nombre_tecnico, estado_reparacion, complementos, fecha_entrega_estimada || null, req.params.id]
        );
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/reparaciones/:id/estado', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE reparaciones SET estado_reparacion=$1 WHERE id_reparacion=$2', [req.body.estado, req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/reparaciones/:id/pago-tecnico', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { idCaja } = req.user;
        const hndTime = getLocalTimestamp();
        await client.query('BEGIN');
        const r = await client.query('SELECT costo_tecnico, marca, modelo FROM reparaciones WHERE id_reparacion=$1', [req.params.id]);
        const { costo_tecnico, marca, modelo } = r.rows[0];
        const idE = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, categoria, fechaCreacion, estado)
             VALUES ($1, $2, $3, $4, 'Pago Servicio de Reparación', $5, 'Completada')`,
            [idE, idCaja, `PAGO TECNICO: ${marca} ${modelo}`, costo_tecnico, hndTime]
        );
        await client.query("UPDATE reparaciones SET pago_tecnico_estado='Pagado' WHERE id_reparacion=$1", [req.params.id]);
        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

// NUEVO ENDPOINT: Facturar Reparación (Generar Ingreso)
router.post('/reparaciones/:id/facturar', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { idCaja } = req.user;
        const hndTime = getLocalTimestamp();
        const idReparacion = req.params.id;

        await client.query('BEGIN');

        // 1. Obtener datos de la reparación
        const r = await client.query('SELECT precio_cliente, costo_tecnico, marca, modelo FROM reparaciones WHERE id_reparacion=$1', [idReparacion]);
        if (r.rows.length === 0) throw new Error('Reparación no encontrada');
        
        const { precio_cliente, costo_tecnico, marca, modelo } = r.rows[0];

        // 2. Crear Ingreso en Caja
        const idI = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
        await client.query(
            `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento, fechaCreacion, estado)
             VALUES ($1, $2, $3, $4, $5, 'Reparacion', $6, 'Completada')`,
            [idI, idCaja, `COBRO REPARACIÓN: ${marca} ${modelo} (RPR-${String(idReparacion).padStart(5, '0')})`, precio_cliente, costo_tecnico, hndTime]
        );

        // 3. Marcar como Entregado
        await client.query("UPDATE reparaciones SET estado_reparacion='Entregado' WHERE id_reparacion=$1", [idReparacion]);

        // 4. Actualizar Balance
        await updateArqueoBalance(idCaja, client);

        await client.query('COMMIT');
        res.json({ message: 'Reparación facturada y entregada correctamente' });
    } catch(e) { 
        await client.query('ROLLBACK'); 
        handleDbError(res, e); 
    } finally { 
        client.release(); 
    }
});

router.delete('/reparaciones/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM reparaciones WHERE id_reparacion=$1', [req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- GARANTÍAS Y DEVOLUCIONES ---
router.get('/garantias', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                g.id_garantia, 
                g.cod_venta, 
                g.id_producto_original, 
                g.tipo_producto, 
                g.falla_reportada, 
                g.estado_garantia, 
                g.fecha_ingreso, 
                g.fecha_resolucion, 
                g.costo_original, 
                g.precio_venta_original, 
                g.observaciones, 
                g.identidad_cliente,
                COALESCE(c.nombre || ' ' || c.apellido, 'CONSUMIDOR FINAL') as "nombre_cliente",
                COALESCE(t.marca || ' ' || t.modelo, 'ACCESORIO') as "dispositivo_nombre"
            FROM garantias g
            LEFT JOIN clientes c ON g.identidad_cliente = c.identidad
            LEFT JOIN telefonos t ON g.id_producto_original = t.codigo AND g.tipo_producto = 'TELEFONO'
            ORDER BY g.fecha_ingreso DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/garantias', authenticateToken, async (req, res) => {
    try {
        const { cod_venta, id_producto_original, tipo_producto, falla_reportada, costo_original, precio_venta_original, observaciones, identidad_cliente } = req.body;
        await pool.query(
            `INSERT INTO garantias (cod_venta, id_producto_original, tipo_producto, falla_reportada, costo_original, precio_venta_original, observaciones, identidad_cliente, estado_garantia)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pendiente')`,
            [cod_venta, id_producto_original, tipo_producto, falla_reportada, costo_original, precio_venta_original, observaciones, identidad_cliente]
        );
        if (tipo_producto === 'TELEFONO') {
            await pool.query("UPDATE telefonos SET estado = 'Garantia' WHERE codigo = $1", [id_producto_original]);
        }
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/garantias/:id', authenticateToken, async (req, res) => {
    try {
        const { estado_garantia, observaciones, fecha_resolucion } = req.body;
        await pool.query(
            `UPDATE garantias SET estado_garantia=$1, observaciones=$2, fecha_resolucion=$3 WHERE id_garantia=$4`,
            [estado_garantia, observaciones, fecha_resolucion || null, req.params.id]
        );
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.post('/garantias/:id/exchange', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { idNuevoProducto, tipoNuevo, diferenciaEfectivo, utilidadDiferencia, descripcionGastoIngreso, estadoRetorno } = req.body;
        const { idCaja } = req.user;
        const idGarantia = req.params.id;
        const hndTime = getLocalTimestamp();

        await client.query('BEGIN');
        const gRes = await client.query("SELECT * FROM garantias WHERE id_garantia = $1", [idGarantia]);
        const g = gRes.rows[0];

        // Obtener info del nuevo producto para las observaciones
        let nombreNuevoProd = idNuevoProducto;
        if (tipoNuevo === 'TELEFONO') {
            const tRes = await client.query("SELECT marca, modelo FROM telefonos WHERE codigo = $1", [idNuevoProducto]);
            if (tRes.rows.length > 0) nombreNuevoProd = `${tRes.rows[0].marca} ${tRes.rows[0].modelo}`;
            await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [idNuevoProducto]);
        } else {
            const aRes = await client.query("SELECT a.descripcion FROM inventario i JOIN accesorios a ON i.codAccesorio = a.codAccesorio WHERE i.codInventario = $1", [idNuevoProducto]);
            if (aRes.rows.length > 0) nombreNuevoProd = aRes.rows[0].descripcion;
            await client.query("UPDATE inventario SET cantidad = cantidad - 1 WHERE codInventario = $1", [idNuevoProducto]);
        }

        if (g.tipo_producto === 'TELEFONO') {
            await client.query("UPDATE telefonos SET estado = $1 WHERE codigo = $2", [estadoRetorno, g.id_producto_original]);
        }

        if (utilidadDiferencia > 0) {
            const idI = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
            await client.query(
                `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento, fechaCreacion, estado)
                 VALUES ($1, $2, $3, $4, 0, 'Venta', $5, 'Completada')`,
                [idI, idCaja, `AJUSTE UTILIDAD GARANTIA: ${descripcionGastoIngreso}`, utilidadDiferencia, hndTime]
            );
        } else if (utilidadDiferencia < 0) {
            const idE = await generateNextId('egresos', 'idegresos', 'EGRE', client);
            await client.query(
                `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, categoria, fechaCreacion, estado)
                 VALUES ($1, $2, $3, $4, 'Gasto Operativo', $5, 'Completada')`,
                [idE, idCaja, `PERDIDA GARANTIA: ${descripcionGastoIngreso}`, Math.abs(utilidadDiferencia), hndTime]
            );
        }

        await client.query(
            "UPDATE garantias SET estado_garantia = 'Cambiado', fecha_resolucion = $1, observaciones = $2 WHERE id_garantia = $3",
            [hndTime, `CAMBIO POR: ${nombreNuevoProd} (${idNuevoProducto}). EL ANTERIOR QUEDÓ: ${estadoRetorno}`, idGarantia]
        );

        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.delete('/garantias/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM garantias WHERE id_garantia = $1', [req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- CONSIGNACIONES ---
router.get('/consignaciones', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                c.id_consignacion, c.id_producto, c.tipo_producto, c.negocio_destino, 
                c.cantidad_prestada, c.precio_especial_pago, c.estado_consignacion, 
                c.fecha_salida, c.fecha_limite,
                CASE 
                    WHEN c.tipo_producto = 'TELEFONO' THEN (SELECT t.marca || ' ' || t.modelo FROM telefonos t WHERE t.codigo = c.id_producto)
                    WHEN c.tipo_producto = 'ACCESORIO' THEN (SELECT a.descripcion FROM inventario i JOIN accesorios a ON i.codAccesorio = a.codAccesorio WHERE i.codInventario = c.id_producto)
                    ELSE 'PRODUCTO DESCONOCIDO'
                END as "nombre_producto",
                c.id_producto as "codigo_referencia"
            FROM consignaciones c
            ORDER BY c.fecha_salida DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/consignaciones', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const items = Array.isArray(req.body) ? req.body : [req.body];
        const hndTime = getLocalTimestamp();
        await client.query('BEGIN');
        for (const item of items) {
            await client.query(
                `INSERT INTO consignaciones (id_producto, tipo_producto, negocio_destino, cantidad_prestada, precio_especial_pago, fecha_salida, fecha_limite, estado_consignacion)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'Prestado')`,
                [item.id_producto, item.tipo_producto, item.negocio_destino, item.cantidad_prestada, item.precio_especial_pago, hndTime, item.fecha_limite || null]
            );
            if (item.tipo_producto === 'TELEFONO') {
                await client.query("UPDATE telefonos SET estado = 'Consignado' WHERE codigo = $1", [item.id_producto]);
            } else {
                await client.query("UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2", [item.cantidad_prestada, item.id_producto]);
            }
        }
        await client.query('COMMIT');
        res.status(201).json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.put('/consignaciones/:id', authenticateToken, async (req, res) => {
    try {
        const { negocio_destino, precio_especial_pago, fecha_limite, cantidad_prestada } = req.body;
        await pool.query(
            `UPDATE consignaciones
             SET negocio_destino      = COALESCE($1, negocio_destino),
                 precio_especial_pago = COALESCE($2, precio_especial_pago),
                 cantidad_prestada    = COALESCE($3, cantidad_prestada),
                 fecha_limite         = CASE WHEN $4::text IS NOT NULL THEN $4::date ELSE fecha_limite END
             WHERE id_consignacion = $5`,
            [negocio_destino || null, precio_especial_pago ?? null, cantidad_prestada ?? null, fecha_limite || null, req.params.id]
        );
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/consignaciones/:id/liquidar', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { idCaja } = req.user;
        const hndTime = getLocalTimestamp();
        await client.query('BEGIN');
        const cRes = await client.query(`
            SELECT c.*, 
            CASE 
                WHEN c.tipo_producto = 'TELEFONO' THEN (SELECT t.marca || ' ' || t.modelo FROM telefonos t WHERE t.codigo = c.id_producto)
                ELSE (SELECT a.descripcion FROM inventario i JOIN accesorios a ON i.codAccesorio = a.codAccesorio WHERE i.codInventario = c.id_producto)
            END as nombre_prod
            FROM consignaciones c
            WHERE id_consignacion = $1
        `, [req.params.id]);
        const c = cRes.rows[0];
        const idI = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
        await client.query(
            `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento, fechaCreacion, estado)
             VALUES ($1, $2, $3, $4, 0, 'Venta', $5, 'Completada')`,
            [idI, idCaja, `LIQUIDACIÓN CONSIGNACIÓN: ${c.nombre_prod} (${c.negocio_destino})`, c.precio_especial_pago * c.cantidad_prestada, hndTime]
        );
        await client.query("UPDATE consignaciones SET estado_consignacion = 'Vendido_Pagado' WHERE id_consignacion = $1", [req.params.id]);
        if (c.tipo_producto === 'TELEFONO') {
            await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [c.id_producto]);
        }
        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.put('/consignaciones/:id/retorno', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const cRes = await client.query("SELECT * FROM consignaciones WHERE id_consignacion = $1", [req.params.id]);
        const c = cRes.rows[0];
        await client.query("UPDATE consignaciones SET estado_consignacion = 'Devuelto' WHERE id_consignacion = $1", [req.params.id]);
        if (c.tipo_producto === 'TELEFONO') {
            await client.query("UPDATE telefonos SET estado = 'Disponible' WHERE codigo = $1", [c.id_producto]);
        } else {
            await client.query("UPDATE inventario SET cantidad = cantidad + $1 WHERE codInventario = $2", [c.cantidad_prestada, c.id_producto]);
        }
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.delete('/consignaciones/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const cRes = await client.query("SELECT * FROM consignaciones WHERE id_consignacion = $1", [req.params.id]);
        if (cRes.rows.length > 0) {
            const c = cRes.rows[0];
            if (c.estado_consignacion === 'Prestado') {
                if (c.tipo_producto === 'TELEFONO') await client.query("UPDATE telefonos SET estado = 'Disponible' WHERE codigo = $1", [c.id_producto]);
                else await client.query("UPDATE inventario SET cantidad = cantidad + $1 WHERE codInventario = $2", [c.cantidad_prestada, c.id_producto]);
            }
        }
        await client.query('DELETE FROM consignaciones WHERE id_consignacion = $1', [req.params.id]);
        await client.query('COMMIT');
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

module.exports = router;
