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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function fmtMoney(n) {
    return `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('es-HN', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'America/Tegucigalpa',
    });
}

// ---------------------------------------------------------------------------
// Helper — shared HTML wrapper
// ---------------------------------------------------------------------------
function wrapHtml(title, accentColor, bodyContent, opts = {}) {
    const company = escapeHtml(opts.company || getCOMPANY());
    const preheader = escapeHtml(opts.preheader || title);
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin:0; padding:0; background:#eef2f7; font-family:Inter,'Segoe UI',Arial,sans-serif; color:#172033; }
    .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; }
    .shell { width:100%; background:#eef2f7; padding:28px 12px; }
    .wrapper { max-width:680px; margin:0 auto; background:#ffffff; border-radius:24px; overflow:hidden; box-shadow:0 24px 60px rgba(15,23,42,.12); border:1px solid #e2e8f0; }
    .brandbar, .header { background:linear-gradient(135deg,${accentColor},#111827); padding:30px 34px; color:#fff; }
    .brandpill { display:inline-block; padding:7px 12px; border-radius:999px; background:rgba(255,255,255,.16); font-size:12px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; }
    .brandbar h1, .header h1 { margin:14px 0 4px; font-size:27px; line-height:1.18; font-weight:850; letter-spacing:-.02em; }
    .brandbar p, .header p  { margin:0; font-size:14px; opacity:.88; }
    .body  { padding:30px 34px; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .card  { background:#f8fafc; border:1px solid #e2e8f0; border-radius:18px; padding:18px 20px; margin-bottom:16px; }
    .metric { background:#fff; border:1px solid #e2e8f0; border-radius:18px; padding:18px; }
    .label { font-size:11px; text-transform:uppercase; letter-spacing:.09em; color:#64748b; margin-bottom:6px; font-weight:800; }
    .value { font-size:16px; font-weight:750; color:#0f172a; }
    .highlight { font-size:28px; font-weight:900; color:${accentColor}; letter-spacing:-.03em; }
    .muted { color:#64748b; font-size:13px; line-height:1.55; }
    .badge { display:inline-block; background:${accentColor}; color:#fff; border-radius:999px; padding:6px 13px; font-size:12px; font-weight:800; }
    .footer { background:#f8fafc; padding:20px 34px; font-size:12px; color:#64748b; text-align:center; border-top:1px solid #e2e8f0; }
    table.data { width:100%; border-collapse:separate; border-spacing:0; font-size:14px; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden; }
    table.data th { background:#f8fafc; padding:11px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:#64748b; }
    table.data td { padding:11px 12px; border-top:1px solid #e2e8f0; color:#172033; }
    .alert-box { background:#fffbeb; border:1px solid #fde68a; border-left:5px solid #f59e0b; padding:14px 16px; border-radius:16px; margin-bottom:16px; font-size:14px; }
    .danger-box { background:#fef2f2; border:1px solid #fecaca; border-left:5px solid #ef4444; padding:14px 16px; border-radius:16px; margin-bottom:16px; }
    .success-box { background:#ecfdf5; border:1px solid #bbf7d0; border-left:5px solid #10b981; padding:14px 16px; border-radius:16px; margin-bottom:16px; }
    .button { display:inline-block; background:${accentColor}; color:#fff!important; text-decoration:none; padding:13px 18px; border-radius:14px; font-weight:800; }
    @media (max-width:620px) {
      .shell { padding:0; }
      .wrapper { border-radius:0; }
      .brandbar, .header, .body, .footer { padding:22px 18px; }
      .grid { display:block; }
    }
  </style>
</head>
<body>
  <div class="preheader">${preheader}</div>
  <div class="shell">
  <div class="wrapper">
    ${bodyContent}
    <div class="footer">${company} &mdash; Plataforma veterinaria &bull; Correos enviados por Resend</div>
  </div>
  </div>
</body>
</html>`;
}

