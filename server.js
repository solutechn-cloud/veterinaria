
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
const serviceRoutes = require('./routes/serviceRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Configuración CORS restrictiva en producción
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : null;

app.use(cors({
    origin: allowedOrigins
        ? (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin)) cb(null, true);
            else cb(new Error('CORS: origen no permitido'));
          }
        : true,
    credentials: true,
}));

// Cabeceras de seguridad
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

app.use(express.json({ limit: '10mb' }));

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

            CREATE TABLE IF NOT EXISTS configuracion (
                id INTEGER PRIMARY KEY DEFAULT 1,
                nombreempresa VARCHAR(255),
                rtn VARCHAR(50),
                direccion TEXT,
                telefono VARCHAR(50),
                correo VARCHAR(100),
                cai VARCHAR(255),
                rangoinicial VARCHAR(100),
                rangofinal VARCHAR(100),
                fechalimite DATE,
                isv NUMERIC(5,2) DEFAULT 15,
                mensajefinal TEXT,
                CONSTRAINT single_row CHECK (id = 1)
            );

            DO $$ 
            BEGIN 
                -- MIGRACIÓN VENTAS (COLUMNAS FALTANTES)
                BEGIN
                    ALTER TABLE ventas ADD COLUMN idCaja VARCHAR(100);
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                BEGIN
                    ALTER TABLE ventas ADD COLUMN monto_prima NUMERIC(10,2) DEFAULT 0;
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                BEGIN
                    ALTER TABLE ventas ADD COLUMN monto_financiamiento NUMERIC(10,2) DEFAULT 0;
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                BEGIN
                    ALTER TABLE detalleventa ADD COLUMN tipoProducto VARCHAR(20);
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                BEGIN
                    ALTER TABLE egresos ADD COLUMN categoria VARCHAR(50) DEFAULT 'Gasto Operativo';
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                BEGIN
                    ALTER TABLE egresos ADD COLUMN id_socio_asignado INT REFERENCES socios(id_socio);
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                BEGIN
                    ALTER TABLE arqueo ADD COLUMN saldoTigoFinal NUMERIC(10,2) DEFAULT 0;
                    ALTER TABLE arqueo ADD COLUMN saldoClaroFinal NUMERIC(10,2) DEFAULT 0;
                    ALTER TABLE arqueo ADD COLUMN totalCostos NUMERIC(10,2) DEFAULT 0;
                    ALTER TABLE arqueo ADD COLUMN TotalGastos NUMERIC(10,2) DEFAULT 0;
                    ALTER TABLE arqueo ADD COLUMN ganancia NUMERIC(10,2) DEFAULT 0;
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                BEGIN
                    ALTER TABLE usuarios ADD COLUMN requires_password_change BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN duplicate_column THEN NULL; END;

                -- INTENTO DE AMPLIAR ENUMS SI EXISTEN
                BEGIN
                    ALTER TYPE subtipo_movimiento_contable ADD VALUE IF NOT EXISTS 'Ajuste Utilidad Cambio';
                    ALTER TYPE subtipo_egreso_contable ADD VALUE IF NOT EXISTS 'Perdida Margen Garantia';
                EXCEPTION WHEN OTHERS THEN NULL; END;

                -- MIGRACIÓN: Columnas de seguridad en usuarios
                BEGIN ALTER TABLE usuarios ADD COLUMN ultimo_login TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE usuarios ADD COLUMN intentos_fallidos INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE usuarios ADD COLUMN bloqueado_hasta TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE usuarios ADD COLUMN password_changed_at TIMESTAMPTZ DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END;

                -- MIGRACIÓN: Columnas de auditoría
                BEGIN ALTER TABLE ventas ADD COLUMN updated_at TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE ventas ADD COLUMN updated_by VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE telefonos ADD COLUMN updated_at TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE telefonos ADD COLUMN updated_by VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE inventario ADD COLUMN updated_at TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE inventario ADD COLUMN updated_by VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;

                -- MIGRACIÓN: Descuento con autorización
                BEGIN ALTER TABLE ventas ADD COLUMN descuento_autorizado_por VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE ventas ADD COLUMN descuento_motivo TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;

                -- MIGRACIÓN: FK técnico en reparaciones
                BEGIN ALTER TABLE reparaciones ADD COLUMN identidad_tecnico VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;

                -- MIGRACIÓN: Logo empresa en configuración
                BEGIN ALTER TABLE configuracion ADD COLUMN logo_base64 TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
            END $$;
        `);

        // Crear tablas nuevas (escalabilidad y auditoría)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS login_intentos (
                id          BIGSERIAL PRIMARY KEY,
                usuario     VARCHAR(100) NOT NULL,
                ip_address  TEXT,
                exitoso     BOOLEAN NOT NULL,
                fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                user_agent  TEXT
            );

            CREATE TABLE IF NOT EXISTS notificaciones (
                id              BIGSERIAL PRIMARY KEY,
                tipo            VARCHAR(50) NOT NULL,
                titulo          VARCHAR(255) NOT NULL,
                cuerpo          TEXT,
                para_usuario    VARCHAR(100),
                leida           BOOLEAN DEFAULT FALSE,
                fecha_creacion  TIMESTAMPTZ DEFAULT NOW(),
                fecha_lectura   TIMESTAMPTZ,
                referencia_id   TEXT,
                referencia_tabla VARCHAR(100)
            );

            CREATE TABLE IF NOT EXISTS kardex_inventario (
                id              BIGSERIAL PRIMARY KEY,
                tipo_producto   VARCHAR(20) NOT NULL,
                cod_telefono    VARCHAR(100),
                cod_inventario  VARCHAR(100),
                tipo_movimiento VARCHAR(50) NOT NULL,
                cantidad        INTEGER NOT NULL,
                precio_costo    NUMERIC(10,2),
                precio_venta    NUMERIC(10,2),
                referencia_doc  VARCHAR(100),
                fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                registrado_por  VARCHAR(100),
                observaciones   TEXT
            );

            CREATE TABLE IF NOT EXISTS pagos_venta (
                id_pago         SERIAL PRIMARY KEY,
                cod_venta       VARCHAR(100) NOT NULL,
                monto           NUMERIC(10,2) NOT NULL,
                fecha_pago      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                metodo_pago     VARCHAR(50) NOT NULL,
                referencia      VARCHAR(255),
                idCaja          VARCHAR(100),
                registrado_por  VARCHAR(100),
                notas           TEXT
            );

            CREATE TABLE IF NOT EXISTS configuracion_cai_historial (
                id              SERIAL PRIMARY KEY,
                cai             VARCHAR(255) NOT NULL,
                rangoinicial    VARCHAR(100) NOT NULL,
                rangofinal      VARCHAR(100) NOT NULL,
                fechalimite     DATE NOT NULL,
                fecha_registro  TIMESTAMPTZ DEFAULT NOW(),
                registrado_por  VARCHAR(100)
            );

            -- Índices para tablas nuevas
            CREATE INDEX IF NOT EXISTS idx_login_usuario   ON login_intentos(usuario, fecha DESC);
            CREATE INDEX IF NOT EXISTS idx_login_ip        ON login_intentos(ip_address, fecha DESC);
            CREATE INDEX IF NOT EXISTS idx_notif_usuario   ON notificaciones(para_usuario, leida, fecha_creacion DESC);
            CREATE INDEX IF NOT EXISTS idx_kardex_fecha    ON kardex_inventario(fecha DESC);
            CREATE INDEX IF NOT EXISTS idx_kardex_invref   ON kardex_inventario(cod_inventario, fecha DESC);
            CREATE INDEX IF NOT EXISTS idx_kardex_telref   ON kardex_inventario(cod_telefono, fecha DESC);

            -- Índices en tablas existentes (mejora de rendimiento)
            CREATE INDEX IF NOT EXISTS idx_ventas_fecha       ON ventas(fecha DESC);
            CREATE INDEX IF NOT EXISTS idx_ventas_cliente     ON ventas(identidadCliente);
            CREATE INDEX IF NOT EXISTS idx_ventas_caja_fecha  ON ventas(idCaja, fecha DESC);
            CREATE INDEX IF NOT EXISTS idx_detalle_venta      ON detalleventa(idVenta);
            CREATE INDEX IF NOT EXISTS idx_telefonos_imei1    ON telefonos(imei1);
            CREATE INDEX IF NOT EXISTS idx_telefonos_estado   ON telefonos(estado);
            CREATE INDEX IF NOT EXISTS idx_inventario_acc     ON inventario(codAccesorio);
            CREATE INDEX IF NOT EXISTS idx_clientes_nombre    ON clientes(nombre, apellido);
            CREATE INDEX IF NOT EXISTS idx_rep_estado         ON reparaciones(estado_reparacion);
            CREATE INDEX IF NOT EXISTS idx_ingresos_caja      ON ingresos(idCaja, fechaCreacion DESC);
            CREATE INDEX IF NOT EXISTS idx_egresos_caja       ON egresos(idCaja, fechaCreacion DESC);
        `);

        console.log("DB Initialization and Migrations complete.");
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
app.use('/api', serviceRoutes);

