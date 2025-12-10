const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'smartcloud_secret_key_change_in_prod';

// Middleware
app.use(cors());
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
    
    // 3. Tablas que pueden necesitar migracion
    await pool.query(`CREATE TABLE IF NOT EXISTS proveedores (codProveedor varchar(50) PRIMARY KEY, nombre varchar(100) NOT NULL, telefono varchar(50), direccion varchar(150), fechaCreacion timestamp DEFAULT NOW());`);
    // Alter table safely
    await pool.query(`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS fechaCreacion timestamp DEFAULT NOW()`);
    // Backfill nulls
    await pool.query(`UPDATE proveedores SET fechaCreacion = NOW() WHERE fechaCreacion IS NULL`);

    await pool.query(`CREATE TABLE IF NOT EXISTS clientes (identidad varchar(20) PRIMARY KEY, nombre varchar(50) NOT NULL, apellido varchar(50) NOT NULL, direccion varchar(150) NOT NULL, telefono varchar(20), correo varchar(100), fechaCreacion timestamp DEFAULT NOW());`);
    await pool.query(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fechaCreacion timestamp DEFAULT NOW()`);
    await pool.query(`UPDATE clientes SET fechaCreacion = NOW() WHERE fechaCreacion IS NULL`);

    // 4. Ventas & MIGRATION
    await pool.query(`CREATE TABLE IF NOT EXISTS ventas (codVenta varchar(100) PRIMARY KEY, fecha timestamp NOT NULL, codUsuario varchar(100) NOT NULL, identidadCliente varchar(20) NOT NULL, tipoCompra varchar(20) NOT NULL, total numeric(10,2) NOT NULL, isv numeric(10,2) NOT NULL, descuento numeric(10,2) NOT NULL, estado varchar(20) NOT NULL);`);
    
    // Ensure all columns exist
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS codUsuario varchar(100)`);
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS codvendedor varchar(100)`); // Asegurar que existe codvendedor
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS identidadCliente varchar(20)`);
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS tipoCompra varchar(20)`);
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS isv numeric(10,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento numeric(10,2) DEFAULT 0`);

    await pool.query(`CREATE TABLE IF NOT EXISTS detalle_venta (codDetalleVenta varchar(100) PRIMARY KEY, idVenta varchar(100) NOT NULL, idTelefono varchar(100), idInventario varchar(100), cantidad integer NOT NULL, precioVenta numeric(10,2) NOT NULL);`);
    
    await pool.query(`ALTER TABLE detalle_venta ADD COLUMN IF NOT EXISTS idTelefono varchar(100)`);
    await pool.query(`ALTER TABLE detalle_venta ADD COLUMN IF NOT EXISTS idInventario varchar(100)`);

    // 5. Data Inicial (Seeds)
    await pool.query("INSERT INTO proveedores (codProveedor, nombre, telefono, direccion, fechaCreacion) VALUES ('PROV-GEN', 'General', '0000', 'Ciudad', NOW()) ON CONFLICT DO NOTHING");
    await pool.query("INSERT INTO ubicacion (idUbicacion, nombre, descripcion, estante, nivel, estado) VALUES ('UBIC-0001', 'Vitrina Principal', 'Entrada', '1', '1', 'Activo') ON CONFLICT DO NOTHING");
    
    // Default Admin User seeds if empty
    const rolesCheck = await pool.query("SELECT * FROM roles");
    if(rolesCheck.rowCount === 0) {
        await pool.query("INSERT INTO roles (idrol, nombre, estado) VALUES ('ROL-ADMIN', 'Administrador', 'Activo')");
        await pool.query("INSERT INTO roles (idrol, nombre, estado) VALUES ('ROL-VEND', 'Vendedor', 'Activo')");
        await pool.query("INSERT INTO caja (idCaja, nombre, estado) VALUES ('CAJA-01', 'Caja Principal', 'Activa')");
        await pool.query("INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono, estado) VALUES ('0801199000000', 'Admin', 'Sistema', 'Tegucigalpa', '00000000', 'Activo')");
        // Pass: admin123
        await pool.query("INSERT INTO usuarios (codUsuario, usuario, password, identidad, idCaja, idrol, estado) VALUES ('USR-001', 'admin', 'admin123', '0801199000000', 'CAJA-01', 'ROL-ADMIN', 'Activo')");
    }

    console.log('✅ Base de datos inicializada correctamente');
  } catch (err) {
    console.error('❌ Error inicializando BD (No fatal):', err.message);
  }
}

