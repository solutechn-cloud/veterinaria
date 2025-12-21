
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
const labelRoutes = require('./routes/labelRoutes');
const accountingRoutes = require('./routes/accountingRoutes');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// --- INICIALIZACIÓN BD ---
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

            CREATE TABLE IF NOT EXISTS label_templates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50) DEFAULT 'GENERAL', 
                type VARCHAR(50) DEFAULT 'LABEL', 
                data_source VARCHAR(50) DEFAULT 'NONE', 
                is_default BOOLEAN DEFAULT FALSE,
                width NUMERIC(10,2) NOT NULL,
                height NUMERIC(10,2) NOT NULL,
                elements JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS socios (
                id_socio SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                porcentaje_participacion NUMERIC(5,2) DEFAULT 0,
                estado VARCHAR(20) DEFAULT 'Activo',
                fecha_ingreso DATE DEFAULT CURRENT_DATE
            );

            CREATE TABLE IF NOT EXISTS costos (
                codCostos VARCHAR(100) PRIMARY KEY,
                tipo VARCHAR(50) NOT NULL,
                descripcion TEXT NOT NULL,
                monto NUMERIC(10,2) NOT NULL,
                estado VARCHAR(20) DEFAULT 'Activo'
            );

            CREATE TABLE IF NOT EXISTS config (
                id INTEGER PRIMARY KEY DEFAULT 1,
                nombreEmpresa VARCHAR(255),
                rtn VARCHAR(50),
                direccion TEXT,
                telefono VARCHAR(50),
                correo VARCHAR(100),
                cai VARCHAR(255),
                rangoInicial VARCHAR(100),
                rangoFinal VARCHAR(100),
                fechaLimite DATE,
                isv NUMERIC(5,2) DEFAULT 15,
                mensajeFinal TEXT,
                CONSTRAINT single_row CHECK (id = 1)
            );

            DO $$ 
            BEGIN 
                -- Columna para categorizar egresos
                BEGIN
                    ALTER TABLE egresos ADD COLUMN categoria VARCHAR(50) DEFAULT 'Gasto Operativo';
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                -- Columna para asignar gasto a un socio específico
                BEGIN
                    ALTER TABLE egresos ADD COLUMN id_socio_asignado INT REFERENCES socios(id_socio);
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                -- Columnas de balance en arqueo
                BEGIN
                    ALTER TABLE arqueo ADD COLUMN saldoTigoFinal NUMERIC(10,2) DEFAULT 0;
                    ALTER TABLE arqueo ADD COLUMN saldoClaroFinal NUMERIC(10,2) DEFAULT 0;
                    ALTER TABLE arqueo ADD COLUMN totalCostos NUMERIC(10,2) DEFAULT 0;
                    ALTER TABLE arqueo ADD COLUMN TotalGastos NUMERIC(10,2) DEFAULT 0;
                    ALTER TABLE arqueo ADD COLUMN ganancia NUMERIC(10,2) DEFAULT 0;
                EXCEPTION WHEN duplicate_column THEN NULL; END;
            END $$;
        `);
    } catch (err) { console.error("Error init DB:", err); }
};
initDB();

// --- MONTAJE DE RUTAS ---
app.use('/api', adminRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', salesRoutes);
app.use('/api', financeRoutes);
app.use('/api', reportsRoutes);
app.use('/api', labelRoutes); 
app.use('/api/accounting', accountingRoutes);

// --- AUTH ROUTE ---
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
    
    let validPassword = (userRaw.password === password) || (userRaw.password && userRaw.password.startsWith('$2a$') && await bcrypt.compare(password, userRaw.password));
    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const permResult = await pool.query(`SELECT idPermiso FROM rol_permisos WHERE idRol = $1`, [userRaw.idrol]);
    const permisos = permResult.rows.map(r => r.idpermiso);

    const userData = { 
      codUsuario: userRaw.codUsuario, 
      usuario: userRaw.usuario, 
      rol: userRaw.rol_nombre || 'Sin Rol', 
      idCaja: userRaw.idCaja || 'Sin Caja',
      nombreEmpleado: userRaw.emp_nombre ? `${userRaw.emp_nombre} ${userRaw.emp_apellido}` : 'Empleado',
      permisos: permisos
    };

    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: userData });
  } catch (err) { res.status(500).json({ error: 'Error interno' }); }
});

app.use(express.static(path.join(__dirname, 'build')));
app.use('/api', (req, res) => res.status(404).json({ error: `API Route not found: ${req.originalUrl}` }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'build', 'index.html')));

app.listen(port, () => console.log(`SmartCloud running on port ${port}`));
