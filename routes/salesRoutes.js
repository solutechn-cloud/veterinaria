
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- CLIENTES ---
router.get('/clientes', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM clientes ORDER BY nombre ASC');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/clientes', authenticateToken, async (req, res) => {
    try {
        const { identidad, nombre, apellido, direccion, telefono, correo } = req.body;
        await pool.query('INSERT INTO clientes (identidad, nombre, apellido, direccion, telefono, correo, fechaCreacion) VALUES ($1,$2,$3,$4,$5,$6, NOW())',
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

router.delete('/clientes/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM clientes WHERE identidad=$1', [req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

// --- VENTAS ---
router.get('/ventas/historial', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query; 
        const { codUsuario, idCaja } = req.user;
        
        // Se corrigió la lógica de visibilidad:
        // 1. Siempre se ven ventas KrediYa con depósito pendiente (Global).
        // 2. Un usuario solo ve SUS ventas en SU caja asignada (Privado).
        // Se eliminó la condición de Administrador para este historial específico de caja,
        // ya que el administrador debe ver sus propios movimientos de su caja actual.
        let query = `
            SELECT v.codVenta as "codVenta", v.fecha, v.total, v.estado, v.identidadCliente as "identidadCliente",
            v.tipoCompra as "tipoCompra", v.estado_pago_financiera as "estado_pago_financiera",
            c.nombre || ' ' || c.apellido as "nombreCliente"
            FROM ventas v
            JOIN clientes c ON v.identidadCliente = c.identidad
            WHERE (
                (v.tipoCompra = 'KrediYa' AND v.estado_pago_financiera = 'Pendiente')
                OR (v.idCaja = $2 AND v.codVendedor = $1 AND TO_CHAR(v.fecha, 'YYYY-MM-DD') = $3)
            )
        `;
        const params = [codUsuario, idCaja, fecha || getLocalTimestamp().substring(0,10)];
        
        query += ` ORDER BY v.fecha DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.get('/ventas/:id', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                v.codVenta as "codVenta", 
                v.fecha, 
                v.codVendedor as "codVendedor", 
                v.identidadCliente as "identidadCliente", 
                v.total, 
                v.estado, 
                v.tipoCompra as "tipoCompra", 
                v.isv, 
                v.descuento, 
                v.monto_prima as "montoPrima", 
                v.monto_financiamiento as "montoFinanciado",
                c.nombre as "nombreCliente", 
                c.apellido as "apellidoCliente", 
                c.direccion as "direccionCliente", 
                u.usuario as "nombreVendedor"
            FROM ventas v
            JOIN clientes c ON v.identidadCliente = c.identidad
            JOIN usuarios u ON v.codVendedor = u.codUsuario
            WHERE v.codVenta = $1
        `;
        const r = await pool.query(query, [req.params.id]);
        res.json(r.rows[0]);
    } catch(e) { handleDbError(res, e); }
});

router.get('/ventas/:id/detalles', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                dv.codDetalleVenta as "codDetalleVenta",
                dv.idVenta as "idVenta",
                dv.idTelefono as "idTelefono",
                dv.idAccesorio as "idAccesorio",
                dv.cantidad as "cantidad",
                dv.precioVenta as "precioVenta",
                dv.tipoProducto as "tipoProducto",
                COALESCE(t.precioCompra, inv.precioCompra) as "precioCompra",
                COALESCE(t.marca || ' ' || t.modelo, a.descripcion) as "descripcionProducto"
            FROM detalleventa dv
            LEFT JOIN telefonos t ON dv.idTelefono = t.codigo
            LEFT JOIN accesorios a ON dv.idAccesorio = a.codAccesorio
            LEFT JOIN inventario inv ON dv.idAccesorio = inv.codInventario
            WHERE dv.idVenta = $1
        `;
        const r = await pool.query(query, [req.params.id]);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/ventas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { identidadCliente, tipoCompra, total, detalles, isv, descuento, montoPrima, montoFinanciado } = req.body;
    const { codUsuario } = req.user;
    
    await client.query('BEGIN');

    // SEGURIDAD: Obtener la caja actual del usuario directamente de la DB para evitar desincronización con el token
    const userRes = await client.query('SELECT idCaja FROM usuarios WHERE codUsuario = $1', [codUsuario]);
    const idCajaActual = userRes.rows[0]?.idCaja;

    if (!idCajaActual) {
        throw new Error('El usuario no tiene una caja asignada para realizar ventas.');
    }

    const hndTime = getLocalTimestamp();
    const codVenta = await generateNextId('ventas', 'codVenta', 'FACT', client);

    let totalCostoReal = 0;
    let descArray = [];

    for (const item of detalles) {
        if (item.idTelefono) {
            const tel = await client.query("SELECT marca, modelo, precioCompra FROM telefonos WHERE codigo = $1", [item.idTelefono]);
            const row = tel.rows[0];
            totalCostoReal += Number(row?.preciocompra || 0);
            if (row) descArray.push(`${row.marca} ${row.modelo}`.toUpperCase());
        } else if (item.idInventario) {
            const inv = await client.query(`
                SELECT i.precioCompra, a.descripcion, c.tipo as categoria 
                FROM inventario i 
                JOIN accesorios a ON i.codAccesorio = a.codAccesorio
                LEFT JOIN categoria c ON a.codCategoria = c.codCategoria
                WHERE i.codInventario = $1
            `, [item.idInventario]);
            const row = inv.rows[0];
            totalCostoReal += (Number(row?.preciocompra || 0) * Number(item.cantidad || 1));
            if (row) descArray.push(`${row.categoria || ''} ${row.descripcion}`.trim().toUpperCase());
        }
    }

    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    const esKrediya = (tipoCompra === 'KrediYa');
    
    const montoIngresoCaja = esKrediya ? Number(montoPrima) : Number(total);
    const costoIngresoCaja = esKrediya ? Number(montoPrima) : totalCostoReal;
    const subtipoMovimiento = esKrediya ? 'KrediYa_Prima' : 'Venta';
    
    const descripcionVenta = descArray.length > 0 ? descArray.join(', ') : `VENTA FACTURA #${codVenta}`;

    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado, subtipo_movimiento) 
       VALUES ($1, $2, $3, $4, $5, $6, 'Completada', $7)`,
      [idIngreso, idCajaActual, descripcionVenta, montoIngresoCaja, costoIngresoCaja, hndTime, subtipoMovimiento]
    );

    await client.query(
      `INSERT INTO ventas (codVenta, fecha, codVendedor, identidadCliente, total, estado, tipoCompra, isv, descuento, monto_prima, monto_financiamiento, monto_financiera, monto_prima_efectivo, es_krediya, estado_pago_financiera, idCaja) 
       VALUES ($1, $2, $3, $4, $5, 'Completada', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [codVenta, hndTime, codUsuario, identidadCliente, total, tipoCompra, isv || 0, descuento || 0, montoPrima || 0, montoFinanciado || 0, montoFinanciado || 0, montoPrima || 0, esKrediya, esKrediya ? 'Pending' : null, idCajaActual]
    );

    for (const item of detalles) {
      const codDetalle = await generateNextId('detalleventa', 'codDetalleVenta', 'PROD', client);
      if (item.idTelefono) {
        await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [item.idTelefono]);
        await client.query(`INSERT INTO detalleventa (codDetalleVenta, idVenta, idTelefono, idIngreso, cantidad, precioVenta, estado, tipoProducto) VALUES ($1,$2,$3,$4,1,$5,'Activo', 'TELEFONO')`, [codDetalle, codVenta, item.idTelefono, idIngreso, item.precioVenta]);
      } else if (item.idInventario) {
        await client.query("UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2", [item.cantidad, item.idInventario]);
        await client.query(`INSERT INTO detalleventa (codDetalleVenta, idVenta, idAccesorio, idIngreso, cantidad, precioVenta, estado, tipoProducto) VALUES ($1,$2,$3,$4,$5,$6,'Activo', 'ACCESORIO')`, [codDetalle, codVenta, item.idInventario, idIngreso, item.cantidad, item.precioVenta]);
      }
    }

    await updateArqueoBalance(idCajaActual, client);
    await client.query('COMMIT');
    res.status(201).json({ codVenta });
  } catch (err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

router.put('/ventas/:id/deposito-krediya', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const codVenta = req.params.id;
        // SEGURIDAD: Obtener la caja actual del usuario directamente de la DB
        const userRes = await client.query('SELECT idCaja FROM usuarios WHERE codUsuario = $1', [req.user.codUsuario]);
        const idCajaActual = userRes.rows[0]?.idCaja;

        if (!idCajaActual) throw new Error('Usuario sin caja asignada');

        await client.query('BEGIN');

        const vRes = await client.query('SELECT total, monto_financiera, monto_prima_efectivo FROM ventas WHERE codVenta = $1 AND es_krediya = TRUE', [codVenta]);
        if (vRes.rows.length === 0) throw new Error('Venta no encontrada');
        const v = vRes.rows[0];

        const cRes = await client.query(`
            SELECT SUM(COALESCE(t.precioCompra, i.precioCompra * dv.cantidad)) as real_cost
            FROM detalleventa dv
            LEFT JOIN telefonos t ON dv.idTelefono = t.codigo
            LEFT JOIN inventario i ON dv.idAccesorio = i.codInventario
            WHERE dv.idVenta = $1
        `, [codVenta]);
        const totalCostoReal = Number(cRes.rows[0].real_cost);
        
        const montoDeposito = Number(v.monto_financiera);
        const costoRemanente = totalCostoReal - Number(v.monto_prima_efectivo);

        const idI = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
        await client.query(
            `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado, subtipo_movimiento) 
             VALUES ($1, $2, $3, $4, $5, $6, 'Completada', 'KrediYa_Deposito')`,
            [idI, idCajaActual, `DEPOSITO KREDIYA - FACTURA #${codVenta}`, montoDeposito, costoRemanente, getLocalTimestamp()]
        );

        await client.query("UPDATE ventas SET estado_pago_financiera = 'Depositado' WHERE codVenta = $1", [codVenta]);

        await updateArqueoBalance(idCajaActual, client);
        await client.query('COMMIT');
        res.json({ message: 'Depósito conciliado' });
    } catch(err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

router.put('/ventas/:id/anular', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        await client.query('BEGIN');
        const vRes = await client.query('SELECT codVenta, idCaja FROM ventas WHERE codVenta = $1', [id]);
        if (vRes.rows.length === 0) throw new Error('Venta no encontrada');
        
        await client.query("UPDATE ventas SET estado = 'Anulada' WHERE codVenta = $1", [id]);
        await client.query("DELETE FROM ingresos WHERE descripcion LIKE $1", [`%FACTURA #${id}%`]);
        
        const details = await client.query('SELECT * FROM detalleventa WHERE idVenta = $1', [id]);
        for(let d of details.rows) {
            if(d.idtelefono) await client.query("UPDATE telefonos SET estado = 'Disponible' WHERE codigo = $1", [d.idtelefono]);
            if(d.idaccesorio) await client.query("UPDATE inventario SET cantidad = cantidad + $1 WHERE codInventario = $2", [d.cantidad, d.idaccesorio]);
        }
        
        await updateArqueoBalance(vRes.rows[0].idcaja, client);
        await client.query('COMMIT');
        res.json({ message: 'Venta anulada' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

module.exports = router;
