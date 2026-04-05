
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool, generateNextId, handleDbError, updateArqueoBalance } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// --- ENDPOINT PARA ESQUEMA DE DATOS (REQUERIDO POR IMPRESIÓN/DISEÑO) ---
const SCHEMA_TABLES = ['telefonos', 'inventario', 'accesorios', 'ventas', 'clientes', 'configuracion', 'empleado', 'usuarios', 'detalleventa', 'reparaciones'];

router.get('/schema', authenticateToken, async (req, res) => {
    try {
        const colQuery = `
            SELECT
                table_name as "table",
                column_name as "column",
                data_type as "type"
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
            ORDER BY table_name, ordinal_position
        `;
        // Query FK relationships from information_schema
        const fkQuery = `
            SELECT
                tc.table_name AS "fromTable",
                kcu.column_name AS "fromColumn",
                ccu.table_name AS "toTable",
                ccu.column_name AS "toColumn"
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
            AND tc.table_name = ANY($1::text[])
        `;
        const [colResult, fkResult] = await Promise.all([
            pool.query(colQuery, [SCHEMA_TABLES]),
            pool.query(fkQuery, [SCHEMA_TABLES]),
        ]);

        const schema = colResult.rows.reduce((acc, curr) => {
            if (!acc[curr.table]) acc[curr.table] = { columns: [], relations: [] };
            acc[curr.table].columns.push({ name: curr.column, type: curr.type });
            return acc;
        }, {});

        // Add FK relationships
        for (const fk of fkResult.rows) {
            if (!schema[fk.fromTable]) continue;
            const alreadyExists = schema[fk.fromTable].relations.some(r => r.foreignTable === fk.toTable && r.column === fk.fromColumn);
            if (!alreadyExists) {
                schema[fk.fromTable].relations.push({
                    column: fk.fromColumn,
                    foreignTable: fk.toTable,
                    foreignColumn: fk.toColumn,
                });
            }
        }

        res.json(schema);
    } catch(e) { handleDbError(res, e); }
});

// --- CONFIGURACIÓN DE EMPRESA (TABLA CONFIGURACION) ---
const mapConfigRow = (row) => ({
    nombreEmpresa: row.nombreempresa || '',
    rtn:           row.rtn           || '',
    direccion:     row.direccion     || '',
    telefono:      row.telefono      || '',
    correo:        row.correo        || '',
    cai:           row.cai           || '',
    rangoInicial:  row.rangoinicial  || '',
    rangoFinal:    row.rangofinal    || '',
    fechaLimite:   row.fechalimite ? String(row.fechalimite).substring(0, 10) : '',
    isv:           Number(row.isv)   || 15,
    mensajeFinal:  row.mensajefinal  || 'LA FACTURA ES BENEFICIO DE TODOS, EXIJALA',
    logoBase64:    row.logo_base64   || '',
});

router.get('/config', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM configuracion WHERE id = 1');
        if (r.rows.length === 0) {
            return res.json(mapConfigRow({ isv: 15 }));
        }
        res.json(mapConfigRow(r.rows[0]));
    } catch(e) { handleDbError(res, e); }
});

router.put('/config', authenticateToken, async (req, res) => {
    try {
        const { nombreEmpresa, rtn, direccion, telefono, correo, cai, rangoInicial, rangoFinal, fechaLimite, isv, mensajeFinal, logoBase64 } = req.body;
        await pool.query(`
            INSERT INTO configuracion (id, nombreempresa, rtn, direccion, telefono, correo, cai, rangoinicial, rangofinal, fechalimite, isv, mensajefinal, logo_base64)
            VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (id) DO UPDATE SET
                nombreempresa = EXCLUDED.nombreempresa,
                rtn           = EXCLUDED.rtn,
                direccion     = EXCLUDED.direccion,
                telefono      = EXCLUDED.telefono,
                correo        = EXCLUDED.correo,
                cai           = EXCLUDED.cai,
                rangoinicial  = EXCLUDED.rangoinicial,
                rangofinal    = EXCLUDED.rangofinal,
                fechalimite   = EXCLUDED.fechalimite,
                isv           = EXCLUDED.isv,
                mensajefinal  = EXCLUDED.mensajefinal,
                logo_base64   = EXCLUDED.logo_base64
        `, [nombreEmpresa, rtn, direccion, telefono, correo, cai, rangoInicial, rangoFinal, fechaLimite || null, isv, mensajeFinal, logoBase64 || null]);
        res.json({ message: 'Configuración actualizada' });
    } catch(e) { handleDbError(res, e); }
});

