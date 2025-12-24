
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

router.get('/clientes', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT identidad, nombre, apellido, direccion, telefono, correo FROM clientes');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/clientes', authenticateToken, async (req, res) => {
    try {
        const { identidad, nombre, apellido, direccion, telefono, correo } = req.body;
        await pool.query(`INSERT INTO clientes (identidad, nombre, apellido, direccion, telefono, correo, fechaCreacion) VALUES ($1,$2,$3,$4,$5,$6, NOW())`,
            [identidad, nombre, apellido, direccion, telefono, correo]);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/clientes/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, apellido, direccion, telefono, correo } = req.body;
        await pool.query('UPDATE clientes SET nombre=$1, apellido=$2, direccion=$3, telefono=$4, correo=$5 WHERE identidad=$6',
            [nombre, apellido, direccion, telefono, correo, req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/ventas/historial', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query; 
        const { codUsuario } = req.user; // Filtrar por el usuario actual para evitar ver otras cajas
        
        let query = `
            SELECT v.codVenta as "codVenta", v.fecha, v.total, v.estado, v.identidadCliente as "identidadCliente",
            c.nombre || ' ' || c.apellido as "nombreCliente"
            FROM ventas v
            JOIN clientes c ON v.identidadCliente = c.identidad
            WHERE v.codVendedor = $1
        `;
        const params = [codUsuario];
        
        if (fecha) { 
            query += ` AND TO_CHAR(v.fecha, 'YYYY-MM-DD') = $${params.length + 1}`; 
            params.push(fecha); 
        }
        
        query += ` ORDER BY v.codVenta DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.get('/ventas/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                v.codVenta as "codVenta", v.fecha, v.total, v.estado, v.identidadCliente as "identidadCliente",
                v.tipoCompra as "tipoCompra", COALESCE(v.isv, 0) as "isv", COALESCE(v.descuento, 0) as "descuento",
                v.monto_prima as "montoPrima", v.monto_financiamiento as "montoFinanciado",
                c.nombre || ' ' || c.apellido as "nombreCliente", c.direccion as "direccionCliente",
                COALESCE(e.nombre || ' ' || e.apellido, u.usuario) as "nombreVendedor"
            FROM ventas v
            LEFT JOIN clientes c ON v.identidadCliente = c.identidad
            LEFT JOIN usuarios u ON v.codVendedor = u.codUsuario
            LEFT JOIN empleado e ON u.identidad = e.identidad
            WHERE v.codVenta = $1
        `, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'N/A' });
        res.json(result.rows[0]);
    } catch(e) { handleDbError(res, e); }
});

