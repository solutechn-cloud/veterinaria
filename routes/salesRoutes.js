
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- CLIENTES ---
router.get('/clientes', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT identidad, nombre, apellido, direccion, telefono, correo FROM clientes');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/clientes', authenticateToken, async (req, res) => {
    try {
        const { identidad, nombre, apellido, direccion, telefono, correo } = req.body;
        await pool.query('INSERT INTO clientes (identidad, nombre, apellido, direccion, telefono, correo, fechaCreacion) VALUES ($1,$2,$3,$4,$5,$6, NOW())',
            [identidad, nombre, apellido, direccion, telefono, correo]);
        res.status(201).json({ message: 'Cliente creado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/clientes/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, apellido, direccion, telefono, correo } = req.body;
        await pool.query('UPDATE clientes SET nombre=$1, apellido=$2, direccion=$3, telefono=$4, correo=$5 WHERE identidad=$6',
            [nombre, apellido, direccion, telefono, correo, req.params.id]);
        res.json({ message: 'Cliente actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/clientes/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM clientes WHERE identidad=$1', [req.params.id]);
        res.json({ message: 'Cliente eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- VENTAS ---
router.get('/ventas/historial', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query; // Espera formato YYYY-MM-DD
        
        let query = `
            SELECT v.codVenta as "codVenta", v.fecha, v.total, v.estado, v.identidadCliente as "identidadCliente",
            c.nombre || ' ' || c.apellido as "nombreCliente"
            FROM ventas v
            JOIN clientes c ON v.identidadCliente = c.identidad
            WHERE v.codVendedor = $1
        `;
        const params = [req.user.codUsuario];

        if (fecha) {
            // Filtro por cadena de fecha exacta para evitar problemas UTC
            query += ` AND TO_CHAR(v.fecha, 'YYYY-MM-DD') = $2`;
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
                v.codVenta as "codVenta", 
                v.fecha, 
                v.total, 
                v.estado, 
                v.identidadCliente as "identidadCliente",
                v.tipoCompra as "tipoCompra",
                COALESCE(v.isv, 0) as "isv",
                COALESCE(v.descuento, 0) as "descuento",
                c.nombre || ' ' || c.apellido as "nombreCliente"
            FROM ventas v
            LEFT JOIN clientes c ON v.identidadCliente = c.identidad
            WHERE v.codVenta = $1
        `, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Venta no encontrada' });
        res.json(result.rows[0]);
    } catch(e) { handleDbError(res, e); }
});

router.post('/ventas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { identidadCliente, tipoCompra, total, detalles, fecha, isv, descuento } = req.body;
    const { codUsuario, idCaja } = req.user;
    
    // Validar Caja Abierta (Obligatorio)
    const openBox = await client.query(`SELECT * FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
    if(openBox.rows.length === 0) return res.status(400).json({ error: "Caja cerrada. Debe realizar apertura antes de vender." });

    await client.query('BEGIN');
    
    const codVenta = await generateNextId('ventas', 'codVenta', 'FACT', client);
    await client.query(
      `INSERT INTO ventas (
          codVenta, fecha, codVendedor, identidadCliente, total, estado, 
          tipoCompra, isv, descuento, codUsuario
       ) VALUES ($1, $2, $3, $4, $5, 'Completada', $6, $7, $8, $3)`,
      [
          codVenta, 
          fecha || 'NOW()', 
          codUsuario, 
          identidadCliente, 
          total, 
          tipoCompra || 'Contado',
          isv || 0,
          descuento || 0
      ]
    );

    let totalCostoVenta = 0;
    const startIdStr = await generateNextId('detalleventa', 'codDetalleVenta', 'DET', client);
    let currentDetailIdNum = parseInt(startIdStr.split('-')[1]);

    for (const item of detalles) {
      const codDetalle = `DET-${currentDetailIdNum.toString().padStart(4, '0')}`;
      currentDetailIdNum++;
      
      let idAccesorio = null;
      let idTelefono = null;
      let itemCosto = 0;

      if (item.tipoProducto === 'TELEFONO') {
        idTelefono = item.idTelefono;
        const telRes = await client.query("SELECT precioCompra FROM telefonos WHERE codigo = $1", [idTelefono]);
        itemCosto = telRes.rows[0]?.preciocompra || 0;
        await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [idTelefono]);

      } else if (item.tipoProducto === 'ACCESORIO') {
        const invRes = await client.query('SELECT codAccesorio, precioCompra FROM inventario WHERE codInventario = $1', [item.idInventario]);
        if(invRes.rows.length > 0) {
            idAccesorio = invRes.rows[0].codaccesorio;
            itemCosto = invRes.rows[0].preciocompra || 0;
        }
        await client.query("UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2", [item.cantidad, item.idInventario]);
      } else {
        itemCosto = 0; 
      }

      totalCostoVenta += (Number(itemCosto) * Number(item.cantidad));

      await client.query(
        `INSERT INTO detalleventa (codDetalleVenta, idVenta, idAccesorio, idTelefono, cantidad, precioVenta, estado) 
         VALUES ($1, $2, $3, $4, $5, $6, 'Activo')`,
        [codDetalle, codVenta, idAccesorio, idTelefono, item.cantidad, item.precioVenta]
      );
    }

    // REGISTRAR INGRESO AUTOMÁTICO
    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) 
       VALUES ($1, $2, $3, $4, $5, NOW(), 'Venta POS')`,
      [idIngreso, idCaja, `Venta Factura #${codVenta}`, total, totalCostoVenta]
    );

    // UPDATE BALANCE
    console.log("Venta Registrada. Ejecutando updateArqueoBalance...");
    await updateArqueoBalance(idCaja, client);

    await client.query('COMMIT');
    res.status(201).json({ message: 'Venta OK', codVenta });
  } catch (err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

router.put('/ventas/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const codVenta = req.params.id;
        const { identidadCliente, total, detalles, tipoCompra, isv, descuento } = req.body;
        const { idCaja } = req.user;

        // Validar Caja (Edición también afecta saldo)
        const openBox = await client.query(`SELECT * FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
        if(openBox.rows.length === 0) return res.status(400).json({ error: "Caja cerrada. No se puede modificar venta." });

        await client.query('BEGIN');

        const ventaRes = await client.query("SELECT estado FROM ventas WHERE codVenta = $1", [codVenta]);
        if (ventaRes.rows.length === 0) throw new Error("Venta no encontrada");
        if (ventaRes.rows[0].estado === 'Anulada') throw new Error("No se puede editar una venta anulada");

        const oldDetalles = await client.query('SELECT * FROM detalleventa WHERE idVenta = $1', [codVenta]);
        for (const det of oldDetalles.rows) {
            if (det.idtelefono) {
                await client.query("UPDATE telefonos SET estado = 'Disponible' WHERE codigo = $1", [det.idtelefono]);
            } else if (det.idaccesorio) {
                const stockRes = await client.query("SELECT codInventario FROM inventario WHERE codAccesorio = $1 ORDER BY fecha DESC LIMIT 1", [det.idaccesorio]);
                if (stockRes.rows.length > 0) {
                     await client.query("UPDATE inventario SET cantidad = cantidad + $1 WHERE codInventario = $2", [det.cantidad, stockRes.rows[0].codinventario]);
                }
            }
        }

        await client.query('DELETE FROM detalleventa WHERE idVenta = $1', [codVenta]);

        await client.query(
            `UPDATE ventas 
             SET identidadCliente = $1, total = $2, tipoCompra = $3, isv = $4, descuento = $5 
             WHERE codVenta = $6`, 
            [identidadCliente, total, tipoCompra, isv, descuento, codVenta]
        );

        let totalCostoVenta = 0;
        const startIdStr = await generateNextId('detalleventa', 'codDetalleVenta', 'DET', client);
        let currentDetailIdNum = parseInt(startIdStr.split('-')[1]);

        for (const item of detalles) {
             const codDetalle = `DET-${currentDetailIdNum.toString().padStart(4, '0')}`;
             currentDetailIdNum++;
             let idAccesorio = null;
             let idTelefono = null;
             let itemCosto = 0;

             if (item.tipoProducto === 'TELEFONO') {
                idTelefono = item.idTelefono;
                const telRes = await client.query("SELECT precioCompra FROM telefonos WHERE codigo = $1", [idTelefono]);
                itemCosto = telRes.rows[0]?.preciocompra || 0;
                await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [idTelefono]);
             } else if (item.tipoProducto === 'ACCESORIO') {
                const invRes = await client.query('SELECT codAccesorio, precioCompra FROM inventario WHERE codInventario = $1', [item.idInventario]);
                if(invRes.rows.length > 0) {
                    idAccesorio = invRes.rows[0].codaccesorio;
                    itemCosto = invRes.rows[0].preciocompra || 0;
                }
                await client.query("UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2", [item.cantidad, item.idInventario]);
             }
             totalCostoVenta += (Number(itemCosto) * Number(item.cantidad));

             await client.query(
                `INSERT INTO detalleventa (codDetalleVenta, idVenta, idAccesorio, idTelefono, cantidad, precioVenta, estado) 
                 VALUES ($1, $2, $3, $4, $5, $6, 'Activo')`,
                [codDetalle, codVenta, idAccesorio, idTelefono, item.cantidad, item.precioVenta]
             );
        }

        const descSearch = `Venta Factura #${codVenta}`;
        await client.query(
            `UPDATE ingresos SET monto = $1, costo = $2 WHERE idCaja = $3 AND descripcion = $4`,
            [total, totalCostoVenta, idCaja, descSearch]
        );

        await updateArqueoBalance(idCaja, client);

        await client.query('COMMIT');
        res.json({ message: 'Venta actualizada correctamente', codVenta });

    } catch (err) {
        await client.query('ROLLBACK');
        handleDbError(res, err);
    } finally {
        client.release();
    }
});

router.get('/ventas/:id/detalles', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                dv.codDetalleVenta as "codDetalleVenta", 
                dv.cantidad, 
                dv.precioVenta as "precioVenta", 
                dv.idTelefono as "idTelefono", 
                dv.idAccesorio as "idAccesorio",
                COALESCE(t.marca || ' ' || t.modelo, a.descripcion) as "descripcionProducto",
                CASE WHEN dv.idTelefono IS NOT NULL THEN 'TELEFONO' ELSE 'ACCESORIO' END as "tipoProducto",
                t.codigo as "telefonoId",
                a.codAccesorio as "accesorioId"
            FROM detalleventa dv
            LEFT JOIN telefonos t ON dv.idTelefono = t.codigo
            LEFT JOIN accesorios a ON dv.idAccesorio = a.codAccesorio
            WHERE dv.idVenta = $1
        `;
        const result = await pool.query(query, [req.params.id]);
        
        const mapped = await Promise.all(result.rows.map(async (row) => {
             let idInventario = null;
             if (row.tipoProducto === 'ACCESORIO') {
                 const inv = await pool.query('SELECT codInventario FROM inventario WHERE codAccesorio = $1 ORDER BY fecha DESC LIMIT 1', [row.accesorioId]);
                 if(inv.rows.length > 0) idInventario = inv.rows[0].codinventario;
             }
             return {
                 ...row,
                 idInventario
             };
        }));

        res.json(mapped);
    } catch(e) { handleDbError(res, e); }
});

router.put('/ventas/:id/anular', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const codVenta = req.params.id;
        const { idCaja } = req.user;
        
        // Validación de caja abierta necesaria porque se inserta un Egreso
        const openBox = await client.query(`SELECT * FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
        if(openBox.rows.length === 0) return res.status(400).json({ error: "Caja cerrada. No se puede anular venta (requiere registrar egreso)." });

        await client.query('BEGIN');
        
        const ventaRes = await client.query('SELECT total, estado FROM ventas WHERE codVenta = $1', [codVenta]);
        if(ventaRes.rows.length === 0) throw new Error("Venta no encontrada");
        if(ventaRes.rows[0].estado === 'Anulada') throw new Error("Venta ya anulada");
        
        const totalDevolver = parseFloat(ventaRes.rows[0].total);

        // Revertir Inventario
        const detallesRes = await client.query('SELECT * FROM detalleventa WHERE idVenta = $1', [codVenta]);
        
        for (const det of detallesRes.rows) {
            if(det.idtelefono) {
                await client.query("UPDATE telefonos SET estado = 'Disponible' WHERE codigo = $1", [det.idtelefono]);
            } else if (det.idaccesorio) {
                 const anyInv = await client.query("SELECT codInventario FROM inventario WHERE codAccesorio = $1 ORDER BY fecha DESC LIMIT 1", [det.idaccesorio]);
                 if(anyInv.rows.length > 0) {
                    await client.query("UPDATE inventario SET cantidad = cantidad + $1 WHERE codInventario = $2", [det.cantidad, anyInv.rows[0].codinventario]);
                 }
            }
        }

        await client.query("UPDATE ventas SET estado = 'Anulada' WHERE codVenta = $1", [codVenta]);

        const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) VALUES ($1, $2, $3, $4, NOW(), 'Anulación Venta')`,
            [idegresos, idCaja, `Devolución/Anulación Fac #${codVenta}`, totalDevolver]
        );

        await updateArqueoBalance(idCaja, client);

        await client.query('COMMIT');
        res.json({ message: 'Venta anulada y stock revertido' });
    } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

module.exports = router;
