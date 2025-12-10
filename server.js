const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'smartcloud_secret_key_change_in_prod';

// Middleware
app.use(express.json());

// --- DATABASE CONFIG ---
const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: false }
});

// --- DB INITIALIZATION & HELPER ---
async function initDB() {
  try {
    console.log('🔄 Verificando esquema de base de datos...');
    
    // 1. Tablas Base
    await pool.query(`CREATE TABLE IF NOT EXISTS roles (idrol varchar(100) PRIMARY KEY, nombre varchar(50) NOT NULL, estado varchar(20) NOT NULL DEFAULT 'Activo');`);
    await pool.query(`CREATE TABLE IF NOT EXISTS caja (idCaja varchar(100) PRIMARY KEY, nombre varchar(50) NOT NULL, estado varchar(50) NOT NULL DEFAULT 'Activa');`);
    await pool.query(`CREATE TABLE IF NOT EXISTS empleado (identidad varchar(20) PRIMARY KEY, nombre varchar(30) NOT NULL, apellido varchar(30) NOT NULL, direccion varchar(100) NOT NULL, telefono varchar(20) NOT NULL, estado varchar(20) NOT NULL DEFAULT 'Activo', fechaCreacion timestamp NOT NULL DEFAULT NOW(), fechaModificacion timestamp);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS usuarios (codUsuario varchar(100) PRIMARY KEY, usuario varchar(100) NOT NULL, password varchar(100) NOT NULL, identidad varchar(20) NOT NULL, idCaja varchar(100) NOT NULL, idrol varchar(100) NOT NULL, foto bytea, fechaCreacion timestamp NOT NULL DEFAULT NOW(), fechaModificacion timestamp, estado varchar(20) NOT NULL DEFAULT 'Activo');`);
    
    // 2. Inventario
    await pool.query(`CREATE TABLE IF NOT EXISTS ubicacion (idUbicacion varchar(100) PRIMARY KEY, nombre varchar(50) NOT NULL, descripcion varchar(100) NOT NULL, estante varchar(50) NOT NULL, nivel varchar(50) NOT NULL, estado varchar(20) NOT NULL);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS categoria (codCategoria varchar(50) PRIMARY KEY, tipo varchar(30) NOT NULL);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS accesorios (codAccesorio varchar(100) PRIMARY KEY, codCategoria varchar(50) NOT NULL, descripcion varchar(100) NOT NULL);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS telefonos (codigo varchar(100) PRIMARY KEY, imei1 varchar(50) NOT NULL, imei2 varchar(50) NOT NULL, marca varchar(50) NOT NULL, modelo varchar(50) NOT NULL, precioCompra numeric(10,2) NOT NULL, precioVenta numeric(10,2) NOT NULL, codProveedor varchar(50) NOT NULL, fecha date NOT NULL, idubicacion varchar(100) NOT NULL, estado varchar(20) NOT NULL);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS inventario (codInventario varchar(100) PRIMARY KEY, codAccesorio varchar(100), cantidad integer NOT NULL, precioCompra numeric(10,2) NOT NULL, precioVenta numeric(10,2) NOT NULL, codProveedor varchar(50) NOT NULL, fecha date NOT NULL, idubicacion varchar(100) NOT NULL, estado varchar(100) NOT NULL);`);
    
    // UPDATED: Added fechaCreacion to providers to match typical error requirements if DB has it
    await pool.query(`CREATE TABLE IF NOT EXISTS proveedores (codProveedor varchar(50) PRIMARY KEY, nombre varchar(100) NOT NULL, telefono varchar(50), direccion varchar(150), fechaCreacion timestamp DEFAULT NOW());`);
    
    // 3. Clientes
    await pool.query(`CREATE TABLE IF NOT EXISTS clientes (identidad varchar(20) PRIMARY KEY, nombre varchar(50) NOT NULL, apellido varchar(50) NOT NULL, direccion varchar(150) NOT NULL, telefono varchar(20), correo varchar(100), fechaCreacion timestamp DEFAULT NOW());`);

    // 4. Ventas
    await pool.query(`CREATE TABLE IF NOT EXISTS ventas (codVenta varchar(100) PRIMARY KEY, fecha timestamp NOT NULL, codUsuario varchar(100) NOT NULL, identidadCliente varchar(20) NOT NULL, tipoCompra varchar(20) NOT NULL, total numeric(10,2) NOT NULL, isv numeric(10,2) NOT NULL, descuento numeric(10,2) NOT NULL, estado varchar(20) NOT NULL);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS detalle_venta (codDetalleVenta varchar(100) PRIMARY KEY, idVenta varchar(100) NOT NULL, idTelefono varchar(100), idInventario varchar(100), cantidad integer NOT NULL, precioVenta numeric(10,2) NOT NULL);`);
    
    // 5. Data Inicial (Seeds) - FIXED Insert to include NOW() for fechaCreacion
    await pool.query("INSERT INTO proveedores (codProveedor, nombre, telefono, direccion, fechaCreacion) VALUES ('PROV-GEN', 'General', '0000', 'Ciudad', NOW()) ON CONFLICT DO NOTHING");
    await pool.query("INSERT INTO ubicacion (idUbicacion, nombre, descripcion, estante, nivel, estado) VALUES ('UBIC-0001', 'Vitrina Principal', 'Entrada', '1', '1', 'Activo') ON CONFLICT DO NOTHING");
    
    console.log('✅ Base de datos inicializada correctamente');
  } catch (err) {
    console.error('❌ Error inicializando BD:', err);
  }
}

// --- HELPER: GENERADOR DE IDs (ROBUST) ---
// Updated to accept an optional 'client' parameter for transaction visibility
async function generateNextId(table, column, prefix, client = pool) {
  try {
    const query = `SELECT ${column} as id FROM ${table} WHERE ${column} LIKE '${prefix}-%'`;
    const result = await client.query(query);
    
    let maxNum = 0;
    
    for (const row of result.rows) {
      if (!row.id) continue;
      const parts = row.id.split(`${prefix}-`);
      if (parts.length === 2) {
        const suffix = parts[1];
        if (/^\d+$/.test(suffix)) {
          const num = parseInt(suffix, 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    
    const nextNum = maxNum + 1;
    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  } catch (err) {
    console.error(`Error generando ID para ${table}:`, err);
    throw err;
  }
}

const handleDbError = (res, err) => {
  console.error('DB Error:', err);
  if (err.code === '23503') return res.status(409).json({ error: 'Registro en uso por otra entidad.' });
  if (err.code === '23505') return res.status(409).json({ error: 'El registro ya existe (duplicado).' });
  if (err.code === '42P01') return res.status(500).json({ error: 'Tabla no encontrada. Reinicie el servidor.' });
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Start Server and Init DB
app.listen(port, () => {
  console.log(`SmartCloud Server running on port ${port}`);
  initDB(); // Run DB setup on start
});


// --- AUTH ENDPOINTS ---
app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const query = `
      SELECT u.codUsuario, u.usuario, u.password, u.estado, r.nombre as rol_nombre, e.nombre as emp_nombre, e.apellido as emp_apellido
      FROM usuarios u
      JOIN roles r ON u.idrol = r.idrol
      JOIN empleado e ON u.identidad = e.identidad
      WHERE u.usuario = $1
    `;
    const result = await pool.query(query, [usuario]);
    const userRaw = result.rows[0];

    if (!userRaw || userRaw.estado !== 'Activo') return res.status(401).json({ error: 'Usuario no válido' });
    
    let validPassword = false;
    if (userRaw.password.startsWith('$2a$')) validPassword = await bcrypt.compare(password, userRaw.password);
    else validPassword = (userRaw.password === password);

    if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas' });

    const userData = { codUsuario: userRaw.codusuario, usuario: userRaw.usuario, rol: userRaw.rol_nombre, nombreEmpleado: `${userRaw.emp_nombre} ${userRaw.emp_apellido}` };
    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: userData });
  } catch (err) { handleDbError(res, err); }
});

// ==========================================
// CLIENTES
// ==========================================
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) { handleDbError(res, err); }
});