function hero(title, subtitle, accentColor) {
    return `<div class="brandbar" style="background:linear-gradient(135deg,${accentColor},#111827);">
        <span class="brandpill">${escapeHtml(getCOMPANY())}</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle || '')}</p>
    </div>`;
}

function metricCard(label, value, color = '#0f766e', sub = '') {
    return `<div class="metric">
        <div class="label">${escapeHtml(label)}</div>
        <div class="highlight" style="color:${color};">${escapeHtml(value)}</div>
        ${sub ? `<div class="muted">${escapeHtml(sub)}</div>` : ''}
    </div>`;
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
        noShows = 0,
        vacunasAplicadas = 0,
        gananciaEstimada = 0,
        totalEgresos = 0,
        topProductos = [],
        stockCritico = []
    } = reportData;

    await warmEmailConfig();
    const gananciaColor = gananciaEstimada >= 0 ? '#2e7d32' : '#c62828';

    const topProductosRows = topProductos.length > 0
        ? topProductos.map(p => `<tr><td>${escapeHtml(p.producto ?? p.nombre ?? '')}</td><td style="text-align:right;font-weight:800;">${escapeHtml(p.cantidad ?? 0)}</td></tr>`).join('')
        : '<tr><td colspan="2" style="color:#64748b;text-align:center;">Sin datos</td></tr>';
    const stockRows = stockCritico.length > 0
        ? stockCritico.map(s => `<tr><td>${escapeHtml(s.producto)}</td><td style="text-align:right;color:#dc2626;font-weight:800;">${escapeHtml(s.stock ?? 0)}</td></tr>`).join('')
        : '<tr><td colspan="2" style="color:#64748b;text-align:center;">Sin inventario critico</td></tr>';

    try {
        const html = wrapHtml(
            `Reporte diario - ${fecha}`,
            '#1565c0',
            `${hero('Reporte diario operativo', `${getCOMPANY()} - ${fecha}`, '#1565c0')}
             <div class="body">
               <div class="grid" style="margin-bottom:16px;">
                 ${metricCard('Ventas del dia', fmtMoney(totalVentas), '#1565c0', `${numFacturas} facturas completadas`)}
                 ${metricCard('Citas del dia', String(citasHoy), '#4f46e5', `${noShows} no-shows`)}
                 ${metricCard('Vacunas aplicadas', String(vacunasAplicadas), '#0f766e', 'Medicina preventiva')}
                 ${metricCard('Margen estimado', fmtMoney(gananciaEstimada), gananciaColor, `Egresos: ${fmtMoney(totalEgresos)}`)}
               </div>
               <h3 style="font-size:16px;margin:22px 0 10px;color:#0f172a;">Top productos y servicios</h3>
               <table class="data" style="margin-bottom:20px;">
                 <thead><tr><th>Producto</th><th style="text-align:right;">Cantidad</th></tr></thead>
                 <tbody>${topProductosRows}</tbody>
               </table>
               <h3 style="font-size:16px;margin:22px 0 10px;color:#0f172a;">Inventario critico</h3>
               <table class="data">
                 <thead><tr><th>Item</th><th style="text-align:right;">Stock</th></tr></thead>
                 <tbody>${stockRows}</tbody>
               </table>
               <div class="success-box" style="margin-top:18px;">
                 Acciones sugeridas: confirmar citas pendientes, revisar inventario critico y dar seguimiento a vacunas proximas.
               </div>
             </div>`
        );

        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `Reporte diario operativo - ${fecha}`,
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

    const diff = ventas - ventasAntSemana;
    const diffPct = ventasAntSemana > 0 ? ((diff / ventasAntSemana) * 100).toFixed(1) : '0.0';
    const diffColor = diff >= 0 ? '#2e7d32' : '#c62828';
    const diffSymbol = diff >= 0 ? '+' : '';

    const clientesRows = topClientes.length > 0
        ? topClientes.map(c => `<tr><td>${escapeHtml(c.nombre)}</td><td style="text-align:right;font-weight:800;">${fmtMoney(c.total)}</td></tr>`).join('')
        : '<tr><td colspan="2" style="color:#64748b;text-align:center;">Sin datos</td></tr>';

    const stockRows = stockCritico.length > 0
        ? stockCritico.map(s => `<tr><td>${escapeHtml(s.producto)}</td><td style="text-align:right;color:#dc2626;font-weight:800;">${escapeHtml(s.stock ?? 0)}</td></tr>`).join('')
        : '<tr><td colspan="2" style="color:#64748b;text-align:center;">Sin inventario critico</td></tr>';

    try {
        const html = wrapHtml(
            `Resumen semanal - ${semana}`,
            '#6a1b9a',
            `${hero('Resumen semanal gerencial', `${getCOMPANY()} - ${semana}`, '#6a1b9a')}
             <div class="body">
               <div class="grid" style="margin-bottom:16px;">
                 ${metricCard('Ventas de la semana', fmtMoney(ventas), '#6a1b9a', 'Ingresos completados')}
                 ${metricCard('Ganancia estimada', fmtMoney(gananciaSemana), '#0f766e', 'Segun datos disponibles')}
               </div>
               <div class="card" style="margin-bottom:20px;">
                 <div class="label">Variacion vs semana anterior</div>
                 <div style="font-size:22px;font-weight:900;color:${diffColor};">${diffSymbol}${fmtMoney(diff)} (${diffSymbol}${diffPct}%)</div>
                 <div class="muted">Semana anterior: ${fmtMoney(ventasAntSemana)}</div>
               </div>
               <h3 style="font-size:16px;margin:22px 0 10px;color:#0f172a;">Top tutores por consumo</h3>
               <table class="data" style="margin-bottom:20px;">
                 <thead><tr><th>Tutor</th><th style="text-align:right;">Total</th></tr></thead>
                 <tbody>${clientesRows}</tbody>
               </table>
               <h3 style="font-size:16px;margin:22px 0 10px;color:#0f172a;">Inventario critico</h3>
               <table class="data">
                 <thead><tr><th>Item</th><th style="text-align:right;">Stock</th></tr></thead>
                 <tbody>${stockRows}</tbody>
               </table>
               <div class="alert-box" style="margin-top:18px;">
                 Revise no-shows, reabastecimiento de vacunas/medicamentos y oportunidades de planes preventivos para la siguiente semana.
               </div>
             </div>`
        );

        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `Resumen semanal gerencial - ${semana}`,
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

async function sendVeterinaryReminderEmailV2(to, reminder) {
    await warmEmailConfig();
    try {
        const company = getCOMPANY();
        const title = reminder.asunto || 'Recordatorio veterinario';
        const scheduled = fmtDateTime(reminder.fecha_programada);
        const isVaccine = String(reminder.tipo || '').includes('vacuna');
        const accent = isVaccine ? '#7c3aed' : '#0f766e';
        const html = wrapHtml(
            title,
            accent,
            `${hero(title, isVaccine ? 'Medicina preventiva y seguimiento' : 'Agenda medica programada', accent)}
             <div class="body">
               <p>Hola,</p>
               <p style="font-size:15px;line-height:1.65;color:#334155;">${escapeHtml(reminder.cuerpo || 'Le recordamos una actividad pendiente para el cuidado de su mascota.')}</p>
               <div class="grid" style="margin:20px 0;">
                 ${metricCard('Fecha programada', scheduled || 'Pendiente', accent, 'Hora local Honduras')}
                 ${metricCard('Tipo de aviso', isVaccine ? 'Vacuna / refuerzo' : 'Cita medica', '#0f172a', company)}
               </div>
               <div class="success-box">
                 Si necesita reprogramar, responda este correo o comuniquese con la clinica. Llegue 10 minutos antes para actualizar los datos de su mascota.
               </div>
               <p class="muted"><strong>${escapeHtml(company)}</strong> cuida la agenda clinica para reducir esperas y mejorar el seguimiento.</p>
             </div>`,
            { preheader: `${title} - ${scheduled}` }
        );
        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: reminder.asunto || `Recordatorio - ${company}`,
            html,
        });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendVeterinaryReminderEmailV2 error:', err.message);
        throw err;
    }
}

