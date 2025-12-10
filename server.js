
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'smartcloud_secret_key';

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: false }
});

// --- HELPER: GENERADOR DE IDs ---
async function generateNextId(table, column, prefix, client = pool) {
  try {
    const query = `
      SELECT ${column} as id 
      FROM ${table} 
      WHERE ${column} LIKE '${prefix}-%' 
      ORDER BY LENGTH(${column}) DESC, ${column} DESC 
      LIMIT 1
    `;
    const result = await client.query(query);
    
    let maxNum = 0;
    if(result.rows.length > 0) {
      const parts = result.rows[0].id.split(`${prefix}-`);
      if (parts.length === 2 && /^\d+$/.test(parts[1])) {
        maxNum = parseInt(parts[1], 10);
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
  if (err.code === '23505') return res.status(409).json({ error: 'El registro ya existe.' });
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

// --- AUTH (CORREGIDO CON BCRYPT) ---
app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const query = `
      SELECT 
        u.codUsuario as "codUsuario",
        u.usuario,
        u.password,
        u.identidad,
        u.idCaja as "idCaja",
        u.idrol,
        u.estado,
        r.nombre as "rol_nombre",
        e.nombre as "emp_nombre",
        e.apellido as "emp_apellido"
      FROM usuarios u
      LEFT JOIN roles r ON u.idrol = r.idrol
      LEFT JOIN empleado e ON u.identidad = e.identidad
      WHERE u.usuario = $1
    `;
    const result = await pool.query(query, [usuario]);
    const userRaw = result.rows[0];

    if (!userRaw) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    if (userRaw.estado && userRaw.estado.toLowerCase() !== 'activo') {
      return res.status(401).json({ error: 'El usuario está inactivo' });
    }
    
    // Validar contraseña (Soporte Híbrido: Bcrypt o Texto Plano para migración)
    let validPassword = false;
    
    // Si la contraseña en DB empieza con $2a, $2b o $2y, es un hash bcrypt
    if (userRaw.password && (userRaw.password.startsWith('$2a$') || userRaw.password.startsWith('$2b$') || userRaw.password.startsWith('$2y$'))) {
        validPassword = await bcrypt.compare(password, userRaw.password);
    } else {
        // Fallback para contraseñas antiguas en texto plano
        const dbPass = userRaw.password ? userRaw.password.trim() : '';
        const inputPass = password ? password.trim() : '';
        validPassword = (dbPass === inputPass);
    }

    if (!validPassword) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Obtener Permisos del Rol
    const permQuery = `SELECT idPermiso FROM rol_permisos WHERE idRol = $1`;
    const permResult = await pool.query(permQuery, [userRaw.idrol]);
    const permisos = permResult.rows.map(r => r.idpermiso); // PG returns lowercase keys

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
    console.error("Login Error Catch:", err);
    res.status(500).json({ error: 'Error interno en login' }); 
  }
});

// ==========================================
// ROLES Y PERMISOS
// ==========================================

app.get('/api/permisos', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT idPermiso as "idPermiso", nombre, modulo FROM permisos ORDER BY modulo, nombre');
    res.json(r.rows);
  } catch(e) { handleDbError(res, e); }
});

app.get('/api/roles', authenticateToken, async (req, res) => { 
  try { 
    const rolesResult = await pool.query('SELECT idrol, nombre, estado FROM roles ORDER BY idrol');
    const roles = rolesResult.rows;

    for (let rol of roles) {
        const pResult = await pool.query('SELECT idPermiso FROM rol_permisos WHERE idRol = $1', [rol.idrol]);
        rol.permisos = pResult.rows.map(r => r.idpermiso);
    }

    res.json(roles); 
  } catch(e){ handleDbError(res,e) } 
});

