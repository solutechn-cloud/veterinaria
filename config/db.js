
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: false }
});

// Función auxiliar para generar IDs consecutivos (ej: USR-0001)
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

// Función para actualizar el balance del arqueo en tiempo real
async function updateArqueoBalance(idCaja, client = pool) {
    try {
        // 1. Obtener Arqueo Activo
        const arqRes = await client.query(`SELECT idArqueo, montoInicial, fechaApertura FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, [idCaja]);
        if (arqRes.rows.length === 0) return; // No hay caja abierta

        const { idArqueo, montoInicial, fechaApertura } = arqRes.rows[0];

        // 2. Sumar Ingresos (desde apertura)
        const ingRes = await client.query(`SELECT COALESCE(SUM(monto), 0) as total FROM ingresos WHERE idCaja = $1 AND fechaCreacion >= $2`, [idCaja, fechaApertura]);
        const totalIngresos = parseFloat(ingRes.rows[0].total);

        // 3. Sumar Egresos (desde apertura)
        const egrRes = await client.query(`SELECT COALESCE(SUM(monto), 0) as total FROM egresos WHERE idCaja = $1 AND fechaCreacion >= $2`, [idCaja, fechaApertura]);
        const totalEgresos = parseFloat(egrRes.rows[0].total);

        // 4. Calcular Saldo Actual
        const inicial = parseFloat(montoInicial);
        const montoFinal = inicial + totalIngresos - totalEgresos;

        // 5. Actualizar registro (SOLO montoFinal, sin fechaModificacion)
        await client.query(`UPDATE arqueo SET montoFinal = $1 WHERE idArqueo = $2`, [montoFinal.toFixed(2), idArqueo]);
        
    } catch (err) {
        console.error("Error actualizando balance de arqueo:", err);
    }
}

const handleDbError = (res, err) => {
  console.error('DB Error:', err); 
  if (err.code === '23503') return res.status(409).json({ error: 'No se puede eliminar/crear: Registro relacionado a otra entidad.' });
  if (err.code === '23505') return res.status(409).json({ error: 'El registro ya existe (Duplicado).' });
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
};

module.exports = { pool, generateNextId, handleDbError, updateArqueoBalance };