async function sendAppointmentConfirmationEmail(to, appointment) {
    await warmEmailConfig();
    try {
        const company = getCOMPANY();
        const patient = appointment.paciente || appointment.pacienteNombre || 'su mascota';
        const tutor = appointment.tutor || appointment.tutorNombre || '';
        const type = appointment.tipoCitaNombre || appointment.tipo || 'Cita veterinaria';
        const vet = appointment.veterinarioNombre || appointment.veterinario || 'Equipo clinico';
        const when = fmtDateTime(appointment.fecha_inicio);
        const html = wrapHtml(
            `Cita programada para ${patient}`,
            '#2563eb',
            `${hero('Cita programada', `Confirmacion de agenda para ${patient}`, '#2563eb')}
             <div class="body">
               <p style="font-size:15px;color:#334155;line-height:1.65;">Hola ${escapeHtml(tutor || '')}, hemos programado la cita de <strong>${escapeHtml(patient)}</strong>.</p>
               <div class="grid" style="margin:20px 0;">
                 ${metricCard('Fecha y hora', when, '#2563eb', 'Hora local Honduras')}
                 ${metricCard('Tipo de cita', type, '#0f766e', vet)}
               </div>
               <div class="card">
                 <div class="label">Motivo</div>
                 <div class="value" style="font-size:14px;font-weight:500;">${escapeHtml(appointment.motivo || 'Consulta programada')}</div>
               </div>
               <div class="alert-box">
                 Recomendacion: traiga carnet de vacunas, examenes previos o medicamentos actuales si aplica.
               </div>
               <p class="muted">Recibira recordatorios automaticos antes de la cita. Para reprogramar, responda este correo.</p>
             </div>`,
            { preheader: `Cita de ${patient} confirmada para ${when}` }
        );
        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `Cita programada para ${patient} - ${company}`,
            html,
        });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendAppointmentConfirmationEmail error:', err.message);
        throw err;
    }
}

