
const express = require('express');
const router = express.Router();
const { pool, handleDbError } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// Obtener todas las plantillas
router.get('/labels', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, category, type, data_source as "dataSource", is_default as "isDefault", width, height, elements FROM label_templates ORDER BY created_at DESC');
        res.json(result.rows);
    } catch(e) { handleDbError(res, e); }
});

// Obtener plantilla por defecto (opcional: por categoría y tipo)
router.get('/labels/default', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, category, type, data_source as "dataSource", is_default as "isDefault", width, height, elements FROM label_templates WHERE is_default = TRUE');
        res.json(result.rows[0] || null);
    } catch(e) { handleDbError(res, e); }
});

// Crear plantilla
router.post('/labels', authenticateToken, async (req, res) => {
    try {
        const { name, width, height, elements, isDefault, category, type, dataSource } = req.body;
        const cat = category || 'GENERAL';
        const docType = type || 'LABEL';
        const src = dataSource || 'NONE';

        if (isDefault) {
            await pool.query('UPDATE label_templates SET is_default = FALSE WHERE category = $1 AND type = $2', [cat, docType]);
        }

        const result = await pool.query(
            `INSERT INTO label_templates (name, width, height, elements, is_default, category, type, data_source) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [name, width, height, JSON.stringify(elements), isDefault || false, cat, docType, src]
        );
        
        res.status(201).json({ message: 'Plantilla guardada', id: result.rows[0].id });
    } catch(e) { handleDbError(res, e); }
});

// Actualizar plantilla
router.put('/labels/:id', authenticateToken, async (req, res) => {
    try {
        const { name, width, height, elements, isDefault, category, type, dataSource } = req.body;
        const cat = category || 'GENERAL';
        const docType = type || 'LABEL';
        const src = dataSource || 'NONE';
        
        if (isDefault) {
            await pool.query('UPDATE label_templates SET is_default = FALSE WHERE category = $1 AND type = $2', [cat, docType]);
        }

        await pool.query(
            `UPDATE label_templates 
             SET name=$1, width=$2, height=$3, elements=$4, is_default=$5, category=$6, type=$7, data_source=$8, updated_at=NOW()
             WHERE id=$9`,
            [name, width, height, JSON.stringify(elements), isDefault || false, cat, docType, src, req.params.id]
        );
        
        res.json({ message: 'Plantilla actualizada' });
    } catch(e) { handleDbError(res, e); }
});

// Eliminar plantilla
router.delete('/labels/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM label_templates WHERE id=$1', [req.params.id]);
        res.json({ message: 'Plantilla eliminada' });
    } catch(e) { handleDbError(res, e); }
});

module.exports = router;