// --- HELPER: GENERADOR DE IDs (ROBUST SCAN) ---
async function generateNextId(table, column, prefix, client = pool) {
  try {
    const query = `
      SELECT ${column} as id 
      FROM ${table} 
      WHERE ${column} LIKE '${prefix}-%' 
      ORDER BY LENGTH(${column}) DESC, ${column} DESC 
      LIMIT 50
    `;
    const result = await client.query(query);
    
    let maxNum = 0;
    
    for (const row of result.rows) {
      if (!row.id) continue;
      const parts = row.id.split(`${prefix}-`);
      if (parts.length === 2) {
        // Ensure strictly numeric suffix
        if (/^\d+$/.test(parts[1])) {
          const num = parseInt(parts[1], 10);
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
  console.error('DB Error Detail:', err); 
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

    // Ensure codUsuario is available in payload (handle DB casing)
    const userData = { 
      codUsuario: userRaw.codusuario || userRaw.codUsuario, // Safe check
      usuario: userRaw.usuario, 
      rol: userRaw.rol_nombre, 
      nombreEmpleado: `${userRaw.emp_nombre} ${userRaw.emp_apellido}` 
    };
    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: userData });
  } catch (err) { handleDbError(res, err); }
});

// ==========================================
// ADMIN MODULES (NEWLY ADDED)
// ==========================================

// 1. USUARIOS
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.codUsuario, u.usuario, u.identidad, u.idrol, u.idCaja, u.estado,
             e.nombre || ' ' || e.apellido as "nombreEmpleado",
             r.nombre as "nombreRol", c.nombre as "nombreCaja"
      FROM usuarios u
      LEFT JOIN empleado e ON u.identidad = e.identidad
      LEFT JOIN roles r ON u.idrol = r.idrol
      LEFT JOIN caja c ON u.idCaja = c.idCaja
    `);
    res.json(result.rows);
  } catch (err) { handleDbError(res, err); }
});

app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    const { usuario, password, identidad, idrol, idCaja, estado } = req.body;
    const codUsuario = await generateNextId('usuarios', 'codUsuario', 'USR');
    // In production, hash password here
    await pool.query(
      `INSERT INTO usuarios (codUsuario, usuario, password, identidad, idrol, idCaja, estado, fechaCreacion) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [codUsuario, usuario, password, identidad, idrol, idCaja, estado]
    );
    res.status(201).json({ message: 'Usuario creado', id: codUsuario });
  } catch (err) { handleDbError(res, err); }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, password, identidad, idrol, idCaja, estado } = req.body;
    
    // Only update password if provided and not empty
    if (password && password.trim() !== '') {
         await pool.query(
            `UPDATE usuarios SET usuario=$1, password=$2, identidad=$3, idrol=$4, idCaja=$5, estado=$6, fechaModificacion=NOW() WHERE codUsuario=$7`,
            [usuario, password, identidad, idrol, idCaja, estado, id]
         );
    } else {
         await pool.query(
            `UPDATE usuarios SET usuario=$1, identidad=$2, idrol=$3, idCaja=$4, estado=$5, fechaModificacion=NOW() WHERE codUsuario=$6`,
            [usuario, identidad, idrol, idCaja, estado, id]
         );
    }
    res.json({ message: 'Usuario actualizado' });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM usuarios WHERE codUsuario=$1', [id]);
        res.json({ message: 'Usuario eliminado' });
    } catch (err) { handleDbError(res, err); }
});

// 2. EMPLEADOS
app.get('/api/empleados', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM empleado ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) { handleDbError(res, err); }
});