router.post('/ventas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { identidadCliente, tipoCompra, total, detalles, isv, descuento, montoPrima, montoFinanciado } = req.body;
    const { codUsuario, idCaja } = req.user;
    
    await client.query('BEGIN');
    const hndTime = getLocalTimestamp();
    const codVenta = await generateNextId('ventas', 'codVenta', 'FACT', client);

    let totalCosto = 0;
    for (const item of detalles) {
        if (item.idTelefono) {
            const tel = await client.query("SELECT precioCompra FROM telefonos WHERE codigo = $1", [item.idTelefono]);
            totalCosto += Number(tel.rows[0]?.preciocompra || 0);
        } else if (item.idInventario) {
            const inv = await client.query('SELECT precioCompra FROM inventario WHERE codInventario = $1', [item.idInventario]);
            totalCosto += (Number(inv.rows[0]?.preciocompra || 0) * Number(item.cantidad || 1));
        }
    }

    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    
    // CORRECCIÓN VALOR ENUM: Se usa 'Venta' en lugar de 'Venta Producto Externo' para cumplir con PostgreSQL
    const montoIngresoCaja = tipoCompra === 'KrediYa' ? Number(montoPrima) : Number(total);
    const subtipoMovimiento = tipoCompra === 'KrediYa' ? 'KrediYa_Prima' : 'Venta';
    
    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado, subtipo_movimiento) 
       VALUES ($1, $2, $3, $4, $5, $6, 'Completada', $7)`,
      [idIngreso, idCaja, `Venta Factura #${codVenta}${tipoCompra === 'KrediYa' ? ' (Prima KrediYa)' : ''}`, montoIngresoCaja, totalCosto, hndTime, subtipoMovimiento]
    );

    await client.query(
      `INSERT INTO ventas (codVenta, fecha, codVendedor, identidadCliente, total, estado, tipoCompra, isv, descuento, monto_prima, monto_financiamiento) 
       VALUES ($1, $2, $3, $4, $5, 'Completada', $6, $7, $8, $9, $10)`,
      [codVenta, hndTime, codUsuario, identidadCliente, total, tipoCompra, isv || 0, descuento || 0, montoPrima || 0, montoFinanciado || 0]
    );

    for (const item of detalles) {
      const codDetalle = await generateNextId('detalleventa', 'codDetalleVenta', 'PROD', client);
      if (item.idTelefono) {
        await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [item.idTelefono]);
        await client.query(`INSERT INTO detalleventa (codDetalleVenta, idVenta, idTelefono, idIngreso, cantidad, precioVenta, estado) VALUES ($1,$2,$3,$4,1,$5,'Activo')`, [codDetalle, codVenta, item.idTelefono, idIngreso, item.precioVenta]);
      } else if (item.idInventario) {
        await client.query("UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2", [item.cantidad, item.idInventario]);
        await client.query(`INSERT INTO detalleventa (codDetalleVenta, idVenta, idAccesorio, idIngreso, cantidad, precioVenta, estado) VALUES ($1,$2,$3,$4,$5,$6,'Activo')`, [codDetalle, codVenta, item.idInventario, idIngreso, item.cantidad, item.precioVenta]);
      }
    }

    await updateArqueoBalance(idCaja, client);
    await client.query('COMMIT');
    res.status(201).json({ codVenta });
  } catch (err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

router.put('/ventas/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const codVenta = req.params.id;
        const { total, detalles, tipoCompra, montoPrima, montoFinanciado } = req.body;
        const { idCaja } = req.user;

        await client.query('BEGIN');
        const currentData = await client.query('SELECT DISTINCT idIngreso FROM detalleventa WHERE idVenta = $1', [codVenta]);
        const idIngreso = currentData.rows[0]?.idingreso;

        const oldDetails = await client.query('SELECT idTelefono, idAccesorio, cantidad FROM detalleventa WHERE idVenta = $1', [codVenta]);
        for (const det of oldDetails.rows) {
            if (det.idtelefono) await client.query("UPDATE telefonos SET estado = 'Disponible' WHERE codigo = $1", [det.idtelefono]);
            else if (det.idaccesorio) await client.query("UPDATE inventario SET cantidad = cantidad + $1 WHERE codInventario = $2", [det.cantidad, det.idaccesorio]);
        }
        await client.query('DELETE FROM detalleventa WHERE idVenta = $1', [codVenta]);

        let totalCosto = 0;
        for (const item of detalles) {
            const codDetalle = await generateNextId('detalleventa', 'codDetalleVenta', 'PROD', client);
            let itemCosto = 0;
            if (item.idTelefono) {
                const tel = await client.query("SELECT precioCompra FROM telefonos WHERE codigo = $1", [item.idTelefono]);
                itemCosto = Number(tel.rows[0]?.preciocompra || 0);
                await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [item.idTelefono]);
                await client.query(`INSERT INTO detalleventa (codDetalleVenta, idVenta, idTelefono, idIngreso, cantidad, precioVenta, estado) VALUES ($1,$2,$3,$4,1,$5,'Activo')`, [codDetalle, codVenta, item.idTelefono, idIngreso, item.precioVenta]);
            } else {
                const invId = item.idInventario || item.idAccesorio;
                const inv = await client.query('SELECT codAccesorio, precioCompra FROM inventario WHERE codInventario = $1', [invId]);
                itemCosto = Number(inv.rows[0]?.preciocompra || 0);
                await client.query("UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2", [item.cantidad, invId]);
                await client.query(`INSERT INTO detalleventa (codDetalleVenta, idVenta, idAccesorio, idIngreso, cantidad, precioVenta, estado) VALUES ($1,$2,$3,$4,$5,$6,'Activo')`, [codDetalle, codVenta, invId, idIngreso, item.cantidad, item.precioVenta]);
            }
            totalCosto += (itemCosto * Number(item.cantidad || 1));
        }

        if (idIngreso) {
            // CORRECCIÓN VALOR ENUM: Se usa 'Venta' en lugar de 'Venta Producto Externo'
            const montoActualizadoCaja = tipoCompra === 'KrediYa' ? Number(montoPrima) : Number(total);
            const subtipoActualizado = tipoCompra === 'KrediYa' ? 'KrediYa_Prima' : 'Venta';
            await client.query('UPDATE ingresos SET monto = $1, costo = $2, subtipo_movimiento = $3 WHERE idIngreso = $4', [montoActualizadoCaja, totalCosto, subtipoActualizado, idIngreso]);
        }
        
        await client.query(
            'UPDATE ventas SET total = $1, tipoCompra = $2, monto_prima = $3, monto_financiamiento = $4 WHERE codVenta = $5', 
            [total, tipoCompra, montoPrima || 0, montoFinanciado || 0, codVenta]
        );

        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ codVenta });
    } catch (err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

router.get('/ventas/:id/detalles', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                dv.codDetalleVenta as "codDetalleVenta", 
                dv.cantidad, 
                dv.precioVenta as "precioVenta", 
                COALESCE(
                    t.marca || ' ' || t.modelo, 
                    acc_via_inv.descripcion, 
                    acc_direct.descripcion,
                    'Producto/Servicio'
                ) as "descripcionProducto"
            FROM detalleventa dv
            LEFT JOIN telefonos t ON dv.idTelefono = t.codigo
            LEFT JOIN inventario inv ON dv.idAccesorio = inv.codInventario
            LEFT JOIN accesorios acc_via_inv ON inv.codAccesorio = acc_via_inv.codAccesorio
            LEFT JOIN accesorios acc_direct ON dv.idAccesorio = acc_direct.codAccesorio
            WHERE dv.idVenta = $1
        `;
        const result = await pool.query(query, [req.params.id]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.put('/ventas/:id/anular', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const codVenta = req.params.id;
        const { idCaja } = req.user;
        await client.query('BEGIN');
        const details = await client.query('SELECT idTelefono, idAccesorio, idIngreso, cantidad FROM detalleventa WHERE idVenta = $1', [codVenta]);
        let idIngresoAEliminar = null;
        for (const det of details.rows) {
            if(det.idtelefono) await client.query("UPDATE telefonos SET estado = 'Disponible' WHERE codigo = $1", [det.idtelefono]);
            else if (det.idaccesorio) await client.query("UPDATE inventario SET cantidad = cantidad + $1 WHERE codInventario = $2", [det.cantidad, det.idaccesorio]);
            if (det.idingreso) idIngresoAEliminar = det.idingreso;
        }
        await client.query("UPDATE ventas SET estado = 'Anulada' WHERE codVenta = $1", [codVenta]);
        if (idIngresoAEliminar) await client.query("DELETE FROM ingresos WHERE idIngreso = $1", [idIngresoAEliminar]);
        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ message: 'Anulada' });
    } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

module.exports = router;