app.post('/api/roles', authenticateToken, async (req, res) => { 
  const client = await pool.connect();
  try {
    const { nombre, permisos } = req.body;
    await client.query('BEGIN');
    
    const idrol = await generateNextId('roles', 'idrol', 'ROL', client);
    await client.query('INSERT INTO roles (idrol, nombre, estado) VALUES ($1, $2, $3)', [idrol, nombre, 'Activo']);

    if (permisos && Array.isArray(permisos)) {
        for (const p of permisos) {
            await client.query('INSERT INTO rol_permisos (idRol, idPermiso) VALUES ($1, $2)', [idrol, p]);
        }
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Rol Creado', idrol });
  } catch(e) { 
    await client.query('ROLLBACK');
    handleDbError(res,e) 
  } finally {
    client.release();
  }
});

app.put('/api/roles/:id', authenticateToken, async (req, res) => { 
    const client = await pool.connect();
    try {
        const { nombre, estado, permisos } = req.body;
        const idRol = req.params.id;
        
        await client.query('BEGIN');
        
        await client.query('UPDATE roles SET nombre=$1, estado=$2 WHERE idrol=$3', [nombre, estado, idRol]);
        
        await client.query('DELETE FROM rol_permisos WHERE idRol=$1', [idRol]);
        
        if (permisos && Array.isArray(permisos)) {
            for (const p of permisos) {
                await client.query('INSERT INTO rol_permisos (idRol, idPermiso) VALUES ($1, $2)', [idRol, p]);
            }
        }
        
        await client.query('COMMIT');
        res.json({ message: 'Rol Actualizado' }); 
    } catch(e) { 
        await client.query('ROLLBACK');
        handleDbError(res,e) 
    } finally {
        client.release();
    }
});

app.delete('/api/roles/:id', authenticateToken, async (req, res) => { 
    try { 
        await pool.query('DELETE FROM roles WHERE idrol=$1', [req.params.id]); 
        res.json({ message: 'Rol eliminado' }); 
    } catch(e){ handleDbError(res,e) } 
});

// ==========================================
// CAJAS, CLIENTES, PROVEEDORES, EMPLEADOS
// ==========================================
app.get('/api/users', authenticateToken, async (req, res) => { 
    try { 
        const r = await pool.query(`
            SELECT u.codUsuario as "codUsuario", u.usuario, u.identidad, u.idCaja as "idCaja", u.idrol, u.estado,
                   e.nombre || ' ' || e.apellido as "nombreEmpleado", 
                   r.nombre as "nombreRol", 
                   c.nombre as "nombreCaja" 
            FROM usuarios u 
            LEFT JOIN empleado e ON u.identidad = e.identidad 
            LEFT JOIN roles r ON u.idrol = r.idrol 
            LEFT JOIN caja c ON u.idCaja = c.idCaja
        `); 
        res.json(r.rows); 
    } catch(e){handleDbError(res,e)} 
});

app.post('/api/users', authenticateToken, async (req, res) => { 
  try { 
    const { usuario, password, identidad, idrol, idCaja, estado } = req.body;
    const id = await generateNextId('usuarios', 'codUsuario', 'US');
    
    // Encriptar contraseña antes de guardar
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO usuarios VALUES($1,$2,$3,$4,$5,$6,NULL,NOW(),NULL,$7)',
      [id, usuario, hashedPassword, identidad, idCaja, idrol, estado]
    ); 
    res.json({ message: 'Usuario creado' }); 
  } catch(e){ handleDbError(res,e) } 
});

