
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: false }
});

// --- HELPER TIMEZONE HONDURAS (ROBUSTO) ---
// Esta función garantiza que el servidor devuelva la fecha/hora de Honduras sin importar dónde esté físicamente.
const getLocalTimestamp = () => {
    try {
        const now = new Date();
        const options = {
            timeZone: 'America/Tegucigalpa',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(now);
        
        const getPart = (type) => parts.find(p => p.type === type).value;
        // Formato: YYYY-MM-DD HH:MM:SS
        return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
    } catch (err) {
        console.error("Error generando fecha local:", err);
        const d = new Date();
        d.setHours(d.getHours() - 6); // Fallback manual UTC-6
        return d.toISOString().replace('T', ' ').substring(0, 19);
    }
};

// Asegurar el timezone en cada nueva conexión al pool
pool.on('connect', (client) => {
    client.query("SET TIME ZONE 'America/Tegucigalpa'")
        .catch(err => console.error('Error setting timezone', err));
});

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

// Función CRÍTICA: Actualizar balance del arqueo activo sumando ingresos/egresos de HOY (Honduras)
async function updateArqueoBalance(idCaja, client = pool) {
    try {
        const arqRes = await client.query(
            `SELECT idArqueo as "idArqueo", montoInicial as "montoInicial"
             FROM arqueo 
             WHERE idCaja = $1 AND estado = 'Activo'`, 
            [idCaja]
        );
        
        if (arqRes.rows.length === 0) return;

        const { idArqueo, montoInicial } = arqRes.rows[0];
        
        // Sumar movimientos filtrando estrictamente por la fecha de Honduras
        const hndDate = getLocalTimestamp().substring(0, 10);

        const ingRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0) as total, COALESCE(SUM(costo), 0) as costo
            FROM ingresos 
            WHERE idCaja = $1 
            AND TO_CHAR(fechaCreacion AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD') = $2
        `, [idCaja, hndDate]);

        const egrRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0) as total
            FROM egresos 
            WHERE idCaja = $1 
            AND TO_CHAR(fechaCreacion AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM-DD') = $2
        `, [idCaja, hndDate]);

        const totalIngresos = Number(ingRes.rows[0].total);
        const totalCostos = Number(ingRes.rows[0].costo);
        const totalEgresos = Number(egrRes.rows[0].total);
        const baseInicial = Number(montoInicial);

        const montoFinal = (baseInicial + totalIngresos) - totalEgresos;
        const ganancia = totalIngresos - totalCostos;

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
        
    } catch (err) {
        console.error("[CRITICAL ERROR] Fallo actualizando balance:", err);
        throw err;
    }
}

const handleDbError = (res, err) => {
  console.error('[DB ERROR HANDLER]:', err); 
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
};

module.exports = { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp };
