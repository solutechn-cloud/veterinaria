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

pool.connect((err, client, release) => {
  if (err) return console.error('❌ Error fatal conectando a BD:', err.stack);
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) return console.error('❌ Error ejecutando query de prueba', err.stack);
    console.log('✅ Conexión exitosa a PostgreSQL:', result.rows[0]);
  });
});

// --- MIDDLEWARE DE SEGURIDAD ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- SETUP & INSTALL ENDPOINTS (AUTO-FIX) ---

app.get('/api/setup/install', async (req, res) => {
  try {
    const schema = `
      -- TABLA ROLES
      CREATE TABLE IF NOT EXISTS roles (
          idrol varchar(100) PRIMARY KEY,
          nombre varchar(50) NOT NULL,
          estado varchar(20) NOT NULL DEFAULT 'Activo'
      );
      
      -- TABLA CAJA
      CREATE TABLE IF NOT EXISTS caja (
          idCaja varchar(100) PRIMARY KEY,
          nombre varchar(50) NOT NULL,
          estado varchar(50) NOT NULL DEFAULT 'Activa'
      );

      -- TABLA EMPLEADO
      CREATE TABLE IF NOT EXISTS empleado (
          identidad varchar(20) PRIMARY KEY,
          nombre varchar(30) NOT NULL,
          apellido varchar(30) NOT NULL,
          direccion varchar(100) NOT NULL,
          telefono varchar(20) NOT NULL,
          estado varchar(20) NOT NULL DEFAULT 'Activo',
          fechaCreacion timestamp NOT NULL,
          fechaModificacion timestamp
      );

      -- TABLA USUARIOS
      CREATE TABLE IF NOT EXISTS usuarios (
          codUsuario varchar(100) PRIMARY KEY,
          usuario varchar(100) NOT NULL,
          password varchar(100) NOT NULL,
          identidad varchar(20) NOT NULL,
          idCaja varchar(100) NOT NULL,
          idrol varchar(100) NOT NULL,
          foto bytea,
          fechaCreacion timestamp NOT NULL,
          fechaModificacion timestamp,
          estado varchar(20) NOT NULL DEFAULT 'Activo',
          CONSTRAINT fk_empleado FOREIGN KEY (identidad) REFERENCES empleado(identidad),
          CONSTRAINT fk_caja FOREIGN KEY (idCaja) REFERENCES caja(idCaja),
          CONSTRAINT fk_rol FOREIGN KEY (idrol) REFERENCES roles(idrol)
      );

      -- TABLA CLIENTES (Para que no falle el POS)
      CREATE TABLE IF NOT EXISTS clientes (
          identidad varchar(20) PRIMARY KEY,
          nombre varchar(30) NOT NULL,
          apellido varchar(30) NOT NULL,
          direccion varchar(100) NOT NULL,
          telefono varchar(20) NOT NULL,
          correo varchar(50),
          fechaCreacion timestamp NOT NULL,
          fechaModificacion timestamp
      );
    `;
    
    await pool.query(schema);
    res.send(`
      <h1 style="color:green">✅ Tablas Maestras Creadas Correctamente</h1>
      <p>La estructura de la base de datos ha sido inicializada.</p>
      <p>Ahora ve a <a href="/api/setup/seed">/api/setup/seed</a> para insertar el usuario administrador.</p>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send(`<h1>❌ Error creando tablas</h1><pre>${err.stack}</pre>`);
  }
});

app.get('/api/setup/seed', async (req, res) => {
  try {
    // 1. Roles
    await pool.query(`INSERT INTO roles (idrol, nombre) VALUES ('ROL-ADMIN', 'Administrador') ON CONFLICT (idrol) DO NOTHING`);
    await pool.query(`INSERT INTO roles (idrol, nombre) VALUES ('ROL-VEND', 'Vendedor') ON CONFLICT (idrol) DO NOTHING`);

    // 2. Caja
    await pool.query(`INSERT INTO caja (idCaja, nombre) VALUES ('CAJA-001', 'Caja Principal') ON CONFLICT (idCaja) DO NOTHING`);

    // 3. Empleado
    await pool.query(`
      INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono, fechaCreacion) 
      VALUES ('0606200201168', 'Super', 'Admin', 'Oficina', '99999999', NOW()) 
      ON CONFLICT (identidad) DO NOTHING
    `);

    // 4. Usuario (Encriptado por si acaso, aunque el endpoint de login soporta plano)
    // Pass: cadenas21
    const passHash = await bcrypt.hash('cadenas21', 10);
    
    // Insertamos si no existe
    const userCheck = await pool.query("SELECT * FROM usuarios WHERE usuario = 'alvcd21'");
    if (userCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO usuarios (codUsuario, usuario, password, identidad, idCaja, idrol, fechaCreacion) 
        VALUES ('USER-001', 'alvcd21', $1, '0606200201168', 'CAJA-001', 'ROL-ADMIN', NOW())
      `, [passHash]);
      res.send(`<h1 style="color:green">✅ Datos Semilla Insertados</h1><p>Usuario: <b>alvcd21</b><br>Pass: <b>cadenas21</b></p><a href="/">Ir al Login</a>`);
    } else {
      res.send(`<h1 style="color:orange">⚠️ El usuario ya existe</h1><p>Intenta hacer login.</p><a href="/">Ir al Login</a>`);
    }

  } catch (err) {
    console.error(err);
    res.status(500).send(`<h1>❌ Error insertando datos</h1><pre>${err.stack}</pre>`);
  }
});

// --- AUTH ENDPOINTS ---