app.put('/api/users/:id', authenticateToken, async (req, res) => { 
  try { 
    const { usuario, password, identidad, idrol, idCaja, estado } = req.body;
    
    if (password && password.trim() !== '') {
       // Si envían contraseña, encriptarla
       const hashedPassword = await bcrypt.hash(password, 10);
       await pool.query(
         'UPDATE usuarios SET usuario=$1, password=$2, identidad=$3, idrol=$4, idCaja=$5, estado=$6 WHERE codUsuario=$7',
         [usuario, hashedPassword, identidad, idrol, idCaja, estado, req.params.id]
       );
    } else {
       await pool.query(
         'UPDATE usuarios SET usuario=$1, identidad=$2, idrol=$3, idCaja=$4, estado=$5 WHERE codUsuario=$6',
         [usuario, identidad, idrol, idCaja, estado, req.params.id]
       ); 
    } 
    res.json({ message: 'Usuario actualizado' }); 
  } catch(e){ handleDbError(res,e) } 
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => { try { await pool.query('DELETE FROM usuarios WHERE codUsuario=$1',[req.params.id]); res.json({}); } catch(e){handleDbError(res,e)} });

app.get('/api/empleados', authenticateToken, async (req, res) => { 
    try { 
        const r = await pool.query('SELECT identidad, nombre, apellido, direccion, telefono, estado FROM empleado'); 
        res.json(r.rows); 
    } catch(e){handleDbError(res,e)} 
});
app.post('/api/empleados', authenticateToken, async (req, res) => { 
    try { 
        const {identidad,nombre,apellido,direccion,telefono,estado}=req.body; 
        await pool.query('INSERT INTO empleado VALUES($1,$2,$3,$4,$5,$6,NOW())',[identidad,nombre,apellido,direccion,telefono,estado]); 
        res.json({message:'Creado'}); 
    } catch(e){handleDbError(res,e)} 
});
app.put('/api/empleados/:id', authenticateToken, async (req, res) => { try { const {nombre,apellido,direccion,telefono,estado}=req.body; await pool.query('UPDATE empleado SET nombre=$1, apellido=$2, direccion=$3, telefono=$4, estado=$5 WHERE identidad=$6',[nombre,apellido,direccion,telefono,estado,req.params.id]); res.json({}); } catch(e){handleDbError(res,e)} });
app.delete('/api/empleados/:id', authenticateToken, async (req, res) => { try { await pool.query('DELETE FROM empleado WHERE identidad=$1',[req.params.id]); res.json({}); } catch(e){handleDbError(res,e)} });

app.get('/api/cajas', authenticateToken, async (req, res) => { try { const r = await pool.query('SELECT idCaja as "idCaja", nombre, estado FROM caja'); res.json(r.rows); } catch(e){handleDbError(res,e)} });
app.post('/api/cajas', authenticateToken, async (req, res) => { 
    try { 
        const id = await generateNextId('caja','idCaja','CAJA'); 
        await pool.query('INSERT INTO caja (idCaja, nombre, estado) VALUES ($1,$2,$3)', [id, req.body.nombre, 'Activa']); 
        res.json({ message: 'Caja Creada' }); 
    } catch(e){handleDbError(res,e)} 
});
app.put('/api/cajas/:id', authenticateToken, async (req, res) => { try { const {nombre,estado}=req.body; await pool.query('UPDATE caja SET nombre=$1, estado=$2 WHERE idCaja=$3',[nombre,estado,req.params.id]); res.json({message:'Caja Actualizada'}); } catch(e){handleDbError(res,e)} });
app.delete('/api/cajas/:id', authenticateToken, async (req, res) => { try { await pool.query('DELETE FROM caja WHERE idCaja=$1',[req.params.id]); res.json({message:'Caja Eliminada'}); } catch(e){handleDbError(res,e)} });

app.get('/api/clientes', authenticateToken, async (req, res) => { try { const r = await pool.query('SELECT identidad, nombre, apellido, direccion, telefono, correo, fechaCreacion as "fechaCreacion" FROM clientes'); res.json(r.rows); } catch(e){handleDbError(res,e)} });
app.post('/api/clientes', authenticateToken, async (req, res) => { try { const {identidad,nombre,apellido,direccion,telefono,correo}=req.body; await pool.query('INSERT INTO clientes (identidad,nombre,apellido,direccion,telefono,correo,fechaCreacion) VALUES($1,$2,$3,$4,$5,$6,NOW())',[identidad,nombre,apellido,direccion,telefono,correo]); res.json({message:'Creado'}); } catch(e){handleDbError(res,e)} });
app.put('/api/clientes/:id', authenticateToken, async (req, res) => { try { const {nombre,apellido,direccion,telefono,correo}=req.body; await pool.query('UPDATE clientes SET nombre=$1, apellido=$2, direccion=$3, telefono=$4, correo=$5 WHERE identidad=$6',[nombre,apellido,direccion,telefono,correo,req.params.id]); res.json({}); } catch(e){handleDbError(res,e)} });
app.delete('/api/clientes/:id', authenticateToken, async (req, res) => { try { await pool.query('DELETE FROM clientes WHERE identidad=$1',[req.params.id]); res.json({}); } catch(e){handleDbError(res,e)} });

app.get('/api/proveedores', authenticateToken, async (req, res) => { try { const r = await pool.query('SELECT codProveedor as "codProveedor", nombre, telefono, direccion FROM proveedores'); res.json(r.rows); } catch(e){handleDbError(res,e)} });
app.post('/api/proveedores', authenticateToken, async (req, res) => { try { const id = await generateNextId('proveedores','codProveedor','PROV'); const {nombre,telefono,direccion}=req.body; await pool.query('INSERT INTO proveedores (codProveedor,nombre,telefono,direccion,fechaCreacion) VALUES($1,$2,$3,$4,NOW())',[id,nombre,telefono,direccion]); res.json({}); } catch(e){handleDbError(res,e)} });
app.put('/api/proveedores/:id', authenticateToken, async (req, res) => { try { const {nombre,telefono,direccion}=req.body; await pool.query('UPDATE proveedores SET nombre=$1, telefono=$2, direccion=$3 WHERE codProveedor=$4',[nombre,telefono,direccion,req.params.id]); res.json({}); } catch(e){handleDbError(res,e)} });
app.delete('/api/proveedores/:id', authenticateToken, async (req, res) => { try { await pool.query('DELETE FROM proveedores WHERE codProveedor=$1',[req.params.id]); res.json({}); } catch(e){handleDbError(res,e)} });

// COSTOS
app.get('/api/costos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT codCostos as "codCostos", tipo, descripcion, monto, estado 
      FROM costos 
      ORDER BY codCostos DESC
    `);
    res.json(result.rows);
  } catch(e) { handleDbError(res,e); }
});

app.post('/api/costos', authenticateToken, async (req, res) => {
  try {
    const { tipo, descripcion, monto, estado } = req.body;
    const codCostos = await generateNextId('costos', 'codCostos', 'COST');
    await pool.query(
      'INSERT INTO costos (codCostos, tipo, descripcion, monto, estado) VALUES ($1, $2, $3, $4, $5)',
      [codCostos, tipo, descripcion, monto, estado || 'Activo']
    );
    res.status(201).json({ message: 'Costo registrado', codCostos });
  } catch(e) { handleDbError(res,e); }
});

app.put('/api/costos/:id', authenticateToken, async (req, res) => {
  try {
    const { tipo, descripcion, monto, estado } = req.body;
    await pool.query(
      'UPDATE costos SET tipo=$1, descripcion=$2, monto=$3, estado=$4 WHERE codCostos=$5',
      [tipo, descripcion, monto, estado, req.params.id]
    );
    res.json({ message: 'Costo actualizado' });
  } catch(e) { handleDbError(res,e); }
});

app.delete('/api/costos/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM costos WHERE codCostos=$1', [req.params.id]);
    res.json({ message: 'Costo eliminado' });
  } catch(e) { handleDbError(res,e); }
});

// CAJA Y ARQUEO
app.get('/api/arqueo/active', authenticateToken, async (req, res) => {
  try {
    const { idCaja } = req.user;
    const result = await pool.query(
      `SELECT 
        idArqueo as "idArqueo", 
        idCaja as "idCaja", 
        idUsuario as "idUsuario", 
        fechaApertura as "fechaApertura", 
        montoInicial as "montoInicial", 
        estado 
       FROM arqueo 
       WHERE idCaja = $1 AND estado = 'Activo' 
       ORDER BY fechaApertura DESC LIMIT 1`,
      [idCaja]
    );
    res.json(result.rows[0] || null);
  } catch(err) { handleDbError(res, err); }
});

app.get('/api/saldos/today', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha 
      FROM saldos 
      WHERE fecha = $1
    `, [today]);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/arqueo/open', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { montoInicial, saldoTigoInicial, saldoClaroInicial } = req.body;
    const { codUsuario, idCaja } = req.user;
    
    const check = await client.query(`SELECT * FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
    if (check.rows.length > 0) return res.status(400).json({ error: 'Caja ya abierta.' });

    await client.query('BEGIN');
    const idArqueo = await generateNextId('arqueo', 'idArqueo', 'ARQ', client);
    await client.query(
      `INSERT INTO arqueo (idArqueo, idCaja, idUsuario, fechaApertura, montoInicial, estado)
       VALUES ($1, $2, $3, NOW(), $4, 'Activo')`,
      [idArqueo, idCaja, codUsuario, montoInicial]
    );

    const today = new Date().toISOString().split('T')[0];
    const checkSaldos = await client.query('SELECT * FROM saldos WHERE fecha = $1', [today]);
    
    if (checkSaldos.rows.length === 0) {
      const idSaldoTigo = await generateNextId('saldos', 'idsaldos', 'SAL', client);
      const idSaldoClaroNum = parseInt(idSaldoTigo.split('-')[1]) + 1;
      const idSaldoClaro = `SAL-${idSaldoClaroNum.toString().padStart(4,'0')}`;

      await client.query(
        `INSERT INTO saldos (idsaldos, red, saldoInicio, fecha) VALUES ($1, 'TIGO', $2, $3)`,
        [idSaldoTigo, saldoTigoInicial || 0, today]
      );
      await client.query(
        `INSERT INTO saldos (idsaldos, red, saldoInicio, fecha) VALUES ($1, 'CLARO', $2, $3)`,
        [idSaldoClaro, saldoClaroInicial || 0, today]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Caja Aperturada', idArqueo });
  } catch(err) { 
    await client.query('ROLLBACK');
    handleDbError(res, err); 
  } finally {
    client.release();
  }
});

app.post('/api/arqueo/close', authenticateToken, async (req, res) => {
  try {
     const { idArqueo } = req.body;
     await pool.query(`UPDATE arqueo SET estado = 'Cerrada', fechaCierre = NOW() WHERE idArqueo = $1`, [idArqueo]);
     res.json({ message: 'Caja Cerrada' });
  } catch(err) { handleDbError(res, err); }
});

app.get('/api/ingresos', authenticateToken, async (req, res) => {
  const { idCaja } = req.query;
  try {
    const result = await pool.query(`
      SELECT idIngreso as "idIngreso", idCaja as "idCaja", descripcion, monto, costo, fechaCreacion as "fechaCreacion", estado 
      FROM ingresos 
      WHERE idCaja = $1 
      ORDER BY fechaCreacion DESC LIMIT 100`, [idCaja]);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/ingresos', authenticateToken, async (req, res) => {
  try {
    const { descripcion, monto, costo } = req.body;
    const { idCaja } = req.user;
    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR');
    
    await pool.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) 
       VALUES ($1, $2, $3, $4, $5, NOW(), 'Registrado')`,
      [idIngreso, idCaja, descripcion, monto, costo || 0]
    );
    res.status(201).json({ message: 'Ingreso registrado', idIngreso });
  } catch(err) { handleDbError(res, err); }
});

