
// ... (código existente hasta updateInitialAmount y reopenBox) ...

// --- ADMIN: OBTENER SALDOS POR FECHA ---
router.get('/admin/saldos', authenticateToken, async (req, res) => {
    try {
        const { fecha } = req.query;
        if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
        
        // Usamos TO_CHAR para asegurar coincidencia de fecha local
        const query = `SELECT idsaldos as "idsaldos", red, saldoInicio as "saldoInicio", saldoComprado as "saldoComprado", saldoFinal as "saldoFinal", fecha FROM saldos WHERE fecha = $1`;
        const result = await pool.query(query, [fecha]);
        res.json(result.rows);
    } catch (err) { handleDbError(res, err); }
});

// --- ADMIN: ACTUALIZAR SALDO ---
router.put('/admin/saldos/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { saldoInicio, saldoFinal } = req.body;
        
        await pool.query(
            `UPDATE saldos SET saldoInicio = $1, saldoFinal = $2 WHERE idsaldos = $3`,
            [saldoInicio, saldoFinal, id]
        );
        
        res.json({ message: 'Saldos actualizados correctamente' });
    } catch (err) { handleDbError(res, err); }
});


// ==========================================
// RUTAS OPERATIVAS (CAJERO)
// ==========================================

// ... (resto del archivo igual) ...