app.post('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const { identidad, nombre, apellido, direccion, telefono, correo } = req.body;
    // Updated to include NOW() for fechaCreacion to prevent null errors
    await pool.query(
      `INSERT INTO clientes (identidad, nombre, apellido, direccion, telefono, correo, fechaCreacion) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [identidad, nombre, apellido, direccion, telefono, correo]
    );
    res.status(201).json({ message: 'Cliente registrado' });
  } catch (err) { handleDbError(res, err); }
});

app.put('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, direccion, telefono, correo } = req.body;
    await pool.query(
      `UPDATE clientes SET nombre=$1, apellido=$2, direccion=$3, telefono=$4, correo=$5 WHERE identidad=$6`,
      [nombre, apellido, direccion, telefono, correo, id]
    );
    res.json({ message: 'Cliente actualizado' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM clientes WHERE identidad=$1', [id]);
    res.json({ message: 'Cliente eliminado' });
  } catch (err) { handleDbError(res, err); }
});


// ==========================================
// PROVEEDORES
// ==========================================
app.get('/api/proveedores', authenticateToken, async (req, res) => {
  try {
     const result = await pool.query('SELECT codproveedor as "codProveedor", nombre, telefono, direccion FROM proveedores'); 
     res.json(result.rows);
  } catch (err) { handleDbError(res, err); }
});

app.post('/api/proveedores', authenticateToken, async (req, res) => {
  try {
    const { nombre, telefono, direccion } = req.body;
    const codProveedor = await generateNextId('proveedores', 'codProveedor', 'PROV');
    await pool.query(
      "INSERT INTO proveedores (codProveedor, nombre, telefono, direccion, fechaCreacion) VALUES ($1, $2, $3, $4, NOW())",
      [codProveedor, nombre, telefono, direccion]
    );
    res.status(201).json({ message: 'Proveedor creado', id: codProveedor });
  } catch (err) { handleDbError(res, err); }
});

app.put('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, telefono, direccion } = req.body;
    await pool.query(
      "UPDATE proveedores SET nombre=$1, telefono=$2, direccion=$3 WHERE codProveedor=$4",
      [nombre, telefono, direccion, id]
    );
    res.json({ message: 'Proveedor actualizado' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/proveedores/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM proveedores WHERE codProveedor=$1', [id]);
    res.json({ message: 'Proveedor eliminado' });
  } catch (err) { handleDbError(res, err); }
});


// ==========================================
// VENTAS (POS) - TRANSACTIONAL
// ==========================================
app.post('/api/ventas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { identidadCliente, tipoCompra, total, isv, descuento, detalles } = req.body;
    const codUsuario = req.user.codUsuario;

    await client.query('BEGIN');

    // 1. Crear Venta Header - Pass 'client' to ID generator
    const codVenta = await generateNextId('ventas', 'codVenta', 'FACT', client);
    const fecha = new Date();
    
    await client.query(
      `INSERT INTO ventas (codVenta, fecha, codUsuario, identidadCliente, tipoCompra, total, isv, descuento, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Completada')`,
      [codVenta, fecha, codUsuario, identidadCliente, tipoCompra, total, isv, descuento]
    );

    // 2. Procesar Detalles y Actualizar Stock
    for (const item of detalles) {
      // Pass 'client' to ID generator so it sees previous IDs created in this transaction loop
      const codDetalle = await generateNextId('detalle_venta', 'codDetalleVenta', 'DET', client); 
      
      await client.query(
        `INSERT INTO detalle_venta (codDetalleVenta, idVenta, idTelefono, idInventario, cantidad, precioVenta)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [codDetalle, codVenta, item.idTelefono || null, item.idInventario || null, item.cantidad, item.precioVenta]
      );

      // STOCK UPDATE LOGIC
      if (item.idTelefono) {
        // Es un teléfono: Marcar como vendido
        await client.query(
          "UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1",
          [item.idTelefono]
        );
      } else if (item.idInventario) {
        // Es un accesorio: Restar cantidad
        await client.query(
          "UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2",
          [item.cantidad, item.idInventario]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Venta registrada con éxito', codVenta, fecha });

  } catch (err) {
    await client.query('ROLLBACK');
    handleDbError(res, err);
  } finally {
    client.release();
  }
});

// ==========================================
// INVENTARIO ENDPOINTS
// ==========================================

// 1. TELEFONOS
app.get('/api/inventory/telefonos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        t.codigo, t.imei1, t.imei2, t.marca, t.modelo, 
        t.preciocompra as "precioCompra", t.precioventa as "precioVenta", 
        t.codproveedor as "codProveedor", t.fecha, t.idubicacion, t.estado,
        u.nombre as "nombreUbicacion", u.estante, u.nivel
      FROM telefonos t
      LEFT JOIN ubicacion u ON t.idubicacion = u.idUbicacion
      ORDER BY t.codigo DESC
    `);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/inventory/telefonos', authenticateToken, async (req, res) => {
  try {
    const { imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, idubicacion } = req.body;
    const codigo = await generateNextId('telefonos', 'codigo', 'TELF');
    const fecha = new Date();
    
    await pool.query(
      `INSERT INTO telefonos (codigo, imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, fecha, idubicacion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Disponible')`,
      [codigo, imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, fecha, idubicacion]
    );
    res.status(201).json({ message: 'Teléfono registrado', id: codigo });
  } catch(err) { handleDbError(res, err); }
});

app.put('/api/inventory/telefonos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, idubicacion } = req.body;
    await pool.query(
      `UPDATE telefonos SET imei1=$1, imei2=$2, marca=$3, modelo=$4, precioCompra=$5, precioVenta=$6, codProveedor=$7, idubicacion=$8 
       WHERE codigo=$9`,
      [imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, idubicacion, id]
    );
    res.json({ message: 'Teléfono actualizado' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/inventory/telefonos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM telefonos WHERE codigo=$1', [id]);
    res.json({ message: 'Teléfono eliminado' });
  } catch (err) { handleDbError(res, err); }
});

// 2. CATEGORIAS
app.get('/api/inventory/categorias', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT codcategoria as "codCategoria", tipo FROM categoria ORDER BY codCategoria ASC');
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/inventory/categorias', authenticateToken, async (req, res) => {
  try {
    const { tipo } = req.body;
    const codCategoria = await generateNextId('categoria', 'codCategoria', 'CATG');
    await pool.query("INSERT INTO categoria (codCategoria, tipo) VALUES ($1, $2)", [codCategoria, tipo]);
    res.status(201).json({ message: 'Categoría creada', id: codCategoria });
  } catch(err) { handleDbError(res, err); }
});

