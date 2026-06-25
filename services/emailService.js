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
        numFacturas = 0,
        citasHoy = 0,
        vacunasAplicadas = 0,
        gananciaEstimada = 0,
        totalEgresos = 0,
        topProductos = [],
        stockCritico = []
    } = reportData;

    await warmEmailConfig();
    const fmt = (n) => `L. ${Number(n).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const gananciaColor = gananciaEstimada >= 0 ? '#2e7d32' : '#c62828';

    const topProductosRows = topProductos.length > 0
        ? topProductos.map(p => `<tr><td>${p.producto ?? p.nombre ?? ''}</td><td style="text-align:right;font-weight:600;">${p.cantidad}</td></tr>`).join('')
        : '<tr><td colspan="2" style="color:#888;text-align:center;">Sin datos</td></tr>';
    const stockRows = stockCritico.length > 0
        ? stockCritico.map(s => `<tr><td>${s.producto}</td><td style="text-align:right;color:#c62828;font-weight:600;">${s.stock}</td></tr>`).join('')
        : '<tr><td colspan="2" style="color:#888;text-align:center;">Sin productos criticos</td></tr>';

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
                   <div class="label">Facturas Completadas</div>
                   <div class="highlight">${numFacturas}</div>
                 </div>
               </div>
               <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Citas del Dia</div>
                   <div class="highlight" style="color:#1565c0;">${citasHoy}</div>
                 </div>
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Vacunas Aplicadas</div>
                   <div class="highlight" style="color:#2e7d32;">${vacunasAplicadas}</div>
                 </div>
               </div>
               <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Total Egresos</div>
                   <div class="highlight" style="color:#c62828;">${fmt(totalEgresos)}</div>
                 </div>
                 <div class="card" style="flex:1;min-width:160px;">
                   <div class="label">Margen Estimado</div>
                   <div class="highlight" style="color:${gananciaColor};">${fmt(gananciaEstimada)}</div>
                 </div>
               </div>
               ${topProductos.length > 0 ? `
               <h3 style="font-size:15px;margin-bottom:10px;">Top Productos y Servicios</h3>
               <table class="data" style="margin-bottom:20px;">
                 <thead><tr><th>Producto</th><th style="text-align:right;">Cantidad</th></tr></thead>
                 <tbody>${topProductosRows}</tbody>
               </table>` : ''}
               <h3 style="font-size:15px;margin-bottom:10px;">Inventario Critico</h3>
               <table class="data">
                 <thead><tr><th>Item</th><th style="text-align:right;">Stock</th></tr></thead>
                 <tbody>${stockRows}</tbody>
               </table>
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
async function sendBackupConfirmationEmail(to, date, fileSize, objectKey) {
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
               ${objectKey ? `<div class="card">
                 <div class="label">Ubicacion en Cloudflare R2</div>
                 <div class="value" style="font-family:monospace;font-size:13px;">${objectKey}</div>
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