// --- AUTH ROUTE ---
app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  if (!usuario || !password) return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';

  try {
    const query = `
      SELECT u.codUsuario as "codUsuario", u.usuario, u.password, u.identidad, u.idCaja as "idCaja",
             u.idrol, u.estado, u.bloqueado_hasta as "bloqueadoHasta",
             COALESCE(u.requires_password_change, FALSE) as "requiresPasswordChange",
             r.nombre as "rol_nombre", e.nombre as "emp_nombre", e.apellido as "emp_apellido"
      FROM usuarios u
      LEFT JOIN roles r ON u.idrol = r.idrol
      LEFT JOIN empleado e ON u.identidad = e.identidad
      WHERE u.usuario = $1
    `;
    const result = await pool.query(query, [usuario]);
    const userRaw = result.rows[0];

    // Respuesta genérica para no revelar si el usuario existe (evita enumeración)
    if (!userRaw) {
        await _registrarIntentoLogin(usuario, false, clientIp, req.headers['user-agent']);
        return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Verificar si está bloqueado
    if (userRaw.bloqueadoHasta && new Date(userRaw.bloqueadoHasta) > new Date()) {
        const minutosRestantes = Math.ceil((new Date(userRaw.bloqueadoHasta) - new Date()) / 60000);
        return res.status(429).json({
            error: `Cuenta bloqueada temporalmente. Intente de nuevo en ${minutosRestantes} minuto(s).`
        });
    }

    if (userRaw.estado !== 'Activo') {
        return res.status(403).json({ error: 'Cuenta inactiva. Contacte al administrador.' });
    }

    // Verificar contraseña SOLO con bcrypt (eliminar comparación en texto plano)
    const validPassword = userRaw.password?.startsWith('$2a$') || userRaw.password?.startsWith('$2b$')
        ? await bcrypt.compare(password, userRaw.password)
        : false;

    if (!validPassword) {
        await _registrarIntentoLogin(usuario, false, clientIp, req.headers['user-agent']);
        return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Login exitoso
    await _registrarIntentoLogin(usuario, true, clientIp, req.headers['user-agent']);

    const permResult = await pool.query(`SELECT idPermiso FROM rol_permisos WHERE idRol = $1`, [userRaw.idrol]);
    const permisos = permResult.rows.map(r => r.idpermiso);

    const userData = {
      codUsuario: userRaw.codUsuario,
      usuario: userRaw.usuario,
      rol: userRaw.rol_nombre || 'Sin Rol',
      idCaja: userRaw.idCaja || 'Sin Caja',
      nombreEmpleado: userRaw.emp_nombre ? `${userRaw.emp_nombre} ${userRaw.emp_apellido}` : 'Empleado',
      permisos,
      requiresPasswordChange: userRaw.requiresPasswordChange || false
    };

    const REFRESH_SECRET = process.env.REFRESH_SECRET || (JWT_SECRET + '_refresh');
    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '8h' });
    const refreshToken = jwt.sign(
      { codUsuario: userData.codUsuario, tokenType: 'refresh' },
      REFRESH_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token, refreshToken, user: userData });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Registrar intento de login (usa SP sp_registrar_intento_login con fallback)
