
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// ... (rutas de clientes se mantienen iguales)

router.post('/ventas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { identidadCliente, tipoCompra, total, detalles, isv, descuento } = req.body;
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
            totalCosto += (Number(inv.rows[0]?.preciocompra || 0) * Number(item.cantidad));
        }
    }

    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    // CORREGIDO: Se usa 'Venta POS' que es el valor válido del ENUM
    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado, subtipo_movimiento) 
       VALUES ($1, $2, $3, $4, $5, $6, 'Venta POS', 'Venta POS')`,
      [idIngreso, idCaja, `Venta Factura #${codVenta}`, total, totalCosto, hndTime]
    );

    await client.query(
      `INSERT INTO ventas (codVenta, fecha, codVendedor, identidadCliente, total, estado, tipoCompra, isv, descuento) VALUES ($1, $2, $3, $4, $5, 'Completada', $6, $7, $8)`,
      [codVenta, hndTime, codUsuario, identidadCliente, total, tipoCompra || 'Contado', isv || 0, descuento || 0]
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
        const { total, detalles } = req.body;
        const { idCaja } = req.user;

        await client.query('BEGIN');
        
        // Obtenemos el ID de ingreso asociado para actualizarlo también
        const currentData = await client.query('SELECT DISTINCT idIngreso FROM detalleventa WHERE idVenta = $1', [codVenta]);
        const idIngreso = currentData.rows[0]?.idingreso;

        // Limpiar detalles anteriores y devolver stock (misma lógica existente)
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
                const inv = await client.query('SELECT precioCompra FROM inventario WHERE codInventario = $1', [item.idInventario]);
                itemCosto = Number(inv.rows[0]?.preciocompra || 0);
                await client.query("UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2", [item.cantidad, item.idInventario]);
                await client.query(`INSERT INTO detalleventa (codDetalleVenta, idVenta, idAccesorio, idIngreso, cantidad, precioVenta, estado) VALUES ($1,$2,$3,$4,$5,$6,'Activo')`, [codDetalle, codVenta, item.idInventario, idIngreso, item.cantidad, item.precioVenta]);
            }
            totalCosto += (itemCosto * Number(item.cantidad));
        }

        // SINCRONIZACIÓN: Actualizamos el ingreso en caja
        if (idIngreso) {
            await client.query('UPDATE ingresos SET monto = $1, costo = $2 WHERE idIngreso = $3', [total, totalCosto, idIngreso]);
        }
        
        await client.query('UPDATE ventas SET total = $1 WHERE codVenta = $2', [total, codVenta]);

        await updateArqueoBalance(idCaja, client);
        await client.query('COMMIT');
        res.json({ codVenta });
    } catch (err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

router.get('/ventas/:id/detalles', authenticateToken, async (req, res) => {
    try {
        // CORRECCIÓN DEL JOIN: Se enlaza correctamente el inventario con el maestro de accesorios
        const query = `
            SELECT 
                dv.codDetalleVenta as "codDetalleVenta", 
                dv.cantidad, 
                dv.precioVenta as "precioVenta", 
                COALESCE(t.marca || ' ' || t.modelo, acc.descripcion, 'Producto/Servicio') as "descripcionProducto"
            FROM detalleventa dv
            LEFT JOIN telefonos t ON dv.idTelefono = t.codigo
            LEFT JOIN inventario inv ON dv.idAccesorio = inv.codInventario
            LEFT JOIN accesorios acc ON inv.codAccesorio = acc.codAccesorio
            WHERE dv.idVenta = $1
        `;
        const result = await pool.query(query, [req.params.id]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
