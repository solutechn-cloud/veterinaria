
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: false }
});

// Función auxiliar para generar IDs consecutivos (ej: USR-0001)
// Se exporta para que todos los controladores la usen sin reescribir código
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
  if (err.code === '23503') return res.status(409).json({ error: 'No se puede eliminar/crear: Registro relacionado a otra entidad.' });
  if (err.code === '23505') return res.status(409).json({ error: 'El registro ya existe (Duplicado).' });
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
};

module.exports = { pool, generateNextId, handleDbError };
