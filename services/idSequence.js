'use strict';

// Cálculo del siguiente correlativo con formato PREFIX-0001.
// Extraído de config/db.js (generateNextId) para poder testear el parsing del
// número sin tocar la base de datos. La query, el advisory lock y la transacción
// siguen viviendo en db.js; aquí solo está la lógica pura de numeración.

/**
 * Extrae el número de un identificador con formato `${prefix}-<digitos>`.
 * @returns {number|null} el número, o null si el id no coincide con el formato.
 */
function parseNumeroCorrelativo(prefix, id) {
    if (typeof id !== 'string') return null;
    const parts = id.split(`${prefix}-`);
    if (parts.length === 2 && /^\d+$/.test(parts[1])) {
        return parseInt(parts[1], 10);
    }
    return null;
}

/**
 * Devuelve el siguiente correlativo a partir de una lista de ids existentes.
 * @param {string} prefix - p.ej. 'FACT'
 * @param {string[]} [ids=[]] - ids existentes (se ignoran los que no matchean).
 * @param {number} [padding=4] - dígitos con relleno de ceros.
 * @returns {string} p.ej. 'FACT-0008'
 */
function siguienteCorrelativo(prefix, ids = [], padding = 4) {
    let maxNum = 0;
    for (const id of ids) {
        const n = parseNumeroCorrelativo(prefix, id);
        if (n !== null && n > maxNum) maxNum = n;
    }
    return `${prefix}-${(maxNum + 1).toString().padStart(padding, '0')}`;
}

module.exports = { parseNumeroCorrelativo, siguienteCorrelativo };
