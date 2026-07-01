'use strict';

// Construcción de la identidad de un tutor/cliente.
// Extraído de routes/salesRoutes.js para poder testear las reglas de negocio:
//  - Si hay documento de identidad, se usa tal cual.
//  - Si el tipo es 'telefono' (o no hay documento), se deriva de un teléfono móvil
//    con un prefijo del tenant para evitar colisiones entre clínicas.
//  - El resultado se trunca a 20 caracteres (límite de la columna).

function normalizePhone(value) {
    return String(value || '').replace(/\D/g, '');
}

/**
 * @param {object} args
 * @param {string} [args.identidad]
 * @param {string} [args.telefono]
 * @param {string} [args.tipo_identificacion] - 'telefono' fuerza la derivación por teléfono.
 * @param {string} [args.tenantId]
 * @returns {string} identidad de hasta 20 caracteres.
 * @throws Error con code 'CLIENT_ID_REQUIRED' si no hay documento ni teléfono válido.
 */
function buildTutorIdentity({ identidad, telefono, tipo_identificacion, tenantId }) {
    const doc = String(identidad || '').trim();
    if (tipo_identificacion !== 'telefono' && doc) return doc;

    const phone = normalizePhone(telefono);
    if (!phone) {
        const err = new Error('Debe ingresar numero de identidad o telefono movil.');
        err.statusCode = 400;
        err.code = 'CLIENT_ID_REQUIRED';
        throw err;
    }

    const tenantPrefix = String(tenantId || '0000').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4) || '0000';
    return `TEL_${tenantPrefix}_${phone}`.slice(0, 20);
}

module.exports = { buildTutorIdentity, normalizePhone };