async function sendAppointmentAgendaEmail(to, { fecha, citas = [], resumen = {} }) {
    await warmEmailConfig();
    try {
        const company = getCOMPANY();
        const rows = citas.length ? citas.map(c => `
            <tr>
              <td><strong>${escapeHtml(c.hora || '')}</strong></td>
              <td>${escapeHtml(c.paciente || 'Sin paciente')}<br><span class="muted">${escapeHtml(c.tutor || '')}</span></td>
              <td>${escapeHtml(c.tipo || 'Cita')}</td>
              <td>${escapeHtml(c.veterinario || 'Sin asignar')}</td>
              <td><span class="badge" style="background:${c.estado === 'Confirmada' ? '#10b981' : '#2563eb'};">${escapeHtml(c.estado || 'Programada')}</span></td>
            </tr>
        `).join('') : '<tr><td colspan="5" style="text-align:center;color:#64748b;">No hay citas programadas.</td></tr>';
        const html = wrapHtml(
            `Agenda de citas - ${fecha}`,
            '#4f46e5',
            `${hero('Agenda de citas', `${company} - ${fecha}`, '#4f46e5')}
             <div class="body">
               <div class="grid" style="margin-bottom:20px;">
                 ${metricCard('Citas programadas', String(resumen.total || citas.length), '#4f46e5', 'Total del dia')}
                 ${metricCard('Confirmadas', String(resumen.confirmadas || 0), '#10b981', 'Llegadas esperadas')}
               </div>
               <table class="data">
                 <thead><tr><th>Hora</th><th>Paciente / Tutor</th><th>Tipo</th><th>Veterinario</th><th>Estado</th></tr></thead>
                 <tbody>${rows}</tbody>
               </table>
               <div class="alert-box" style="margin-top:18px;">
                 Preparar expedientes, vacunas pendientes y disponibilidad de salas antes del inicio de jornada.
               </div>
             </div>`
        );
        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `Agenda de citas - ${fecha}`,
            html,
        });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendAppointmentAgendaEmail error:', err.message);
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

