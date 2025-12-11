
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

// Función CRÍTICA: Actualizar balance en tiempo real
async function updateArqueoBalance(idCaja, client = pool) {
    try {
        // 1. Obtener datos de la sesión activa
        const arqRes = await client.query(
            `SELECT idArqueo, montoInicial, fechaApertura FROM arqueo WHERE idCaja = $1 AND estado = 'Activo'`, 
            [idCaja]
        );
        
        if (arqRes.rows.length === 0) return; // No hay caja abierta para actualizar

        const { idArqueo, montoInicial, fechaApertura } = arqRes.rows[0];

        // 2. Calcular sumatorias de movimientos DESDE la fecha/hora de apertura
        // Usamos COALESCE para evitar nulos y ::numeric para asegurar matemáticas precisas
        
        // Calcular Ingresos (Incluye Ventas POS y Manuales)
        const ingRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0)::numeric as total, COALESCE(SUM(costo), 0)::numeric as costo
            FROM ingresos 
            WHERE idCaja = $1 AND fechaCreacion >= $2
        `, [idCaja, fechaApertura]);

        // Calcular Egresos (Gastos, Compras Saldo, Anulaciones)
        const egrRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0)::numeric as total
            FROM egresos 
            WHERE idCaja = $1 AND fechaCreacion >= $2
        `, [idCaja, fechaApertura]);

        const totalIngresos = parseFloat(ingRes.rows[0].total);
        const totalCostos = parseFloat(ingRes.rows[0].costo);
        const totalEgresos = parseFloat(egrRes.rows[0].total);
        const baseInicial = parseFloat(montoInicial);

        // Fórmula: Caja Final = Lo que había al inicio + Lo que entró - Lo que salió
        const montoFinal = baseInicial + totalIngresos - totalEgresos;
        const ganancia = totalIngresos - totalCostos;

        // 3. Impactar en base de datos
        await client.query(`
            UPDATE arqueo 
            SET 
                totalVentas = $1,
                totalCostos = $2,
                TotalGastos = $3,
                montoFinal = $4,
                ganancia = $5
            WHERE idArqueo = $6
        `, [totalIngresos, totalCostos, totalEgresos, montoFinal, ganancia, idArqueo]);
        
        console.log(`Caja ${idCaja} actualizada. Saldo Final: ${montoFinal}`);
        
    } catch (err) {
        console.error("Error crítico actualizando balance:", err);
        throw err;
    }
}

const handleDbError = (res, err) => {
  console.error('DB Error:', err); 
  if (err.code === '23503') return res.status(409).json({ error: 'No se puede eliminar/crear: Registro relacionado a otra entidad.' });
  if (err.code === '23505') return res.status(409).json({ error: 'El registro ya existe (Duplicado).' });
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
};

module.exports = { pool, generateNextId, handleDbError, updateArqueoBalance };
