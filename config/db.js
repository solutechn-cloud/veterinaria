
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_INTERNAL_URL || process.env.DATABASE_URL,
  ssl: process.env.DB_INTERNAL_URL ? false : { rejectUnauthorized: false }
});

// --- HELPER TIMEZONE HONDURAS ---
// Genera un string de fecha/hora exacta en Honduras para insertar en BD
const getLocalTimestamp = () => {
    const d = new Date();
    // Convertir a tiempo de Tegucigalpa
    const tzDate = new Date(d.toLocaleString("en-US", {timeZone: "America/Tegucigalpa"}));
    
    // Formatear manualmente a YYYY-MM-DD HH:mm:ss para PostgreSQL
    const year = tzDate.getFullYear();
    const month = String(tzDate.getMonth() + 1).padStart(2, '0');
    const day = String(tzDate.getDate()).padStart(2, '0');
    const hours = String(tzDate.getHours()).padStart(2, '0');
    const minutes = String(tzDate.getMinutes()).padStart(2, '0');
    const seconds = String(tzDate.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

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
    console.log(`--- INICIO RECALCULO SALDO CAJA: ${idCaja} ---`);
    try {
        // 1. Obtener datos de la sesión activa
        const arqRes = await client.query(
            `SELECT idArqueo as "idArqueo", montoInicial as "montoInicial", fechaApertura as "fechaApertura" 
             FROM arqueo 
             WHERE idCaja = $1 AND estado = 'Activo'`, 
            [idCaja]
        );
        
        if (arqRes.rows.length === 0) {
            console.error(`[ERROR] No se pudo actualizar: La Caja ${idCaja} NO tiene una sesión activa.`);
            return; 
        }

        const { idArqueo, montoInicial, fechaApertura } = arqRes.rows[0];
        console.log(`1. Sesión Activa: ${idArqueo} | Inicio: ${montoInicial} | Apertura: ${fechaApertura}`);

        // 2. Calcular sumatorias (Ingresos)
        const ingRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0) as total, COALESCE(SUM(costo), 0) as costo
            FROM ingresos 
            WHERE idCaja = $1 AND fechaCreacion >= $2
        `, [idCaja, fechaApertura]);

        // 3. Calcular sumatorias (Egresos)
        const egrRes = await client.query(`
            SELECT COALESCE(SUM(monto), 0) as total
            FROM egresos 
            WHERE idCaja = $1 AND fechaCreacion >= $2
        `, [idCaja, fechaApertura]);

        const totalIngresos = Number(ingRes.rows[0].total);
        const totalCostos = Number(ingRes.rows[0].costo);
        const totalEgresos = Number(egrRes.rows[0].total);
        const baseInicial = Number(montoInicial);

        console.log(`2. Movimientos: Ingresos(+): ${totalIngresos} | Egresos(-): ${totalEgresos}`);

        // Fórmula: Caja Final = Lo que había al inicio + Lo que entró - Lo que salió
        const montoFinal = (baseInicial + totalIngresos) - totalEgresos;
        const ganancia = totalIngresos - totalCostos;

        console.log(`3. Resultado Final: (${baseInicial} + ${totalIngresos}) - ${totalEgresos} = ${montoFinal}`);

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
        
        console.log(`[EXITO] Balance actualizado correctamente para ${idArqueo}`);
        
    } catch (err) {
        console.error("[CRITICAL ERROR] Fallo actualizando balance:", err);
        throw err;
    }
}

const handleDbError = (res, err) => {
  console.error('DB Error:', err); 
  if (err.code === '23503') return res.status(409).json({ error: 'No se puede eliminar/crear: Registro relacionado a otra entidad.' });
  if (err.code === '23505') return res.status(409).json({ error: 'El registro ya existe (Duplicado).' });
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
};

module.exports = { pool, generateNextId, handleDbError, updateArqueoBalance, getLocalTimestamp };
