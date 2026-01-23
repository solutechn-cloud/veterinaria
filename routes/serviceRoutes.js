
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- REPARACIONES ---

router.get('/reparaciones', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT r.*, v.total as "ventaTotal"
            FROM reparaciones r
            LEFT JOIN ventas v ON r.cod_venta = v.codVenta
            ORDER BY r.fecha_ingreso DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/reparaciones', authenticateToken, async (req, res) => {
    try {
        const { descripcion_falla, imei_equipo, marca_modelo, costo_tecnico, precio_cliente, nombre_tecnico, fecha_entrega_estimada } = req.body;
        const query = `
            INSERT INTO reparaciones (descripcion_falla, imei_equipo, marca_modelo, costo_tecnico, precio_cliente, nombre_tecnico, fecha_entrega_estimada)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        await pool.query(query, [descripcion_falla, imei_equipo, marca_modelo, costo_tecnico, precio_cliente, nombre_tecnico, fecha_entrega_estimada]);
        res.status(201).json({ message: 'Orden de servicio creada' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/reparaciones/:id/estado', authenticateToken, async (req, res) => {
    try {
        const { estado } = req.body;
        await pool.query('UPDATE reparaciones SET estado_reparacion = $1 WHERE id_reparacion = $2', [estado, req.params.id]);
        res.json({ message: 'Estado actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/reparaciones/:id/pago-tecnico', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { idCaja } = req.user;
        await client.query('BEGIN');

        const repRes = await client.query('SELECT * FROM reparaciones WHERE id_reparacion = $1', [id]);
        if (repRes.rows.length === 0) throw new Error('Reparación no encontrada');
        const rep = repRes.rows[0];

        if (rep.pago_tecnico_estado === 'Pagado') throw new Error('Este pago ya fue realizado');

        const idEgreso = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, categoria, fechaCreacion, estado)
             VALUES ($1, $2, $3, $4, 'Pago a Tecnico', $5, 'Completada')`,
            [idEgreso, idCaja, `PAGO TECNICO: ${rep.nombre_tecnico} - EQUIPO: ${rep.marca_modelo}`, rep.costo_tecnico, getLocalTimestamp()]
        );

        await client.query('UPDATE reparaciones SET pago_tecnico_estado = \'Pagado\' WHERE id_reparacion = $1', [id]);
        
        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'Pago registrado en caja' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

// --- CONSIGNACIONES ---

router.get('/consignaciones', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT c.*, 
            COALESCE(t.marca || ' ' || t.modelo, a.descripcion) as "nombre_producto",
            COALESCE(t.codigo, i.codInventario) as "codigo_referencia"
            FROM consignaciones c
            LEFT JOIN telefonos t ON c.id_producto = t.codigo
            LEFT JOIN inventario i ON c.id_producto = i.codInventario
            LEFT JOIN accesorios a ON i.codAccesorio = a.codAccesorio
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
        await client.query('BEGIN');

        for (const item of items) {
            const { id_producto, tipo_producto, negocio_destino, cantidad_prestada, precio_especial_pago, fecha_limite } = item;
            
            // Validar Stock (FIXED: Usar codInventario para accesorios)
            if (tipo_producto === 'TELEFONO') {
                const tel = await client.query('SELECT estado FROM telefonos WHERE codigo = $1', [id_producto]);
                if (tel.rows[0]?.estado !== 'Disponible') throw new Error(`El teléfono ${id_producto} no está disponible`);
                await client.query("UPDATE telefonos SET estado = 'Consignado' WHERE codigo = $1", [id_producto]);
            } else {
                const acc = await client.query('SELECT cantidad FROM inventario WHERE codInventario = $1', [id_producto]);
                if (!acc.rows[0] || Number(acc.rows[0].cantidad) < cantidad_prestada) throw new Error(`Stock insuficiente para el accesorio ${id_producto}`);
                await client.query('UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2', [cantidad_prestada, id_producto]);
            }

            await client.query(
                `INSERT INTO consignaciones (id_producto, tipo_producto, negocio_destino, cantidad_prestada, precio_especial_pago, fecha_limite)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [id_producto, tipo_producto, negocio_destino, cantidad_prestada, precio_especial_pago, fecha_limite]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Consignación registrada con éxito' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.put('/consignaciones/:id', authenticateToken, async (req, res) => {
    try {
        const { negocio_destino, precio_especial_pago, fecha_limite } = req.body;
        await pool.query(
            `UPDATE consignaciones SET negocio_destino=$1, precio_especial_pago=$2, fecha_limite=$3 WHERE id_consignacion=$4`,
            [negocio_destino, precio_especial_pago, fecha_limite, req.params.id]
        );
        res.json({ message: 'Consignación actualizada' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/consignaciones/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        await client.query('BEGIN');

        const consRes = await client.query('SELECT * FROM consignaciones WHERE id_consignacion = $1', [id]);
        if(consRes.rows.length === 0) throw new Error('No encontrada');
        const cons = consRes.rows[0];

        if (cons.estado_consignacion === 'Prestado') {
            if (cons.tipo_producto === 'TELEFONO') {
                await client.query("UPDATE telefonos SET estado = 'Disponible' WHERE codigo = $1", [cons.id_producto]);
            } else {
                await client.query('UPDATE inventario SET cantidad = cantidad + $1 WHERE codInventario = $2', [cons.cantidad_prestada, cons.id_producto]);
            }
        }

        await client.query('DELETE FROM consignaciones WHERE id_consignacion = $1', [id]);
        await client.query('COMMIT');
        res.json({ message: 'Consignación eliminada y stock devuelto' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.put('/consignaciones/:id/liquidar', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { idCaja } = req.user;
        await client.query('BEGIN');

        const consRes = await client.query(`
            SELECT c.*, 
            COALESCE(t.marca || ' ' || t.modelo, a.descripcion) as nombre_item,
            COALESCE(t.codigo, i.codInventario) as cod_item
            FROM consignaciones c
            LEFT JOIN telefonos t ON c.id_producto = t.codigo
            LEFT JOIN inventario i ON c.id_producto = i.codInventario
            LEFT JOIN accesorios a ON i.codAccesorio = a.codAccesorio
            WHERE c.id_consignacion = $1
        `, [id]);
        
        const cons = consRes.rows[0];
        if (!cons || cons.estado_consignacion !== 'Prestado') throw new Error('Esta consignación ya fue cerrada');

        // Obtener costo original
        let costoOriginal = 0;
        if (cons.tipo_producto === 'TELEFONO') {
            const tel = await client.query('SELECT precioCompra FROM telefonos WHERE codigo = $1', [cons.id_producto]);
            costoOriginal = Number(tel.rows[0].preciocompra);
            await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [cons.id_producto]);
        } else {
            const acc = await client.query('SELECT precioCompra FROM inventario WHERE codInventario = $1', [cons.id_producto]);
            costoOriginal = Number(acc.rows[0].preciocompra) * cons.cantidad_prestada;
        }

        const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
        const fullDesc = `COBRO CONSIGNACION: ${cons.negocio_destino} - ${cons.nombre_item} (${cons.cod_item})`;
        
        await client.query(
            `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, subtipo_movimiento, fechaCreacion, estado)
             VALUES ($1, $2, $3, $4, $5, 'Cobro Consignacion', $6, 'Completada')`,
            [idIngreso, idCaja, fullDesc, cons.precio_especial_pago, costoOriginal, getLocalTimestamp()]
        );

        await client.query("UPDATE consignaciones SET estado_consignacion = 'Vendido_Pagado' WHERE id_consignacion = $1", [id]);

        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'Consignación liquidada' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.put('/consignaciones/:id/retorno', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        await client.query('BEGIN');

        const consRes = await client.query('SELECT * FROM consignaciones WHERE id_consignacion = $1', [id]);
        const cons = consRes.rows[0];

        if (cons.tipo_producto === 'TELEFONO') {
            await client.query("UPDATE telefonos SET estado = 'Disponible' WHERE codigo = $1", [cons.id_producto]);
        } else {
            await client.query('UPDATE inventario SET cantidad = cantidad + $1 WHERE codInventario = $2', [cons.cantidad_prestada, cons.id_producto]);
        }

        await client.query("UPDATE consignaciones SET estado_consignacion = 'Devuelto' WHERE id_consignacion = $1", [id]);

        await client.query('COMMIT');
        res.json({ message: 'Producto devuelto al inventario' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

module.exports = router;
