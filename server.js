
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Configs y Middleware
const { pool } = require('./config/db');
const { authenticateToken, JWT_SECRET } = require('./middleware/auth');

// Rutas Modulares
const adminRoutes = require('./routes/adminRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const salesRoutes = require('./routes/salesRoutes');
const financeRoutes = require('./routes/financeRoutes');
const reportsRoutes = require('./routes/reportsRoutes');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- INICIALIZACIÓN BD (Tablas Nuevas) ---
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS paquetes (
                idPaquete varchar(100) PRIMARY KEY,
                red varchar(20) NOT NULL,
                nombre varchar(100) NOT NULL,
                precio numeric(10,2) NOT NULL,
                costo numeric(10,2) NOT NULL,
                estado varchar(20) NOT NULL DEFAULT 'Activo'
            );
        `);
    } catch (err) { console.error("Error init DB:", err); }
};
initDB();

// --- AUTH ROUTE (Login) ---
app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const query = `
      SELECT u.codUsuario as "codUsuario", u.usuario, u.password, u.identidad, u.idCaja as "idCaja", u.idrol, u.estado,
        r.nombre as "rol_nombre", e.nombre as "emp_nombre", e.apellido as "emp_apellido"
      FROM usuarios u
      LEFT JOIN roles r ON u.idrol = r.idrol
      LEFT JOIN empleado e ON u.identidad = e.identidad
      WHERE u.usuario = $1
    `;
    const result = await pool.query(query, [usuario]);
    const userRaw = result.rows[0];

    if (!userRaw) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (userRaw.estado && userRaw.estado.toLowerCase() !== 'activo') return res.status(401).json({ error: 'El usuario está inactivo' });
    
    let validPassword = false;
    if (userRaw.password && userRaw.password.startsWith('$2a$')) {
        validPassword = await bcrypt.compare(password, userRaw.password);
    } else {
        validPassword = (userRaw.password === password);
    }

    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const permResult = await pool.query(`SELECT idPermiso FROM rol_permisos WHERE idRol = $1`, [userRaw.idrol]);
    const permisos = permResult.rows.map(r => r.idpermiso);

    const userData = { 
      codUsuario: userRaw.codUsuario, 
      usuario: userRaw.usuario, 
      rol: userRaw.rol_nombre || 'Sin Rol', 
      idCaja: userRaw.idCaja || 'Sin Caja',
      nombreEmpleado: userRaw.emp_nombre ? `${userRaw.emp_nombre} ${userRaw.emp_apellido}` : 'Empleado Desconocido',
      permisos: permisos
    };

    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: userData });

  } catch (err) { 
    console.error(err);
    res.status(500).json({ error: 'Error interno en login' }); 
  }
});

// --- MONTAJE DE RUTAS ---
app.use('/api', adminRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', salesRoutes);
app.use('/api', financeRoutes);
app.use('/api', reportsRoutes);

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'build', 'index.html')); });

app.listen(port, () => {
  console.log(`SmartCloud Server running on port ${port} (Modular Mode)`);
});