app.post('/api/empleados', authenticateToken, async (req, res) => {
    try {
        const { identidad, nombre, apellido, direccion, telefono, estado } = req.body;
        // Identidad is manual PK
        await pool.query(
            `INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono, estado, fechaCreacion) 
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [identidad, nombre, apellido, direccion, telefono, estado]
        );
        res.status(201).json({ message: 'Empleado creado' });
    } catch (err) { handleDbError(res, err); }
});

app.put('/api/empleados/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, apellido, direccion, telefono, estado } = req.body;
        await pool.query(
            `UPDATE empleado SET nombre=$1, apellido=$2, direccion=$3, telefono=$4, estado=$5, fechaModificacion=NOW() WHERE identidad=$6`,
            [nombre, apellido, direccion, telefono, estado, id]
        );
        res.json({ message: 'Empleado actualizado' });
    } catch (err) { handleDbError(res, err); }
});

app.delete('/api/empleados/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM empleado WHERE identidad=$1', [id]);
        res.json({ message: 'Empleado eliminado' });
    } catch (err) { handleDbError(res, err); }
});

// 3. ROLES
app.get('/api/roles', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM roles ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) { handleDbError(res, err); }
});

app.post('/api/roles', authenticateToken, async (req, res) => {
    try {
        const { nombre } = req.body;
        const idrol = await generateNextId('roles', 'idrol', 'ROL');
        await pool.query(`INSERT INTO roles (idrol, nombre, estado) VALUES ($1, $2, 'Activo')`, [idrol, nombre]);
        res.status(201).json({ message: 'Rol creado', id: idrol });
    } catch (err) { handleDbError(res, err); }
});

app.put('/api/roles/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, estado } = req.body;
        await pool.query(`UPDATE roles SET nombre=$1, estado=$2 WHERE idrol=$3`, [nombre, estado, id]);
        res.json({ message: 'Rol actualizado' });
    } catch (err) { handleDbError(res, err); }
});

app.delete('/api/roles/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM roles WHERE idrol=$1', [id]);
        res.json({ message: 'Rol eliminado' });
    } catch (err) { handleDbError(res, err); }
});

// 4. CAJAS
app.get('/api/cajas', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM caja ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) { handleDbError(res, err); }
});

app.post('/api/cajas', authenticateToken, async (req, res) => {
    try {
        const { nombre } = req.body;
        const idCaja = await generateNextId('caja', 'idCaja', 'CAJA');
        await pool.query(`INSERT INTO caja (idCaja, nombre, estado) VALUES ($1, $2, 'Activa')`, [idCaja, nombre]);
        res.status(201).json({ message: 'Caja creada', id: idCaja });
    } catch (err) { handleDbError(res, err); }
});

app.put('/api/cajas/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, estado } = req.body;
        await pool.query(`UPDATE caja SET nombre=$1, estado=$2 WHERE idCaja=$3`, [nombre, estado, id]);
        res.json({ message: 'Caja actualizada' });
    } catch (err) { handleDbError(res, err); }
});

app.delete('/api/cajas/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM caja WHERE idCaja=$1', [id]);
        res.json({ message: 'Caja eliminada' });
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
// VENTAS (POS) - TRANSACTIONAL & BATCHED
// ==========================================
app.post('/api/ventas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    // 1. Validate Input
    const { identidadCliente, tipoCompra, total, isv, descuento, detalles } = req.body;
    
    // IMPORTANT: Handle potentially undefined user ID or casing issues from Token
    const codUsuario = req.user.codUsuario || req.user.codusuario;

    if (!codUsuario) {
        console.error("❌ Session Error: codUsuario missing in token payload:", req.user);
        throw new Error("ID de usuario no encontrado en la sesión. Inicie sesión nuevamente.");
    }

    if (!detalles || detalles.length === 0) {
        throw new Error("No se enviaron detalles de venta");
    }

    await client.query('BEGIN');
    
    // Lock tables to ensure serial ID generation and prevent race conditions (double clicking invoice)
    // SHARE ROW EXCLUSIVE allows reading but prevents concurrent writing/modification which is perfect for ID generation
    await client.query('LOCK TABLE ventas IN SHARE ROW EXCLUSIVE MODE');
    await client.query('LOCK TABLE detalle_venta IN SHARE ROW EXCLUSIVE MODE');

    // 2. Create Header
    const codVenta = await generateNextId('ventas', 'codVenta', 'FACT', client);
    const fecha = new Date();
    
    // Explicitly cast numbers to ensure safety
    const safeTotal = Number(total) || 0;
    const safeIsv = Number(isv) || 0;
    const safeDescuento = Number(descuento) || 0;

    // CORRECCIÓN: Se agrega codvendedor y se mapea con codUsuario ($3)
    await client.query(
      `INSERT INTO ventas (codVenta, fecha, codUsuario, codvendedor, identidadCliente, tipoCompra, total, isv, descuento, estado)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, 'Completada')`,
      [codVenta, fecha, codUsuario, identidadCliente, tipoCompra, safeTotal, safeIsv, safeDescuento]
    );

    // 3. Process Details - BATCH ID GENERATION
    const startIdStr = await generateNextId('detalle_venta', 'codDetalleVenta', 'DET', client);
    let currentDetailIdNum = 1;
    
    if (startIdStr) {
       const parts = startIdStr.split('-');
       if(parts.length === 2 && /^\d+$/.test(parts[1])) {
           currentDetailIdNum = parseInt(parts[1], 10);
       }
    }

    for (const item of detalles) {
      const codDetalle = `DET-${currentDetailIdNum.toString().padStart(4, '0')}`;
      currentDetailIdNum++;

      await client.query(
        `INSERT INTO detalle_venta (codDetalleVenta, idVenta, idTelefono, idInventario, cantidad, precioVenta)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [codDetalle, codVenta, item.idTelefono || null, item.idInventario || null, item.cantidad, item.precioVenta]
      );

      // STOCK UPDATE
      if (item.idTelefono) {
        await client.query(
          "UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1",
          [item.idTelefono]
        );
      } else if (item.idInventario) {
        await client.query(
          "UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2",
          [item.cantidad, item.idInventario]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Venta procesada: ${codVenta}`);
    res.status(201).json({ message: 'Venta registrada con éxito', codVenta, fecha });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("❌ Error en Transacción Venta:", err.message);
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