app.put('/api/inventory/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo } = req.body;
    await pool.query('UPDATE categoria SET tipo=$1 WHERE codCategoria=$2', [tipo, id]);
    res.json({ message: 'Categoría actualizada' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/inventory/categorias/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM categoria WHERE codCategoria=$1', [id]);
    res.json({ message: 'Categoría eliminada' });
  } catch (err) { handleDbError(res, err); }
});

// 3. ACCESORIOS (MASTER)
app.get('/api/inventory/accesorios-master', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.codaccesorio as "codAccesorio", a.codcategoria as "codCategoria", a.descripcion,
        c.tipo as "nombreCategoria"
      FROM accesorios a
      JOIN categoria c ON a.codCategoria = c.codCategoria
      ORDER BY a.codAccesorio ASC
    `);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/inventory/accesorios-master', authenticateToken, async (req, res) => {
  try {
    const { codCategoria, descripcion } = req.body;
    
    // Obtener nombre categoria para prefijo
    const catResult = await pool.query("SELECT tipo FROM categoria WHERE codCategoria = $1", [codCategoria]);
    if (catResult.rows.length === 0) return res.status(404).json({ error: 'Categoría no encontrada' });

    const nombreCategoria = catResult.rows[0].tipo;
    // Prefijo: Primeras 4 letras
    let prefix = nombreCategoria.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, 'X');
    if (prefix.length < 3) prefix = 'ITEM';

    const id = await generateNextId('accesorios', 'codAccesorio', prefix);
    
    await pool.query("INSERT INTO accesorios (codAccesorio, codCategoria, descripcion) VALUES ($1, $2, $3)", [id, codCategoria, descripcion]);
    res.status(201).json({ message: 'Accesorio creado', id });
  } catch(err) { handleDbError(res, err); }
});

app.put('/api/inventory/accesorios-master/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { codCategoria, descripcion } = req.body;
    await pool.query('UPDATE accesorios SET codCategoria=$1, descripcion=$2 WHERE codAccesorio=$3', [codCategoria, descripcion, id]);
    res.json({ message: 'Accesorio actualizado' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/inventory/accesorios-master/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM accesorios WHERE codAccesorio=$1', [id]);
    res.json({ message: 'Accesorio eliminado' });
  } catch (err) { handleDbError(res, err); }
});

// 4. INVENTARIO (STOCK)
app.get('/api/inventory/stock', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.codinventario as "codInventario", i.codaccesorio as "codAccesorio", i.cantidad, 
        i.preciocompra as "precioCompra", i.precioventa as "precioVenta", 
        i.codproveedor as "codProveedor", i.fecha, i.idubicacion, i.estado,
        a.descripcion, c.tipo as categoria, 
        u.nombre as "nombreUbicacion", u.estante, u.nivel
      FROM inventario i
      JOIN accesorios a ON i.codAccesorio = a.codAccesorio
      JOIN categoria c ON a.codCategoria = c.codCategoria
      JOIN ubicacion u ON i.idubicacion = u.idUbicacion
      ORDER BY i.codInventario DESC
    `);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/inventory/stock', authenticateToken, async (req, res) => {
  try {
    const { codAccesorio, cantidad, precioCompra, precioVenta, codProveedor, idubicacion } = req.body;
    const codInventario = await generateNextId('inventario', 'codInventario', 'ACCS'); 
    const fecha = new Date();
    
    await pool.query(
      `INSERT INTO inventario (codInventario, codAccesorio, cantidad, precioCompra, precioVenta, codProveedor, fecha, idubicacion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Disponible')`,
      [codInventario, codAccesorio, cantidad, precioCompra, precioVenta, codProveedor, fecha, idubicacion]
    );
    res.status(201).json({ message: 'Stock agregado', id: codInventario });
  } catch(err) { handleDbError(res, err); }
});

