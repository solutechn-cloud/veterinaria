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
    // Ej: SELECT codUsuario FROM usuarios WHERE codUsuario LIKE 'USER-%' ORDER BY LENGTH(codUsuario) DESC, codUsuario DESC LIMIT 1
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

    const lastId = result.rows[0].id; // Ej: USER-0045
    const numberPart = lastId.split('-')[1]; // 0045
    const nextNumber = parseInt(numberPart, 10) + 1; // 46
    
    // Rellenar con ceros a la izquierda (pad)
    const paddedNumber = nextNumber.toString().padStart(4, '0'); // 0046
    
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
    res.json(result.rows.map(row => ({
        codUsuario: row.codusuario,
        usuario: row.usuario,
        identidad: row.identidad,
        idCaja: row.idcaja,
        idrol: row.idrol,
        estado: row.estado,
        nombreEmpleado: row.nombreempleado,
        nombreRol: row.nombrerol,
        nombreCaja: row.nombrecaja
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    const { usuario, password, identidad, idCaja, idrol } = req.body;
    
    // Generar ID USER-XXXX
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
    console.error(err);
    res.status(500).json({ error: 'Error creando usuario' });
  }
});

app.put('/api/users/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body; // 'Activo' o 'Inactivo'
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
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo empleados' });
  }
});

app.post('/api/empleados', authenticateToken, async (req, res) => {
  try {
    const { identidad, nombre, apellido, direccion, telefono } = req.body;
    // Empleado usa Identidad como PK, no generamos ID
    const query = `
      INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono, fechaCreacion, estado)
      VALUES ($1, $2, $3, $4, $5, NOW(), 'Activo')
    `;
    await pool.query(query, [identidad, nombre, apellido, direccion, telefono]);
    res.status(201).json({ message: 'Empleado creado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando empleado' });
  }
});

app.put('/api/empleados/:id', authenticateToken, async (req, res) => {
  try {
    const { nombre, apellido, direccion, telefono, estado } = req.body;
    const query = `
      UPDATE empleado 
      SET nombre=$1, apellido=$2, direccion=$3, telefono=$4, estado=$5, fechaModificacion=NOW()
      WHERE identidad=$6
    `;
    await pool.query(query, [nombre, apellido, direccion, telefono, estado, req.params.id]);
    res.json({ message: 'Empleado actualizado' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: CAJAS ---

app.get('/api/cajas', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM caja ORDER BY idCaja ASC");
    res.json(result.rows);
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
    res.json(result.rows);
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

// --- OTROS ENDPOINTS (Productos, Clientes, Arqueo) ---
// Se mantienen los anteriores...

app.get('/api/setup/install', async (req, res) => {
  // ... (Mismo código de install que tenías, asegurando que las tablas existen)
  res.send('Tablas instaladas (ver logs para detalles)');
});

app.get('/api/setup/seed', async (req, res) => {
    // ... (Mismo seed básico)
    res.send('Seed ejecutado');
});

// --- SERVIR FRONTEND ---
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`SmartCloud Server running on port ${port}`);
});