// --- PANEL DE CONTROL DE CAJAS ---
router.get('/admin/boxes/status', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                c.idCaja as "idCaja", 
                c.nombre as "nombreCaja", 
                last_arq.idArqueo as "idArqueo", 
                last_arq.estado as "estadoArqueo", 
                COALESCE(last_arq.montoInicial, 0) as "montoInicial", 
                COALESCE(last_arq.montoFinal, 0) as "montoFinal", 
                COALESCE(last_arq.ganancia, 0) as "ganancia", 
                last_arq.fechaApertura as "fechaApertura", 
                last_arq.fechaCierre as "fechaCierre",
                u.usuario,
                (e.nombre || ' ' || e.apellido) as "nombreEmpleado"
            FROM caja c
            LEFT JOIN LATERAL (
                SELECT * FROM arqueo a 
                WHERE a.idCaja = c.idCaja 
                ORDER BY a.fechaApertura DESC LIMIT 1
            ) last_arq ON true
            LEFT JOIN usuarios u ON last_arq.idUsuario = u.codUsuario
            LEFT JOIN empleado e ON u.identidad = e.identidad
            ORDER BY c.idCaja ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.get('/admin/boxes/:id/history', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT idArqueo as "idArqueo", fechaApertura as "fechaApertura", fechaCierre as "fechaCierre", montoInicial as "montoInicial", montoFinal as "montoFinal", estado
            FROM arqueo WHERE idCaja = $1 ORDER BY fechaApertura DESC
        `;
        const result = await pool.query(query, [req.params.id]);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.put('/admin/arqueo/:id/reopen', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const arqRes = await client.query(
            'SELECT idArqueo, idCaja, estado FROM arqueo WHERE idArqueo = $1',
            [req.params.id]
        );
        if (arqRes.rows.length === 0) throw new Error('Arqueo no encontrado');
        const arqueo = arqRes.rows[0];

        if (arqueo.estado === 'Activo') throw new Error('Esta caja ya está activa');

        const activeCheck = await client.query(
            "SELECT idArqueo FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'",
            [arqueo.idcaja]
        );
        if (activeCheck.rows.length > 0) throw new Error('Ya existe una sesión activa para esta caja. Ciérrela primero.');

        await client.query(
            "UPDATE arqueo SET estado = 'Activo', fechaCierre = NULL WHERE idArqueo = $1",
            [req.params.id]
        );

        await updateArqueoBalance(arqueo.idcaja, client);
        await client.query('COMMIT');
        res.json({ message: 'Caja reaperturada correctamente' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

// --- SALDOS (PARA ADMIN) ---
router.get('/admin/saldos', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        const result = await pool.query(
            'SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha FROM saldos WHERE TO_CHAR(fecha, \'YYYY-MM-DD\') = $1',
            [fecha]
        );
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.put('/admin/saldos/:id', authenticateToken, async (req, res) => {
    try {
        const { saldoInicio, saldoFinal } = req.body;
        await pool.query(
            'UPDATE saldos SET saldoInicio = $1, saldoFinal = $2 WHERE idsaldos = $3',
            [saldoInicio, saldoFinal, req.params.id]
        );
        res.json({ message: 'Saldo actualizado' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/users', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.codUsuario as "codUsuario", u.usuario, u.identidad, u.idCaja as "idCaja", u.idrol, u.estado,
            COALESCE(u.requires_password_change, FALSE) as "requiresPasswordChange",
            e.nombre || ' ' || e.apellido as "nombreEmpleado", r.nombre as "nombreRol"
            FROM usuarios u
            LEFT JOIN empleado e ON u.identidad = e.identidad
            LEFT JOIN roles r ON u.idrol = r.idrol
        `);
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/users', authenticateToken, async (req, res) => {
    try {
        const { usuario, identidad, idrol, idCaja, estado } = req.body;
        const codUsuario = await generateNextId('usuarios', 'codUsuario', 'USER');
        // Generate a temporary password; admin must share it with the user
        const tempPassword = `Temp@${Math.floor(1000 + Math.random() * 9000)}`;
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        await pool.query(
            `INSERT INTO usuarios (codUsuario, usuario, password, identidad, idCaja, idrol, estado, requires_password_change, fechaCreacion)
             VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())`,
            [codUsuario, usuario, hashedPassword, identidad, idCaja, idrol, estado]);
        res.status(201).json({ message: 'OK', codUsuario, tempPassword });
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
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/users/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM usuarios WHERE codUsuario=$1', [req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/empleados', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT identidad, nombre, apellido, direccion, telefono, estado FROM empleado');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

router.post('/empleados', authenticateToken, async (req, res) => {
    try {
        const { identidad, nombre, apellido, direccion, telefono, estado } = req.body;
        await pool.query('INSERT INTO empleado (identidad, nombre, apellido, direccion, telefono, estado, fechaCreacion) VALUES ($1,$2,$3,$4,$5,$6, NOW())',
            [identidad, nombre, apellido, direccion, telefono, estado]);
        res.status(201).json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.put('/empleados/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, apellido, direccion, telefono, estado } = req.body;
        await pool.query('UPDATE empleado SET nombre=$1, apellido=$2, direccion=$3, telefono=$4, estado=$5 WHERE identidad=$6',
            [nombre, apellido, direccion, telefono, estado, req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/empleados/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM empleado WHERE identidad=$1', [req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

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
        res.status(201).json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
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
        res.json({ message: 'OK' });
    } catch(e) { await client.query('ROLLBACK'); handleDbError(res, e); } finally { client.release(); }
});

router.delete('/roles/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM roles WHERE idrol=$1', [req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.get('/permisos', authenticateToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT idPermiso as "idPermiso", nombre, modulo FROM permisos ORDER BY modulo, nombre');
        res.json(r.rows);
    } catch(e) { handleDbError(res, e); }
});

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
        await pool.query('INSERT INTO caja (idCaja, nombre, estado) VALUES ($1, $2, $3)', [idCaja, nombre, 'Activo']);
        res.status(201).json({ message: 'OK', idCaja });
    } catch(e) { handleDbError(res, e); }
});

router.put('/cajas/:id', authenticateToken, async (req, res) => {
    try {
        const { nombre, estado } = req.body;
        await pool.query('UPDATE caja SET nombre=$1, estado=$2 WHERE idCaja=$3', [nombre, estado, req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

router.delete('/cajas/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM caja WHERE idCaja=$1', [req.params.id]);
        res.json({ message: 'OK' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
