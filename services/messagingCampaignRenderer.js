'use strict';

function interpolate(template, context) {
    return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
        const value = context[key];
        return value == null ? '' : String(value);
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderCampaignHtml(body, context) {
    const content = escapeHtml(interpolate(body, context)).replace(/\n/g, '<br>');
    return `
        <div style="margin:0;background:#f4f7fb;padding:28px 0;font-family:Inter,Segoe UI,Arial,sans-serif;color:#172033;">
            <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e6edf7;">
                <div style="background:linear-gradient(135deg,#4f46e5,#06b6d4);padding:26px 30px;color:#ffffff;">
                    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">${escapeHtml(context.empresa || 'Clinica veterinaria')}</div>
                    <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">Comunicacion para tutores</h1>
                </div>
                <div style="padding:30px;font-size:15px;line-height:1.7;">
                    <p style="margin:0 0 18px;">Hola ${escapeHtml(context.nombre || 'tutor')},</p>
                    <div>${content}</div>
                </div>
                <div style="padding:18px 30px;background:#f8fafc;color:#64748b;font-size:12px;">
                    Este mensaje fue enviado por ${escapeHtml(context.empresa || 'tu clinica veterinaria')}.
                </div>
            </div>
        </div>`;
}

module.exports = {
    interpolate,
    renderCampaignHtml,
};
