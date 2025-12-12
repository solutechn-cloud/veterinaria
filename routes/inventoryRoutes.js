
const express = require('express');
const router = express.Router();
const { pool, generateNextId, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- PRODUCTOS UNIFICADOS (POS) ---
router.get('/productos/unificados', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                codigo as id, 
                'TELEFONO' as tipo, 
                (marca || ' ' || modelo) as nombre, 
                codigo, 
                precioVenta as "precioVenta", 
                1 as stock, 
                imei1 as imei, 
                idubicacion as ubicacion 
            FROM telefonos WHERE estado = 'Disponible'
            UNION ALL
            SELECT 
                i.codInventario as id, 
                'ACCESORIO' as tipo, 
                a.descripcion as nombre, 
                a.codAccesorio as codigo, 
                i.precioVenta as "precioVenta", 
                i.cantidad as stock, 
                NULL as imei, 
                i.idubicacion as ubicacion
            FROM inventario i
            JOIN accesorios a ON i.codAccesorio = a.codAccesorio
            WHERE i.cantidad > 0 AND i.estado = 'Disponible'
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- TELEFONOS ---
router.get('/inventory/telefonos', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT 
                t.codigo, t.imei1, t.imei2, t.marca, t.modelo, 
                t.precioCompra as "precioCompra", 
                t.precioVenta as "precioVenta", 
                t.idubicacion, t.estado, t.fecha,
                t.codProveedor as "codProveedor",
                u.nombre as "nombreUbicacion"
            FROM telefonos t
            LEFT JOIN ubicacion u ON t.idubicacion = u.idUbicacion
            ORDER BY t.fecha DESC
        `);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/inventory/telefonos', authenticateToken, async (req, res) => {
    try {
        const { imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, fecha, idubicacion } = req.body;
        
        // CORRECCION: Validar imei2 para evitar error NOT NULL
        const safeImei2 = imei2 || ''; 

        const codigo = await generateNextId('telefonos', 'codigo', 'TEL');
        await pool.query(
            `INSERT INTO telefonos (codigo, imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, fecha, idubicacion, estado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, 'Disponible')`,
            [codigo, imei1, safeImei2, marca, modelo, precioCompra, precioVenta, codProveedor, fecha, idubicacion]
        );
        res.status(201).json({ message: 'Teléfono registrado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/inventory/telefonos/:id', authenticateToken, async (req, res) => {
    try {
        const { imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, fecha, idubicacion } = req.body;
        
        // CORRECCION: Validar imei2 para evitar error NOT NULL
        const safeImei2 = imei2 || '';

        await pool.query(
            `UPDATE telefonos SET imei1=$1, imei2=$2, marca=$3, modelo=$4, precioCompra=$5, precioVenta=$6, codProveedor=$7, fecha=$8, idubicacion=$9 
             WHERE codigo=$10`,
            [imei1, safeImei2, marca, modelo, precioCompra, precioVenta, codProveedor, fecha, idubicacion, req.params.id]
        );
        res.json({ message: 'Teléfono actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/inventory/telefonos/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query("DELETE FROM telefonos WHERE codigo=$1", [req.params.id]);
        res.json({ message: 'Teléfono eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- STOCK ACCESORIOS ---
router.get('/inventory/stock', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT 
                i.codInventario as "codInventario", 
                i.codAccesorio as "codAccesorio", 
                i.cantidad, 
                i.precioVenta as "precioVenta", 
                i.precioCompra as "precioCompra", 
                i.estado, 
                i.idubicacion,
                i.codProveedor as "codProveedor",
                a.descripcion as "descripcionAccesorio",
                c.tipo as "categoriaAccesorio", 
                u.nombre as "nombreUbicacion"
            FROM inventario i
            JOIN accesorios a ON i.codAccesorio = a.codAccesorio
            LEFT JOIN categoria c ON a.codCategoria = c.codCategoria
            LEFT JOIN ubicacion u ON i.idubicacion = u.idUbicacion
            ORDER BY i.fecha DESC
        `);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/inventory/stock', authenticateToken, async (req, res) => {
    try {
        const { codAccesorio, cantidad, precioCompra, precioVenta, codProveedor, fecha, idubicacion, estado } = req.body;
        // Prefijo INVT para inventario
        const codInventario = await generateNextId('inventario', 'codInventario', 'INVT');
        await pool.query(
            `INSERT INTO inventario (codInventario, codAccesorio, cantidad, precioCompra, precioVenta, codProveedor, fecha, idubicacion, estado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [codInventario, codAccesorio, cantidad, precioCompra, precioVenta, codProveedor, fecha, idubicacion, estado || 'Disponible']
        );
        res.status(201).json({ message: 'Stock agregado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/inventory/stock/:id', authenticateToken, async (req, res) => {
    try {
        const { cantidad, precioCompra, precioVenta, codProveedor, idubicacion, estado } = req.body;
        await pool.query(
            `UPDATE inventario SET cantidad=$1, precioCompra=$2, precioVenta=$3, codProveedor=$4, idubicacion=$5, estado=$6 WHERE codInventario=$7`,
            [cantidad, precioCompra, precioVenta, codProveedor, idubicacion, estado, req.params.id]
        );
        res.json({ message: 'Stock actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/inventory/stock/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM inventario WHERE codInventario=$1', [req.params.id]);
        res.json({ message: 'Registro de stock eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- MAESTRO ACCESORIOS ---
router.get('/inventory/accesorios-master', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT a.codAccesorio as "codAccesorio", a.codCategoria as "codCategoria", a.descripcion, c.tipo as "nombreCategoria"
            FROM accesorios a
            LEFT JOIN categoria c ON a.codCategoria = c.codCategoria
        `);
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/inventory/accesorios-master', authenticateToken, async (req, res) => {
    try {
        const { codCategoria, descripcion } = req.body;
        // Prefijo ACCS para accesorios
        const id = await generateNextId('accesorios', 'codAccesorio', 'ACCS');
        await pool.query('INSERT INTO accesorios VALUES ($1, $2, $3)', [id, codCategoria, descripcion]);
        res.status(201).json({ message: 'Accesorio creado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/inventory/accesorios-master/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE accesorios SET descripcion=$1, codCategoria=$2 WHERE codAccesorio=$3', 
            [req.body.descripcion, req.body.codCategoria, req.params.id]);
        res.json({ message: 'Accesorio actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/inventory/accesorios-master/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM accesorios WHERE codAccesorio=$1', [req.params.id]);
        res.json({ message: 'Accesorio eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- CATEGORIAS ---
router.get('/inventory/categorias', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT codCategoria as "codCategoria", tipo FROM categoria');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/inventory/categorias', authenticateToken, async (req, res) => {
    try {
        // CAMBIO SOLICITADO: Prefijo CATG
        const id = await generateNextId('categoria', 'codCategoria', 'CATG');
        await pool.query('INSERT INTO categoria VALUES ($1, $2)', [id, req.body.tipo]);
        res.status(201).json({ message: 'Categoría creada' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/inventory/categorias/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE categoria SET tipo=$1 WHERE codCategoria=$2', [req.body.tipo, req.params.id]);
        res.json({ message: 'Categoría actualizada' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/inventory/categorias/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM categoria WHERE codCategoria=$1', [req.params.id]);
        res.json({ message: 'Categoría eliminada' });
    } catch(e) { handleDbError(res, e); }
});

// --- UBICACIONES ---
router.get('/inventory/ubicaciones', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT idUbicacion as "idUbicacion", nombre, descripcion, estante, nivel, estado FROM ubicacion');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/inventory/ubicaciones', authenticateToken, async (req, res) => {
    try {
        const { nombre, descripcion, estante, nivel, estado } = req.body;
        const id = await generateNextId('ubicacion', 'idUbicacion', 'UBI');
        await pool.query('INSERT INTO ubicacion VALUES ($1,$2,$3,$4,$5,$6)', [id, nombre, descripcion, estante, nivel, estado]);
        res.status(201).json({ message: 'Ubicación creada' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/inventory/ubicaciones/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, descripcion, estante, nivel, estado } = req.body;
        await pool.query('UPDATE ubicacion SET nombre=$1, descripcion=$2, estante=$3, nivel=$4, estado=$5 WHERE idUbicacion=$6', 
            [nombre, descripcion, estante, nivel, estado, req.params.id]);
        res.json({ message: 'Ubicación actualizada' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/inventory/ubicaciones/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM ubicacion WHERE idUbicacion=$1', [req.params.id]);
        res.json({ message: 'Ubicación eliminada' });
    } catch(e) { handleDbError(res, e); }
});

// --- PROVEEDORES ---
router.get('/proveedores', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT codProveedor as "codProveedor", nombre, telefono, direccion FROM proveedores');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/proveedores', authenticateToken, async (req, res) => {
    try {
        const { nombre, telefono, direccion } = req.body;
        const id = await generateNextId('proveedores', 'codProveedor', 'PROV');
        await pool.query('INSERT INTO proveedores (codProveedor, nombre, telefono, direccion, fechaCreacion) VALUES ($1,$2,$3,$4,NOW())', 
            [id, nombre, telefono, direccion]);
        res.status(201).json({ message: 'Proveedor creado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/proveedores/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, telefono, direccion } = req.body;
        await pool.query('UPDATE proveedores SET nombre=$1, telefono=$2, direccion=$3 WHERE codProveedor=$4', 
            [nombre, telefono, direccion, req.params.id]);
        res.json({ message: 'Proveedor actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/proveedores/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM proveedores WHERE codProveedor=$1', [req.params.id]);
        res.json({ message: 'Proveedor eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- PAQUETES (NUEVO) ---
router.get('/paquetes', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT idPaquete as "idPaquete", red, nombre, precio, costo, estado FROM paquetes');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/paquetes', authenticateToken, async (req, res) => {
    try {
        const { red, nombre, precio, costo, estado } = req.body;
        const id = await generateNextId('paquetes', 'idPaquete', 'PAQ');
        await pool.query('INSERT INTO paquetes (idPaquete, red, nombre, precio, costo, estado) VALUES ($1,$2,$3,$4,$5,$6)', 
            [id, red, nombre, precio, costo, estado]);
        res.status(201).json({ message: 'Paquete creado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/paquetes/:id', authenticateToken, async (req, res) => {
    try {
        const { red, nombre, precio, costo, estado } = req.body;
        await pool.query('UPDATE paquetes SET red=$1, nombre=$2, precio=$3, costo=$4, estado=$5 WHERE idPaquete=$6', 
            [red, nombre, precio, costo, estado, req.params.id]);
        res.json({ message: 'Paquete actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/paquetes/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM paquetes WHERE idPaquete=$1', [req.params.id]);
        res.json({ message: 'Paquete eliminado' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