app.put('/api/inventory/stock/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { cantidad, precioCompra, precioVenta, codProveedor, idubicacion } = req.body;
    await pool.query(
      `UPDATE inventario SET cantidad=$1, precioCompra=$2, precioVenta=$3, codProveedor=$4, idubicacion=$5 
       WHERE codInventario=$6`,
      [cantidad, precioCompra, precioVenta, codProveedor, idubicacion, id]
    );
    res.json({ message: 'Stock actualizado' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/inventory/stock/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM inventario WHERE codInventario=$1', [id]);
    res.json({ message: 'Registro de stock eliminado' });
  } catch (err) { handleDbError(res, err); }
});

// 5. UBICACIONES
app.get('/api/inventory/ubicaciones', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT idubicacion as "idUbicacion", nombre, descripcion, estante, nivel, estado FROM ubicacion ORDER BY idUbicacion ASC');
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/inventory/ubicaciones', authenticateToken, async (req, res) => {
  try {
    const { nombre, descripcion, estante, nivel } = req.body;
    const idUbicacion = await generateNextId('ubicacion', 'idUbicacion', 'UBIC');
    await pool.query(
      "INSERT INTO ubicacion (idUbicacion, nombre, descripcion, estante, nivel, estado) VALUES ($1, $2, $3, $4, $5, 'Activo')",
      [idUbicacion, nombre, descripcion, estante, nivel]
    );
    res.status(201).json({ message: 'Ubicación creada', id: idUbicacion });
  } catch(err) { handleDbError(res, err); }
});

app.put('/api/inventory/ubicaciones/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, estante, nivel } = req.body;
    await pool.query(
      'UPDATE ubicacion SET nombre=$1, descripcion=$2, estante=$3, nivel=$4 WHERE idUbicacion=$5',
      [nombre, descripcion, estante, nivel, id]
    );
    res.json({ message: 'Ubicación actualizada' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/inventory/ubicaciones/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM ubicacion WHERE idUbicacion=$1', [id]);
    res.json({ message: 'Ubicación eliminada' });
  } catch (err) { handleDbError(res, err); }
});

// 6. UNIFIED PRODUCTS
app.get('/api/productos/unificados', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT codigo as id, 'TELEFONO' as tipo, (marca || ' ' || modelo) as nombre, codigo, precioventa as "precioVenta", 1 as stock, imei1 as imei, idubicacion as ubicacion
      FROM telefonos WHERE estado = 'Disponible'
      UNION ALL
      SELECT i.codinventario as id, 'ACCESORIO' as tipo, a.descripcion as nombre, i.codinventario as codigo, i.precioventa as "precioVenta", i.cantidad as stock, NULL as imei, i.idubicacion as ubicacion
      FROM inventario i
      JOIN accesorios a ON i.codAccesorio = a.codAccesorio
      WHERE i.estado = 'Disponible' AND i.cantidad > 0
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

// Serve Frontend
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});