async function sendMonthlyManagementReportEmail(to, reportData) {
    await warmEmailConfig();
    try {
        const {
            mes,
            ventas = 0,
            isv = 0,
            numFacturas = 0,
            citas = 0,
            vacunas = 0,
            noShows = 0,
            topItems = [],
            stockCritico = [],
        } = reportData;
        const topRows = topItems.length ? topItems.map(i => `
            <tr>
              <td>${escapeHtml(i.producto || i.nombre || 'Item')}</td>
              <td style="text-align:right;">${escapeHtml(i.qty ?? i.cantidad ?? 0)}</td>
              <td style="text-align:right;font-weight:800;">${fmtMoney(i.total || 0)}</td>
            </tr>
        `).join('') : '<tr><td colspan="3" style="text-align:center;color:#64748b;">Sin datos del periodo.</td></tr>';
        const stockRows = stockCritico.length ? stockCritico.map(i => `
            <tr>
              <td>${escapeHtml(i.producto || i.nombre || 'Item')}</td>
              <td style="text-align:right;color:#dc2626;font-weight:800;">${escapeHtml(i.stock ?? 0)}</td>
            </tr>
        `).join('') : '<tr><td colspan="2" style="text-align:center;color:#64748b;">Sin inventario critico.</td></tr>';
        const html = wrapHtml(
            `Reporte mensual - ${mes}`,
            '#0f766e',
            `${hero('Reporte mensual gerencial', mes, '#0f766e')}
             <div class="body">
               <div class="grid" style="margin-bottom:16px;">
                 ${metricCard('Ventas del mes', fmtMoney(ventas), '#0f766e', `${numFacturas} facturas`)}
                 ${metricCard('ISV recaudado', fmtMoney(isv), '#4f46e5', 'Impuesto sobre ventas')}
                 ${metricCard('Citas atendidas/programadas', String(citas), '#2563eb', 'Actividad clinica')}
                 ${metricCard('Vacunas aplicadas', String(vacunas), '#7c3aed', `${noShows} no-shows`)}
               </div>
               <h3 style="font-size:16px;margin:22px 0 10px;color:#0f172a;">Top productos y servicios</h3>
               <table class="data">
                 <thead><tr><th>Item</th><th style="text-align:right;">Cant.</th><th style="text-align:right;">Total</th></tr></thead>
                 <tbody>${topRows}</tbody>
               </table>
               <h3 style="font-size:16px;margin:22px 0 10px;color:#0f172a;">Inventario critico</h3>
               <table class="data">
                 <thead><tr><th>Item</th><th style="text-align:right;">Stock</th></tr></thead>
                 <tbody>${stockRows}</tbody>
               </table>
               <div class="success-box" style="margin-top:18px;">
                 Recomendacion: revise agenda preventiva, inventario de vacunas y seguimiento de tutores con citas no asistidas.
               </div>
             </div>`
        );
        await getResend().emails.send({
            from: getFROM(),
            to,
            subject: `Reporte mensual gerencial - ${mes}`,
            html,
        });
        return { success: true };
    } catch (err) {
        console.error('[emailService] sendMonthlyManagementReportEmail error:', err.message);
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
    sendVeterinaryReminderEmail: sendVeterinaryReminderEmailV2,
    sendAppointmentConfirmationEmail,
    sendAppointmentAgendaEmail,
    sendMonthlyReportEmail,
    sendMonthlyManagementReportEmail,
    sendFollowUpEmail,
    sendTokenUpgradeRequestEmail,
};
