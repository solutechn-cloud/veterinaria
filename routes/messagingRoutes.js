'use strict';

const express = require('express');
const router = express.Router();
const messagingService = require('../services/messagingService');
const campaignService = require('../services/messagingCampaignService');
const templateService = require('../services/messagingTemplateService');
const analyticsService = require('../services/messagingAnalyticsService');
const automationService = require('../services/messagingAutomationService');
const { handleDbError } = require('../config/db');

function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/messaging/analytics', async (req, res) => {
    try {
        const result = await analyticsService.getAnalytics(req.tenantId, req.query || {});
        res.json(result);
    } catch (err) {
        handleDbError(res, err);
    }
});

router.get('/messaging/templates', async (req, res) => {
    try {
        const result = await templateService.listTemplates(req.tenantId, req.query || {});
        res.json(result);
    } catch (err) {
        handleDbError(res, err);
    }
});

router.post('/messaging/templates', async (req, res) => {
    try {
        const result = await templateService.createTemplate(req.tenantId, req.body || {}, req.user || {});
        res.status(201).json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.put('/messaging/templates/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const result = await templateService.updateTemplate(req.tenantId, id, req.body || {});
        res.json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.delete('/messaging/templates/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const result = await templateService.archiveTemplate(req.tenantId, id);
        res.json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.get('/messaging/campaigns/audience/options', async (_req, res) => {
    res.json(campaignService.listAudienceDefinitions());
});

router.get('/messaging/campaigns/audience/preview', async (req, res) => {
    try {
        const result = await campaignService.previewAudience(req.tenantId, req.query.audienceType);
        res.json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.get('/messaging/automations', async (req, res) => {
    try {
        const result = await automationService.listAutomations(req.tenantId);
        res.json(result);
    } catch (err) {
        handleDbError(res, err);
    }
});

router.post('/messaging/automations', async (req, res) => {
    try {
        const result = await automationService.createAutomation(req.tenantId, req.body || {}, req.user || {});
        res.status(201).json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.put('/messaging/automations/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const result = await automationService.updateAutomation(req.tenantId, id, req.body || {});
        res.json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.post('/messaging/automations/:id/run', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const result = await automationService.runAutomationNow(req.tenantId, id, req.user || {});
        res.json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.get('/messaging/automations/:id/runs', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const result = await automationService.listRuns(req.tenantId, id);
        res.json(result);
    } catch (err) {
        handleDbError(res, err);
    }
});

router.get('/messaging/campaigns', async (req, res) => {
    try {
        const result = await campaignService.listCampaigns(req.tenantId, req.query || {});
        res.json(result);
    } catch (err) {
        handleDbError(res, err);
    }
});

router.post('/messaging/campaigns', async (req, res) => {
    try {
        const result = await campaignService.createCampaign(req.tenantId, req.body || {}, req.user || {});
        res.status(201).json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.put('/messaging/campaigns/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const result = await campaignService.updateCampaign(req.tenantId, id, req.body || {});
        res.json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.post('/messaging/campaigns/:id/schedule', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const result = await campaignService.scheduleCampaign(req.tenantId, id, req.body?.scheduledAt, req.user || {});
        res.json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.post('/messaging/campaigns/:id/cancel', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const result = await campaignService.cancelCampaign(req.tenantId, id, req.user || {});
        res.json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.post('/messaging/campaigns/:id/send', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const result = await campaignService.sendCampaign(req.tenantId, id, req.user || {});
        res.json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.get('/messaging/campaigns/:id/recipients', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const result = await campaignService.listRecipients(req.tenantId, id);
        res.json(result);
    } catch (err) {
        handleDbError(res, err);
    }
});

router.get('/messaging/messages', async (req, res) => {
    try {
        const result = await messagingService.listMessages(req.tenantId, req.query || {});
        res.json(result);
    } catch (err) {
        handleDbError(res, err);
    }
});

router.get('/messaging/messages/:id/events', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const events = await messagingService.getMessageEvents(req.tenantId, id);
        res.json(events);
    } catch (err) {
        handleDbError(res, err);
    }
});

router.post('/messaging/messages/:id/resend', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID invalido.' });
    try {
        const result = await messagingService.resendMessage(req.tenantId, id, req.user || {});
        res.json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

router.post('/messaging/messages', async (req, res) => {
    try {
        const result = await messagingService.sendManualMessage(req.tenantId, req.body || {}, req.user || {});
        res.status(201).json(result);
    } catch (err) {
        const status = err.statusCode || 500;
        if (status !== 500) return res.status(status).json({ error: err.message });
        handleDbError(res, err);
    }
});

module.exports = router;
