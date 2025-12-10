const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const port = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// --- CONFIGURACIÓN DE BASE DE DATOS ---
// Usamos la URL interna de Render para máxima velocidad y seguridad
const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: false } // Render internal no requiere SSL estricto, externo sí
});

// Test de conexión al iniciar
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error adquiriendo cliente de BD', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) {
      return console.error('Error ejecutando query de prueba', err.stack);
    }
    console.log('✅ Conexión exitosa a PostgreSQL:', result.rows[0]);
  });
});

// --- API ENDPOINTS (El Frontend llama aquí, no a la BD directamente) ---

// 1. Obtener Inventario Unificado (Teléfonos + Accesorios)
app.get('/api/productos/unificados', async (req, res) => {
  try {
    // Consulta compleja para unir teléfonos y accesorios como una lista única para el frontend
    // NOTA: Ajustado a tus tablas reales
    const query = `
      SELECT 
        t.codigo as id, 
        'TELEFONO' as tipo, 
        CONCAT(t.marca, ' ', t.modelo) as nombre,
        t.codigo, 
        t."precioVenta", 
        CASE WHEN t.estado = 'Disponible' THEN 1 ELSE 0 END as stock,
        t.imei1 as imei,
        u.nombre as ubicacion
      FROM telefonos t
      LEFT JOIN ubicacion u ON t.idubicacion = u."idUbicacion"
      WHERE t.estado = 'Disponible'
      
      UNION ALL
      
      SELECT 
        a."codAccesorio" as id, 
        'ACCESORIO' as tipo, 
        a.descripcion as nombre,
        a."codAccesorio" as codigo, 
        i."precioVenta", 
        i.cantidad as stock,
        NULL as imei,
        u.nombre as ubicacion
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

// 2. Obtener Clientes
app.get('/api/clientes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY nombre ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

// 3. Crear Venta (Transacción)
app.post('/api/ventas', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { codVenta, fecha, codVendedor, identidadCliente, total, estado, detalles } = req.body;

    // Insertar Cabecera
    const insertVentaText = `
      INSERT INTO ventas ("codVenta", fecha, "codVendedor", "identidadCliente", total, estado)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await client.query(insertVentaText, [codVenta, fecha, codVendedor, identidadCliente, total, estado]);

    // Insertar Detalles
    // Nota: Aquí deberías iterar sobre 'detalles' e insertar en la tabla detalleventa
    // Y actualizar el stock en 'telefonos' o 'inventario'
    
    await client.query('COMMIT');
    res.status(201).json({ message: 'Venta registrada con éxito', codVenta });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Error en la transacción de venta' });
  } finally {
    client.release();
  }
});

// 4. Arqueo Activo
app.get('/api/arqueo/active', async (req, res) => {
  try {
    const { usuario } = req.query;
    // Buscar arqueo abierto para este usuario
    const query = `
      SELECT * FROM arqueo 
      WHERE "idUsuario" = $1 AND "fechaCierre" IS NULL
      LIMIT 1
    `;
    const result = await pool.query(query, [usuario]);
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error consultando arqueo' });
  }
});

// --- SERVIR FRONTEND ---
// Servir archivos estáticos desde la carpeta build (generada por npm run build)
app.use(express.static(path.join(__dirname, 'build')));

// Manejar cualquier otra ruta devolviendo index.html para soportar el routing de React (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`SmartCloud Server running on port ${port}`);
});
