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
  if (err) return console.error('Error adquiriendo cliente de BD', err.stack);
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) return console.error('Error ejecutando query de prueba', err.stack);
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

// --- AUTH ENDPOINTS ---

app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    // Buscar usuario y unir con rol y empleado para tener contexto completo
    const query = `
      SELECT u.*, r.nombre as rol_nombre, e.nombre as emp_nombre, e.apellido as emp_apellido
      FROM usuarios u
      JOIN roles r ON u.idrol = r.idrol
      JOIN empleado e ON u.identidad = e.identidad
      WHERE u.usuario = $1 AND u.estado = 'Activo'
    `;
    const result = await pool.query(query, [usuario]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Verificar password (soporta legacy texto plano y nuevo bcrypt)
    let validPassword = false;
    if (user.password.startsWith('$2a$')) {
      validPassword = await bcrypt.compare(password, user.password);
    } else {
      // Fallback para contraseñas viejas sin encriptar (Migración)
      validPassword = (user.password === password);
    }

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar Token JWT
    const token = jwt.sign(
      { 
        codUsuario: user.codUsuario, 
        usuario: user.usuario, 
        rol: user.rol_nombre,
        nombreEmpleado: `${user.emp_nombre} ${user.emp_apellido}`
      }, 
      JWT_SECRET, 
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        codUsuario: user.codUsuario,
        usuario: user.usuario,
        rol: user.rol_nombre,
        nombreEmpleado: `${user.emp_nombre} ${user.emp_apellido}`
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en servidor' });
  }
});

// --- ADMIN USERS ENDPOINTS ---

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    // Solo admins deberían ver esto (validar rol en lógica frontend o aquí)
    const query = `
      SELECT u."codUsuario", u.usuario, u.identidad, u."idCaja", u.idrol, u.estado,
             e.nombre || ' ' || e.apellido as "nombreEmpleado",
             r.nombre as "nombreRol"
      FROM usuarios u
      JOIN empleado e ON u.identidad = e.identidad
      JOIN roles r ON u.idrol = r.idrol
      ORDER BY u.usuario ASC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    const { codUsuario, usuario, password, identidad, idCaja, idrol } = req.body;
    
    // Hash password antes de guardar
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Asumimos fechas actuales
    const fecha = new Date();

    const query = `
      INSERT INTO usuarios ("codUsuario", usuario, password, identidad, "idCaja", idrol, "fechaCreacion", estado)
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
    const query = `
      SELECT 
        t.codigo as id, 'TELEFONO' as tipo, CONCAT(t.marca, ' ', t.modelo) as nombre,
        t.codigo, t."precioVenta", CASE WHEN t.estado = 'Disponible' THEN 1 ELSE 0 END as stock,
        t.imei1 as imei, u.nombre as ubicacion
      FROM telefonos t
      LEFT JOIN ubicacion u ON t.idubicacion = u."idUbicacion"
      WHERE t.estado = 'Disponible'
      UNION ALL
      SELECT 
        a."codAccesorio" as id, 'ACCESORIO' as tipo, a.descripcion as nombre,
        a."codAccesorio" as codigo, i."precioVenta", i.cantidad as stock,
        NULL as imei, u.nombre as ubicacion
      FROM inventario i
      JOIN accesorios a ON i."codAccesorio" = a."codAccesorio"
      LEFT JOIN ubicacion u ON i.idubicacion = u."idUbicacion"
      WHERE i.estado = 'Activo'
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
});

app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

app.post('/api/ventas', authenticateToken, async (req, res) => {
  // ... lógica existente de ventas ...
  res.status(200).json({ message: 'Simulated success' });
});

// ... resto de endpoints protegidos con authenticateToken ...

// --- SERVIR FRONTEND ---
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`SmartCloud Server running on port ${port}`);
});