async function _registrarIntentoLogin(usuario, exitoso, ip, userAgent) {
    const safeIp = (ip && ip !== '::1' && ip !== '::ffff:127.0.0.1') ? ip : '127.0.0.1';
    try {
        const spRes = await pool.query(
            `SELECT sp_registrar_intento_login($1, $2, $3::inet, $4) AS resultado`,
            [usuario, exitoso, safeIp, userAgent || null]
        );
        const resultado = spRes.rows[0]?.resultado;
        // Si el SP bloqueó al usuario, log para auditoría
        if (resultado && resultado.bloqueado) {
            console.warn(`Usuario bloqueado por intentos fallidos: ${usuario} desde IP ${safeIp}`);
        }
    } catch (spErr) {
        // Fallback: insertar en login_intentos + actualizar estado en usuarios
        try {
            await pool.query(
                `INSERT INTO login_intentos(usuario, ip_address, exitoso, user_agent)
                 VALUES ($1, $2::inet, $3, $4)`,
                [usuario, safeIp, exitoso, userAgent || null]
            );
            if (!exitoso) {
                await pool.query(
                    `UPDATE usuarios SET intentos_fallidos = COALESCE(intentos_fallidos, 0) + 1
                     WHERE usuario = $1`,
                    [usuario]
                );
            } else {
                await pool.query(
                    `UPDATE usuarios SET intentos_fallidos = 0, ultimo_login = NOW()
                     WHERE usuario = $1`,
                    [usuario]
                );
            }
        } catch (fallbackErr) {
            console.error('Error registrando intento de login:', fallbackErr.message);
        }
    }
}

