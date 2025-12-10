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

// --- HELPER: GENERADOR DE IDs ---
async function generateNextId(table, column, prefix) {
  try {
    // Busca el último ID que coincida con el prefijo
    const query = `
      SELECT ${column} as id 
      FROM ${table} 
      WHERE ${column} LIKE '${prefix}-%' 
      ORDER BY LENGTH(${column}) DESC, ${column} DESC 
      LIMIT 1
    `;
    const result = await pool.query(query);
    
    if (result.rows.length === 0) {
      return `${prefix}-0001`;
    }

    const lastId = result.rows[0].id; 
    const numberPart = lastId.split('-')[1]; 
    const nextNumber = parseInt(numberPart, 10) + 1; 
    
    const paddedNumber = nextNumber.toString().padStart(4, '0'); 
    return `${prefix}-${paddedNumber}`;
  } catch (err) {
    console.error(`Error generando ID para ${table}:`, err);
    throw err;
  }
}

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

// --- AUTH ENDPOINTS ---
app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  console.log(`🔹 Intento de login para usuario: ${usuario}`);

  try {
    // PostgreSQL column alias to handle case sensitivity
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
    // Postgres returns lowercase keys if aliases aren't quoted, but here we used aliases like rol_nombre
    const userRaw = result.rows[0];

    if (!userRaw) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (userRaw.estado !== 'Activo') return res.status(401).json({ error: 'Usuario inactivo' });

    let validPassword = false;
    const storedPass = userRaw.password;

    if (storedPass.startsWith('$2a$')) {
      validPassword = await bcrypt.compare(password, storedPass);
    } else {
      validPassword = (storedPass === password);
    }

    if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas' });

    const userData = {
        codUsuario: userRaw.codusuario || userRaw.codUsuario, 
        usuario: userRaw.usuario,
        rol: userRaw.rol_nombre,
        nombreEmpleado: `${userRaw.emp_nombre} ${userRaw.emp_apellido}`
    };

    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '12h' });

    res.json({ token, user: userData });

  } catch (err) {
    console.error('❌ Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- ADMIN: USUARIOS ---

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT u.codUsuario, u.usuario, u.identidad, u.idCaja, u.idrol, u.estado,
             e.nombre || ' ' || e.apellido as nombreEmpleado,
             r.nombre as nombreRol, c.nombre as nombreCaja
      FROM usuarios u
      JOIN empleado e ON u.identidad = e.identidad
      JOIN roles r ON u.idrol = r.idrol
      JOIN caja c ON u.idCaja = c.idCaja
      ORDER BY u.usuario ASC
    `;
    const result = await pool.query(query);
    
    // MAPEO IMPORTANTE: Postgres devuelve minúsculas (codusuario, idcaja), React espera CamelCase
    const mappedUsers = result.rows.map(row => ({
        codUsuario: row.codusuario,
        usuario: row.usuario,
        identidad: row.identidad,
        idCaja: row.idcaja,
        idrol: row.idrol,
        estado: row.estado,
        nombreEmpleado: row.nombreempleado,
        nombreRol: row.nombrerol,
        nombreCaja: row.nombrecaja
    }));

    res.json(mappedUsers);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    const { usuario, password, identidad, idCaja, idrol } = req.body;
    
    // Validar datos básicos
    if (!idCaja || !idrol || !identidad) {
       return res.status(400).json({ error: "Faltan datos obligatorios (Caja, Rol o Empleado)" });
    }

    const codUsuario = await generateNextId('usuarios', 'codUsuario', 'USER');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const fecha = new Date();

    const query = `
      INSERT INTO usuarios (codUsuario, usuario, password, identidad, idCaja, idrol, fechaCreacion, estado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Activo')
    `;
    
    await pool.query(query, [codUsuario, usuario, hashedPassword, identidad, idCaja, idrol, fecha]);
    res.status(201).json({ message: 'Usuario creado', id: codUsuario });
  } catch (err) {
    console.error('Error creating user:', err);
    // Devuelve el mensaje real del error SQL (ej: null value in column "idCaja")
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE usuarios SET estado = $1 WHERE codUsuario = $2', [status, req.params.id]);
    res.json({ message: 'Estado actualizado' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: EMPLEADOS ---

app.get('/api/empleados', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM empleado ORDER BY nombre ASC");
    // Mapeo manual para evitar problemas de minúsculas
    const empleados = result.rows.map(row => ({
      identidad: row.identidad,
      nombre: row.nombre,
      apellido: row.apellido,
      direccion: row.direccion,
      telefono: row.telefono,
      estado: row.estado,
      fechaCreacion: row.fechacreacion
    }));
    res.json(empleados);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo empleados' });
  }
});

app.post('/api/empleados', authenticateToken, async (req, res) => {
  try {
    const { identidad, nombre, apellido, direccion, telefono } = req.body;
    const query = `
      INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono, fechaCreacion, estado)
      VALUES ($1, $2, $3, $4, $5, NOW(), 'Activo')
    `;
    await pool.query(query, [identidad, nombre, apellido, direccion, telefono]);
    res.status(201).json({ message: 'Empleado creado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: CAJAS ---

app.get('/api/cajas', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM caja ORDER BY idCaja ASC");
    // Mapeo manual crítico para los selects del frontend
    const cajas = result.rows.map(row => ({
      idCaja: row.idcaja, // Postgres devuelve idcaja (minúsculas)
      nombre: row.nombre,
      estado: row.estado
    }));
    res.json(cajas);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo cajas' });
  }
});

app.post('/api/cajas', authenticateToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    const idCaja = await generateNextId('caja', 'idCaja', 'CAJA');
    
    await pool.query("INSERT INTO caja (idCaja, nombre, estado) VALUES ($1, $2, 'Activa')", [idCaja, nombre]);
    res.status(201).json({ message: 'Caja creada', id: idCaja });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cajas/:id', authenticateToken, async (req, res) => {
  try {
    const { nombre, estado } = req.body;
    await pool.query("UPDATE caja SET nombre=$1, estado=$2 WHERE idCaja=$3", [nombre, estado, req.params.id]);
    res.json({ message: 'Caja actualizada' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: ROLES ---

app.get('/api/roles', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM roles ORDER BY idrol ASC");
    const roles = result.rows.map(row => ({
      idrol: row.idrol, // Postgres devuelve idrol
      nombre: row.nombre,
      estado: row.estado
    }));
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo roles' });
  }
});

app.post('/api/roles', authenticateToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    const idrol = await generateNextId('roles', 'idrol', 'ROL');
    
    await pool.query("INSERT INTO roles (idrol, nombre, estado) VALUES ($1, $2, 'Activo')", [idrol, nombre]);
    res.status(201).json({ message: 'Rol creado', id: idrol });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- SETUP & INSTALL UTILS ---
app.get('/api/setup/install', async (req, res) => {
  try {
    // 1. Crear Tabla Roles
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        idrol varchar(100) PRIMARY KEY,
        nombre varchar(50) NOT NULL,
        estado varchar(20) NOT NULL DEFAULT 'Activo'
      );
    `);

    // 2. Crear Tabla Caja
    await pool.query(`
      CREATE TABLE IF NOT EXISTS caja (
        idCaja varchar(100) PRIMARY KEY,
        nombre varchar(50) NOT NULL,
        estado varchar(50) NOT NULL DEFAULT 'Activa'
      );
    `);

    // 3. Crear Tabla Empleado
    await pool.query(`
      CREATE TABLE IF NOT EXISTS empleado (
          identidad varchar(20) PRIMARY KEY,
          nombre varchar(30) NOT NULL,
          apellido varchar(30) NOT NULL,
          direccion varchar(100) NOT NULL,
          telefono varchar(20) NOT NULL,
          estado varchar(20) NOT NULL DEFAULT 'Activo',
          fechaCreacion timestamp NOT NULL DEFAULT NOW(),
          fechaModificacion timestamp
      );
    `);

    // 4. Crear Tabla Usuarios
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
          codUsuario varchar(100) PRIMARY KEY,
          usuario varchar(100) NOT NULL,
          password varchar(100) NOT NULL,
          identidad varchar(20) NOT NULL,
          idCaja varchar(100) NOT NULL,
          idrol varchar(100) NOT NULL,
          foto bytea,
          fechaCreacion timestamp NOT NULL DEFAULT NOW(),
          fechaModificacion timestamp,
          estado varchar(20) NOT NULL DEFAULT 'Activo',
          CONSTRAINT fk_empleado FOREIGN KEY (identidad) REFERENCES empleado(identidad),
          CONSTRAINT fk_caja FOREIGN KEY (idCaja) REFERENCES caja(idCaja),
          CONSTRAINT fk_rol FOREIGN KEY (idrol) REFERENCES roles(idrol)
      );
    `);

    res.send('✅ Tablas Maestras Creadas (Roles, Caja, Empleado, Usuarios)');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creando tablas: ' + err.message);
  }
});

app.get('/api/setup/seed', async (req, res) => {
  try {
    // Verificar si existen datos
    const check = await pool.query('SELECT * FROM usuarios');
    if (check.rows.length > 0) return res.send('⚠️ Ya existen usuarios, seed omitido.');

    // 1. Roles
    await pool.query("INSERT INTO roles (idrol, nombre) VALUES ('ROL-ADMIN', 'Administrador') ON CONFLICT DO NOTHING");
    await pool.query("INSERT INTO roles (idrol, nombre) VALUES ('ROL-VEND', 'Vendedor') ON CONFLICT DO NOTHING");

    // 2. Caja
    await pool.query("INSERT INTO caja (idCaja, nombre) VALUES ('CAJA-001', 'Caja Principal') ON CONFLICT DO NOTHING");

    // 3. Empleado Admin
    await pool.query(`
      INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono) 
      VALUES ('0606200201168', 'Super', 'Admin', 'Oficina', '99999999') 
      ON CONFLICT DO NOTHING
    `);

    // 4. Usuario Admin (Pass: cadenas21)
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('cadenas21', salt);
    
    await pool.query(`
      INSERT INTO usuarios (codUsuario, usuario, password, identidad, idCaja, idrol)
      VALUES ('USER-001', 'alvcd21', $1, '0606200201168', 'CAJA-001', 'ROL-ADMIN')
    `, [hash]);

    res.send('✅ Datos Semilla Insertados Correctamente');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en seed: ' + err.message);
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