app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  console.log(`🔹 Intento de login para usuario: ${usuario}`);

  try {
    // IMPORTANTE: Quitamos las comillas en los nombres de columnas para evitar
    // errores de case-sensitivity en Postgres. Postgres devuelve todo en minúsculas por defecto.
    const query = `
      SELECT 
        u.codUsuario, u.usuario, u.password, u.estado,
        r.nombre as rol_nombre, 
        e.nombre as emp_nombre, e.apellido as emp_apellido
      FROM usuarios u
      JOIN roles r ON u.idrol = r.idrol
      JOIN empleado e ON u.identidad = e.identidad
      WHERE u.usuario = $1
    `;
    
    const result = await pool.query(query, [usuario]);
    
    // Postgres devuelve las claves en minúsculas si no se citaron en el CREATE TABLE.
    // Usamos ?. para evitar crash si devuelve null
    const userRaw = result.rows[0];

    if (!userRaw) {
      console.warn('⚠️ Usuario no encontrado en BD');
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    if (userRaw.estado !== 'Activo') {
       console.warn('⚠️ Usuario inactivo');
       return res.status(401).json({ error: 'Usuario inactivo' });
    }

    // Verificar password
    let validPassword = false;
    const storedPass = userRaw.password;

    if (storedPass.startsWith('$2a$')) {
      validPassword = await bcrypt.compare(password, storedPass);
    } else {
      // Fallback para contraseñas viejas sin encriptar
      validPassword = (storedPass === password);
    }

    if (!validPassword) {
      console.warn('⚠️ Contraseña incorrecta');
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Mapeo seguro de datos para el Frontend (CamelCase manual)
    const userData = {
        codUsuario: userRaw.codusuario || userRaw.codUsuario, // Check both cases
        usuario: userRaw.usuario,
        rol: userRaw.rol_nombre,
        nombreEmpleado: `${userRaw.emp_nombre} ${userRaw.emp_apellido}`
    };

    console.log('✅ Login exitoso:', userData.usuario, userData.rol);

    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '12h' });

    res.json({
      token,
      user: userData
    });

  } catch (err) {
    console.error('❌ Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor (Revisar logs)' });
  }
});

// --- ADMIN USERS ENDPOINTS ---

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    // Quitamos comillas para evitar conflictos de case
    const query = `
      SELECT u.codUsuario, u.usuario, u.identidad, u.idCaja, u.idrol, u.estado,
             e.nombre || ' ' || e.apellido as nombreEmpleado,
             r.nombre as nombreRol
      FROM usuarios u
      JOIN empleado e ON u.identidad = e.identidad
      JOIN roles r ON u.idrol = r.idrol
      ORDER BY u.usuario ASC
    `;
    const result = await pool.query(query);
    res.json(result.rows.map(row => ({
        codUsuario: row.codusuario,
        usuario: row.usuario,
        identidad: row.identidad,
        idCaja: row.idcaja,
        idrol: row.idrol,
        estado: row.estado,
        nombreEmpleado: row.nombreempleado,
        nombreRol: row.nombrerol
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    const { codUsuario, usuario, password, identidad, idCaja, idrol } = req.body;
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const fecha = new Date();

    const query = `
      INSERT INTO usuarios (codUsuario, usuario, password, identidad, idCaja, idrol, fechaCreacion, estado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Activo')
    `;
    
    await pool.query(query, [codUsuario, usuario, hashedPassword, identidad, idCaja, idrol, fecha]);
    res.status(201).json({ message: 'Usuario creado exitosamente' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando usuario' });
  }
});

app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM roles WHERE estado = 'Activo'");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo roles' });
  }
});

app.get('/api/empleados', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM empleado WHERE estado = 'Activo'");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo empleados' });
  }
});

app.get('/api/cajas', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM caja WHERE estado = 'Activa'");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo cajas' });
  }
});

// --- CORE ENDPOINTS (Protected) ---

app.get('/api/productos/unificados', authenticateToken, async (req, res) => {
  try {
    // Fallback vacio si no hay tablas
    const check = await pool.query("SELECT to_regclass('public.telefonos')");
    if (!check.rows[0].to_regclass) return res.json([]);

    const query = `
      SELECT 
        t.codigo as id, 'TELEFONO' as tipo, CONCAT(t.marca, ' ', t.modelo) as nombre,
        t.codigo, t.precioVenta, CASE WHEN t.estado = 'Disponible' THEN 1 ELSE 0 END as stock,
        t.imei1 as imei, u.nombre as ubicacion
      FROM telefonos t
      LEFT JOIN ubicacion u ON t.idubicacion = u.idUbicacion
      WHERE t.estado = 'Disponible'
      UNION ALL
      SELECT 
        a.codAccesorio as id, 'ACCESORIO' as tipo, a.descripcion as nombre,
        a.codAccesorio as codigo, i.precioVenta, i.cantidad as stock,
        NULL as imei, u.nombre as ubicacion
      FROM inventario i
      JOIN accesorios a ON i.codAccesorio = a.codAccesorio
      LEFT JOIN ubicacion u ON i.idubicacion = u.idUbicacion
      WHERE i.estado = 'Activo'
    `;
    const result = await pool.query(query);
    res.json(result.rows.map(r => ({
      ...r,
      precioVenta: parseFloat(r.precioventa)
    })));
  } catch (err) {
    console.error(err);
    res.json([]); // Return empty on error to avoid breaking UI
  }
});

app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) {
    // Si no existe tabla, devolver array vacio
    res.json([]);
  }
});

// --- SERVIR FRONTEND ---
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`SmartCloud Server running on port ${port}`);
});