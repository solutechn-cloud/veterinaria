
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: false }
});

// Función auxiliar para generar IDs consecutivos (ej: FACT-0001)
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

        // 2. Calcular Totales usando SQL para precisión (Ingresos y Egresos desde la apertura)
        // NOTA: Se usa COALESCE para evitar nulos y asegurar retornos numéricos
        const statsQuery = `
            SELECT 
                (SELECT COALESCE(SUM(monto), 0) FROM ingresos WHERE idCaja = $1 AND fechaCreacion >= $2) as total_ingresos,
                (SELECT COALESCE(SUM(costo), 0) FROM ingresos WHERE idCaja = $1 AND fechaCreacion >= $2) as total_costos_ventas,
                (SELECT COALESCE(SUM(monto), 0) FROM egresos WHERE idCaja = $1 AND fechaCreacion >= $2) as total_egresos
        `;
        
        const statsRes = await client.query(statsQuery, [idCaja, fechaApertura]);
        const { total_ingresos, total_costos_ventas, total_egresos } = statsRes.rows[0];

        // Convertir a float para JS math (aunque vienen como strings numéricos de PG)
        const tIngresos = parseFloat(total_ingresos);
        const tCostos = parseFloat(total_costos_ventas);
        const tEgresos = parseFloat(total_egresos);
        const mInicial = parseFloat(montoInicial);

        // 3. Cálculos
        const montoFinal = mInicial + tIngresos - tEgresos;
        const ganancia = tIngresos - tCostos; 

        // 4. Actualizar registro completo en Arqueo
        // Se actualizan todos los contadores para que el dashboard muestre datos reales al instante
        await client.query(
            `UPDATE arqueo 
             SET montoFinal = $1, 
                 totalVentas = $2, 
                 totalCostos = $3, 
                 TotalGastos = $4, 
                 ganancia = $5 
             WHERE idArqueo = $6`, 
            [
                montoFinal.toFixed(2), 
                tIngresos.toFixed(2), 
                tCostos.toFixed(2), 
                tEgresos.toFixed(2), 
                ganancia.toFixed(2), 
                idArqueo
            ]
        );
        
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