// ---------------------------------------------------------------------------
// g) Welcome email para nuevo cliente
// ---------------------------------------------------------------------------
async function sendWelcomeEmail(to, nombre, apellido) {
    await warmEmailConfig();
    try {
        const company = getCOMPANY();
        const html = wrapHtml(
            'Bienvenido',
            '#1565c0',
            `<div class="header">
               <h1>¡Bienvenido, ${nombre}!</h1>
               <p>${company}</p>
             </div>
             <div class="body">
               <p>Hola <strong>${nombre} ${apellido || ''}</strong>, gracias por registrarte con nosotros.</p>
               <p>A partir de ahora podrás disfrutar de todos nuestros servicios: ventas, reparaciones, garantías y más.</p>
               <div class="success-box">
                 Guarda este correo — te enviaremos aquí actualizaciones sobre tus reparaciones y recordatorios de garantía.
               </div>
               <p style="font-size:13px;color:#555;">Si tienes alguna pregunta, no dudes en contactarnos.<br><strong>${company}</strong></p>
             </div>`
        );
        await getResend().emails.send({ from: getFROM(), to, subject: `Bienvenido a ${company}`, html });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendWelcomeEmail error:', err.message);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// h) Veterinary appointment / preventive-care reminder
// ---------------------------------------------------------------------------
async function sendVeterinaryReminderEmail(to, reminder) {
    await warmEmailConfig();
    try {
        const company = getCOMPANY();
        const html = wrapHtml(
            reminder.asunto || 'Recordatorio veterinario',
            '#0f766e',
            `<div class="header" style="background:#0f766e;">
               <h1>${reminder.asunto || 'Recordatorio veterinario'}</h1>
               <p>${company}</p>
             </div>
             <div class="body">
               <p>Hola,</p>
               <p>${reminder.cuerpo || 'Le recordamos una actividad pendiente para el cuidado de su mascota.'}</p>
               <div class="card">
                 <div class="label">Fecha programada</div>
                 <div class="value">${new Date(reminder.fecha_programada).toLocaleString('es-HN')}</div>
               </div>
               <div class="success-box">
                 Si necesita reprogramar, responda este correo o comunÃ­quese con la clÃ­nica.
               </div>
               <p style="font-size:13px;color:#555;"><strong>${company}</strong></p>
             </div>`
        );
        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: reminder.asunto || `Recordatorio - ${company}`,
            html,
        });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendVeterinaryReminderEmail error:', err.message);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// h) Monthly report email - receives pre-built HTML content
// ---------------------------------------------------------------------------
async function sendMonthlyReportEmail(to, mes, htmlBody) {
    await warmEmailConfig();
    try {
        const html = wrapHtml(`Reporte Mensual ${mes}`, '#1b5e20', htmlBody);
        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `Reporte Mensual — ${mes}`,
            html
        });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendMonthlyReportEmail error:', err.message);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// i) Follow-up post-reparacion
// ---------------------------------------------------------------------------
async function sendFollowUpEmail(to, nombre, repairId, deviceDesc) {
    await warmEmailConfig();
    try {
        const company = getCOMPANY();
        const html = wrapHtml(
            'Tu experiencia con nosotros',
            '#4a148c',
            `<div class="header" style="background:#4a148c;">
               <h1>¿Cómo estuvo tu experiencia?</h1>
               <p>${company}</p>
             </div>
             <div class="body">
               <p>Hola <strong>${nombre}</strong>, hace una semana recogiste tu equipo reparado con nosotros.</p>
               <div class="card">
                 <div class="label">Orden de reparación</div>
                 <div class="value">${repairId}</div>
               </div>
               ${deviceDesc ? `<div class="card">
                 <div class="label">Equipo</div>
                 <div class="value">${deviceDesc}</div>
               </div>` : ''}
               <p style="font-size:14px;margin-top:16px;">Esperamos que todo esté funcionando perfectamente. Si tienes algún problema o inconveniente, no dudes en visitarnos — tu satisfacción es nuestra prioridad.</p>
               <div class="success-box">
                 Recuerda que ofrecemos garantía en nuestras reparaciones. Estamos aquí para ayudarte.
               </div>
               <p style="font-size:13px;color:#555;"><strong>${company}</strong></p>
             </div>`
        );
        await getResend().emails.send({ from: getFROM(), to, subject: `¿Cómo está tu equipo? — ${company}`, html });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendFollowUpEmail error:', err.message);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// i) Token upgrade request notification (to SaaS admin)
// ---------------------------------------------------------------------------
async function sendTokenUpgradeRequestEmail(to, { empresa, slug, plan, pct, tokensUsados, tokensLimite, paquete, motivo, periodo }) {
    await warmEmailConfig();
    try {
        const barFilled = Math.min(Math.round((pct || 0) / 5), 20);
        const barEmpty  = 20 - barFilled;
        const barColor  = pct >= 100 ? '#e53935' : pct >= 80 ? '#ffc107' : '#4f46e5';
        const html = wrapHtml('Solicitud de Ampliación de Cuota IA', '#4f46e5', `
            <div class="header">
              <h1>Solicitud de Ampliación de Cuota IA</h1>
              <p>Un cliente ha solicitado más tokens de IA desde el panel</p>
            </div>
            <div class="body">
              <div class="card">
                <div class="label">Empresa</div>
                <div class="value">${empresa}</div>
                <div class="label" style="margin-top:8px">Slug / ID</div>
                <div class="value" style="font-family:monospace;font-size:14px">${slug}</div>
              </div>
              <div style="display:flex;gap:12px;margin-bottom:18px">
                <div class="card" style="flex:1;margin-bottom:0">
                  <div class="label">Plan Actual</div>
                  <div class="value">${(plan || '').toUpperCase()}</div>
                </div>
                <div class="card" style="flex:1;margin-bottom:0">
                  <div class="label">Período</div>
                  <div class="value">${periodo}</div>
                </div>
              </div>
              <div class="card">
                <div class="label">Uso de Tokens este período</div>
                <div class="highlight">${pct}%</div>
                <div style="margin:8px 0 4px;font-size:13px;color:#555">${(tokensUsados||0).toLocaleString()} de ${(tokensLimite||0).toLocaleString()} tokens</div>
                <div style="background:#eee;border-radius:20px;height:10px;margin-top:6px">
                  <div style="background:${barColor};width:${Math.min(pct,100)}%;height:10px;border-radius:20px;transition:width .3s"></div>
                </div>
              </div>
              <div class="card" style="background:#eef2ff;border-left:4px solid #4f46e5">
                <div class="label">Paquete Solicitado</div>
                <div class="highlight" style="font-size:22px">${paquete}</div>
              </div>
              ${motivo ? `<div class="card"><div class="label">Motivo / Justificación</div><div style="font-size:14px;color:#333;margin-top:4px">${motivo}</div></div>` : ''}
              <div class="success-box">
                <strong>Acción requerida:</strong> Revisar la solicitud en el panel de SuperAdmin y procesar el ajuste de cuota o actualización de plan.
              </div>
            </div>
        `);
        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `[Solicitud IA] Ampliación de cuota – ${empresa} (Plan ${plan})`,
            html,
        });
    } catch (err) {
        console.error('[emailService] Error enviando solicitud upgrade IA:', err.message);
    }
}

module.exports = {
    sendRepairReadyEmail,
    sendWarrantyExpiryEmail,
    sendDailyReportEmail,
    sendWeeklyReportEmail,
    sendLowBalanceAlertEmail,
    sendBackupConfirmationEmail,
    sendWelcomeEmail,
    sendVeterinaryReminderEmail,
    sendMonthlyReportEmail,
    sendFollowUpEmail,
    sendTokenUpgradeRequestEmail,
};
