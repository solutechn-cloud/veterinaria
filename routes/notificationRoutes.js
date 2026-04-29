'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const emailService = require('../services/emailService');
const { runDailyReport } = require('../services/cronJobs');

// POST /api/notifications/test-daily-report
// Manually trigger the daily report email (admin only)
router.post('/notifications/test-daily-report', authenticateToken, requireAdmin, async (req, res) => {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        return res.status(500).json({ error: 'ADMIN_EMAIL no configurado en el servidor.' });
    }

    try {
        await runDailyReport();
        res.json({ success: true, message: `Reporte diario enviado a ${adminEmail}` });
    } catch (err) {
        console.error('[notificationRoutes] test-daily-report error:', err.message);
        res.status(500).json({ error: 'Error al enviar el reporte diario', detail: err.message });
    }
});

// POST /api/notifications/test-repair-ready
// Send a test repair-ready email
// Body: { to, clientName, repairId, deviceDesc, techNotes? }
router.post('/notifications/test-repair-ready', authenticateToken, requireAdmin, async (req, res) => {
    const { to, clientName, repairId, deviceDesc, techNotes } = req.body;

    if (!to || !clientName || !repairId || !deviceDesc) {
        return res.status(400).json({
            error: 'Campos requeridos: to, clientName, repairId, deviceDesc'
        });
    }

    try {
        await emailService.sendRepairReadyEmail(to, clientName, repairId, deviceDesc, techNotes || '');
        res.json({ success: true, message: `Correo de reparacion lista enviado a ${to}` });
    } catch (err) {
        console.error('[notificationRoutes] test-repair-ready error:', err.message);
        res.status(500).json({ error: 'Error al enviar el correo', detail: err.message });
    }
});

// POST /api/notifications/backup-now
// Manually trigger a Google Drive database backup (admin only)
router.post('/notifications/backup-now', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
            return res.status(400).json({ error: 'Google Drive no configurado. Agrega GOOGLE_SERVICE_ACCOUNT_KEY.' });
        }
        const { backupDatabase } = require('../services/googleDriveService');
        const result = await backupDatabase();
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
