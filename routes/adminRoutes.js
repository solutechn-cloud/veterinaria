
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool, generateNextId, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- USUARIOS ---
router.get('/users', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.codUsuario as "codUsuario", u.usuario, u.identidad, u.idCaja as "idCaja", u.idrol, u.estado,
                e.nombre || ' ' || e.apellido as "nombreEmpleado",
                r.nombre as "nombreRol"
            FROM usuarios u
            LEFT JOIN empleado e ON u.identidad = e.identidad
            LEFT JOIN roles r ON u.idrol = r.idrol
        `);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/users', authenticateToken, async (req, res) => {
    try {
        const { usuario, password, identidad, idrol, idCaja, estado } = req.body;
        const codUsuario = await generateNextId('usuarios', 'codUsuario', 'USER');
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await pool.query(
            `INSERT INTO usuarios (codUsuario, usuario, password, identidad, idCaja, idrol, estado, fechaCreacion)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [codUsuario, usuario, hashedPassword, identidad, idCaja, idrol, estado]
        );
        res.status(201).json({ message: 'Usuario creado', codUsuario });
    } catch(e) { handleDbError(res, e); }
});

router.put('/users/:id', authenticateToken, async (req, res) => {
    try {
        const { usuario, password, identidad, idrol, idCaja, estado } = req.body;
        let query = `UPDATE usuarios SET usuario=$1, identidad=$2, idrol=$3, idCaja=$4, estado=$5`;
        let params = [usuario, identidad, idrol, idCaja, estado];
        
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += `, password=$${params.length + 1}`;
            params.push(hashedPassword);
        }
        
        query += ` WHERE codUsuario=$${params.length + 1}`;
        params.push(req.params.id);

        await pool.query(query, params);
        res.json({ message: 'Usuario actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/users/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM usuarios WHERE codUsuario=$1', [req.params.id]);
        res.json({ message: 'Usuario eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- EMPLEADOS ---
router.get('/empleados', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT identidad, nombre, apellido, direccion, telefono, estado FROM empleado');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/empleados', authenticateToken, async (req, res) => {
    try {
        const { identidad, nombre, apellido, direccion, telefono, estado } = req.body;
        await pool.query(
            'INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono, estado, fechaCreacion) VALUES ($1,$2,$3,$4,$5,$6, NOW())',
            [identidad, nombre, apellido, direccion, telefono, estado]
        );
        res.status(201).json({ message: 'Empleado creado' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/empleados/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, apellido, direccion, telefono, estado } = req.body;
        await pool.query(
            'UPDATE empleado SET nombre=$1, apellido=$2, direccion=$3, telefono=$4, estado=$5 WHERE identidad=$6',
            [nombre, apellido, direccion, telefono, estado, req.params.id]
        );
        res.json({ message: 'Empleado actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/empleados/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM empleado WHERE identidad=$1', [req.params.id]);
        res.json({ message: 'Empleado eliminado' });
    } catch(e) { handleDbError(res, e); }
});

// --- ROLES & PERMISOS ---
router.get('/roles', authenticateToken, async (req, res) => {
    try {
        const roles = await pool.query('SELECT idrol, nombre, estado FROM roles');
        const rolesWithPerms = await Promise.all(roles.rows.map(async (rol) => {
            const perms = await pool.query('SELECT idPermiso FROM rol_permisos WHERE idRol = $1', [rol.idrol]);
            return { ...rol, permisos: perms.rows.map(p => p.idpermiso) };
        }));
        res.json(rolesWithPerms);
    } catch(e) { handleDbError(res, e); }
});

router.post('/roles', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { nombre, estado, permisos } = req.body;
        await client.query('BEGIN');
        const idRol = await generateNextId('roles', 'idrol', 'ROL', client);
        await client.query('INSERT INTO roles (idrol, nombre, estado) VALUES ($1, $2, $3)', [idRol, nombre, estado]);
        
        if (permisos && Array.isArray(permisos)) {
            for (const pid of permisos) {
                await client.query('INSERT INTO rol_permisos (idRol, idPermiso) VALUES ($1, $2)', [idRol, pid]);
            }
        }
        await client.query('COMMIT');
        res.status(201).json({ message: 'Rol creado' });
    } catch(e) { 
        await client.query('ROLLBACK');
        handleDbError(res, e); 
    } finally { client.release(); }
});

router.put('/roles/:id', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { nombre, estado, permisos } = req.body;
        await client.query('BEGIN');
        await client.query('UPDATE roles SET nombre=$1, estado=$2 WHERE idrol=$3', [nombre, estado, req.params.id]);
        
        await client.query('DELETE FROM rol_permisos WHERE idRol=$1', [req.params.id]);
        if (permisos && Array.isArray(permisos)) {
            for (const pid of permisos) {
                await client.query('INSERT INTO rol_permisos (idRol, idPermiso) VALUES ($1, $2)', [req.params.id, pid]);
            }
        }
        await client.query('COMMIT');
        res.json({ message: 'Rol actualizado' });
    } catch(e) {
        await client.query('ROLLBACK');
        handleDbError(res, e);
    } finally { client.release(); }
});

router.delete('/roles/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM roles WHERE idrol=$1', [req.params.id]);
        res.json({ message: 'Rol eliminado' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/permisos', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT idPermiso as "idPermiso", nombre, modulo FROM permisos ORDER BY modulo, nombre');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

// --- CAJAS (Entidad Administrativa) ---
router.get('/cajas', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT idCaja as "idCaja", nombre, estado FROM caja');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/cajas', authenticateToken, async (req, res) => {
    try {
        const { nombre } = req.body;
        const idCaja = await generateNextId('caja', 'idCaja', 'CAJA');
        await pool.query('INSERT INTO caja (idCaja, nombre, estado) VALUES ($1, $2, $3)', [idCaja, nombre, 'Activa']);
        res.status(201).json({ message: 'Caja creada', idCaja });
    } catch(e) { handleDbError(res, e); }
});

router.put('/cajas/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, estado } = req.body;
        await pool.query('UPDATE caja SET nombre=$1, estado=$2 WHERE idCaja=$3', [nombre, estado, req.params.id]);
        res.json({ message: 'Caja actualizada' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/cajas/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM caja WHERE idCaja=$1', [req.params.id]);
        res.json({ message: 'Caja eliminada' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
