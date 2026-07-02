'use strict';

const express = require('express');
const router = express.Router();
const messagingService = require('../services/messagingService');

router.post('/', async (req, res) => {
    try {
        const result = await messagingService.processResendWebhook(req.body, req.headers);
        res.json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        console.error('[messagingWebhook] Error:', err.message);
        res.status(status).json({ error: status === 401 ? 'Firma invalida.' : 'Error procesando webhook.' });
    }
});

module.exports = router;