app.get('/api/egresos', authenticateToken, async (req, res) => {
  const { idCaja } = req.query;
  try {
    const result = await pool.query(`
      SELECT idegresos as "idegresos", idCaja as "idCaja", descripcion, monto, fechaCreacion as "fechaCreacion", estado 
      FROM egresos 
      WHERE idCaja = $1 
      ORDER BY fechaCreacion DESC LIMIT 100`, [idCaja]);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/egresos', authenticateToken, async (req, res) => {
  try {
    const { descripcion, monto } = req.body;
    const { idCaja } = req.user;
    const idegresos = await generateNextId('egresos', 'idegresos', 'EGRE');
    
    await pool.query(
      `INSERT INTO egresos (idegresos, idCaja, descripcion, monto, fechaCreacion, estado) 
       VALUES ($1, $2, $3, $4, NOW(), 'Registrado')`,
      [idegresos, idCaja, descripcion, monto]
    );
    res.status(201).json({ message: 'Egreso registrado', idegresos });
  } catch(err) { handleDbError(res, err); }
});

app.post('/api/recargas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { red, tipo, descripcion, precioCobrado, precioPagado } = req.body;
    const { idCaja } = req.user;

    await client.query('BEGIN');

    const idIngreso = await generateNextId('ingresos', 'idIngreso', 'INGR', client);
    await client.query(
      `INSERT INTO ingresos (idIngreso, idCaja, descripcion, monto, costo, fechaCreacion, estado) 
       VALUES ($1, $2, $3, $4, $5, NOW(), 'Registrado')`,
      [idIngreso, idCaja, `RECARGA ${red}: ${descripcion}`, precioCobrado, precioPagado]
    );

    const idRecargas = await generateNextId('recargas', 'idRecargas', 'REC', client);
    await client.query(
      `INSERT INTO recargas (idRecargas, red, tipo, descripcion, precioCobrado, precioPagado, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'Completada')`,
      [idRecargas, red, tipo, descripcion, precioCobrado, precioPagado]
    );

    const today = new Date().toISOString().split('T')[0];
    await client.query(`
      UPDATE saldos 
      SET saldoFinal = COALESCE(saldoFinal, saldoInicio) - $1 
      WHERE red = $2 AND fecha = $3
    `, [precioPagado, red, today]);

    await client.query('COMMIT');
    res.status(201).json({ message: 'Recarga exitosa' });
  } catch(err) {
    await client.query('ROLLBACK');
    handleDbError(res, err);
  } finally {
    client.release();
  }
});

