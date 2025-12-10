
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError } = require('../config/db');
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
router.post('/ventas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { identidadCliente, total, detalles } = req.body;
    const { codUsuario, idCaja } = req.user;
    
    // Validar Caja Abierta
    const openBox = await client.query(`SELECT * FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
    if(openBox.rows.length === 0) throw new Error("Caja cerrada o no asignada.");

    await client.query('BEGIN');
    
    // 1. Crear Venta
    const codVenta = await generateNextId('ventas', 'codVenta', 'FAC', client);
    const fecha = new Date().toISOString().split('T')[0];
    await client.query(
      `INSERT INTO ventas (codVenta, fecha, codVendedor, identidadCliente, total, estado) VALUES ($1, $2, $3, $4, $5, 'Completada')`,
      [codVenta, fecha, codUsuario, identidadCliente, total]
    );

    let totalCostoVenta = 0;
    const startIdStr = await generateNextId('detalleventa', 'codDetalleVenta', 'DET', client);
    let currentDetailIdNum = parseInt(startIdStr.split('-')[1]);

    // 2. Procesar Detalles
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

    // 3. REGISTRAR INGRESO AUTOMÁTICO EN CAJA
    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) 
       VALUES ($1, $2, $3, $4, $5, NOW(), 'Venta POS')`,
      [idIngreso, idCaja, `Venta Factura #${codVenta}`, total, totalCostoVenta]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Venta OK', codVenta });
  } catch (err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

router.get('/ventas/historial', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        // Filtra ventas por usuario logueado en esa fecha
        const result = await pool.query(`
            SELECT v.codVenta as "codVenta", v.fecha, v.total, v.estado,
            c.nombre || ' ' || c.apellido as "nombreCliente"
            FROM ventas v
            JOIN clientes c ON v.identidadCliente = c.identidad
            WHERE v.codVendedor = $1 AND v.fecha = $2
        `, [req.user.codUsuario, fecha]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.put('/ventas/:id/anular', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const codVenta = req.params.id;
        const { idCaja } = req.user;
        
        await client.query('BEGIN');
        
        // 1. Obtener detalles de la venta
        const ventaRes = await client.query('SELECT total, estado FROM ventas WHERE codVenta = $1', [codVenta]);
        if(ventaRes.rows.length === 0) throw new Error("Venta no encontrada");
        if(ventaRes.rows[0].estado === 'Anulada') throw new Error("Venta ya anulada");
        
        const totalDevolver = parseFloat(ventaRes.rows[0].total);

        // 2. Revertir Inventario
        const detallesRes = await client.query('SELECT * FROM detalleventa WHERE idVenta = $1', [codVenta]);
        
        for (const det of detallesRes.rows) {
            if(det.idtelefono) {
                await client.query("UPDATE telefonos SET estado = 'Disponible' WHERE codigo = $1", [det.idtelefono]);
            } else if (det.idaccesorio) {
                // Como detalleventa guarda codAccesorio pero no codInventario especifico (simple design), 
                // incrementamos el stock en cualquier lote disponible o el último. 
                // Mejor aproximación: buscar el lote más reciente de ese accesorio y sumar.
                const lastInv = await client.query("SELECT codInventario FROM inventario WHERE codAccesorio = $1 LIMIT 1", [det.idaccesorio]);
                if(lastInv.rows.length > 0) {
                    await client.query("UPDATE inventario SET cantidad = cantidad + $1 WHERE codInventario = $2", [det.cantidad, lastInv.rows[0].codinventario]);
                }
            }
        }

        // 3. Marcar venta como anulada
        await client.query("UPDATE ventas SET estado = 'Anulada' WHERE codVenta = $1", [codVenta]);

        // 4. Registrar Egreso de Caja (Devolución)
        const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE', client);
        await client.query(
            `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) VALUES ($1, $2, $3, $4, NOW(), 'Anulación Venta')`,
            [idegresos, idCaja, `Devolución/Anulación Fac #${codVenta}`, totalDevolver]
        );

        await client.query('COMMIT');
        res.json({ message: 'Venta anulada y stock revertido' });
    } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

module.exports = router;
