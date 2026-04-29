'use strict';

const { Resend } = require('resend');

// Lazily instantiated so the module can be loaded without RESEND_API_KEY set.
let _resend = null;
function getResend() {
    if (!_resend) {
        _resend = new Resend(process.env.RESEND_API_KEY);
    }
    return _resend;
}

const { getSystemConfig } = require('../config/systemConfig');

// Module-level cache so getFROM/getCOMPANY stay synchronous inside template literals.
// Call warmEmailConfig() at the start of every exported send function.
let _cfg = null;
async function warmEmailConfig() {
    _cfg = await getSystemConfig();
}
function getFROM() {
    return _cfg?.emailFrom || process.env.EMAIL_FROM || 'ERPSmartCloud <noreply@erpsmartcloud.com>';
}
function getCOMPANY() {
    const raw = _cfg?.emailFrom || '';
    return raw.match(/^(.+?)\s*</)?.[1] || process.env.COMPANY_NAME || 'ERPSmartCloud';
}

// ---------------------------------------------------------------------------
// Helper — shared HTML wrapper
// ---------------------------------------------------------------------------
function wrapHtml(title, accentColor, bodyContent) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#f4f4f5; font-family:'Segoe UI',Arial,sans-serif; color:#222; }
    .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.1); }
    .header { background:${accentColor}; padding:28px 32px; color:#fff; }
    .header h1 { margin:0; font-size:22px; font-weight:700; letter-spacing:.5px; }
    .header p  { margin:4px 0 0; font-size:13px; opacity:.85; }
    .body  { padding:28px 32px; }
    .card  { background:#f8f9fa; border-radius:8px; padding:18px 22px; margin-bottom:18px; }
    .label { font-size:11px; text-transform:uppercase; letter-spacing:.8px; color:#888; margin-bottom:4px; }
    .value { font-size:16px; font-weight:600; color:#111; }
    .highlight { font-size:28px; font-weight:700; color:${accentColor}; }
    .badge { display:inline-block; background:${accentColor}; color:#fff; border-radius:20px; padding:4px 14px; font-size:13px; font-weight:600; }
    .footer { background:#f0f0f0; padding:16px 32px; font-size:12px; color:#888; text-align:center; }
    table.data { width:100%; border-collapse:collapse; font-size:14px; }
    table.data th { background:#eee; padding:8px 10px; text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:.6px; color:#555; }
    table.data td { padding:8px 10px; border-bottom:1px solid #eee; }
    .alert-box { background:#fff3cd; border-left:4px solid #ffc107; padding:12px 16px; border-radius:4px; margin-bottom:16px; font-size:14px; }
    .danger-box { background:#fdecea; border-left:4px solid #e53935; padding:12px 16px; border-radius:4px; margin-bottom:16px; }
    .success-box { background:#e8f5e9; border-left:4px solid #43a047; padding:12px 16px; border-radius:4px; margin-bottom:16px; }
    @media (max-width:620px) {
      .wrapper { margin:0; border-radius:0; }
      .header, .body, .footer { padding:20px 18px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    ${bodyContent}
    <div class="footer">${getCOMPANY()} &mdash; Sistema ERP &bull; Honduras</div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// a) Repair ready notification
// ---------------------------------------------------------------------------
async function sendRepairReadyEmail(to, clientName, repairId, deviceDesc, techNotes) {
    await warmEmailConfig();
    try {
        const html = wrapHtml(
            'Equipo listo para retirar',
            '#2e7d32',
            `<div class="header">
               <h1>Tu equipo esta listo</h1>
               <p>${getCOMPANY()}</p>
             </div>
             <div class="body">
               <p>Hola <strong>${clientName}</strong>,</p>
               <p>Nos complace informarte que tu equipo ha sido reparado con exito y ya puede ser retirado en nuestra tienda.</p>
               <div class="card">
                 <div class="label">Orden de reparacion</div>
                 <div class="value">${repairId}</div>
               </div>
               <div class="card">
                 <div class="label">Equipo</div>
                 <div class="value">${deviceDesc}</div>
               </div>
               ${techNotes ? `<div class="card">
                 <div class="label">Notas del tecnico</div>
                 <div class="value" style="font-size:14px;font-weight:400;">${techNotes}</div>
               </div>` : ''}
               <div class="success-box">
                 Puedes retirar tu equipo durante nuestro horario de atencion.<br>
                 Recuerda traer tu comprobante o este correo al momento de retirar.
               </div>
               <p style="font-size:13px;color:#555;">Para cualquier consulta comunicate con nosotros al numero de la tienda.<br><strong>${getCOMPANY()}</strong></p>
             </div>`
        );

        await getResend().emails.send({ from: getFROM(), to, subject: 'Tu equipo esta listo para retirar', html });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendRepairReadyEmail error:', err.message);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// b) Warranty expiry warning
// ---------------------------------------------------------------------------
async function sendWarrantyExpiryEmail(to, clientName, warrantyId, deviceDesc, expiryDate, daysLeft) {
    await warmEmailConfig();
    const urgency = daysLeft <= 3 ? 'danger-box' : 'alert-box';
    try {
        const html = wrapHtml(
            'Garantia proxima a vencer',
            '#f57c00',
            `<div class="header" style="background:#f57c00;">
               <h1>Garantia proxima a vencer</h1>
               <p>${getCOMPANY()}</p>
             </div>
             <div class="body">
               <p>Hola <strong>${clientName}</strong>,</p>
               <p>Te recordamos que la garantia de tu equipo esta proxima a vencer.</p>
               <div class="${urgency}">
                 <strong>Quedan ${daysLeft} dia${daysLeft !== 1 ? 's' : ''}</strong> para que venza tu garantia.
               </div>
               <div class="card">
                 <div class="label">Numero de garantia</div>
                 <div class="value">${warrantyId}</div>
               </div>
               <div class="card">
                 <div class="label">Equipo</div>
                 <div class="value">${deviceDesc}</div>
               </div>
               <div class="card">
                 <div class="label">Fecha de vencimiento</div>
                 <div class="highlight">${expiryDate}</div>
               </div>
               <p style="font-size:14px;">Si presentas algun problema con tu equipo, acercate a nuestra tienda <strong>antes</strong> de la fecha de vencimiento para hacer valida tu garantia.</p>
               <p style="font-size:13px;color:#555;"><strong>${getCOMPANY()}</strong></p>
             </div>`
        );

        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `Tu garantia vence en ${daysLeft} dias`,
            html
        });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendWarrantyExpiryEmail error:', err.message);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// c) Daily report
// ---------------------------------------------------------------------------
async function sendDailyReportEmail(to, reportData) {
    const {
        fecha,
        totalVentas = 0,
        totalRecargas = 0,
        gananciaEstimada = 0,
        totalEgresos = 0,
        saldoTigoFinal = 0,
        saldoClaroFinal = 0,
        reparacionesCompletadas = 0,
        reparacionesPendientes = 0,
        topProductos = []
    } = reportData;

    await warmEmailConfig();
    const fmt = (n) => `L. ${Number(n).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const gananciaColor = gananciaEstimada >= 0 ? '#2e7d32' : '#c62828';

    const topProductosRows = topProductos.length > 0
        ? topProductos.map(p => `<tr><td>${p.nombre}</td><td style="text-align:right;font-weight:600;">${p.cantidad}</td></tr>`).join('')
        : '<tr><td colspan="2" style="color:#888;text-align:center;">Sin datos</td></tr>';

    try {
        const html = wrapHtml(
            `Reporte Diario ${fecha}`,
            '#1565c0',
            `<div class="header">
               <h1>Reporte Diario</h1>
               <p>${getCOMPANY()} &mdash; ${fecha}</p>
             </div>
             <div class="body">
               <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Total Ventas</div>
                   <div class="highlight">${fmt(totalVentas)}</div>
                 </div>
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Recargas</div>
                   <div class="highlight">${fmt(totalRecargas)}</div>
                 </div>
               </div>
               <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Total Egresos</div>
                   <div class="highlight" style="color:#c62828;">${fmt(totalEgresos)}</div>
                 </div>
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Ganancia Estimada</div>
                   <div class="highlight" style="color:${gananciaColor};">${fmt(gananciaEstimada)}</div>
                 </div>
               </div>
               <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Saldo TIGO Final</div>
                   <div class="value">${fmt(saldoTigoFinal)}</div>
                 </div>
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Saldo CLARO Final</div>
                   <div class="value">${fmt(saldoClaroFinal)}</div>
                 </div>
               </div>
               <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Reparaciones Completadas</div>
                   <div class="highlight" style="color:#2e7d32;">${reparacionesCompletadas}</div>
                 </div>
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Reparaciones Pendientes</div>
                   <div class="highlight" style="color:#f57c00;">${reparacionesPendientes}</div>
                 </div>
               </div>
               ${topProductos.length > 0 ? `
               <h3 style="font-size:15px;margin-bottom:10px;">Top Productos del Dia</h3>
               <table class="data">
                 <thead><tr><th>Producto</th><th style="text-align:right;">Cantidad</th></tr></thead>
                 <tbody>${topProductosRows}</tbody>
               </table>` : ''}
             </div>`
        );

        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `Reporte Diario - ${fecha}`,
            html
        });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendDailyReportEmail error:', err.message);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// d) Weekly report
// ---------------------------------------------------------------------------
async function sendWeeklyReportEmail(to, reportData) {
    await warmEmailConfig();
    const {
        semana,
        ventas = 0,
        ventasAntSemana = 0,
        gananciaSemana = 0,
        topClientes = [],
        stockCritico = []
    } = reportData;

    const fmt = (n) => `L. ${Number(n).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const diff = ventas - ventasAntSemana;
    const diffPct = ventasAntSemana > 0 ? ((diff / ventasAntSemana) * 100).toFixed(1) : '0.0';
    const diffColor = diff >= 0 ? '#2e7d32' : '#c62828';
    const diffSymbol = diff >= 0 ? '+' : '';

    const clientesRows = topClientes.length > 0
        ? topClientes.map(c => `<tr><td>${c.nombre}</td><td style="text-align:right;font-weight:600;">${fmt(c.total)}</td></tr>`).join('')
        : '<tr><td colspan="2" style="color:#888;text-align:center;">Sin datos</td></tr>';

    const stockRows = stockCritico.length > 0
        ? stockCritico.map(s => `<tr><td>${s.producto}</td><td style="text-align:right;color:#c62828;font-weight:600;">${s.stock}</td></tr>`).join('')
        : '<tr><td colspan="2" style="color:#888;text-align:center;">Sin productos criticos</td></tr>';

    try {
        const html = wrapHtml(
            `Resumen Semanal ${semana}`,
            '#6a1b9a',
            `<div class="header" style="background:#6a1b9a;">
               <h1>Resumen Semanal</h1>
               <p>${getCOMPANY()} &mdash; ${semana}</p>
             </div>
             <div class="body">
               <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Ventas Semana</div>
                   <div class="highlight" style="color:#6a1b9a;">${fmt(ventas)}</div>
                 </div>
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Ganancia Semanal</div>
                   <div class="highlight" style="color:#2e7d32;">${fmt(gananciaSemana)}</div>
                 </div>
               </div>
               <div class="card" style="margin-bottom:20px;">
                 <div class="label">Variacion vs semana anterior</div>
                 <div style="font-size:20px;font-weight:700;color:${diffColor};">${diffSymbol}${fmt(diff)} (${diffSymbol}${diffPct}%)</div>
                 <div style="font-size:12px;color:#888;margin-top:4px;">Semana anterior: ${fmt(ventasAntSemana)}</div>
               </div>
               <h3 style="font-size:15px;margin-bottom:10px;">Top Clientes</h3>
               <table class="data" style="margin-bottom:20px;">
                 <thead><tr><th>Cliente</th><th style="text-align:right;">Total</th></tr></thead>
                 <tbody>${clientesRows}</tbody>
               </table>
               <h3 style="font-size:15px;margin-bottom:10px;">Stock Critico</h3>
               <table class="data">
                 <thead><tr><th>Producto</th><th style="text-align:right;">Stock</th></tr></thead>
                 <tbody>${stockRows}</tbody>
               </table>
             </div>`
        );

        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `Resumen Semanal - ${semana}`,
            html
        });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendWeeklyReportEmail error:', err.message);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// e) Low balance alert
// ---------------------------------------------------------------------------
async function sendLowBalanceAlertEmail(to, red, saldoActual, umbral) {
    await warmEmailConfig();
    try {
        const fmt = (n) => `L. ${Number(n).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const html = wrapHtml(
            `Saldo ${red} critico`,
            '#b71c1c',
            `<div class="header" style="background:#b71c1c;">
               <h1>Alerta de Saldo Critico</h1>
               <p>${getCOMPANY()} &mdash; Red ${red}</p>
             </div>
             <div class="body">
               <div class="danger-box">
                 <strong>Atencion:</strong> El saldo de la red <strong>${red}</strong> ha caido por debajo del umbral configurado.
               </div>
               <div class="card">
                 <div class="label">Red</div>
                 <div class="value">${red}</div>
               </div>
               <div class="card">
                 <div class="label">Saldo Actual</div>
                 <div class="highlight" style="color:#b71c1c;">${fmt(saldoActual)}</div>
               </div>
               <div class="card">
                 <div class="label">Umbral Minimo</div>
                 <div class="value">${fmt(umbral)}</div>
               </div>
               <p style="font-size:14px;margin-top:16px;">
                 Se recomienda realizar una recarga de saldo a la brevedad posible para no interrumpir las ventas de recargas <strong>${red}</strong>.
               </p>
               <p style="font-size:13px;color:#555;"><strong>${getCOMPANY()}</strong></p>
             </div>`
        );

        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `Saldo ${red} critico - ${fmt(saldoActual)}`,
            html
        });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendLowBalanceAlertEmail error:', err.message);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// f) Backup confirmation
// ---------------------------------------------------------------------------
async function sendBackupConfirmationEmail(to, date, fileSize, driveLink) {
    await warmEmailConfig();
    try {
        const html = wrapHtml(
            `Backup exitoso ${date}`,
            '#00695c',
            `<div class="header" style="background:#00695c;">
               <h1>Backup Completado</h1>
               <p>${getCOMPANY()}</p>
             </div>
             <div class="body">
               <div class="success-box">
                 El backup de la base de datos se ha completado exitosamente.
               </div>
               <div class="card">
                 <div class="label">Fecha</div>
                 <div class="value">${date}</div>
               </div>
               <div class="card">
                 <div class="label">Tamano del archivo</div>
                 <div class="value">${fileSize}</div>
               </div>
               ${driveLink ? `<div class="card">
                 <div class="label">Enlace de descarga</div>
                 <div class="value"><a href="${driveLink}" style="color:#00695c;">Ver en Google Drive</a></div>
               </div>` : ''}
               <p style="font-size:13px;color:#555;margin-top:16px;"><strong>${getCOMPANY()}</strong></p>
             </div>`
        );

        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `Backup exitoso - ${date}`,
            html
        });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendBackupConfirmationEmail error:', err.message);
        throw err;
    }
}

module.exports = {
    sendRepairReadyEmail,
    sendWarrantyExpiryEmail,
    sendDailyReportEmail,
    sendWeeklyReportEmail,
    sendLowBalanceAlertEmail,
    sendBackupConfirmationEmail,
};