// INVENTARIO
app.get('/api/productos/unificados', authenticateToken, async (req, res) => {
  try {
      const r = await pool.query(`
        SELECT codigo as id, 'TELEFONO' as tipo, (marca || ' ' || modelo) as nombre, codigo, precioventa as "precioVenta", 1 as stock, imei1 as imei, idubicacion as ubicacion 
        FROM telefonos WHERE estado = 'Disponible' 
        UNION ALL 
        SELECT i.codInventario as id, 'ACCESORIO' as tipo, a.descripcion as nombre, i.codInventario as codigo, i.precioVenta as "precioVenta", i.cantidad as stock, NULL as imei, i.idubicacion as ubicacion 
        FROM inventario i 
        JOIN accesorios a ON i.codAccesorio = a.codAccesorio 
        WHERE i.estado = 'Activo' AND i.cantidad > 0
      `);
      res.json(r.rows);
  } catch(e) { handleDbError(res,e) }
});

app.get('/api/inventory/accesorios-master', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT a.codAccesorio as "codAccesorio", a.codCategoria as "codCategoria", a.descripcion, c.tipo as "nombreCategoria" 
      FROM accesorios a 
      JOIN categoria c ON a.codCategoria = c.codCategoria
    `);
    res.json(r.rows);
  } catch(e){handleDbError(res,e)} 
});
app.post('/api/inventory/accesorios-master', authenticateToken, async (req, res) => {
  try {
    const { codCategoria, descripcion } = req.body;
    const codAccesorio = await generateNextId('accesorios', 'codAccesorio', 'ACC');
    await pool.query('INSERT INTO accesorios VALUES ($1, $2, $3)', [codAccesorio, codCategoria, descripcion]);
    res.json({ message: 'Creado' });
  } catch(e){handleDbError(res,e)} 
});

app.get('/api/inventory/stock', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT i.codInventario as "codInventario", i.codAccesorio as "codAccesorio", i.cantidad, i.precioCompra as "precioCompra", i.precioVenta as "precioVenta", i.codProveedor as "codProveedor", i.fecha, i.idubicacion, i.estado,
             a.descripcion as "descripcionAccesorio", u.nombre as "nombreUbicacion" 
      FROM inventario i 
      JOIN accesorios a ON i.codAccesorio = a.codAccesorio
      JOIN ubicacion u ON i.idubicacion = u.idUbicacion
    `);
    res.json(r.rows);
  } catch(e){handleDbError(res,e)} 
});
app.post('/api/inventory/stock', authenticateToken, async (req, res) => {
  try {
    const { codAccesorio, cantidad, precioCompra, precioVenta, codProveedor, idubicacion, estado } = req.body;
    const codInventario = await generateNextId('inventario', 'codInventario', 'INV');
    await pool.query(
      'INSERT INTO inventario VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8)', 
      [codInventario, codAccesorio, cantidad, precioCompra, precioVenta, codProveedor, idubicacion, estado]
    );
    res.json({ message: 'Stock Agregado' });
  } catch(e){handleDbError(res,e)} 
});