app.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token requerido' });
  try {
    const REFRESH_SECRET = process.env.REFRESH_SECRET || (JWT_SECRET + '_refresh');
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    if (decoded.tokenType !== 'refresh') return res.status(403).json({ error: 'Token inválido' });

    const query = `
      SELECT u.codUsuario as "codUsuario", u.usuario, u.identidad, u.idCaja as "idCaja", u.idrol, u.estado,
        r.nombre as "rol_nombre", e.nombre as "emp_nombre", e.apellido as "emp_apellido"
      FROM usuarios u
      LEFT JOIN roles r ON u.idrol = r.idrol
      LEFT JOIN empleado e ON u.identidad = e.identidad
      WHERE u.codUsuario = $1 AND u.estado = 'Activo'
    `;
    const result = await pool.query(query, [decoded.codUsuario]);
    const userRaw = result.rows[0];
    if (!userRaw) return res.status(403).json({ error: 'Usuario no encontrado o inactivo' });

    const permResult = await pool.query('SELECT idPermiso FROM rol_permisos WHERE idRol = $1', [userRaw.idrol]);
    const permisos = permResult.rows.map(r => r.idpermiso);

    const userData = {
      codUsuario: userRaw.codUsuario,
      usuario: userRaw.usuario,
      rol: userRaw.rol_nombre || 'Sin Rol',
      idCaja: userRaw.idCaja || 'Sin Caja',
      nombreEmpleado: userRaw.emp_nombre ? `${userRaw.emp_nombre} ${userRaw.emp_apellido}` : 'Empleado',
      permisos,
    };
    const newToken = jwt.sign(userData, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token: newToken, user: userData });
  } catch (err) {
    res.status(403).json({ error: 'Refresh token inválido o expirado' });
  }
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Se requieren contraseña actual y nueva' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  // Validar complejidad mínima (al menos una mayúscula y un número)
  if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return res.status(400).json({ error: 'La contraseña debe contener al menos una mayúscula y un número' });
  }
  try {
    const result = await pool.query('SELECT password FROM usuarios WHERE codUsuario = $1', [req.user.codUsuario]);
    const userRaw = result.rows[0];
    if (!userRaw) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Solo bcrypt - sin comparación en texto plano
    const valid = userRaw.password?.startsWith('$2a$') || userRaw.password?.startsWith('$2b$')
        ? await bcrypt.compare(currentPassword, userRaw.password)
        : false;
    if (!valid) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });

    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query(
        `UPDATE usuarios SET password = $1, requires_password_change = FALSE,
         password_changed_at = NOW() WHERE codUsuario = $2`,
        [hashed, req.user.codUsuario]
    );
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'build', 'index.html')));

app.listen(port, () => console.log(`SmartCloud running on port ${port}`));