app.get('/api/inventory/telefonos', authenticateToken, async (req,res) => { 
  try{
    const r=await pool.query(`
      SELECT t.codigo, t.imei1, t.imei2, t.marca, t.modelo, t.precioCompra as "precioCompra", t.precioVenta as "precioVenta", t.codProveedor as "codProveedor", t.fecha, t.idubicacion, t.estado,
             u.nombre as "nombreUbicacion" 
      FROM telefonos t 
      LEFT JOIN ubicacion u ON t.idubicacion=u.idUbicacion 
      ORDER BY t.codigo DESC
    `);
    res.json(r.rows)
  }catch(e){handleDbError(res,e)}
});
app.post('/api/inventory/telefonos', authenticateToken, async (req, res) => {
  try {
    const { imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, idubicacion } = req.body;
    const codigo = await generateNextId('telefonos', 'codigo', 'TEL');
    await pool.query(
      `INSERT INTO telefonos (codigo, imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, fecha, idubicacion, estado) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,'Disponible')`,
      [codigo, imei1, imei2, marca, modelo, precioCompra, precioVenta, codProveedor, idubicacion]
    );
    res.json({ message: 'Telefono creado' });
  } catch(e){handleDbError(res,e)}
});

app.get('/api/inventory/categorias', authenticateToken, async (req, res) => { try { const r = await pool.query('SELECT codCategoria as "codCategoria", tipo FROM categoria'); res.json(r.rows); } catch(e){handleDbError(res,e)} });
app.post('/api/inventory/categorias', authenticateToken, async (req, res) => { try { const id = await generateNextId('categoria','codCategoria','CAT'); await pool.query('INSERT INTO categoria VALUES($1,$2)',[id,req.body.tipo]); res.json({}); } catch(e){handleDbError(res,e)} });

app.get('/api/inventory/ubicaciones', authenticateToken, async (req, res) => { try { const r = await pool.query('SELECT idUbicacion as "idUbicacion", nombre, descripcion, estante, nivel, estado FROM ubicacion'); res.json(r.rows); } catch(e){handleDbError(res,e)} });
app.post('/api/inventory/ubicaciones', authenticateToken, async (req, res) => { try { const id = await generateNextId('ubicacion','idUbicacion','UBI'); const {nombre,descripcion,estante,nivel,estado}=req.body; await pool.query('INSERT INTO ubicacion VALUES($1,$2,$3,$4,$5,$6)',[id,nombre,descripcion,estante,nivel,estado]); res.json({}); } catch(e){handleDbError(res,e)} });

app.post('/api/ventas', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { identidadCliente, total, detalles } = req.body;
    const { codUsuario } = req.user;
    
    const openBox = await client.query(`SELECT * FROM arqueo WHERE idUsuario = $1 AND estado = 'Activo'`, [codUsuario]);
    if(openBox.rows.length === 0) throw new Error("No tienes una caja abierta.");

    await client.query('BEGIN');
    
    const codVenta = await generateNextId('ventas', 'codVenta', 'FAC', client);
    const fecha = new Date().toISOString().split('T')[0];
    
    await client.query(
      `INSERT INTO ventas (codVenta, fecha, codVendedor, identidadCliente, total, estado) VALUES ($1, $2, $3, $4, $5, 'Completada')`,
      [codVenta, fecha, codUsuario, identidadCliente, total]
    );

    const startIdStr = await generateNextId('detalleventa', 'codDetalleVenta', 'DET', client);
    let currentDetailIdNum = parseInt(startIdStr.split('-')[1]);

    for (const item of detalles) {
      const codDetalle = `DET-${currentDetailIdNum.toString().padStart(4, '0')}`;
      currentDetailIdNum++;
      
      let idAccesorio = null;
      let idTelefono = null;

      if (item.tipoProducto === 'TELEFONO') {
        idTelefono = item.idTelefono;
        await client.query("UPDATE telefonos SET estado = 'Vendido' WHERE codigo = $1", [idTelefono]);
      } else if (item.tipoProducto === 'ACCESORIO') {
        const invResult = await client.query('SELECT codAccesorio FROM inventario WHERE codInventario = $1', [item.idInventario]);
        if(invResult.rows.length > 0) idAccesorio = invResult.rows[0].codaccesorio;
        
        await client.query("UPDATE inventario SET cantidad = cantidad - $1 WHERE codInventario = $2", [item.cantidad, item.idInventario]);
      }

      await client.query(
        `INSERT INTO detalleventa (codDetalleVenta, idVenta, idAccesorio, idTelefono, cantidad, precioVenta, estado) 
         VALUES ($1, $2, $3, $4, $5, $6, 'Activo')`,
        [codDetalle, codVenta, idAccesorio, idTelefono, item.cantidad, item.precioVenta]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Venta OK', codVenta });
  } catch (err) { await client.query('ROLLBACK'); handleDbError(res, err); } finally { client.release(); }
});

app.get('/api/ventas/historial', authenticateToken, async (req, res) => {
  const { fecha } = req.query;
  const { codUsuario } = req.user;
  try {
    const result = await pool.query(`
      SELECT v.codVenta as "codVenta", v.fecha, v.codVendedor as "codVendedor", v.identidadCliente as "identidadCliente", v.total, v.estado,
             c.nombre || ' ' || c.apellido as "nombreCliente"
      FROM ventas v
      LEFT JOIN clientes c ON v.identidadCliente = c.identidad
      WHERE v.codVendedor = $1 AND v.fecha = $2
      ORDER BY v.codVenta DESC
    `, [codUsuario, fecha]);
    res.json(result.rows);
  } catch(err) { handleDbError(res, err); }
});

app.use(express.static(path.join(__dirname, 'build')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'build', 'index.html')); });

app.listen(port, () => {
  console.log(`SmartCloud Server running on port ${port}`);
});
